/* global describe, it, before, after, assert, Zotero, wvT */
// A tab dragged OUT of its tab group lands where it is dropped (MJT
// 2026-11-10: "Dragging out the last tab of a tab group makes it jump to the
// end instead of going to the drop position"). The drag ring showed
// "gapDrop: -> idx 24 (from 6)": the group's chip carried the index of the
// group's first OTHER member, and a group whose only tab was being dragged
// had none, so a drop before its chip fell back to the end of the bar
// (tab-groups.ts _wvDragCacheGeom firstZIdxOf). Synthetic DragEvents run the
// real listener chain (as pinned-drag.spec.js).
describe("Weavero — a tab dragged out of its group lands at the drop", function () {
    this.timeout(120000);
    let wv, win, ZT, doc, cont, group, prevGroups, prevTW;
    const its = {};
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const tabOf = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const node = (id) => doc.querySelector('#tab-bar-container .tab[data-id="' + id + '"]');
    const rect = (el) => el.getBoundingClientRect();
    const nameOf = (t) => { for (const k of Object.keys(its)) if (its[k].id === (t.data && t.data.itemID)) return k; return null; };
    /** Our tabs in order, a grouped one marked "*". */
    const order = () => ZT._tabs.map(t => { const n = nameOf(t); return n ? n + (wv._wvTabGroupStamp(t) ? "*" : "") : null; }).filter(Boolean).join(" ");
    const apply = () => { wv._applyPinnedTabs(win); wv._applyTabGroups(win); };
    const dragEv = (type, x, y, dt, target) => {
        target.dispatchEvent(new win.DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y,
            screenX: Math.round(win.mozInnerScreenX + x), screenY: Math.round(win.mozInnerScreenY + y), dataTransfer: dt }));
    };
    async function gesture(srcEl, xs) {
        const r = rect(srcEl);
        const y = Math.round(r.top + r.height / 2);
        const dt = new win.DataTransfer();
        dragEv("dragstart", Math.round(r.left + r.width / 2), y, dt, srcEl);
        let target = srcEl;
        for (const x of xs) {
            target = doc.elementFromPoint(x, y);
            if (!target || !cont.contains(target)) target = cont;
            dragEv("dragover", x, y, dt, target);
            await sleep(40);
        }
        const xEnd = xs[xs.length - 1];
        dt.dropEffect = "move";
        dragEv("drop", xEnd, y, dt, target);
        dragEv("dragend", xEnd, y, dt, srcEl);
        await sleep(900);
    }
    /** C, D, E, F in that order; `members` grouped, in order. */
    async function setup(members) {
        for (const n of Object.keys(its)) { const t = tabOf(its[n]); if (t) wv._wvTabGroupSetStamp(t, null); }
        if (group) wv._tabGroupsSet(wv._tabGroupsGet().filter(g => g.id !== group.id));
        for (const n of ["C", "D", "E", "F"]) ZT.move(tabOf(its[n]).id, ZT._tabs.length);
        group = wv._tabGroupCreate("WV Group Drag", "blue");
        for (const n of members) {
            wv._tabGroupAddKey(group.id, { libraryID: its[n].libraryID, itemKey: its[n].key });
            wv._wvTabGroupSetStamp(tabOf(its[n]), group.id);
        }
        apply();
        await sleep(500);
    }

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_applyTabGroups", "_tabGroupCreate", "_tabGroupAddKey", "_wvTabGroupSetStamp", "_wvTabGroupStamp"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        cont = doc.getElementById("tab-bar-container");
        if (!cont || typeof win.DragEvent !== "function" || typeof win.DataTransfer !== "function") this.skip();
        prevGroups = Zotero.Prefs.get("weavero.enableTabGroups");
        prevTW = Zotero.Prefs.get("weavero.enableTabsAndWindows");
        Zotero.Prefs.set("weavero.enableTabGroups", true);
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
        for (const n of ["C", "D", "E", "F"]) {
            const it = new Zotero.Item("note"); it.setNote("<p>wv group drag " + n + "</p>"); await it.saveTx();
            its[n] = it;
            await win.ZoteroPane.openNote(it.id, { openInWindow: false });
            await wvT.waitFor(() => tabOf(it), 15000, 100);
        }
        try { ZT.select("zotero-pane"); } catch (er) {}
        await sleep(300);
    });

    after(async function () {
        try {
            for (const n of Object.keys(its)) { const t = tabOf(its[n]); if (t) wv._wvTabGroupSetStamp(t, null); }
            if (group) wv._tabGroupsSet(wv._tabGroupsGet().filter(g => g.id !== group.id));
            apply();
        } catch (er) {}
        for (const n of Object.keys(its)) { const t = tabOf(its[n]); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(400);
        await wvT.erase(...Object.values(its));
        try {
            if (prevGroups === undefined) Zotero.Prefs.clear("weavero.enableTabGroups"); else Zotero.Prefs.set("weavero.enableTabGroups", prevGroups);
            if (prevTW === undefined) Zotero.Prefs.clear("weavero.enableTabsAndWindows"); else Zotero.Prefs.set("weavero.enableTabsAndWindows", prevTW);
        } catch (er) {}
    });

    it("the only tab of a group, dropped just before its own chip, stays there and leaves the group", async function () {
        await setup(["D"]);
        assert.strictEqual(order(), "C D* E F", "fixture");
        const nD = node(tabOf(its.D).id), chip = doc.getElementById("wv-tgchip-" + group.id);
        assert.ok(chip, "the group's chip");
        await gesture(nD, [Math.round(rect(nD).left - 4), Math.round(rect(chip).left + 3), Math.round(rect(chip).left + 2)]);
        assert.strictEqual(order(), "C D E F", "in place, out of the group (it went to the end: C E F D)");
    });

    it("the only tab of a group, dropped before another tab, lands there", async function () {
        await setup(["D"]);
        const nD = node(tabOf(its.D).id), nC = node(tabOf(its.C).id);
        await gesture(nD, [Math.round(rect(nD).left - 20), Math.round(rect(nC).left + 10), Math.round(rect(nC).left + 6)]);
        assert.strictEqual(order(), "D C E F");
    });

    it("the last tab of a two-tab group, dropped before another tab, lands there", async function () {
        await setup(["D", "E"]);
        assert.strictEqual(order(), "C D* E* F", "fixture");
        const nE = node(tabOf(its.E).id), nC = node(tabOf(its.C).id);
        await gesture(nE, [Math.round(rect(nE).left - 20), Math.round(rect(nC).left + 10), Math.round(rect(nC).left + 6)]);
        assert.strictEqual(order(), "E C D* F");
    });
});
