/* global describe, it, before, after, assert, Zotero, wvT */

// Weavero's menu labels come from weavero.ftl (localisation slice 2, menus,
// 2026-11-11; zotero/zotero CLAUDE.md: "all new strings in Fluent .ftl";
// work/align-reviews/2026-11-11.md section 2). Three things are locked here:
//   (a) every entry Weavero puts in a menu it opens carries a Fluent id
//       (data-l10n-id, or MenuManager's l10nID, which becomes one) naming a
//       message with a label -- weavero.ftl's, or one of the few Zotero ids
//       Weavero reuses, each checked in the en-US files of 9.0.6, 10.0.8 and
//       11.0-beta.4 -- and the reader's context menus, which take plain
//       strings, take them from the file (lib/l10n.ts wvStr);
//   (b) no English label is left in the code that builds menus (a scan of
//       every method's source, as lib-helpers.spec.js scans for `mk`
//       lambdas), with an explicit allow-list;
//   (c) the lookups that used to find entries by their English label find
//       them in another language too.
// And the timing that lets a menu be labelled by Fluent in `popupshowing`:
// Gecko has translated it by `popupshown`, its width unchanged.
//
// FAILS on 1.0.5-l10n.2 (menus labelled in English in the code).

describe("Weavero — menus take their words from weavero.ftl", function () {
    this.timeout(60000);
    const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    // Zotero's own Fluent ids Weavero sets as data-l10n-id for an identical
    // label of the same meaning; each one has a `.label` in the en-US files of
    // 9.0.6, 10.0.8 and 11.0-beta.4 (zotero.ftl / mozilla/menubar.ftl, read
    // from each build's omni.ja, 2026-11-11). Zotero's VALUE strings Weavero
    // shows (general-show-in-library, general-find, its getString tab-menu
    // words) carry `data-wv-zotero-label` instead (lib/l10n.ts wvZoteroLabel).
    const ZOTERO_IDS = ["collections-menu-move-collection", "collections-menu-copy-collection", "menu-tools", "menu-help"];
    // Text that may stay in menu-building code: not words a translator owns.
    const ALLOW = [
        { text: "Weavero", why: "the product's name" },
    ];

    let wv, lib, win, doc, wl;
    let P, A, N, X;

    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const labelOf = (id, args) => {
        const L = id.startsWith("weavero-") ? wl : /** @type {any} */ (Zotero).ftl;
        const [m] = L.formatMessagesSync([{ id, args: args || null }]);
        if (!m) return null;
        const a = (m.attributes || []).find(x => x.name === "label");
        return a ? a.value : null;
    };

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        win = Zotero.getMainWindow();
        doc = win.document;
        if (!wv || !lib) wvT.absent("plugin");
        wl = new win.Localization(["weavero.ftl"], true);
        P = await wvT.createItem("journalArticle", { title: "WV menus l10n parent", url: "https://example.org/wv-menus" });
        A = await wvT.createTestPDFItem("wv-menus-l10n", { parentItemID: P.id });
        N = await wvT.createItem("book", { title: "WV menus l10n second" });
        X = /** @type {any} */ (new Zotero.Item("annotation"));
        X.libraryID = A.libraryID;
        X.parentID = A.id;
        X.annotationType = "highlight";
        X.annotationText = "menus in another language";
        X.annotationColor = "#ffd400";
        X.annotationSortIndex = "00000|000001|00000";
        X.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10, 60, 20]] });
        await X.saveTx();
    });

    after(async function () {
        try { if (lib && lib.wvL10nStub) lib.wvL10nStub(null); } catch (e) {}
        await wvT.erase(X, A, P, N);
    });

    // ---- the timing -------------------------------------------------------

    it("an entry labelled by Fluent in popupshowing has its text at popupshown, and the popup keeps its width", async () => {
        const pop = doc.createXULElement("menupopup");
        doc.querySelector("popupset").appendChild(pop);
        let mi = null, atShown = null, wShown = 0;
        pop.addEventListener("popupshowing", () => {
            mi = doc.createXULElement("menuitem");
            doc.l10n.setAttributes(mi, "weavero-backlinks-header", { count: 2 });
            pop.appendChild(mi);
        });
        const shown = new Promise(r => pop.addEventListener("popupshown", () => {
            atShown = mi && mi.getAttribute("label");
            wShown = pop.getBoundingClientRect().width;
            r(true);
        }, { once: true }));
        pop.openPopupAtScreen(200, 200, false);
        const ok = await Promise.race([shown, sleep(3000).then(() => false)]);
        try {
            assert.isTrue(ok, "the popup opened");
            assert.strictEqual(atShown, "2 Backlinks", "translated before it was shown");
            await sleep(300);
            assert.strictEqual(pop.getBoundingClientRect().width, wShown, "no width change after the show");
        }
        finally { try { pop.hidePopup(); } catch (e) {} pop.remove(); }
    });

    // ---- (a) every Weavero entry carries a Fluent id ----------------------

    const isWeavero = (el) => {
        if (el.id && el.id.startsWith("wv-")) return true;
        for (const c of el.classList) if (c.startsWith("wv-") || c.startsWith("weavero@mjthoraval-")) return true;
        for (const a of el.attributes) if (a.name.startsWith("data-wv")) return true;
        return false;
    };
    const audit = (popup, where, out) => {
        for (const el of popup.querySelectorAll("menuitem, menu")) {
            if (el.namespaceURI !== XUL || !isWeavero(el) || el.hidden) continue;
            let p = el.parentNode, hiddenUp = false;
            while (p && p !== popup) { if (p.hidden) hiddenUp = true; p = p.parentNode; }
            if (hiddenUp) continue;
            out.n++;
            // A row whose whole label is data (a window, group or library
            // name) carries no words of Weavero's; one that shows Zotero's own
            // word for the same thing (read through Zotero.getString /
            // Zotero.ftl) follows Zotero's language already.
            if (el.hasAttribute("data-wv-data-label")) continue;
            if (el.hasAttribute("data-wv-zotero-label")) {
                if (!String(el.getAttribute("label") || "").trim()) out.bad.push(where + ": an empty Zotero label");
                continue;
            }
            const id = el.getAttribute("data-l10n-id");
            const what = where + ": " + JSON.stringify(el.getAttribute("label"));
            if (!id) { out.bad.push(what + " has no Fluent id"); continue; }
            if (!id.startsWith("weavero-") && !ZOTERO_IDS.includes(id)) { out.bad.push(what + " uses an unverified Zotero id " + id); continue; }
            let args = null;
            try { args = JSON.parse(el.getAttribute("data-l10n-args") || "null"); }
            catch (e) { out.bad.push(what + ": data-l10n-args is not JSON"); continue; }
            const t = labelOf(id, args);
            if (!t || !t.trim()) out.bad.push(what + ": " + id + " has no .label");
            else if (el.getAttribute("label") !== t) out.bad.push(what + ": shows something else than " + id + " (" + JSON.stringify(t) + ")");
        }
    };
    const openAudit = async (popup, where, out, open) => {
        const shown = new Promise(r => {
            const on = (e) => { if (e.target !== popup) return; popup.removeEventListener("popupshown", on); r(true); };
            popup.addEventListener("popupshown", on);
        });
        open();
        const ok = await Promise.race([shown, sleep(3000).then(() => false)]);
        try {
            assert.isTrue(ok, where + " opened");
            audit(popup, where, out);
            // Weavero's submenus that fill on their own popupshowing.
            for (const m of [...popup.querySelectorAll(":scope > menu")]) {
                if (m.hidden || !isWeavero(m)) continue;
                const sp = m.querySelector(":scope > menupopup");
                if (!sp) continue;
                const s2 = new Promise(r => { const on = (e) => { if (e.target !== sp) return; sp.removeEventListener("popupshown", on); r(true); }; sp.addEventListener("popupshown", on); });
                m.open = true;
                await Promise.race([s2, sleep(1500)]);
                audit(sp, where + " > " + m.getAttribute("label"), out);
                try { sp.hidePopup(); } catch (e) {}
                await sleep(100);
            }
        }
        finally { try { popup.hidePopup(); } catch (e) {} await sleep(200); }
    };

    it("the items list's context menu: one item, two items", async () => {
        const ZP = win.ZoteroPane;
        if (win.Zotero_Tabs.selectedID !== "zotero-pane") win.Zotero_Tabs.select("zotero-pane");
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        const menu = doc.getElementById("zotero-itemmenu");
        const out = { n: 0, bad: [] };
        for (const ids of [[P.id], [P.id, N.id], [A.id]]) {
            await ZP.selectItems(ids);
            await sleep(200);
            await openAudit(menu, "items menu " + ids.length, out, () => menu.openPopupAtScreen(200, 200, true));
        }
        assert.isAtLeast(out.n, 6, "Weavero's entries were there");
        assert.deepEqual(out.bad, []);
    });

    it("the collections pane's context menu", async () => {
        const ZP = win.ZoteroPane;
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        const menu = doc.getElementById("zotero-collectionmenu");
        const out = { n: 0, bad: [] };
        await wvT.withPref("weavero.newMainWindow", true, async () => {
            await openAudit(menu, "collections menu", out, () => menu.openPopupAtScreen(200, 200, true));
        });
        assert.deepEqual(out.bad, []);
    });

    it("the tab menu: the library tab and a reader tab", async () => {
        const out = { n: 0, bad: [] };
        const tabMenu = async (tabID, where) => {
            const ps = doc.querySelector("popupset");
            let popup = null;
            const on = (e) => { if (e.target && e.target.parentNode === ps && e.target.localName === "menupopup") popup = e.target; };
            ps.addEventListener("popupshowing", on, true);
            try {
                const shown = new Promise(r => {
                    const s = (e) => { if (e.target !== popup) return; ps.removeEventListener("popupshown", s, true); r(true); };
                    ps.addEventListener("popupshown", s, true);
                });
                win.Zotero_Tabs._openMenu(200, 200, tabID);
                const ok = await Promise.race([shown, sleep(3000).then(() => false)]);
                assert.isTrue(ok && !!popup, where + " opened");
                audit(popup, where, out);
                for (const m of [...popup.querySelectorAll(":scope > menu")]) {
                    if (m.hidden || !isWeavero(m)) continue;
                    const sp = m.querySelector(":scope > menupopup");
                    if (!sp) continue;
                    const s2 = new Promise(r => { const f = (e) => { if (e.target !== sp) return; sp.removeEventListener("popupshown", f); r(true); }; sp.addEventListener("popupshown", f); });
                    m.open = true;
                    await Promise.race([s2, sleep(1500)]);
                    audit(sp, where + " > " + m.getAttribute("label"), out);
                    try { sp.hidePopup(); } catch (e) {}
                    await sleep(100);
                }
                try { popup.hidePopup(); } catch (e) {}
            }
            finally { ps.removeEventListener("popupshowing", on, true); await sleep(200); }
        };
        await tabMenu("zotero-pane", "library tab menu");
        const reader = await wvT.openReaderTab(A.id);
        try { await tabMenu(reader.tabID, "reader tab menu"); }
        finally { wvT.closeReaderTab(reader); await sleep(300); }
        assert.isAtLeast(out.n, 3, "Weavero's entries were there");
        assert.deepEqual(out.bad, []);
    });

    it("the menubar's File and Edit entries", async () => {
        const out = { n: 0, bad: [] };
        for (const id of ["menu_FilePopup", "menu_EditPopup"]) {
            const p = doc.getElementById(id);
            if (!p) continue;
            await openAudit(p, id, out, () => p.openPopupAtScreen(200, 200, false));
        }
        assert.deepEqual(out.bad, []);
    });

    // Zotero 9 / 10 only: on a Zotero with its own windows (11) a reader or
    // note opened "in a new window" is a main window, wired as one. Opened
    // and closed as test/zz-reader-window-wiring.spec.js does.
    it("a reader window and a note window link weavero.ftl and show Weavero's entries in its words", async function () {
        if (wvT.nativeWindows()) this.skip();
        this.timeout(120000);
        const step = (s) => { try { wvT.trace("menus-l10n windows: " + s); } catch (e) {} };
        const windowsOf = (type) => [...Services.wm.getEnumerator(type)];
        const waitNew = async (type, before) => {
            for (let i = 0; i < 150; i++) { const w = windowsOf(type).find(x => !before.has(x)); if (w) return w; await sleep(100); }
            return null;
        };
        // A reader window: the reader wiring table links the file, for
        // MenuManager's reader/menubar/file entries.
        step("reader open");
        const rBefore = new Set(windowsOf("zotero:reader"));
        await Zotero.Reader.open(A.id, null, { openInWindow: true });
        const rw = await waitNew("zotero:reader", rBefore);
        assert.isOk(rw, "a reader window opened");
        try {
            step("reader wired");
            const wired = () => lib.wvListenKeys(rw).some(k => k.key === "readersCleanup:unload");
            for (let i = 0; i < 150 && !wired(); i++) await sleep(100);
            assert.isOk(wired(), "the reader window's wiring ran");
            assert.isOk(rw.document.querySelector('link[href="weavero.ftl"]'), "weavero.ftl linked in the reader window");
            step("reader File menu");
            const fp = rw.document.getElementById("menu_FilePopup");
            const shown = new Promise(r => fp.addEventListener("popupshown", () => r(true), { once: true }));
            fp.openPopupAtScreen(rw.screenX + 40, rw.screenY + 60, false);
            const ok = await Promise.race([shown, sleep(3000).then(() => false)]);
            try {
                assert.isTrue(ok, "File opened");
                const ours = [...fp.querySelectorAll(":scope > menuitem[data-wv-menubar]")].filter(e => !e.hidden);
                assert.isAtLeast(ours.length, 1, "Weavero's File entries shown");
                for (const el of ours) {
                    const id = el.getAttribute("data-l10n-id");
                    assert.match(String(id), /^weavero-menu-/, el.dataset.wvMenubar + ": a weavero.ftl id");
                    assert.strictEqual(el.getAttribute("label"), lib.wvStr(id), el.dataset.wvMenubar + ": translated");
                }
            }
            finally { try { fp.hidePopup(); } catch (e) {} await sleep(200); }
        }
        finally { step("reader close"); try { rw.close(); } catch (e) {} await sleep(800); }
        // A stock note window: an element Weavero labels there links the
        // file on demand.
        const NT = /** @type {any} */ (new Zotero.Item("note"));
        NT.setNote("<p>WV menus l10n note</p>");
        await NT.saveTx();
        const deck = Zotero.Prefs.get("weavero.noteOpenInDeckWindow");
        const nBefore = new Set(windowsOf("zotero:note"));
        let nw = null;
        try {
            step("note open");
            Zotero.Prefs.set("weavero.noteOpenInDeckWindow", false);
            try { await /** @type {any} */ (Zotero).Notes.open(NT.id, null, { openInWindow: true }); }
            finally { if (deck === undefined) { try { Zotero.Prefs.clear("weavero.noteOpenInDeckWindow"); } catch (e) {} } else Zotero.Prefs.set("weavero.noteOpenInDeckWindow", deck); }
            nw = await waitNew("zotero:note", nBefore);
            assert.isOk(nw, "a note window opened");
            for (let i = 0; i < 150 && !(nw.document && nw.document.readyState === "complete" && nw.document.l10n); i++) await sleep(100);
            step("note label");
            const el = nw.document.createXULElement("menuitem");
            lib.wvL10n(el, "weavero-menu-copy-as");
            assert.isOk(nw.document.querySelector('link[href="weavero.ftl"]'), "linked in the note window");
            assert.strictEqual(el.getAttribute("data-l10n-id"), "weavero-menu-copy-as");
            assert.strictEqual(el.getAttribute("label"), "Copy As");
        }
        finally {
            step("note close");
            if (nw) { try { nw.close(); } catch (e) {} await sleep(500); }
            await wvT.erase(NT);
            step("done");
        }
    });

    it("the reader's context menus take every label from weavero.ftl", () => {
        // Every weavero.ftl id answers a marker: a label without one was
        // written in the code.
        lib.wvL10nStub((id) => "⟦" + id + "⟧");
        try {
            const reader = { type: "pdf", itemID: A.id, tabID: "wv-l10n-fake-tab", _item: A, _window: null, _popupset: null,
                _internalReader: { _state: { primaryViewStats: { pageIndex: 0 }, primaryViewSelectionPopup: { annotation: { text: "selected words" } } } } };
            const labels = [];
            const append = (...xs) => { for (const x of xs) labels.push(x && x.label); };
            wv._contextHandlerImpl({ reader, params: { ids: [X.key] }, append });
            wv._viewContextHandlerImpl({ reader, params: {}, append });
            assert.isAtLeast(labels.length, 4, "Weavero's entries were appended");
            assert.deepEqual(labels.filter(l => !/^⟦weavero-[a-z0-9-]+⟧$/.test(String(l))), [], "every label from the file");
        }
        finally { lib.wvL10nStub(null); }
    });

    // ---- (b) no English label left in menu-building code -----------------

    // A method's source without its comments (strings, template literals and
    // regex literals kept as they are).
    const stripComments = (src) => {
        let out = "", i = 0, prev = "";
        while (i < src.length) {
            const c = src[i], d = src[i + 1];
            if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
            if (c === "/" && d === "*") { const j = src.indexOf("*/", i + 2); i = j < 0 ? src.length : j + 2; continue; }
            if (c === "\"" || c === "'" || c === "`") {
                let j = i + 1;
                while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
                out += src.slice(i, j + 1); i = j + 1; prev = c; continue;
            }
            if (c === "/" && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prev)) {
                let j = i + 1, cls = false;
                while (j < src.length && (cls || src[j] !== "/") && src[j] !== "\n") {
                    if (src[j] === "\\") j++;
                    else if (src[j] === "[") cls = true;
                    else if (src[j] === "]") cls = false;
                    j++;
                }
                out += src.slice(i, j + 1); i = j + 1; prev = "/"; continue;
            }
            out += c;
            if (!/\s/.test(c)) prev = c;
            i++;
        }
        return out;
    };
    // The balanced (...) or {...} starting at `open`; strings skipped.
    const balanced = (s, open) => {
        const pairs = { "(": ")", "{": "}", "[": "]" };
        const stack = [];
        for (let i = open; i < s.length; i++) {
            const c = s[i];
            if (c === "\"" || c === "'" || c === "`") {
                let j = i + 1;
                while (j < s.length && s[j] !== c) j += s[j] === "\\" ? 2 : 1;
                i = j; continue;
            }
            if (pairs[c]) stack.push(pairs[c]);
            else if (c === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return s.slice(open, i + 1); }
        }
        return s.slice(open);
    };
    const unescape = (s) => s
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\(.)/g, "$1");
    const literals = (expr) => {
        const out = [];
        const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
        let m;
        while ((m = re.exec(expr))) out.push(unescape((m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, " ")));
        return out;
    };
    // Words, as opposed to code: an identifier, a dotted key, an id, a
    // class list, a debug-log line.
    const codeToken = (t) => /^[a-z_$][\w$.:\/#=-]*$/.test(t);
    const english = (s) => {
        const t = s.trim();
        if (!/[A-Za-z]{2,}/.test(t) || t.startsWith("[Weavero]")) return false;
        const toks = t.split(/\s+/);
        if (toks.every(codeToken) && (toks.length === 1 || toks.every(x => /[-_]/.test(x)))) return false;
        return !ALLOW.some(a => a.text === t);
    };
    // A call's arguments without the bodies of the callbacks passed to it.
    const withoutBlocks = (s) => {
        let out = "";
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (c === "\"" || c === "'" || c === "`") {
                let j = i + 1;
                while (j < s.length && s[j] !== c) j += s[j] === "\\" ? 2 : 1;
                out += s.slice(i, j + 1); i = j; continue;
            }
            if (c === "{" && i > 0) { const b = balanced(s, i); out += "{}"; i += b.length - 1; continue; }
            out += c;
        }
        return out;
    };
    // The value of `key:` at the object's top level.
    const propValue = (obj, key) => {
        let depth = 0;
        for (let i = 1; i < obj.length - 1; i++) {
            const c = obj[i];
            if (c === "\"" || c === "'" || c === "`") {
                let j = i + 1;
                while (j < obj.length && obj[j] !== c) j += obj[j] === "\\" ? 2 : 1;
                i = j; continue;
            }
            if ("({[".includes(c)) depth++;
            else if (")}]".includes(c)) depth--;
            else if (depth === 0 && obj.startsWith(key + ":", i) && /[\s,{]/.test(obj[i - 1])) {
                let j = i + key.length + 1, d = 0;
                const start = j;
                for (; j < obj.length - 1; j++) {
                    const cj = obj[j];
                    if (cj === "\"" || cj === "'" || cj === "`") {
                        let k = j + 1;
                        while (k < obj.length && obj[k] !== cj) k += obj[k] === "\\" ? 2 : 1;
                        j = k; continue;
                    }
                    if ("({[".includes(cj)) d++;
                    else if (")}]".includes(cj)) { if (d === 0) break; d--; }
                    else if (cj === "," && d === 0) break;
                }
                return obj.slice(start, j);
            }
        }
        return null;
    };
    const scan = (name, rawSrc, hits) => {
        const src = stripComments(rawSrc);
        const flag = (where, expr) => {
            for (const l of literals(expr)) if (english(l)) hits.push(name + ": " + where + " " + JSON.stringify(l));
        };
        // 1. A menu element's label attribute.
        const recv = new Set(["menuElem"]);
        for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*[\w.]+\.createXULElement\(\s*"(?:menuitem|menu)"\s*\)/g)) recv.add(m[1]);
        for (const m of src.matchAll(/\b(\w+)\.setAttribute\(\s*"label"\s*,/g)) {
            if (!recv.has(m[1])) continue;
            const args = balanced(src, m.index + m[0].indexOf("("));
            flag(m[1] + ".setAttribute(label)", args.slice(args.indexOf(",") + 1));
        }
        // 2. wvMenuItem / _createXULMenuItem specs, and the reader sidebar's
        //    HTML menu rows (_wvCtxItem).
        for (const m of src.matchAll(/\b(wvMenuItem|_createXULMenuItem|_wvCtxItem)\(/g)) {
            const args = balanced(src, m.index + m[0].length - 1);
            const o = args.indexOf("{");
            if (o < 0) continue;
            const v = propValue(balanced(args, o), "label");
            if (v) flag(m[1] + " label", v);
        }
        // 3. Menu descriptors: an object with an onCommand (the reader's
        //    append items, MenuManager entries, Weavero's entry tables).
        for (const m of src.matchAll(/[{,\s]onCommand\s*[:(]/g)) {
            let depth = 0, k = m.index;
            for (; k >= 0; k--) {
                const c = src[k];
                if (c === "}") depth++;
                else if (c === "{") { if (depth === 0) break; depth--; }
            }
            if (k < 0) continue;
            const v = propValue(balanced(src, k), "label");
            if (v) flag("menu entry label", v);
        }
        // 4. The `mk` family of local item builders, called with words.
        for (const m of src.matchAll(/(?<![.\w$])(mk|mkItem|mkCopy|mkMirror|mkEntry|mkTarget|mkTop|mkG|addEntry|entry|append|add|item)\(/g)) {
            const args = balanced(src, m.index + m[0].length - 1);
            flag(m[1] + "()", withoutBlocks(args));
        }
    };

    it("no English label is left in the code that builds menus", () => {
        const hits = [];
        let o = Object.getPrototypeOf(wv), n = 0;
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    n++;
                    scan(k, String(d.value), hits);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        for (const k of ["wvMenuItem"]) scan("lib." + k, String(lib[k]), hits);
        assert.isAbove(n, 500, "the plugin's methods were read");
        assert.deepEqual(hits, []);
    });

    it("every weavero-menu id the code names is in weavero.ftl, and every menu message there is used", async () => {
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const ftl = await (await fetch(rootURI + "locale/en-US/weavero.ftl")).text();
        const inFtl = [...ftl.matchAll(/^(weavero-menu-[a-z0-9-]+)\s*=/gm)].map(m => m[1]);
        const srcs = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try { const d = Object.getOwnPropertyDescriptor(o, k); if (d && typeof d.value === "function") srcs.push(String(d.value)); } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        for (const en of [...wv._wvCopyAsEntries(), ...wv._wvTabMenuEntries()]) if (en.l10n) srcs.push(String(en.l10n));
        const used = new Set();
        for (const s of srcs) for (const m of s.matchAll(/["'](weavero-menu-[a-z0-9-]+)["']/g)) used.add(m[1]);
        assert.isAbove(inFtl.length, 100, "weavero.ftl holds the menus' messages");
        assert.deepEqual([...used].filter(id => !inFtl.includes(id)).sort(), [], "ids the code names that weavero.ftl lacks");
        assert.deepEqual(inFtl.filter(id => !used.has(id)), [], "menu messages nothing uses");
    });

    it("the entry tables label through ids: Copy As, the tab-menu entries", () => {
        const items = [P];
        const ids = [];
        for (const en of wv._wvCopyAsEntries()) {
            if (en.sep) continue;
            assert.isFunction(en.l10n, en.key + ": an l10n id, not a label");
            const l = en.l10n(wv, items);
            ids.push(l.id);
            assert.isOk(labelOf(l.id, l.args), en.key + ": " + l.id + " has a .label");
        }
        for (const en of wv._wvTabMenuEntries()) {
            assert.isFunction(en.l10n, en.key + ": an l10n id, not a label");
            const l = en.l10n(wv);
            assert.isOk(labelOf(l.id, l.args), en.key + ": " + l.id + " has a .label");
        }
        assert.isAtLeast(ids.length, 6);
    });

    it("the scan sees what it is meant to see", () => {
        const hits = [];
        scan("sample", [
            "function sample(doc) {",
            "    const mi = doc.createXULElement(\"menuitem\");",
            "    // mi.setAttribute(\"label\", \"In A Comment\");",
            "    mi.setAttribute(\"label\", n > 1 ? \"Close \" + n + \" Tabs\" : \"Close Tab\");",
            "    wvMenuItem(doc, { label: \"Fold All\", attrs: { id: \"x\" } });",
            "    wvMenuItem(doc, { label: name, cls: \"wv-x\" });",
            "    wvMenuItem(doc, { l10n: { id: \"weavero-menu-x\" }, cls: \"wv-x wv-y\" });",
            "    append({ label: \"Copy Select Link\", onCommand: () => {} });",
            "    const re = /\"/g;",
            "    ctx.menuElem.setAttribute(\"label\", \"Open in New Window\");",
            "    mkItem(\"Show in Library\", () => { Zotero.debug(\"[Weavero] x err: \" + e); });",
            "    mk(\"_wvTabGroupDnDDrop\", \"wv-a wv-b\", \"tabs.moveToStart\", \"\\u{1F9EA}\");",
            "    mi.setAttribute(\"label\", \"Weavero\");",
            "}",
        ].join("\n"), hits);
        assert.deepEqual(hits, [
            'sample: mi.setAttribute(label) "Close "',
            'sample: mi.setAttribute(label) " Tabs"',
            'sample: mi.setAttribute(label) "Close Tab"',
            'sample: menuElem.setAttribute(label) "Open in New Window"',
            'sample: wvMenuItem label "Fold All"',
            'sample: menu entry label "Copy Select Link"',
            'sample: mkItem() "Show in Library"',
        ]);
    });

    // ---- (c) the former label-keyed lookups, in another language ----------

    it("the tab menu's relabelled entries are found by key, not by their English", async () => {
        const pop = doc.createXULElement("menupopup");
        doc.querySelector("popupset").appendChild(pop);
        const mi = (label) => { const el = doc.createXULElement("menuitem"); el.setAttribute("label", label); pop.appendChild(el); return el; };
        const move = doc.createXULElement("menu");
        move.setAttribute("label", Zotero.getString("tabs.move"));
        const mp = doc.createXULElement("menupopup");
        for (const k of ["tabs.moveToStart", "tabs.moveToEnd", "tabs.moveToWindow"]) {
            const el = doc.createXULElement("menuitem"); el.setAttribute("label", Zotero.getString(k)); mp.appendChild(el);
        }
        move.appendChild(mp);
        pop.appendChild(move);
        mi(Zotero.getString("tabs.duplicate"));
        mi(Zotero.getString("general.close"));
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvTabIsDuplicatable");
        const orig = wv._wvTabIsDuplicatable;
        wv._wvTabIsDuplicatable = () => true;
        const fake = ["wv-l10n-fake-1", "wv-l10n-fake-2"];
        try {
            wv._wvMakeMoveTabMenuMulti(win, pop, fake);
            wv._wvMakeDuplicateTabMenuMulti(win, pop, fake);
            wv._wvMakeCloseTabsMenuMulti(win, pop, fake);
            // A translation: every entry now reads in another language.
            for (const el of pop.querySelectorAll(":scope > menuitem, :scope > menu")) {
                el.removeAttribute("data-l10n-id");
                el.setAttribute("label", "«" + el.getAttribute("label") + "» (fr)");
            }
            assert.deepEqual([...pop.children].map(el => wv._wvTabMenuItemKey(el)), ["moveTab", "duplicate", "close"]);
            await wvT.withPref("weavero.enableTabGroups", true, async () => {
                wv._wvInjectGroupTabsMenuItem(win, pop, fake);
                const g = pop.querySelector(".wv-grouptabs");
                assert.isOk(g, "Group Tabs added");
                assert.strictEqual(g.nextElementSibling, pop.querySelector(":scope > menu"), "right above the relabelled Move Tabs");
            });
        }
        finally {
            if (own) wv._wvTabIsDuplicatable = orig; else delete wv._wvTabIsDuplicatable;
            pop.remove();
        }
    });

    it("the reader's Copy Link entry gets its icon whatever its label says", () => {
        // A label with quotes and guillemets: the old lookup built a CSS
        // selector from the English text.
        lib.wvL10nStub((id) => (/^weavero-menu-reader-copy-link/.test(id) ? "Copier le lien « " + id + " » \"x\"" : null));
        const listeners = [];
        const ps = { addEventListener: (t, fn) => listeners.push(fn), removeEventListener: () => {} };
        try {
            const reader = { type: "pdf", itemID: A.id, _item: A, _window: win, _popupset: ps,
                _internalReader: { _state: { primaryViewStats: { pageIndex: 0 } } } };
            const appended = [];
            wv._viewContextHandlerImpl({ reader, params: {}, append: (...xs) => appended.push(...xs) });
            const ours = appended.filter(x => /^Copier le lien/.test(String(x.label)));
            assert.isAtLeast(ours.length, 1, "the copy-link entry, in the stand-in language");
            const popup = doc.createXULElement("menupopup");
            const items = ours.map((x) => { const el = doc.createXULElement("menuitem"); el.setAttribute("label", x.label); popup.appendChild(el); return el; });
            assert.isAtLeast(listeners.length, 1, "the icon stamp listens for the popup");
            for (const fn of listeners) fn({ target: popup });
            for (const el of items) assert.isOk(el.getAttribute("image"), "icon on " + el.getAttribute("label"));
        }
        finally { lib.wvL10nStub(null); }
    });

    it("the reader sidebar's add entries get their icons whatever their labels say", () => {
        const listeners = [];
        const ps = { addEventListener: (t, fn) => listeners.push(fn), removeEventListener: () => {} };
        const label = "Ajouter le texte « sélectionné » au \"plan\"";
        wv._wvReaderStampMenuIcon({ _window: win, _popupset: ps }, label, "chrome://zotero/skin/16/universal/note.svg");
        const popup = doc.createXULElement("menupopup");
        const el = doc.createXULElement("menuitem");
        el.setAttribute("label", label);
        popup.appendChild(el);
        assert.strictEqual(listeners.length, 1, "the stamp listens for the popup");
        listeners[0]({ target: popup });
        assert.include(el.getAttribute("image") || "", "note.svg", "found by its own label, quotes and all");
    });

    it("the reader's own (React) context menu gets Weavero's icons whatever the labels say", () => {
        lib.wvL10nStub((id) => (/^weavero-menu-reader-ann-/.test(id) ? "«" + id + "» (fr)" : null));
        const host = /** @type {any} */ (doc.createElementNS("http://www.w3.org/1999/xhtml", "div"));
        host.className = "context-menu";
        try {
            const reader = { type: "pdf", itemID: A.id, tabID: "wv-l10n-fake-tab", _item: A };
            const labels = [];
            wv._contextHandlerImpl({ reader, params: { ids: [X.key] }, append: (...xs) => { for (const x of xs) labels.push(String(x.label)); } });
            const want = labels.filter(l => /add-related|copy-select|copy-open/.test(l));
            assert.strictEqual(want.length, 3, "Add Related, Copy Select Link, Copy Open Link in the stand-in language");
            for (const l of labels) {
                const row = /** @type {any} */ (doc.createElementNS("http://www.w3.org/1999/xhtml", "div"));
                row.className = "row basic";
                row.textContent = l;
                host.appendChild(row);
            }
            doc.documentElement.appendChild(host);
            assert.strictEqual(wv.decorateContextMenu(doc), 3, "each of the three decorated");
        }
        finally { host.remove(); lib.wvL10nStub(null); }
    });
});
