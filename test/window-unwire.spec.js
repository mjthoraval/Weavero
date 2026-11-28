/* global describe, it, before, after, assert, Zotero, Components, wvT */

// Each wiring entry owns its undo (ADR-0001, docs/adr/0001-each-wiring-entry-owns-its-undo.md;
// src/modules/window-wiring.ts). For every main-window entry that declares an `unwire`,
// on the runner's main window:
//   1. unwire it alone (_wvUnwireMainEntry): every listener and wrap layer recorded as
//      its own (lib/wire-owner.ts) is gone -- its key or layer, and the function itself
//      from the target's event listeners -- and the undo took things away only: the
//      census of what zzz-disable-leftovers.spec.js sweeps for (a function of Weavero's
//      global still attached as a listener, or left in a slot Zotero calls) has nothing
//      the window did not have before;
//   2. wire it again (_wvWireMainEntry, as the table does): the window is as it was --
//      the same wiring snapshot (wvT.wiringSnapshot), the same census, nothing doubled.
// A record of a target that is not the window's own fails the entry: its per-window
// undo would leave it. And the "auto" entries together recorded something here (an
// owner record that never fills would pass every round trip above, and undo nothing).
// The table check that every entry declares its undo: window-wiring-table.spec.js.

describe("Weavero — each wiring entry owns its undo (unwire, then wire again, on a live window)", function () {
    this.timeout(120000);
    const Cu = Components.utils;
    const els = Components.classes["@mozilla.org/eventlistenerservice;1"].getService(Components.interfaces.nsIEventListenerService);
    /** @type {any} */ let wv = null;
    /** @type {any} */ let win = null;
    /** @type {any} */ let lib = null;
    /** @type {any} */ let wvGlobal = null;
    /** @type {any[]} */ let migrated = [];

    const ours = (fn) => { try { return !!fn && Cu.getGlobalForObject(fn) === wvGlobal; } catch (e) { return false; } };
    const srcHint = (fn) => { try { return Function.prototype.toString.call(fn).replace(/\s+/g, " ").slice(0, 120); } catch (e) { return "?"; } };

    /** What a leftovers sweep would find of Weavero on `w`, as a sorted multiset:
     *  Weavero's functions in Zotero's slots (an own property not named _wv*) of the
     *  window's key hosts, and Weavero's event listeners on the window, its document,
     *  its key elements and `extra` targets. */
    function census(w, extra) {
        const out = [];
        const doc = w.document;
        const ZP = w.ZoteroPane;
        const hosts = [["window", w], ["ZoteroPane", ZP], ["Zotero_Tabs", w.Zotero_Tabs], ["ZoteroContextPane", w.ZoteroContextPane],
            ["itemsView", ZP && ZP.itemsView], ["collectionsView", ZP && ZP.collectionsView], ["itemPane", ZP && ZP.itemPane],
            ["XULPopupElement.prototype", w.XULPopupElement && w.XULPopupElement.prototype]];
        for (const tag of ["item-details", "item-pane", "abstract-box", "advanced-search-pane", "item-pane-sidenav", "zoterosearchcondition", "attachments-box"]) {
            try { const C = w.customElements && w.customElements.get(tag); if (C) hosts.push([tag + ".prototype", C.prototype]); } catch (e) {}
        }
        for (const [label, h] of hosts) {
            if (!h) continue;
            let names = [];
            try { names = Object.getOwnPropertyNames(h); } catch (e) { continue; }
            for (const n of names) {
                if (/^_?_wv/.test(n)) continue;
                let d = null;
                try { d = Object.getOwnPropertyDescriptor(h, n); } catch (e) { continue; }
                if (!d) continue;
                if (typeof d.value === "function" && ours(d.value)) out.push("slot " + label + "." + n);
                if ((d.get && ours(d.get)) || (d.set && ours(d.set))) out.push("accessor " + label + "." + n);
            }
        }
        const targets = [["window", w], ["document", doc], ["documentElement", doc.documentElement]];
        for (const id of wvT.WIRING_ELEMENT_IDS) { const el = doc.getElementById(id); if (el) targets.push(["#" + id, el]); }
        for (const t of extra || []) if (!targets.some(x => x[1] === t)) targets.push([(t && t.id ? "#" + t.id : (t && t.localName) || "target"), t]);
        for (const [label, t] of targets) {
            let infos = [];
            try { infos = els.getListenerInfoFor(t); } catch (e) { continue; }
            for (const li of infos) {
                let fn = null;
                try { fn = li.listenerObject; } catch (e) {}
                if (ours(fn)) out.push("listener " + label + " " + li.type + (li.capturing ? "(c)" : "") + " " + srcHint(fn));
            }
        }
        return out.sort();
    }
    /** Multiset a minus b. */
    const minus = (a, b) => {
        const left = b.slice();
        const out = [];
        for (const x of a) { const i = left.indexOf(x); if (i >= 0) left.splice(i, 1); else out.push(x); }
        return out;
    };
    const attached = (t, fn) => {
        try { return els.getListenerInfoFor(t).some(li => { try { return li.listenerObject === fn; } catch (e) { return false; } }); }
        catch (e) { return false; }
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvUnwireMainEntry", "_wvWireMainEntry", "_wvMainWireOwned", "_wvUnwireMainWindow"]) wvT.method(m);
        lib = wvT.lib();
        if (!lib || typeof lib.wvListenKeys !== "function" || typeof lib.wvWrapLayers !== "function") wvT.absent("Zotero.Weavero.lib.wvListenKeys / wvWrapLayers");
        migrated = wvT.method("_wvMainWires").call(wv).filter(e => e.unwire);
        wvGlobal = Cu.getGlobalForObject(wv);
        win = Zotero.getMainWindow();
        // A window an earlier spec closed late changes this one's identity marks
        // between two snapshots (window-wiring-table.spec.js).
        await wvT.settleSecondaryWindows();
    });

    after(function () {
        // Whatever happened above, every entry is wired again (idempotent when it is).
        for (const e of migrated) { try { wv._wvWireMainEntry(win, e.id); } catch (x) {} }
    });

    it("each migrated entry comes off its window completely, and back exactly", function () {
        const fails = {};
        let autoRecorded = 0, autoWired = 0;
        for (const e of migrated) {
            const id = e.id;
            const problems = [];
            // An entry the table never runs here (`nativeOff` on a Zotero with its own
            // windows) has nothing of its own on the window: no round trip. What a
            // spec may have wired by hand (option-gates.spec.js leaves Ctrl+T wired
            // "for the session") is not the table's to undo or to restore.
            if (e.nativeOff && wvT.nativeWindows()) continue;
            const snap0 = wvT.wiringSnapshot(win);
            const recs = wv._wvMainWireOwned(win, id);
            if (e.unwire === "auto") { autoWired++; if (recs.length) autoRecorded++; }
            for (const r of recs) if (!r.target) problems.push("records a " + r.kind + " that is not this window's: " + r.key + (r.layer ? ":" + r.layer : "") + " on " + r.foreign);
            const targets = recs.filter(r => r.target).map(r => r.target);
            const c0 = census(win, targets);
            try { wv._wvUnwireMainEntry(win, id); }
            catch (x) { problems.push("its unwire threw: " + x); }
            for (const r of recs) {
                if (!r.target) continue;
                if (r.kind === "listen") {
                    if (lib.wvListenKeys(r.target).some(k => k.key === r.key)) problems.push("listener " + r.key + " still keyed");
                    if (attached(r.target, r.fn)) problems.push("listener " + r.key + " still attached");
                }
                else if (lib.wvWrapLayers(r.target, r.key).some(l => l.layer === r.layer)) problems.push("layer " + r.key + ":" + r.layer + " still on");
            }
            if (wv._wvMainWireOwned(win, id).length) problems.push("records kept after the undo");
            const c1 = census(win, targets);
            const added = minus(c1, c0);
            if (added.length) problems.push("the undo ADDED: " + added.join(" | "));
            try { wv._wvWireMainEntry(win, id); }
            catch (x) { problems.push("wiring it again threw: " + x); }
            const c2 = census(win, targets);
            const plus = minus(c2, c0), lost = minus(c0, c2);
            if (plus.length || lost.length) problems.push("wired again, the census differs: +[" + plus.join(" | ") + "] -[" + lost.join(" | ") + "]");
            try { assert.deepEqual(wvT.wiringSnapshot(win), snap0); }
            catch (x) { problems.push("wired again, the wiring snapshot differs: " + String(x.message || x).slice(0, 600)); }
            if (problems.length) fails[id] = problems;
        }
        assert.deepEqual(fails, {}, "entries whose undo is not a clean round trip");
        if (autoWired) assert.isAbove(autoRecorded, 0, "the \"auto\" entries recorded nothing on this window: the owner record (lib/wire-owner.ts) is not filling");
    });
});
