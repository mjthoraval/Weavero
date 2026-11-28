/* global describe, it, before, after, assert, Zotero, Services, ChromeUtils, Components, IOUtils, PathUtils, wvT */

// Coexistence probe: Weavero next to the third-party plugin "Saved Search Folders" 1.1
// (NickyNoName, MIT, github.com/NickyNoName/zotero-saved-search-folders; MJT 2026-11-26: "Ok to
// test Weavero with zotero-saved-search-folders"). Per main window the plugin REPLACES nine
// members of the collections tree (_expandRow, _matchesFilter, getIconName, isContainerEmpty,
// toggleOpenState, renderItem, selectByID, expandLibrary, notify), keeps what it found there as
// "the original" and writes that back at its shutdown. Weavero wraps several of the same members
// (hidden collections: _includedInTree, _expandRow, isContainerEmpty; the Group Libraries fold:
// toggleOpenState and the class's _refreshRowMap / selectLibrary / expandToCollection /
// expandLibrary / notify; the collection select guard: notify). So the ORDER matters, and each
// order is driven here, in this sequence:
//   A   Weavero running, then the plugin installed (it patches over Weavero's wraps);
//   C   the plugin disabled while Weavero runs (then enabled again);
//   B   the plugin running, then Weavero reloaded (Weavero wires over the plugin -- also what a
//       Weavero update does, and a startup where the plugin patched first);
//   B+C the plugin disabled after that reload (then enabled again);
//   D   Weavero disabled while the plugin runs; then the plugin disabled with Weavero off; the
//       plugin alone; Weavero enabled again over it.
// Each step records what it sees -- who owns each member (by the global its function lives in),
// the rows, the folder rows' twisties, Weavero's features -- in WV_SSF_OUT (default
// D:\tmp\ssf\findings-<Zotero major>.json) and a picture of the collections pane in
// D:\tmp\ssf\png, then asserts what must hold for the two to coexist (one assertion per scenario
// listing every broken invariant). Runs only with WV_SSF_XPI set (the reviewed XPI), in the
// runner's temp profile; the plugin is uninstalled and every fixture erased at the end.

describe("Weavero — plugin compat: Saved Search Folders coexistence (real XPI)", function () {
    this.timeout(300000);
    const SSF_ID = "saved-search-folders@nickynoname.github.io";
    const WV_ID = "weavero@mjthoraval";
    const Z = /** @type {any} */ (Zotero);
    const Cu = /** @type {any} */ (Components).utils;
    const LIB = () => Zotero.Libraries.userLibraryID;
    const rid = (path, lib) => "HSF" + (lib == null ? LIB() : lib) + ":" + JSON.stringify(path);
    const env = (k) => { try { return Services.env.exists(k) ? Services.env.get(k) : ""; } catch (e) { return ""; } };
    // IOUtils on Windows writes nothing to a forward-slash path (test rules).
    const winPath = (p) => String(p).replace(/\//g, "\\");
    const safe = (fn, d) => { try { return fn(); } catch (e) { return d === undefined ? "throws: " + e : d; } };
    const sleep = (ms) => wvT.sleep(ms);
    const race = (p, ms) => Promise.race([p, sleep(ms)]);

    /** @type {any} */ let AM = null;
    /** @type {any} */ let wvAddon = null;
    /** @type {any} */ let ssfAddon = null;
    /** @type {any} */ let win = null;
    let major = 0, xpi = "", outPath = "", pngDir = "";
    let installed = false;
    const G = { native: null, ssf: null, wv: null, wvOld: [] };
    /** @type {any} */ const F = { started: new Date().toISOString() };
    /** @type {any} */ const S = {};
    /** @type {any} */ const fx = { items: [], cols: [], searches: [], bulk: [], groups: [] };
    const savedPrefs = {};
    const PREFS = { "weavero.enableVisualExtras": true, "weavero.collectionsStickyParents": true, "weavero.collectionsPathTooltip": true, "weavero.collectionsIndentGuides": true };
    const SSF_PREFS = ["extensions.savedsearchfolders.openFolders", "extensions.savedsearchfolders.separator", "extensions.savedsearchfolders.orderSeparator", "extensions.savedsearchfolders.rootFolder"];
    const dbgLines = [];
    let dbgListener = null;
    const seenErrors = new Set();

    const ssf = () => Z.SavedSearchFolders || null;
    const st = () => { const s = ssf(); return s && s._windows ? s._windows.get(win) : null; };
    const cvOf = () => win.ZoteroPane.collectionsView;
    const live = () => wvT.plugin();

    // ---- who owns a function -------------------------------------------------------------

    function who(fn) {
        if (fn === undefined) return "undefined";
        if (typeof fn !== "function") return typeof fn;
        try { if (Cu.isDeadWrapper(fn)) return "dead"; } catch (e) {}
        let g = null;
        try { g = Cu.getGlobalForObject(fn); } catch (e) { return "dead?"; }
        if (G.ssf && g === G.ssf) return "ssf";
        if (G.wv && g === G.wv) return "weavero";
        const k = G.wvOld.indexOf(g);
        if (k >= 0) return "weavero-old#" + (k + 1);
        if (G.native && g === G.native) return "zotero";
        return "other";
    }
    function tagWho(tag) {
        const p = live();
        const cur = p ? safe(() => p._wvWireTag(), null) : null;
        return cur && tag === cur ? "live" : "old";
    }
    function layersOf(host, m) {
        return safe(() => {
            const e = Object.prototype.hasOwnProperty.call(host, "_wvWraps") && host._wvWraps && host._wvWraps[m];
            return e ? Array.from(e.recs).map((r) => /** @type {any} */ (r).layer + "@" + tagWho(/** @type {any} */ (r).tag)) : [];
        }, []);
    }
    const INST = ["_expandRow", "_matchesFilter", "getIconName", "isContainerEmpty", "toggleOpenState", "renderItem", "selectByID", "expandLibrary", "notify", "_includedInTree", "canDropCheck"];
    const CLASS = ["_refreshRowMap", "refresh", "selectLibrary", "expandToCollection", "expandLibrary", "notify", "selectByID", "_expandRow", "_includedInTree"];
    function members() {
        const cv = cvOf();
        const out = { instance: {}, proto: {}, props: {}, ssfOriginals: {} };
        for (const m of INST) {
            const f = cv[m];
            out.instance[m] = { own: Object.prototype.hasOwnProperty.call(cv, m), who: who(f), wvTag: safe(() => (f && f._wvTag) ? tagWho(f._wvTag) : null, null), layers: layersOf(cv, m) };
        }
        const proto = Object.getPrototypeOf(cv);
        for (const m of CLASS) out.proto[m] = { who: who(proto[m]), layers: layersOf(proto, m) };
        const p = cv.tree && cv.tree.props;
        if (p) {
            out.props = {
                isContainerEmpty: who(p.isContainerEmpty), isContainerEmptyIsMember: p.isContainerEmpty === cv.isContainerEmpty,
                onToggleOpenState: who(p.onToggleOpenState), toggleIsMember: p.onToggleOpenState === cv.toggleOpenState,
                renderItem: who(p.renderItem), renderItemIsMember: p.renderItem === cv.renderItem,
            };
        }
        const s = st();
        if (s && s.originals) {
            for (const k of Object.keys(s.originals)) out.ssfOriginals[k] = { hadOwn: !!s.originals[k].hadOwn, who: who(s.originals[k].value) };
        }
        return out;
    }
    /** Instance members held by a given owner (e.g. leftovers of a plugin that is off). */
    function heldBy(mem, re) { return Object.keys(mem.instance).filter((k) => re.test(mem.instance[k].who)).map((k) => k + "=" + mem.instance[k].who); }

    // ---- the rows ---------------------------------------------------------------------------

    function shape() {
        const cv = cvOf();
        const rows = [];
        for (let i = 0; i < cv.rowCount; i++) {
            const r = cv.getRow(i);
            if (!r) continue;
            rows.push({ i, id: String(r.id), type: r.type, level: r.level, name: safe(() => String(r.getName())), open: !!r.isOpen, folder: !!(r.ref && r.ref.ssfFolder) });
        }
        return rows;
    }
    const isBulk = (name) => /^(Bulk\/)?S\d\d$/.test(name);
    function summary() {
        const rows = shape();
        return {
            rowCount: rows.length,
            root: rows.some((r) => r.id === rid([])),
            folders: rows.filter((r) => r.folder).map((r) => r.name + "@" + r.level + (r.open ? "+" : "-")),
            searches: rows.filter((r) => r.type === "search" && !isBulk(r.name)).map((r) => r.name + "@" + r.level),
            bulkRows: rows.filter((r) => r.type === "search" && isBulk(r.name)).length,
            // A search row named with its full path is Zotero's own row: nothing regrouped it.
            fullNameRows: rows.filter((r) => r.type === "search" && r.name.includes("/")).length,
            collections: rows.filter((r) => r.type === "collection").map((r) => r.name + "@" + r.level),
            groupRows: rows.filter((r) => r.type === "group" || r.id === "HG").map((r) => r.id),
            special: rows.filter((r) => /^[UDRPTV]\d/.test(r.id)).map((r) => r.id),
        };
    }
    const at = (id) => { const cv = cvOf(); const i = cv._rowMap ? cv._rowMap[id] : undefined; return i === undefined ? -1 : i; };
    const present = (id) => at(id) >= 0;
    const focusedId = () => safe(() => { const cv = cvOf(); const r = cv.getRow(cv.selection.focused); return r ? String(r.id) : null; }, null);

    async function rowDom(id) {
        const cv = cvOf();
        const i = at(id);
        if (i < 0) return { present: false };
        try { cv.ensureRowIsVisible(i); } catch (e) {}
        try { cv.tree.invalidate(); } catch (e) {}
        await sleep(200);
        const el = win.document.getElementById(cv.id + "-row-" + i);
        const t = el && el.querySelector(".cell-text");
        return {
            present: true, index: i, level: cv.getRow(i).level, open: !!cv.getRow(i).isOpen, rendered: !!el,
            twisty: !!(el && el.querySelector(".twisty")), spacer: !!(el && el.querySelector(".spacer-twisty")),
            ssfFolderClass: !!(el && el.classList.contains("ssf-folder")), ariaExpanded: el ? el.getAttribute("aria-expanded") : null,
            text: t ? t.textContent : null, isContainerEmpty: safe(() => cv.isContainerEmpty(i)), iconName: safe(() => cv.getIconName(i)),
        };
    }

    /** Open or close a plugin folder the way its twisty does (the tree's toggleOpenState);
     *  when that does nothing, the way its row click does (the plugin's toggleFolder). */
    async function setFolder(path, open, lib) {
        const cv = cvOf();
        const id = rid(path, lib);
        let i = at(id);
        if (i < 0) return { present: false };
        if (!!cv.getRow(i).isOpen === open) return { present: true, already: true };
        try { await cv.toggleOpenState(i); } catch (e) {}
        await sleep(150);
        i = at(id);
        const viaMember = i >= 0 && !!cv.getRow(i).isOpen === open;
        let viaClick = null;
        if (!viaMember && i >= 0 && ssf()) {
            try { await ssf().toggleFolder(cv, i, open); } catch (e) {}
            await sleep(150);
            i = at(id);
            viaClick = i >= 0 && !!cv.getRow(i).isOpen === open;
        }
        return { present: true, viaMember, viaClick };
    }

    async function selectLib() { try { await race(cvOf().selectLibrary(LIB()), 4000); } catch (e) {} await sleep(200); }

    // ---- evidence -----------------------------------------------------------------------------

    function takeErrors() {
        let all = [];
        try { all = (Zotero.getErrors(true) || []).map(String); } catch (e) {}
        const fresh = all.filter((e) => !seenErrors.has(e));
        for (const e of fresh) seenErrors.add(e);
        const re = /saved ?search ?folders|searchFolders\.js|nickynoname|weavero|collectionTree|virtualized-table|collectionTreeRow/i;
        // The AddonManager's own warnings at a reload or enable of the runner's build
        // ("version must be a version string ...", "older version will be disabled"): the
        // test build's version string, nothing either plugin does to the tree.
        const am = /\baddons\.(webextension|xpi)\b.*\bWARN\b/;
        const hits = fresh.filter((e) => re.test(e));
        return {
            console: hits.filter((e) => !am.test(e)).map((e) => e.slice(0, 600)).slice(0, 40),
            addonManagerWarnings: hits.filter((e) => am.test(e)).length,
            consoleOther: fresh.filter((e) => !re.test(e)).length,
            debug: dbgLines.splice(0, dbgLines.length).slice(0, 80),
        };
    }

    async function save() {
        try { F.updated = new Date().toISOString(); await IOUtils.writeUTF8(outPath, JSON.stringify(F, null, 1)); } catch (e) {}
    }

    async function step(bag, key, fn) {
        try { bag[key] = await fn(); }
        catch (e) { bag[key] = { threw: String(e), stack: String((e && e.stack) || "").split("\n").slice(0, 5).join(" | ") }; }
        await save();
        return bag[key];
    }

    /** The collections pane, as drawn (verify skill §4: drawSnapshot of the runner's window). */
    async function shot(name) {
        try {
            const doc = win.document;
            const cv = cvOf();
            const el = (cv.domEl && cv.domEl.closest && cv.domEl.closest("[id^='zotero-collections-pane']")) || cv.domEl;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return "no box";
            const wg = win.browsingContext.currentWindowGlobal;
            const bmp = await wg.drawSnapshot(new win.DOMRect(Math.floor(r.left), Math.floor(r.top), Math.ceil(r.width), Math.ceil(r.height)), 1, "white");
            const c = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            c.width = bmp.width; c.height = bmp.height;
            c.getContext("2d").drawImage(bmp, 0, 0);
            const bin = atob(c.toDataURL("image/png").split(",")[1]);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const p = PathUtils.join(pngDir, "z" + major + "-" + name + ".png");
            await IOUtils.write(p, bytes);
            return p;
        } catch (e) { return "shot failed: " + e; }
    }

    // ---- plugin lifecycles ------------------------------------------------------------------

    async function waitSsfPatched(ms = 30000) {
        const ok = await wvT.waitFor(() => { const s = st(); return !!(s && s.cv && s.originals && Object.keys(s.originals).length); }, ms);
        // Its first rebuild (refresh + select) follows the patch.
        await wvT.waitFor(() => present(rid([])), 8000);
        await sleep(1500);
        return !!ok;
    }
    async function ssfDisable() {
        await ssfAddon.disable();
        await wvT.waitFor(() => !Z.SavedSearchFolders, 8000);
        // Its restore is synchronous; its rebuild (refresh + select) is not.
        await sleep(2500);
    }
    async function ssfEnable() {
        await ssfAddon.enable();
        const ok = await waitSsfPatched();
        G.ssf = safe(() => Cu.getGlobalForObject(Z.SavedSearchFolders), G.ssf);
        return ok;
    }
    async function weaveroBack() {
        for (let i = 0; i < 600 && Z._weaveroReady !== true; i++) await sleep(100);
        if (live()) G.wv = Cu.getGlobalForObject(live());
        // Past init's deferred passes.
        await sleep(5000);
        return Z._weaveroReady === true;
    }
    async function reloadWeavero() {
        G.wvOld.push(G.wv);
        Z._weaveroReady = false;
        await wvAddon.reload();
        return weaveroBack();
    }
    async function disableWeavero() {
        G.wvOld.push(G.wv);
        G.wv = null;
        await wvAddon.disable();
        for (let i = 0; i < 100 && Z.Weavero; i++) await sleep(100);
        // The teardown's own refresh, and the disable's deferred close (1.5 s).
        await sleep(3500);
    }
    async function enableWeavero() {
        Z._weaveroReady = false;
        await wvAddon.enable();
        return weaveroBack();
    }

    async function mkSearch(name, word, libraryID, opts) {
        const s = /** @type {any} */ (new Zotero.Search());
        s.libraryID = libraryID || LIB();
        s.name = name;
        s.addCondition("title", "contains", word);
        await s.saveTx(opts || { skipSelect: true });
        return s;
    }

    /** Weavero's pinned parents, as drawn: name, arrow, icon, the row's other classes per pinned row. */
    function pinnedRows() {
        const ov = win.document.getElementById("wv-coll-sticky");
        if (!ov) return [];
        return Array.from(ov.querySelectorAll(".wv-sticky-row")).map((/** @type {any} */ r) => {
            const t = r.querySelector(".cell-text"), ic = r.querySelector(".cell-icon");
            return {
                name: t ? t.textContent : null, arrow: !!r.querySelector(".icon-twisty"), icon: ic ? String(ic.className).replace(/\s*cell-icon\s*/, " ").trim() : null,
                cls: Array.from(r.classList).filter((c) => c !== "row" && c !== "wv-sticky-row"),
                iconBg: ic ? safe(() => win.getComputedStyle(ic).backgroundColor, null) : null,
            };
        });
    }

    /** Weavero's Hide entries in the collections menu for the selected rows (what
     *  hidden-collections.spec.js builds), then the menu cleaned again. */
    async function hideEntries() {
        const menu = win.document.getElementById("zotero-collectionmenu");
        try { await win.ZoteroPane.buildCollectionContextMenu(); } catch (e) {}
        try { live()._wvHidBuildMenu(win, menu); } catch (e) { return "threw: " + e; }
        const items = Array.from(menu.querySelectorAll(".wv-hid-entry")).filter((/** @type {any} */ e) => e.localName === "menuitem" && !e.hidden);
        const out = items.map((/** @type {any} */ e) => e.getAttribute("label") || e.getAttribute("data-l10n-id") || "?");
        for (const e of Array.from(menu.querySelectorAll(".wv-hid-entry"))) /** @type {any} */ (e).remove();
        return out;
    }

    async function itemsCount(expect, ms = 8000) {
        await wvT.waitFor(() => win.ZoteroPane.itemsView && win.ZoteroPane.itemsView.rowCount === expect, ms);
        return safe(() => win.ZoteroPane.itemsView.rowCount, null);
    }

    /** The scenario's broken invariants: recorded, then asserted at once. */
    function check(bag, list, ok, what) {
        if (!ok) list.push(what);
        bag.broken = list;
    }

    // ---- setup ------------------------------------------------------------------------------

    before(async function () {
        this.timeout(180000);
        xpi = env("WV_SSF_XPI");
        // Not a run that installs the companion (runq-env.py WV_SSF_XPI=...): stand down.
        if (!xpi) this.skip();
        if (!live()) wvT.absent("plugin");
        wvT.method("_wvHidHide");
        wvT.method("_wvCollAidsUpdate");
        wvT.method("_bmShowInLibrary");
        wvT.method("_wvCollSetGroupsFor");
        wvT.method("_wvGfToggle");
        win = Zotero.getMainWindow();
        major = parseInt(String(Zotero.version), 10) || 0;
        // "{major}" in WV_SSF_OUT / WV_SSF_PNG: one run on both Zotero versions keeps both records.
        outPath = winPath((env("WV_SSF_OUT") || "D:/tmp/ssf/findings-{major}.json").replace("{major}", String(major)));
        pngDir = winPath((env("WV_SSF_PNG") || "D:/tmp/ssf/png").replace("{major}", String(major)));
        try { await IOUtils.makeDirectory(pngDir, { createAncestors: true, ignoreExisting: true }); } catch (e) {}
        AM = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager;
        wvAddon = await AM.getAddonByID(WV_ID);
        if (!wvAddon) wvT.absent("the Weavero add-on in AddonManager");
        const cv = cvOf();
        G.native = Cu.getGlobalForObject(Object.getPrototypeOf(cv).setFilter);
        G.wv = Cu.getGlobalForObject(live());
        F.versions = {
            zotero: Zotero.version, weavero: wvAddon.version, xpi,
            strictCompatibility: safe(() => Services.prefs.getBoolPref("extensions.strictCompatibility", true)),
            channel: safe(() => Services.prefs.getCharPref("app.update.channel", "")),
            windowHidden: safe(() => win.document.hidden), nativeWindows: safe(() => wvT.nativeWindows()),
        };
        try { for (const e of (Zotero.getErrors(true) || []).map(String)) seenErrors.add(e); } catch (e) {}
        dbgListener = (line) => {
            try {
                const s = String(line);
                if (dbgLines.length < 400 && /Saved Search Folders:|\[Weavero\][^\n]*\b(err|error|fail|failed|threw|exception)\b/i.test(s)) dbgLines.push(s.slice(0, 400));
            } catch (e) {}
        };
        try { Z.Debug.addListener(dbgListener); } catch (e) {}
        const B = Services.prefs.getBranch("extensions.zotero.");
        for (const k of Object.keys(PREFS)) {
            savedPrefs[k] = B.prefHasUserValue(k) ? { v: Zotero.Prefs.get(k) } : null;
            Zotero.Prefs.set(k, PREFS[k]);
        }
        for (const k of SSF_PREFS) { try { if (Services.prefs.prefHasUserValue(k)) Services.prefs.clearUserPref(k); } catch (e) {} }
        // Fixtures (the runner's temp profile): three items, a collection with a child, the
        // folder-named searches, 30 searches in one folder (for the pinned parents), a group
        // with a folder search (the Group Libraries fold).
        for (const t of ["wvssf alpha marie", "wvssf beta pierre", "wvssf gamma marie pierre"]) fx.items.push(await wvT.createItem("journalArticle", { title: t }));
        const C1 = /** @type {any} */ (new Zotero.Collection()); C1.name = "wvssf-col"; await C1.saveTx({ skipSelect: true }); fx.cols.push(C1);
        const C2 = /** @type {any} */ (new Zotero.Collection()); C2.name = "wvssf-sub"; C2.parentID = C1.id; await C2.saveTx({ skipSelect: true }); fx.cols.push(C2);
        S.C1 = C1; S.C2 = C2;
        S.marie = await mkSearch("People/Marie Curie", "marie");
        S.pierre = await mkSearch("People/Pierre Curie", "pierre");
        S.toRead = await mkSearch("Reading/To Read", "wvssf");
        S.plain = await mkSearch("Plain", "gamma");
        fx.searches.push(S.marie, S.pierre, S.toRead, S.plain);
        for (let n = 1; n <= 30; n++) fx.bulk.push(await mkSearch("Bulk/S" + String(n).padStart(2, "0"), "zzz-wvssf-none"));
        try {
            if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
            if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
            const g = /** @type {any} */ (new Zotero.Group());
            // A made-up id below 1,000,000: never a real group.
            g.id = Zotero.Utilities.rand(100000, 1000000); g.name = "wvssf-group"; g.description = "";
            g.editable = true; g.filesEditable = true; g.version = Zotero.Utilities.rand(1000, 10000); g.archived = false;
            await g.saveTx();
            fx.groups.push(g);
            S.group = g;
            S.groupTopic = await mkSearch("Topics/Group Search", "wvssf", g.libraryID);
            fx.searches.push(S.groupTopic);
        } catch (e) { F.groupFixture = "threw: " + e; }
        await selectLib();
        await sleep(1000);
        /** @type {any} */ const base = F.baseline = {};
        base.members = members();
        base.summary = summary();
        base.marie = await rowDom("S" + S.marie.id);
        base.shot = await shot("0-weavero-only");
        base.errors = takeErrors();
        await save();
    });

    after(async function () {
        this.timeout(180000);
        if (!win) return;
        /** @type {any} */ const out = F.cleanup = {};
        try { if (wvAddon && !wvAddon.isActive) out.weaveroReEnabled = await enableWeavero(); } catch (e) { out.weaveroReEnable = "threw: " + e; }
        try { const p = live(); if (p) await p._wvHidShow(win, LIB(), null); } catch (e) {}
        try {
            const a = await AM.getAddonByID(SSF_ID);
            if (a) { await a.uninstall(); out.uninstalled = true; }
        } catch (e) { out.uninstall = "threw: " + e; }
        await sleep(2500);
        await step(out, "afterUninstall", async () => ({ members: members(), summary: summary(), leftovers: heldBy(members(), /^(ssf|weavero-old|dead)/), errors: takeErrors() }));
        try { await Zotero.Searches.erase(fx.searches.concat(fx.bulk).map((s) => s.id)); } catch (e) { out.eraseSearches = "threw: " + e; }
        try { await Zotero.Collections.erase(fx.cols.map((c) => c.id).reverse()); } catch (e) { out.eraseCols = "threw: " + e; }
        try { await Zotero.Items.erase(fx.items.map((i) => i.id)); } catch (e) { out.eraseItems = "threw: " + e; }
        for (const g of fx.groups) { try { await g.eraseTx(); } catch (e) { out.eraseGroup = "threw: " + e; } }
        for (const k of SSF_PREFS) { try { if (Services.prefs.prefHasUserValue(k)) Services.prefs.clearUserPref(k); } catch (e) {} }
        const B = Services.prefs.getBranch("extensions.zotero.");
        for (const k of Object.keys(PREFS)) {
            try { if (savedPrefs[k]) Zotero.Prefs.set(k, savedPrefs[k].v); else if (B.prefHasUserValue(k)) B.clearUserPref(k); } catch (e) {}
        }
        try { if (dbgListener) Z.Debug.removeListener(dbgListener); } catch (e) {}
        await selectLib();
        F.finished = new Date().toISOString();
        await save();
    });

    // ---- A: the plugin installed over a running Weavero ------------------------------------

    it("A: the plugin installed over a running Weavero -- its folders, Weavero's features on them", async function () {
        /** @type {any} */ const A = F.A = {};
        const broken = [];
        try {
            // pathToFile refuses a forward-slash path on Windows ("Unexpected path value").
            const install = await AM.getInstallForFile(Zotero.File.pathToFile(winPath(xpi)));
            A.install = { state: safe(() => install.state), error: safe(() => install.error) };
            await install.install();
        } catch (e) { A.installThrew = String(e); }
        ssfAddon = await AM.getAddonByID(SSF_ID);
        A.addon = ssfAddon ? { version: ssfAddon.version, isActive: ssfAddon.isActive, isCompatible: safe(() => ssfAddon.isCompatible), appDisabled: safe(() => ssfAddon.appDisabled) } : null;
        await save();
        // The plugin refuses this Zotero (its range is 10.*): recorded, nothing to coexist with.
        if (!ssfAddon || !ssfAddon.isActive) { F.notInstallable = true; await save(); this.skip(); }
        installed = true;
        A.patched = await waitSsfPatched();
        G.ssf = Cu.getGlobalForObject(Z.SavedSearchFolders);
        const cv = cvOf();

        await step(A, "afterInstall", async () => ({
            members: members(), summary: summary(),
            root: await rowDom(rid([])), people: await rowDom(rid(["People"])), plain: await rowDom("S" + S.plain.id),
            shot: await shot("A1-installed"),
        }));
        check(A, broken, A.afterInstall.summary && A.afterInstall.summary.root, "A: the plugin's folders are there");
        check(A, broken, A.afterInstall.people && A.afterInstall.people.twisty, "A: a folder row draws its twisty (the plugin's isContainerEmpty answers false for it)");

        await step(A, "openPeople", async () => ({ toggle: await setFolder(["People"], true), marie: await rowDom("S" + S.marie.id), people: await rowDom(rid(["People"])), shot: await shot("A2-people-open") }));
        check(A, broken, A.openPeople.toggle && A.openPeople.toggle.viaMember, "A: the folder's twisty (the tree's toggleOpenState) opens it");

        await step(A, "selectByIdInClosedFolder", async () => {
            await setFolder(["People"], false);
            await selectLib();
            const ok = await race(cv.selectByID("S" + S.marie.id), 5000);
            await sleep(300);
            return { ok: ok === undefined ? "timeout" : ok, focused: focusedId(), peopleOpen: !!(present(rid(["People"])) && cv.getRow(at(rid(["People"]))).isOpen) };
        });
        check(A, broken, A.selectByIdInClosedFolder.focused === "S" + S.marie.id, "A: selectByID reveals a search in a closed folder");

        await step(A, "bookmarkReveal", async () => {
            await setFolder(["People"], false);
            await selectLib();
            await live()._bmShowInLibrary({ type: "treerow", rowID: "S" + S.pierre.id, libraryID: LIB(), label: "Pierre Curie" });
            await sleep(500);
            const i = at("S" + S.pierre.id);
            const jw = cv.tree && cv.tree._jsWindow;
            return {
                focused: focusedId(), peopleOpen: !!(present(rid(["People"])) && cv.getRow(at(rid(["People"]))).isOpen),
                rowTop: i >= 0 && jw ? safe(() => live()._wvRowPos(jw, i)) : null, scrollOffset: jw ? jw.scrollOffset : null,
                pinnedPx: i >= 0 ? safe(() => live()._wvCollPinnedPx(cv, i)) : null,
            };
        });
        check(A, broken, A.bookmarkReveal.focused === "S" + S.pierre.id, "A: a bookmarked saved search in a closed folder opens selected");

        await step(A, "pathTooltip", async () => {
            await setFolder(["People"], true);
            return { marie: safe(() => live()._wvCollRowPath(cv, at("S" + S.marie.id))), people: safe(() => live()._wvCollRowPath(cv, at(rid(["People"])))) };
        });

        await step(A, "pinnedParents", async () => {
            live()._wvApplyCollectionsTreeAids(win);
            const t = await setFolder(["Bulk"], true);
            const jw = cv.tree._jsWindow;
            const target = fx.bulk[14] ? at("S" + fx.bulk[14].id) : -1;
            if (target < 0) return { bulk: t, target };
            // Three parents pinned (My Library > Saved Searches > Bulk) need a pane of about
            // 3 rows / 40 % (the pinned rows' cap): the runner's pane was 107 px on
            // 2026-11-27 (287 px the night before) and pinned My Library only. Taller for
            // this step, given back after it.
            const h0 = safe(() => jw.getWindowHeight(), 0);
            /** @type {any} */ let was = null;
            if (h0 && h0 < 320) {
                was = { w: win.outerWidth, h: win.outerHeight };
                try { win.resizeTo(win.outerWidth, win.outerHeight + Math.ceil(340 - h0)); } catch (e) {}
                await wvT.waitFor(() => safe(() => jw.getWindowHeight(), 0) >= 300, 3000);
                await sleep(300);
            }
            try {
                jw.scrollTo(Math.round(live()._wvRowPos(jw, at("S" + fx.bulk[14].id))));
                await sleep(300);
                live()._wvCollAidsUpdate(win);
                await sleep(200);
                const tg = at("S" + fx.bulk[14].id);
                return {
                    bulk: t, target: tg, pinned: pinnedRows(), guideSkipPx: safe(() => live()._wvCollGuideSkipPx(cv, tg)),
                    windowHeightBefore: h0, windowHeight: safe(() => jw.getWindowHeight()), scrollOffset: jw.scrollOffset, shot: await shot("A3-pinned-parents"),
                };
            }
            finally {
                jw.scrollTo(0);
                await sleep(200);
                if (was) { try { win.resizeTo(was.w, was.h); } catch (e) {} await sleep(300); }
                await setFolder(["Bulk"], false);
            }
        });
        check(A, broken, (A.pinnedParents.pinned || []).some((r) => r.name === "Bulk"), "A: the plugin's folder is pinned above its searches (pinned parents)");
        // F4: a pinned folder of the plugin's is drawn as its row is -- Zotero's twisty rule
        // (!isContainerEmpty) gives it its arrow, its row's class (ssf-folder: the plugin's
        // cyan folder icon) follows, and the indent guides run under it.
        const pinnedFolders = (A.pinnedParents.pinned || []).filter((r) => r.name === "Bulk" || r.name === "Saved Searches");
        check(A, broken, pinnedFolders.length === 2 && pinnedFolders.every((r) => r.arrow), "A: the plugin's pinned folders draw their arrow (" + JSON.stringify(pinnedFolders.map((r) => r.name + ":" + r.arrow)) + ")");
        check(A, broken, pinnedFolders.some((r) => r.name === "Bulk" && (r.cls || []).includes("ssf-folder")), "A: the pinned folder row carries the plugin's row class (its folder icon)");
        check(A, broken, (A.pinnedParents.pinned || []).every((r) => !(r.cls || []).some((c) => c === "odd" || c === "even" || c === "selected")), "A: no state class of the table's own on a pinned row (" + JSON.stringify((A.pinnedParents.pinned || []).map((r) => r.cls)) + ")");
        check(A, broken, A.pinnedParents.guideSkipPx === 0, "A: indent guides under the plugin's folders (guideSkipPx " + A.pinnedParents.guideSkipPx + ")");

        await step(A, "intersection", async () => {
            await setFolder(["People"], true);
            await race(cv.selectByID("S" + S.marie.id), 5000);
            await sleep(500);
            const j = at("S" + S.pierre.id);
            if (j >= 0) cv.selection.toggleSelect(j);
            const multi = await wvT.waitFor(() => { const iv = win.ZoteroPane.itemsView; return iv && iv.collectionTreeRows && iv.collectionTreeRows.length === 2; }, 8000);
            const groups = live()._wvCollSetGroupsFor(win);
            const srcs = groups.get(LIB()) || null;
            let counts = null;
            for (let k = 0; k < 30 && srcs && !counts; k++) { counts = safe(() => live()._wvCollSetCounts(srcs), null); if (!counts) await sleep(200); }
            /** @type {any} */ const r = { multiSelected: !!multi, sources: srcs, counts, itemsRows: safe(() => win.ZoteroPane.itemsView.rowCount) };
            await selectLib();
            return r;
        });
        check(A, broken, !!(A.intersection.counts && A.intersection.counts.all === 1 && A.intersection.counts.union === 3), "A: Weavero's intersection of two selected searches (1 of 3)");

        await step(A, "combo", async () => {
            const s = st();
            await race(cv.selectByID("S" + S.marie.id), 5000);
            await itemsCount(2);
            // The plain search row first: Weavero's row commands are offered there (the control).
            const plainRow = cv.getRow(cv.selection.focused);
            /** @type {any} */ const plain = {
                hide: await hideEntries(), copyLinkKey: safe(() => (live()._wvSelectedSavedSearch(win) || {}).key),
                bookmarkable: safe(() => live()._bmTreeRowIsSpecial(plainRow)),
            };
            await ssf().toggleComboMember(cv, s, S.pierre, "AND");
            await wvT.waitFor(() => String(focusedId() || "").includes(":combo"), 5000);
            const andRows = await itemsCount(1);
            const comboRow = cv.getRow(cv.selection.focused);
            /** @type {any} */ const res = {
                and: {
                    focused: focusedId(), itemsRows: andRows, label: (await rowDom(focusedId())).text,
                    weaveroIntersection: live()._wvCollSetGroupsFor(win).size,
                    weaveroHideKey: safe(() => live()._wvHidKey(comboRow.ref)), marieKey: "S" + S.marie.key,
                    copyLinkKey: safe(() => (live()._wvSelectedSavedSearch(win) || {}).key), bookmarkable: safe(() => live()._bmTreeRowIsSpecial(comboRow)),
                    hide: await hideEntries(),
                    shot: await shot("A4-combo-and"),
                },
                plain,
            };
            await ssf().clearCombo(cv, s);
            await race(cv.selectByID("S" + S.marie.id), 5000);
            await itemsCount(2);
            await ssf().toggleComboMember(cv, s, S.pierre, "OR");
            await wvT.waitFor(() => String(focusedId() || "").includes(":combo"), 5000);
            res.or = { focused: focusedId(), itemsRows: await itemsCount(3) };
            await ssf().clearCombo(cv, s);
            await selectLib();
            return res;
        });
        check(A, broken, A.combo.and && A.combo.and.itemsRows === 1, "A: the plugin's AND combination lists 1 item");
        check(A, broken, A.combo.or && A.combo.or.itemsRows === 3, "A: the plugin's OR combination lists 3 items");
        // F6: a combination row ("S<id>:combo<n>") is not its first search -- Weavero's Hide,
        // Copy Saved Search Link and Bookmark leave it alone (they act on a plain search row).
        const pl = (A.combo && A.combo.plain) || {};
        check(A, broken, Array.isArray(pl.hide) && pl.hide.length > 0 && !!pl.copyLinkKey && pl.bookmarkable === true, "A: (control) a plain search row is offered Hide, Copy Link and Bookmark");
        const an = (A.combo && A.combo.and) || {};
        check(A, broken, Array.isArray(an.hide) && an.hide.length === 0, "A: no Hide entry on the plugin's combination row (" + JSON.stringify(an.hide) + ")");
        check(A, broken, !an.copyLinkKey && an.bookmarkable === false, "A: no Copy Link / Bookmark for the plugin's combination row (copyLinkKey " + an.copyLinkKey + ", bookmarkable " + an.bookmarkable + ")");

        await step(A, "addSearch", async () => {
            const s = await mkSearch("People/Marie Sklodowska", "marie", LIB(), {});
            await sleep(2000);
            /** @type {any} */ const r = { inFolder: present("S" + s.id) && cv.getRow(at("S" + s.id)).level > 2, row: await rowDom("S" + s.id), focused: focusedId() === "S" + s.id, summary: summary() };
            await s.eraseTx();
            await sleep(1500);
            r.afterErase = summary();
            return r;
        });
        check(A, broken, A.addSearch.inFolder, "A: a new search lands in its folder (the plugin's notify)");

        await step(A, "collectionsSearch", async () => {
            await race(cv.setFilter("curie"), 8000);
            await sleep(500);
            /** @type {any} */ const r = { rows: shape().map((x) => x.name + "@" + x.level), shot: await shot("A5-collections-search") };
            await race(cv.setFilter(""), 8000);
            await sleep(500);
            r.cleared = summary();
            return r;
        });

        await step(A, "hidden", async () => {
            const p = live();
            await p._wvHidHide([S.pierre], win);
            await setFolder(["People"], true);
            /** @type {any} */ const r = { afterPierre: { pierre: present("S" + S.pierre.id), marie: present("S" + S.marie.id), people: present(rid(["People"])) } };
            await p._wvHidHide([S.toRead], win);
            r.afterToRead = { reading: present(rid(["Reading"])), toRead: present("S" + S.toRead.id) };
            await p._wvHidHide([S.C1], win);
            r.afterCollection = { col: present("C" + S.C1.id), sub: present("C" + S.C2.id) };
            r.listed = safe(() => p._wvHidListLibrary(LIB(), win).map((h) => h.label));
            r.summary = summary();
            r.people = await rowDom(rid(["People"]));
            r.shot = await shot("A6-hidden");
            return r;
        });
        check(A, broken, A.hidden.afterPierre && !A.hidden.afterPierre.pierre && A.hidden.afterPierre.marie, "A: a hidden search inside a folder is hidden, its sibling stays");
        check(A, broken, A.hidden.afterToRead && !A.hidden.afterToRead.reading, "A: a folder whose only search is hidden goes");
        check(A, broken, A.hidden.afterCollection && !A.hidden.afterCollection.col && !A.hidden.afterCollection.sub, "A: a hidden collection and its child go");

        await step(A, "groupFold", async () => {
            if (!S.group || !present("HG")) return { header: false };
            const gl = S.group.libraryID;
            /** @type {any} */ const r = { before: { group: present("L" + gl), root: present(rid([], gl)) } };
            await live()._wvGfToggle(cv, true);
            await sleep(300);
            r.folded = { group: present("L" + gl), root: present(rid([], gl)) };
            await live()._wvGfToggle(cv, true);
            await sleep(500);
            r.unfolded = { group: present("L" + gl), root: present(rid([], gl)), topics: present(rid(["Topics"], gl)) };
            r.shot = await shot("A7-group-fold");
            return r;
        });
        if (A.groupFold && A.groupFold.before && A.groupFold.before.root) check(A, broken, A.groupFold.unfolded && A.groupFold.unfolded.root, "A: the plugin's folder under a group comes back when the Group Libraries line unfolds");

        A.endMembers = members();
        A.errors = takeErrors();
        check(A, broken, !A.errors.console.length, "A: no console errors from either plugin");
        await save();
        assert.deepEqual(broken, [], "A broken: " + broken.join("; "));
    });

    // ---- C: the plugin disabled while Weavero runs -----------------------------------------

    it("C: the plugin disabled while Weavero runs -- Weavero's wraps are Weavero's, its features work", async function () {
        if (!installed) this.skip();
        /** @type {any} */ const C = F.C = {};
        const broken = [];
        await ssfDisable();
        const cv = cvOf();
        await step(C, "state", async () => ({
            members: members(), summary: summary(), marie: await rowDom("S" + S.marie.id),
            hiddenStill: { pierre: present("S" + S.pierre.id), toRead: present("S" + S.toRead.id), col: present("C" + S.C1.id) },
            ssfStyleLeft: !!win.document.getElementById("ssf-style"), shot: await shot("C1-plugin-off"),
        }));
        const mem = (C.state && C.state.members) || members();
        check(C, broken, !heldBy(mem, /^ssf$/).length, "C: nothing of the plugin left in the tree's members (" + heldBy(mem, /^ssf$/).join(", ") + ")");
        check(C, broken, mem.instance.isContainerEmpty.who === "weavero" && mem.instance._expandRow.who === "weavero" && mem.instance._includedInTree.who === "weavero", "C: Weavero's isContainerEmpty / _expandRow / _includedInTree in place");
        const hs = (C.state && C.state.hiddenStill) || {};
        check(C, broken, hs.pierre === false && hs.toRead === false && hs.col === false, "C: what Weavero hides stays hidden");
        await step(C, "pinnedParents", async () => {
            const jw = cv.tree._jsWindow;
            const target = fx.bulk[20] ? at("S" + fx.bulk[20].id) : -1;
            if (target < 0) return { target };
            jw.scrollTo(Math.round(live()._wvRowPos(jw, target)));
            await sleep(300);
            live()._wvCollAidsUpdate(win);
            await sleep(200);
            /** @type {any} */ const r = { pinned: pinnedRows() };
            jw.scrollTo(0);
            await sleep(200);
            return r;
        });
        check(C, broken, (C.pinnedParents.pinned || []).some((r) => r.name === Zotero.getString("pane.collections.library")), "C: pinned parents (My Library above its searches)");
        await step(C, "groupFold", async () => {
            if (!present("HG")) return { header: false };
            const gl = S.group.libraryID;
            await live()._wvGfToggle(cv, true); await sleep(300);
            const folded = !present("L" + gl);
            await live()._wvGfToggle(cv, true); await sleep(300);
            return { folded, unfolded: present("L" + gl) };
        });
        if (C.groupFold && !C.groupFold.threw && C.groupFold.header !== false) check(C, broken, C.groupFold.folded && C.groupFold.unfolded, "C: the Group Libraries line folds and unfolds");
        C.errors = takeErrors();
        check(C, broken, !C.errors.console.length, "C: no console errors");
        // The plugin back for the next scenarios (A again).
        await step(C, "reEnabled", async () => ({ ok: await ssfEnable(), summary: summary(), people: await rowDom(rid(["People"])), members: members() }));
        await save();
        assert.deepEqual(broken, [], "C broken: " + broken.join("; "));
    });

    // ---- B: Weavero reloaded while the plugin runs -----------------------------------------

    it("B: Weavero reloaded while the plugin runs -- the plugin's folders and patches survive", async function () {
        if (!installed) this.skip();
        /** @type {any} */ const B = F.B = {};
        const broken = [];
        await step(B, "before", async () => ({ summary: summary(), members: members() }));
        B.reloaded = await reloadWeavero();
        const cv = cvOf();
        await step(B, "after", async () => ({
            members: members(), summary: summary(), ssfStillThinksActive: !!st(),
            root: await rowDom(rid([])), people: await rowDom(rid(["People"])), marie: await rowDom("S" + S.marie.id),
            hiddenStill: { pierre: present("S" + S.pierre.id), toRead: present("S" + S.toRead.id), col: present("C" + S.C1.id) },
            shot: await shot("B1-weavero-reloaded"),
        }));
        const mem = (B.after && B.after.members) || members();
        check(B, broken, !!(B.after && B.after.summary && B.after.summary.root), "B: the plugin's folders are still there after Weavero's reload");
        check(B, broken, ["_expandRow", "isContainerEmpty", "toggleOpenState", "notify"].every((m) => mem.instance[m].who === "ssf"), "B: the plugin's _expandRow / isContainerEmpty / toggleOpenState / notify still in place (" + ["_expandRow", "isContainerEmpty", "toggleOpenState", "notify"].map((m) => m + "=" + mem.instance[m].who).join(", ") + ")");
        const bh = (B.after && B.after.hiddenStill) || {};
        check(B, broken, bh.pierre === false && bh.col === false, "B: what Weavero hides stays hidden");
        // A refresh now (any rebuild of the rows: a hide, a sync, the collections search).
        await step(B, "afterRefresh", async () => {
            await live()._wvHidRefreshWin(win);
            await sleep(500);
            return { summary: summary(), members: members(), people: await rowDom(rid(["People"])) };
        });
        check(B, broken, !!(B.afterRefresh && B.afterRefresh.summary && B.afterRefresh.summary.root), "B: the folders survive the next refresh");
        await step(B, "addSearch", async () => {
            const s = await mkSearch("People/Marie Sklodowska", "marie", LIB(), {});
            await sleep(2000);
            /** @type {any} */ const r = { level: present("S" + s.id) ? cv.getRow(at("S" + s.id)).level : null, row: await rowDom("S" + s.id), summary: summary() };
            await s.eraseTx();
            await sleep(1500);
            return r;
        });
        check(B, broken, B.addSearch.level > 2, "B: a new search lands in its folder");
        await step(B, "toggle", async () => (present(rid(["People"])) ? { open: await setFolder(["People"], true), close: await setFolder(["People"], false) } : { people: false }));
        B.errors = takeErrors();
        check(B, broken, !B.errors.console.length, "B: no console errors");
        await save();
        assert.deepEqual(broken, [], "B broken: " + broken.join("; "));
    });

    // ---- B then C: the plugin disabled after Weavero's reload ------------------------------

    it("B+C: the plugin disabled after Weavero's reload -- no previous Weavero instance put back", async function () {
        if (!installed) this.skip();
        /** @type {any} */ const BC = F.BC = {};
        const broken = [];
        await ssfDisable();
        const cv = cvOf();
        await step(BC, "state", async () => ({ members: members(), summary: summary(), shot: await shot("BC1-plugin-off-after-reload") }));
        const mem = (BC.state && BC.state.members) || members();
        const stale = heldBy(mem, /^(weavero-old|dead|ssf)/);
        BC.stale = stale;
        check(BC, broken, !stale.length, "B+C: no member left to a previous Weavero instance or the plugin (" + stale.join(", ") + ")");
        // Weavero's per-window hiding of a special collection rides _expandRow.
        await step(BC, "virtualHide", async () => {
            const p = live();
            const before = present("U" + LIB());
            await p._wvHidHide([{ type: "unfiled", libraryID: LIB() }], win);
            await sleep(300);
            /** @type {any} */ const r = { before, afterHide: present("U" + LIB()) };
            await p._wvHidShow(win, LIB(), ["Vunfiled"]);
            await sleep(300);
            r.afterShow = present("U" + LIB());
            r.membersAfterRefresh = members().instance;
            return r;
        });
        if (BC.virtualHide && BC.virtualHide.before === true) check(BC, broken, !BC.virtualHide.afterHide && BC.virtualHide.afterShow, "B+C: Weavero hides and shows Unfiled Items in this window");
        BC.errors = takeErrors();
        await step(BC, "reEnabled", async () => ({ ok: await ssfEnable(), summary: summary(), members: members(), people: await rowDom(rid(["People"])) }));
        await save();
        assert.deepEqual(broken, [], "B+C broken: " + broken.join("; "));
    });

    // ---- D: Weavero disabled while the plugin runs -----------------------------------------

    it("D: Weavero disabled while the plugin runs -- the plugin's folders and patches survive; nothing of Weavero stays", async function () {
        if (!installed) this.skip();
        /** @type {any} */ const D = F.D = {};
        const broken = [];
        await step(D, "before", async () => ({ summary: summary(), members: members() }));
        await disableWeavero();
        await step(D, "after", async () => ({
            members: members(), summary: summary(), ssfStillThinksActive: !!st(),
            root: await rowDom(rid([])), people: await rowDom(rid(["People"])), marie: await rowDom("S" + S.marie.id),
            shot: await shot("D1-weavero-off"),
        }));
        const mem = (D.after && D.after.members) || members();
        check(D, broken, !!(D.after && D.after.summary && D.after.summary.root), "D: the plugin's folders are still there with Weavero off");
        check(D, broken, ["_expandRow", "isContainerEmpty", "toggleOpenState", "notify"].every((m) => mem.instance[m].who === "ssf"), "D: the plugin's _expandRow / isContainerEmpty / toggleOpenState / notify still in place (" + ["_expandRow", "isContainerEmpty", "toggleOpenState", "notify"].map((m) => m + "=" + mem.instance[m].who).join(", ") + ")");
        D.weaveroInSlots = heldBy(mem, /^weavero/);
        check(D, broken, !D.weaveroInSlots.length, "D: no Weavero function in the tree's members with Weavero off (" + D.weaveroInSlots.join(", ") + ")");
        await step(D, "refresh", async () => {
            await race(cvOf().refresh(), 8000);
            try { cvOf().tree.invalidate(); cvOf().selection.selectEventsSuppressed = false; } catch (e) {}
            await sleep(500);
            return { summary: summary(), people: await rowDom(rid(["People"])) };
        });
        check(D, broken, !!(D.refresh && D.refresh.summary && D.refresh.summary.root), "D: the folders survive a refresh with Weavero off");
        await step(D, "toggle", async () => (present(rid(["People"])) ? { open: await setFolder(["People"], true), close: await setFolder(["People"], false) } : { people: false }));
        await step(D, "addSearch", async () => {
            const s = await mkSearch("People/Marie Sklodowska", "marie", LIB(), {});
            await sleep(2000);
            /** @type {any} */ const r = { level: present("S" + s.id) ? cvOf().getRow(at("S" + s.id)).level : null, summary: summary() };
            await s.eraseTx();
            await sleep(1500);
            return r;
        });
        check(D, broken, D.addSearch.level > 2, "D: a new search lands in its folder with Weavero off");
        D.errors = takeErrors();
        // Then the plugin goes too, with Weavero still off: what its restore writes back.
        await ssfDisable();
        await step(D, "bothOff", async () => ({ members: members(), summary: summary(), errors: takeErrors() }));
        // What the plugin's shutdown writes back is what it found: Weavero's functions, its
        // own capture (F3, the plugin's side: searchFolders.js 661-668 restores
        // unconditionally). Recorded; what Weavero owes is that they act no more -- each is
        // a pass-through to what is below it (lib/wrap.ts stubs, 2026-11-27).
        D.bothOffWeavero = D.bothOff && D.bothOff.members ? heldBy(D.bothOff.members, /^weavero/) : ["(not read)"];
        await step(D, "bothOffRefresh", async () => {
            const e0 = takeErrors();
            await race(cvOf().refresh(), 8000);
            try { cvOf().tree.invalidate(); cvOf().selection.selectEventsSuppressed = false; } catch (e) {}
            await sleep(500);
            return {
                summary: summary(), errorsBefore: e0, errors: takeErrors(), pierreShown: present("S" + S.pierre.id), colShown: present("C" + S.C1.id),
                weaveroLayers: INST.map((m) => layersOf(cvOf(), m).map((l) => m + ":" + l)).reduce((a, b) => a.concat(b), []),
                marie: await rowDom("S" + S.marie.id),
            };
        });
        const bo = D.bothOffRefresh || {};
        check(D, broken, !!(bo.summary && !bo.summary.root && bo.pierreShown === true && bo.colShown === true && bo.errors && !bo.errors.console.length
            && Array.isArray(bo.weaveroLayers) && !bo.weaveroLayers.length),
            "D: both plugins off, what the plugin's restore left of Weavero's (" + D.bothOffWeavero.join(", ") + ") passes straight through: Zotero's own rows, nothing hidden, no Weavero layer, no error ("
            + JSON.stringify({ root: bo.summary && bo.summary.root, pierre: bo.pierreShown, col: bo.colShown, layers: bo.weaveroLayers, errors: bo.errors && bo.errors.console }) + ")");
        // The plugin alone: the reference for its own behaviour.
        await step(D, "pluginAlone", async () => ({
            ok: await ssfEnable(), members: members(), summary: summary(), people: await rowDom(rid(["People"])),
            toggle: await setFolder(["People"], true), shot: await shot("D2-plugin-alone"),
        }));
        // Weavero enabled again over the plugin: what a startup where the plugin patched first does.
        await step(D, "weaveroBack", async () => {
            const ok = await enableWeavero();
            /** @type {any} */ const r = {
                ok, members: members(), summary: summary(), people: await rowDom(rid(["People"])),
                hiddenStill: { pierre: present("S" + S.pierre.id), col: present("C" + S.C1.id) }, shot: await shot("D3-weavero-back"),
            };
            await live()._wvHidRefreshWin(win);
            await sleep(500);
            r.afterRefresh = { summary: summary(), members: members().instance };
            return r;
        });
        const wb = D.weaveroBack || {};
        check(D, broken, !!(wb.summary && wb.summary.root && wb.afterRefresh && wb.afterRefresh.summary && wb.afterRefresh.summary.root), "D: the plugin's folders still there once Weavero is enabled again over it");
        D.errors2 = takeErrors();
        await save();
        assert.deepEqual(broken, [], "D broken: " + broken.join("; "));
    });
});
