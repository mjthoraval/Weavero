/* global describe, it, before, after, assert, Zotero, wvT */
// Weavero's filter funnel and Zotero's quick search share the items toolbar at
// any width (MJT 2026-11-25, "Some bad positioning of the funnels"). In a narrow
// items pane Weavero's toolbar button took its width from the quick search's
// slot; the search's contents (the mode dropmarker, the field and Zotero's own
// Advanced Search funnel) do not shrink, so they spilled out of the slot and
// Zotero's funnel slid under Weavero's (Ubuntu, Zotero 10.0.8, a 960-px window:
// slot 146 px, contents 166 px, the funnels overlapping by 14 px; Windows,
// Zotero 11 and 10: the collision below an items pane of ~441 / ~449 px).
// Measured at several window widths, in the window's own library view.

describe("Weavero — the filter funnel and Zotero's quick search share the items toolbar at any width", function () {
    this.timeout(120000);
    let wv, lib, win, size0;
    const WIDTHS = [1400, 1200, 1100, 1040, 1000, 980, 960, 950];
    const lr = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.width > 0 ? [Math.round(r.left * 2) / 2, Math.round(r.right * 2) / 2] : null;
    };

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!wv || !lib) wvT.absent("plugin");
        win = Zotero.getMainWindows()[0];
        try { win.Zotero_Tabs.select("zotero-pane"); } catch (e) {}
        assert.isOk(await wvT.waitFor(() => !!win.document.getElementById("wv-filter-tb-button"), 15000, 100), "fixture: Weavero's filter funnel in the toolbar");
        size0 = { w: win.outerWidth, h: win.outerHeight };
    });

    after(async function () {
        if (!win || !size0) return;
        try { win.resizeTo(size0.w, size0.h); } catch (e) {}
        await wvT.waitFor(() => Math.abs(win.outerWidth - size0.w) < 2 || null, 5000, 100);
    });

    /** The toolbar's parts in the library view on screen. */
    function measure() {
        const doc = win.document;
        const slot = lib.wvViewEl(doc, "zotero-tb-search");
        const btn = doc.getElementById("wv-filter-tb-button");
        const items = lib.wvViewEl(doc, "zotero-items-pane");
        return {
            win: win.innerWidth,
            items: items ? Math.round(items.getBoundingClientRect().width) : null,
            tb: lr(slot && slot.parentNode),
            slot: lr(slot),
            wrap: lr(slot && slot.querySelector("#search-wrapper")),
            adv: lr(slot && slot.querySelector('[id^="zotero-tb-search-advanced-button"]')),
            btn: lr(btn),
            btnW: btn ? Math.round(btn.getBoundingClientRect().width) : null,
            itemsR: items ? Math.round(items.getBoundingClientRect().right * 2) / 2 : null,
        };
    }

    it("at every width: Zotero's Advanced Search funnel and Weavero's never overlap, the search stays in its slot, and Weavero's funnel stays in the toolbar", async function () {
        const rows = [];
        for (const w of WIDTHS) {
            win.resizeTo(w, size0.h);
            await wvT.waitFor(() => Math.abs(win.outerWidth - w) < 2 || null, 5000, 50);
            await wvT.sleep(400);
            rows.push(measure());
        }
        const bad = rows.filter((m) => {
            if (!m.slot || !m.wrap || !m.btn || !m.tb) return true;
            const overlap = m.adv ? Math.min(m.adv[1], m.btn[1]) - Math.max(m.adv[0], m.btn[0]) : 0;
            return overlap > 0.5 || m.wrap[1] > m.slot[1] + 0.5 || m.btn[1] > m.tb[1] + 0.5 || m.btn[0] < m.tb[0] - 0.5
                || (m.itemsR != null && m.btn[1] > m.itemsR + 0.5 && m.btn[0] > m.tb[0]);
        });
        assert.deepEqual(bad, [], "rows that collide or spill (all rows: " + JSON.stringify(rows) + ")");
    });

    // The narrowest the items pane gets: toward Zotero's own minimum, 370 px
    // ($min-width-items-pane; zoteroPane.js updateLayoutConstraints), reached
    // here with the item pane at its minimum and the collections pane widened
    // (Zotero clamps it). The search field narrows with its slot; it must still
    // leave room to type.
    it("at Zotero's narrowest items pane the funnels still keep apart, inside the pane, and the search field keeps room to type", async function () {
        const doc = win.document;
        const coll = doc.getElementById("zotero-collections-pane");
        const itemPane = doc.getElementById("zotero-item-pane");
        if (!coll || coll.hasAttribute("collapsed")) wvT.absent("zotero-collections-pane, open");
        if (!itemPane) wvT.absent("zotero-item-pane");
        const attr0 = coll.getAttribute("width"), style0 = coll.style.width;
        const iAttr0 = itemPane.getAttribute("width"), iStyle0 = itemPane.style.width;
        let m = null, input = null;
        try {
            win.resizeTo(1000, size0.h);
            await wvT.waitFor(() => Math.abs(win.outerWidth - 1000) < 2 || null, 5000, 50);
            // The item pane at its own minimum (320 px), the collections pane
            // as wide as Zotero lets it be: what is left is the items pane's.
            itemPane.setAttribute("width", "320");
            itemPane.style.width = "320px";
            coll.setAttribute("width", "600");
            coll.style.width = "600px";
            try { win.ZoteroPane.updateLayoutConstraints(); } catch (e) {}
            await wvT.sleep(500);
            m = measure();
            const tb = lib.wvViewEl(doc, "zotero-tb-search-textbox");
            const inp = tb && (tb.inputField || (tb.shadowRoot && tb.shadowRoot.querySelector("input")));
            input = inp ? Math.round(inp.getBoundingClientRect().width) : null;
        }
        finally {
            if (attr0 == null) coll.removeAttribute("width"); else coll.setAttribute("width", attr0);
            coll.style.width = style0;
            if (iAttr0 == null) itemPane.removeAttribute("width"); else itemPane.setAttribute("width", iAttr0);
            itemPane.style.width = iStyle0;
            try { win.ZoteroPane.updateLayoutConstraints(); } catch (e) {}
        }
        // The fixture only has to bring the pane below where the funnels collided
        // (~441 px on Zotero 11, ~449 on 10). How far below depends on the specs run
        // before: the three panes overflow the 1000-px window and the overflow falls
        // differently once earlier specs ran (Zotero 11: 406 px alone, 424 after the
        // 71 specs before this one, the library view 18 px wider than the window;
        // Zotero 10: 370 alone; 1.2.5 preparation, 2026-11-27).
        assert.isAtMost(m.items, 435, "fixture: the items pane below the width where the funnels collided (" + JSON.stringify(m) + ")");
        const overlap = m.adv && m.btn ? Math.min(m.adv[1], m.btn[1]) - Math.max(m.adv[0], m.btn[0]) : 0;
        assert.deepEqual({
            overlap: overlap > 0.5,
            spill: m.wrap[1] > m.slot[1] + 0.5,
            pastPane: m.btn[1] > m.itemsR + 0.5,
            roomToType: (input || 0) >= 40,
        }, { overlap: false, spill: false, pastPane: false, roomToType: true }, "at the narrowest (" + JSON.stringify(Object.assign({ input }, m)) + ")");
    });
});
