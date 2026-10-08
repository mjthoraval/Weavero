/* global after, describe, it, assert, Zotero, Services */

// Shared helpers for the suite (survey 2026-10-06 §6, step 5). Every spec
// file is a <script> in ONE runner page, so a global defined here, in the
// first file the bundler stages (000-), is in scope for all of them:
// `wvT.<helper>` replaces the per-file copies (~25 sleep / 10 waitFor /
// 7 minimalPDFBytes before). Specs stay self-contained in the sense the
// targeted runner needs (no relative imports) -- a global, not a module.
//
// Skip discipline (same survey): a missing plugin, method or constant is a
// FAILURE (`wvT.absent`), never a skip -- 163 guards used to skip exactly
// when the regression happened, and nothing counted pending tests.
// `this.skip()` is for platform / version / runner reasons only, and
// every pending test must match the allowlist below (reason included):
// the root `after` hook fails the run on any other.

(function () {
    const tempFiles = [];

    const wvT = {
        /** The live plugin, or null. */
        plugin() { return (Zotero.Weavero && Zotero.Weavero.plugin) || null; },
        /** The shared helpers the plugin publishes (src/lib), or null. */
        lib() { return (Zotero.Weavero && Zotero.Weavero.lib) || null; },
        win() { return Zotero.getMainWindow(); },

        /** Fail loudly: a plugin surface a spec needs is not there. */
        absent(what) {
            throw new Error("Weavero surface absent: " + what
                + " -- a regression or a rename, not a reason to skip");
        },
        /** The plugin method `name`, or a failure. */
        method(name) {
            const p = wvT.plugin();
            if (!p) wvT.absent("plugin");
            if (typeof p[name] !== "function") wvT.absent("plugin." + name);
            return p[name];
        },
        /** A plugin method's source, for source contracts. */
        src(name) { return String(wvT.method(name)); },

        sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
        /** Poll `cb` until truthy (its value) or `timeout` ms (null). */
        async waitFor(cb, timeout = 15000, interval = 150) {
            const start = Date.now();
            for (;;) {
                let v = null;
                try { v = cb(); } catch (e) {}
                if (v) return v;
                if (Date.now() - start > timeout) return null;
                await wvT.sleep(interval);
            }
        },

        /** Run `fn` with the weavero pref `key` set to `value`, then put the
         *  pref back the way it was: a user value is restored, a defaulted
         *  pref is cleared (never written as a user value), and a pref with
         *  neither keeps the test's value -- Zotero.Prefs.set cannot recreate
         *  a cleared pref that has no default (NS_ERROR_UNEXPECTED until
         *  restart), which would break every later spec touching it. */
        async withPref(key, value, fn) {
            const B = Services.prefs.getBranch("extensions.zotero.");
            const D = Services.prefs.getDefaultBranch("extensions.zotero.");
            const hadUser = B.prefHasUserValue(key);
            const had = Zotero.Prefs.get(key);
            try {
                Zotero.Prefs.set(key, value);
                return await fn();
            }
            finally {
                try {
                    if (hadUser) Zotero.Prefs.set(key, had);
                    else if (D.getPrefType(key) !== D.PREF_INVALID) Zotero.Prefs.clear(key);
                    else if (had !== undefined) Zotero.Prefs.set(key, had);
                } catch (e) {}
            }
        },

        /** A one-page PDF with correct xref offsets, so pdf.js opens it
         *  without recovery heuristics. No text content. */
        minimalPDFBytes() {
            const objs = [
                "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
                "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
                "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n",
            ];
            let body = "%PDF-1.4\n";
            const offsets = [];
            for (const o of objs) { offsets.push(body.length); body += o; }
            const xrefPos = body.length;
            let xref = "xref\n0 4\n0000000000 65535 f \n";
            for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
            const trailer = "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n";
            return body + xref + trailer;
        },
        /** Import that PDF as a standalone attachment (the temp file is
         *  removed at the end of the run). Returns the attachment item. */
        async createTestPDFItem(name, opts) {
            const path = PathUtils.join(PathUtils.tempDir, (name || "wv-test") + "-" + Date.now() + ".pdf");
            await IOUtils.writeUTF8(path, wvT.minimalPDFBytes());
            tempFiles.push(path);
            const file = Zotero.File.pathToFile(path);
            const att = await Zotero.Attachments.importFromFile(Object.assign({ file }, opts || {}));
            return att;
        },
        /** A saved item of `type` with `fields` set, in the user library. */
        async createItem(type, fields) {
            const it = new Zotero.Item(type || "journalArticle");
            it.libraryID = Zotero.Libraries.userLibraryID;
            for (const k of Object.keys(fields || {})) it.setField(k, fields[k]);
            await it.saveTx();
            return it;
        },
        /** Erase items, ignoring ones already gone. */
        async erase(...items) {
            for (const it of items) { try { if (it) await it.eraseTx(); } catch (e) {} }
        },

        /** Drop readers whose window is gone from Zotero.Reader._readers
         *  (a previous spec's plain window close can leave one for a beat;
         *  the natives deref its dead iframe). */
        purgeDeadReaders() {
            try {
                const rs = (Zotero.Reader && Zotero.Reader._readers) || [];
                for (let i = rs.length - 1; i >= 0; i--) {
                    let dead = false;
                    try { const r = rs[i]; dead = !r || !r._window || r._window.closed; }
                    catch (e) { dead = true; }
                    if (dead) rs.splice(i, 1);
                }
            } catch (e) {}
        },

        /** Pending tests this run may legitimately have, by full title. */
        PENDING_ALLOWLIST: [
            { re: /^Weavero — plugin compat: /, why: "companion plugin not installed in this run (npm run test:compat installs it)" },
            // Nested suites: a full title starts with the OUTER describe's.
            { re: /^Weavero — context-menu handlers ignore bubbled submenu events /, why: "popups do not open in this runner window, or no bookmarkable row is selected" },
            { re: /^Weavero — items-list header contributes no intrinsic width its max-content width/, why: "the desktop keeps the runner's window hidden (measured on CI)" },
            { re: /^Weavero — column picker on macOS .* is not installed off macOS$/, why: "platform: the case is for non-macOS and the run is on macOS" },
            { re: /^Weavero -- Plugins Manager title bar is one row on every platform /, why: "platform: macOS, or a display that refuses to maximize" },
            { re: / \(Windows\)$/, why: "platform: Windows only" },
            { re: /^Weavero — tab-level undo choice a NEW main window gets the Edit hook/, why: "platform: Windows only, multi-main on" },
            { re: /^Weavero — window identity, lone window/, why: "needs the lone-window case" },
        ],
    };
    globalThis.wvT = wvT;

    // ---- the run's own hygiene and discipline ------------------------------

    before(async function () {
        // Zotero's OWN readiness, beyond the plugin's: on a fresh profile the
        // bundled files (translators, styles) install right after startup
        // with long DB writes, the main window's pane comes up on its own
        // promise, and the items tree loads after that. The first spec's
        // `saveTx` waited 20 s on the DB lock once the fixed 8 s startup
        // delay became a readiness wait (2026-10-08). Wait for all three.
        this.timeout(90000);
        const Z = /** @type {any} */ (Zotero);
        try { await Z.Schema.schemaUpdatePromise; } catch (e) {}
        try { await Z.uiReadyPromise; } catch (e) {}
        try {
            const win = Zotero.getMainWindow();
            const iv = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (iv && typeof iv.waitForLoad === "function") await iv.waitForLoad();
        } catch (e) {}
        // A no-op transaction: returns once no other transaction holds the DB.
        try { await Zotero.DB.executeTransaction(async () => {}); } catch (e) {}
    });

    after(async function () {
        // Temp files the helpers created.
        for (const p of tempFiles.splice(0)) { try { await IOUtils.remove(p); } catch (e) {} }
    });

    after(function () {
        // Every pending test must be on the allowlist: the suite used to skip
        // silently exactly when a regression removed what a spec needed.
        const root = this.test && this.test.parent;
        if (!root) return;
        const pending = [];
        const walk = (s) => {
            for (const t of s.tests || []) {
                let p = false;
                try { p = !!(t.pending || (typeof t.isPending === "function" && t.isPending())); } catch (e) {}
                if (p) pending.push(t.fullTitle());
            }
            for (const c of s.suites || []) walk(c);
        };
        walk(root);
        const unlisted = pending.filter(title => !wvT.PENDING_ALLOWLIST.some(a => a.re.test(title)));
        // Into the scaffold's log (its `debug` channel), so a run's pending
        // tally is visible next to the pass/fail count.
        const line = "[wv-test] pending: " + pending.length + ", allowlisted: " + (pending.length - unlisted.length) + ", unlisted: " + unlisted.length;
        try { Zotero.debug(line); } catch (e) {}
        try { if (typeof globalThis.debug === "function") globalThis.debug(line); } catch (e) {}
        if (unlisted.length) {
            throw new Error("pending tests without an allowlisted reason (test/000-helpers.spec.js):\n  - "
                + unlisted.join("\n  - "));
        }
    });
})();

describe("Weavero — harness readiness", () => {
    it("the plugin loaded and its init settled before the suite started", () => {
        const Z = /** @type {any} */ (Zotero);
        assert.isOk(Z.Weavero && Z.Weavero.plugin, "Zotero.Weavero.plugin");
        assert.strictEqual(Z._weaveroReady, true, "Zotero._weaveroReady (index.ts raises it when init settles; the runner waits for it)");
        assert.isNotOk(Z._weaveroInitError, "init rejected: " + Z._weaveroInitError);
        assert.isOk(Z.Weavero.lib, "Zotero.Weavero.lib");
        assert.isFunction(globalThis.wvT && globalThis.wvT.absent, "the shared helpers are a global");
    });
});
