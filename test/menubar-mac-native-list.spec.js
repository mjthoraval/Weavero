/* global describe, it, before, assert, Zotero, wvT */

// macOS's native menubar keeps Weavero's Tools / Help mirrors in step
// (src/lib/menubar.ts wvMenubarSafeBefore; 2026-11-09). On macOS CI Zotero
// crashed in every run since 2026-11-03 when the plugin reloaded with a note
// window open (title bar hidden): Gecko's InvalidArrayIndex_CRASH.
//
// Gecko's nsMenuBarX (widget/cocoa/nsMenuBarX.mm), as arithmetic -- the
// model below: the native list starts as the MENUS among the menubar's
// children (ConstructNativeMenus); a later insertion goes in at the node's
// index among ALL child nodes (ObserveContentInserted -> InsertElementAt,
// InvalidArrayIndex_CRASH past the end); a removal takes the entry at the
// node's index (ObserveContentRemoved -> RemoveMenuAtIndex, nothing past the
// end). note.xhtml's menubar: File, Edit, macCommandSet, macKeyset, Window.
// The model runs on every platform, on detached menubars: no native menubar
// is touched (only a window's own menubar is observed).

describe("Weavero — macOS native menubar: the Tools / Help mirrors keep Gecko's list in step", () => {
    let lib, doc;
    const isMenu = (n) => n.nodeType === 1 && n.localName === "menu";

    before(function () {
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        const win = Zotero.getMainWindow();
        if (!lib || !win) wvT.absent("!lib || !win");
        assert.isFunction(lib.wvMenubarSafeBefore);
        doc = win.document;
    });

    function menu(id) { const m = doc.createXULElement("menu"); m.id = id; m.setAttribute("label", id); return m; }
    /** A detached menubar of the given shape: "menu:<id>", "commandset", "keyset", "text". */
    function bar(shape) {
        const b = doc.createXULElement("menubar");
        for (const s of shape) {
            if (s.startsWith("menu:")) b.appendChild(menu(s.slice(5)));
            else if (s === "text") b.appendChild(doc.createTextNode("\n  "));
            else b.appendChild(doc.createXULElement(s));
        }
        return b;
    }
    function model(b) {
        const list = [...b.childNodes].filter(isMenu);
        const idx = (n) => [...b.childNodes].indexOf(n);
        return {
            list,
            inserted(n) {
                const i = idx(n);
                if (i > list.length) throw new Error("InvalidArrayIndex_CRASH: insert at " + i + " of " + list.length);
                list.splice(i, 0, n);
            },
            remove(n) { const i = idx(n); n.remove(); if (i < list.length) list.splice(i, 1); },
            ids() { return list.map(n => n.id + (n.parentNode === b ? "" : "(gone)")); },
        };
    }
    /** reader.ts _wvEnsureReaderMenubarExtras's placement, through the helper. */
    function place(b, m, mac) {
        const tools = menu("wv-reader-tools-menu"), help = menu("wv-reader-help-menu");
        tools.classList.add("wv-reader-menu"); help.classList.add("wv-reader-menu");
        const wm = b.querySelector("#windowMenu");
        b.insertBefore(tools, mac === null ? wm : lib.wvMenubarSafeBefore(b, wm || null, mac));
        if (m) m.inserted(tools);
        const wantHelp = wm ? wm.nextSibling : null;
        b.insertBefore(help, mac === null ? wantHelp : lib.wvMenubarSafeBefore(b, wantHelp, mac));
        if (m) m.inserted(help);
    }
    /** _wvRemoveReaderMenubarExtras: every mirror, in document order. */
    function strip(b, m) { for (const el of [...b.querySelectorAll(".wv-reader-menu")]) m.remove(el); }
    const NOTE = ["menu:fileMenu", "menu:edit-menu", "commandset", "keyset", "menu:windowMenu"];

    for (const built of ["before", "after"]) {
        it("a note window, the native list built " + built + " the mirrors go in: open, reload, open again stay in step", function () {
            const b = bar(NOTE);
            let m = built === "before" ? model(b) : null;
            place(b, m, true);
            if (!m) m = model(b);
            assert.deepEqual(m.ids(), ["fileMenu", "edit-menu", "wv-reader-tools-menu", "wv-reader-help-menu", "windowMenu"], "opened");
            strip(b, m);
            assert.deepEqual(m.ids(), ["fileMenu", "edit-menu", "windowMenu"], "torn down: the right native menus went");
            place(b, m, true);   // the reloaded instance
            assert.deepEqual(m.ids(), ["fileMenu", "edit-menu", "wv-reader-tools-menu", "wv-reader-help-menu", "windowMenu"], "wired again");
        });
    }

    it("the placement before the fix crashes the model on the reload (what macOS CI hit)", function () {
        const b = bar(NOTE);
        place(b, null, null);   // Tools before Window, Help after it, as in 1.0.1
        const m = model(b);
        strip(b, m);
        assert.deepEqual(m.ids(), ["fileMenu", "edit-menu", "wv-reader-tools-menu(gone)", "windowMenu"], "Tools' removal took Help's native entry");
        assert.throws(() => place(b, m, null), /InvalidArrayIndex_CRASH/);
    });

    it("a menubar of menus only keeps the main window's order: Tools before Window, Help after it", function () {
        const b = bar(["menu:fileMenu", "menu:edit-menu", "menu:view-menu", "menu:windowMenu"]);
        const m = model(b);
        place(b, m, true);
        assert.deepEqual(m.ids(), ["fileMenu", "edit-menu", "view-menu", "wv-reader-tools-menu", "windowMenu", "wv-reader-help-menu"]);
        strip(b, m);
        place(b, m, true);
        assert.deepEqual(m.ids(), ["fileMenu", "edit-menu", "view-menu", "wv-reader-tools-menu", "windowMenu", "wv-reader-help-menu"]);
    });

    it("a text node counts as a child that is not a menu; off macOS the wanted place is kept", function () {
        const b = bar(["menu:fileMenu", "text", "menu:windowMenu"]);
        const wm = b.querySelector("#windowMenu");
        assert.strictEqual(lib.wvMenubarSafeBefore(b, wm, true), b.childNodes[1], "before the text node");
        assert.strictEqual(lib.wvMenubarSafeBefore(b, wm, false), wm, "off macOS: as given");
        assert.strictEqual(lib.wvMenubarSafeBefore(bar(["menu:a", "menu:b"]), null, true), null, "menus only: the end");
    });
});
