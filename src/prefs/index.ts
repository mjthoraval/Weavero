import { wvSetBoolAttr } from "../lib/dom";
import { wvNativeWindows } from "../lib/windows";
import { wvStr } from "../lib/l10n";
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

    /** New Fluent arguments for a pane element, keeping its id (weavero.ftl;
     *  the pane links the file). The pane's strings are Fluent messages, so
     *  a label that follows a setting is re-pointed, never overwritten: an
     *  English label written here would race the pane's own translation. */
    function setL10n(el, id, args) {
        if (!el) return;
        try {
            const l10n = el.ownerDocument && el.ownerDocument.l10n;
            if (l10n) l10n.setAttributes(el, id || el.getAttribute("data-l10n-id"), args);
        } catch (e) { dbg("l10n set err: " + e); }
    }

    /** A number <input> <-> int pref, clamped to [min, max]. `unit` is the
     *  span after the box ("lines", "levels"): its plural follows the number. */
    function bindIntInput(inp, key, min, max, dflt, unit?) {
        if (!inp || inp._wvBound) return;
        inp._wvBound = true;
        let v = dflt;
        try { const p = parseInt(String(Zotero.Prefs.get(key)), 10); if (p >= min && p <= max) v = p; } catch (e) {}
        inp.value = String(v);
        setL10n(unit, null, { count: v });
        const write = () => {
            let n = parseInt(inp.value, 10);
            if (!(n >= min)) n = min;
            if (n > max) n = max;
            inp.value = String(n);
            setL10n(unit, null, { count: n });
            try { Zotero.Prefs.set(key, n); } catch (e) { dbg(key + " write err: " + e); }
        };
        inp.addEventListener("change", write);
    }

    /** Ctrl+click split-orientation radiogroup <-> char pref
     *  `weavero.ctrlClickSplit` ("horizontal" default | "vertical"). */
    function bindSplit(rg) {
        bindCharRadio(rg, "weavero.ctrlClickSplit", ["horizontal", "vertical"], "horizontal");
    }

    /** Settings that only exist on Windows (per-window taskbar icons /
     *  buttons go through Win32 calls and are gated on Zotero.isWin in
     *  tabs.ts) stayed clickable on Linux and did nothing (2026-10-01).
     *  Off Windows: grey the checkbox and show the "Windows only" note
     *  instead. Guard: test/prefs-platform.spec.js. */
    function bindPlatformOnly(doc) {
        const onWin = !!(Zotero as any).isWin;
        for (const el of Array.from(doc.querySelectorAll('[data-wv-platform="win"]')) as any[]) {
            el.classList.toggle("wv-platform-off", !onWin);
            const note = el.querySelector(".wv-platform-note");
            if (note) wvSetBoolAttr(note, "hidden", onWin);
            const cb = el.querySelector("checkbox");
            if (cb) wvSetBoolAttr(cb, "disabled", !onWin);
        }
    }

    /** A Zotero with its own windows (zotero#6035): the options for Weavero's
     *  go, a line says why. `data-wv-native-off` marks them -- the reader and
     *  note window options too: a document or note opened in a window is a
     *  main window there, Weavero's reader and note windows never open (MJT
     *  2026-11-26, "leftovers in Z11 in the settings for 'Reader window'").
     *  `data-wv-native-l10n` names the words a description takes there, without
     *  those windows. A row that stays with other masters there names them in
     *  `data-wv-native-gate` (the Advanced Search window's two: Multiple main
     *  windows is hidden, so its "off" must not grey them). Runs BEFORE
     *  bindMasterDisable, which reads data-gated-by once. Guard:
     *  test/prefs-native-windows.spec.js. */
    function bindNativeWindows(doc) {
        if (!wvNativeWindows()) return;
        for (const el of Array.from(doc.querySelectorAll("[data-wv-native-off]")) as any[]) {
            el.style.setProperty("display", "none", "important");
        }
        const swapped: any[] = [];
        for (const el of Array.from(doc.querySelectorAll("[data-wv-native-l10n]")) as any[]) {
            el.setAttribute("data-l10n-id", el.getAttribute("data-wv-native-l10n"));
            swapped.push(el);
        }
        try { if (swapped.length && doc.l10n) doc.l10n.translateElements(swapped); } catch (e) {}
        for (const el of Array.from(doc.querySelectorAll("[data-wv-native-gate]")) as any[]) {
            el.setAttribute("data-gated-by", el.getAttribute("data-wv-native-gate"));
        }
        const note = doc.getElementById("wv-native-windows-note");
        if (note) wvSetBoolAttr(note, "hidden", false);
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
        // [data-gated-by] may list several prefs (a search block under a
        // sub-section: the section master AND the sub-section's): greyed
        // while ANY of them is off.
        for (const el of Array.from(doc.querySelectorAll("[data-gated-by]")) as any[]) {
            items.push({ el, pref: el.getAttribute("data-gated-by") });
        }
        if (!items.length) return;
        const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
        const observers: any[] = [];
        const isOn = (pref) => {
            try {
                const v = Zotero.Prefs.get("weavero." + pref);
                return v === undefined ? true : !!v;
            } catch (e) { return true; }
        };
        const sync = (el, prefs: string[]) => {
            el.classList.toggle("wv-disabled", !prefs.every(isOn));
        };
        for (const { el, pref } of items) {
            if (!pref || el._wvMasterBound) continue;
            el._wvMasterBound = true;
            const prefs = String(pref).split(/\s+/).filter(Boolean);
            sync(el, prefs);
            for (const one of prefs) {
                try {
                    const full = PREFIX + one;
                    const obs = {
                        observe: (_s, _t, data) => { if (data === full) sync(el, prefs); }
                    };
                    Services.prefs.addObserver(full, obs, false);
                    observers.push({ full, obs });
                } catch (e) { dbg("master observer err: " + e); }
            }
        }
        const unloadAt = paneUnloadTarget(doc) || win;
        if (unloadAt && observers.length) {
            unloadAt.addEventListener("unload", () => {
                for (const o of observers) {
                    try { Services.prefs.removeObserver(o.full, o.obs); } catch (e) {}
                }
            }, { once: true });
        }
    }

    /** Where this pane hears its own close. Zotero sends `unload` to each
     *  top-level element of a plugin pane and THEN nukes the pane's sandbox
     *  (Zotero_Preferences.onUnload); a listener on the window's `unload` runs
     *  after that, into a dead object: every close of Settings logged a
     *  sourceless "can't access dead object", the pref observers stayed, and
     *  the next change of a watched pref logged one more per gated element
     *  (found 2026-11-15 by the Zutilo x Weavero check). The pane's single
     *  top-level element is its `.main-section`, the section nav's parent. */
    function paneUnloadTarget(doc) {
        const nav: any = doc.querySelector(".wv-nav");
        return (nav && nav.parentElement) || null;
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
        // Sections are split into search blocks (.wv-block): track them too,
        // or the strip stops following the scroll inside a long section.
        const groupboxes = Array.from(mainSec.children).filter(
            (g: any) => g.localName === "groupbox"
                || (g.classList && g.classList.contains("wv-block"))) as any[];
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
        const navUnloadAt = mainSec || view0;   // the pane's top-level element: see paneUnloadTarget
        if (navUnloadAt && masterObs.length) {
            navUnloadAt.addEventListener("unload", () => {
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
            const pref = cb ? (cb.getAttribute("preference") || "").replace(PREFIX, "") : "";
            // A section without a master switch (Backups: its actions work
            // whatever its settings say) folds the blocks that name it in
            // data-wv-in, and keeps its fold under its header key.
            const headKey = gb.getAttribute("data-wv-head") || "";
            const master = pref || headKey;
            const sibs = pref
                ? (Array.from(doc.querySelectorAll('[data-gated-by~="' + pref + '"]')) as any[])
                : headKey ? (Array.from(doc.querySelectorAll('[data-wv-in~="' + headKey + '"]')) as any[]) : [];
            let arrow: any = head.querySelector(".wv-collapse-arrow");
            if (!arrow) {
                arrow = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
                arrow.className = "wv-collapse-arrow";
                arrow.textContent = "▸";   // ▸
                // Keyboard-operable: focusable + Enter/Space toggle (below).
                arrow.setAttribute("tabindex", "0");
                arrow.setAttribute("role", "button");
                arrow.setAttribute("aria-label", wvStr("weavero-pref-section-toggle"));
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

    /** Search blocks: Zotero's Settings search hides every direct child of
     *  the pane with no match, so each setting is its own block and its
     *  section / sub-section / group header ([data-wv-head="K"]) is another.
     *  Keep a header shown while any block under it ([data-wv-in~="K"])
     *  survives the search -- a CSS :has() rule per key, so there is no race
     *  with Zotero's async, root-by-root search pass. Zotero's own rule is
     *  `.hidden-by-search { display: none !important }`; the higher
     *  specificity here wins, and `revert` restores the element's own
     *  display. A header with no surviving block stays hidden, so a search
     *  with no Weavero match still hides the whole pane. */
    function bindSearchHeaders(doc) {
        const ms: any = wvMainSection(doc);
        if (!ms || ms._wvSearchHeadBound) return;
        ms._wvSearchHeadBound = true;
        const keys = Array.from(new Set((Array.from(ms.querySelectorAll("[data-wv-head]")) as any[])
            .map((e) => e.getAttribute("data-wv-head")).filter(Boolean)));
        if (!keys.length) return;
        const rules = keys.map((k) =>
            `.main-section > [data-wv-head="${k}"].hidden-by-search:has(~ [data-wv-in~="${k}"]:not(.hidden-by-search))`
            + " { display: revert !important; }").join("\n")
            // The reverse, for blocks that are the master switch's own scope
            // (`data-wv-with`, e.g. Hide Title Bar's "Apply to" row): shown
            // whenever their header itself matches -- a search for "hide
            // title" showed the switch without the windows it applies to
            // (MJT 2026-10-05).
            + "\n" + keys.map((k) =>
                `.main-section > [data-wv-head="${k}"]:not(.hidden-by-search) ~ [data-wv-with~="${k}"].hidden-by-search`
                + " { display: revert !important; }").join("\n");
        // Into the pane's existing <style>: a new element in .main-section
        // would be one more search root of its own.
        const st: any = ms.querySelector("style");
        if (st) st.textContent += "\n" + rules;
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

    /** Outline text size: radios for the mode + a px dropdown for Fixed,
     *  both writing the one pref `weavero.outlineTextSize`. */
    function bindOutlineTextSize(doc) {
        const rg: any = doc.getElementById("wv-outline-textsize-mode");
        const ml: any = doc.getElementById("wv-outline-textsize-px");
        if (!rg || !ml || rg._wvBound) return;
        rg._wvBound = true;
        const FIXED = ["8", "9", "10", "11", "12", "13", "14", "15", "16", "18", "20", "24"];
        const plugin: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
        let v = "zotero";
        try { v = String(Zotero.Prefs.get("weavero.outlineTextSize") || "zotero"); } catch (e) {}
        try { if (plugin && plugin._wvOutlineTextSizeNorm) v = plugin._wvOutlineTextSizeNorm(v) || "zotero"; } catch (e) {}
        // Current sizes in the two Zotero labels (weavero.ftl's -px messages).
        try {
            if (plugin && plugin._wvOutlineSizePx) {
                for (const r of Array.from(rg.querySelectorAll("radio")) as any[]) {
                    const m = r.getAttribute("value");
                    if (m === "zotero") setL10n(r, "weavero-pref-outline-size-zotero-px", { px: plugin._wvOutlineSizePx("zotero") });
                    if (m === "itemPane") setL10n(r, "weavero-pref-outline-size-item-pane-px", { px: plugin._wvOutlineSizePx("itemPane") });
                }
            }
        } catch (e) {}
        const fixed = FIXED.includes(v);
        rg.value = fixed ? "fixed" : v;
        ml.value = fixed ? v : "13";
        const write = () => {
            const mode = rg.value;
            const out = mode === "fixed" ? (FIXED.includes(ml.value) ? ml.value : "13") : (mode === "itemPane" ? "itemPane" : "zotero");
            try { Zotero.Prefs.set("weavero.outlineTextSize", out); } catch (e) { dbg("outline size write err: " + e); }
        };
        rg.addEventListener("select", write);
        rg.addEventListener("command", write);
        // Picking a px size means Fixed.
        ml.addEventListener("command", () => { rg.value = "fixed"; write(); });
    }

    /** Outline keyboard shortcuts (issue #51): click a box, press the keys.
     *  Lone modifiers wait for the key; Esc or leaving the box cancels;
     *  Remove clears. A combination someone already uses is refused, with
     *  its owner named (the plugin's _wvOutlineKeyConflict). */
    function bindOutlineKeys(doc) {
        const box: any = doc.getElementById("wv-outline-keys");
        if (!box || box._wvBound) return;
        box._wvBound = true;
        const P = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
        for (const row of Array.from(box.querySelectorAll(".wv-okey-row")) as any[]) {
            const id = row.getAttribute("data-wv-okey");
            const input: any = row.querySelector(".wv-okey-input");
            const clear: any = row.querySelector(".wv-okey-clear");
            const msg: any = row.querySelector(".wv-okey-msg");
            const show = () => {
                const p = P();
                const s = p ? p._wvOutlineKeyGet(id) : null;
                input.value = s ? p._wvOutlineKeyLabel(s) : "";
                input.placeholder = wvStr("weavero-pref-outline-key-none");
                clear.disabled = !s;
            };
            const say = (t: string, bad: boolean) => { msg.textContent = t; msg.classList.toggle("wv-okey-bad", !!bad); };
            show();
            input.addEventListener("focus", () => { input.value = ""; input.placeholder = wvStr("weavero-pref-outline-key-press"); say(wvStr("weavero-pref-outline-key-esc-hint"), false); });
            input.addEventListener("blur", () => { show(); if (!msg.classList.contains("wv-okey-bad")) say("", false); });
            input.addEventListener("keydown", (e: any) => {
                try {
                    if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) return;   // keep Tab for moving on
                    e.preventDefault(); e.stopPropagation();
                    if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) { say("", false); input.blur(); return; }
                    const p = P(); if (!p) return;
                    const s = p._wvOutlineKeySpecFromEvent(e);
                    if (!s) return;   // a modifier alone: wait for the key
                    const owner = p._wvOutlineKeyConflict(s, id);
                    if (owner) { say(wvStr("weavero-pref-outline-key-taken", { keys: p._wvOutlineKeyLabel(s), owner }), true); return; }
                    Zotero.Prefs.set("weavero.outlineKey." + id, JSON.stringify(s));
                    say(wvStr("weavero-pref-outline-key-saved"), false);
                    input.blur();
                } catch (er) { dbg("outline key record err: " + er); }
            });
            clear.addEventListener("click", () => {
                try { Zotero.Prefs.set("weavero.outlineKey." + id, ""); } catch (er) {}
                say(wvStr("weavero-pref-outline-key-removed"), false);
                show();
            });
        }
    }

    // The item pane sections' Settings grid (the levels' defaults and the
    // "always shown" pins, dev.112-161) is gone from the pane (MJT
    // 2026-11-03, "Remove these settings. They are just confusing at the
    // moment, so I will just design the default first"); the prefs stay,
    // read by pane-scope.ts, at their table defaults.

    /** "Up to 2 lines" reads wrong under Fixed height, which is exactly that many
     *  (MJT 2026-11-06): the lead's message selects on the mode. */
    function bindTitleLinesLead(doc) {
        const rg = doc.getElementById("wv-title-lines");
        const lead = doc.getElementById("wv-title-lines-lead");
        if (!rg || !lead || lead._wvBound) return;
        lead._wvBound = true;
        const show = () => { setL10n(lead, null, { mode: rg.value === "fixed" ? "fixed" : "other" }); };
        rg.addEventListener("select", show);
        rg.addEventListener("command", show);
        show();
    }

    /** "Build Zotero's structure data for all PDFs" (modules/sdt-build.ts,
     *  citations M5): no native binding -- turning it on counts the library and
     *  shows the costs first (the plugin's _wvSbAskOn); off and Stop turn the pref
     *  off. Hidden where the API is missing. A status line (counting, progress and
     *  time left, waiting, paused, done) and Pause / Resume, Stop, refreshed every
     *  second while the pane is open. */
    function bindSdtBuild(doc) {
        const block: any = doc.getElementById("wv-sdt-build-block");
        const cb: any = doc.getElementById("wv-sdt-build");
        if (!block || !cb || cb._wvBound) return;
        cb._wvBound = true;
        const P = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
        const p0: any = P();
        if (!p0 || typeof p0._wvSbApi !== "function" || !p0._wvSbApi()) {
            block.style.setProperty("display", "none", "important");
            return;
        }
        const status: any = doc.getElementById("wv-sdt-build-status");
        const btns: any = doc.getElementById("wv-sdt-build-btns");
        const pause: any = doc.getElementById("wv-sdt-build-pause");
        const stop: any = doc.getElementById("wv-sdt-build-stop");
        const prefOn = (k) => { try { return Zotero.Prefs.get("weavero." + k) === true; } catch (e) { return false; } };
        let lastStatus = "";
        const sync = () => {
            const p: any = P();
            if (!p || typeof p._wvSbStatusL10n !== "function") return;
            const on = prefOn("referencesBuildStructure");
            const zotero = !!p._wvSbZoteroBuilds();
            if (cb.checked !== on) cb.checked = on;
            wvSetBoolAttr(cb, "disabled", zotero || !!p._wvSbAsking);
            const s = p._wvSbStatusL10n();
            const key = s ? s.id + JSON.stringify(s.args || {}) : "";
            if (key !== lastStatus) {
                lastStatus = key;
                if (s) setL10n(status, s.id, s.args || {});
                wvSetBoolAttr(status, "hidden", !s);
            }
            wvSetBoolAttr(btns, "hidden", !on || zotero);
            const want = prefOn("referencesBuildStructurePaused") ? "weavero-sdt-build-resume" : "weavero-sdt-build-pause";
            if (pause.getAttribute("data-l10n-id") !== want) setL10n(pause, want, {});
        };
        cb.addEventListener("command", async () => {
            const p: any = P();
            if (!p) return;
            if (cb.checked) {
                // On only once the costs were shown and confirmed.
                cb.checked = false;
                try { await p._wvSbAskOn(doc.defaultView); } catch (e) { dbg("sdt build ask err: " + e); }
            }
            else p._wvSbTurnOff();
            sync();
        });
        pause.addEventListener("click", () => { const p: any = P(); if (p) p._wvSbSetPaused(!prefOn("referencesBuildStructurePaused")); sync(); });
        stop.addEventListener("click", () => { const p: any = P(); if (p) p._wvSbTurnOff(); sync(); });
        const win: any = doc.defaultView;
        let iv: any = null;
        try { iv = win.setInterval(() => { try { sync(); } catch (e) {} }, 1000); } catch (e) {}
        const unloadAt = paneUnloadTarget(doc) || win;
        if (unloadAt) unloadAt.addEventListener("unload", () => { try { win.clearInterval(iv); } catch (e) {} }, { once: true });
        sync();
        // Bound (the suite waits for it before it clicks).
        block.setAttribute("data-wv-bound", "true");
    }

    /** Remove Built Data (modules/sdt-build.ts, MJT 2026-11-24): the line says what
     *  the built data takes, measured in the background when the pane opens (the
     *  plugin's _wvSbCleanMeasure: "Measuring…" meanwhile, nothing when there is
     *  none); the button asks, then removes (_wvSbCleanAsk); while that runs, its
     *  progress, then what it removed. Shown on every Zotero: without
     *  Zotero.SDT.ensure the build option is hidden, but the Cited by index is
     *  built there too. Refreshed every second while the pane is open. */
    function bindSdtClean(doc) {
        const block: any = doc.getElementById("wv-sdt-clean-block");
        const btn: any = doc.getElementById("wv-sdt-clean");
        if (!block || !btn || btn._wvBound) return;
        btn._wvBound = true;
        const P = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
        const p0: any = P();
        if (!p0 || typeof p0._wvSbCleanMeasure !== "function") {
            block.style.setProperty("display", "none", "important");
            return;
        }
        const line: any = doc.getElementById("wv-sdt-clean-size");
        const result: any = doc.getElementById("wv-sdt-clean-result");
        const last = { line: "", result: "" };
        const show = (el, s, k) => {
            const key = s ? s.id + JSON.stringify(s.args || {}) : "";
            if (key === last[k]) return;
            last[k] = key;
            if (s) setL10n(el, s.id, s.args || {});
            wvSetBoolAttr(el, "hidden", !s);
        };
        const sync = () => {
            const p: any = P();
            if (!p || typeof p._wvSbCleanL10n !== "function") return;
            const s = p._wvSbCleanL10n();
            show(line, s.line, "line");
            show(result, s.result, "result");
            wvSetBoolAttr(btn, "disabled", !!(s.busy || s.empty));
        };
        btn.addEventListener("click", async () => {
            const p: any = P();
            if (!p) return;
            wvSetBoolAttr(btn, "disabled", true);
            try { await p._wvSbCleanAsk(doc.defaultView); } catch (e) { dbg("sdt clean err: " + e); }
            sync();
        });
        try { p0._wvSbCleanMeasure().then(() => { try { sync(); } catch (e) {} }, () => {}); } catch (e) { dbg("sdt measure err: " + e); }
        const win: any = doc.defaultView;
        let iv: any = null;
        try { iv = win.setInterval(() => { try { sync(); } catch (e) {} }, 1000); } catch (e) {}
        const unloadAt = paneUnloadTarget(doc) || win;
        if (unloadAt) unloadAt.addEventListener("unload", () => { try { win.clearInterval(iv); } catch (e) {} }, { once: true });
        sync();
        // Bound (the suite waits for it before it clicks).
        block.setAttribute("data-wv-bound", "true");
    }

    /** Settings -> Feeds: the lists are the plugin's store (feeds/settings.json,
     *  modules/feeds.ts), not prefs. A text area writes its list a moment after
     *  the typing stops and on blur; the names show a live count of My Library
     *  items; Export / Export... / Import... call the plugin. */
    function bindFeeds(doc) {
        const P: any = Zotero.Weavero && (Zotero.Weavero as any).plugin;
        if (!P || typeof P._wvFdSettingsGet !== "function") return;
        const areas: Record<string, string> = { "wv-fd-names": "myNames", "wv-fd-followed": "followed", "wv-fd-alerts": "alerts", "wv-fd-watched": "watched", "wv-fd-cited": "citedPersons" };
        const status: any = doc.getElementById("wv-fd-status");
        const count: any = doc.getElementById("wv-fd-names-count");
        const say = (t) => { if (status) status.textContent = t; };
        const lines = (ta) => String(ta.value || "").split(/\r?\n/).map((s) => s.trim()).filter((s) => s);
        let countSeq = 0;
        const recount = (names) => {
            const seq = ++countSeq;
            P._wvFdCountMine(names).then((n) => {
                if (seq === countSeq && count) count.textContent = wvStr("weavero-pref-feeds-names-count", { count: n }, null);
            }, () => {});
        };
        P._wvFdSettingsGet().then((s) => {
            for (const id of Object.keys(areas)) {
                const ta: any = doc.getElementById(id);
                if (!ta || ta._wvBound) continue;
                ta._wvBound = true;
                ta.value = (s[areas[id]] || []).join("\n");
                let t: any = null;
                const write = () => {
                    if (t) { clearTimeout(t); t = null; }
                    const patch = {};
                    patch[areas[id]] = lines(ta);
                    P._wvFdSettingsSet(patch).catch((e) => dbg("feeds write err: " + e));
                    if (id === "wv-fd-names") recount(lines(ta));
                };
                ta.addEventListener("input", () => {
                    if (t) clearTimeout(t);
                    t = setTimeout(write, 700);
                    if (id === "wv-fd-names") recount(lines(ta));
                });
                ta.addEventListener("change", write);
            }
            recount(s.myNames || []);
        }, (e) => dbg("feeds read err: " + e));
        const btn = (id, run) => {
            const b: any = doc.getElementById(id);
            if (!b || b._wvBound) return;
            b._wvBound = true;
            b.addEventListener("click", () => {
                Promise.resolve().then(run).catch((e) => say(wvStr("weavero-pref-feeds-failed", { error: String(e && e.message || e) }, null)));
            });
        };
        const refill = () => P._wvFdSettingsGet().then((s) => {
            for (const id of Object.keys(areas)) { const ta: any = doc.getElementById(id); if (ta) ta.value = (s[areas[id]] || []).join("\n"); }
        });
        btn("wv-fd-export", async () => { const p = await P._wvFdExport(); say(wvStr("weavero-pref-feeds-exported", { path: p }, null)); });
        btn("wv-fd-export-as", async () => { const p = await P._wvFdExportAs(window); if (p) say(wvStr("weavero-pref-feeds-exported", { path: p }, null)); });
        btn("wv-fd-import", async () => {
            const n = await P._wvFdImportFrom(window);
            if (n === null) return;
            await refill();
            say(wvStr("weavero-pref-feeds-imported", { count: n }, null));
        });
    }

    /** Settings -> Backups (modules/backups.ts): where the backups are, the
     *  last one, a failure, a waiting restore; Back Up Now, Restore… (a list
     *  of the backups, then what restoring the one picked would change, per
     *  store), Export…, Import… (the file's own preview), Open Folder. A restore
     *  or an import is confirmed once (restart now / at the next start /
     *  cancel) and then waits for the next start. Every button goes through
     *  the plugin; nothing here touches a file. */
    function bindBackups(doc) {
        const block: any = doc.getElementById("wv-bk-block");
        if (!block || block._wvBound) return;
        const P = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
        const p0: any = P();
        if (!p0 || typeof p0._wvBkStatus !== "function") return;
        block._wvBound = true;
        const XHTML = "http://www.w3.org/1999/xhtml";
        const $ = (id) => doc.getElementById(id) as any;
        const win: any = doc.defaultView;
        const where = $("wv-bk-where"), last = $("wv-bk-last"), error = $("wv-bk-error"), restored = $("wv-bk-restored");
        const status = $("wv-bk-status"), pending = $("wv-bk-pending"), pendingText = $("wv-bk-pending-text");
        const panel = $("wv-bk-panel"), head = $("wv-bk-panel-head"), list = $("wv-bk-list"), preview = $("wv-bk-preview");
        const optData = $("wv-bk-opt-data"), optSettings = $("wv-bk-opt-settings"), go = $("wv-bk-go");
        const str = (id, args?) => wvStr(id, args || null, null);
        const say = (t) => { status.textContent = t || ""; };
        const nameDate = (p, name) => {
            const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(String(name || ""));
            return m ? p._wvBkDateText(new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()) : String(name || "");
        };
        // The panel: "restore" (a backup of the list) or "import" (a file's source).
        let mode: string | null = null, importSrc: any = null, cached: any = null, seq = 0;
        const refresh = async () => {
            const p: any = P();
            if (!p) return null;
            const st = await p._wvBkStatus();
            where.textContent = str("weavero-pref-backups-where", { path: st.dir });
            last.textContent = st.last
                ? str("weavero-pref-backups-last", { date: p._wvBkDateText(st.last.created), reason: p._wvBkReasonText(st.last), count: st.count, size: p._wvBkSizeText(st.size) })
                : str("weavero-pref-backups-none");
            const err = st.lastError && (!st.last || st.lastError.at > st.last.created) ? st.lastError : null;
            error.hidden = !err;
            if (err) error.textContent = str("weavero-pref-backups-last-error", { date: p._wvBkDateText(err.at), error: p._wvBkProblemText(err.kind) });
            const lr = st.lastRestore;
            restored.hidden = !lr;
            if (lr) {
                restored.textContent = lr.ok
                    ? str("weavero-pref-backups-restored", { date: p._wvBkDateText(lr.at), from: nameDate(p, lr.name), pre: nameDate(p, lr.pre), kind: lr.kind })
                    : str("weavero-pref-backups-restore-failed", { date: nameDate(p, lr.name), problem: String(lr.problem || "") });
            }
            pending.hidden = !st.pending;
            if (st.pending) pendingText.textContent = str("weavero-pref-backups-pending", { date: nameDate(p, st.pending.name), kind: st.pending.kind });
            return st;
        };
        const opts = () => ({ data: !!optData.checked, settings: !!optSettings.checked });
        const showPreview = async () => {
            const my = ++seq;
            const p: any = P();
            preview.textContent = "";
            go.disabled = true;
            if (!p) return;
            let src: any = null;
            if (mode === "import") src = importSrc;
            else {
                const name = list.value;
                if (!name) return;
                if (cached && cached.name === name) src = cached;
                else {
                    say(str("weavero-pref-backups-checking"));
                    src = await p._wvBkSourceOf(name);
                    if (my !== seq) return;
                    if (!src.ok) { say(p._wvBkProblemText(src.problem)); await fillList(); return; }
                    cached = src;
                    say("");
                }
            }
            const o = opts();
            const r = await p._wvBkPreview(src, o);
            if (my !== seq) return;
            preview.textContent = "";
            for (const t of r.lines) {
                const li = doc.createElementNS(XHTML, "li");
                li.textContent = t;
                preview.appendChild(li);
            }
            go.disabled = !(o.data || o.settings);
        };
        const fillList = async () => {
            const p: any = P();
            const st = await refresh();
            if (!p || !st) return false;
            list.textContent = "";
            for (const e of st.list) {
                const o = doc.createElementNS(XHTML, "option");
                o.value = e.name;
                o.textContent = p._wvBkRowText(e);
                list.appendChild(o);
            }
            if (!st.list.length) {
                head.textContent = str("weavero-pref-backups-no-backups");
                list.hidden = true;
                preview.textContent = "";
                go.disabled = true;
                return false;
            }
            head.textContent = str("weavero-pref-backups-pick");
            list.hidden = false;
            list.selectedIndex = 0;
            return true;
        };
        const close = () => { seq++; mode = null; importSrc = null; cached = null; panel.hidden = true; preview.textContent = ""; };
        const run = (id, fn) => {
            const b: any = $(id);
            if (!b) return;
            b.addEventListener("click", () => {
                Promise.resolve().then(fn).catch((e) => { dbg("backups " + id + " err: " + e); say(str("weavero-pref-backups-failed", { error: String(e && e.message || e) })); });
            });
        };
        run("wv-bk-now", async () => {
            const p: any = P();
            if (!p) return;
            say(str("weavero-pref-backups-working"));
            const r = await p._wvBackupNow("manual", { quiet: true });
            say(r.ok ? str("weavero-pref-backups-backed-up", { date: p._wvBkDateText(Date.now()) }) : p._wvBkProblemText(r.kind));
            await refresh();
            if (mode === "restore") { await fillList(); await showPreview(); }
        });
        run("wv-bk-restore", async () => {
            mode = "restore"; importSrc = null; cached = null;
            setL10n(go, "weavero-pref-backups-go-restore", {});
            panel.hidden = false;
            say("");
            if (await fillList()) await showPreview();
        });
        run("wv-bk-import", async () => {
            const p: any = P();
            if (!p) return;
            const path = await p._wvBkPick(win, "open");
            if (!path) return;
            const r = await p._wvBkImportRead(path);
            if (!r.ok) { say(p._wvBkProblemText(r.problem)); return; }
            say("");
            mode = "import"; importSrc = r.source; cached = null;
            list.hidden = true;
            head.textContent = str("weavero-pref-backups-from-file", { file: r.source.file, date: p._wvBkDateText(r.source.created), version: r.source.weaveroVersion });
            setL10n(go, "weavero-pref-backups-go-import", {});
            panel.hidden = false;
            await showPreview();
        });
        run("wv-bk-export", async () => {
            const p: any = P();
            if (!p) return;
            const path = await p._wvBkPick(win, "save");
            if (!path) return;
            const r = await p._wvBkExport(path);
            say(r.ok ? str("weavero-pref-backups-exported", { path }) : p._wvBkProblemText(r.kind));
        });
        run("wv-bk-open", async () => { const p: any = P(); if (p) await p._wvBkOpenFolder(); });
        run("wv-bk-cancel", async () => { close(); say(""); });
        run("wv-bk-go", async () => {
            const p: any = P();
            if (!p || !mode) return;
            const o = opts();
            const what = o.data && o.settings ? "both" : o.data ? "data" : "settings";
            let answer = 2;
            if (mode === "import") {
                answer = p._wvBkAsk(win, { title: str("weavero-backups-ask-import-title"), body: str("weavero-backups-ask-import", { file: importSrc.file, what }) });
                if (answer === 2) return;
                const st = await p._wvBkStageImport(importSrc, o);
                if (!st.ok) { say(p._wvBkProblemText(st.problem)); return; }
            }
            else {
                const name = list.value;
                if (!name) return;
                answer = p._wvBkAsk(win, { title: str("weavero-backups-ask-title"), body: str("weavero-backups-ask-restore", { date: nameDate(p, name), what }) });
                if (answer === 2) return;
                const st = await p._wvBkStageRestore(name, o);
                if (!st.ok) { say(p._wvBkProblemText(st.problem)); await fillList(); return; }
            }
            close();
            await refresh();
            say(str("weavero-pref-backups-staged"));
            if (answer === 0) p._wvBkRestartNow();
        });
        run("wv-bk-pending-restart", async () => { const p: any = P(); if (p) p._wvBkRestartNow(); });
        run("wv-bk-pending-cancel", async () => { const p: any = P(); if (!p) return; await p._wvBkCancelPending(); await refresh(); say(""); });
        list.addEventListener("change", () => { showPreview().catch((e) => dbg("backups preview err: " + e)); });
        for (const cb of [optData, optSettings]) cb.addEventListener("command", () => { showPreview().catch((e) => dbg("backups preview err: " + e)); });
        refresh().catch((e) => dbg("backups status err: " + e)).then(() => block.setAttribute("data-wv-bound", "true"));
    }

    /** Settings -> Extras -> Collections: the collections funnel's default, the libraries
     *  it leaves out (a line the plugin words, coll-funnel.ts _wvCfDefaultLibsText) and their
     *  Reset. Redrawn while the pane is open whenever the default changes (the funnel's Use as
     *  Default, a box above). */
    function bindCollFunnelLibs(doc) {
        const line: any = doc.getElementById("wv-cf-def-libs");
        const btn: any = doc.getElementById("wv-cf-def-libs-reset");
        if (!line || line._wvBound) return;
        line._wvBound = true;
        const P = () => (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
        const draw = () => {
            try {
                const p: any = P();
                if (!p || typeof p._wvCfDefaultLibs !== "function") return;
                const d = p._wvCfDefaultLibs();
                line.textContent = wvStr("weavero-pref-collfunnel-libs", { mode: d.mode, names: d.names }, null);
            }
            catch (e) { dbg("funnel libs draw err: " + e); }
        };
        draw();
        let obs: any = null;
        try { obs = Zotero.Prefs.registerObserver("weavero.collFunnelDefault", draw); } catch (e) {}
        const unloadAt = paneUnloadTarget(doc) || (doc.defaultView || (typeof window !== "undefined" ? window : null));
        if (unloadAt && obs) unloadAt.addEventListener("unload", () => { try { Zotero.Prefs.unregisterObserver(obs); } catch (e) {} }, { once: true });
        if (btn && !btn._wvBound) {
            btn._wvBound = true;
            btn.addEventListener("click", () => {
                try { const p: any = P(); if (p && typeof p._wvCfDefaultResetLibs === "function") p._wvCfDefaultResetLibs(); } catch (e) { dbg("funnel libs reset err: " + e); }
                draw();
            });
        }
    }

    function bindAll(doc) {
        try { bindMode(doc.getElementById("wv-mode")); } catch (e) { dbg("bindMode err: " + e); }
        try { bindSplit(doc.getElementById("wv-ctrlsplit")); } catch (e) { dbg("bindSplit err: " + e); }
        try { bindCharRadio(doc.getElementById("wv-wintitle-name"), "weavero.windowTitleNameMode", ["off", "prefix", "replace"], "off"); } catch (e) { dbg("bindWinTitleName err: " + e); }
        try { bindCharRadio(doc.getElementById("wv-bm-colscroll"), "weavero.bookmarkCollectionScroll", ["top", "native"], "top"); } catch (e) { dbg("bindBmColScroll err: " + e); }
        // Researchers: how each place of the tab writes a name (people3).
        for (const place of ["list", "title", "links", "tree"]) {
            try { bindCharRadio(doc.getElementById("wv-pp-names-" + place), "weavero.people.names." + place, ["last", "first"], "last"); } catch (e) { dbg("bindPeopleNames err: " + e); }
        }
        // Outline text size: Zotero Outline / Zotero Item Pane (radio, both
        // follow View -> Font Size -- labels show their current size) or
        // Fixed + a px size. One pref: "zotero" | "itemPane" | "<px>".
        try { bindOutlineTextSize(doc); } catch (e) { dbg("bindOutlineTextSize err: " + e); }
        try { bindOutlineKeys(doc); } catch (e) { dbg("bindOutlineKeys err: " + e); }
        try { bindIntInput(doc.getElementById("wv-coll-sticky-max"), "weavero.collectionsStickyMax", 1, 10, 7, doc.getElementById("wv-coll-sticky-unit")); } catch (e) { dbg("bindCollStickyMax err: " + e); }
        try { bindCollFunnelLibs(doc); } catch (e) { dbg("bindCollFunnelLibs err: " + e); }
        try { bindCharRadio(doc.getElementById("wv-title-lines"), "weavero.titleLinesMode", ["off", "fixed", "adaptive"], "off"); } catch (e) { dbg("bindTitleLines err: " + e); }
        try { bindIntInput(doc.getElementById("wv-title-lines-count"), "weavero.titleLinesCount", 2, 10, 2, doc.getElementById("wv-title-lines-unit")); } catch (e) { dbg("bindTitleLinesCount err: " + e); }
        try { bindTitleLinesLead(doc); } catch (e) { dbg("bindTitleLinesLead err: " + e); }
        // Native windows first: it re-gates rows bindMasterDisable reads.
        try { bindNativeWindows(doc); } catch (e) { dbg("bindNativeWindows err: " + e); }
        try { bindMasterDisable(doc); } catch (e) { dbg("bindMasterDisable err: " + e); }
        try { bindPlatformOnly(doc); } catch (e) { dbg("bindPlatformOnly err: " + e); }
        try { bindSectionNav(doc); } catch (e) { dbg("bindSectionNav err: " + e); }
        try { bindCollapse(doc); } catch (e) { dbg("bindCollapse err: " + e); }
        try { bindReaderIconPreview(doc); } catch (e) { dbg("bindReaderIconPreview err: " + e); }
        try { bindSearchExpand(doc); } catch (e) { dbg("bindSearchExpand err: " + e); }
        try { bindSearchHeaders(doc); } catch (e) { dbg("bindSearchHeaders err: " + e); }
        try { bindLabelClickGuard(doc); } catch (e) { dbg("bindLabelClickGuard err: " + e); }
        try { bindSdtBuild(doc); } catch (e) { dbg("bindSdtBuild err: " + e); }
        try { bindSdtClean(doc); } catch (e) { dbg("bindSdtClean err: " + e); }
        try { bindFeeds(doc); } catch (e) { dbg("bindFeeds err: " + e); }
        try { bindIntInput(doc.getElementById("wv-bk-keep"), "weavero.backup.keepDaily", 1, 60, 7, doc.getElementById("wv-bk-keep-unit")); } catch (e) { dbg("bindBkKeep err: " + e); }
        try { bindBackups(doc); } catch (e) { dbg("bindBackups err: " + e); }
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
