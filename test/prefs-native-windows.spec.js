/* global describe, it, assert, Zotero */

// A Zotero with its own windows (zotero#6035; the 11.0 beta since beta.4):
// a document or note opened in a window is a MAIN window there -- Zotero 11
// has no reader.xhtml or note.xhtml any more (checked again in 11.0-beta.6,
// 2026-11-26), so Weavero's reader and note windows never open. The settings
// for them stayed in the pane (MJT 2026-11-26, "There are still some leftovers
// in Z11 in the settings for 'Reader window'"). prefs/index.ts
// bindNativeWindows hides what `data-wv-native-off` marks and swaps the words
// of what `data-wv-native-l10n` marks for a message that does not name those
// windows. The markup contract is checked here, and the pane script's
// handling of both markers; the pane itself on a real native build is checked
// live.

describe("Weavero — Settings pane: no reader or note window settings on a Zotero with its own windows", () => {
    const pane = async () => {
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const html = await (await fetch(rootURI + "prefs.html")).text();
        const frag = Zotero.getMainWindow().MozXULElement.parseXULToFragment(html);
        const ms = frag.querySelector(".main-section");
        assert.isOk(ms, "prefs.html parses");
        return ms;
    };
    const L = () => new (Zotero.getMainWindow().Localization)(["weavero.ftl"], true);
    const READER_ONLY = ["compactTitleBarReader", "compactTitleBarNote", "noteOpenInDeckWindow", "readerItemPane"];
    const NAMES_THEM = /reader[- ]style window|reader windows?|note windows?|\(main and reader\)/i;

    for (const pref of READER_ONLY) {
        it(pref + ": hidden there", async () => {
            const ms = await pane();
            const cb = ms.querySelector('checkbox[preference="extensions.zotero.weavero.' + pref + '"]');
            assert.isOk(cb, "the checkbox exists");
            assert.isOk(cb.closest("[data-wv-native-off]"), "it, or its block, is marked data-wv-native-off");
        });
    }

    it("every description that names reader or note windows has words for a Zotero with its own windows", async () => {
        const ms = await pane();
        const l = L();
        const missing = [];
        for (const el of ms.querySelectorAll("[data-l10n-id]")) {
            if (el.closest("[data-wv-native-off]")) continue;
            const id = el.getAttribute("data-l10n-id");
            let text = "";
            try { text = String(l.formatValueSync(id) || ""); } catch (e) {}
            if (!text) {
                // A label lives in an attribute (`.label`).
                try { const m = l.formatMessagesSync([id])[0]; text = (m && m.attributes || []).map(a => a.value).join(" "); } catch (e) {}
            }
            if (!NAMES_THEM.test(text)) continue;
            const alt = el.getAttribute("data-wv-native-l10n");
            if (!alt) { missing.push(id + ": no data-wv-native-l10n"); continue; }
            let altText = "";
            try { altText = String(l.formatValueSync(alt) || ""); } catch (e) {}
            if (!altText) missing.push(id + ": " + alt + " has no words");
            else if (NAMES_THEM.test(altText)) missing.push(id + ": " + alt + " still names them");
        }
        assert.deepEqual(missing, []);
    });

    it("the pane script knows both markers", async () => {
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const js = await (await fetch(rootURI + "prefs.js")).text();
        assert.include(js, "data-wv-native-off", "bindNativeWindows hides the marked rows");
        assert.include(js, "data-wv-native-l10n", "and swaps the marked words");
    });
});
