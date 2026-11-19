/* global describe, it, after, assert, Zotero, Services */

// Weavero's settings pane gives its pref observers back when the PANE closes.
// Zotero sends `unload` to each top-level element of a plugin pane and then
// nukes the pane's sandbox (Zotero_Preferences.onUnload); the pane listened
// on the WINDOW's unload, which runs after that: every close of Settings
// logged a sourceless "can't access dead object", the observers stayed, and
// the next change of a watched master pref logged one more per gated element
// (found 2026-11-15 by the Zutilo x Weavero check).

describe("Weavero — the settings pane cleans up when Settings closes", function () {
    this.timeout(60000);
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const until = async (fn, ms) => {
        for (let t = 0; t < ms; t += 50) {
            try { if (fn()) return true; } catch (e) {}
            await sleep(50);
        }
        try { return !!fn(); } catch (e) { return false; }
    };
    // Heard as they are logged, not counted in the console's buffer: the buffer
    // drops a closed window's messages with the window (the count went DOWN by
    // one at the close, 2026-11-19, 11.0-beta.4 and 10.0.8), so a count taken
    // before and after cannot see a new one reliably.
    const listenDead = () => {
        const seen = [];
        const l = { observe(m) { try { if (/can't access dead object/.test(m.message || "")) seen.push(m.message); } catch (e) {} } };
        Services.console.registerListener(l);
        return { seen, stop: () => { try { Services.console.unregisterListener(l); } catch (e) {} } };
    };
    const prefsOpen = () => Services.wm.getEnumerator("zotero:pref").hasMoreElements();
    let master = null, hadUser = false, userValue = null;

    after(function () {
        if (!master) return;
        try {
            if (hadUser) Services.prefs.setBoolPref(master, userValue);
            else Services.prefs.clearUserPref(master);
        } catch (e) {}
    });

    it("closing Settings logs no dead-object error, nor does a watched pref changed afterwards", async function () {
        assert.isTrue(await until(() => !prefsOpen(), 8000), "no Settings window left from an earlier spec");
        const pw = Zotero.Utilities.Internal.openPreferences("general");
        const paneID = () => [...pw.Zotero_Preferences.panes.keys()].find(k => /weavero@mjthoraval/.test(k));
        assert.isTrue(await until(() => !!paneID(), 10000), "Weavero's pane registered in the window");
        await pw.Zotero_Preferences.navigateToPane(paneID());
        assert.isTrue(await until(() => !!pw.document.querySelector(".wv-nav .wv-nav-tab"), 15000), "Weavero's pane rendered");
        // A master pref the pane watches: a section's header checkbox.
        const cb = pw.document.querySelector(".wv-tophead checkbox[preference]");
        assert.ok(cb, "a master checkbox");
        master = cb.getAttribute("preference");
        hadUser = Services.prefs.prefHasUserValue(master);
        userValue = Services.prefs.getBoolPref(master, true);
        await sleep(500);
        const dead = listenDead();
        try {
            pw.close();
            assert.isTrue(await until(() => pw.closed && !prefsOpen(), 8000), "Settings closed");
            await sleep(500);
            Services.prefs.setBoolPref(master, !userValue);
            await sleep(300);
            Services.prefs.setBoolPref(master, userValue);
            await sleep(500);
        }
        finally { dead.stop(); }
        assert.deepEqual(dead.seen, [], "no \"can't access dead object\" after the close");
    });
});
