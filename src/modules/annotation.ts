// Module: annotation comment text + URL detection + icon
// rendering + annotation model access + related-item nav
// + the right-click "Open Related Item" sub-menu wiring.
//
// Implemented as a class purely to avoid the comma-between-
// methods syntax requirement of object literals — the methods
// are mixed onto WeaveroPlugin.prototype via defineProperties
// from src/index.ts. The class is never instantiated.

// Module-level constants exposed to the host class via getters
// on the mixin prototype (class field initializers don't survive
// the prototype-mixin lift — see filter.ts for the same pattern).
const _MD_REGEX_DATA =
    /(\*\*[\s\S]+?\*\*|\*(?!\s)[^*\n]+?(?<!\s)\*|~~[\s\S]+?~~|`[^`\n]+?`|\[[^\]\n]+?\]\([^)\s]+\))/;

// Methods reach across mixin boundaries via `this.foo()` (e.g.
// annotation methods call `this._getInlineLinks()` from prefs
// getters on core, `this.URL_REGEX` from url.ts). The type of
// `this` inside this mixin class only sees this file's methods,
// so cross-module references error without an index signature.
// `[k: string]: any` matches the real runtime semantics (the
// mixed prototype is the union of all module declarations).
class _AnnotationMixin {
    [k: string]: any;
    normalize(t) { return t ? String(t).replace(this.INVISIBLE_RE, "") : ""; }
    hasURI(t)    { return !!t && this.URL_REGEX.test(this.normalize(t)); }

    /** Detect Mozilla "dead wrappers" — JS handles to XPCOM objects whose
     *  underlying native object has been destroyed. Common when our
     *  setTimeout / MutationObserver callbacks capture references to
     *  reader windows that the user then closes; accessing any property
     *  on a dead wrapper throws "TypeError: can't access dead object".
     *
     *  Use as a guard at the entry of any callback that holds onto an
     *  element/window/document captured from a closure that may outlive
     *  its target. Returns false if the platform API isn't available
     *  (better to attempt access than to abort everything).
     *
     *  Reference: https://firefox-source-docs.mozilla.org/js/index.html#dead-wrappers */
    _isDead(obj) {
        try {
            const cu: any = ChromeUtils;
            if (typeof cu !== "undefined" && cu.isDeadWrapper) {
                return cu.isDeadWrapper(obj);
            }
            if (typeof Components !== "undefined"
                && Components.utils && Components.utils.isDeadWrapper) {
                return Components.utils.isDeadWrapper(obj);
            }
        } catch(e) {}
        return false;
    }
    /** Markdown marks that the popup renders. Cheap regex; runs only on
     * comments that already failed the hasURI fast path.
     * (Class field syntax wouldn't survive the prototype-mixin lift —
     * field initializers don't appear on the prototype's descriptor
     * set. Getter binds to a module-level constant, same identity
     * every access.) */
    get MD_REGEX() { return _MD_REGEX_DATA; }
    /** Layout / rendering predicate: does this comment have any URL or
     *  markdown content that the popup or inline renderer would format?
     *  NOT a mode-aware icon-show predicate — for that, see _iconWantedFor.
     *
     *  Used to gate the items-tree CSS flex layout (the data-has-rich
     *  attribute) and to short-circuit the right-pane render path when a
     *  comment is plain text. Stays a static union of URL ∨ markdown
     *  because the layout/render setup is needed in both display modes.
     */
    _commentHasIconableContent(t) {
        if (!t) return false;
        const n = this.normalize(t);
        if (this.URL_REGEX.test(n)) return true;
        return this._anyMarkdownEnabled() && this.MD_REGEX.test(n);
    }

    /** Mode-aware icon-show predicate: should we attach a chain icon to a
     *  comment with this text? Used by every surface that decides whether
     *  to render the icon (right pane, reader sidebar, in-PDF popup,
     *  canvas badges, text annotation buttons, items-tree overflow).
     *
     *  Inline mode (inlineLinks=true): byte-equivalent to legacy behaviour.
     *    Only URL-bearing comments get the icon — markdown is rendered
     *    in place so doesn't need a separate indicator.
     *
     *  Icon & Popup mode (inlineLinks=false): the popup is the only access
     *    path to formatted content. Each content type has its own sub-toggle
     *    (enableIconUrls / enableIconMarkdown / enableIconAppLinks); the
     *    icon shows when ANY enabled type is present in the comment.
     *    URLs are classified per-match via matchAll: a comment containing
     *    BOTH http://… and mailto:… triggers the icon if EITHER toggle is on.
     *
     *  Master gates still apply: enableAppLinks=false strips app schemes
     *  from URL_REGEX entirely, so enableIconAppLinks becomes a no-op when
     *  the master is off. _anyMarkdownEnabled() must also be true for the
     *  markdown branch to fire. */
    _iconWantedFor(t) {
        if (!t) return false;
        const n = this.normalize(t);

        if (this._getInlineLinks()) {
            // Inline mode: byte-equivalent to the old _shouldShowIcon.
            return this.URL_REGEX.test(n);
        }

        // Icon & Popup mode: classify URL matches and gate per sub-toggle.
        if (this.URL_REGEX.test(n)) {
            // Mixed-content comments (e.g. http://… + mailto:…) should
            // pass if EITHER sub-toggle is on. Iterate matches via
            // matchAll to classify each one — a whole-string starts-with
            // check would misclassify embedded URLs.
            const re = new RegExp(this.URL_REGEX.source, "gi");
            let hasHttpOrZotero = false, hasAppLink = false;
            for (const m of n.matchAll(re)) {
                if (/^(https?|zotero):/i.test(m[0])) hasHttpOrZotero = true;
                else hasAppLink = true;
                if (hasHttpOrZotero && hasAppLink) break;
            }
            if (hasHttpOrZotero && this._getEnableIconUrls()) return true;
            if (hasAppLink && this._getEnableIconAppLinks()) return true;
        }

        if (this._getEnableIconMarkdown()
            && this._anyMarkdownEnabled()
            && this.MD_REGEX.test(n)) {
            return true;
        }

        return false;
    }

    /** Returns true if a popup-access icon (the 🔗 / M button) on a comment
     *  would add value beyond what's already rendered inline on the surface.
     *  Used by the right pane, reader sidebar, and reader popup so that all
     *  three surfaces hide the icon when its only purpose has been satisfied
     *  by inline rendering. The items list uses CSS-based visibility driven
     *  by :root classes (wv-icons-only, wv-md-disabled, wv-show-tree-icon)
     *  which encodes the same logic.
     *
     *  Returns true when:
     *    - icons-only mode (Mode 2): inline rendering is off; icon is the
     *      only access path to view comment formatting.
     *    - markdown is in the comment but inline comment-markdown rendering
     *      is disabled: the popup is the only place markdown shows formatted.
     *  Returns false when:
     *    - inline mode + markdown-render enabled: the inline view shows
     *      everything; the icon would clutter without adding value (overflow
     *      is the caller's concern via direct scrollHeight checks).
     *    - URL-only inline mode: URLs are clickable inline. */
    _iconAddsValueBeyondInline(t) {
        if (!this._getInlineLinks()) return true; // Mode 2 — only access path.
        const n = this.normalize(t || "");
        // Markdown present but inline-md sub-toggle off: popup is the only
        // path to the formatted view.
        if (!this._getEnableCommentMarkdown()
            && this._anyMarkdownEnabled()
            && this.MD_REGEX.test(n)) {
            return true;
        }
        // URL present but inline-URLs sub-toggle off: popup is the only
        // path to a clickable URL.
        if (!this._getEnableInlineUrls() && this.URL_REGEX.test(n)) {
            return true;
        }
        return false;
    }

    /** Build the inline Lucide-style chain SVG used as the link glyph.
     *  Created via createElementNS so it works in XHTML chrome documents
     *  and in the PDF.js inner iframe alike. The icon inherits its color
     *  from `currentColor`, so it picks up the surrounding text color
     *  (or the amber-disc override for type-3 icons). Sized to 1em so it
     *  scales with the icon container's font-size. */
    /** Build the URL/link icon — Weavero's needle logo, drawn
     *  programmatically here to match the source SVG that the
     *  rasterizer uses for the manifest / pref-pane PNGs.
     *  Used as the visual marker on annotation comments and other
     *  URL-bearing surfaces.
     *
     *  Theme-aware: the badge picks the LIGHT or DARK colour set
     *  based on `_detectUIDark()` at render time. Light = deep
     *  blue needle / black chain + thread; dark = lighter blue
     *  needle / white chain + thread.
     *
     *  The source SVG uses two `<clipPath>` overlays for a "woven"
     *  effect at large sizes; we skip them here because the
     *  clip-path IDs would collide when multiple badges render on
     *  the same page, and at the 16-px size this icon is most
     *  often used the woven detail isn't legible anyway. */
    _makeLinkSvg(doc) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = doc.createElementNS(NS, "svg");
        svg.setAttribute("class", "wv-link-svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");

        // Theme detection per-doc, NOT per-UI:
        //  - Inner reader iframe (in-page badges) carries
        //    `wv-reader-dark` on its documentElement when the
        //    rendered PDF page is dark (`_applyDynamicReaderTheme`
        //    sets it from the page background luma). That's the
        //    right signal here — the badge sits on the page, not
        //    on the chrome.
        //  - Chrome doc + outer reader iframe carry `wv-ui-dark`
        //    when Zotero's UI is dark. That's the right signal
        //    for surfaces that follow the UI theme (items tree,
        //    right pane, reader sidebar).
        //  - If neither class is set yet (rare race during init),
        //    default to the light variant.
        const isDark = (() => {
            try {
                const root = doc && doc.documentElement;
                const cl = root && root.classList;
                if (cl) {
                    if (cl.contains("wv-reader-dark")) return true;
                    if (cl.contains("wv-ui-dark")) return true;
                }
            } catch (e) {}
            return false;
        })();
        const bodyColor  = isDark ? "#8ab4f8" : "#253c97";
        const chainColor = isDark ? "#ffffff" : "#000000";
        const threadColor = chainColor;

        const path = (attrs) => {
            const p = doc.createElementNS(NS, "path");
            for (const [k, v] of Object.entries(attrs)) {
                p.setAttribute(k, v);
            }
            return p;
        };
        const ellipse = (attrs) => {
            const e = doc.createElementNS(NS, "ellipse");
            for (const [k, v] of Object.entries(attrs)) {
                e.setAttribute(k, v);
            }
            return e;
        };

        // Eye outline (blue stroke ellipse).
        svg.appendChild(ellipse({
            cx: "18.52", cy: "18.52", rx: "1.5", ry: "2.78",
            transform: "translate(-7.67 18.52) rotate(-45)",
            fill: "none", stroke: bodyColor,
            "stroke-miterlimit": "10",
        }));
        // Needle body (blue fill).
        svg.appendChild(path({
            d: "M0,0c4.92,3.42,8.62,8.25,12.97,12.33.79.71,2.39"
                + ",2.54,3.42,2.9.47.24.93.48,1.49.61l-2.05,2.05"
                + "c-.31-1.03-.77-1.99-1.44-2.78,0,0-2.08-2.14"
                + "-2.08-2.14C8.25,8.62,3.42,4.92,0,0h0Z",
            fill: bodyColor,
        }));
        // Thread waves at the bottom (stroke only, default 1px).
        svg.appendChild(path({
            d: "M12.63,18.34c1.04,3.94,1.89,5.05,2.54,5.03"
                + ",1.39-.03,1.95-5.04,3.34-5.04,1.4,0,2.04,5.08"
                + ",3.15,5.04.46-.02,1.08-.91,1.71-5.04",
            fill: "none", stroke: threadColor,
            "stroke-linecap": "round",
            "stroke-miterlimit": "10",
        }));
        // Chain link 1 (top-right curve).
        svg.appendChild(path({
            d: "M10,12.76c1.65,2.21,4.79,2.66,7,1.01.19-.14.37"
                + "-.3.54-.47l3-3c1.92-1.99,1.86-5.15-.12-7.07"
                + "-1.94-1.87-5.01-1.87-6.95,0l-1.72,1.71",
            fill: "none", stroke: chainColor,
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
        }));
        // Chain link 2 (bottom-left curve).
        svg.appendChild(path({
            d: "M14,10.76c-1.65-2.21-4.79-2.66-7-1.01-.19.14"
                + "-.37.3-.54.47l-3,3c-1.92,1.99-1.86,5.15.12,7.07"
                + ",1.94,1.87,5.01,1.87,6.95,0l1.71-1.71",
            fill: "none", stroke: chainColor,
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
        }));
        return svg;
    }

    /** Build the inline relations SVG — same path as upstream Zotero's
     *  `chrome://zotero/skin/16/universal/related.svg`, but with
     *  `fill="currentColor"` so we can colour it from CSS instead of
     *  needing the chrome-only `context-fill` keyword. Used in the
     *  annotation-header relations icon button (and matches the icon
     *  Zotero shows in the item pane's Related section). */
    _makeRelationsSvg(doc) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = doc.createElementNS(NS, "svg");
        svg.setAttribute("class", "wv-relations-svg");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("aria-hidden", "true");
        const p = doc.createElementNS(NS, "path");
        p.setAttribute("fill", "currentColor");
        p.setAttribute("d",
            "M12.5 13H8.5C7.57174 13 6.6815 12.6313 6.02513 11.9749"
            + "C5.36875 11.3185 5 10.4283 5 9.5C5 8.57174 5.36875 7.6815 6.02513 7.02513"
            + "C6.6815 6.36875 7.57174 6 8.5 6H8.908C9.03111 6.32197 9.03111 6.67803 8.908 7"
            + "H8.5C7.83696 7 7.20107 7.26339 6.73223 7.73223C6.26339 8.20107 6 8.83696 6 9.5"
            + "C6 10.163 6.26339 10.7989 6.73223 11.2678C7.20107 11.7366 7.83696 12 8.5 12"
            + "H12.5C13.163 12 13.7989 11.7366 14.2678 11.2678C14.7366 10.7989 15 10.163 15 9.5"
            + "C15 8.83696 14.7366 8.20107 14.2678 7.73223C13.7989 7.26339 13.163 7 12.5 7"
            + "H11.953C11.9778 6.83432 11.9935 6.6674 12 6.5C11.9935 6.3326 11.9778 6.16568 11.953 6"
            + "H12.5C13.4283 6 14.3185 6.36875 14.9749 7.02513C15.6313 7.6815 16 8.57174 16 9.5"
            + "C16 10.4283 15.6313 11.3185 14.9749 11.9749C14.3185 12.6313 13.4283 13 12.5 13Z"
            + "M0 6.5C0 7.42826 0.368749 8.3185 1.02513 8.97487C1.6815 9.63125 2.57174 10 3.5 10"
            + "H4.047C4.02219 9.83432 4.0065 9.6674 4 9.5C4.0065 9.3326 4.02219 9.16568 4.047 9"
            + "H3.5C2.83696 9 2.20107 8.73661 1.73223 8.26777C1.26339 7.79893 1 7.16304 1 6.5"
            + "C1 5.83696 1.26339 5.20107 1.73223 4.73223C2.20107 4.26339 2.83696 4 3.5 4"
            + "H7.5C8.16304 4 8.79893 4.26339 9.26777 4.73223C9.73661 5.20107 10 5.83696 10 6.5"
            + "C10 7.16304 9.73661 7.79893 9.26777 8.26777C8.79893 8.73661 8.16304 9 7.5 9"
            + "H7.092C6.96889 9.32197 6.96889 9.67803 7.092 10H7.5C8.42826 10 9.3185 9.63125 9.97487 8.97487"
            + "C10.6313 8.3185 11 7.42826 11 6.5C11 5.57174 10.6313 4.6815 9.97487 4.02513"
            + "C9.3185 3.36875 8.42826 3 7.5 3H3.5C2.57174 3 1.6815 3.36875 1.02513 4.02513"
            + "C0.368749 4.6815 0 5.57174 0 6.5Z");
        svg.appendChild(p);
        return svg;
    }

    /** Stamp data-has-url on an icon element and (re)populate it with
     *  the chain SVG when the comment has a URL. Markdown-only comments
     *  no longer get a dedicated icon — markdown formatting is still
     *  rendered inline, but the historic amber-disc / "M" letter
     *  decoration is gone. */
    _applyIconState(el, comment) {
        if (!el || !comment) return;
        const n = this.normalize(comment);
        const hasUrl = this.URL_REGEX.test(n);
        if (hasUrl) el.setAttribute("data-has-url", "true");
        else el.removeAttribute("data-has-url");
        if (hasUrl) el.classList.add("wv-has-url");
        else el.classList.remove("wv-has-url");

        const tooltip = "Comment popup";
        if (el.title !== tooltip) el.title = tooltip;

        const existingSvg = el.querySelector(".wv-link-svg");
        if (hasUrl) {
            if (!existingSvg) {
                while (el.firstChild) el.removeChild(el.firstChild);
                el.appendChild(this._makeLinkSvg(el.ownerDocument));
            }
        } else if (existingSvg || (el.textContent && el.textContent.length)) {
            while (el.firstChild) el.removeChild(el.firstChild);
        }
    }

    /** Extract all <a href> links from a DOM element. */
    collectAnchorURLs(el) {
        if (!el || !el.querySelectorAll) return [];
        return [...el.querySelectorAll("a[href]")]
            .map(a => a.getAttribute("href"))
            .filter(h => h && /^(https?:|zotero:)/i.test(h));
    }

    /** Walk an element and produce text with "\n" inserted at every <br>,
     *  <p>, and <div> boundary. textContent silently drops <br> separators
     *  so a Zotero-rendered multi-line comment ("line 1<br>line 2") reads as
     *  "line 1line 2", which (a) collapses the visual break and (b) lets the
     *  URL regex (which terminates at \s) eat into the next line when a URL
     *  sits at end-of-line. Reading via this helper preserves the line
     *  structure as the user authored it. */
    _readCommentTextWithBreaks(el) {
        if (!el) return "";
        const out = [];
        const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 3 /* TEXT_NODE */) {
                out.push(node.nodeValue || "");
                return;
            }
            if (node.nodeType !== 1 /* ELEMENT_NODE */) return;
            const tag = (node.tagName || "").toUpperCase();
            if (tag === "BR") {
                out.push("\n");
                return;
            }
            const isBlock = (tag === "P" || tag === "DIV");
            if (isBlock && out.length && !out[out.length - 1].endsWith("\n")) {
                out.push("\n");
            }
            for (const c of node.childNodes) walk(c);
            if (isBlock && out.length && !out[out.length - 1].endsWith("\n")) {
                out.push("\n");
            }
        };
        for (const c of el.childNodes) walk(c);
        return out.join("");
    }

    /** Always read comment text from Zotero's data model, not the DOM. */
    getModelComment(libraryID, annotationKey) {
        if (!annotationKey) return null;
        try {
            const item = Zotero.Items.getByLibraryAndKey(libraryID, annotationKey);
            if (item && item.isAnnotation && item.isAnnotation())
                return item.annotationComment || "";
        } catch (e) {
            Zotero.debug("[Weavero] getModelComment error: " + e.message);
        }
        return null;
    }

    libraryIDFromReader(reader) {
        return (reader && reader._item)
            ? reader._item.libraryID
            : Zotero.Libraries.userLibraryID;
    }

    /** Resolve an annotation item from the (libraryID, key) pair the
     *  reader exposes. Returns null when nothing matches or the lookup
     *  throws (deleted-since, wrong library, etc.). */
    _getAnnotationItem(libraryID, annotationKey) {
        if (!annotationKey) return null;
        try {
            const item = Zotero.Items.getByLibraryAndKey(libraryID, annotationKey);
            if (item && item.isAnnotation && item.isAnnotation()) return item;
        } catch (e) {
            Zotero.debug("[Weavero] _getAnnotationItem error: " + e.message);
        }
        return null;
    }

    /** Return the related items of an annotation. Annotations are first-
     *  class items in Zotero's data model and `dc:relation` triples are
     *  stored on them just like any other item, even though the upstream
     *  UI doesn't expose a relations pane for annotations — that gap is
     *  exactly what this feature fills.
     *
     *  Returns an empty array on any failure or when there are no
     *  relations, so callers can use `.length` directly. */
    _getAnnotationRelatedItems(annotationItem) {
        if (!annotationItem) return [];
        try {
            const keys = annotationItem.relatedItems || [];
            if (!keys.length) return [];
            const lib = annotationItem.libraryID;
            const out = [];
            for (const k of keys) {
                try {
                    const it = Zotero.Items.getByLibraryAndKey(lib, k);
                    if (it) out.push(it);
                } catch (e) {}
            }
            return out;
        } catch (e) {
            Zotero.debug("[Weavero] _getAnnotationRelatedItems error: " + e.message);
            return [];
        }
    }

    /** Mirror upstream relatedBox.js's `_handleShowItem`: select the
     *  target item in the library pane, switch to the main Zotero tab
     *  (so the selection becomes visible if the user is currently in
     *  a reader tab), and focus the window. Annotations as the target
     *  resolve to their parent attachment selection — `selectItem`
     *  handles that path inside ZoteroPane. */
    _navigateToItem(item) {
        if (!item) return;
        try {
            const win = Zotero.getMainWindow();
            if (!win) return;
            if (win.ZoteroPane && typeof win.ZoteroPane.selectItem === "function") {
                win.ZoteroPane.selectItem(item.id);
            }
            if (win.Zotero_Tabs && typeof win.Zotero_Tabs.select === "function") {
                win.Zotero_Tabs.select("zotero-pane");
            }
            win.focus();
        } catch (e) {
            Zotero.debug("[Weavero] _navigateToItem error: " + e.message);
        }
    }

    /** Wire a contextmenu listener on the given `<annotation-row>` so
     *  right-clicking the row opens the same type-aware menu that the
     *  related-box rows use (Open in Reader, Show in Library, Copy
     *  Item Link, etc.). Resolves the underlying Zotero.Item from the
     *  row's `annotation-id` attribute (set by upstream's
     *  AnnotationRow custom element — see annotationRow.js:64).
     *  Idempotent via a dataset flag so repeat scans don't stack
     *  duplicate listeners. */
    _wireAnnotationRowContextMenu(row) {
        if (!row || !row.dataset) return;
        if (row.dataset.wvCtxWired === "1") return;
        try {
            const handler = (e) => {
                try {
                    const idStr = row.getAttribute("annotation-id");
                    const id = idStr ? parseInt(idStr, 10) : NaN;
                    if (!Number.isFinite(id)) return;
                    const item = Zotero.Items.get(id);
                    if (!item) return;
                    e.preventDefault();
                    e.stopPropagation();
                    // Right-pane annotation-rows already live inside the
                    // library view; "Show in Library" would just jump
                    // the items list to the same place the user is
                    // already looking at, so skip it here.
                    this._openRelatedItemContextMenu(
                        item, e.screenX, e.screenY,
                        { skipShowInLibrary: true });
                } catch (err) {
                    Zotero.debug("[Weavero] pane row ctx err: " + err);
                }
            };
            row.addEventListener("contextmenu", handler);
            row.dataset.wvCtxWired = "1";
        } catch (e) {
            Zotero.debug("[Weavero] _wireAnnotationRowContextMenu err: " + e);
        }
    }

    /** Right-click context menu for a related item (used from the
     *  Weavero relations popup, the right-pane Related section, and
     *  right-pane annotation rows). Builds a fresh chrome XUL
     *  `menupopup` per open with all open options that apply to the
     *  item's type, opens it at the given screen coordinates, and
     *  removes itself on `popuphidden`.
     *
     *  Options listed (filtered by type at build time):
     *    Annotation        Open in Reader
     *    Attachment        Open in Reader / Open in New Window / Show File
     *    Note              Open Note
     *    Regular Item      Open Primary Attachment
     *    All               Show in Library (unless opts.skipShowInLibrary),
     *                       Show Parent in Library (if has parent),
     *                       Copy Item Link
     *
     *  `opts.skipShowInLibrary`: omit the "Show in Library" entry —
     *  used by the right-pane annotation-row wiring where the user
     *  is already viewing the library and the entry would just
     *  jump them around.
     */
    _openRelatedItemContextMenu(item, screenX, screenY, opts) {
        opts = opts || {};
        if (!item) return;
        const win = Zotero.getMainWindow();
        if (!win) return;
        const doc = win.document;
        const popupset = doc.getElementById("zotero-pane-popupset")
            || doc.documentElement;

        const oldPopup = doc.getElementById("wv-related-item-menu");
        if (oldPopup) {
            try { oldPopup.remove(); } catch(e) {}
        }
        const popup = doc.createXULElement("menupopup");
        popup.id = "wv-related-item-menu";

        const append = (label, onCommand, opts) => {
            opts = opts || {};
            const mi = doc.createXULElement("menuitem");
            mi.setAttribute("label", label);
            if (opts.iconURL) {
                mi.classList.add("menuitem-iconic");
                mi.setAttribute("image", opts.iconURL);
            }
            if (opts.disabled) mi.setAttribute("disabled", "true");
            mi.addEventListener("command", () => {
                try { onCommand(); }
                catch (e) {
                    Zotero.debug("[Weavero] rel-ctx cmd err: " + e);
                }
            });
            popup.appendChild(mi);
        };
        const addSep = () => {
            popup.appendChild(doc.createXULElement("menuseparator"));
        };

        const isAnnotation = !!(item.isAnnotation && item.isAnnotation());
        const isAttachment = !!(item.isAttachment && item.isAttachment());
        const isNote       = !!(item.isNote       && item.isNote());
        const isRegular    = !!(item.isRegularItem && item.isRegularItem());
        let attachmentFilePath = null;
        if (isAttachment) {
            try { attachmentFilePath = item.getFilePathSync && item.getFilePathSync(); }
            catch (e) {}
        }
        // Resolve a "primary attachment" for regular items. Sync
        // walk through attachments — first one with an
        // `attachmentReaderType` (pdf/epub/snapshot) wins, mirroring
        // the criteria Zotero's `_getFirstUsableItem` applies to
        // pick the attachment to open.
        let primaryAttachment = null;
        if (isRegular) {
            try {
                const attIDs = item.getAttachments && item.getAttachments() || [];
                for (const id of attIDs) {
                    const att = Zotero.Items.get(id);
                    if (!att || !att.isAttachment()) continue;
                    if (att.attachmentReaderType
                            && att.attachmentLinkMode !==
                                Zotero.Attachments.LINK_MODE_LINKED_URL) {
                        primaryAttachment = att;
                        break;
                    }
                }
            } catch (e) {}
        }

        // ---- Type-specific open actions -------------------------------------
        // Icon strategy mirrors Zotero's locateMenu `ViewItem`:
        // when we know the attachment/note type, use the colored
        // item-type icon (red PDF, green snapshot, blue EPUB, …)
        // for the Open-in-Tab/Window rows. Otherwise fall back to
        // the generic universal `new-tab` / `new-window` glyphs.
        // Other actions use Zotero's universal 16px SVG set with
        // names taken from the `$menu-icons` SCSS map (e.g.
        // show-in-library → `library`, view-online → `globe`).
        const isDark = !!(doc.documentElement
            && doc.documentElement.classList.contains("wv-ui-dark"));
        const theme = isDark ? "dark" : "light";
        const ICON_NEW_TAB    = "chrome://zotero/skin/16/universal/new-tab.svg";
        const ICON_NEW_WINDOW = "chrome://zotero/skin/16/universal/new-window.svg";
        const ICON_GLOBE      = "chrome://zotero/skin/16/universal/globe.svg";
        const ICON_FOLDER     = "chrome://zotero/skin/16/universal/folder-open.svg";
        const ICON_LIBRARY    = "chrome://zotero/skin/16/universal/library.svg";
        // Same amber-brown as every other chain icon in the plugin
        // (items list `.wv-tree-rel-icon`, sidebar `.wv-btn-relations`,
        // PDF reader marker badge, context-menu "Add related item…"),
        // so the menuitem reads as part of one consistent affordance.
        // Used for the "Add Related…" entry below.
        const linkSvgFill = isDark ? "#ffb84d" : "#7a4a00";
        const linkSvgPath = "M12.5 13H8.5C7.57174 13 6.6815 12.6313 6.02513"
            + " 11.9749C5.36875 11.3185 5 10.4283 5 9.5C5 8.57174 5.36875"
            + " 7.6815 6.02513 7.02513C6.6815 6.36875 7.57174 6 8.5 6H8.908"
            + "C9.03111 6.32197 9.03111 6.67803 8.908 7H8.5C7.83696 7 7.20107"
            + " 7.26339 6.73223 7.73223C6.26339 8.20107 6 8.83696 6 9.5"
            + "C6 10.163 6.26339 10.7989 6.73223 11.2678C7.20107 11.7366"
            + " 7.83696 12 8.5 12H12.5C13.163 12 13.7989 11.7366 14.2678"
            + " 11.2678C14.7366 10.7989 15 10.163 15 9.5C15 8.83696 14.7366"
            + " 8.20107 14.2678 7.73223C13.7989 7.26339 13.163 7 12.5 7H11.953"
            + "C11.9778 6.83432 11.9935 6.6674 12 6.5C11.9935 6.3326 11.9778"
            + " 6.16568 11.953 6H12.5C13.4283 6 14.3185 6.36875 14.9749"
            + " 7.02513C15.6313 7.6815 16 8.57174 16 9.5C16 10.4283 15.6313"
            + " 11.3185 14.9749 11.9749C14.3185 12.6313 13.4283 13 12.5 13Z"
            + "M0 6.5C0 7.42826 0.368749 8.3185 1.02513 8.97487C1.6815 9.63125"
            + " 2.57174 10 3.5 10H4.047C4.02219 9.83432 4.0065 9.6674 4 9.5"
            + "C4.0065 9.3326 4.02219 9.16568 4.047 9H3.5C2.83696 9 2.20107"
            + " 8.73661 1.73223 8.26777C1.26339 7.79893 1 7.16304 1 6.5"
            + "C1 5.83696 1.26339 5.20107 1.73223 4.73223C2.20107 4.26339"
            + " 2.83696 4 3.5 4H7.5C8.16304 4 8.79893 4.26339 9.26777 4.73223"
            + "C9.73661 5.20107 10 5.83696 10 6.5C10 7.16304 9.73661 7.79893"
            + " 9.26777 8.26777C8.79893 8.73661 8.16304 9 7.5 9H7.092C6.96889"
            + " 9.32197 6.96889 9.67803 7.092 10H7.5C8.42826 10 9.3185 9.63125"
            + " 9.97487 8.97487C10.6313 8.3185 11 7.42826 11 6.5C11 5.57174"
            + " 10.6313 4.6815 9.97487 4.02513C9.3185 3.36875 8.42826 3 7.5 3"
            + "H3.5C2.57174 3 1.6815 3.36875 1.02513 4.02513C0.368749 4.6815"
            + " 0 5.57174 0 6.5Z";
        const ICON_LINK = "data:image/svg+xml;utf8,"
            + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'
                + '<path fill="' + linkSvgFill + '" d="' + linkSvgPath + '"/>'
                + '</svg>');
        const itemTypeIconURL = (type) => {
            if (type === "pdf" || type === "epub" || type === "snapshot") {
                return "chrome://zotero/skin/item-type/16/" + theme
                    + "/attachment-" + type + ".svg";
            }
            if (type === "note") {
                return "chrome://zotero/skin/item-type/16/" + theme
                    + "/note.svg";
            }
            return null;
        };

        // Helper: read the user's tab-vs-window default preference.
        // Mirrors Zotero's locateMenu — when `openReaderInNewWindow`
        // is on, the Window row appears first as the primary verb.
        let prefersWindow = false;
        try {
            prefersWindow = !!Zotero.Prefs.get("openReaderInNewWindow");
        } catch (e) {}

        // Helper: emit a "Open <Type> in New Tab" + "Open <Type>
        // in New Window" pair with a shared type icon. `onOpen` is
        // a (inWindow) → action factory.
        const appendOpenPair = (typeStr, typeLabel, onOpen) => {
            const icon = itemTypeIconURL(typeStr);
            const tabIcon = icon || ICON_NEW_TAB;
            const winIcon = icon || ICON_NEW_WINDOW;
            const labelTab    = "Open " + typeLabel + " in New Tab";
            const labelWindow = "Open " + typeLabel + " in New Window";
            if (prefersWindow) {
                append(labelWindow, onOpen(true),  { iconURL: winIcon });
                append(labelTab,    onOpen(false), { iconURL: tabIcon });
            } else {
                append(labelTab,    onOpen(false), { iconURL: tabIcon });
                append(labelWindow, onOpen(true),  { iconURL: winIcon });
            }
        };

        // Map a reader type code (pdf/epub/snapshot/note) to its
        // display label, falling back to "Attachment" when unknown.
        const readerTypeLabel = (t) => {
            if (t === "pdf")      return "PDF";
            if (t === "epub")     return "EPUB";
            if (t === "snapshot") return "Snapshot";
            if (t === "note")     return "Note";
            return "Attachment";
        };

        if (isAnnotation) {
            // The reader to open is the parent attachment's reader;
            // the annotation key is passed so the reader scrolls to
            // and selects it. Type info comes from the parent.
            let parentReaderType = null;
            let parentID = null;
            try {
                const parent = (item.parentItem)
                    || (item.parentItemID
                        && Zotero.Items.get(item.parentItemID));
                if (parent) {
                    parentID = parent.id;
                    parentReaderType = parent.attachmentReaderType || null;
                }
            } catch (e) {}
            if (parentID) {
                appendOpenPair(parentReaderType,
                    readerTypeLabel(parentReaderType),
                    (inWindow) => async () => {
                        try {
                            await Zotero.Reader.open(parentID,
                                { annotationID: item.key } as any,
                                { openInWindow: inWindow });
                            win.focus();
                        } catch (e) {
                            Zotero.debug(
                                "[Weavero] open-annotation err: " + e);
                        }
                    });
            }
        }
        if (isAttachment) {
            appendOpenPair(item.attachmentReaderType,
                readerTypeLabel(item.attachmentReaderType),
                (inWindow) => async () => {
                    try {
                        await Zotero.Reader.open(item.id, null,
                            { openInWindow: inWindow });
                        win.focus();
                    } catch (e) {
                        Zotero.debug("[Weavero] open-att err: " + e);
                    }
                });
            append("Show File", () => {
                try {
                    if (attachmentFilePath) Zotero.File.reveal(attachmentFilePath);
                } catch (e) {
                    Zotero.debug("[Weavero] show-file err: " + e);
                }
            }, { disabled: !attachmentFilePath, iconURL: ICON_FOLDER });
        }
        if (isNote) {
            // Note: opening a note doesn't go through Zotero.Reader;
            // ZoteroPane.openNote does the right thing for the
            // tab/window choice (it reads the `note.openInNewWindow`
            // pref internally on the default path). For an explicit
            // window override, use openNoteWindow.
            appendOpenPair("note", readerTypeLabel("note"),
                (inWindow) => () => {
                    try {
                        const zp = win.ZoteroPane;
                        if (inWindow) {
                            if (zp && typeof zp.openNoteWindow === "function") {
                                zp.openNoteWindow(item.id);
                            } else if (zp && typeof zp.openNote === "function") {
                                zp.openNote(item.id);
                            }
                        } else {
                            if (zp && typeof zp.openNote === "function") {
                                zp.openNote(item.id);
                            } else if (zp && typeof zp.openNoteWindow === "function") {
                                zp.openNoteWindow(item.id);
                            } else if (zp) {
                                zp.selectItem(item.id);
                            }
                        }
                        win.focus();
                    } catch (e) {
                        Zotero.debug("[Weavero] open-note err: " + e);
                    }
                });
        }
        if (isRegular) {
            // Order matches Zotero's library context menu (locate
            // menu items at the top, separator, then library
            // navigation): Open in New Tab → Open in New Window →
            // View Online → ─── → Show in Library.
            if (primaryAttachment) {
                const t = primaryAttachment.attachmentReaderType;
                appendOpenPair(t, readerTypeLabel(t),
                    (inWindow) => async () => {
                        try {
                            await Zotero.Reader.open(primaryAttachment.id,
                                null, { openInWindow: inWindow });
                            win.focus();
                        } catch (e) {
                            Zotero.debug(
                                "[Weavero] open-primary err: " + e);
                        }
                    });
            }
            // View Online — only when the item has a URL field.
            // Mirrors Zotero's `ViewOptions.online` check.
            let onlineUrl = "";
            try {
                onlineUrl = (item.getField && item.getField("url")) || "";
            } catch (e) {}
            if (onlineUrl) {
                append("View Online", () => {
                    try { Zotero.launchURL(onlineUrl); }
                    catch (e) {
                        Zotero.debug("[Weavero] view-online err: " + e);
                    }
                }, { iconURL: ICON_GLOBE });
            }
        }

        addSep();

        // ---- Universal options ----------------------------------------------
        if (!opts.skipShowInLibrary) {
            append("Show in Library", () => this._navigateToItem(item),
                { iconURL: ICON_LIBRARY });
        }
        // "Show Parent in Library" is meaningful only when the
        // parent is distinct from where "Show in Library" lands.
        // For annotations, `selectItem` already routes to the
        // parent attachment (annotations have no direct row in
        // the items tree), so this row would duplicate the one
        // above. Skip it for annotations.
        if (item.parentItemID && !isAnnotation) {
            append("Show Parent in Library", () => {
                try {
                    const zp = win.ZoteroPane;
                    if (zp && typeof zp.selectItem === "function") {
                        zp.selectItem(item.parentItemID);
                    }
                    if (win.Zotero_Tabs && typeof win.Zotero_Tabs.select === "function") {
                        win.Zotero_Tabs.select("zotero-pane");
                    }
                    win.focus();
                } catch (e) {
                    Zotero.debug("[Weavero] show-parent err: " + e);
                }
            }, { iconURL: ICON_LIBRARY });
        }
        append("Copy Item Link", () => {
            try {
                const lib = item.libraryID;
                let prefix = "library";
                try {
                    if (lib !== Zotero.Libraries.userLibraryID) {
                        const gid = Zotero.Groups.getGroupIDFromLibraryID(lib);
                        if (gid) prefix = "groups/" + gid;
                    }
                } catch (e) {}
                const url = "zotero://select/" + prefix + "/items/" + item.key;
                Zotero.Utilities.Internal.copyTextToClipboard(url);
            } catch (e) {
                Zotero.debug("[Weavero] copy-link err: " + e);
            }
            // Plugin's needle icon — distinguishes a Weavero-provided
            // affordance ("copy a zotero:// URI for this item") from
            // the chain icons that mean "related items".
        }, { iconURL: this._menuItemIconURL });

        addSep();

        // "Add Related…" — opens Zotero's select-items dialog and adds
        // the chosen items as `dc:relation` peers of this one. Uses the
        // chain icon for visual consistency with the rest of the
        // related-item affordances (items-list `.wv-tree-rel-icon`,
        // sidebar `.wv-btn-relations`, PDF reader marker badge, the
        // "Add related item…" entry on the annotation context menu).
        append("Add Related…", () => {
            try { this._addRelatedItemDialog([item]); }
            catch (e) {
                Zotero.debug("[Weavero] add-related err: " + e);
            }
        }, { iconURL: ICON_LINK });

        popupset.appendChild(popup);
        popup.addEventListener("popuphidden", () => {
            try { popup.remove(); } catch (e) {}
        });
        try { (popup as any).openPopupAtScreen(screenX, screenY, true); }
        catch (e) {
            Zotero.debug("[Weavero] rel-ctx open err: " + e);
            try { popup.remove(); } catch (e2) {}
        }
    }

    /** Open an annotation directly in the reader at its source location.
     *  Mirrors the `zotero://open?annotation=…` URL-handler path: the
     *  attachment that owns the annotation is what `Zotero.Reader.open`
     *  takes as `itemID`; the annotation's key is passed as
     *  `annotationID` in the location dict so the reader scrolls to
     *  and selects it on open. If the reader for that attachment is
     *  already open in a tab, Zotero re-uses it.
     *
     *  Returns true on success so callers can fall back to
     *  `_navigateToItem` (library-pane selection) when this isn't an
     *  annotation, has no parent, or the open call rejects. */
    async _openAnnotationInReader(ann) {
        if (!ann || !ann.isAnnotation || !ann.isAnnotation()) return false;
        try {
            const parentID = ann.parentItemID;
            if (!parentID) return false;
            await Zotero.Reader.open(parentID, { annotationID: ann.key } as any);
            try { Zotero.getMainWindow().focus(); } catch (e) {}
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _openAnnotationInReader err: " + e);
            return false;
        }
    }
}

const _annDescriptors = Object.getOwnPropertyDescriptors(_AnnotationMixin.prototype);
delete (_annDescriptors as any).constructor;
export const annotationMethods = _annDescriptors;
