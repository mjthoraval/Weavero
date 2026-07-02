// Module: in-note-editor link rendering, editing, and deletion.
//
// Zotero's note editor is a ProseMirror instance running inside
// an iframe (`<note-editor>`). This module:
// - Detects mounted editors and attaches a per-editor observer
//   that re-marks anchor elements as content changes.
// - Injects per-editor CSS so links render with the same colour
//   buckets used everywhere else (http blue / zotero orange /
//   app purple).
// - Right-clicks on rendered link anchors open a small popup
//   with Edit / Open / Copy / Unlink — the editing actions
//   round-trip through the ProseMirror transaction API to
//   preserve undo, structure, and link-mark continuity.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via
// defineProperties.

import { URL_SCHEMES } from "./url";

class _NoteEditorMixin {
    [k: string]: any;

    /** Render URLs / markdown in items-tree note rows. Each
     *  `<note-row>` (read-only custom element) has a `.note-content`
     *  div populated by upstream via `textContent = note.body`. We
     *  reuse `_markTextLinks(.., {mode:"tree"})` — same path the
     *  note-annotation rows already use. */
    _processNoteRows(doc) {
        if (!this._getEnableNotes()) return;
        doc = doc || Zotero.getMainWindow().document;
        if (!doc) return;
        const rows = doc.querySelectorAll("note-row .note-content");
        this._dbg("[Weavero] _processNoteRows: " + rows.length + " row(s)");
        for (const el of rows) {
            try { this._markTextLinks(el, { mode: "tree" }); }
            catch (e) { Zotero.debug("[Weavero] note-row render: " + e); }
        }
    }

    /** Render URLs / markdown in the right-pane Notes section
     *  (`<notes-box>` listing child notes for a parent item). Each
     *  row's `.label` span holds the note's first-line excerpt. */
    _processNotesBoxes(doc) {
        if (!this._getEnableNotes()) return;
        doc = doc || Zotero.getMainWindow().document;
        if (!doc) return;
        const labels = doc.querySelectorAll("notes-box .body .row .label");
        this._dbg("[Weavero] _processNotesBoxes: " + labels.length + " label(s)");
        for (const el of labels) {
            try { this._markTextLinks(el, { mode: "tree" }); }
            catch (e) { Zotero.debug("[Weavero] notes-box render: " + e); }
        }
    }

    /** Build the CSS rules that colour `<a>` elements in the note
     *  editor's iframe doc by URL scheme. Uses ATTRIBUTE-PREFIX
     *  selectors (`a[href^="..."]`) — pure CSS, zero DOM mutation,
     *  so we don't fight the rich-text editor's reconciliation
     *  (which was causing the entire note to blink as the editor
     *  re-applied its own DOM, our observer re-tagged anchors, and
     *  the editor re-applied again, ad infinitum).
     *
     *  `zotero://` is gated by the "Zotero links" toggle
     *  (`enableZoteroLinks`) and `http(s)://` by the "URLs" toggle
     *  (`enableInlineUrls`); app-link rules need the master
     *  `enableAppLinks` AND the per-scheme tickbox. */
    _buildNoteEditorCSS() {
        const rules = [
            // Light/dark variants via `prefers-color-scheme` — the
            // note editor iframe doesn't carry our `wv-ui-dark`
            // class, so we drive themed link colours from the OS
            // colour scheme instead. Same hex values as the rest
            // of Weavero's surfaces (PLUGIN_CSS / reader CSS).
            ":root { --wv-link-http: #1a73e8;"
                + " --wv-link-zotero: #8b4513;"
                + " --wv-link-app: #9333ea; }",
            "@media (prefers-color-scheme: dark) {"
                + " :root { --wv-link-http: #8ab4f8;"
                + " --wv-link-zotero: #cd853f;"
                + " --wv-link-app: #c084fc; } }",
            // Hide the note editor's built-in link popup in BOTH
            // modes. View mode (URL + Edit/Unlink buttons) is
            // replaced by Weavero's hover tooltip + right-click
            // menu. Edit mode (`<input>` for URL) is replaced by
            // Weavero's two-field Edit Link panel — a popup-mount
            // observer in `_setupNoteEditorObserver` watches for
            // the popup appearing in edit mode (triggered by
            // Ctrl-K, the toolbar's "Insert link" button, or the
            // Edit button — though the last is unreachable now)
            // and routes through `_takeOverEditorLinkPopup`.
            "body:not(.wv-note-native-link) .popup.link-popup { display: none !important; }",
            // Hand cursor over any `<a href>` — matches the PDF
            // reader's clickable-link cursor. The note editor
            // doesn't set a pointer cursor on anchors by default
            // (its default styling assumes anchors are edited as
            // text); since we take over the click ourselves, we
            // need to advertise that the link is clickable.
            "a[href] { cursor: pointer !important; }",
        ];
        const prefOn = (name) => {
            try { const v = Zotero.Prefs.get("weavero." + name); return v === undefined ? true : !!v; }
            catch (e) { return true; }
        };
        // zotero:// — only when the "Zotero links" toggle (enableZoteroLinks) is on.
        if (prefOn("enableZoteroLinks")) {
            rules.push("a[href^=\"zotero://\"] { color: var(--wv-link-zotero) !important; }");
        }
        // http(s):// — only when the "URLs" toggle (enableInlineUrls) is on.
        if (prefOn("enableInlineUrls")) {
            rules.push("a[href^=\"http://\"], a[href^=\"https://\"]"
                + " { color: var(--wv-link-http) !important; }");
        }
        let appLinksOn = false;
        try { appLinksOn = !!Zotero.Prefs.get("weavero.enableAppLinks"); }
        catch (e) {}
        if (appLinksOn) {
            const prefixes = [];
            for (const def of URL_SCHEMES) {
                let on = false;
                try { on = !!Zotero.Prefs.get("weavero." + def.pref); }
                catch (e) {}
                if (!on) continue;
                prefixes.push("a[href^=\"" + def.name + def.sep + "\"]");
            }
            if (prefixes.length) {
                rules.push(prefixes.join(", ")
                    + " { color: var(--wv-link-app) !important; }");
            }
        }
        return rules.join("\n");
    }

    /** Inject (or refresh) our colour stylesheet inside the note
     *  editor's iframe doc. Replaces any prior version of the
     *  stylesheet so toggling `enableAppLinks` or a scheme tick
     *  flips colours immediately on the next call. */
    _ensureNoteEditorStyles(idoc) {
        if (!idoc) return;
        let s = idoc.getElementById("weavero-note-editor-styles");
        if (!s) {
            s = idoc.createElement("style");
            s.id = "weavero-note-editor-styles";
            try { (idoc.head || idoc.documentElement).appendChild(s); }
            catch (e) { return; }
        }
        const css = this._buildNoteEditorCSS();
        if (s.textContent !== css) s.textContent = css;
    }

    /** Whether Weavero should take over a note link with this href — i.e. swallow
     *  the click, show the hover tooltip, take the right-click menu, and suppress
     *  the editor's native popup. Gated by the same "Show:" toggles as the link
     *  colouring: zotero:// → enableZoteroLinks, http(s):// → enableInlineUrls,
     *  app schemes → enableAppLinks + the per-scheme tickbox. When a scheme's
     *  toggle is OFF, Weavero steps aside and the native popup-then-click works.
     *  Unknown schemes keep the default takeover. */
    _noteTakeoverForHref(href) {
        try {
            const h = String(href || "").trim();
            if (!h) return true;
            const on = (name) => {
                try { const v = Zotero.Prefs.get("weavero." + name); return v === undefined ? true : !!v; }
                catch (e) { return true; }
            };
            if (/^zotero:\/\//i.test(h)) return on("enableZoteroLinks");
            if (/^https?:\/\//i.test(h)) return on("enableInlineUrls");
            for (const def of URL_SCHEMES) {
                if (h.toLowerCase().startsWith((def.name + def.sep).toLowerCase())) {
                    return on("enableAppLinks") && on(def.pref);
                }
            }
            return true;
        } catch (e) { return true; }
    }

    /** Per-`<note-editor>` setup. CSS-only approach — we inject our
     *  scheme-color stylesheet into the iframe doc once on load, and
     *  re-inject (rebuild the rules) whenever the user toggles
     *  enableAppLinks or any individual scheme. NO MutationObserver
     *  on the editor's body: prior version used one to re-tag `<a>`
     *  classes on mutation, which fought the rich-text editor's
     *  reconciliation and produced an infinite blink-loop. CSS
     *  attribute-prefix selectors (`a[href^="..."]`) need no
     *  per-mutation work at all. */
    _setupNoteEditorObserver(noteEditorEl) {
        if (!noteEditorEl) return;
        if (!this._noteEditorObservers) {
            this._noteEditorObservers = new WeakMap();
        }
        // Guard on the IFRAME, not the <note-editor> element: Better Notes'
        // editor rebuild swaps the iframe inside the SAME element, so an
        // element-level flag left the replacement iframe without a load
        // listener (native blue links after restore). Each sweep re-checks
        // the CURRENT iframe; wireUp itself is idempotent per document.
        const iframe = noteEditorEl.querySelector("iframe#editor-view")
            || noteEditorEl.querySelector("iframe");
        if (!iframe) {
            this._dbg("[Weavero] note-editor: no iframe found inside <note-editor>");
            return;
        }
        // Instance-identity tokens (not booleans): a plugin reload tears down
        // styles/listeners but leaves stale flags on surviving documents and
        // iframes — a boolean guard then blocks the NEW instance from ever
        // re-wiring (observed live: every editor unwired after a reload).
        // NO early return when already claimed: BN can replace the iframe's
        // DOCUMENT through paths that never fire the iframe `load` event, so
        // every sweep must re-attempt the CURRENT document (wireUp is
        // idempotent per document). Only the load-listener attach is once.
        const alreadyClaimed = iframe._wvLoadWired === this;
        iframe._wvLoadWired = this;
        const wireUp = () => {
            try {
                const idoc = iframe.contentDocument;
                if (!idoc) return;
                // Idempotent PER DOCUMENT — the editor iframe RELOADS its
                // content document when the note actually loads (the initial
                // about:blank reports readyState "complete", so a one-shot
                // wire-up landed on the placeholder and the REAL document came
                // up unwired: native blue links after every session restore).
                // The persistent load listener below re-runs this for each
                // fresh document; the old doc's listeners die with it.
                if (idoc._wvNoteLinksWired === this) return;
                idoc._wvNoteLinksWired = this;
                const iwin = idoc.defaultView;
                this._ensureNoteEditorStyles(idoc);

                // Aggressive click suppression. The note editor's
                // link-popup widget can be wired to any of:
                //   pointerdown / mousedown / mouseup / click /
                //   auxclick (right-click) / contextmenu
                // We swallow ALL of them at capture phase on the
                // iframe document. Only `click` (left-button) and
                // `contextmenu` actually do something — the others
                // just stop the editor's popup from appearing.
                //
                // `findAnchor` walks up from text-node targets; some
                // editor framework events fire with a Text node as
                // target, which has no .closest method.
                const findAnchor = (e) => {
                    let t = e.target;
                    if (t && t.nodeType === 3) t = t.parentNode;
                    if (!t || !t.closest) return null;
                    return t.closest("a[href]");
                };
                // Swallow left-click only on mousedown/mouseup/pointerdown.
                // Calling preventDefault on a RIGHT-click mousedown
                // also suppresses the contextmenu event in Firefox —
                // which would silently kill our `onContext` handler.
                // For right-click we let the events pass through and
                // rely on `onContext` (capture) to take over.
                const swallowLeft = (e) => {
                    if (e.button !== 0) return null;
                    const a = findAnchor(e);
                    if (!a) return null;
                    const href = a.getAttribute("href") || "";
                    // Scheme whose toggle is OFF → don't take over: let the event
                    // through so the editor's native link popup appears.
                    if (!this._noteTakeoverForHref(href)) return null;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    return a;
                };
                const onPointerDown = (e) => {
                    // Sync the popup-hide flag to the link under the pointer BEFORE
                    // the editor shows its native link popup. An off-scheme link
                    // (its toggle is off) sets the body class, so the blanket
                    // popup-hide CSS skips it and the native popup shows; on-scheme
                    // links (and non-links) clear it so the popup stays hidden.
                    try {
                        const a = findAnchor(e);
                        const href = a ? (a.getAttribute("href") || "") : "";
                        const takeover = !!a && this._noteTakeoverForHref(href);
                        idoc.body.classList.toggle("wv-note-native-link", !!a && !takeover);
                    } catch (er) {}
                    swallowLeft(e);
                };
                const onMouseDown   = (e) => { swallowLeft(e); };
                const onMouseUp     = (e) => { swallowLeft(e); };
                const onAuxClick    = (e) => { swallowLeft(e); };  // button-1/middle
                const onClick = (e) => {
                    const a = swallowLeft(e);
                    if (!a) return;   // off-scheme (toggle off) → native click/popup
                    const href = a.getAttribute("href") || "";
                    if (href) this._launchURL(href);
                };

                // Right-click on `<a>` → custom menu. Right-click
                // elsewhere → let Firefox show its textbox-contextmenu.
                //
                // We cancel the current timer, hide the panel, then
                // open the menu. The hover delay is otherwise
                // unaffected — onOut handles the case where the
                // cursor leaves the iframe (e.g. moves to the menu).
                const onContext = (e) => {
                    const a = findAnchor(e);
                    if (!a) return;
                    // Off-scheme (toggle off) → let the native context menu through.
                    if (!this._noteTakeoverForHref(a.getAttribute("href"))) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    if (this._noteLinkTooltipTimer) {
                        try { iwin.clearTimeout(this._noteLinkTooltipTimer); }
                        catch(err) {}
                        this._noteLinkTooltipTimer = null;
                    }
                    this._hideLinkTooltipFromIframe();
                    this._dbg("[Weavero] note-link contextmenu: opening custom");
                    this._openNoteLinkContextMenu(a, idoc, e.screenX, e.screenY);
                };

                // Hover → tooltip showing the URL, with a delay
                // before appearing and dismissed on movement
                // (matches the PDF reader's link hover popup,
                // which is driven by `PopupDelayer`).
                //
                // Model: every `mousemove` cancels the pending
                // open-timer; if the cursor stays still over a
                // link for `_NOTE_TOOLTIP_DELAY_MS` ms, the timer
                // fires and the panel opens at the position
                // captured at the last-move time. The panel is
                // hidden as soon as movement resumes.
                // 500 ms — matches the annotation-comment URL-span
                // hover delay (`_setupUrlHoverWidget` in the items
                // tree). The PDF reader's link tooltip is faster
                // (100 ms via `PopupDelayer`); we deliberately
                // mirror the in-app behaviour the user already sees
                // in annotation comments rather than the reader.
                const DELAY_MS = 500;
                const onMove = (e) => {
                    const a = findAnchor(e);
                    // Cancel any pending open — every movement
                    // restarts the delay window.
                    if (this._noteLinkTooltipTimer) {
                        try { iwin.clearTimeout(this._noteLinkTooltipTimer); }
                        catch(err) {}
                        this._noteLinkTooltipTimer = null;
                    }
                    // Hide an already-open tooltip on any movement
                    // (PDF reader behaviour: tooltip is "discarded
                    // when moving the mouse again").
                    if (this._noteLinkTooltipCurrentAnchor) {
                        this._hideLinkTooltipFromIframe();
                    }
                    if (!a) return;
                    const href = a.getAttribute("href") || "";
                    if (!href) return;
                    // Off-scheme (toggle off) → no Weavero tooltip; native handles it.
                    if (!this._noteTakeoverForHref(href)) return;
                    // Capture the current cursor position; the
                    // panel will anchor here when the timer fires.
                    const sx = e.screenX;
                    const sy = e.screenY;
                    this._noteLinkTooltipTimer = iwin.setTimeout(() => {
                        this._noteLinkTooltipTimer = null;
                        // The cursor has been still over a link for
                        // the full delay — open the tooltip.
                        this._showLinkTooltipFromIframe(href, sx, sy, a);
                    }, DELAY_MS);
                };
                const onOut = (e) => {
                    // `mouseout` from the iframe doc fires when the
                    // cursor leaves the entire iframe (e.g. into the
                    // sidebar / chrome / our right-click menu).
                    // Hide the tooltip AND cancel any pending open
                    // timer — without the cancel, the last
                    // `mousemove` before crossing the iframe boundary
                    // would leave a 500 ms timer scheduled, and the
                    // tooltip would pop up on top of the menu.
                    if (!e.relatedTarget) {
                        this._dbg("[Weavero] tooltip out: cursor left iframe");
                        if (this._noteLinkTooltipTimer) {
                            try {
                                iwin.clearTimeout(this._noteLinkTooltipTimer);
                            } catch(err) {}
                            this._noteLinkTooltipTimer = null;
                        }
                        this._hideLinkTooltipFromIframe();
                    }
                };

                idoc.addEventListener("pointerdown", onPointerDown, true);
                idoc.addEventListener("mousedown",   onMouseDown,   true);
                idoc.addEventListener("mouseup",     onMouseUp,     true);
                idoc.addEventListener("auxclick",    onAuxClick,    true);
                idoc.addEventListener("click",       onClick,       true);
                idoc.addEventListener("contextmenu", onContext,     true);
                idoc.addEventListener("mousemove",   onMove,        true);
                idoc.addEventListener("mouseout",    onOut,         true);

                // Watch for the editor's link popup mounting in
                // edit mode (Ctrl-K, toolbar "Insert link" button,
                // or any other path that calls `pluginState.link.
                // toggle()`). When detected, hand off to our own
                // Edit Link panel via `_takeOverEditorLinkPopup`.
                // The popup is hidden by our CSS in either mode,
                // but we still need to detect it to know when the
                // user wants to edit/create a link.
                const popupMo = new iwin.MutationObserver((mutations) => {
                    for (const m of mutations) {
                        if (m.type !== "childList") continue;
                        for (const n of m.addedNodes) {
                            if (!n || n.nodeType !== 1) continue;
                            const cands = (n.matches
                                && n.matches(".popup.link-popup"))
                                ? [n]
                                : (n.querySelectorAll
                                    ? n.querySelectorAll(".popup.link-popup")
                                    : []);
                            for (const p of cands) {
                                // VIEW popups are governed by the body-class CSS —
                                // leave them. Only the EDIT popup (has an input) is
                                // handed to Weavero's Edit Link panel.
                                if (!p.querySelector("input")) continue;
                                // Off-scheme link (its toggle is off) → native editing
                                // too: the body flag is set, so don't take over.
                                if (idoc.body.classList.contains("wv-note-native-link")) continue;
                                if (p.dataset.weaveroSeen === "1") continue;
                                p.dataset.weaveroSeen = "1";
                                // Defer one tick so React's useLayoutEffect has run
                                // and pluginState.link.popup is settled.
                                iwin.setTimeout(() => {
                                    try {
                                        this._takeOverEditorLinkPopup(idoc, p);
                                    } catch(err) {
                                        Zotero.debug("[Weavero] popup "
                                            + "takeover err: " + err);
                                    }
                                }, 0);
                            }
                        }
                    }
                });
                popupMo.observe(idoc.body || idoc.documentElement,
                    { childList: true, subtree: true });

                this._noteEditorObservers.set(noteEditorEl,
                    { iframe, idoc, popupMo,
                      listeners: { onPointerDown, onMouseDown, onMouseUp,
                                   onAuxClick, onClick, onContext,
                                   onMove, onOut } });
                this._dbg("[Weavero] note-editor wired (styles + listeners + popup MO)");
            } catch (e) {
                Zotero.debug("[Weavero] note-editor wireUp err: " + e);
            }
        };
        try {
            // PERSISTENT load listener (not {once}) — every reload of the
            // editor iframe (initial real load, note switch, DOM re-mount)
            // gets a fresh wire-up; wireUp itself is idempotent per document.
            if (!alreadyClaimed) iframe.addEventListener("load", wireUp);
            if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") {
                wireUp();
            }
        } catch (e) {
            Zotero.debug("[Weavero] note-editor setup err: " + e);
        }
    }

    /** Walk every wired-up note editor and refresh its colour
     *  stylesheet. Called from the pref observer when an
     *  app-link / scheme pref changes so the new colour palette
     *  takes effect without requiring a window reopen. */
    /** Build + open the chrome XUL `menupopup` shown on right-click
     *  of an `<a>` inside a note editor. Items: Open Link / Copy
     *  Link Address / sep / Edit Link… / Unlink. Uses screen coords
     *  to position correctly even though the click event came from
     *  the iframe doc. Idempotent — removes any prior popup first. */
    _openNoteLinkContextMenu(anchor, idoc, screenX, screenY) {
        if (!anchor) return;
        const win = Zotero.getMainWindow();
        if (!win) return;
        const doc = win.document;
        const popupset = doc.getElementById("zotero-pane-popupset")
            || doc.documentElement;
        const old = doc.getElementById("wv-note-link-menu");
        if (old) { try { old.remove(); } catch(e) {} }
        const popup: any = doc.createXULElement("menupopup");
        popup.id = "wv-note-link-menu";

        const href = anchor.getAttribute("href") || "";
        const append = (label, fn) => {
            const mi = doc.createXULElement("menuitem");
            mi.setAttribute("label", label);
            mi.addEventListener("command", () => {
                try { fn(); }
                catch(e) { Zotero.debug("[Weavero] note-link menu cmd err: " + e); }
            });
            popup.appendChild(mi);
        };
        const sep = () => popup.appendChild(doc.createXULElement("menuseparator"));

        append("Copy Link", () => {
            try {
                if (href) Zotero.Utilities.Internal.copyTextToClipboard(href);
            } catch(e) { Zotero.debug("[Weavero] copy-link err: " + e); }
        });
        sep();
        append("Edit Link…", () => {
            this._editNoteLink(anchor, idoc);
        });
        append("Unlink", () => {
            this._unlinkNoteLink(anchor, idoc);
        });

        popupset.appendChild(popup);
        popup.addEventListener("popuphidden", () => {
            try { popup.remove(); } catch(e) {}
        });
        try { popup.openPopupAtScreen(screenX, screenY, true); }
        catch(e) {
            Zotero.debug("[Weavero] note-link menu open err: " + e);
            try { popup.remove(); } catch(e2) {}
        }
    }

    /** Resolve the note editor's ProseMirror link plugin from an
     *  iframe document. The editor exposes itself via the iframe
     *  window's `_currentEditorInstance` (see upstream
     *  note-editor/src/index.zotero.js) — we reach through
     *  `wrappedJSObject` to bypass the chrome-side Xray wrapper.
     *
     *  Returns `{ editorCore, view, link }` or `null`. */
    _getNoteEditorLinkPlugin(idoc) {
        if (!idoc) return null;
        const iwin = idoc.defaultView;
        if (!iwin) return null;
        try {
            const w = iwin.wrappedJSObject || iwin;
            const editorInstance = w._currentEditorInstance;
            const editorCore = editorInstance && editorInstance._editorCore;
            const link = editorCore
                && editorCore.pluginState
                && editorCore.pluginState.link;
            if (!link || !link.view) return null;
            return { editorCore, view: link.view, link };
        } catch (e) {
            Zotero.debug("[Weavero] _getNoteEditorLinkPlugin err: " + e);
            return null;
        }
    }

    /** Position the editor's caret inside `anchor` so the link
     *  plugin's `setURL` / `removeURL` can find the surrounding
     *  link mark range via `getMarkRangeAtCursor`. */
    _positionCursorInLink(view, anchor) {
        try {
            const target = anchor.firstChild || anchor;
            const dompos = view.posAtDOM(target, 0);
            const $pos = view.state.doc.resolve(dompos);
            // Both TextSelection and the base Selection class expose
            // a static `.near` that returns a valid selection close
            // to a resolved position. The iframe's prosemirror bundle
            // is shared with the existing selection's class, so we
            // pick it up from the live state instead of trying to
            // import prosemirror-state from chrome.
            const Sel = view.state.selection.constructor;
            const newSel = (Sel && typeof Sel.near === "function")
                ? Sel.near($pos)
                : null;
            if (!newSel) return false;
            view.dispatch(view.state.tr.setSelection(newSel));
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _positionCursorInLink err: " + e);
            return false;
        }
    }

    /** Edit Link command — open a chrome panel (anchored near the
     *  link) with Text + URL fields + Cancel/Apply buttons, then
     *  route changes through the editor's link plugin. Mirrors
     *  the two-field layout used by Evernote / Google Docs /
     *  Notion: editing existing links generally needs to update
     *  both the visible text and the underlying URL.
     *
     *  Fall-through:
     *  - URL only changed → `pluginState.link.setURL(newUrl)`
     *    (plugin uses `updateMarkRangeAtCursor` to find the link
     *    range from the cursor, which we position inside).
     *  - Text changed (with or without URL) → dispatch a single
     *    `replaceWith` transaction that swaps the entire anchor
     *    range for a new text node carrying the (possibly new)
     *    link mark. This keeps the edit in one undo step. */
    _editNoteLink(anchor, idoc) {
        if (!anchor || !idoc) return;
        const ctx = this._getNoteEditorLinkPlugin(idoc);
        if (!ctx) {
            Zotero.debug("[Weavero] edit-link: editor link plugin "
                + "unavailable");
            return;
        }
        const oldUrl = anchor.getAttribute("href") || "";
        const oldText = anchor.textContent || "";
        this._showLinkEditPanel(idoc, anchor, null, null,
            oldText, oldUrl,
            (newText, newUrl) => {
                this._applyNoteLinkEdit(ctx, anchor,
                    oldText, oldUrl, newText, newUrl);
            });
    }

    /** Apply Text/URL changes from the Edit Link panel.
     *
     *  Cross-realm notes — the editor's prosemirror-* runs in the
     *  iframe (content) realm; we run in chrome:
     *  1. `MarkType.create(attrs)` reads `attrs.href`. A bare
     *     chrome object is Xray-wrapped → property read returns
     *     undefined → "No value supplied for attribute href".
     *     `Cu.cloneInto` rehomes attrs into content.
     *  2. `schema.text(text, [mark])` would route the marks array
     *     through `Mark.setFrom`, which calls `.slice()`. A
     *     chrome-side array Xray-blocks `.slice()`. We sidestep
     *     by creating an UNMARKED text node and applying the link
     *     mark via `tr.addMark` (single mark, no array). */
    _applyNoteLinkEdit(ctx, anchor, oldText, oldUrl, newText, newUrl) {
        const trimmedUrl = (newUrl || "").trim();
        if (!trimmedUrl) return;  // empty URL is treated as cancel
        const textChanged = (newText !== null && newText !== oldText);
        const urlChanged = (trimmedUrl !== oldUrl);
        if (!textChanged && !urlChanged) return;
        if (textChanged && !newText) return;  // empty text — skip
        const view = ctx.view;
        try {
            if (textChanged) {
                const fromPos = view.posAtDOM(anchor, 0);
                const toPos = view.posAtDOM(anchor,
                    anchor.childNodes.length);
                const schema = view.state.schema;
                const iwin = view.dom && view.dom.ownerDocument
                    && view.dom.ownerDocument.defaultView;
                const rawAttrs = { href: trimmedUrl, title: null };
                const attrs = (iwin && Components && Components.utils
                    && Components.utils.cloneInto)
                    ? Components.utils.cloneInto(rawAttrs, iwin)
                    : rawAttrs;
                const linkMark = schema.marks.link.create(attrs);
                // Replace the anchor's contents with an unmarked
                // text node, then mark the new range with the link
                // mark. Both ops in one tr → single undo step.
                const textNode = schema.text(newText);
                const tr = view.state.tr;
                tr.replaceWith(fromPos, toPos, textNode);
                tr.addMark(fromPos, fromPos + newText.length, linkMark);
                view.dispatch(tr);
                this._dbg("[Weavero] edit-link: replaced text="
                    + JSON.stringify(newText) + " href=" + trimmedUrl);
            } else {
                if (!this._positionCursorInLink(view, anchor)) return;
                ctx.link.setURL(trimmedUrl);
                this._dbg("[Weavero] edit-link: setURL("
                    + trimmedUrl + ") dispatched");
            }
        } catch (e) {
            Zotero.debug("[Weavero] edit-link apply err: " + e);
        }
    }

    /** Take over the editor's built-in link popup when it mounts in
     *  edit mode. Detected by the popup-mount MutationObserver in
     *  `_setupNoteEditorObserver`. Reads `pluginState.link.popup`
     *  to determine the context (cursor in existing link vs new
     *  link from selection), cancels the editor's popup, and opens
     *  Weavero's two-field Edit Link panel. */
    _takeOverEditorLinkPopup(idoc, popupEl) {
        const ctx = this._getNoteEditorLinkPlugin(idoc);
        if (!ctx) return;
        const pluginPopup = ctx.link && ctx.link.popup;
        if (!pluginPopup || !pluginPopup.active) return;
        // Only take over when the editor's link plugin entered
        // popup-edit mode explicitly — `pluginPopup.edit === true`
        // is set by `toggle()` (Ctrl-K / toolbar "Insert link"
        // button) and NOT by the regular `update()` path that
        // re-evaluates the popup whenever the cursor enters a
        // link. Right-clicking a link updates the selection to
        // the click point, which fires `update()` and mounts the
        // popup in view mode; without this guard our takeover
        // would race the right-click context menu and steal the
        // interaction.
        if (!pluginPopup.edit) return;

        const isEdit = !!pluginPopup.node;
        const initUrl = pluginPopup.href || "";
        let initText = "";
        let anchor = null;

        if (isEdit) {
            anchor = pluginPopup.node;
            initText = anchor.textContent || "";
        } else {
            try {
                const sel = ctx.view.state.selection;
                if (!sel.empty) {
                    initText = ctx.view.state.doc.textBetween(
                        sel.from, sel.to);
                }
            } catch(e) {}
        }

        // Capture selection bounds for the create-from-selection
        // path before cancelling — `cancel()` dispatches a no-op
        // transaction that doesn't move the selection, but we
        // capture defensively.
        const savedFrom = !isEdit ? ctx.view.state.selection.from : null;
        const savedTo   = !isEdit ? ctx.view.state.selection.to   : null;

        try { ctx.link.cancel(); } catch(e) {}
        this._dbg("[Weavero] popup takeover: isEdit=" + isEdit
            + " initUrl=" + initUrl
            + " initText=" + JSON.stringify(initText));

        this._showLinkEditPanel(idoc,
            isEdit ? anchor : null,
            isEdit ? null : savedFrom,
            isEdit ? null : savedTo,
            initText, initUrl,
            (newText, newUrl) => {
                if (isEdit) {
                    this._applyNoteLinkEdit(ctx, anchor,
                        initText, initUrl, newText, newUrl);
                } else {
                    this._createNoteLinkFromSelection(ctx, idoc,
                        savedFrom, savedTo,
                        initText, newText, newUrl);
                }
            });
    }

    /** Create a new link from the editor's current selection, used
     *  by the Ctrl-K / toolbar take-over flow when the user invokes
     *  the link popup with text selected (no existing link mark).
     *
     *  Same cross-realm pattern as `_applyNoteLinkEdit`:
     *  `Cu.cloneInto` the attrs, then `tr.replaceWith` an unmarked
     *  text node + `tr.addMark` over the new range — avoids the
     *  marks-array Xray slice() block. */
    _createNoteLinkFromSelection(ctx, idoc, fromPos, toPos,
            oldText, newText, newUrl) {
        const trimmedUrl = (newUrl || "").trim();
        if (!trimmedUrl) return;
        if (!newText) return;
        if (typeof fromPos !== "number" || typeof toPos !== "number") return;
        const view = ctx.view;
        try {
            const schema = view.state.schema;
            const iwin = idoc && idoc.defaultView;
            const rawAttrs = { href: trimmedUrl, title: null };
            const attrs = (iwin && Components && Components.utils
                && Components.utils.cloneInto)
                ? Components.utils.cloneInto(rawAttrs, iwin)
                : rawAttrs;
            const linkMark = schema.marks.link.create(attrs);
            const tr = view.state.tr;
            if (newText !== oldText) {
                const textNode = schema.text(newText);
                tr.replaceWith(fromPos, toPos, textNode);
                tr.addMark(fromPos, fromPos + newText.length, linkMark);
            } else {
                tr.addMark(fromPos, toPos, linkMark);
            }
            view.dispatch(tr);
            this._dbg("[Weavero] create-link: text="
                + JSON.stringify(newText) + " href=" + trimmedUrl);
        } catch (e) {
            Zotero.debug("[Weavero] create-link err: " + e);
        }
    }

    /** Build and open the Edit Link popup. Implemented as an HTML
     *  overlay INSIDE the iframe document (positioned `absolute`
     *  in body coords) rather than as a chrome XUL panel. That
     *  gives us three things for free:
     *  - **Natural clipping at the editor's frame** — the iframe's
     *    overflow clips anything that scrolls past its viewport,
     *    so the popup looks "as if it lived in the text" the same
     *    way the note's own content does.
     *  - **Native scroll** — wheel events over the popup bubble
     *    to the iframe doc and scroll the editor; with a XUL
     *    panel (separate OS window) wheel events were captured
     *    by the panel and the editor stayed put.
     *  - **No reposition on scroll** — `position: absolute` in
     *    body coords means the popup moves with the body's
     *    scrolled content automatically; no scroll listener.
     *
     *  Position source:
     *  - If `anchor` is given (existing-link edit), position from
     *    `anchor.getBoundingClientRect()` + iwin scroll offset.
     *  - Else if `fromPos` is a number (selection-based new link),
     *    position from `view.coordsAtPos(fromPos)`.
     *  Calls `onApply(newText, newUrl)` when the user confirms. */
    _showLinkEditPanel(idoc, anchor, fromPos, toPos,
            initText, initUrl, onApply) {
        if (!idoc) return;
        const HTML_NS = "http://www.w3.org/1999/xhtml";
        const win = Zotero.getMainWindow();
        if (!win) return;
        const chromeDoc = win.document;
        const iwin = idoc.defaultView;
        if (!iwin) return;

        // Tear down any prior overlay (defensive against fast
        // double-invocations).
        const prior = idoc.querySelector(".wv-link-edit-overlay");
        if (prior) {
            try { prior.remove(); } catch(e) {}
        }

        // One-time CSS injection into the iframe doc head. Subsequent
        // calls reuse the existing stylesheet.
        const STYLE_ID = "wv-link-edit-style";
        if (!idoc.getElementById(STYLE_ID)) {
            const style = idoc.createElementNS(HTML_NS, "style");
            style.id = STYLE_ID;
            style.textContent = ""
                + ".wv-link-edit-overlay{"
                +   "position:absolute;z-index:100000;"
                +   "background:#ffffff;color:#000;"
                +   "padding:14px 16px 12px;min-width:380px;"
                +   "border:1px solid rgba(0,0,0,0.20);"
                +   "border-radius:6px;"
                +   "box-shadow:0 4px 16px rgba(0,0,0,0.18);"
                +   "font:menu;font-size:13px;line-height:1.4;"
                +   "box-sizing:border-box;"
                + "}"
                + ".wv-link-edit-overlay .row{"
                +   "display:flex;align-items:center;"
                +   "margin-bottom:10px;gap:10px;"
                + "}"
                + ".wv-link-edit-overlay .row label{"
                +   "width:42px;font-weight:600;flex-shrink:0;"
                +   "color:#4a9eff;"
                + "}"
                + ".wv-link-edit-overlay .row input{"
                +   "flex:1;padding:5px 8px;"
                +   "background:#fff;color:inherit;"
                +   "border:1px solid rgba(0,0,0,0.30);"
                +   "border-radius:4px;font:inherit;outline:none;"
                + "}"
                + ".wv-link-edit-overlay .row input:focus{"
                +   "border-color:#4a9eff;"
                +   "box-shadow:0 0 0 2px rgba(74,158,255,0.25);"
                + "}"
                + ".wv-link-edit-overlay .buttons{"
                +   "display:flex;justify-content:flex-end;"
                +   "gap:8px;margin-top:6px;"
                + "}"
                + ".wv-link-edit-overlay button{"
                +   "padding:5px 14px;border-radius:4px;"
                +   "font:inherit;cursor:pointer;"
                +   "border:1px solid rgba(0,0,0,0.20);"
                +   "background:#f6f6f6;color:inherit;"
                + "}"
                + ".wv-link-edit-overlay button:hover{background:#ececec;}"
                + ".wv-link-edit-overlay button.apply{"
                +   "background:#4a9eff;color:#fff;"
                +   "border-color:#2c7fe0;font-weight:600;"
                + "}"
                + ".wv-link-edit-overlay button.apply:hover{"
                +   "background:#2c7fe0;"
                + "}"
                + "@media (prefers-color-scheme: dark){"
                +   ".wv-link-edit-overlay{"
                +     "background:#2b2b2b;color:#fff;"
                +     "border-color:rgba(255,255,255,0.30);"
                +     "box-shadow:0 4px 16px rgba(0,0,0,0.50);"
                +   "}"
                +   ".wv-link-edit-overlay .row input{"
                +     "background:#1e1e1e;color:#fff;"
                +     "border-color:rgba(255,255,255,0.30);"
                +   "}"
                +   ".wv-link-edit-overlay button{"
                +     "background:#3a3a3a;"
                +     "border-color:rgba(255,255,255,0.30);"
                +   "}"
                +   ".wv-link-edit-overlay button:hover{background:#4a4a4a;}"
                + "}";
            try {
                (idoc.head || idoc.documentElement).appendChild(style);
            } catch(e) {}
        }

        const overlay = idoc.createElementNS(HTML_NS, "div");
        overlay.className = "wv-link-edit-overlay";

        const makeRow = (labelText, value) => {
            const row = idoc.createElementNS(HTML_NS, "div");
            row.className = "row";
            const label = idoc.createElementNS(HTML_NS, "label");
            label.textContent = labelText;
            const input = idoc.createElementNS(HTML_NS, "input");
            input.type = "text";
            input.value = value || "";
            row.appendChild(label);
            row.appendChild(input);
            return { row, input };
        };

        const textRow = makeRow("Text", initText);
        const urlRow  = makeRow("URL",  initUrl);
        overlay.appendChild(textRow.row);
        overlay.appendChild(urlRow.row);

        const btns = idoc.createElementNS(HTML_NS, "div");
        btns.className = "buttons";
        const cancelBtn = idoc.createElementNS(HTML_NS, "button");
        cancelBtn.textContent = "Cancel";
        const applyBtn = idoc.createElementNS(HTML_NS, "button");
        applyBtn.textContent = "Apply";
        applyBtn.className = "apply";
        btns.appendChild(cancelBtn);
        btns.appendChild(applyBtn);
        overlay.appendChild(btns);

        // The note editor's actual scrolling element is
        // `.editor-core` (overflow:auto), with `.relative-container`
        // (position:relative) as its only child — that's where the
        // editor's own popups live (LinkPopup, HighlightPopup, …).
        // Append our overlay to `.relative-container` so it:
        //   - scrolls with the editor's content (no manual reposition)
        //   - is clipped at `.editor-core`'s overflow edge
        //     (the editor's frame, matching the note's text)
        //   - lets wheel events bubble up to `.editor-core` so
        //     scrolling works while the cursor is over the popup
        // Position is `top`/`left` relative to `.relative-container`,
        // computed from the link's viewport rect minus the
        // container's viewport rect.
        const relativeContainer = idoc.querySelector(
            ".editor-core .relative-container");
        const host = relativeContainer
            || idoc.body
            || idoc.documentElement;
        let top = 0, left = 0;
        try {
            let linkRect = null;
            if (anchor) {
                linkRect = anchor.getBoundingClientRect();
            } else if (typeof fromPos === "number") {
                const ctx = this._getNoteEditorLinkPlugin(idoc);
                if (ctx) {
                    const c = ctx.view.coordsAtPos(fromPos);
                    if (c) {
                        linkRect = {
                            left: c.left, right: c.right,
                            top: c.top, bottom: c.bottom,
                        };
                    }
                }
            }
            if (linkRect) {
                if (relativeContainer) {
                    const cr = relativeContainer.getBoundingClientRect();
                    top  = linkRect.bottom - cr.top;
                    left = linkRect.left   - cr.left;
                } else {
                    // Fallback when container missing: use viewport
                    // coords directly (less ideal, but better than
                    // nothing).
                    top  = linkRect.bottom;
                    left = linkRect.left;
                }
            }
        } catch(e) {}
        overlay.style.top  = (top + 4) + "px";
        overlay.style.left = left + "px";

        try {
            host.appendChild(overlay);
        } catch(e) {
            Zotero.debug("[Weavero] link-edit overlay append err: " + e);
            return;
        }

        let done = false;
        const close = () => {
            if (done) return;
            done = true;
            try { overlay.remove(); } catch(e) {}
            try {
                idoc.removeEventListener("mousedown", outsideHandler, true);
            } catch(e) {}
            try {
                chromeDoc.removeEventListener(
                    "mousedown", outsideHandler, true);
            } catch(e) {}
        };
        const outsideHandler = (e) => {
            const t = e.target;
            if (t && t.closest && t.closest(".wv-link-edit-overlay")) return;
            close();
        };
        try {
            idoc.addEventListener("mousedown", outsideHandler, true);
        } catch(e) {}
        try {
            chromeDoc.addEventListener("mousedown", outsideHandler, true);
        } catch(e) {}

        // Stop event propagation INSIDE the overlay so we don't
        // re-trigger editor handlers (cursor moves, link click, …)
        // when the user interacts with the popup. Applied at
        // capture-phase on the overlay itself.
        const stop = (e) => { e.stopPropagation(); };
        overlay.addEventListener("mousedown", stop, false);
        overlay.addEventListener("mouseup",   stop, false);
        overlay.addEventListener("click",     stop, false);

        // Focus-trap: keep Tab/Shift-Tab cycling within the popup
        // instead of escaping into the editor's content. Standard
        // UX pattern for modal/inline dialogs.
        const focusables = [textRow.input, urlRow.input,
            cancelBtn, applyBtn];
        overlay.addEventListener("keydown", (e) => {
            if (e.key !== "Tab") return;
            const idx = focusables.indexOf(idoc.activeElement);
            e.preventDefault();
            e.stopPropagation();
            const len = focusables.length;
            let next;
            if (idx === -1) {
                next = focusables[0];
            } else if (e.shiftKey) {
                next = focusables[(idx - 1 + len) % len];
            } else {
                next = focusables[(idx + 1) % len];
            }
            try { next.focus(); } catch(err) {}
        }, true);

        cancelBtn.addEventListener("click", (e) => {
            e.preventDefault();
            close();
        });
        applyBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const t = textRow.input.value;
            const u = urlRow.input.value;
            close();
            try { onApply(t, u); } catch(err) {
                Zotero.debug("[Weavero] link-edit onApply err: " + err);
            }
        });

        const keyHandler = (e) => {
            if (e.key === "Enter") {
                e.preventDefault(); e.stopPropagation();
                applyBtn.click();
            } else if (e.key === "Escape") {
                e.preventDefault(); e.stopPropagation();
                close();
            } else {
                // Stop other keys too — we don't want Ctrl-K /
                // arrow keys / etc. to reach the editor's keymap
                // while the user is typing in our inputs.
                e.stopPropagation();
            }
        };
        textRow.input.addEventListener("keydown", keyHandler);
        urlRow.input.addEventListener("keydown", keyHandler);

        // Focus the URL input after the overlay is in the DOM.
        win.setTimeout(() => {
            try { urlRow.input.focus(); urlRow.input.select(); }
            catch(e) {}
        }, 0);
    }

    /** Unlink command — strip the `<a>` mark, keeping the text. */
    _unlinkNoteLink(anchor, idoc) {
        if (!anchor || !idoc) return;
        const ctx = this._getNoteEditorLinkPlugin(idoc);
        if (!ctx) {
            Zotero.debug("[Weavero] unlink: editor link plugin "
                + "unavailable");
            return;
        }
        if (!this._positionCursorInLink(ctx.view, anchor)) return;
        try {
            ctx.link.removeURL();
            this._dbg("[Weavero] unlink: removeURL dispatched");
        } catch (e) {
            Zotero.debug("[Weavero] unlink removeURL err: " + e);
        }
    }

    /** Show the URL tooltip for a note-editor link hover. Anchored
     *  to the cursor at the time the iframe-doc `mousemove` timer
     *  fired (i.e. where the user came to rest over the link).
     *  Implemented as a XUL `<panel>` parented to the main window's
     *  popupset — the iframe is cross-doc, so direct `openPopup
     *  (anchor)` does not work; we use `openPopupAtScreen` with
     *  the captured screen coordinates. */
    _showLinkTooltipFromIframe(href, screenX, screenY, anchorEl) {
        if (!href) return;
        try {
            const win = Zotero.getMainWindow();
            if (!win || !win.document) return;
            const doc = win.document;
            // `any` because XUL panel APIs (state, hidePopup,
            // openPopupAtScreen) live outside HTMLElement.
            let panel: any = doc.getElementById("wv-note-link-tooltip-panel");
            if (!panel) {
                const popupset = doc.getElementById("zotero-pane-popupset")
                    || doc.documentElement;
                panel = doc.createXULElement("panel");
                panel.id = "wv-note-link-tooltip-panel";
                // Plain panel (no `type="arrow"`). With an arrow
                // panel, Mozilla auto-decides above vs below based
                // on available space and sometimes overlaps the
                // cursor — causing a mouseout→hide→mouseover→show
                // flicker loop. A plain panel lets us position
                // explicitly and reliably below the link.
                panel.setAttribute("noautofocus", "true");
                panel.setAttribute("noautohide", "true");
                panel.setAttribute("level", "top");
                panel.setAttribute("ignorekeys", "true");
                // Zero out the system XUL panel chrome's own padding
                // (Mozilla's default theme adds ~6-10 px) so only the
                // description's tight padding shows visually.
                panel.style.padding    = "0";
                panel.style.margin     = "0";
                panel.style.minWidth   = "0";
                panel.style.minHeight  = "0";
                const desc: any = doc.createXULElement("description");
                desc.id = "wv-note-link-tooltip-desc";
                desc.style.maxWidth = "60ch";
                desc.style.padding  = "2px 6px";
                desc.style.margin   = "0";
                panel.appendChild(desc);
                popupset.appendChild(panel);
            }
            const desc = doc.getElementById("wv-note-link-tooltip-desc");
            if (desc) desc.textContent = href;
            // Position the panel just below the cursor — same shape
            // as the PDF reader's link hover tooltip. We're called
            // ONCE when the iframe-doc mousemove timer fires (after
            // the user has held still over a link for the hover
            // delay), so the position captured at the timer-arm
            // time is the right place to anchor.
            let sx = (typeof screenX === "number") ? screenX + 4  : 0;
            let sy = (typeof screenY === "number") ? screenY + 18 : 0;
            try {
                if (panel.state === "open" || panel.state === "showing") {
                    panel.hidePopup();
                }
                panel.openPopupAtScreen(sx, sy, false, null);
                this._noteLinkTooltipCurrentAnchor = anchorEl || null;
                this._dbg("[Weavero] tooltip: open href=" + href
                    + " sx=" + sx + " sy=" + sy);
            } catch (e) {
                Zotero.debug("[Weavero] tooltip open err: " + e);
            }
        } catch (e) {
            Zotero.debug("[Weavero] note-link tooltip err: " + e);
        }
    }

    _hideLinkTooltipFromIframe() {
        this._noteLinkTooltipCurrentAnchor = null;
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            const tip: any = doc && doc.getElementById("wv-note-link-tooltip-panel");
            if (tip && tip.hidePopup) {
                tip.hidePopup();
                this._dbg("[Weavero] tooltip: hide");
            }
        } catch (e) {}
    }

    _refreshAllNoteEditorStyles() {
        try {
            // Right-pane editors live in the main window; pop-out
            // editors in `zotero:note` windows.
            const docs = [];
            try { docs.push(Zotero.getMainWindow().document); }
            catch (e) {}
            try {
                const winEnum = Services.wm.getEnumerator("zotero:note");
                while (winEnum.hasMoreElements()) {
                    const w = winEnum.getNext() as any;
                    if (w && w.document) docs.push(w.document);
                }
            } catch (e) {}
            for (const d of docs) {
                if (!d) continue;
                for (const ne of d.querySelectorAll("note-editor")) {
                    try {
                        const ifr = ne.querySelector("iframe#editor-view")
                            || ne.querySelector("iframe");
                        const idoc = ifr && ifr.contentDocument;
                        if (idoc) this._ensureNoteEditorStyles(idoc);
                    } catch (e) {}
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _refreshAllNoteEditorStyles err: " + e);
        }
    }

    /** Find every `<note-editor>` across the main window AND every
     *  pop-out `zotero:note` window, and wire it up. Idempotent — the
     *  `_noteEditorObservers` WeakMap dedupes. */
    _processNoteEditors(doc) {
        if (!this._getEnableNotes()) return;
        const main = doc || Zotero.getMainWindow().document;
        let mainCount = 0;
        if (main) {
            for (const ne of main.querySelectorAll("note-editor")) {
                this._setupNoteEditorObserver(ne);
                mainCount++;
            }
        }
        let popoutCount = 0;
        try {
            const winEnum = Services.wm.getEnumerator("zotero:note");
            while (winEnum.hasMoreElements()) {
                const w = winEnum.getNext() as any;
                const wd = w && w.document;
                if (!wd) continue;
                for (const ne of wd.querySelectorAll("note-editor")) {
                    this._setupNoteEditorObserver(ne);
                    popoutCount++;
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] note-window enumerate err: " + e);
        }
        // Weavero's multi-tab READER windows host note tabs too (a surface
        // added after this sweep was written — their editors showed native
        // blue links because nothing ever wired them).
        let readerCount = 0;
        try {
            const rEnum = Services.wm.getEnumerator("zotero:reader");
            while (rEnum.hasMoreElements()) {
                const w = rEnum.getNext() as any;
                const wd = w && w.document;
                if (!wd) continue;
                for (const ne of wd.querySelectorAll("note-editor")) {
                    this._setupNoteEditorObserver(ne);
                    readerCount++;
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] reader-window note enumerate err: " + e);
        }
        this._dbg("[Weavero] _processNoteEditors: main=" + mainCount
            + " popout=" + popoutCount + " readerWin=" + readerCount);
    }

    /** Pop-out note window listener — onOpenWindow fires when a
     *  `chrome://zotero/content/note.xhtml` window is created. On
     *  load, scan the new document for `<note-editor>` elements and
     *  wire them up. */
    _setupNoteWindowListener() {
        if (this._noteWindowListener) return;
        // After a note window's `load` fires, the <note-editor>
        // element isn't always in the DOM yet — XUL custom-element
        // upgrades happen asynchronously. Poll briefly (up to ~1s)
        // until at least one editor element is found, then wire it.
        const tryWire = (w, retries) => {
            try {
                if (!w || !w.document) return;
                if (!this._getEnableNotes()) return;
                const before = (this._noteEditorObservers
                    ? 0 /* WeakMap has no .size */ : 0);
                let count = 0;
                for (const ne of w.document.querySelectorAll("note-editor")) {
                    this._setupNoteEditorObserver(ne);
                    count++;
                }
                this._dbg("[Weavero] tryWire pop-out note: count="
                    + count + " retriesLeft=" + retries);
                if (count === 0 && retries > 0) {
                    try {
                        w.setTimeout(() => tryWire(w, retries - 1), 100);
                    } catch (e) {}
                }
            } catch (e) {
                Zotero.debug("[Weavero] tryWire err: " + e);
            }
        };
        const onLoad = (w) => {
            try {
                const url = w && w.location && w.location.href;
                if (!url || !/note\.xhtml/.test(url)) return;
                tryWire(w, 10);
            } catch (e) {
                Zotero.debug("[Weavero] note-win load err: " + e);
            }
        };
        const listener = {
            // Required interface methods — `wm.addListener` silently
            // fails / drops the listener if any of the three are
            // missing, which is why our previous build didn't see
            // pop-out note windows.
            onOpenWindow: (xulWindow) => {
                try {
                    const w = xulWindow.docShell && xulWindow.docShell.domWindow;
                    if (!w) return;
                    if (w.document
                            && w.document.readyState === "complete") {
                        onLoad(w);
                    } else {
                        w.addEventListener("load",
                            () => onLoad(w), { once: true });
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] onOpenWindow err: " + e);
                }
            },
            onCloseWindow: () => {},
            onWindowTitleChange: () => {},
        };
        try { Services.wm.addListener(listener); }
        catch (e) {
            Zotero.debug("[Weavero] wm.addListener err: " + e);
            return;
        }
        this._noteWindowListener = listener;
        this._dbg("[Weavero] note-window listener registered");
    }

    _teardownNoteWindowListener() {
        if (!this._noteWindowListener) return;
        try { Services.wm.removeListener(this._noteWindowListener); }
        catch (e) {}
        this._noteWindowListener = null;
    }

    /** Revert decorated note surfaces to plain text. Mirrors
     *  `_stripRightPane` / `_stripItemsList`. Called when the user
     *  unticks Notes, and at destroy(). */
    _stripNotes() {
        try {
            const main = Zotero.getMainWindow().document;
            const docs = [main];
            try {
                const winEnum = Services.wm.getEnumerator("zotero:note");
                while (winEnum.hasMoreElements()) {
                    const w = winEnum.getNext() as any;
                    if (w && w.document) docs.push(w.document);
                }
            } catch (e) {}
            for (const doc of docs) {
                if (!doc) continue;
                // Items-tree note rows + right-pane notes-box labels
                for (const span of doc.querySelectorAll(
                        "note-row .note-content .wv-url-span,"
                        + " notes-box .body .row .label .wv-url-span") as any) {
                    span.replaceWith(doc.createTextNode(span.textContent || ""));
                }
                // Note editor iframes (right-pane + pop-out): we
                // never modify the editor's DOM (CSS-only colouring
                // via attribute selectors), so all that's needed is
                // removing our injected stylesheet — the editor's
                // own anchor colours come back automatically.
                // Plus detach the capture-phase listeners we wired
                // on `idoc` so plugin-disable / strip-on-toggle-off
                // doesn't leave stale handlers intercepting clicks.
                for (const ne of doc.querySelectorAll("note-editor") as any) {
                    try {
                        const iframe = ne.querySelector("iframe#editor-view")
                            || ne.querySelector("iframe");
                        const idoc = iframe && iframe.contentDocument;
                        if (!idoc) continue;
                        const s = idoc.getElementById("weavero-note-editor-styles");
                        if (s) s.remove();
                        // Detach our listeners if we have them recorded.
                        if (this._noteEditorObservers
                                && this._noteEditorObservers.has(ne)) {
                            const entry = this._noteEditorObservers.get(ne);
                            const L = entry && entry.listeners;
                            if (L) {
                                try { idoc.removeEventListener("pointerdown", L.onPointerDown, true); } catch(e) {}
                                try { idoc.removeEventListener("mousedown",   L.onMouseDown,   true); } catch(e) {}
                                try { idoc.removeEventListener("mouseup",     L.onMouseUp,     true); } catch(e) {}
                                try { idoc.removeEventListener("auxclick",    L.onAuxClick,    true); } catch(e) {}
                                try { idoc.removeEventListener("click",       L.onClick,       true); } catch(e) {}
                                try { idoc.removeEventListener("contextmenu", L.onContext,     true); } catch(e) {}
                                try { idoc.removeEventListener("mousemove",   L.onMove,        true); } catch(e) {}
                                try { idoc.removeEventListener("mouseout",    L.onOut,         true); } catch(e) {}
                            }
                            // Disconnect the popup-mount observer so
                            // it doesn't fire after the editor is
                            // torn down (or after plugin disable).
                            if (entry && entry.popupMo) {
                                try { entry.popupMo.disconnect(); } catch(e) {}
                            }
                            this._noteEditorObservers.delete(ne);
                        }
                    } catch (e) {}
                }
                // Drop the hover tooltip panel + suppress flag too.
                try {
                    const tipPanel: any = doc.getElementById(
                        "wv-note-link-tooltip-panel");
                    if (tipPanel) {
                        try { tipPanel.hidePopup(); } catch(e) {}
                        try { tipPanel.remove(); } catch(e) {}
                    }
                    // Old `<div>` widget id from a pre-XUL-panel build.
                    const oldTip = doc.getElementById("wv-note-link-tooltip");
                    if (oldTip) oldTip.remove();
                } catch(e) {}
                // The timer was scheduled with the iframe window's
                // setTimeout — that window is being torn down with
                // the iframe, so the timer queue goes with it. Just
                // null the handle so a stale id doesn't linger.
                this._noteLinkTooltipTimer = null;
            }
        } catch (e) {
            Zotero.debug("[Weavero] _stripNotes err: " + e);
        }
    }
}

const _noteDescriptors = Object.getOwnPropertyDescriptors(_NoteEditorMixin.prototype);
delete (_noteDescriptors as any).constructor;
export const noteEditorMethods = _noteDescriptors;
