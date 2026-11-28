/* global describe, it, before, afterEach, assert, Zotero, Services */

// Zotero's updater keeps Firefox's "only instance" safeguard: while ANOTHER
// instance of the SAME installation runs (another profile, another user of the
// computer), its update CHECK awaits waitForOtherInstances() -- a poll every
// 5 min, for up to 6 h -- and canApplyUpdates stays false (UpdateService.sys.mjs
// isOtherInstanceRunning / waitForOtherInstances, read in the omni.ja of 10.0.6
// and of 11, 2026-11-27). The Software Update window then sits on "Checking for
// Updates", or ends on "Unable to Update" (no permissions, it says), with no
// word of the real cause. MJT runs two profiles of one installation. Weavero
// adds a line to that window, beside its "Currently installed" line, shown
// only while another instance runs, kept in step at every page change.
//
// The real test (nsIUpdateSyncManager) cannot be faked in the runner: the
// spec overrides the plugin's one probe, `_wvUpdOtherInstanceRunning`. The
// window is Zotero's own (Zotero.openCheckForUpdatesWindow): it starts a real
// update check, whose result (any page) the spec never depends on -- the line
// sits on EVERY page, so a page change the check makes meanwhile changes
// nothing asserted here.
//
// FAILS before 1.3.0 updhint (no line, no probe).

describe("Weavero — Software Update: the 'another Zotero is running' line", function () {
    this.timeout(60000);
    const MSG = "weavero-misc-update-other-instance";
    const HINT = ".wv-update-other-instance";
    const VER = ".wv-update-current-version";
    const PREF = "app.update.checkOnlyInstance.enabled";
    let wv, lib;
    let opened = null;
    let state = { on: false };

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        if (!lib || typeof lib.wvStr !== "function") wvT.absent("Zotero.Weavero.lib.wvStr");
        wvT.method("_wvUpdOtherInstanceRunning");
        wvT.method("_wvUpdOtherInstanceSync");
        wvT.method("_setupUpdateWindowListener");
        wvT.method("_teardownUpdateWindowListener");
    });

    afterEach(async function () {
        try { delete wv._wvUpdOtherInstanceRunning; } catch (e) {}
        const w = opened;
        opened = null;
        if (w && !w.closed) {
            try { w.close(); } catch (e) {}
            await wvT.waitFor(() => w.closed, 5000);
        }
    });

    const text = () => {
        const t = lib.wvStr(MSG, null, null);
        assert.notStrictEqual(t, MSG, MSG + " is in weavero.ftl");
        assert.isAbove(t.length, 40, "a sentence, not a stub");
        return t;
    };

    // Open Zotero's own Software Update window with the probe answering
    // `state.on`, and wait for Weavero's version line (its injection done).
    const open = async () => {
        assert.isNull(Services.wm.getMostRecentWindow("Update:Wizard"), "no Software Update window open before the test");
        wv._wvUpdOtherInstanceRunning = () => state.on;
        Zotero.openCheckForUpdatesWindow();
        const w = await wvT.waitFor(() => Services.wm.getMostRecentWindow("Update:Wizard"), 10000);
        assert.isOk(w, "the Software Update window opened");
        opened = w;
        const ok = await wvT.waitFor(() => {
            const d = w.document;
            return !!(d && d.querySelector("wizard") && d.querySelector("wizardpage " + VER));
        }, 10000);
        assert.isOk(ok, "Weavero's 'Currently installed' line is in the window");
        return w;
    };
    const pages = (w) => [...w.document.querySelectorAll("wizardpage")];
    const hintsOf = (w) => [...w.document.querySelectorAll(HINT)];
    // Drawn: not display:none, visible, a box of its own, inside the window
    // (the wizard is a fixed 500x400 box: a line below its end is not seen).
    const geometry = (w, el) => {
        const cs = w.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { display: cs.display, visibility: cs.visibility, top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), windowHeight: w.innerHeight };
    };

    it("another instance running: every page carries the line, shown on the current page above the version line", async () => {
        state.on = true;
        const w = await open();
        const expect = text();
        await wvT.waitFor(() => hintsOf(w).length >= pages(w).length, 5000);
        for (const page of pages(w)) {
            const hs = page.querySelectorAll(HINT);
            assert.equal(hs.length, 1, "page " + page.id + ": one line");
            assert.equal(hs[0].textContent, expect, "page " + page.id + ": the message's text");
            assert.equal(hs[0].localName, "description", "page " + page.id + ": a XUL description, as the version line");
            const ver = page.querySelector(VER);
            assert.isOk(ver, "page " + page.id + ": the 'Currently installed' line stays");
            assert.isOk(hs[0].compareDocumentPosition(ver) & 4 /* FOLLOWING */, "page " + page.id + ": the version line comes after it");
        }
        // updates.js sets the start page after an await (getStartPageID).
        const cur = await wvT.waitFor(() => w.document.querySelector("wizard").currentPage, 5000);
        assert.isOk(cur, "the wizard shows a page");
        const g = geometry(w, cur.querySelector(HINT));
        const msg = "page " + cur.id + ": the line is drawn inside the window " + JSON.stringify(g);
        assert.notEqual(g.display, "none", msg);
        assert.equal(g.visibility, "visible", msg);
        assert.isAbove(g.height, 0, msg);
        assert.isAtLeast(g.top, 0, msg);
        assert.isAtMost(g.bottom, g.windowHeight + 1, msg);
    });

    it("no other instance: no line, and the 'Currently installed' line is there", async () => {
        state.on = false;
        const w = await open();
        await wvT.sleep(300);
        assert.deepEqual(hintsOf(w).map(n => n.parentNode && n.parentNode.id), [], "no line on any page");
        assert.equal(w.document.querySelectorAll("wizardpage " + VER).length, pages(w).length, "the version line on every page");
    });

    it("a change while the window is open shows at the next page change, and at a direct sync", async () => {
        state.on = false;
        const w = await open();
        const wiz = w.document.querySelector("wizard");
        assert.lengthOf(hintsOf(w), 0, "no line to start with");
        // The next page change (the wizard's own goTo, as updates.js moves).
        state.on = true;
        wiz.goTo("noupdatesfound");
        assert.equal(wiz.currentPage && wiz.currentPage.id, "noupdatesfound");
        assert.lengthOf(hintsOf(w), pages(w).length, "the page change brought the line on every page");
        assert.equal(wiz.currentPage.querySelector(HINT).textContent, text());
        state.on = false;
        wiz.goTo("errors");
        assert.lengthOf(hintsOf(w), 0, "the other instance gone: the next page change took the line away");
        // A direct call of the sync.
        state.on = true;
        wv._wvUpdOtherInstanceSync(w);
        assert.lengthOf(hintsOf(w), pages(w).length, "a sync shows it");
        wv._wvUpdOtherInstanceSync(w);
        assert.lengthOf(hintsOf(w), pages(w).length, "a second sync adds nothing");
        state.on = false;
        wv._wvUpdOtherInstanceSync(w);
        assert.lengthOf(hintsOf(w), 0, "a sync hides it");
        assert.equal(w.document.querySelectorAll("wizardpage " + VER).length, pages(w).length, "the version line stays through it all");
    });

    it("Weavero's teardown removes the line with the version line; setting up again brings both back", async () => {
        state.on = true;
        const w = await open();
        const wiz = w.document.querySelector("wizard");
        await wvT.waitFor(() => hintsOf(w).length, 5000);
        assert.isAbove(lib.wvListenKeys(wiz).filter(k => k.type === "pageshow").length, 0, "the page-change listener is wired");
        wv._teardownUpdateWindowListener();
        try {
            assert.lengthOf(hintsOf(w), 0, "teardown removed the line");
            assert.lengthOf(w.document.querySelectorAll(VER), 0, "and the version line, as before");
            assert.deepEqual(lib.wvListenKeys(wiz).filter(k => k.type === "pageshow"), [], "and its page-change listener");
            wiz.goTo("noupdatesfound");
            assert.lengthOf(hintsOf(w), 0, "a page change after the teardown adds nothing");
        }
        finally {
            wv._setupUpdateWindowListener();
        }
        assert.lengthOf(hintsOf(w), pages(w).length, "set up again (a reload): the line is back on the open window");
        assert.equal(w.document.querySelectorAll("wizardpage " + VER).length, pages(w).length, "and the version line");
    });

    it("the probe follows the updater's switch: app.update.checkOnlyInstance.enabled false answers false", () => {
        const probe = wvT.method("_wvUpdOtherInstanceRunning");
        assert.isBoolean(probe.call(wv), "the real probe answers a boolean");
        const had = Services.prefs.prefHasUserValue(PREF);
        const prev = had ? Services.prefs.getBoolPref(PREF) : null;
        try {
            Services.prefs.setBoolPref(PREF, false);
            assert.isFalse(probe.call(wv), "off: the updater does not wait, so no line");
        }
        finally {
            if (had) Services.prefs.setBoolPref(PREF, prev);
            else Services.prefs.clearUserPref(PREF);
        }
    });
});
