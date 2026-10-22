/* global describe, it, before, assert, Zotero */

// Settings grey-out == the code's gates (code survey §3.5; consolidation
// step 4, prefs.4, MJT 2026-10-17: "Ok to fix as you suggest"). For every
// checkbox in Settings, the masters it is GREYED under (data-gated-by /
// data-master on itself and its ancestors) must be exactly the masters that
// switch its feature off at runtime: the getter's own masters plus the
// row's `gate` in src/modules/prefs-table.ts, closed transitively
// (`_wvPrefGateKeys`). One rule decided the mismatches the parity found:
// the master that greys a box is the master that switches its feature off.
// FAILED on prefs.3 (the annotations pane, the outline options, the undo
// arrows, Read Status and the reader-bookmark options disagreed).

describe("Weavero — Settings grey-out matches the code's gates", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvPrefGateKeys !== "function") wvT.absent('!wv || typeof wv._wvPrefGateKeys !== "function"');
    });

    // Parsed the way Zotero mounts plugin panes.
    const pane = async () => {
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const html = await (await fetch(rootURI + "prefs.html")).text();
        const frag = Zotero.getMainWindow().MozXULElement.parseXULToFragment(html);
        const ms = frag.querySelector(".main-section");
        assert.isOk(ms, "prefs.html parses");
        return ms;
    };

    const greyedUnder = (cb) => {
        const out = new Set();
        for (let el = cb; el; el = el.parentElement) {
            for (const g of String(el.getAttribute && el.getAttribute("data-gated-by") || "").split(/\s+/)) if (g) out.add(g);
            const m = el.getAttribute && el.getAttribute("data-master");
            if (m) out.add(m);
        }
        return out;
    };

    it("every Settings checkbox is greyed under exactly the masters that switch its feature off", async () => {
        const ms = await pane();
        const P = "extensions.zotero.weavero.";
        const bad = [];
        let n = 0;
        for (const cb of ms.querySelectorAll("checkbox[preference]")) {
            const k = String(cb.getAttribute("preference"));
            if (!k.startsWith(P)) continue;
            const key = k.slice(P.length);
            const ui = greyedUnder(cb);
            ui.delete(key);
            const code = new Set(wv._wvPrefGateKeys(key));
            const onlyUi = [...ui].filter(x => !code.has(x)).sort();
            const onlyCode = [...code].filter(x => !ui.has(x)).sort();
            n++;
            if (onlyUi.length || onlyCode.length) bad.push(key + "  greyed only in Settings: [" + onlyUi.join(", ") + "]  gated only in code: [" + onlyCode.join(", ") + "]");
        }
        assert.isAbove(n, 90, "the pane's checkboxes were found");
        assert.deepEqual(bad, []);
    });
});
