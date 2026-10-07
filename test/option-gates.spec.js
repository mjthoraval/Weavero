/* global describe, it, before, after, assert, Zotero */

// Survey 2026-10-06, the one-line option gates:
// - Ctrl+T / Cmd+T swallowed the key before any check (master off, or the
//   plugin gone, left Ctrl+T dead and other plugins' bindings blocked);
// - `itemCountBreakdown` ran with its Sort & Filters master off;
// - Selection Target / Added By decorations stopped repainting whenever the
//   items-list LINK surface was off (they rode the link pass's early return);
// - a `Prefs.get("weavero.…", true)` read goes to the ROOT branch (the second
//   argument is the global flag, not a default), so the registered pref was
//   never read (`previewLinkZones` could not be turned off).

describe("Weavero — option gates", () => {
    let wv, win;
    const savedPrefs = {};
    const setPref = (k, v) => {
        if (!(k in savedPrefs)) savedPrefs[k] = Zotero.Prefs.get(k);
        Zotero.Prefs.set(k, v);
    };
    const restorePrefs = () => {
        for (const k of Object.keys(savedPrefs)) {
            try { if (savedPrefs[k] === undefined) Zotero.Prefs.clear(k); else Zotero.Prefs.set(k, savedPrefs[k]); } catch (_) {}
            delete savedPrefs[k];
        }
    };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        win = Zotero.getMainWindow();
    });

    after(() => { restorePrefs(); });

    it("Ctrl+T is taken only with the Tabs & Windows master on; the handler is stamped and removable", () => {
        assert.isFunction(wv._wvWireMainNewTabShortcut);
        assert.isFunction(wv._wvUnwireMainNewTabShortcut);
        let picks = 0;
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvMainNewTabPicker");
        const orig = wv._wvMainNewTabPicker;
        wv._wvMainNewTabPicker = () => { picks++; };
        try {
            wv._wvWireMainNewTabShortcut(win);
            assert.isOk(win._wvMainNewTabKeyH && win._wvMainNewTabKeyH._wvTag, "stamped handler stored on the window");
            const fire = () => {
                const ev = new win.KeyboardEvent("keydown", { key: "t", ctrlKey: !Zotero.isMac, metaKey: Zotero.isMac, bubbles: true, cancelable: true });
                win.dispatchEvent(ev);
                return ev.defaultPrevented;
            };
            setPref("weavero.enableTabsAndWindows", false);
            assert.isFalse(fire(), "master off: the key is not swallowed");
            assert.equal(picks, 0);
            setPref("weavero.enableTabsAndWindows", true);
            assert.isTrue(fire(), "master on: the key is taken");
            assert.equal(picks, 1, "and the picker runs");
            wv._wvUnwireMainNewTabShortcut(win);
            assert.isNotOk(win._wvMainNewTabKeyH);
            assert.isFalse(fire(), "unwired: nothing listens");
            wv._wvWireMainNewTabShortcut(win);   // leave it wired for the session
        }
        finally {
            if (own) wv._wvMainNewTabPicker = orig; else delete wv._wvMainNewTabPicker;
        }
    });

    it("the item-count breakdown follows the Sort & Filters master", () => {
        assert.isFunction(wv._wvCountBreakdownEnabled);
        setPref("weavero.itemCountBreakdown", true);
        setPref("weavero.enableFilters", true);
        assert.isTrue(wv._wvCountBreakdownEnabled());
        setPref("weavero.enableFilters", false);
        assert.isFalse(wv._wvCountBreakdownEnabled(), "master off: off");
    });

    it("row decorations are repainted even when the items-list link surface is off (source contract)", () => {
        const src = String(wv._markCellLinks);
        const early = src.indexOf("_stripItemsList()");
        const firstReturn = src.indexOf("return;", early);
        assert.isAbove(early, -1);
        const dec = src.indexOf("_applySelectionTargetVisuals", early);
        assert.isAbove(dec, -1);
        assert.isBelow(dec, firstReturn, "the decoration pass runs before the early return");
    });

    it("no plugin method reads a weavero.* pref from the root branch (the second argument is the global flag)", () => {
        // Deliberately root-branch, read and written consistently: the
        // legacy by-position window titles and their migration flag.
        const allowed = new Set(["windowTitles", "windowTitlesMigrated"]);
        const offenders = [];
        const seen = new Set();
        let proto = Object.getPrototypeOf(wv);
        while (proto && proto !== Object.prototype) {
            for (const name of Object.getOwnPropertyNames(proto)) {
                if (seen.has(name)) continue;
                seen.add(name);
                let fn;
                try { const d = Object.getOwnPropertyDescriptor(proto, name); fn = d && d.value; } catch (_) { continue; }
                if (typeof fn !== "function") continue;
                const src = String(fn);
                const re = /Prefs\.get\("weavero\.([A-Za-z0-9_.]+)",\s*true\)/g;
                let m;
                while ((m = re.exec(src))) { if (!allowed.has(m[1])) offenders.push(name + ": " + m[1]); }
            }
            proto = Object.getPrototypeOf(proto);
        }
        assert.deepEqual(offenders, [], "root-branch reads of weavero.* prefs");
    });
});

// The second batch of option fixes (survey §3.5). Source contracts: each
// names the shape the fix must keep, and fails on the pre-fix code.
describe("Weavero — option contracts (source)", () => {
    let wv;
    const src = (name) => { assert.isFunction(wv[name], name); return String(wv[name]); };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    it("a failed title-bar apply never rewrites the user's master pref", () => {
        assert.notInclude(src("_applyCompactTitleBar"), 'Prefs.set("weavero.compactTitleBar"');
    });

    it("the Plugins Manager chrome re-apply needs 'Plugins Manager extras' like a fresh open does", () => {
        assert.include(src("_wvPMReapplyChrome"), "_getEnablePluginsSearch");
    });

    it("'Open in' offers groups and 'New Group' only while tab groups are on", () => {
        const s = src("_appendOpenInToItemsMenu");
        assert.include(s, "groupsOn");
        assert.isAbove(s.indexOf("groupsOn"), -1);
        assert.isBelow(s.indexOf("groupsOn"), s.indexOf('"New Group"'), "the gate is decided before the entry is built");
    });

    it("the reader undo wrap, history stamps and undo buttons are wired by the panels entry, not the outline takeover", () => {
        const entry = src("_wvProcessReaderPanels");
        assert.include(entry, "_wvReaderWrapUndo(reader)");
        assert.include(entry, "_wvReaderEnsureUndoButtons(reader, idoc)");
        assert.notInclude(src("_wvReaderEnsureOutlinePanel"), "_wvReaderWrapUndo(reader)");
    });

    it("the annotations-pane funnel re-applies on its Sort & Filters master; sort teardown re-arms it", () => {
        assert.include(src("_wvWireAnnListPrefWatch"), '"weavero.enableFilters"');
        assert.include(src("_wvAnnSortTeardown"), "__wvAnnListSig = null");
    });

    it("the Links & Relations master strips notes; the window-identity prefs have a live branch", () => {
        const s = src("init");
        const master = s.indexOf('weavero.enableLinksAndRelations") {');
        assert.isAbove(master, -1);
        assert.isAbove(s.indexOf("_stripNotes", master), -1);
        assert.isBelow(s.indexOf("_stripNotes", master) - master, 2500, "inside the master branch");
        assert.include(s, 'weavero.windowIcons"');
        assert.include(s, "_wvRefreshWindowIcons(off)");
    });
});
