/* global describe, it, before, assert, Zotero */

// The sidebar lists' keyboard navigation (reader-panels.ts _wvListKeyNav /
// _wvListKeyMove / _wvListKeyToggle over a WvListKeys model; survey
// 2026-10-06 §4, the outline / Bookmarks line-for-line twins merged
// 2026-10-21). Driven on a fake model and fake rows: the focus gate, the
// list entry, the four move modes, Space, Enter, Right / Left, Ctrl+A. The
// two real lists are checked to route through it. No library writes.

describe("Weavero — sidebar list keys: one key map for the outline and the Bookmarks tab", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("!wv");
        for (const m of ["_wvListKeyNav", "_wvListKeyMove", "_wvListKeyToggle", "_wvOutlineKeyMove", "_wvOutlineKeyToggle", "_wvBmKeyMove", "_wvBmKeyToggle"]) assert.isFunction(wv[m], m);
    });

    /** Rows with a Set-backed classList; `view` is what `closest(".view")` answers inside the list. */
    function rig(spec) {
        const view = { id: "view" };
        const rows = [];
        const parent = { querySelectorAll: (sel) => rows.filter(r => sel.split(".").filter(Boolean).every(c => r.classList.contains(c))) };
        for (const s of spec) {
            const classes = new Set(["row"]);   // every row carries the list's row class
            const row = Object.assign({
                classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
                focus() { row.focused = (row.focused || 0) + 1; },
                scrollIntoView() {},
                closest: (sel) => (sel === ".view" ? view : null),
                parentNode: parent,
            }, s);
            rows.push(row);
        }
        const list = { querySelector: (sel) => parent.querySelectorAll(sel)[0] || null };
        const idoc = { activeElement: null, body: {}, documentElement: {} };
        const calls = [];
        const reader = {};
        const m = {
            kind: "fake", viewClass: "view", rowClass: "row", active: "act", selected: "sel",
            key: (p, r) => r.key,
            sel: (rd) => rd.sel || (rd.sel = new Set()),
            anchor: (rd) => (rd.anchor == null ? null : rd.anchor),
            setAnchor: (rd, k) => { rd.anchor = k; },
            setCursor: (rd, k) => { rd.cursor = k; },
            cursor: (p, rd, rs) => rs.findIndex(r => r.classList.contains("act")),
            navigate: (p, rd, d, r) => calls.push("nav:" + r.key),
            edit: (p, rd, d, r) => calls.push("edit:" + r.key),
            container: (p, rd, r) => ({ has: !!r.container, open: !!r.open }),
            depth: (p, r) => r.depth || 0,
            setOpen: (p, rd, d, r, open) => calls.push("open:" + r.key + ":" + open),
            setSelectionOpen: (p, rd, d, open) => calls.push("selOpen:" + open),
        };
        const inView = { closest: (sel) => (sel === ".view" ? view : null) };
        const outside = { closest: () => null };
        const press = (key, mods, target) => {
            const e = Object.assign({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target: target || inView, prevented: false,
                preventDefault() { e.prevented = true; }, stopPropagation() {} }, mods || {});
            wv._wvListKeyNav(m, reader, idoc, list, rows, e);
            return e;
        };
        const active = () => { const r = rows.find(r => r.classList.contains("act")); return r ? r.key : null; };
        const selected = () => rows.filter(r => r.classList.contains("sel")).map(r => r.key);
        return { rows, list, idoc, calls, reader, m, press, active, selected, inView, outside };
    }
    const flat = (keys) => keys.map(key => ({ key }));

    it("the first nav key enters the list: Down / Home at the top, Up / End at the bottom; a plain move single-selects, anchors, navigates and lands", () => {
        let r = rig(flat(["a", "b", "c"]));
        let e = r.press("ArrowDown");
        assert.isTrue(e.prevented); assert.strictEqual(r.active(), "a"); assert.deepEqual(r.selected(), ["a"]);
        assert.deepEqual(r.calls, ["nav:a"]); assert.strictEqual(r.reader.cursor, "a"); assert.strictEqual(r.reader.anchor, "a"); assert.strictEqual(r.rows[0].focused, 1);
        r = rig(flat(["a", "b", "c"]));
        r.press("ArrowUp"); assert.strictEqual(r.active(), "c"); assert.deepEqual(r.calls, ["nav:c"]);
        r = rig(flat(["a", "b", "c"]));
        r.press("End"); assert.strictEqual(r.active(), "c");
        r = rig(flat(["a", "b", "c"]));
        r.press("Home"); assert.strictEqual(r.active(), "a");
    });

    it("Shift extends from the anchor and replaces; Ctrl moves the cursor alone and re-anchors; Ctrl+Shift merges; Space toggles the cursor row; the ends clamp", () => {
        const r = rig(flat(["a", "b", "c", "d", "e"]));
        r.press("ArrowDown"); r.press("ArrowDown");               // cursor b, sel {b}
        assert.deepEqual(r.selected(), ["b"]); assert.deepEqual(r.calls, ["nav:a", "nav:b"]);
        r.press("ArrowDown", { shiftKey: true });                 // b..c
        assert.deepEqual(r.selected(), ["b", "c"]); assert.strictEqual(r.active(), "c"); assert.strictEqual(r.reader.anchor, "b");
        assert.strictEqual(r.calls.length, 2, "Shift never navigates");
        r.press("ArrowDown", { ctrlKey: true });                  // cursor d, selection kept
        assert.strictEqual(r.active(), "d"); assert.deepEqual(r.selected(), ["b", "c"]); assert.strictEqual(r.reader.anchor, "d"); assert.strictEqual(r.calls.length, 2);
        r.press(" ");                                             // toggle d in
        assert.deepEqual(r.selected(), ["b", "c", "d"]); assert.strictEqual(r.active(), "d"); assert.strictEqual(r.reader.cursor, "d");
        r.press("ArrowDown", { ctrlKey: true });                  // cursor e
        r.press(" ");                                             // toggle e in
        r.press("ArrowUp", { ctrlKey: true }); r.press("ArrowUp", { ctrlKey: true });   // cursor c, anchor c
        r.press(" ");                                             // toggle c OUT
        assert.deepEqual(r.selected(), ["b", "d", "e"]);
        r.press("ArrowUp", { ctrlKey: true, shiftKey: true });    // merge c..b into the selection
        assert.deepEqual(r.selected(), ["b", "c", "d", "e"], "Ctrl+Shift merges the range, the scattered selection survives");
        r.press("ArrowUp", { shiftKey: true });                   // plain Shift from the anchor c to a: REPLACES
        assert.deepEqual(r.selected(), ["a", "b", "c"]);
        r.press("ArrowUp", { shiftKey: true });                   // clamped at a
        assert.strictEqual(r.active(), "a"); assert.deepEqual(r.selected(), ["a", "b", "c"]);
        r.press("End");
        assert.deepEqual(r.selected(), ["e"]); assert.strictEqual(r.calls[r.calls.length - 1], "nav:e");
    });

    it("Enter edits a single selection only; Right / Left open and close a container, step into an open one, climb to the parent from a leaf; several selected: every selected container", () => {
        const r = rig([{ key: "f", container: true, open: false, depth: 0 }, { key: "x", depth: 1 }, { key: "g", container: true, open: true, depth: 1 }, { key: "z", depth: 2 }]);
        r.press("ArrowDown");                                     // cursor f
        r.press("Enter"); assert.strictEqual(r.calls[r.calls.length - 1], "edit:f");
        r.press("ArrowRight"); assert.strictEqual(r.calls[r.calls.length - 1], "open:f:true", "a closed container opens");
        r.rows[0].open = true;
        r.press("ArrowRight"); assert.strictEqual(r.active(), "x"); assert.strictEqual(r.calls[r.calls.length - 1], "nav:x", "an open container steps into its first child");
        r.press("ArrowLeft"); assert.strictEqual(r.active(), "f"); assert.strictEqual(r.calls[r.calls.length - 1], "nav:f", "a leaf climbs to its parent");
        r.press("ArrowLeft"); assert.strictEqual(r.calls[r.calls.length - 1], "open:f:false", "an open container closes");
        r.press("End");                                           // cursor z (depth 2)
        r.press("ArrowLeft"); assert.strictEqual(r.active(), "g", "the nearest shallower row");
        r.press("a", { ctrlKey: true });
        assert.deepEqual(r.selected(), ["f", "x", "g", "z"], "Ctrl+A selects every row");
        r.press("Enter"); assert.notInclude(r.calls.slice(-1)[0], "edit:", "no edit for a multi-selection");
        r.press("ArrowRight"); assert.strictEqual(r.calls[r.calls.length - 1], "selOpen:true");
        r.press("ArrowLeft"); assert.strictEqual(r.calls[r.calls.length - 1], "selOpen:false");
    });

    it("the focus gate: nothing without focus in the view or a cursor; the event's own target inside the view counts (2026-07-28); Alt and other accel combos are left alone", () => {
        const r = rig(flat(["a", "b"]));
        let e = r.press("ArrowDown", {}, r.outside);
        assert.isFalse(e.prevented, "activeElement null, no cursor, target outside: bail"); assert.isNull(r.active());
        e = r.press("ArrowDown", {}, r.inView);
        assert.isTrue(e.prevented, "the target inside the view is enough"); assert.strictEqual(r.active(), "a");
        e = r.press("ArrowDown", {}, r.outside);
        assert.isTrue(e.prevented, "body-level focus with a cursor row"); assert.strictEqual(r.active(), "b");
        r.idoc.activeElement = { closest: () => null };          // a real widget elsewhere
        e = r.press("ArrowUp", {}, r.outside);
        assert.isFalse(e.prevented, "focus in another widget keeps its keys"); assert.strictEqual(r.active(), "b");
        r.idoc.activeElement = null;
        e = r.press("ArrowUp", { altKey: true }); assert.isFalse(e.prevented, "Alt bails");
        e = r.press("ArrowLeft", { ctrlKey: true }); assert.isFalse(e.prevented, "Ctrl+Left is not ours");
        e = r.press("x"); assert.isFalse(e.prevented, "not a nav key");
        assert.strictEqual(r.active(), "b");
    });

    it("the toggle moves the cursor to the row (Ctrl+click on any row), the move with noNav skips the navigate (Shift+click)", () => {
        const r = rig(flat(["a", "b", "c"]));
        r.press("ArrowDown");                                     // cursor a
        wv._wvListKeyToggle(r.m, r.reader, r.rows[2]);
        assert.deepEqual(r.selected(), ["a", "c"]); assert.strictEqual(r.active(), "c"); assert.strictEqual(r.reader.cursor, "c"); assert.strictEqual(r.reader.anchor, "c");
        wv._wvListKeyToggle(r.m, r.reader, r.rows[2]);
        assert.deepEqual(r.selected(), ["a"]); assert.strictEqual(r.active(), "c", "deselected, still the cursor");
        const n = r.calls.length;
        wv._wvListKeyMove(r.m, r.reader, r.idoc, r.rows, 1, false, false, true);
        assert.deepEqual(r.selected(), ["b"]); assert.strictEqual(r.active(), "b"); assert.strictEqual(r.calls.length, n, "noNav: no navigate");
        wv._wvListKeyMove(r.m, r.reader, r.idoc, r.rows, 2, true, false, true);
        assert.deepEqual(r.selected(), ["b", "c"], "a Shift range from the anchor");
    });

    it("the outline and the Bookmarks tab route through the one key map and keep no copy of it", () => {
        for (const m of ["_wvOutlineHandleKey", "_wvReaderBmHandleKey"]) {
            const s = String(wv[m]);
            assert.include(s, "_wvListKeyNav(", m + " navigates through the one key map");
            assert.notInclude(s, 'case "ArrowDown"', m + " keeps no key map of its own");
        }
        for (const m of ["_wvOutlineKeyMove", "_wvBmKeyMove"]) assert.include(String(wv[m]), "_wvListKeyMove(", m);
        for (const m of ["_wvOutlineKeyToggle", "_wvBmKeyToggle"]) assert.include(String(wv[m]), "_wvListKeyToggle(", m);
    });
});
