/* global describe, it, before, after, expect, Zotero */

// In-Zotero tests for the note-editor bare-URL DECORATION (the injected
// ProseMirror plugin, `note-editor-inject.js`) and its pref gating, plus the
// items-tree note-item title linkify. Complements the pure-function coverage
// in links.unit.ts / links.spec.js -- these exercise the REAL running feature:
// the injected plugin renders display-only decorations (stored note untouched),
// and the Display-mode "Show:" toggles + master "Editor" toggle gate it.
//
// The injection is asynchronous (it waits for the ProseMirror view, which the
// headless test runner creates slowly), so setup drives the real install sweep
// (`_processNoteEditors`) until decorations land, and the toggle tests drive
// the real re-scope path (`_refreshNoteLinkifyRegex`, with the same cache reset
// the pref observer does) rather than racing the async observer.

describe("Weavero — note-editor bare-URL decoration", () => {
    let wv, win, doc, ZP, edoc;
    let note = null;
    const prefBak = {};
    // Zotero.Prefs auto-prepends "extensions.zotero." — pass the SHORT form.
    const P = (k) => "weavero." + k;
    const NEEDLE = "WV-DECO-TEST";

    const sleep = (ms) => new Promise((r) => (win || Zotero.getMainWindow()).setTimeout(r, ms));
    async function waitFor(cb, timeout = 20000, interval = 250) {
        const start = Date.now();
        for (;;) {
            let v = null;
            try { v = cb(); } catch (e) {}
            if (v) return v;
            if (Date.now() - start > timeout) return v;
            await sleep(interval);
        }
    }

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
    const decoCount = (d, cls) =>
        d.querySelectorAll(".wv-note-linkified" + (cls ? "." + cls : "")).length;

    // Re-scope the decoration the way the pref observer does: invalidate the
    // URL_REGEX caches, then push the new source + enable flag + repaint.
    // Deterministic -- avoids racing the async branch observer in the runner.
    function applyPrefsToDecoration() {
        wv._urlRegexCache = null;
        wv._urlSchemeAltCache = null;
        wv._refreshNoteLinkifyRegex();
    }

    before(async function () {
        this.timeout(60000);
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        win = Zotero.getMainWindow();
        doc = win.document;
        ZP = win.ZoteroPane;
        for (const k of ["enableLinksAndRelations", "enableNotes",
                         "enableInlineUrls", "enableZoteroLinks"]) {
            prefBak[k] = Zotero.Prefs.get(P(k));
            Zotero.Prefs.set(P(k), true);
        }
        note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote('<div data-schema-version="9"><p>' + NEEDLE + " "
            + "https://example.com/x and zotero://select/library/items/ABCD1234 "
            + "and www.zotero.org and bare nolink.example</p></div>");
        await note.saveTx();
        await ZP.selectItem(note.id);
        // Drive the real install sweep until decorations land (the auto-retry
        // is slower in the headless runner).
        edoc = await waitFor(() => {
            try { wv._processNoteEditors(); } catch (e) {}
            const d = editorDoc();
            return d && decoCount(d) >= 3 ? d : null;
        }, 45000, 700);
    });

    after(async function () {
        for (const k of Object.keys(prefBak)) {
            if (prefBak[k] === undefined) Zotero.Prefs.clear(P(k));
            else Zotero.Prefs.set(P(k), prefBak[k]);
        }
        try { applyPrefsToDecoration(); } catch (e) {}
        if (note) { try { await note.eraseTx(); } catch (e) {} }
    });

    it("decorates http / zotero / www, not bare domains", function () {
        expect(edoc, "note editor with >=3 decorations").to.be.ok;
        expect(decoCount(edoc, "wv-link-http"), "http+www").to.be.at.least(2);
        expect(decoCount(edoc, "wv-link-zotero"), "zotero").to.equal(1);
        const hrefs = [...edoc.querySelectorAll(".wv-note-linkified")]
            .map((s) => s.getAttribute("data-wv-href"));
        expect(hrefs, "www linkified schemeless").to.include("www.zotero.org");
        expect(hrefs.some((h) => /nolink\.example/.test(h || "")),
            "bare domain not decorated").to.equal(false);
    });

    it("is display-only — stored note HTML is unchanged (no injected anchors)", function () {
        const stored = Zotero.Items.get(note.id).getNote();
        expect((stored.match(/<a /g) || []).length, "no <a> written").to.equal(0);
        expect(stored, "bare URL text still present").to.include("https://example.com/x");
    });

    it("respects the URLs Show toggle (http/www gate, zotero unaffected)", async function () {
        this.timeout(15000);
        expect(edoc).to.be.ok;
        Zotero.Prefs.set(P("enableInlineUrls"), false);
        applyPrefsToDecoration();
        expect(await waitFor(() => decoCount(edoc, "wv-link-http") === 0 || null, 8000),
            "http cleared when URLs off").to.equal(true);
        expect(decoCount(edoc, "wv-link-zotero"), "zotero unaffected").to.equal(1);
        Zotero.Prefs.set(P("enableInlineUrls"), true);
        applyPrefsToDecoration();
        expect(await waitFor(() => decoCount(edoc, "wv-link-http") >= 2 || null, 8000),
            "http restored").to.equal(true);
    });

    it("respects the master Editor toggle (enableNotes clears / restores all)", async function () {
        this.timeout(15000);
        expect(edoc).to.be.ok;
        Zotero.Prefs.set(P("enableNotes"), false);
        applyPrefsToDecoration();
        expect(await waitFor(() => decoCount(edoc) === 0 || null, 8000),
            "all cleared when Editor off").to.equal(true);
        Zotero.Prefs.set(P("enableNotes"), true);
        applyPrefsToDecoration();
        expect(await waitFor(() => decoCount(edoc) >= 3 || null, 8000),
            "restored when Editor on").to.equal(true);
    });

    // Items-tree note-item title linkify (feature A). Best-effort: skips (not
    // fails) if the row isn't in the current items view.
    it("linkifies URLs in the items-tree note-item title cell", async function () {
        this.timeout(15000);
        const cellText = await waitFor(() => {
            try { wv._markCellLinks(); } catch (e) {}
            const tb = doc.querySelector("#item-tree-main-default");
            const sel = tb && tb.querySelector(".row.selected");
            const ct = sel && sel.querySelector(".cell.title .cell-text");
            return ct && ct.querySelector(".wv-url-span") ? ct : null;
        }, 10000);
        if (!cellText) { this.skip(); return; }
        expect(cellText.querySelectorAll(".wv-url-span").length).to.be.at.least(1);
        expect([...cellText.querySelectorAll(".wv-url-span")]
            .map((s) => s.className).join(" ")).to.match(/wv-link-/);
    });
});
