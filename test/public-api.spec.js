/* global describe, it, before, after, assert, Zotero, Services, wvT */

// The public API for other plugins: Zotero.Weavero.api (src/lib/public-api.ts,
// docs/plugin-api.md; MJT 2026-11-11, "I want to be proactive in offering
// tools"). And the route two plugins took before it existed -- Annotation
// Markdown (v0.6.1+) and Rich Annotation send zotero:// clicks to
// Zotero.Weavero.plugin.handleZoteroURI and read weavero.recolorAmLinks and
// the --wv-link-* colours -- locked here too: a rename would break both
// without an error (plugin survey 2026-11-11).

// Part 2 (MJT 2026-11-11, the study work/plugin-api-part2-study-2026-11-11.md,
// items 1, 2, 4, 5 then 3): each call's cases below, written before its code.
// Every result must survive a structured copy (zotero#6080's channel).
const wvApiPlain = (v) => JSON.parse(JSON.stringify(v));

/** A local group library (upstream's createGroup pattern, as filter.spec.js):
 *  a random id, never a real group's. */
async function wvApiMkGroup(name) {
    let uid = Zotero.Users.getCurrentUserID();
    if (!uid) { await Zotero.Users.setCurrentUserID(1); uid = 1; }
    if (!Zotero.Users.getName(uid)) await Zotero.Users.setName(uid, "WV Test User");
    const g = /** @type {any} */ (new Zotero.Group());
    g.id = Zotero.Utilities.rand(100000, 900000);
    g.name = "WV-TEST " + name + " " + Zotero.Utilities.randomString(4);
    g.description = "";
    g.editable = true;
    g.filesEditable = true;
    g.version = Zotero.Utilities.rand(1000, 10000);
    await g.saveTx();
    return g;
}

describe("Weavero — the public API for other plugins (Zotero.Weavero.api)", () => {
    let wv, api, item, att;
    const ENTRIES = ["apiVersion", "buildLink", "canOpenLink", "declareCommentRenderer", "entries", "getBacklinks", "getLinksFrom", "getReaderSidebarView", "isReady", "linkColors", "linkKind", "openLink", "parseLink", "version", "withdrawCommentRenderer"];
    const CALLS = { buildLink: 1, canOpenLink: 1, declareCommentRenderer: 1, getBacklinks: 1, getLinksFrom: 1, getReaderSidebarView: 1, isReady: 1, linkColors: 1, linkKind: 1, openLink: 2, parseLink: 1, withdrawCommentRenderer: 1 };

    before(async function () {
        this.timeout(30000);
        wv = wvT.plugin();
        api = Zotero.Weavero && Zotero.Weavero.api;
        if (!wv) wvT.absent("Zotero.Weavero.plugin");
        if (!api) wvT.absent("Zotero.Weavero.api");
        item = await wvT.createItem("journalArticle", { title: "WV-TEST public api" });
    });

    after(async function () {
        this.timeout(30000);
        if (att) { try { for (const r of (Zotero.Reader._readers || []).filter(x => x.itemID === att.id)) wvT.closeReaderTab(r); } catch (e) {} }
        await wvT.erase(att, item);
    });

    it("is frozen, version 1, Weavero's version beside it, and holds exactly the documented entries", () => {
        assert.isTrue(Object.isFrozen(api), "frozen: a caller cannot replace an entry for the others");
        assert.strictEqual(api.apiVersion, 1);
        assert.strictEqual(api.version, wv._version);
        assert.deepEqual(Object.keys(api).sort(), ENTRIES, "a new entry goes into docs/plugin-api.md and this list");
        // One version per callable entry, as zotero#6080's channel versions each command.
        assert.deepEqual(JSON.parse(JSON.stringify(api.entries)), CALLS);
        assert.isTrue(Object.isFrozen(api.entries));
        for (const k of Object.keys(CALLS)) assert.isFunction(api[k], k);
        assert.isTrue(api.isReady());
    });

    it("canOpenLink: the four zotero:// actions Weavero opens, nothing else, never a throw", () => {
        for (const u of ["zotero://select/library/items/ABCD1234", "zotero://open/library/items/ABCD1234?page=2",
            "zotero://open-pdf/groups/1/items/ABCD1234", "zotero://note/u/ABCD1234", "ZOTERO://select/library/items/ABCD1234"]) {
            assert.isTrue(api.canOpenLink(u), u);
        }
        for (const u of ["https://www.zotero.org", "zotero://attachment/library/items/X", "obsidian://open?vault=x", "", null, undefined, 42, {}]) {
            assert.isFalse(api.canOpenLink(u), String(u));
        }
    });

    it("linkKind: Weavero's three link colours, by scheme", () => {
        assert.strictEqual(api.linkKind("zotero://select/library/items/ABCD1234"), "zotero");
        assert.strictEqual(api.linkKind("https://www.zotero.org"), "http");
        assert.strictEqual(api.linkKind("www.zotero.org"), "http");
        assert.strictEqual(api.linkKind("obsidian://open?vault=x"), "app");
        assert.strictEqual(api.linkKind("mailto:someone@example.org"), "app");
        assert.strictEqual(api.linkKind(null), "http");
    });

    it("linkColors: plain data, both themes, `enabled` following weavero.recolorAmLinks", async () => {
        const c = api.linkColors();
        assert.deepEqual(Object.keys(c).sort(), ["dark", "enabled", "light"]);
        for (const s of ["light", "dark"]) {
            assert.deepEqual(Object.keys(c[s]).sort(), ["app", "http", "zotero"]);
            for (const k of ["app", "http", "zotero"]) assert.match(c[s][k], /^#[0-9a-f]{6}$/i, s + "." + k);
        }
        assert.strictEqual(JSON.stringify(JSON.parse(JSON.stringify(c))), JSON.stringify(c), "survives a structured copy (zotero#6080's channel)");
        assert.isTrue(Services.prefs.getDefaultBranch("extensions.zotero.").getBoolPref("weavero.recolorAmLinks"), "on by default");
        await wvT.withPref("weavero.recolorAmLinks", false, async () => {
            assert.isFalse(api.linkColors().enabled);
        });
        assert.isTrue(api.linkColors().enabled);
    });

    it("openLink: a zotero://select link selects its item; false for a link it does not open", async function () {
        // Version 2 opens web and app links too (their cases, with the
        // launcher stubbed, are under "openLink for every scheme" below).
        this.timeout(20000);
        const win = wvT.win();
        await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        const p = api.openLink("zotero://select/library/items/" + item.key);
        assert.isFunction(p && p.then, "a promise (duck-typed: it comes from the plugin's global)");
        assert.isTrue(await p);
        const sel = await wvT.waitFor(() => {
            const ids = win.ZoteroPane.getSelectedItems().map(x => x.id);
            return ids.includes(item.id) ? ids : null;
        }, 10000);
        assert.isOk(sel, "the item is selected");
        assert.isFalse(await api.openLink("zotero://attachment/library/items/" + item.key));
        assert.isFalse(await api.openLink(undefined));
    });

    it("answers false, without a throw, once Weavero is shut down (a caller may hold the object)", async () => {
        const was = wv._wvDestroyed;
        let p;
        try {
            wv._wvDestroyed = true;
            assert.isFalse(api.isReady());
            assert.isFalse(api.linkColors().enabled);
            assert.isTrue(api.canOpenLink("zotero://select/library/items/ABCD1234"), "a pure check stays true");
            p = api.openLink("zotero://select/library/items/" + item.key);
        }
        finally { wv._wvDestroyed = was; }
        assert.isFalse(await p);
    });

    // ------------------------------------------------ the route before the API
    it("the old route stays: Zotero.Weavero.plugin.handleZoteroURI, the pref, the colour variables on a main window", () => {
        assert.isFunction(Zotero.Weavero.plugin.handleZoteroURI, "Annotation Markdown and Rich Annotation call it");
        const v = wvT.win().getComputedStyle(wvT.win().document.documentElement);
        for (const k of ["--wv-link-http", "--wv-link-zotero", "--wv-link-app"]) {
            assert.match(v.getPropertyValue(k).trim(), /^#[0-9a-f]{6}$/i, k + " on the main window's root");
        }
    });

    it("the colour variables are on a reader's own document too (where Annotation Markdown's previews live)", async function () {
        this.timeout(45000);
        att = await wvT.createTestPDFItem("wv-public-api");
        const r = await wvT.openReaderTab(att.id);
        assert.isOk(r, "a reader");
        const doc = r._iframeWindow && r._iframeWindow.document;
        const got = await wvT.waitFor(() => {
            try {
                const v = r._iframeWindow.getComputedStyle(doc.documentElement).getPropertyValue("--wv-link-zotero").trim();
                return v || null;
            }
            catch (e) { return null; }
        }, 15000);
        assert.match(String(got), /^#[0-9a-f]{6}$/i, "--wv-link-zotero on the reader document's root");
    });
});

// ------------------------------------------------------------ part 2, item 2
// The link grammar: what other plugins read wrong (the study: a select link
// scoped to a collection read as a collection link; Weavero's
// `zotero://open/...?annotation=` invisible to a parser that knows open-pdf
// only) and the "Copy ... link" utilities that write their own forms.
describe("Weavero — public API: parseLink and buildLink", function () {
    this.timeout(60000);
    let wv, api, P, Q, A, X, N, C, G, GP, GN;
    const HID = "wv-api-h";
    const FIELDS = ["action", "annotationKey", "collectionKey", "groupID", "heading", "keys", "kind", "page", "searchKey"];
    const parsed = (o) => Object.assign({ action: null, annotationKey: null, collectionKey: null, groupID: null, heading: null, keys: [], kind: null, page: null, searchKey: null }, o);

    before(async function () {
        wv = wvT.plugin();
        api = Zotero.Weavero && Zotero.Weavero.api;
        if (!wv) wvT.absent("plugin");
        if (!api || typeof api.parseLink !== "function" || typeof api.buildLink !== "function") wvT.absent("api.parseLink / api.buildLink");
        P = await wvT.createItem("journalArticle", { title: "WV-API P" });
        Q = await wvT.createItem("book", { title: "WV-API Q, nothing to open" });
        A = await wvT.createTestPDFItem("wv-api-a", { parentItemID: P.id });
        X = /** @type {any} */ (new Zotero.Item("annotation"));
        X.libraryID = A.libraryID; X.parentID = A.id;
        X.annotationType = "highlight"; X.annotationText = "api fixture"; X.annotationComment = "";
        X.annotationColor = "#ffd400"; X.annotationPageLabel = "1";
        X.annotationSortIndex = "00000|000010|00000";
        X.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10, 60, 20]] });
        await X.saveTx();
        N = new Zotero.Item("note");
        N.libraryID = Zotero.Libraries.userLibraryID;
        N.setNote('<h1>WV-API note</h1><h2 id="' + HID + '">Methods</h2><p>text</p>');
        await N.saveTx();
        C = new Zotero.Collection();
        C.libraryID = Zotero.Libraries.userLibraryID;
        C.name = "WV-API collection";
        await C.saveTx();
        P.addToCollection(C.id);
        await P.saveTx();
        G = await wvApiMkGroup("api links");
        GP = new Zotero.Item("journalArticle");
        GP.libraryID = G.libraryID; GP.setField("title", "WV-API group paper");
        await GP.saveTx();
        GN = new Zotero.Item("note");
        GN.libraryID = G.libraryID; GN.setNote("<p>WV-API group note</p>");
        await GN.saveTx();
    });

    after(async function () {
        await wvT.erase(N, Q, P);
        try { if (C) await C.eraseTx(); } catch (e) {}
        try { if (G) await Zotero.Groups.get(G.id).eraseTx(); } catch (e) {}
    });

    it("parseLink reads every form Weavero writes or opens, all fields present, plain data", () => {
        /** @type {Array<[string, object]>} */
        const cases = [
            ["zotero://select/library/items/ABCD2345", { kind: "select", action: "select", keys: ["ABCD2345"] }],
            ["zotero://select/groups/123456/items/ABCD2345", { kind: "select", action: "select", groupID: 123456, keys: ["ABCD2345"] }],
            ["zotero://select/library/items?itemKey=ABCD2345,EFGH6789", { kind: "select", action: "select", keys: ["ABCD2345", "EFGH6789"] }],
            // The study's mobench case: an item inside a collection, not a collection link.
            ["zotero://select/groups/123456/collections/CCCC2345/items/ABCD2345", { kind: "select", action: "select", groupID: 123456, keys: ["ABCD2345"], collectionKey: "CCCC2345" }],
            ["zotero://select/library/collections/CCCC2345", { kind: "collection", action: "select", collectionKey: "CCCC2345" }],
            ["zotero://select/groups/123456/searches/SSSS2345", { kind: "search", action: "select", groupID: 123456, searchKey: "SSSS2345" }],
            ["zotero://select/library/searches/SSSS2345/items/ABCD2345", { kind: "select", action: "select", keys: ["ABCD2345"], searchKey: "SSSS2345" }],
            // The study's yuukibarns case: Weavero's open form with an annotation.
            ["zotero://open/library/items/ABCD2345?page=3&annotation=AAAA2345", { kind: "open", action: "open", keys: ["ABCD2345"], page: "3", annotationKey: "AAAA2345" }],
            ["zotero://open/library/items/ABCD2345?page=2&amp;annotation=AAAA2345", { kind: "open", action: "open", keys: ["ABCD2345"], page: "2", annotationKey: "AAAA2345" }],
            ["zotero://open-pdf/groups/123456/items/ABCD2345?page=12", { kind: "open-pdf", action: "open-pdf", groupID: 123456, keys: ["ABCD2345"], page: "12" }],
            ["zotero://note/u/ABCD2345/", { kind: "note", action: "note", keys: ["ABCD2345"] }],
            ["zotero://note/u/ABCD2345/?line=3", { kind: "note", action: "note", keys: ["ABCD2345"] }],
            ["zotero://note/123456/ABCD2345/", { kind: "note", action: "note", groupID: 123456, keys: ["ABCD2345"] }],
            // The study read wvBlParseLink as null for these two (backlinks.ts
            // :536-539); it is not -- locked here.
            ["zotero://note/g/123456/ABCD2345/", { kind: "note", action: "note", groupID: 123456, keys: ["ABCD2345"] }],
            ["zotero://note/groups/123456/ABCD2345", { kind: "note", action: "note", groupID: 123456, keys: ["ABCD2345"] }],
            ["zotero://select/library/items/ABCD2345?wvheading=" + HID, { kind: "heading", action: "select", keys: ["ABCD2345"], heading: HID }],
            ["zotero://note/u/ABCD2345/?wvheading=" + HID, { kind: "heading", action: "note", keys: ["ABCD2345"], heading: HID }],
            ["ZOTERO://select/library/items/ABCD2345", { kind: "select", action: "select", keys: ["ABCD2345"] }],
        ];
        for (const [url, want] of cases) {
            const got = api.parseLink(url);
            assert.isOk(got, url);
            assert.deepEqual(Object.keys(got).sort(), FIELDS, url + ": every field, null where absent");
            assert.deepEqual(got, parsed(want), url);
            assert.deepEqual(wvApiPlain(got), got, url + ": plain data");
        }
    });

    it("parseLink: null for anything that is not one of those links, never a throw", () => {
        const bad = { get key() { throw new Error("boom"); } };
        for (const u of ["https://www.zotero.org", "zotero://attachment/library/items/ABCD2345", "zotero://select/library",
            "zotero://select/groups/abc/items/ABCD2345", "zotero://open/library/items/", "zotero://select/library/items/not-a-key",
            "zotero://select/library/collections/O0O0O0O0", "obsidian://open?vault=x",
            "", "   ", null, undefined, 42, {}, [], bad]) {
            assert.isNull(api.parseLink(u), String(u));
        }
    });

    it("parseLink resolves the legacy forms in this profile (the ZotFile <libraryID>_<key>, a numeric item id)", () => {
        const lib = Zotero.Libraries.userLibraryID;
        assert.deepEqual(api.parseLink("zotero://open-pdf/" + lib + "_" + A.key + "/5"),
            parsed({ kind: "open-pdf", action: "open-pdf", keys: [A.key], page: "5" }));
        assert.deepEqual(api.parseLink("zotero://select/items/" + P.id),
            parsed({ kind: "select", action: "select", keys: [P.key] }));
        assert.deepEqual(api.parseLink("zotero://select/items/" + lib + "_" + P.key),
            parsed({ kind: "select", action: "select", keys: [P.key] }));
    });

    const ref = (it) => ({ groupID: it.libraryID === Zotero.Libraries.userLibraryID ? null : Zotero.Groups.getGroupIDFromLibraryID(it.libraryID), key: it.key });

    it("buildLink writes Weavero's own forms: select (collection-scoped), open (annotation), note, heading", () => {
        const ok = (args, url) => {
            const r = api.buildLink(args);
            assert.deepEqual(r, { ok: true, url }, JSON.stringify(args));
            assert.deepEqual(wvApiPlain(r), r);
            return r;
        };
        ok({ item: ref(P), form: "select" }, "zotero://select/library/items/" + P.key);
        ok({ item: ref(P), form: "select", collectionKey: C.key }, "zotero://select/library/collections/" + C.key + "/items/" + P.key);
        ok({ item: ref(A), form: "open" }, "zotero://open/library/items/" + A.key);
        ok({ item: ref(A), form: "open", annotationKey: X.key }, "zotero://open/library/items/" + A.key + "?annotation=" + X.key);
        ok({ item: ref(X), form: "open" }, "zotero://open/library/items/" + A.key + "?annotation=" + X.key);
        ok({ item: ref(P), form: "open" }, "zotero://open/library/items/" + P.key);
        ok({ item: ref(N), form: "note" }, "zotero://note/u/" + N.key + "/");
        ok({ item: ref(N), form: "heading", heading: HID }, "zotero://select/library/items/" + N.key + "?wvheading=" + HID);
        ok({ item: ref(N), form: "note", heading: HID }, "zotero://note/u/" + N.key + "/?wvheading=" + HID);
        // The item key in a group library, by its group id.
        ok({ item: ref(GP), form: "select" }, "zotero://select/groups/" + G.id + "/items/" + GP.key);
        ok({ item: ref(GN), form: "note" }, "zotero://note/" + G.id + "/" + GN.key + "/");
    });

    it("buildLink and parseLink round-trip the item", () => {
        for (const [it, form, extra] of [[P, "select"], [A, "open"], [N, "note"], [N, "heading", { heading: HID }], [GP, "select"], [GN, "note"]]) {
            const r = api.buildLink(Object.assign({ item: ref(it), form }, extra || {}));
            const p = api.parseLink(r.url);
            assert.strictEqual(p.groupID, ref(it).groupID, r.url);
            assert.deepEqual(p.keys, [it.key], r.url);
        }
    });

    it("buildLink: an error as data, never a throw", () => {
        const err = (args, error, label) => {
            const r = api.buildLink(args);
            assert.deepEqual(r, { ok: false, url: null, error }, label || JSON.stringify(args));
        };
        const bad = { get item() { throw new Error("boom"); } };
        const bads = [undefined, null, 42, "zotero://x", {}, { item: ref(P) }, { item: ref(P), form: "nope" },
            { item: { key: 42 }, form: "select" }, { item: { groupID: "x", key: P.key }, form: "select" },
            { item: ref(P), form: "select", annotationKey: X.key }, { item: ref(N), form: "heading" },
            { item: ref(P), form: "select", heading: HID }, bad];
        bads.forEach((a, i) => err(a, "bad-arguments", "bad argument #" + i));
        err({ item: { groupID: null, key: "ZZZZ2345" }, form: "select" }, "no-such-item");
        err({ item: { groupID: 987654321, key: P.key }, form: "select" }, "no-such-group");
        err({ item: ref(Q), form: "open" }, "no-link");
        err({ item: ref(P), form: "note" }, "not-a-note");
        err({ item: ref(N), form: "heading", heading: "no-such-id" }, "no-such-heading");
        err({ item: ref(A), form: "open", annotationKey: "ZZZZ2345" }, "no-such-annotation");
        err({ item: ref(P), form: "select", collectionKey: "ZZZZ2345" }, "no-such-collection");
    });

    it("answers null / an error once Weavero is shut down (a caller may hold the object)", () => {
        const was = wv._wvDestroyed;
        try {
            wv._wvDestroyed = true;
            assert.isNull(api.parseLink("zotero://select/library/items/ABCD2345"));
            assert.deepEqual(api.buildLink({ item: ref(P), form: "select" }), { ok: false, url: null, error: "not-running" });
        }
        finally { wv._wvDestroyed = was; }
    });
});

// ------------------------------------------------------------ part 2, item 4
// openLink for every scheme (version 2): Annotation Markdown and Rich
// Annotation hand web and app links to Zotero.launchURL, past the user's
// Weavero rules -- the schemes turned on in Settings and "open without
// confirmation" (url.ts `_launchURL`). The launcher is stubbed: nothing opens
// on the test machine.
describe("Weavero — public API: openLink for every scheme (version 2)", function () {
    let wv, api, launched, handled, zl, origZL;

    before(function () {
        wv = wvT.plugin();
        api = Zotero.Weavero && Zotero.Weavero.api;
        if (!wv || !api) wvT.absent("plugin / api");
        wvT.method("_launchURL");
        origZL = Zotero.launchURL;
    });

    beforeEach(function () {
        launched = []; handled = []; zl = [];
        wv._launchURL = (u) => { launched.push(u); };
        wv.handleZoteroURI = async (u) => { handled.push(u); };
        Zotero.launchURL = (u) => { zl.push(u); };
    });

    afterEach(function () {
        delete wv._launchURL;
        delete wv.handleZoteroURI;
        Zotero.launchURL = origZL;
    });

    it("entries.openLink is 2; apiVersion stays 1 (a caller of version 1 is not broken)", () => {
        assert.strictEqual(api.entries.openLink, 2);
        assert.strictEqual(api.apiVersion, 1);
    });

    it("a web link goes through Weavero's launcher and answers true", async () => {
        assert.isTrue(await api.openLink("https://www.zotero.org/support"));
        assert.isTrue(await api.openLink("www.zotero.org"));
        assert.deepEqual(launched, ["https://www.zotero.org/support", "www.zotero.org"]);
        assert.deepEqual(zl, [], "never Zotero.launchURL directly");
    });

    it("an app link only when the user turned its scheme on (App links, then the scheme); otherwise false", async () => {
        assert.isFalse(await api.openLink("mailto:someone@example.org"), "App links are off by default");
        await wvT.withPref("weavero.enableAppLinks", true, () => wvT.withPref("weavero.enableMailtoScheme", true, async () => {
            assert.isTrue(await api.openLink("mailto:someone@example.org"));
            assert.isFalse(await api.openLink("obsidian://open?vault=x"), "a scheme the user did not turn on");
        }));
        assert.deepEqual(launched, ["mailto:someone@example.org"]);
    });

    it("web links turned off in Settings, or Links & Relations off: false", async () => {
        await wvT.withPref("weavero.enableInlineUrls", false, async () => {
            assert.isFalse(await api.openLink("https://www.zotero.org"));
        });
        await wvT.withPref("weavero.enableLinksAndRelations", false, async () => {
            assert.isFalse(await api.openLink("https://www.zotero.org"));
        });
        assert.deepEqual(launched, []);
    });

    it("never a scheme Zotero refuses, never garbage", async () => {
        for (const u of ["javascript:alert(1)", "data:text/html,hi", "chrome://zotero/content/x", "resource://x/y",
            "about:config", "", "  ", "no scheme here", null, undefined, 42, {}]) {
            assert.isFalse(await api.openLink(u), String(u));
        }
        assert.deepEqual(launched, []);
        assert.deepEqual(zl, []);
    });

    it("zotero:// links keep version 1's behaviour exactly: Weavero's handler, never the launcher", async () => {
        assert.isTrue(await api.openLink("zotero://select/library/items/ABCD2345"));
        assert.isTrue(await api.openLink("zotero://note/u/ABCD2345/"));
        assert.deepEqual(handled, ["zotero://select/library/items/ABCD2345", "zotero://note/u/ABCD2345/"]);
        assert.isFalse(await api.openLink("zotero://attachment/library/items/ABCD2345"), "an action Weavero does not open");
        assert.isFalse(await api.openLink("zotero://debug/"));
        assert.deepEqual(launched, []);
        assert.deepEqual(zl, []);
    });

    it("false once Weavero is shut down, whatever the scheme", async () => {
        const was = wv._wvDestroyed;
        let p1, p2;
        try {
            wv._wvDestroyed = true;
            p1 = api.openLink("https://www.zotero.org");
            p2 = api.openLink("zotero://select/library/items/ABCD2345");
        }
        finally { wv._wvDestroyed = was; }
        assert.isFalse(await p1);
        assert.isFalse(await p2);
        assert.deepEqual(launched, []);
    });
});

// ------------------------------------------------------------ part 2, item 5
// Which view the reader sidebar shows. Zotero has no sidebar-tab API
// (reader.js), and Weavero's Outline and Bookmarks replace or join Zotero's
// views: Jasminum's and Bookmark Editor's panels stack on Weavero's, Paper
// Outline and OCRFlow draw under Weavero's outline, Paper Outline clicks the
// Outline tab itself (the study).
describe("Weavero — public API: getReaderSidebarView", function () {
    this.timeout(90000);
    let wv, api, att, reader, idoc, ir;
    const sc = () => idoc.getElementById("sidebarContainer");
    const view = () => api.getReaderSidebarView({ readerTabId: reader.tabID });

    before(async function () {
        wv = wvT.plugin();
        api = Zotero.Weavero && Zotero.Weavero.api;
        if (!wv) wvT.absent("plugin");
        if (!api || typeof api.getReaderSidebarView !== "function") wvT.absent("api.getReaderSidebarView");
        att = await wvT.createTestPDFItem("wv-api-sidebar");
        reader = await wvT.openReaderTab(att.id);
        assert.isOk(reader && reader.tabID, "a reader tab");
        idoc = reader._iframeWindow.document;
        ir = Components.utils.waiveXrays(reader._internalReader);
        try { ir.toggleSidebar(true); } catch (e) {}
        try { ir.setSidebarView("annotations"); } catch (e) {}
        assert.isOk(await wvT.waitFor(() => idoc.querySelector(".wv-bm-reader-tab"), 30000), "Weavero's Bookmarks tab");
    });

    after(async function () {
        try { wv._wvReaderSetBmActive(reader, idoc, false); } catch (e) {}
        wvT.closeReaderTab(reader);
        await wvT.erase(att);
    });

    it("null for bad arguments and for a tab that is no reader, never a throw", () => {
        const bad = { get readerTabId() { throw new Error("boom"); } };
        for (const a of [undefined, null, 42, "x", {}, { readerTabId: 42 }, { readerTabId: "" }, { readerTabId: "no-such-tab" }, bad]) {
            assert.isNull(api.getReaderSidebarView(a));
        }
        const lib = wvT.win().Zotero_Tabs._tabs[0];
        assert.isNull(api.getReaderSidebarView({ readerTabId: lib && lib.id }), "the library tab");
    });

    it("Zotero's own views by their name", async () => {
        ir.setSidebarView("thumbnails");
        assert.strictEqual(await wvT.waitFor(() => view() === "thumbnails" && view(), 5000), "thumbnails");
        ir.setSidebarView("annotations");
        assert.strictEqual(await wvT.waitFor(() => view() === "annotations" && view(), 5000), "annotations");
    });

    it("the Outline tab: Weavero's outline where it replaces Zotero's, Zotero's when the user turned that off", async () => {
        idoc.querySelector("#viewOutline").click();
        assert.isOk(await wvT.waitFor(() => sc().classList.contains("wv-outline-tab-on"), 10000), "Weavero's outline took the tab");
        assert.strictEqual(view(), "weavero-outline");
        await wvT.withPref("weavero.readerOutlineTakeover", false, async () => {
            assert.isOk(await wvT.waitFor(() => !sc().classList.contains("wv-outline-tab-on"), 10000), "Zotero's outline back");
            assert.strictEqual(view(), "outline");
        });
        idoc.querySelector("#viewAnnotations").click();
        assert.strictEqual(await wvT.waitFor(() => view() === "annotations" && view(), 5000), "annotations");
    });

    it("Weavero's Bookmarks tab", async () => {
        idoc.querySelector(".wv-bm-reader-tab").click();
        assert.isOk(await wvT.waitFor(() => sc().classList.contains("wv-bm-tab-on"), 10000), "Bookmarks on");
        assert.strictEqual(view(), "weavero-bookmarks");
        idoc.querySelector("#viewAnnotations").click();
        assert.isOk(await wvT.waitFor(() => !sc().classList.contains("wv-bm-tab-on"), 10000), "Bookmarks off");
        assert.strictEqual(view(), "annotations");
    });

    it("a string, and null once Weavero is shut down", () => {
        assert.isString(view());
        const was = wv._wvDestroyed;
        try {
            wv._wvDestroyed = true;
            assert.isNull(view());
        }
        finally { wv._wvDestroyed = was; }
    });
});

// ------------------------------------------------------------ part 2, item 1
// The comment-renderer handshake. Rich Annotation and zhoas md-annotations
// draw annotation comments themselves and Weavero draws its preview too:
// every comment twice. Annotation Markdown's docs ask for "an explicit
// behavior bridge" (the study). A plugin declares the surfaces it draws on;
// Weavero stands down there while the declaration stands -- in memory only,
// never past its plugin. The plugin here is real: a throwaway XPI this spec
// builds and installs, whose startup() declares itself through the API the
// way a renderer would.
describe("Weavero — public API: a plugin that draws comments itself (declareCommentRenderer)", function () {
    this.timeout(180000);
    const PID = "wv-api-test-renderer@weavero.test";
    const RAW = "see https://example.org/wv-api and **bold**";
    let wv, api, AM, addon, att, ann, reader, idoc, host, row, xpi;
    const card = () => idoc.querySelector('[data-sidebar-annotation-id="' + ann.key + '"]');
    const sidebarPreview = () => { const c = card(); return c && c.querySelector(".comment .wv-md-preview"); };
    const paneRendered = () => !!row.querySelector(".comment .wv-url-span");
    const paneText = () => { const c = row.querySelector(".comment"); return c ? c.textContent : null; };
    const recorded = () => /** @type {any} */ (Zotero)._wvTestApiRenderer || null;
    /** An in-PDF popup's comment, as the reader draws it, rendered by Weavero. */
    const popupPreview = () => {
        const wrap = idoc.createElement("div");
        wrap.className = "view-popup annotation-popup";
        const comment = idoc.createElement("div");
        comment.className = "comment";
        const content = idoc.createElement("div");
        content.className = "content";
        content.textContent = RAW;
        comment.appendChild(content);
        wrap.appendChild(comment);
        idoc.body.appendChild(wrap);
        try {
            wv._renderPreviewPanel(comment);
            return !!comment.querySelector(".wv-md-preview");
        }
        finally { wrap.remove(); }
    };

    /** The throwaway plugin: a manifest and a bootstrap whose startup()
     *  declares every surface and records the answer on the Zotero global. */
    async function buildXpi() {
        const Cc = Components.classes, Ci = Components.interfaces;
        const path = PathUtils.join(PathUtils.tempDir, "wv-api-test-renderer-" + Date.now() + ".xpi");
        const manifest = JSON.stringify({
            manifest_version: 2, name: "WV API test renderer", version: "1.0.0",
            applications: { zotero: { id: PID, update_url: "https://localhost/wv-api-test-renderer.json",
                strict_min_version: "6.999", strict_max_version: "99.*" } },
        });
        const bootstrap = [
            "var startup = async function ({ id }) {",
            "    let rec = { at: Date.now() };",
            "    try {",
            "        let api = Zotero.Weavero && Zotero.Weavero.api;",
            "        let r = api ? await api.declareCommentRenderer({ pluginId: id, surfaces: ['sidebar', 'popup', 'itemPane'] }) : { ok: false, error: 'no-api' };",
            "        rec.result = JSON.parse(JSON.stringify(r));",
            "    } catch (e) { rec.error = String(e); }",
            "    Zotero._wvTestApiRenderer = rec;",
            "};",
            "var shutdown = function () {};",
            "var install = function () {};",
            "var uninstall = function () {};",
        ].join("\n");
        const zw = Cc["@mozilla.org/zipwriter;1"].createInstance(Ci.nsIZipWriter);
        zw.open(Zotero.File.pathToFile(path), 0x04 | 0x08 | 0x20);
        try {
            for (const [name, text] of [["manifest.json", manifest], ["bootstrap.js", bootstrap]]) {
                const ss = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
                if (typeof ss.setUTF8Data === "function") ss.setUTF8Data(text);
                else if (typeof ss.setByteStringData === "function") ss.setByteStringData(text);
                else ss.setData(text, text.length);
                zw.addEntryStream(name, Date.now() * 1000, Ci.nsIZipWriter.COMPRESSION_DEFAULT, ss, false);
            }
        }
        finally { zw.close(); }
        return path;
    }

    before(async function () {
        wv = wvT.plugin();
        api = Zotero.Weavero && Zotero.Weavero.api;
        if (!wv) wvT.absent("plugin");
        if (!api || typeof api.declareCommentRenderer !== "function" || typeof api.withdrawCommentRenderer !== "function") wvT.absent("api.declareCommentRenderer / withdrawCommentRenderer");
        for (const m of ["_renderPreviewPanel", "_injectPaneRowIcon", "_wvApiCommentStandsDown"]) wvT.method(m);
        AM = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager;
        // The companion run leaves Annotation Markdown installed: it draws the
        // sidebar comment itself and Weavero stands down for it (reader.ts
        // _wvAmActiveInDoc), so the baseline below -- Weavero's own preview on
        // the card -- is not there to begin with (2026-11-13, the first full
        // companion run with this suite). plugin-compat.spec.js covers the pair.
        const am = await AM.getAddonByID("zotero-annotation-markdown@34028312.qq.com");
        if (am && am.isActive) this.skip();
        const stale = await AM.getAddonByID(PID);
        if (stale) await stale.uninstall();
        delete /** @type {any} */ (Zotero)._wvTestApiRenderer;
        att = await wvT.createTestPDFItem("wv-api-renderer");
        ann = /** @type {any} */ (new Zotero.Item("annotation"));
        ann.libraryID = att.libraryID; ann.parentID = att.id;
        ann.annotationType = "highlight"; ann.annotationText = "renderer fixture"; ann.annotationComment = RAW;
        ann.annotationColor = "#ffd400"; ann.annotationPageLabel = "1";
        ann.annotationSortIndex = "00000|000010|00000";
        ann.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10, 60, 20]] });
        await ann.saveTx();
        reader = await wvT.openReaderTab(att.id);
        assert.isOk(reader, "a reader");
        idoc = reader._iframeWindow.document;
        const ir = Components.utils.waiveXrays(reader._internalReader);
        try { ir.toggleSidebar(true); } catch (e) {}
        try { ir.setSidebarView("annotations"); } catch (e) {}
        assert.isOk(await wvT.waitFor(sidebarPreview, 30000), "baseline: Weavero draws its preview on the sidebar card");
        // An item-pane annotation row (attachmentAnnotationsBox draws these).
        const doc = wvT.win().document;
        host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        host.id = "wv-api-renderer-host";
        doc.documentElement.appendChild(host);
        row = doc.createXULElement("annotation-row");
        host.appendChild(row);
        row.annotation = ann;
        wv._injectPaneRowIcon(row);
        assert.isOk(await wvT.waitFor(paneRendered, 10000), "baseline: Weavero draws the item-pane comment");
        assert.isTrue(popupPreview(), "baseline: Weavero draws the popup comment");
    });

    after(async function () {
        this.timeout(60000);
        try { await api.withdrawCommentRenderer({ pluginId: PID }); } catch (e) {}
        try { const a = await AM.getAddonByID(PID); if (a) await a.uninstall(); } catch (e) {}
        delete /** @type {any} */ (Zotero)._wvTestApiRenderer;
        try { if (host) host.remove(); } catch (e) {}
        if (reader) wvT.closeReaderTab(reader);
        if (att) await wvT.erase(att);
        try { if (xpi) await IOUtils.remove(xpi); } catch (e) {}
    });

    it("bad arguments, an unknown plugin, Weavero itself: an error as data, never a throw", async () => {
        const bad = { get pluginId() { throw new Error("boom"); } };
        /** @type {Array<[any, string]>} */
        const cases = [[undefined, "bad-arguments"], [null, "bad-arguments"], ["x", "bad-arguments"],
            [{ pluginId: 42, surfaces: ["sidebar"] }, "bad-arguments"], [{ pluginId: PID }, "bad-arguments"],
            [{ pluginId: PID, surfaces: [] }, "bad-arguments"], [{ pluginId: PID, surfaces: ["nope"] }, "bad-arguments"],
            [{ pluginId: PID, surfaces: "sidebar" }, "bad-arguments"], [{ pluginId: "weavero@mjthoraval", surfaces: ["sidebar"] }, "bad-arguments"],
            [bad, "bad-arguments"], [{ pluginId: "no-such-plugin@weavero.test", surfaces: ["sidebar"] }, "unknown-plugin"]];
        for (let i = 0; i < cases.length; i++) {
            const p = api.declareCommentRenderer(cases[i][0]);
            assert.isFunction(p && p.then, "#" + i + ": a promise");
            assert.deepEqual(await p, { ok: false, error: cases[i][1] }, "#" + i);
        }
        assert.deepEqual(api.withdrawCommentRenderer(undefined), { ok: false, error: "bad-arguments" });
        assert.deepEqual(api.withdrawCommentRenderer({ pluginId: 42 }), { ok: false, error: "bad-arguments" });
        assert.deepEqual(api.withdrawCommentRenderer({ pluginId: "no-such-plugin@weavero.test" }), { ok: true }, "nothing to withdraw is no error");
        for (const sf of ["sidebar", "popup", "itemPane"]) assert.isFalse(wv._wvApiCommentStandsDown(sf), sf);
        assert.isOk(sidebarPreview(), "nothing stood down");
    });

    it("a plugin declaring from its own startup: Weavero stands down on the reader sidebar, the PDF popup and the item pane", async () => {
        xpi = await buildXpi();
        const install = await AM.getInstallForFile(Zotero.File.pathToFile(xpi));
        await install.install();
        addon = await AM.getAddonByID(PID);
        assert.isOk(addon && addon.isActive, "the test renderer is installed and active");
        const rec = await wvT.waitFor(() => recorded() && (recorded().result || recorded().error) && recorded(), 15000);
        assert.isOk(rec, "its startup ran");
        assert.deepEqual(rec.result, { ok: true, surfaces: ["itemPane", "popup", "sidebar"] }, JSON.stringify(rec));
        for (const sf of ["sidebar", "popup", "itemPane"]) assert.isTrue(wv._wvApiCommentStandsDown(sf), sf);
        assert.isOk(await wvT.waitFor(() => !sidebarPreview(), 10000), "the sidebar card has no Weavero preview");
        assert.isFalse(card().querySelector(".comment").classList.contains("wv-comment-preview"), "Zotero's comment shows");
        assert.isOk(await wvT.waitFor(() => !paneRendered(), 10000), "the item pane comment is Zotero's again");
        assert.strictEqual(paneText(), RAW, "as written, for the plugin to draw");
        assert.isFalse(popupPreview(), "the popup comment is not drawn by Weavero");
    });

    it("a second declaration replaces the first; a withdrawal gives each surface back", async () => {
        assert.deepEqual(await api.declareCommentRenderer({ pluginId: PID, surfaces: ["popup"] }), { ok: true, surfaces: ["popup"] });
        assert.isOk(await wvT.waitFor(sidebarPreview, 10000), "the sidebar preview is back");
        assert.isOk(await wvT.waitFor(paneRendered, 10000), "the item pane comment is drawn again");
        assert.isFalse(popupPreview(), "the popup stays the plugin's");
        assert.deepEqual(api.withdrawCommentRenderer({ pluginId: PID }), { ok: true });
        assert.isTrue(popupPreview(), "the popup is Weavero's again");
        for (const sf of ["sidebar", "popup", "itemPane"]) assert.isFalse(wv._wvApiCommentStandsDown(sf), sf);
    });

    it("the declaration goes with its plugin: a disable drops it, an enable declares again, an uninstall drops it", async () => {
        assert.isTrue(/** @type {any} */ (await api.declareCommentRenderer({ pluginId: PID, surfaces: ["sidebar", "itemPane"] })).ok);
        assert.isOk(await wvT.waitFor(() => !sidebarPreview(), 10000), "stood down");
        await addon.disable();
        assert.isOk(await wvT.waitFor(() => !wv._wvApiCommentStandsDown("sidebar"), 10000), "dropped when the plugin is disabled");
        assert.isOk(await wvT.waitFor(sidebarPreview, 10000), "Weavero draws again");
        assert.isOk(await wvT.waitFor(paneRendered, 10000));
        assert.deepEqual(await api.declareCommentRenderer({ pluginId: PID, surfaces: ["sidebar"] }), { ok: false, error: "inactive-plugin" });
        const before = recorded() && recorded().at;
        await addon.enable();
        const rec = await wvT.waitFor(() => recorded() && recorded().at !== before && (recorded().result || recorded().error) && recorded(), 15000);
        assert.isOk(rec, "its startup ran again");
        assert.deepEqual(rec.result, { ok: true, surfaces: ["itemPane", "popup", "sidebar"] }, "a plugin starting on enable can declare: " + JSON.stringify(rec));
        assert.isOk(await wvT.waitFor(() => !sidebarPreview(), 10000), "stood down again");
        await addon.uninstall();
        assert.isOk(await wvT.waitFor(() => !wv._wvApiCommentStandsDown("sidebar") && !wv._wvApiCommentStandsDown("popup"), 10000), "dropped when the plugin is uninstalled");
        assert.isOk(await wvT.waitFor(sidebarPreview, 10000), "Weavero draws again");
        assert.deepEqual(await api.declareCommentRenderer({ pluginId: PID, surfaces: ["sidebar"] }), { ok: false, error: "unknown-plugin" });
    });

    it("held in memory only: no setting and no file records a declaration", () => {
        const prefs = Services.prefs.getBranch("extensions.zotero.weavero.").getChildList("");
        assert.deepEqual(prefs.filter(k => /render|declar/i.test(k)), []);
        assert.notInclude(wvT.src("_wvApiDeclareCommentRenderer"), "wvStoreWrite");
    });

    it("destroy() gives back the AddonManager listener and forgets every declaration", () => {
        assert.include(wvT.src("destroy"), "_wvApiDestroy", "destroy() calls it");
        wv._wvApiDestroy();
        assert.isNotOk(wv._wvApiAddonL, "the listener is gone");
        for (const sf of ["sidebar", "popup", "itemPane"]) assert.isFalse(wv._wvApiCommentStandsDown(sf), sf);
    });

    it("not-running once Weavero is shut down", async () => {
        const was = wv._wvDestroyed;
        let p, w;
        try {
            wv._wvDestroyed = true;
            p = api.declareCommentRenderer({ pluginId: PID, surfaces: ["sidebar"] });
            w = api.withdrawCommentRenderer({ pluginId: PID });
        }
        finally { wv._wvDestroyed = was; }
        assert.deepEqual(await p, { ok: false, error: "not-running" });
        assert.deepEqual(w, { ok: false, error: "not-running" });
    });
});

// ------------------------------------------------------------ part 2, item 3
// Weavero's links index, read by other plugins: cabdoge pdf2notelink keeps a
// Notifier index of its own, yuukibarns runs paged SQL per request, forum
// 131059 and 130585 ask for backlinks (the study). getBacklinks lists what
// links an item, getLinksFrom what an item's notes and annotations link --
// the Backlinks and Links sections' data, as plain data.
describe("Weavero — public API: getBacklinks and getLinksFrom", function () {
    this.timeout(90000);
    let wv, api, T, TA, TX, S1, S2, SA, SX, G, GT, GS;
    const made = [];
    const ROW_FIELDS = ["excerpt", "internal", "locator", "page", "ref", "source", "sourceKind", "target", "url"];
    const LINK_FIELDS = ["broken", "internal", "locator", "page", "ref", "source", "sourceKind", "target", "url", "why"];
    const ref = (it) => ({ groupID: it.libraryID === Zotero.Libraries.userLibraryID ? null : Zotero.Groups.getGroupIDFromLibraryID(it.libraryID), key: it.key });
    const mkNote = async (libraryID, html, parentID) => {
        const n = new Zotero.Item("note");
        n.libraryID = libraryID;
        if (parentID) n.parentID = parentID;
        n.setNote(html);
        await n.saveTx();
        return n;
    };
    const attr = (o) => encodeURIComponent(JSON.stringify(o));
    const byKey = (rows, k) => rows.find(r => r.source.key === k);

    before(async function () {
        wv = wvT.plugin();
        api = Zotero.Weavero && Zotero.Weavero.api;
        if (!wv) wvT.absent("plugin");
        if (!api || typeof api.getBacklinks !== "function" || typeof api.getLinksFrom !== "function") wvT.absent("api.getBacklinks / getLinksFrom");
        const lib = Zotero.Libraries.userLibraryID;
        T = await wvT.createItem("journalArticle", { title: "WV-API backlinks target" });
        TA = await wvT.createTestPDFItem("wv-api-bl-ta", { parentItemID: T.id });
        TX = /** @type {any} */ (new Zotero.Item("annotation"));
        TX.libraryID = lib; TX.parentID = TA.id;
        TX.annotationType = "highlight"; TX.annotationText = "the quoted words"; TX.annotationComment = "";
        TX.annotationColor = "#ffd400"; TX.annotationPageLabel = "1";
        TX.annotationSortIndex = "00000|000010|00000";
        TX.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10, 60, 20]] });
        await TX.saveTx();
        // S1: a standalone note with a link to T and one to a key no item has.
        S1 = await mkNote(lib, '<p>Read <a href="zotero://select/library/items/' + T.key + '">the target</a> first, and the gone <a href="zotero://select/library/items/ZZZZ2345">gone</a> one.</p>');
        // S2: Zotero's own references, a citation of T at p. 12 and a quote of TX.
        S2 = await mkNote(lib, '<p>As shown <span class="citation" data-citation="' + attr({ citationItems: [{ uris: [Zotero.URI.getItemURI(T)], locator: "12" }], properties: {} })
            + '">(<span class="citation-item">Target, 2026, p. 12</span>)</span> before.</p><p><span class="highlight" data-annotation="'
            + attr({ attachmentURI: Zotero.URI.getItemURI(TA), annotationKey: TX.key, color: "#ffd400", pageLabel: "1", position: { pageIndex: 0, rects: [[10, 10, 60, 20]] } })
            + '">“the quoted words”</span></p>');
        // SX: an annotation comment linking TX through the open form, page 3.
        SA = await wvT.createTestPDFItem("wv-api-bl-sa");
        SX = /** @type {any} */ (new Zotero.Item("annotation"));
        SX.libraryID = lib; SX.parentID = SA.id;
        SX.annotationType = "highlight"; SX.annotationText = "source words";
        SX.annotationComment = "see zotero://open/library/items/" + TA.key + "?page=3&annotation=" + TX.key + " here";
        SX.annotationColor = "#ffd400"; SX.annotationPageLabel = "1";
        SX.annotationSortIndex = "00000|000020|00000";
        SX.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 40, 60, 50]] });
        await SX.saveTx();
        G = await wvApiMkGroup("api backlinks");
        GT = new Zotero.Item("journalArticle");
        GT.libraryID = G.libraryID; GT.setField("title", "WV-API group target");
        await GT.saveTx();
        GS = await mkNote(G.libraryID, '<p>In the group: <a href="zotero://select/groups/' + G.id + '/items/' + GT.key + '">its target</a>.</p>');
        made.push(S1, S2, SA, T);
        await wv._wvBlEnsure();
        // The index follows edits through Zotero's notifier, a moment after each save.
        assert.isOk(await wvT.waitFor(() => wv._wvBlDirect(T).length >= 2 && wv._wvBlDirect(TX).length >= 2 && wv._wvBlDirect(GT).length >= 1, 15000), "the index saw the fixtures");
    });

    after(async function () {
        await wvT.erase(...made);
        try { if (G) await Zotero.Groups.get(G.id).eraseTx(); } catch (e) {}
    });

    it("getBacklinks: what links an item and its children, each as plain data", async () => {
        const p = api.getBacklinks({ item: ref(T) });
        assert.isFunction(p && p.then, "a promise: the index may need building first");
        const r = await p;
        assert.isTrue(r.ok, JSON.stringify(r));
        assert.deepEqual(wvApiPlain(r), r);
        assert.deepEqual(Object.keys(r).sort(), ["backlinks", "ok", "total", "truncated"]);
        assert.strictEqual(r.total, r.backlinks.length);
        assert.isFalse(r.truncated);
        for (const row of r.backlinks) assert.deepEqual(Object.keys(row).sort(), ROW_FIELDS);
        const s1 = byKey(r.backlinks, S1.key);
        assert.deepEqual(s1, {
            source: { groupID: null, key: S1.key }, sourceKind: "standaloneNote", target: ref(T), ref: "link",
            url: "zotero://select/library/items/" + T.key, page: null, locator: null, internal: false,
            excerpt: { before: "Read", match: "the target", after: s1.excerpt.after },
        });
        assert.match(s1.excerpt.after, /^first, and the gone/);
        const cites = r.backlinks.filter(x => x.source.key === S2.key);
        const cite = cites.find(x => x.ref === "citation");
        assert.isOk(cite, "a note citation counts");
        assert.strictEqual(cite.locator, "12");
        assert.deepEqual(cite.target, ref(T));
        assert.strictEqual(cite.url, Zotero.URI.getItemURI(T), "a citation's url: the cited item's URI");
        const quote = cites.find(x => x.ref === "quote");
        assert.isOk(quote, "a quoted annotation counts for its paper (subtree)");
        assert.deepEqual(quote.target, ref(TX));
        assert.isNull(quote.url, "a quote has no link: its target is the annotation");
        const sx = byKey(r.backlinks, SX.key);
        assert.isOk(sx, "an annotation comment's link to T's annotation");
        assert.strictEqual(sx.sourceKind, "annotation");
        assert.deepEqual(sx.target, ref(TX));
        assert.strictEqual(sx.page, "3");
    });

    it("getBacklinks: scope \"own\" is the item's own links only; an annotation's own", async () => {
        const own = await api.getBacklinks({ item: ref(T), scope: "own" });
        assert.deepEqual(own.backlinks.map(x => x.source.key).sort(), [S1.key, S2.key].sort());
        assert.isTrue(own.backlinks.every(x => x.target.key === T.key));
        const ann = await api.getBacklinks({ item: ref(TX) });
        assert.deepEqual(ann.backlinks.map(x => x.source.key).sort(), [S2.key, SX.key].sort());
    });

    it("getBacklinks: a group item, by its group id", async () => {
        const r = await api.getBacklinks({ item: ref(GT) });
        assert.isTrue(r.ok);
        assert.lengthOf(r.backlinks, 1);
        assert.deepEqual(r.backlinks[0].source, { groupID: G.id, key: GS.key });
        assert.deepEqual(r.backlinks[0].target, { groupID: G.id, key: GT.key });
    });

    it("getBacklinks: at most `limit` rows (default 200, at most 1000), the total beside them", async () => {
        const r = await api.getBacklinks({ item: ref(T), limit: 1 });
        assert.lengthOf(r.backlinks, 1);
        assert.isAbove(r.total, 1);
        assert.isTrue(r.truncated);
    });

    it("getLinksFrom: a note's references in text order, a broken one included and marked", async () => {
        const r = await api.getLinksFrom({ item: ref(S1) });
        assert.isTrue(r.ok, JSON.stringify(r));
        assert.deepEqual(wvApiPlain(r), r);
        assert.deepEqual(Object.keys(r).sort(), ["links", "ok", "total", "truncated"]);
        for (const row of r.links) assert.deepEqual(Object.keys(row).sort(), LINK_FIELDS);
        assert.deepEqual(r.links, [
            { source: ref(S1), sourceKind: "standaloneNote", ref: "link", url: "zotero://select/library/items/" + T.key,
                target: ref(T), broken: false, why: null, page: null, locator: null, internal: false },
            { source: ref(S1), sourceKind: "standaloneNote", ref: "link", url: "zotero://select/library/items/ZZZZ2345",
                target: null, broken: true, why: "missing", page: null, locator: null, internal: false },
        ]);
        const c = await api.getLinksFrom({ item: ref(S2) });
        assert.deepEqual(c.links.map(x => [x.ref, x.target && x.target.key, x.locator]), [["citation", T.key, "12"], ["quote", TX.key, null]]);
    });

    it("getLinksFrom: an attachment lists its annotations' links (subtree), nothing of its own (\"own\")", async () => {
        const r = await api.getLinksFrom({ item: ref(SA) });
        assert.lengthOf(r.links, 1);
        assert.deepEqual(r.links[0].source, ref(SX));
        assert.deepEqual(r.links[0].target, ref(TX));
        assert.strictEqual(r.links[0].page, "3");
        const own = await api.getLinksFrom({ item: ref(SA), scope: "own" });
        assert.deepEqual(own.links, []);
        const g = await api.getLinksFrom({ item: ref(GS) });
        assert.deepEqual(g.links.map(x => x.target), [{ groupID: G.id, key: GT.key }]);
    });

    it("an error as data, never a throw", async () => {
        const bad = { get item() { throw new Error("boom"); } };
        for (const call of ["getBacklinks", "getLinksFrom"]) {
            const list = call === "getBacklinks" ? "backlinks" : "links";
            const cases = [undefined, null, 42, {}, { item: { key: 42 } }, { item: ref(T), scope: "nope" },
                { item: ref(T), limit: 0 }, { item: ref(T), limit: 1001 }, { item: ref(T), limit: 1.5 }, { item: ref(T), limit: "3" }, bad];
            for (let i = 0; i < cases.length; i++) {
                assert.deepEqual(await api[call](cases[i]), { ok: false, error: "bad-arguments", [list]: [] }, call + " #" + i);
            }
            assert.deepEqual(await api[call]({ item: { groupID: null, key: "ZZZZ2345" } }), { ok: false, error: "no-such-item", [list]: [] });
            assert.deepEqual(await api[call]({ item: { groupID: 987654321, key: T.key } }), { ok: false, error: "no-such-group", [list]: [] });
        }
    });

    it("not-running once Weavero is shut down", async () => {
        const was = wv._wvDestroyed;
        let a, b;
        try {
            wv._wvDestroyed = true;
            a = api.getBacklinks({ item: ref(T) });
            b = api.getLinksFrom({ item: ref(S1) });
        }
        finally { wv._wvDestroyed = was; }
        assert.deepEqual(await a, { ok: false, error: "not-running", backlinks: [] });
        assert.deepEqual(await b, { ok: false, error: "not-running", links: [] });
    });
});
