/* global describe, it, before, after, afterEach, assert, Zotero, Services, Components, wvT */

// file:// links (security review 2026-11-22). "Open without confirmation" is
// never applied to file links: a click on one always gets Zotero's prompt, and
// Weavero never turns off the profile-wide "ask before opening" for the file
// scheme. A file:// link to ANOTHER computer (a UNC path) is not opened from a
// note or a comment: on Windows the mere attempt connects to that computer --
// unless the user allows such links in Settings (weavero.remoteFileLinks, MJT
// 2026-11-23): then each link asks ONCE (Weavero's own question, the only one
// of that click), is remembered when opened, and opens without a question
// after; another link to the same server asks again; switching the setting off
// forgets them.
//
// Nothing is opened on the test machine: Zotero.launchURL records, and so do
// the remote-file launchers and the question.

describe("Weavero — file links always ask, and never reach another computer", function () {
    this.timeout(30000);
    let wv, origLaunchURL, launched;
    const PREFS = ["weavero.enableAppLinks", "weavero.enableFileScheme", "weavero.enableAppLinksSkipConfirm", "weavero.enableMailtoScheme",
        "weavero.enableLinksAndRelations", "weavero.remoteFileLinks", "weavero.remoteFileLinksOpened"];
    const saved = {};

    before(() => {
        wv = wvT.plugin();
        if (!wv || typeof wv._launchURL !== "function") wvT.absent("plugin._launchURL");
        origLaunchURL = Zotero.launchURL;
        for (const p of PREFS) saved[p] = Zotero.Prefs.get(p);
    });

    afterEach(() => {
        Zotero.launchURL = origLaunchURL;
        for (const m of ["_wvAskOpenRemoteFile", "_wvLaunchPath", "_wvLaunchViaOS", "_wvShowLinkRefused"]) delete wv[m];
    });

    after(() => {
        for (const p of PREFS) {
            try {
                if (saved[p] === undefined) Zotero.Prefs.clear(p);
                else Zotero.Prefs.set(p, saved[p]);
            } catch (e) {}
        }
        try { wv._urlSchemeAltCache = null; wv._urlRegexCache = null; } catch (e) {}
        try { wv._applyAppLinkConfirmPref(); } catch (e) {}
    });

    const record = () => { launched = []; Zotero.launchURL = (u) => { launched.push(u); }; };
    const allOn = () => {
        Zotero.Prefs.set("weavero.enableLinksAndRelations", true);
        Zotero.Prefs.set("weavero.enableAppLinks", true);
        Zotero.Prefs.set("weavero.enableFileScheme", true);
        Zotero.Prefs.set("weavero.enableMailtoScheme", true);
        Zotero.Prefs.set("weavero.enableAppLinksSkipConfirm", true);
        wv._urlSchemeAltCache = null; wv._urlRegexCache = null;
    };

    // The remote-file flow, recorded: the question (answered by `answer`), the
    // two launchers, the refusals.
    let asked, opened, refused, answer;
    const stubRemote = () => {
        asked = []; opened = []; refused = []; answer = false;
        wv._wvAskOpenRemoteFile = (win, t) => { asked.push(t.unc); return answer; };
        wv._wvLaunchPath = (p) => { opened.push(p); return true; };
        wv._wvLaunchViaOS = (u) => { opened.push(u); return true; };
        wv._wvShowLinkRefused = (m) => { refused.push(String(m)); };
    };
    const remembered = () => wv._wvRemoteFileLinksList();
    // What the launch is handed: Windows the UNC path, elsewhere the address.
    const target = (unc, url) => (Zotero.isWin ? unc : url);
    const A = "file://wv-test-srv.invalid/share/Paper%201.pdf";
    const A_UNC = "\\\\wv-test-srv.invalid\\share\\Paper 1.pdf";

    it("with the setting off (the default), a file link to another computer is never opened", () => {
        Zotero.Prefs.clear("weavero.remoteFileLinks");
        assert.isFalse(!!Zotero.Prefs.get("weavero.remoteFileLinks"), "off by default");
        record();
        for (const u of ["file://attacker.example/share/paper.pdf", "FILE://attacker.example/x.exe",
            "file:////attacker.example/share/x.pdf", "file:///\\\\attacker.example\\share\\x.pdf", "file://\\\\attacker.example\\share"]) {
            wv._launchURL(u);
        }
        assert.deepEqual(launched, [], "nothing handed on");
        assert.isTrue(wvT.lib().wvIsRemoteFileURL("file://host/share"), "the rule is published for the suite");
        for (const u of ["file:///C:/Users/x/paper.pdf", "file://localhost/C:/x.pdf", "file:///home/x/paper.pdf"]) {
            assert.isFalse(wvT.lib().wvIsRemoteFileURL(u), u);
        }
    });

    it("a local file link goes to Zotero's prompt, even with Open without confirmation on", () => {
        allOn();
        assert.isFalse(wv._wvSkipConfirmFor("file"), "file links never skip the prompt");
        assert.isTrue(wv._wvSkipConfirmFor("mailto"), "an enabled app scheme still can");
        assert.include(wvT.src("_launchURL"), "_wvSkipConfirmFor", "the launcher asks the same rule");
        record();
        wv._launchURL("file:///C:/Users/Public/WV-TEST-not-there.pdf");
        assert.deepEqual(launched, ["file:///C:/Users/Public/WV-TEST-not-there.pdf"], "through Zotero.launchURL and its prompt");
    });

    it("the profile-wide ask-before-opening for file links is never turned off", () => {
        // What WEAVERO writes, not the platform's value: Windows and macOS define
        // no warn-external.file (the read falls back to true) while Linux reads
        // false with nothing written -- the 1.2.1 release CI's Ubuntu jobs, Zotero
        // 10 and 11, 2026-11-23. Weavero must never leave a "don't ask" of its own
        // (a user value false), nor turn the file handler's ask off.
        const PREF = "network.protocol-handler.warn-external.file";
        const svc = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
            .getService(Components.interfaces.nsIExternalProtocolService);
        const askedBefore = svc.getProtocolHandlerInfo("file").alwaysAskBeforeHandling;
        allOn();
        wv._applyAppLinkConfirmPref();
        assert.isFalse(Services.prefs.prefHasUserValue(PREF) && Services.prefs.getBoolPref(PREF) === false,
            "warn-external.file is not set to false");
        assert.isFalse(Services.prefs.getBoolPref("network.protocol-handler.warn-external.mailto", true),
            "an enabled app scheme is still switched as the user asked");
        if (askedBefore) assert.isTrue(svc.getProtocolHandlerInfo("file").alwaysAskBeforeHandling, "the file handler still asks");
    });

    // ---- "Allow links to files on other computers" (weavero.remoteFileLinks)

    it("one link, every spelling: the same key (backslashes, %5C, four slashes, file:\\\\host)", () => {
        const lib = wvT.lib();
        assert.isFunction(lib.wvRemoteFileTarget, "the reader is published for the suite");
        const keys = ["file://WV-TEST-SRV.invalid/share/x.pdf", "file:////wv-test-srv.invalid/share/x.pdf",
            "file:///\\\\wv-test-srv.invalid\\share\\x.pdf", "file:%5C%5Cwv-test-srv.invalid%5Cshare%5Cx.pdf",
            "file:\\\\wv-test-srv.invalid\\share\\x.pdf", "file://localhost//wv-test-srv.invalid/share//x.pdf",
            "file://wv-test-srv.invalid/share/x.pdf#page=2"].map((u) => lib.wvRemoteFileTarget(u).key);
        assert.deepEqual([...new Set(keys)], ["\\\\wv-test-srv.invalid\\share\\x.pdf"], JSON.stringify(keys));
        const t = lib.wvRemoteFileTarget(A);
        assert.strictEqual(t.unc, A_UNC, "the full target, escapes decoded");
        assert.strictEqual(t.host, "wv-test-srv.invalid");
        assert.isNull(lib.wvRemoteFileTarget("file:///C:/x.pdf"), "a local file is no remote target");
        assert.notStrictEqual(lib.wvRemoteFileTarget("file://wv-test-srv.invalid/share/y.pdf").key, keys[0], "another file of the server: another key");
    });

    it("on: the first click asks once; Cancel launches nothing and remembers nothing", () => {
        allOn();
        Zotero.Prefs.set("weavero.remoteFileLinks", true);
        assert.deepEqual(remembered(), [], "nothing remembered yet");
        record();
        stubRemote();
        answer = false;
        wv._launchURL(A);
        assert.deepEqual(asked, [A_UNC], "exactly one question, with the full target");
        assert.deepEqual(opened, [], "Cancel: not launched");
        assert.deepEqual(launched, [], "never through Zotero.launchURL (whose prompt would be a second question)");
        assert.deepEqual(remembered(), [], "Cancel: not remembered");
        assert.deepEqual(refused, [], "no refusal notice either");
    });

    it("on: Open launches and remembers it; the next click opens with no question", () => {
        allOn();
        Zotero.Prefs.set("weavero.remoteFileLinks", true);
        record();
        stubRemote();
        answer = true;
        wv._launchURL(A);
        assert.deepEqual(asked, [A_UNC], "one question");
        assert.deepEqual(opened, [target(A_UNC, A)], "launched once, straight to the system");
        assert.deepEqual(launched, [], "not through Zotero.launchURL: no second (Gecko) prompt");
        assert.deepEqual(remembered(), [A_UNC], "remembered");
        stubRemote();
        wv._launchURL("file:////wv-test-srv.invalid/share/Paper 1.pdf");
        assert.deepEqual(asked, [], "a remembered link (in another spelling) asks nothing");
        assert.deepEqual(opened, [target(A_UNC, "file:////wv-test-srv.invalid/share/Paper 1.pdf")], "and opens");
    });

    it("on: another link to the same server still asks", () => {
        allOn();
        Zotero.Prefs.set("weavero.remoteFileLinks", true);
        assert.include(remembered(), A_UNC, "the first link is remembered (previous test)");
        record();
        stubRemote();
        answer = false;
        const B = "file://wv-test-srv.invalid/share/other.pdf";
        wv._launchURL(B);
        assert.deepEqual(asked, ["\\\\wv-test-srv.invalid\\share\\other.pdf"], "asked: a link is remembered, not its server");
        assert.deepEqual(opened, []);
    });

    it("on: a program on the other computer is refused, nothing asked", () => {
        allOn();
        Zotero.Prefs.set("weavero.remoteFileLinks", true);
        record();
        stubRemote();
        answer = true;
        wv._launchURL("file://wv-test-srv.invalid/share/setup.exe");
        assert.deepEqual(asked, [], "no question");
        assert.deepEqual(opened, [], "not launched");
        assert.lengthOf(refused, 1, "a notice says why");
    });

    it("on: a local file link is unchanged (Zotero's prompt)", () => {
        allOn();
        Zotero.Prefs.set("weavero.remoteFileLinks", true);
        record();
        stubRemote();
        wv._launchURL("file:///C:/Users/Public/WV-TEST-not-there.pdf");
        assert.deepEqual(asked, [], "Weavero asks nothing");
        assert.deepEqual(opened, []);
        assert.deepEqual(launched, ["file:///C:/Users/Public/WV-TEST-not-there.pdf"], "through Zotero.launchURL and its prompt, as before");
    });

    it("switching the setting off forgets the links and refuses again", () => {
        allOn();
        Zotero.Prefs.set("weavero.remoteFileLinks", true);
        assert.isAbove(remembered().length, 0, "something to forget");
        Zotero.Prefs.set("weavero.remoteFileLinks", false);
        assert.deepEqual(remembered(), [], "forgotten at once (the pref observer)");
        assert.strictEqual(String(Zotero.Prefs.get("weavero.remoteFileLinksOpened") || ""), "", "the stored list cleared");
        record();
        stubRemote();
        answer = true;
        wv._launchURL(A);
        assert.deepEqual(asked, [], "no question");
        assert.deepEqual(opened, [], "not launched");
        assert.deepEqual(launched, [], "not handed on");
        assert.lengthOf(refused, 1, "refused with its notice");
        Zotero.Prefs.set("weavero.remoteFileLinks", true);
        stubRemote();
        wv._launchURL(A);
        assert.deepEqual(asked, [A_UNC], "on again: the link asks again");
    });

    it("at most 500 links are remembered, the oldest dropped", () => {
        allOn();
        Zotero.Prefs.set("weavero.remoteFileLinks", true);
        Zotero.Prefs.clear("weavero.remoteFileLinksOpened");
        for (let i = 0; i < 501; i++) wv._wvRemoteFileLinksRemember("\\\\wv-test-srv.invalid\\share\\" + i + ".pdf");
        const list = remembered();
        assert.lengthOf(list, 500);
        assert.strictEqual(list[0], "\\\\wv-test-srv.invalid\\share\\1.pdf", "the oldest went");
        assert.strictEqual(list[499], "\\\\wv-test-srv.invalid\\share\\500.pdf");
        Zotero.Prefs.clear("weavero.remoteFileLinksOpened");
    });

    it("the launch goes to the system directly, never through a prompting call (source contracts)", () => {
        const path = wvT.src("_wvLaunchPath");
        assert.match(path, /\.launch\(\)/, "Windows: nsIFile.launch (ShellExecute), as Zotero.launchFile does first");
        assert.notMatch(path, /launchURL|loadURI/, "no Zotero.launchURL / loadURI after Weavero's question");
        const os = wvT.src("_wvLaunchViaOS");
        assert.match(os, /launchWithURI/, "elsewhere: the OS handler's launchWithURI");
        assert.notMatch(os, /loadURI|launchURL/, "no Gecko prompt");
        assert.notMatch(wvT.src("_wvOpenRemoteFileLink"), /launchURL|loadURI/, "the remote flow never reaches Zotero.launchURL");
    });
});
