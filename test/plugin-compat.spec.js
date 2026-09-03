/* global describe, it, before, after, assert, Zotero, Services, ChromeUtils */

// Plugin-compat tier, phase 1: Default Attachment (PikaPei) — TESTING.md
// roadmap #6, scoped 2026-09-02. Runs ONLY under `node
// test/compat-plugins/run.js` (npm run test:compat): the launcher verifies
// the vendored XPI pins and exports WV_COMPAT_TIER=1 + WV_COMPAT_XPI_DIR.
// In a normal `npm test` this whole file self-skips — the core suite
// stays hermetic.
//
// Why this companion first: it patches Item.prototype.getBestAttachment,
// which Weavero also patches — wrapper COMPOSITION is exactly the class
// of conflict the solo-profile suite can never see. The interop was
// originally verified by installing the real plugin by hand (TESTING.md);
// this locks what that session established:
//   1. the real XPI installs and starts alongside Weavero,
//   2. its pref shape is still { "<parentID>": <attachmentID> } under
//      extensions.zotero.defaultattachment.mappings (Weavero's importer
//      depends on it),
//   3. with both wrappers live, a DA mapping governs getBestAttachment
//      (composition through BOTH wraps — the hand-found bug was a rival
//      taking the outermost slot and dropping ours),
//   4. a Weavero default (the marker tag) governs once the DA mapping is
//      cleared — our wrap is intact underneath,
//   5. the run adds no error-console entries mentioning either plugin.

describe("Weavero — plugin compat: Default Attachment (real XPI)", function () {
    // Real AddonManager installs + item writes: generous budget.
    this.timeout(60000);

    let wv, addon, parent, attA, attB;
    const DA_ID = "default-attachment@zotero-plugin";
    const DA_PREF = "extensions.zotero.defaultattachment.mappings";
    const gated = () => {
        try { return Services.env.get("WV_COMPAT_TIER") === "1"; }
        catch (e) { return false; }
    };

    before(async function () {
        if (!gated()) this.skip();
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();

        const dir = Services.env.get("WV_COMPAT_XPI_DIR");
        const { AddonManager } = ChromeUtils.importESModule(
            "resource://gre/modules/AddonManager.sys.mjs");
        // Already installed from an earlier spec-file edit rerun? Reuse.
        addon = await AddonManager.getAddonByID(DA_ID);
        if (!addon) {
            const file = Zotero.File.pathToFile(
                PathUtils.join(dir, "default-attachment-1.0.0.xpi"));
            const install = await AddonManager.getInstallForFile(file);
            try {
                await install.install();
            }
            catch (e) {
                // Version-blocked (strict_max 9.* on a STABLE 10 binary —
                // betas ignore max-version): a skip with a reason, not a
                // failure of Weavero.
                this.skip();
            }
            addon = await AddonManager.getAddonByID(DA_ID);
        }
        assert.isOk(addon, "companion installed");
        if (!addon.isActive) await addon.enable();
        // Give its bootstrap a beat to patch getBestAttachment.
        await Zotero.Promise.delay(2000);

        // Fixture: parent + two file attachments where the NATIVE arbiter
        // prefers A (PDF beats snapshot in the SQL ordering).
        parent = new Zotero.Item("journalArticle");
        parent.setField("title", "WV compat fixture — default attachment");
        await parent.saveTx();
        const mkAtt = async (name, body, contentType) => {
            const p = PathUtils.join(PathUtils.tempDir, name + "-" + Date.now());
            await IOUtils.writeUTF8(p, body);
            const att = await Zotero.Attachments.importFromFile({
                file: Zotero.File.pathToFile(p), parentItemID: parent.id,
            });
            att.attachmentContentType = contentType;
            await att.saveTx();
            return att;
        };
        // Minimal-but-valid enough for import; content types set explicitly.
        attA = await mkAtt("wv-compat-a.pdf", "%PDF-1.4\n%%EOF\n", "application/pdf");
        attB = await mkAtt("wv-compat-b.txt", "plain body", "text/plain");
    });

    after(async function () {
        try { Zotero.Prefs.clear(DA_PREF, true); } catch (e) {}
        try { if (parent) await parent.eraseTx(); } catch (e) {}
        // The companion stays installed for the remainder of the run —
        // that is the point of the compat tier (core specs then execute
        // under coexistence). The temp profile is discarded afterwards.
    });

    it("companion is active alongside Weavero", function () {
        assert.isTrue(addon.isActive);
        assert.isOk(Zotero.Weavero.plugin, "Weavero alive with companion present");
    });

    it("native arbiter prefers the PDF child (fixture sanity)", async function () {
        const best = await parent.getBestAttachment();
        assert.isOk(best);
        assert.equal(best.id, attA.id);
    });

    it("a DA mapping governs getBestAttachment through BOTH wrappers", async function () {
        // Written the way DA's own UI writes it — one pref, numeric IDs.
        // If PikaPei changes this shape, THIS assert is the tripwire
        // Weavero's importer needs.
        Zotero.Prefs.set(DA_PREF, JSON.stringify({ [parent.id]: attB.id }), true);
        const best = await parent.getBestAttachment();
        assert.isOk(best, "composition returned an attachment");
        assert.equal(best.id, attB.id, "the DA pick wins while its mapping exists");
    });

    it("Weavero's default governs once the DA mapping is cleared", async function () {
        Zotero.Prefs.clear(DA_PREF, true);
        // Weavero's storage is the marker tag on the CHILD.
        attB.addTag(wv.OPEN_BY_DEFAULT_TAG || "▶️ wv-defatt");
        await attB.saveTx();
        const best = await parent.getBestAttachment();
        assert.isOk(best);
        assert.equal(best.id, attB.id, "Weavero's wrap is intact underneath");
        attB.removeTag(wv.OPEN_BY_DEFAULT_TAG || "▶️ wv-defatt");
        await attB.saveTx();
    });

    it("no error-console entries mention either plugin", function () {
        const errs = (Zotero.getErrors(true) || []).map(String);
        const hits = errs.filter(e => /weavero|defaultattachment|default-attachment/i.test(e));
        assert.deepEqual(hits, []);
    });
});

// Phase 3 (pulled forward 2026-09-02 — MJT's pick): Zotero Reading List.
// Weavero's "Read Status" filter dimension exists FOR this plugin: it
// parses the `Read_Status:` line the plugin writes into Extra, and the
// status names/icons from the plugin's own pref. Contract points, each a
// tripwire against the shapes verified in the 1.5.22 bundle:
//   * pref `extensions.zotero.zotero-reading-list.statuses-and-icons-list`
//     in `names;...|icons;...` format (their listToPrefString),
//   * Extra lines `Read_Status: <name>` (+ `Read_Status_Date: <iso>`),
//     appended the way their setItemExtraProperty does,
//   * their bundle still uses those identifiers at all (source scan via
//     the installed add-on's resource URI — fails loudly on a rename).
describe("Weavero — plugin compat: Zotero Reading List (real XPI)", function () {
    this.timeout(60000);

    let wv, addon;
    const RL_ID = "reading-list@hotmail.com";
    const gated = () => {
        try { return Services.env.get("WV_COMPAT_TIER") === "1"; }
        catch (e) { return false; }
    };

    before(async function () {
        if (!gated()) this.skip();
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvReadStatusOf !== "function") this.skip();
        const dir = Services.env.get("WV_COMPAT_XPI_DIR");
        const { AddonManager } = ChromeUtils.importESModule(
            "resource://gre/modules/AddonManager.sys.mjs");
        addon = await AddonManager.getAddonByID(RL_ID);
        if (!addon) {
            const file = Zotero.File.pathToFile(
                PathUtils.join(dir, "zotero-reading-list-1.5.22.xpi"));
            const install = await AddonManager.getInstallForFile(file);
            await install.install();
            addon = await AddonManager.getAddonByID(RL_ID);
        }
        assert.isOk(addon, "companion installed");
        if (!addon.isActive) await addon.enable();
        await Zotero.Promise.delay(2500);   // bootstrap + main-window hook
    });

    it("companion is active alongside Weavero", function () {
        assert.isTrue(addon.isActive);
    });

    it("source tripwire: the bundle still uses Read_Status + the statuses pref", async function () {
        const uri = addon.getResourceURI("chrome/content/scripts/zotero-reading-list.js").spec;
        // jar: URI (packed XPI) — the SYNC URL reader. The async variant
        // fails on jar: with NS_ERROR_FAILURE at nsIURI.username (its
        // channel impl assumes a host-shaped URL; measured live 2026-09-02),
        // and the plain file reader can't see inside the archive at all.
        const text = Zotero.File.getContentsFromURL(uri);
        assert.include(text, 'READ_STATUS_EXTRA_FIELD = "Read_Status"',
            "Extra field name renamed upstream — Weavero parser must follow");
        assert.include(text, '"statuses-and-icons-list"',
            "statuses pref renamed upstream — _wvReadStatuses must follow");
    });

    it("Weavero parses the statuses pref the plugin initialised", function () {
        const statuses = wv._wvReadStatuses();
        const names = statuses.map((s) => s.name);
        assert.includeMembers(names, ["New", "In Progress", "Read"],
            "default status names visible through the pref parser");
        const inProgress = statuses.find((s) => s.name === "In Progress");
        assert.equal(inProgress.icon, "📖", "icon travels with the name");
    });

    it("an Extra line written the plugin's way is read by the filter helper", async function () {
        const item = new Zotero.Item("journalArticle");
        item.setField("title", "WV compat fixture — read status");
        // EXACTLY their setItemExtraProperty output shape (append, one
        // line per field, `Name: value`).
        item.setField("extra",
            "Read_Status: In Progress\nRead_Status_Date: " + new Date().toISOString());
        await item.saveTx();
        try {
            assert.equal(wv._wvReadStatusOf(item), "In Progress");
            const bare = new Zotero.Item("journalArticle");
            bare.setField("title", "WV compat fixture — no status");
            await bare.saveTx();
            try {
                assert.equal(wv._wvReadStatusOf(bare), "", "No Status bucket");
            }
            finally { await bare.eraseTx(); }
        }
        finally { await item.eraseTx(); }
    });

    it("no error-console entries mention the plugin", function () {
        const errs = (Zotero.getErrors(true) || []).map(String);
        assert.deepEqual(errs.filter(e => /reading-list|readinglist/i.test(e)), []);
    });
});

// Phase 2: Annotation Markdown (qrkks/zotero-annotation-markdown). AM owns
// the comment display when installed; Weavero's interop contract
// (reader.ts, hardened 2026-07-17..19 against three real regressions):
//   * YIELD — no .wv-md-preview on cards AM will render (double-render
//     race: 150-card sidebar measured at p95 50ms with both passes on),
//   * but LINKIFY INSIDE — AM's markdown-it has linkify off, so bare URLs
//     in its preview are dead text unless Weavero colourises them
//     (a.wv-link-* anchors inside .annotation-markdown-rendered).
// This locks both against the REAL plugin end-to-end in a live reader.
describe("Weavero — plugin compat: Annotation Markdown (real XPI)", function () {
    this.timeout(90000);

    let wv, addon, win, att, ann, reader;
    const AM_ID = "zotero-annotation-markdown@34028312.qq.com";
    const gated = () => {
        try { return Services.env.get("WV_COMPAT_TIER") === "1"; }
        catch (e) { return false; }
    };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            try { const v = fn(); if (v) return v; } catch (e) {}
            await sleep(250);
        }
        throw new Error("timeout waiting for " + what);
    };

    // Same minimal single-page PDF the reader-filter spec uses.
    function minimalPDFBytes() {
        const objs = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n",
        ];
        let body = "%PDF-1.4\n";
        const offsets = [];
        for (const o of objs) { offsets.push(body.length); body += o; }
        const xrefPos = body.length;
        let xref = "xref\n0 4\n0000000000 65535 f \n";
        for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
        return body + xref + "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n"
            + xrefPos + "\n%%EOF\n";
    }

    before(async function () {
        if (!gated()) this.skip();
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvAmActiveInDoc !== "function") this.skip();
        win = Zotero.getMainWindow();

        const dir = Services.env.get("WV_COMPAT_XPI_DIR");
        const { AddonManager } = ChromeUtils.importESModule(
            "resource://gre/modules/AddonManager.sys.mjs");
        addon = await AddonManager.getAddonByID(AM_ID);
        if (!addon) {
            const file = Zotero.File.pathToFile(
                PathUtils.join(dir, "zotero-annotation-markdown-0.6.2.xpi"));
            const install = await AddonManager.getInstallForFile(file);
            await install.install();
            addon = await AddonManager.getAddonByID(AM_ID);
        }
        assert.isOk(addon, "companion installed");
        if (!addon.isActive) await addon.enable();
        await sleep(2500);

        const path = PathUtils.join(PathUtils.tempDir, "wv-am-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, minimalPDFBytes());
        att = await Zotero.Attachments.importFromFile({
            file: Zotero.File.pathToFile(path) });
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = att.libraryID;
        a.parentID = att.id;
        a.annotationType = "highlight";
        a.annotationText = "compat fixture";
        // A bare URL (AM renders it as dead text; Weavero must rescue it)
        // plus markdown AM will style (proves AM actually rendered).
        a.annotationComment = "see https://example.org/wv-compat and **bold**";
        a.annotationColor = "#ffd400";
        a.annotationPageLabel = "1";
        a.annotationSortIndex = "00000|000000|00000";
        a.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10, 60, 20]] });
        await a.saveTx();
        ann = a;

        await Zotero.Reader.open(att.id, null, { allowDuplicate: false });
        reader = await waitFor(
            () => Zotero.Reader._readers.find(r => r.itemID === att.id
                && r._internalReader && r._iframeWindow),
            30000, "reader");
        try { reader._internalReader.toggleSidebar(true); } catch (e) {}
        try { reader._internalReader.setSidebarView("annotations"); } catch (e) {}
    });

    after(async function () {
        try {
            if (reader) {
                const tabID = reader.tabID;
                if (tabID) win.Zotero_Tabs.close(tabID);
            }
        } catch (e) {}
        try { if (ann) await ann.eraseTx(); } catch (e) {}
        try { if (att) await att.eraseTx(); } catch (e) {}
    });

    it("companion is active alongside Weavero", function () {
        assert.isTrue(addon.isActive);
    });

    it("AM renders the comment card and Weavero detects it", async function () {
        const idoc = reader._iframeWindow.document;
        const preview = await waitFor(() => {
            const el = idoc.querySelector(
                ".annotation .annotation-markdown-rendered");
            return el && el.textContent && el.textContent.trim() ? el : null;
        }, 30000, "AM preview render");
        assert.isOk(preview);
        // Its markdown actually processed (the **bold** became an element).
        assert.isOk(preview.querySelector("strong, b"),
            "markdown was rendered, not just copied");
        assert.isTrue(wv._wvAmActiveInDoc(idoc), "detection sees the real AM");
    });

    it("Weavero YIELDS the card — no double render", async function () {
        const idoc = reader._iframeWindow.document;
        // settle both passes, then assert absence (the race is exactly
        // what this guards, so give it room to happen if it is going to)
        await sleep(1500);
        const card = idoc.querySelector(".annotation .annotation-markdown-rendered")
            .closest(".annotation");
        assert.isNull(card.querySelector(".wv-md-preview"),
            "Weavero must not plant its own preview on an AM card");
    });

    it("Weavero linkifies the bare URL INSIDE the AM preview", async function () {
        const idoc = reader._iframeWindow.document;
        const link = await waitFor(() => idoc.querySelector(
            ".annotation-markdown-rendered a.wv-link-http"), 20000,
            "wv link inside AM preview");
        assert.include(String(link.getAttribute("href") || link.textContent),
            "example.org/wv-compat");
    });

    it("in-PDF annotation popup: Weavero renders it (AM never claims popups)", async function () {
        // The 2026-07-19 regression: AM's findCommentNodes only claims
        // comments under an annotation-row ancestor; the in-view popup has
        // none, so AM never renders it -- and Weavero yielding there left
        // the popup showing the RAW comment whenever both plugins were on.
        // Guard: with AM active, Weavero's preview must be IN the popup.
        // The popup renders only with the sidebar CLOSED, and only a
        // direct _onSetAnnotationPopup drives it reliably (synthetic
        // clicks are untrusted; reference_zotero_reader_annotation_popup).
        try { reader._internalReader.toggleSidebar(false); } catch (e) {}
        await sleep(600);
        const Cu = Components.utils;
        const pv = Cu.waiveXrays(reader._internalReader._primaryView);
        const am = Cu.waiveXrays(reader._internalReader._annotationManager);
        const a = (am._annotations || []).find(x => String(x.id) === ann.key);
        assert.isOk(a, "content-side annotation object");
        pv._onSetAnnotationPopup({ rect: [50, 50, 200, 80], annotation: a });
        const idoc = reader._iframeWindow.document;
        const popup = await waitFor(() => {
            const el = idoc.querySelector(".annotation-popup");
            return el && el.querySelector(".comment") ? el : null;
        }, 15000, "in-view annotation popup");
        const preview = await waitFor(
            () => popup.querySelector(".wv-md-preview"), 15000,
            "Weavero preview inside the popup");
        assert.include(preview.textContent, "bold",
            "markdown rendered by WEAVERO in the popup (not raw, not yielded)");
        try { pv._onSetAnnotationPopup(); } catch (e) {}
        try { reader._internalReader.toggleSidebar(true); } catch (e) {}
    });

    it("no error-console entries mention the plugin", function () {
        const errs = (Zotero.getErrors(true) || []).map(String);
        assert.deepEqual(errs.filter(e => /annotation-markdown/i.test(e)), []);
    });
});

// Phase 4: Better Notes (windingwind/zotero-better-notes) — the big one.
// Automatable subset of docs/bn-compat-testing.md; the tab-group-across-
// RESTART check stays MANUAL there (the harness has no restart primitive).
// Contracts:
//   * BN boots alongside Weavero (5.5MB bundle, ztoolkit, its own editor
//     instrumentation),
//   * ROUTING tripwire — BN registers the `zotero://note` protocol
//     extension that Weavero's note-link click routing hands off to
//     (click swallow -> handleZoteroURI -> BN's in-process doAction;
//     bn-compat-testing.md §1). If BN stops registering it, note links
//     break and this fails loudly,
//   * EDITOR coexistence (the issue-#37 family) — Weavero's ProseMirror
//     decoration plugin still injects and decorates inside an editor BN
//     has also instrumented, and the stored note HTML stays untouched,
//   * clean console for BN.
describe("Weavero — plugin compat: Better Notes (real XPI)", function () {
    this.timeout(120000);

    let wv, addon, win, doc, note;
    const BN_ID = "Knowledge4Zotero@windingwind.com";
    const NEEDLE = "wv-bn-compat-needle";
    const gated = () => {
        try { return Services.env.get("WV_COMPAT_TIER") === "1"; }
        catch (e) { return false; }
    };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            try { const v = fn(); if (v) return v; } catch (e) {}
            await sleep(400);
        }
        throw new Error("timeout waiting for " + what);
    };

    function editorDoc() {
        for (const ne of doc.querySelectorAll("note-editor")) {
            const f = ne.querySelector("iframe");
            const d = f && f.contentDocument;
            if (d && d.querySelector(".ProseMirror")
                && (d.body.textContent || "").includes(NEEDLE)) {
                return d;
            }
        }
        return null;
    }

    before(async function () {
        if (!gated()) this.skip();
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._processNoteEditors !== "function") this.skip();
        win = Zotero.getMainWindow();
        doc = win.document;

        const dir = Services.env.get("WV_COMPAT_XPI_DIR");
        const { AddonManager } = ChromeUtils.importESModule(
            "resource://gre/modules/AddonManager.sys.mjs");
        addon = await AddonManager.getAddonByID(BN_ID);
        if (!addon) {
            const file = Zotero.File.pathToFile(
                PathUtils.join(dir, "better-notes-3.3.3.xpi"));
            const install = await AddonManager.getInstallForFile(file);
            await install.install();
            addon = await AddonManager.getAddonByID(BN_ID);
        }
        assert.isOk(addon, "companion installed");
        if (!addon.isActive) await addon.enable();
        // BN's bootstrap is heavy (ztoolkit, editor hooks, protocol
        // registration) — wait for the ROUTING footprint rather than a
        // blind delay.
        await waitFor(() => {
            const h = /** @type {any} */ (
                Services.io.getProtocolHandler("zotero").wrappedJSObject);
            return h && h._extensions && h._extensions["zotero://note"];
        }, 30000, "BN zotero://note protocol registration");
    });

    after(async function () {
        if (note) { try { await note.eraseTx(); } catch (e) {} }
    });

    it("companion is active alongside Weavero", function () {
        assert.isTrue(addon.isActive);
        assert.isOk(Zotero.Weavero.plugin, "Weavero alive with BN present");
    });

    it("routing tripwire: BN registers the zotero://note protocol extension", function () {
        const h = /** @type {any} */ (
            Services.io.getProtocolHandler("zotero").wrappedJSObject);
        assert.property(h._extensions, "zotero://note",
            "Weavero's note-link click routing hands off to this extension");
    });

    it("Weavero decorations land inside a BN-instrumented editor; stored HTML untouched", async function () {
        note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        const html = '<div data-schema-version="9"><p>' + NEEDLE
            + " https://example.com/bn-compat and"
            + " zotero://select/library/items/ABCD1234</p></div>";
        note.setNote(html);
        await note.saveTx();
        await win.ZoteroPane.selectItem(note.id);
        const edoc = await waitFor(() => {
            try { wv._processNoteEditors(); } catch (e) {}
            const d = editorDoc();
            return d && d.querySelectorAll(".wv-note-linkified").length >= 2 ? d : null;
        }, 60000, "decorations in the BN-instrumented editor");
        assert.isAtLeast(
            edoc.querySelectorAll(".wv-note-linkified.wv-link-http").length, 1);
        assert.isAtLeast(
            edoc.querySelectorAll(".wv-note-linkified.wv-link-zotero").length, 1);
        const storedItem = Zotero.Items.get(note.id);
        if (!storedItem) throw new Error("note item vanished");
        const stored = storedItem.getNote();
        assert.notInclude(stored, "wv-note-linkified",
            "decoration is display-only even with BN's editor hooks live");
        assert.notInclude(stored, "<a ", "no injected anchors");
    });

    it("no error-console entries mention Better Notes", function () {
        const errs = (Zotero.getErrors(true) || []).map(String);
        assert.deepEqual(
            errs.filter(e => /Knowledge4Zotero|better.?notes/i.test(e)), []);
    });
});
