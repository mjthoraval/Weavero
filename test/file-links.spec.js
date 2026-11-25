/* global describe, it, before, after, afterEach, assert, Zotero, Services, Components, PathUtils, IOUtils, wvT */

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

// A file:// link to a file on THIS computer when the system has no handler for
// file links. Stock Ubuntu sets no x-scheme-handler/file default, so
// Zotero.launchURL throws "Handler not found for 'file' URLs" (zotero.js
// launchURL) and the 10.0.2 shim finds no handler either: until 1.2.3 the click
// did nothing and said nothing (Ubuntu, Zotero 11, 2026-11-24). MJT 2026-11-24,
// "Ask, then open": Weavero asks (its own question, the full path, Cancel the
// default), then opens the FILE through Zotero.launchFile -- the way Zotero
// opens an attachment it cannot show; an Open is remembered per link; a file
// the system would run is refused, never asked about; a Cancel, a missing file
// and a failed launch each say so.
//
// The platform is stubbed to have no file handler: Zotero.launchURL throws as
// on Ubuntu and the shim's external-protocol service finds none. Nothing opens
// on the test machine: the question, Zotero.launchFile and the notices are
// recorded.
describe("Weavero — a local file link with no system handler asks, then opens the file", function () {
    this.timeout(30000);
    let wv, origLaunchURL, origLaunchFile, origPathToFile, dir, real, realURL, script, execNoExt, plainNoExt, prompts, files, refused, shim, answer;
    let execPdf, execTxt, execBin, execTextNoExt;
    const PREFS = ["weavero.enableAppLinks", "weavero.enableFileScheme", "weavero.enableLinksAndRelations", "weavero.localFileLinksOpened"];
    const saved = {};

    before(async () => {
        wv = wvT.plugin();
        if (!wv || typeof wv._launchURL !== "function") wvT.absent("plugin._launchURL");
        origLaunchURL = Zotero.launchURL;
        origLaunchFile = Zotero.launchFile;
        for (const p of PREFS) saved[p] = Zotero.Prefs.get(p);
        dir = PathUtils.join(PathUtils.tempDir, "wv-local-file-links");
        await IOUtils.makeDirectory(dir, { ignoreExisting: true });
        real = PathUtils.join(dir, "Paper 1.pdf");
        await IOUtils.writeUTF8(real, "%PDF-1.4 stand-in, never opened");
        realURL = Zotero.File.pathToFileURI(real);
        script = PathUtils.join(dir, "run.sh");
        await IOUtils.writeUTF8(script, "echo never run");
        // Files marked executable, and one script that is not (Unix: their
        // real modes; Windows: `execBits` below plays the executable bit). The
        // content is real bytes on disk everywhere.
        origPathToFile = Zotero.File.pathToFile;
        execNoExt = PathUtils.join(dir, "wv-exec-noext");
        await IOUtils.writeUTF8(execNoExt, "#!/bin/sh\necho never run\n");
        plainNoExt = PathUtils.join(dir, "wv-unmarked-script");
        await IOUtils.writeUTF8(plainNoExt, "#!/bin/sh\necho never run, not marked executable\n");
        execPdf = PathUtils.join(dir, "paper.pdf");
        await IOUtils.writeUTF8(execPdf, "%PDF-1.4 stand-in on a drive where every file is +x");
        execTxt = PathUtils.join(dir, "notes.txt");
        await IOUtils.writeUTF8(execTxt, "#!/bin/sh\necho never run\n");
        execBin = PathUtils.join(dir, "data.bin");
        await IOUtils.write(execBin, new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]));
        execTextNoExt = PathUtils.join(dir, "wv-exec-text-noext");
        await IOUtils.writeUTF8(execTextNoExt, "echo no shebang; Terminal would still run this\n");
        if (!Zotero.isWin) {
            for (const p of [execNoExt, execPdf, execTxt, execBin, execTextNoExt]) await IOUtils.setPermissions(p, 0o755);
            await IOUtils.setPermissions(plainNoExt, 0o644);
        }
    });

    afterEach(() => {
        Zotero.launchURL = origLaunchURL;
        Zotero.launchFile = origLaunchFile;
        Zotero.File.pathToFile = origPathToFile;
        for (const m of ["_wvLaunchSvcOverride", "_wvPromptOverride", "_wvShowLinkRefused", "_wvExecBitApplies"]) delete wv[m];
    });

    // The executable bit as Unix reports it, on every platform: off Windows
    // the files' real modes; on Windows (where the extension decides and the
    // bit is not read) the rule is switched on and `isExecutable()` answers as
    // Unix does -- true for the marked file AND for the folder (access(X_OK)
    // passes on a searchable folder, nsLocalFileUnix.cpp), false otherwise.
    const noSlash = (p) => String(p).replace(/[\\/]+$/, "");
    // A link's URL, built with the real pathToFile: on Windows execBits()
    // replaces it, and pathToFileURI goes through it.
    const urlOf = (p) => Services.io.newFileURI(origPathToFile.call(Zotero.File, p)).spec;
    const execBits = () => {
        if (!Zotero.isWin) return;
        wv._wvExecBitApplies = () => true;
        const unixExec = new Set([execNoExt, execPdf, execTxt, execBin, execTextNoExt, dir].map(noSlash));
        Zotero.File.pathToFile = function (p) {
            const f = origPathToFile.call(Zotero.File, p);
            if (!unixExec.has(noSlash(p))) return f;
            return /** @type {any} */ ({ path: f.path, exists: () => f.exists(), isDirectory: () => f.isDirectory(), isExecutable: () => true });
        };
    };

    after(async () => {
        for (const p of PREFS) {
            try {
                if (saved[p] === undefined) Zotero.Prefs.clear(p);
                else Zotero.Prefs.set(p, saved[p]);
            } catch (e) {}
        }
        try { wv._urlSchemeAltCache = null; wv._urlRegexCache = null; } catch (e) {}
        try { await IOUtils.remove(dir, { recursive: true, ignoreAbsent: true }); } catch (e) {}
    });

    const on = () => {
        Zotero.Prefs.set("weavero.enableLinksAndRelations", true);
        Zotero.Prefs.set("weavero.enableAppLinks", true);
        Zotero.Prefs.set("weavero.enableFileScheme", true);
        wv._urlSchemeAltCache = null; wv._urlRegexCache = null;
    };
    // No handler for file links, as on stock Ubuntu; everything that could
    // open something records instead.
    const noHandler = () => {
        prompts = []; files = []; refused = []; shim = []; answer = false;
        Zotero.launchURL = () => { throw new Error("Handler not found for 'file' URLs"); };
        wv._wvLaunchSvcOverride = {
            getProtocolHandlerInfoFromOS(scheme, found) { shim.push("handlerInfo:" + scheme); found.value = false; return {}; },
            loadURI(uri) { shim.push("loadURI:" + (uri && uri.spec)); },
        };
        const P = Services.prompt;
        wv._wvPromptOverride = {
            BUTTON_POS_0: P.BUTTON_POS_0, BUTTON_POS_1: P.BUTTON_POS_1, BUTTON_TITLE_IS_STRING: P.BUTTON_TITLE_IS_STRING,
            BUTTON_TITLE_CANCEL: P.BUTTON_TITLE_CANCEL, BUTTON_POS_1_DEFAULT: P.BUTTON_POS_1_DEFAULT,
            confirmEx(win, title, text, flags, b0) { prompts.push({ title, text, flags, b0 }); return answer ? 0 : 1; },
        };
        Zotero.launchFile = (/** @type {any} */ f) => { files.push(String(f && f.path ? f.path : f)); };
        wv._wvShowLinkRefused = (m) => { refused.push(String(m)); };
    };
    const str = (id, args) => wvT.lib().wvStr(id, args);
    const remembered = () => wv._wvLocalFileLinksList();

    it("the first click asks; Open hands the file to Zotero's own file launch and remembers the link", async () => {
        on();
        Zotero.Prefs.clear("weavero.localFileLinksOpened");
        noHandler();
        answer = true;
        await wv._launchURL(realURL);
        assert.lengthOf(prompts, 1, "Weavero asked once (on 1.2.2 nothing was asked, nothing opened, nothing said)");
        assert.strictEqual(prompts[0].title, str("weavero-misc-open-local-file-title"));
        assert.strictEqual(prompts[0].text, str("weavero-misc-open-local-file-message", { target: real }), "the full path in the question");
        assert.strictEqual(prompts[0].b0, str("weavero-misc-open-local-file-button"));
        assert.isOk(prompts[0].flags & Services.prompt.BUTTON_POS_1_DEFAULT, "Cancel is the default");
        assert.deepEqual(files, [real], "Zotero.launchFile got the file's path");
        assert.deepEqual(refused, [], "no notice");
        assert.notOk(shim.some((s) => s.startsWith("loadURI")), "the link itself was never handed to a URL handler");
        assert.deepEqual(remembered(), [real], "remembered");
    });

    it("a remembered link opens with no question", async () => {
        on();
        noHandler();
        await wv._launchURL(realURL + "#page=2");
        assert.lengthOf(prompts, 0, "no question");
        assert.deepEqual(files, [real], "opened");
    });

    it("Cancel opens nothing, remembers nothing, and says so", async () => {
        on();
        Zotero.Prefs.clear("weavero.localFileLinksOpened");
        noHandler();
        answer = false;
        await wv._launchURL(realURL);
        assert.lengthOf(prompts, 1, "asked");
        assert.deepEqual(files, [], "nothing opened");
        assert.deepEqual(remembered(), [], "nothing remembered");
        assert.deepEqual(refused, [str("weavero-misc-link-local-file-not-opened", { name: real })], "a notice says it was not opened");
    });

    it("a file the system would run is refused with its notice, never asked about", async () => {
        on();
        for (const p of [script, PathUtils.join(dir, "setup.exe"), PathUtils.join(dir, "launch.desktop")]) {
            noHandler();
            answer = true;
            await wv._launchURL(Zotero.File.pathToFileURI(p));
            assert.lengthOf(prompts, 0, p + ": no question");
            assert.deepEqual(files, [], p + ": nothing opened");
            assert.deepEqual(refused, [str("weavero-misc-link-refused-runnable", { name: p })], p + ": the runnable notice");
        }
    });

    // W15 (Ubuntu hands-on, 2026-11-24): an executable script WITHOUT an
    // extension passed the name rule; after Open it went to the desktop's
    // application for shell scripts (Vim there -- a desktop whose default runs
    // scripts would have run it). MJT 2026-11-24, "Bit + program content": off
    // Windows the executable bit AND a program's start ("#!", ELF, Mach-O,
    // universal binary) or no extension refuse a file as a runnable name does;
    // the bit alone does not (NTFS / exFAT drives mounted with every file +x).
    it("an executable file without an extension is refused like a program: no question, never launched", async () => {
        on();
        Zotero.Prefs.clear("weavero.localFileLinksOpened");
        noHandler();
        execBits();
        answer = true;
        await wv._launchURL(urlOf(execNoExt));
        assert.lengthOf(prompts, 0, "no question (on 1.2.3-hotfix.1 it was asked, and Open launched it)");
        assert.deepEqual(files, [], "Zotero.launchFile never called");
        assert.deepEqual(refused, [str("weavero-misc-link-refused-runnable", { name: execNoExt })], "the runnable notice");
        // Remembered before the bit was set: still refused, never launched.
        wv._wvLocalFileLinksRemember(execNoExt);
        noHandler();
        execBits();
        await wv._launchURL(urlOf(execNoExt));
        assert.deepEqual(files, [], "a remembered link is refused too");
        assert.lengthOf(refused, 1);
        Zotero.Prefs.clear("weavero.localFileLinksOpened");
    });

    it("a marked file that starts like a program is refused whatever its name; a marked text without an extension too", async () => {
        on();
        Zotero.Prefs.clear("weavero.localFileLinksOpened");
        for (const p of [execTxt, execBin, execTextNoExt]) {
            noHandler();
            execBits();
            answer = true;
            await wv._launchURL(urlOf(p));
            assert.lengthOf(prompts, 0, p + ": no question");
            assert.deepEqual(files, [], p + ": never launched");
            assert.deepEqual(refused, [str("weavero-misc-link-refused-runnable", { name: p })], p + ": the runnable notice");
        }
    });

    it("a marked file that does not start like a program is asked about, as any other (a PDF on an NTFS / exFAT drive)", async () => {
        on();
        Zotero.Prefs.clear("weavero.localFileLinksOpened");
        noHandler();
        execBits();
        if (!Zotero.isWin) assert.isTrue(Zotero.File.pathToFile(execPdf).isExecutable(), "mode 0755");
        answer = false;
        await wv._launchURL(urlOf(execPdf));
        assert.lengthOf(prompts, 1, "the question (on 1.2.3-hotfix.2 the bit alone refused it)");
        assert.deepEqual(files, [], "Cancel: nothing opened");
        assert.deepEqual(refused, [str("weavero-misc-link-local-file-not-opened", { name: execPdf })]);
        noHandler();
        execBits();
        answer = true;
        await wv._launchURL(urlOf(execPdf));
        assert.deepEqual(files, [execPdf], "Open: opened");
        Zotero.Prefs.clear("weavero.localFileLinksOpened");
    });

    it("a folder still asks and opens, though Unix calls a folder executable", async () => {
        on();
        Zotero.Prefs.clear("weavero.localFileLinksOpened");
        noHandler();
        execBits();
        if (!Zotero.isWin) {
            assert.isTrue(Zotero.File.pathToFile(dir).isExecutable(), "Unix: isExecutable() is true for a searchable folder (the case the rule excludes)");
        }
        answer = true;
        await wv._launchURL(urlOf(dir));
        assert.lengthOf(prompts, 1, "the question");
        assert.deepEqual(files.map(noSlash), [noSlash(dir)], "opened (the file manager)");
        assert.deepEqual(refused, []);
        Zotero.Prefs.clear("weavero.localFileLinksOpened");
    });

    it("a script without an extension and without the executable bit still asks", async () => {
        on();
        noHandler();
        execBits();
        if (!Zotero.isWin) assert.isFalse(Zotero.File.pathToFile(plainNoExt).isExecutable(), "mode 0644");
        answer = false;
        await wv._launchURL(urlOf(plainNoExt));
        assert.lengthOf(prompts, 1, "the question");
        assert.deepEqual(files, [], "Cancel: nothing opened");
        assert.deepEqual(refused, [str("weavero-misc-link-local-file-not-opened", { name: plainNoExt })]);
    });

    it("a missing file: nothing asked, nothing opened, a notice", async () => {
        on();
        noHandler();
        answer = true;
        const gone = PathUtils.join(dir, "not-there.pdf");
        await wv._launchURL(Zotero.File.pathToFileURI(gone));
        assert.lengthOf(prompts, 0);
        assert.deepEqual(files, []);
        assert.deepEqual(refused, [str("weavero-misc-link-local-file-missing", { name: gone })]);
    });

    it("a launch that fails says so", async () => {
        on();
        noHandler();
        answer = true;
        Zotero.launchFile = () => { throw new Error("stand-in: no application"); };
        await wv._launchURL(realURL);
        assert.lengthOf(prompts, 1, "asked: the Cancel case left the link unremembered");
        assert.deepEqual(refused, [str("weavero-misc-link-local-file-failed", { name: real })]);
    });

    it("with a handler for file links nothing changes: Zotero.launchURL and its prompt", async () => {
        on();
        noHandler();
        const launched = [];
        Zotero.launchURL = (u) => { launched.push(u); };
        await wv._launchURL(realURL);
        assert.deepEqual(launched, [realURL], "through Zotero.launchURL");
        assert.lengthOf(prompts, 0, "Weavero asks nothing");
        assert.deepEqual(files, []);
    });

    it("the flow opens the file, never the link (source contracts)", async () => {
        assert.notMatch(wvT.src("_wvOpenLocalFileLink"), /launchURL|loadURI|launchWithURI/, "no URL handler after Weavero's question");
        assert.include(wvT.src("_wvOpenLocalFileLink"), "wvIsRunnableFile", "the runnable-file refusal of every other link");
        assert.match(wvT.src("_wvLaunchLocalFile"), /Zotero\.launchFile\(/, "Zotero's own file launch");
    });
});
