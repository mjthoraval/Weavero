/* global describe, it, before, after, assert, Zotero, wvT */
// A split's two tabs drag as ONE block, as Firefox drags its tab-split-view-wrapper
// (drag-and-drop.mjs handle_dragstart: `if (tab.splitview) tab = tab.splitview`;
// _getDropIndex: `if (item.splitview) item = item.splitview`). MJT 2026-11-18:
// "Dragging split view tabs should make them move together with the preview of the
// 2 split view tabs staying together", then "do the same as Firefox":
//   - either tab of the pair held, both are lifted, side by side, by the same amount;
//   - the pair lands together where it is dropped, in its order;
//   - another tab never lands between a pair's two tabs.
// Synthetic DragEvents run the real listener chain (as tab-group-drag.spec.js).
describe("Weavero — split view: a pair drags as one block", function () {
    this.timeout(120000);
    let wv, win, ZT, doc, cont, prevSplit, prevTW;
    const its = {};
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const tabOf = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const node = (n) => doc.querySelector('#tab-bar-container .tab[data-id="' + tabOf(its[n]).id + '"]');
    const rect = (el) => el.getBoundingClientRect();
    const nameOf = (t) => { for (const k of Object.keys(its)) if (its[k].id === (t.data && t.data.itemID)) return k; return null; };
    const order = () => ZT._tabs.map(nameOf).filter(Boolean).join(" ");
    const separateAll = () => { for (const s of (win._wvTSplits || []).slice()) { try { wv._wvTabSplitSeparate(win, s.id); } catch (er) {} } };
    const dragEv = (type, x, y, dt, target) => {
        target.dispatchEvent(new win.DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y,
            screenX: Math.round(win.mozInnerScreenX + x), screenY: Math.round(win.mozInnerScreenY + y), dataTransfer: dt }));
    };
    /** Drag `srcEl` along `xs`; `mid` runs after the last dragover, before the drop. */
    async function gesture(srcEl, xs, mid) {
        const r = rect(srcEl);
        const y = Math.round(r.top + r.height / 2);
        const dt = new win.DataTransfer();
        dragEv("dragstart", Math.round(r.left + r.width / 2), y, dt, srcEl);
        let target = srcEl;
        for (const x of xs) {
            target = doc.elementFromPoint(x, y);
            if (!target || !cont.contains(target)) target = cont;
            dragEv("dragover", x, y, dt, target);
            await sleep(60);
        }
        if (mid) await mid();
        const xEnd = xs[xs.length - 1];
        dt.dropEffect = "move";
        dragEv("drop", xEnd, y, dt, target);
        dragEv("dragend", xEnd, y, dt, srcEl);
        await sleep(1200);
    }
    /** C D E F G in that order, D|E a split. */
    async function setup() {
        separateAll();
        for (const n of ["C", "D", "E", "F", "G"]) ZT.move(tabOf(its[n]).id, ZT._tabs.length);
        await sleep(300);
        const s = wv._wvTabSplitCreate(win, tabOf(its.D).id, tabOf(its.E).id, { select: "none" });
        assert.ok(s, "fixture: the split D|E");
        await sleep(900);
        assert.strictEqual(order(), "C D E F G", "fixture");
        return s;
    }

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvTabSplitCreate", "_wvTabSplitSeparate", "_wvDragCacheGeom"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        cont = doc.getElementById("tab-bar-container");
        if (!cont || typeof win.DragEvent !== "function" || typeof win.DataTransfer !== "function") this.skip();
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        prevTW = Zotero.Prefs.get("weavero.enableTabsAndWindows");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
        for (const n of ["C", "D", "E", "F", "G"]) {
            const it = new Zotero.Item("note"); it.setNote("<p>wv split drag " + n + "</p>"); await it.saveTx();
            its[n] = it;
            await win.ZoteroPane.openNote(it.id, { openInWindow: false });
            await wvT.waitFor(() => tabOf(it), 15000, 100);
        }
        try { ZT.select(ZT._tabs.find(t => String(t.type).startsWith("library")).id); } catch (er) {}
        await sleep(300);
    });

    after(async function () {
        separateAll();
        for (const n of Object.keys(its)) { const t = tabOf(its[n]); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(400);
        await wvT.erase(...Object.values(its));
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (er) {}
        try {
            if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit);
            if (prevTW === undefined) Zotero.Prefs.clear("weavero.enableTabsAndWindows"); else Zotero.Prefs.set("weavero.enableTabsAndWindows", prevTW);
        } catch (er) {}
    });

    it("the right tab of a pair held: both lifted side by side by the same amount while dragging, and the pair lands together after G", async function () {
        await setup();
        const nE = node("E"), nG = node("G");
        let seen = null;
        await gesture(nE, [Math.round(rect(nE).left + 30), Math.round(rect(nG).left + 20), Math.round(rect(nG).right - 4)], async () => {
            const d = node("D"), e = node("E");
            const rd = rect(d), re = rect(e);
            const host = doc.getElementById("wv-tsplit-pills");
            const pill = host && Array.from(host.querySelectorAll(".wv-tsplit-pill")).find(p => {
                const s = wv._wvTabSplitOf(win, tabOf(its.D).id); return s && p.getAttribute("data-split") === s.id;
            });
            const pr = pill && pill.getBoundingClientRect();
            seen = {
                liftedD: d.hasAttribute("data-wv-lifted"), liftedE: e.hasAttribute("data-wv-lifted"),
                liftD: d.style.getPropertyValue("--wv-lift"), liftE: e.style.getPropertyValue("--wv-lift"),
                gap: Math.round(re.left - rd.right), stowed: d.classList.contains("wv-drag-stowed"),
                // The pair's background travels with it (MJT 2026-11-18, "Same as in Firefox").
                pillShown: !!(host && !host.hidden && pill && pr.width > 0),
                pillTf: pill ? pill.style.transform : null,
                pillLeft: pr ? Math.round(pr.left) : null, pillRight: pr ? Math.round(pr.right) : null,
                tabsLeft: Math.round(Math.min(rd.left, re.left)), tabsRight: Math.round(Math.max(rd.right, re.right)),
            };
        });
        assert.ok(seen && seen.liftedD && seen.liftedE, "both tabs lifted during the drag: " + JSON.stringify(seen));
        assert.strictEqual(seen.liftD, seen.liftE, "by the same amount");
        assert.isAtMost(Math.abs(seen.gap), 12, "side by side, as in the strip: " + JSON.stringify(seen));
        assert.isFalse(seen.stowed, "the other tab shown, not stowed as a multi-selection's");
        assert.isTrue(seen.pillShown, "the pair's background shown while it is dragged: " + JSON.stringify(seen));
        assert.isAtMost(seen.pillLeft, seen.tabsLeft, "around the two tabs (left): " + JSON.stringify(seen));
        assert.isAtMost(seen.tabsLeft - seen.pillLeft, 6, "close around them, moved with them (left): " + JSON.stringify(seen));
        assert.isAtLeast(seen.pillRight, seen.tabsRight, "around the two tabs (right): " + JSON.stringify(seen));
        assert.strictEqual(order(), "C F G D E", "the pair dropped together after G, in its order");
        const s = wv._wvTabSplitOf(win, tabOf(its.D).id);
        assert.ok(s && s.left === tabOf(its.D).id && s.right === tabOf(its.E).id, "still a split, D on the left");
        assert.notOk(node("D").hasAttribute("data-wv-lifted") || node("E").hasAttribute("data-wv-lifted"), "nothing left lifted after the drop");
        const left = Array.from(doc.querySelectorAll("#wv-tsplit-pills .wv-tsplit-pill")).filter(p => p.style.transform);
        assert.lengthOf(left, 0, "no background left moved after the drop");
    });

    it("the left tab of a pair held: the pair lands together before C", async function () {
        await setup();
        const nD = node("D"), nC = node("C");
        await gesture(nD, [Math.round(rect(nD).left - 10), Math.round(rect(nC).left + 10), Math.round(rect(nC).left + 4)]);
        assert.strictEqual(order(), "D E C F G");
    });

    it("another tab dropped on the middle of a pair lands before or after it, never between its two tabs", async function () {
        await setup();
        const nG = node("G"), nD = node("D"), nE = node("E");
        // Just left of the pair's middle (over D's right half), then just right of it.
        const midX = Math.round((rect(nD).left + rect(nE).right) / 2);
        await gesture(nG, [Math.round(rect(nG).left - 10), midX - 3]);
        assert.strictEqual(order(), "C G D E F", "left of the pair's middle: before the pair");
        await setup();
        const nG2 = node("G"), nD2 = node("D"), nE2 = node("E");
        const mid2 = Math.round((rect(nD2).left + rect(nE2).right) / 2);
        await gesture(nG2, [Math.round(rect(nG2).left - 10), mid2 + 3]);
        assert.strictEqual(order(), "C D E G F", "right of the pair's middle: after the pair");
    });
});
