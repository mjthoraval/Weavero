// Module: preferences pane binding script.
//
// The pane is a native XUL fragment (see prefs.html). Zotero injects it
// DIRECTLY into the Settings window (plugin panes are parsed defaultXUL=true,
// not loaded in an iframe), and runs this script in a Cu.Sandbox whose
// sandboxPrototype IS that window — so `document` is the Settings window's
// document and our pane content lives in it.
//
// Native `<checkbox preference="extensions.zotero.weavero.X" native="true">`
// is two-way bound by Zotero automatically (defaults are registered on the
// default branch by WeaveroPlugin._wvRegisterDefaultPrefs() at startup), so
// this script no longer binds the checkboxes. It only covers the three things
// native binding can't:
//   1. the Display-mode radiogroup  <->  the boolean `weavero.inlineLinks` pref
//   2. the inline/icon dual-write (one "URLs"/"Markdown"/"App links" toggle
//      writes both the inline- and icon-mode prefs)
//   3. master -> children grey-out (fade a section body when its master is off)
//
// Bundled via esbuild from src/prefs/index.ts to addon/prefs.js (the name
// Zotero looks up). esbuild's IIFE wrapper replaces the old `(function(){…})()`.

    const PREFIX = "extensions.zotero.weavero.";

    function dbg(msg) {
        try { Zotero.debug("[Weavero][prefs] " + msg); } catch (e) {}
    }
    dbg("script loaded");

    /** Display-mode radiogroup <-> boolean pref `weavero.inlineLinks`
     *  (true = Inline, false = Icon & popup). Can't use native `preference=`
     *  binding because the pref is a boolean and radio values are strings. */
    function bindMode(rg) {
        if (!rg || rg._wvBound) return;
        rg._wvBound = true;
        let inline = true;
        try {
            const v = Zotero.Prefs.get("weavero.inlineLinks");
            inline = v === undefined ? true : !!v;
        } catch (e) {}
        rg.value = inline ? "inline" : "icon";
        const write = () => {
            try { Zotero.Prefs.set("weavero.inlineLinks", rg.value === "inline"); }
            catch (e) { dbg("mode write err: " + e); }
        };
        rg.addEventListener("select", write);
        rg.addEventListener("command", write);
    }

    /** Radiogroup <-> char pref binding. Native `preference=` binding
     *  can't be used for these: the values are strings, not bools. */
    function bindCharRadio(rg, key, allowed, dflt) {
        if (!rg || rg._wvBound) return;
        rg._wvBound = true;
        let v = dflt;
        try {
            const p = Zotero.Prefs.get(key);
            if (allowed.includes(p)) v = p;
        } catch (e) {}
        rg.value = v;
        const write = () => {
            try { Zotero.Prefs.set(key, allowed.includes(rg.value) ? rg.value : dflt); }
            catch (e) { dbg(key + " write err: " + e); }
        };
        rg.addEventListener("select", write);
        rg.addEventListener("command", write);
    }

    /** Ctrl+click split-orientation radiogroup <-> char pref
     *  `weavero.ctrlClickSplit` ("horizontal" default | "vertical"). */
    function bindSplit(rg) {
        bindCharRadio(rg, "weavero.ctrlClickSplit", ["horizontal", "vertical"], "horizontal");
    }

    /** Dual-write: a `.wv-mirror` checkbox is natively bound to its primary
     *  pref; we also mirror its state into the `data-wv-also` alias pref (the
     *  icon-mode counterpart) so one toggle governs both display modes. */
    function bindMirrors(doc) {
        const boxes = Array.from(doc.querySelectorAll("checkbox.wv-mirror")) as any[];
        for (const cb of boxes) {
            const alias = cb.getAttribute("data-wv-also");
            if (!alias || cb._wvMirrorBound) continue;
            cb._wvMirrorBound = true;
            // Heal any drift between the primary and alias at mount.
            try {
                if (Zotero.Prefs.get("weavero." + alias) !== cb.checked) {
                    Zotero.Prefs.set("weavero." + alias, cb.checked);
                }
            } catch (e) {}
            cb.addEventListener("command", () => {
                try { Zotero.Prefs.set("weavero." + alias, cb.checked); }
                catch (e) { dbg("mirror write err: " + e); }
            });
        }
    }

    /** Master -> children grey-out. Each `.wv-children[data-master]` fades and
     *  blocks pointer events when its master pref is off. Native binding writes
     *  the master pref on toggle; a pref observer keeps the grey-out live. */
    function bindMasterDisable(doc) {
        // Two ways an element is gated by a master pref:
        //   .wv-children[data-master]  — a section's own child container
        //   [data-gated-by]            — a whole sub-section gated by another
        //                                section's master (e.g. the Extras
        //                                sub-sections under "Enable visual extras")
        const items: any[] = [];
        for (const el of Array.from(doc.querySelectorAll(".wv-children[data-master]")) as any[]) {
            items.push({ el, pref: el.getAttribute("data-master") });
        }
        for (const el of Array.from(doc.querySelectorAll("[data-gated-by]")) as any[]) {
            items.push({ el, pref: el.getAttribute("data-gated-by") });
        }
        if (!items.length) return;
        const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
        const observers: any[] = [];
        const sync = (el, pref) => {
            let on = true;
            try {
                const v = Zotero.Prefs.get("weavero." + pref);
                on = v === undefined ? true : !!v;
            } catch (e) {}
            el.classList.toggle("wv-disabled", !on);
        };
        for (const { el, pref } of items) {
            if (!pref || el._wvMasterBound) continue;
            el._wvMasterBound = true;
            sync(el, pref);
            try {
                const full = PREFIX + pref;
                const obs = {
                    observe: (_s, _t, data) => { if (data === full) sync(el, pref); }
                };
                Services.prefs.addObserver(full, obs, false);
                observers.push({ full, obs });
            } catch (e) { dbg("master observer err: " + e); }
        }
        if (win && observers.length) {
            win.addEventListener("unload", () => {
                for (const o of observers) {
                    try { Services.prefs.removeObserver(o.full, o.obs); } catch (e) {}
                }
            }, { once: true });
        }
    }

    /** Sticky section strip (the old design's tabs, as scroll-nav). The
     *  `.wv-nav-tab` buttons each carry a `data-target` groupbox id; clicking
     *  scrolls there. Every groupbox is mapped (by DOM order, between the
     *  target ids) to one of the four groups, and an IntersectionObserver
     *  highlights the tab of the topmost group currently in view. */
    function bindSectionNav(doc) {
        const nav: any = doc.querySelector(".wv-nav");
        if (!nav || nav._wvNavBound) return;
        const tabs = Array.from(nav.querySelectorAll(".wv-nav-tab")) as any[];
        const mainSec = nav.parentElement;   // Weavero's own .main-section
        if (!tabs.length || !mainSec) return;
        nav._wvNavBound = true;
        const targetIds = tabs.map(t => t.getAttribute("data-target"));
        const groupboxes = Array.from(mainSec.children).filter(
            (g: any) => g.localName === "groupbox") as any[];
        // Assign each groupbox a group index = the most recent target id at/above it.
        let gi = 0;
        for (const gb of groupboxes) {
            const idx = targetIds.indexOf(gb.id);
            if (idx !== -1) gi = idx;
            gb._wvGroup = gi;
        }
        // Click a tab -> scroll its target groupbox to the top.
        tabs.forEach((t) => {
            t.addEventListener("click", () => {
                const tgt = doc.getElementById(t.getAttribute("data-target"));
                if (tgt && tgt.scrollIntoView) {
                    try { tgt.scrollIntoView({ block: "start", behavior: "smooth" }); }
                    catch (e) { tgt.scrollIntoView(); }
                }
            });
        });
        // Master on/off status dot per tab: filled green when the section's
        // master toggle is on, hollow when off. Derives the master pref from
        // the target section's header checkbox, and tracks it live.
        const view0: any = doc.defaultView;
        const masterObs: any[] = [];
        tabs.forEach((t) => {
            const tgt = doc.getElementById(t.getAttribute("data-target"));
            const cb: any = tgt && tgt.querySelector(".wv-tophead checkbox[preference]");
            const master = cb ? (cb.getAttribute("preference") || "").replace(PREFIX, "") : "";
            if (!master) return;
            let dot: any = t.querySelector(".wv-nav-dot");
            if (!dot) {
                dot = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
                dot.className = "wv-nav-dot";
                dot.setAttribute("aria-hidden", "true");
                t.insertBefore(dot, t.firstChild);
            }
            const sync = () => {
                let on = true;
                try {
                    const v = Zotero.Prefs.get("weavero." + master);
                    on = v === undefined ? true : !!v;
                } catch (e) {}
                t.classList.toggle("wv-master-off", !on);
            };
            sync();
            try {
                const full = PREFIX + master;
                const obs = { observe: (_s, _t, data) => { if (data === full) sync(); } };
                Services.prefs.addObserver(full, obs, false);
                masterObs.push({ full, obs });
            } catch (e) { dbg("nav master observer err: " + e); }
        });
        if (view0 && masterObs.length) {
            view0.addEventListener("unload", () => {
                for (const o of masterObs) {
                    try { Services.prefs.removeObserver(o.full, o.obs); } catch (e) {}
                }
            }, { once: true });
        }
        const setActive = (i) => tabs.forEach((t, k) => t.classList.toggle("is-active", k === i));
        setActive(0);
        // Scroll-sync: highlight the tab of the topmost group in view.
        try {
            const view: any = doc.defaultView;
            if (view && view.IntersectionObserver) {
                const visible = new Set<any>();
                const io = new view.IntersectionObserver((entries) => {
                    for (const e of entries) {
                        if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target);
                    }
                    for (const gb of groupboxes) {
                        if (visible.has(gb)) { setActive(gb._wvGroup); break; }
                    }
                }, { rootMargin: "-50px 0px -60% 0px", threshold: 0 });
                for (const gb of groupboxes) io.observe(gb);
            }
        } catch (e) { dbg("section nav observer err: " + e); }
    }

    /** Live preview of the over-annotation badges next to the "Icons over
     *  annotations" toggle. Reuses the plugin's real icon builders
     *  (_makeLinkSvg / _makeRelationsSvg) so the preview is pixel-identical to
     *  what the reader draws. Theme: _makeLinkSvg keys off `wv-ui-dark` on the
     *  documentElement, which the prefs window doesn't carry — so set it for
     *  the build when the pane is dark, then restore. */
    function bindReaderIconPreview(doc) {
        const host: any = doc.querySelector(".wv-readericon-preview");
        if (!host || host._wvIconsBuilt) return;
        let plugin: any = null;
        try { plugin = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin; } catch (e) {}
        if (!plugin || typeof plugin._makeLinkSvg !== "function") return;
        host._wvIconsBuilt = true;
        let dark = false;
        try {
            const win: any = doc.defaultView;
            dark = !!(win && win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches);
        } catch (e) {}
        const root = doc.documentElement;
        const added = dark && root && !root.classList.contains("wv-ui-dark");
        if (added) { try { root.classList.add("wv-ui-dark"); } catch (e) {} }
        try {
            host.appendChild(plugin._makeLinkSvg(doc));
            host.appendChild(plugin._makeRelationsSvg(doc));
        } catch (e) { dbg("reader icon preview err: " + e); }
        finally { if (added) { try { root.classList.remove("wv-ui-dark"); } catch (e) {} } }
    }

    /** Weavero's own `.main-section` (the prefs window has one per pane, and a
     *  bare `.main-section` query returns the first/General one). Anchor on a
     *  Weavero-specific element and climb to its section. */
    function wvMainSection(doc) {
        try {
            const anchor = doc.getElementById("wv-sec-links") || doc.querySelector(".wv-nav");
            if (!anchor) return null;
            return anchor.closest ? anchor.closest(".main-section") : anchor.parentElement;
        } catch (e) { return null; }
    }

    /** Per-section collapse arrow. prefs.js inserts a ▸ at the front of each
     *  section header; clicking it (or the title, or Enter/Space when the arrow
     *  is focused) collapses the whole section to just its header — its master
     *  card, body, and any [data-gated-by] sub-sections below it. CSS hides
     *  those while `.wv-collapsed` is set, EXCEPT when the pane carries
     *  `.wv-searching` (see bindSearchExpand), so a search still reveals
     *  everything. The master toggle (right end of the header) is left
     *  untouched — collapsing is purely visual. Collapse state is persisted in
     *  `weavero._prefsCollapsed` (comma-list of master pref names) and restored
     *  on the next open. */
    function bindCollapse(doc) {
        const readSet = () => {
            try {
                const v = Zotero.Prefs.get("weavero._prefsCollapsed");
                return new Set(v ? String(v).split(",").filter(Boolean) : []);
            } catch (e) { return new Set(); }
        };
        const writeSet = (set) => {
            try { Zotero.Prefs.set("weavero._prefsCollapsed", Array.from(set).join(",")); }
            catch (e) { dbg("collapse persist err: " + e); }
        };
        const tops = Array.from(doc.querySelectorAll("groupbox.wv-top")) as any[];
        for (const gb of tops) {
            if (gb._wvCollapseBound) continue;
            const head: any = gb.querySelector(".wv-tophead");
            if (!head) continue;
            gb._wvCollapseBound = true;
            // The section's gated sub-sections (flat siblings) share the
            // header checkbox's master pref via [data-gated-by].
            const cb: any = head.querySelector("checkbox[preference]");
            const master = cb ? (cb.getAttribute("preference") || "").replace(PREFIX, "") : "";
            const sibs = master
                ? (Array.from(doc.querySelectorAll('[data-gated-by="' + master + '"]')) as any[])
                : [];
            let arrow: any = head.querySelector(".wv-collapse-arrow");
            if (!arrow) {
                arrow = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
                arrow.className = "wv-collapse-arrow";
                arrow.textContent = "▸";   // ▸
                // Keyboard-operable: focusable + Enter/Space toggle (below).
                arrow.setAttribute("tabindex", "0");
                arrow.setAttribute("role", "button");
                arrow.setAttribute("aria-label", "Collapse or expand this section");
                head.insertBefore(arrow, head.firstChild);
            }
            const apply = (collapsed) => {
                gb.classList.toggle("wv-collapsed", collapsed);
                for (const s of sibs) s.classList.toggle("wv-collapsed-sib", collapsed);
                arrow.setAttribute("aria-expanded", String(!collapsed));
            };
            // Restore persisted state on mount.
            apply(master ? readSet().has(master) : false);
            const toggle = () => {
                const collapsed = !gb.classList.contains("wv-collapsed");
                apply(collapsed);
                if (master) {
                    const set = readSet();
                    if (collapsed) set.add(master); else set.delete(master);
                    writeSet(set);
                }
            };
            arrow.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
            arrow.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
                    e.preventDefault(); e.stopPropagation(); toggle();
                }
            });
            const h2: any = head.querySelector("h2");
            if (h2) h2.addEventListener("click", toggle);
        }
    }

    /** Reveal matches inside a collapsed section. Zotero's search highlights a
     *  match but never opens a <details>, so while the Settings search box has
     *  text we force every `.wv-collapsible` open (App link schemes) AND mark
     *  the pane `.wv-searching` so the collapse CSS stops hiding collapsed
     *  sections; when it's cleared we undo both. `document` is the prefs window,
     *  so the search field is reachable directly. */
    function bindSearchExpand(doc) {
        let sf: any = null;
        try { sf = document.getElementById("prefs-search"); } catch (e) {}
        if (!sf || sf._wvExpandBound) return;
        sf._wvExpandBound = true;
        const apply = () => {
            try {
                const active = !!(sf.value && String(sf.value).trim());
                const ms = wvMainSection(doc);
                if (ms) ms.classList.toggle("wv-searching", active);
                const items = doc.querySelectorAll("details.wv-collapsible");
                for (const dt of items as any) {
                    if (active) {
                        if (!dt.open) { dt.dataset.wvForcedOpen = "1"; dt.open = true; }
                    } else if (dt.dataset.wvForcedOpen) {
                        dt.open = false;
                        delete dt.dataset.wvForcedOpen;
                    }
                }
            } catch (e) { dbg("searchExpand err: " + e); }
        };
        sf.addEventListener("command", apply);
        sf.addEventListener("input", apply);
        apply();   // sync now in case the pane mounts with a search already typed
    }

    /** Don't toggle a checkbox / radio when the user was SELECTING its label
     *  text (drag-to-select, so it can be copied). Native XUL toggles on the
     *  mouseup `click`; if the gesture moved the pointer or left a non-empty
     *  selection, swallow that click in CAPTURE phase (on the pane root, before
     *  it reaches the checkbox) so the toggle is suppressed but the selection
     *  stays. A plain click (no movement, collapsed selection) still toggles. */
    function bindLabelClickGuard(doc) {
        const root = doc.querySelector(".main-section") || doc.documentElement;
        if (!root || root._wvLabelGuard) return;
        root._wvLabelGuard = true;
        let downX = 0, downY = 0, onLabel = false;
        root.addEventListener("mousedown", (e: any) => {
            try {
                downX = e.screenX; downY = e.screenY;
                onLabel = !!(e.target && e.target.closest
                    && e.target.closest(".checkbox-label, .radio-label"));
            } catch (er) { onLabel = false; }
        }, true);
        root.addEventListener("click", (e: any) => {
            if (!onLabel) return;
            let moved = 999, hasSel = false;
            try { moved = Math.abs(e.screenX - downX) + Math.abs(e.screenY - downY); } catch (er) {}
            try {
                const sel = (doc.defaultView || (typeof window !== "undefined" ? window : null));
                const s = sel && sel.getSelection && sel.getSelection();
                hasSel = !!(s && !s.isCollapsed && String(s).length);
            } catch (er) {}
            if (moved > 4 || hasSel) {
                try { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } catch (er) {}
            }
        }, true);
    }

    function bindAll(doc) {
        try { bindMode(doc.getElementById("wv-mode")); } catch (e) { dbg("bindMode err: " + e); }
        try { bindSplit(doc.getElementById("wv-ctrlsplit")); } catch (e) { dbg("bindSplit err: " + e); }
        try { bindCharRadio(doc.getElementById("wv-wintitle-name"), "weavero.windowTitleNameMode", ["off", "prefix", "replace"], "off"); } catch (e) { dbg("bindWinTitleName err: " + e); }
        try { bindMirrors(doc); } catch (e) { dbg("bindMirrors err: " + e); }
        try { bindMasterDisable(doc); } catch (e) { dbg("bindMasterDisable err: " + e); }
        try { bindSectionNav(doc); } catch (e) { dbg("bindSectionNav err: " + e); }
        try { bindCollapse(doc); } catch (e) { dbg("bindCollapse err: " + e); }
        try { bindReaderIconPreview(doc); } catch (e) { dbg("bindReaderIconPreview err: " + e); }
        try { bindSearchExpand(doc); } catch (e) { dbg("bindSearchExpand err: " + e); }
        try { bindLabelClickGuard(doc); } catch (e) { dbg("bindLabelClickGuard err: " + e); }
    }

    /** Zotero runs pane scripts BEFORE appending the pane fragment, so our
     *  elements don't exist yet on first run. Poll for the `#wv-mode` marker
     *  (~3 s), then bind. Zotero also loads this script once with no window
     *  (during setDefaultPrefs) — skip that. */
    function start(retries) {
        let rg: any = null;
        try { rg = document.getElementById("wv-mode"); } catch (e) {}
        if (rg) { bindAll(document); dbg("bound (retry " + (60 - retries) + ")"); return; }
        if (retries > 0) setTimeout(() => start(retries - 1), 50);
        else dbg("gave up — #wv-mode never appeared");
    }
    if (typeof document !== "undefined") {
        start(60);
    }
