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
        const groups = Array.from(
            doc.querySelectorAll(".wv-children[data-master]")) as any[];
        if (!groups.length) return;
        const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
        const observers: any[] = [];
        const sync = (el, master) => {
            let on = true;
            try {
                const v = Zotero.Prefs.get("weavero." + master);
                on = v === undefined ? true : !!v;
            } catch (e) {}
            el.classList.toggle("wv-disabled", !on);
        };
        for (const el of groups) {
            if (el._wvMasterBound) continue;
            el._wvMasterBound = true;
            const master = el.getAttribute("data-master");
            if (!master) continue;
            sync(el, master);
            try {
                const full = PREFIX + master;
                const obs = {
                    observe: (_s, _t, data) => { if (data === full) sync(el, master); }
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

    function bindAll(doc) {
        try { bindMode(doc.getElementById("wv-mode")); } catch (e) { dbg("bindMode err: " + e); }
        try { bindMirrors(doc); } catch (e) { dbg("bindMirrors err: " + e); }
        try { bindMasterDisable(doc); } catch (e) { dbg("bindMasterDisable err: " + e); }
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
