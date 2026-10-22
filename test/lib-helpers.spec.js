/* global describe, it, before, assert, Zotero */

// Shared helpers in src/lib (survey 2026-10-06 §3.2–3.3, step 3 of §9):
// wvLivePlugin, wvWrap / wvUnwrap (layered, tag-stamped wraps), wvInjectStyle,
// wvTimeout / wvSleep. Published as `Zotero.Weavero.lib` for this suite. The
// last cases lock the migrations: no `|| self` / `|| this` plugin fallback
// anywhere, Zotero_Tabs and itemsView wraps layered under the instance tag.

describe("Weavero — shared helpers (src/lib)", () => {
    let wv, lib, win;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        win = Zotero.getMainWindow();
        if (!wv || !lib || !win) this.skip();
    });

    it("wvLivePlugin: the live instance; null once torn down or absent", () => {
        assert.strictEqual(lib.wvLivePlugin(), wv);
        const had = wv._wvDestroyed;
        wv._wvDestroyed = true;
        try { assert.isNull(lib.wvLivePlugin(), "a torn-down instance is not live"); }
        finally { wv._wvDestroyed = had; }
        assert.strictEqual(lib.wvLivePlugin(), wv);
    });

    it("wvWrap: layers rebuild from the native, a foreign instance's layer drops, unwrap restores exactly", () => {
        const proto = { m(x) { return "n" + x; } };
        const host = Object.create(proto);
        host.own = function (x) { return "o" + x; };
        const T1 = "wv@t#one", T2 = "wv@t#two";
        const layer = (L) => (orig) => function (x) { return L + "(" + orig.call(this, x) + ")"; };
        assert.isTrue(lib.wvWrap(host, "m", "a", T1, layer("A")));
        assert.isFalse(lib.wvWrap(host, "m", "a", T1, layer("never")), "same layer under the same tag: no-op");
        assert.isTrue(lib.wvWrap(host, "m", "b", T1, layer("B")));
        assert.strictEqual(host.m(1), "B(A(n1))", "install order: innermost first");
        assert.deepEqual(lib.wvWrapLayers(host, "m").map(l => l.layer), ["a", "b"]);
        // Another INSTANCE wraps (new tag): the dead instance's layers are
        // gone, not stacked under -- the hot-upgrade rule.
        assert.isTrue(lib.wvWrap(host, "m", "c", T2, layer("C")));
        assert.strictEqual(host.m(1), "C(n1)");
        assert.deepEqual(lib.wvWrapLayers(host, "m").map(l => l.layer + "@" + l.tag), ["c@" + T2]);
        lib.wvWrap(host, "m", "d", T2, layer("D"));
        assert.strictEqual(host.m(1), "D(C(n1))");
        assert.isTrue(lib.wvUnwrap(host, "m", "c"));
        assert.strictEqual(host.m(1), "D(n1)", "removing an inner layer re-applies the outer on the native");
        assert.isTrue(lib.wvUnwrap(host, "m"));
        assert.isFalse(Object.prototype.hasOwnProperty.call(host, "m"), "a prototype method shows through again");
        assert.strictEqual(host.m(1), "n1");
        assert.isUndefined(host._wvWraps, "the table goes with the last wrap");
        // An own-property member is put back, not deleted.
        const ownFn = host.own;
        lib.wvWrap(host, "own", "a", T1, layer("A"));
        assert.strictEqual(host.own(2), "A(o2)");
        lib.wvUnwrap(host, "own");
        assert.strictEqual(host.own, ownFn);
        assert.isFalse(lib.wvUnwrap(host, "own"), "nothing wrapped: false");
        assert.isFalse(lib.wvWrap(host, "nope", "a", T1, (o) => o), "no such function: false");
    });

    // Firefox 153 (Zotero 11): boolean XUL attributes on presence alone; Zotero
    // 10: only the literal "true" (audit against "Zotero 11 for Developers",
    // 2026-10-13).
    it("wvBoolAttrOn reads a boolean XUL attribute as the running platform applies it", () => {
        const presence = (/** @type {any} */ (Zotero).platformMajorVersion || 0) >= 153;
        const el = win.document.createXULElement("menuitem");
        assert.isFalse(lib.wvBoolAttrOn(el, "disabled"), "absent");
        el.setAttribute("disabled", "true");
        assert.isTrue(lib.wvBoolAttrOn(el, "disabled"), "the literal \"true\" on every platform");
        el.setAttribute("disabled", "");
        assert.strictEqual(lib.wvBoolAttrOn(el, "disabled"), presence, "\"\": on 11, off on 10");
        el.setAttribute("disabled", "false");
        assert.strictEqual(lib.wvBoolAttrOn(el, "disabled"), presence, "\"false\": still ON on 11");
        assert.isFalse(lib.wvBoolAttrOn(null, "disabled"));
    });

    it("wvInjectStyle: one element per id, text refreshed when it changes; wvRemoveStyle", () => {
        const doc = win.document.implementation.createHTMLDocument("wv-lib");
        const a = lib.wvInjectStyle(doc, "wv-lib-test-style", "a{}");
        assert.strictEqual(a.localName, "style");
        assert.strictEqual(a.parentNode, doc.head);
        const b = lib.wvInjectStyle(doc, "wv-lib-test-style", "b{}");
        assert.strictEqual(b, a, "the same element is refreshed");
        assert.strictEqual(a.textContent, "b{}");
        assert.strictEqual(doc.querySelectorAll("#wv-lib-test-style").length, 1);
        const host = doc.createElement("div");
        doc.body.appendChild(host);
        const c = lib.wvInjectStyle(doc, "wv-lib-test-style-2", "c{}", host);
        assert.strictEqual(c.parentNode, host, "an explicit host wins");
        lib.wvRemoveStyle(doc, "wv-lib-test-style");
        assert.isNull(doc.getElementById("wv-lib-test-style"));
        lib.wvRemoveStyle(doc, "wv-lib-test-style");   // absent: no throw
        assert.isNull(lib.wvInjectStyle(null, "x", ""));
    });

    it("wvTimeout / wvSleep / wvClearTimeout run on the sandbox clock", async () => {
        let fired = false;
        const t = lib.wvTimeout(() => { fired = true; }, 5);
        assert.isOk(t != null);
        await lib.wvSleep(40);
        assert.isTrue(fired);
        const t2 = lib.wvTimeout(() => { throw new Error("a cleared timer ran"); }, 5);
        lib.wvClearTimeout(t2);
        lib.wvClearTimeout(null);
        await lib.wvSleep(20);
    });

    // Survey §4 #9 (2026-10-20): fifty hand-spelled main-window lists with
    // five fallbacks became one helper.
    it("wvMainWins: Zotero's main windows, nulls dropped; no method spells the list out any more", () => {
        let wins;
        try { wins = lib.wvMainWins(); } catch (e) { assert.fail("wvMainWins threw: " + e + "\n" + (e && e.stack)); }
        assert.isTrue(Array.isArray(wins), "an array: " + typeof wins + " / lib has: " + Object.keys(lib).join(","));
        assert.isTrue(wins.includes(win), "the focused main window is among them (" + wins.length + ")");
        // Identity, not chai's deep equality (windows are cross-compartment objects).
        const native = Zotero.getMainWindows().filter(Boolean);
        assert.strictEqual(wins.length, native.length);
        assert.isTrue(wins.every((w, i) => w === native[i]), "the same windows in the same order");
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    if (/getMainWindows\s*\?\s*\w+\.getMainWindows\(\)/.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "the main-windows list comes from wvMainWins()");
    });

    // Survey §4 #9 (2026-10-20): the accelerator checks, Zotero's own split --
    // keyboard platform-correct, mouse click loose -- in one place each.
    it("wvAccel is the platform's accelerator, wvAccelAny either key; no method spells either check out any more", () => {
        const mac = !!Zotero.isMac;
        const ev = (o) => Object.assign({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, o);
        assert.strictEqual(lib.wvAccel(ev({ ctrlKey: true })), !mac, "Ctrl is the accelerator off a Mac only");
        assert.strictEqual(lib.wvAccel(ev({ metaKey: true })), mac, "Cmd is the accelerator on a Mac only");
        assert.isFalse(lib.wvAccel(ev({})));
        assert.isFalse(lib.wvAccel(null));
        assert.isTrue(lib.wvAccelAny(ev({ ctrlKey: true })) && lib.wvAccelAny(ev({ metaKey: true })), "either key for a click");
        assert.isFalse(lib.wvAccelAny(ev({ shiftKey: true })) || lib.wvAccelAny(null));
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    const s = String(d.value);
                    if (/(\w+)\.ctrlKey\s*\|\|\s*\1\.metaKey/.test(s) || /(\w+)\.metaKey\s*\|\|\s*\1\.ctrlKey/.test(s)
                            || /isMac\s*\?\s*(\w+)\.metaKey\s*:\s*\1\.ctrlKey/.test(s)) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "accelerators come from wvAccel / wvAccelAny");
    });

    // Survey §4 #7 (2026-10-20): 44 cloneInto sites in four spellings behind
    // five fallbacks became one helper.
    it("wvCloneFor hands a content global a readable copy, keeps the call total; no method calls cloneInto itself any more", () => {
        const src = { a: 1, rects: [[1, 2, 3, 4]] };
        const c = lib.wvCloneFor(src, win);
        assert.notStrictEqual(c, src, "a copy");
        assert.strictEqual(c.a, 1);
        assert.deepEqual(Array.from(c.rects[0]), [1, 2, 3, 4]);
        assert.strictEqual(lib.wvCloneFor(src, null), src, "no target: the object itself");
        const withFn = lib.wvCloneFor({ f() { return 7; } }, win, { cloneFunctions: true });
        assert.strictEqual(withFn.f(), 7, "options reach Cu (cloneFunctions)");
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    if (/\.cloneInto\(/.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "content-side copies come from wvCloneFor");
    });

    // Survey §4 #8 (2026-10-20): one anchor definition -- the oldest main
    // window -- for the restore steps that looked the anchor up as "the main
    // window without the managed tag".
    it("_wvAnchorWindow is the oldest main window, the same window _wvIsAnchorWindow accepts; no method looks the anchor up by the managed tag any more", () => {
        const a = wv._wvAnchorWindow();
        assert.strictEqual(a, Zotero.getMainWindows()[0]);
        assert.isTrue(wv._wvIsAnchorWindow(a));
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    if (/\.find\(\(\w+\)\s*=>\s*!\w+\._wvManagedWindow\)/.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "the anchor comes from _wvAnchorWindow()");
    });

    // Survey §4 #10 (2026-10-20): one XUL menuitem builder for the thirteen
    // `mk` lambdas (and the manager's menu).
    it("wvMenuItem builds a XUL menuitem from a spec and guards its command; no method hand-builds one in an `mk` lambda any more", async () => {
        const doc = win.document;
        const pop = doc.createXULElement("menupopup");
        const seen = [];
        const a = lib.wvMenuItem(doc, { label: "wv-lib-a", image: "chrome://zotero/skin/16/universal/view.svg", acceltext: "Ctrl+K", cls: "wv-x wv-y", onCommand: (ev) => seen.push(ev.type) }, pop);
        assert.strictEqual(a.localName, "menuitem");
        assert.strictEqual(a.parentNode, pop, "appended to the parent");
        assert.strictEqual(a.getAttribute("label"), "wv-lib-a");
        assert.strictEqual(a.getAttribute("acceltext"), "Ctrl+K");
        assert.isTrue(a.classList.contains("menuitem-iconic") && a.classList.contains("wv-x") && a.classList.contains("wv-y"), "image adds menuitem-iconic; classes split");
        a.dispatchEvent(new win.Event("command"));
        assert.deepEqual(seen, ["command"]);
        const b = lib.wvMenuItem(doc, { label: "wv-lib-b", iconClass: "wv-hid-icon-collection", disabled: true, onCommand: () => { throw new Error("boom"); } });
        assert.isNull(b.parentNode, "no parent: detached");
        assert.strictEqual(b.getAttribute("disabled"), "true");
        assert.isTrue(b.classList.contains("menuitem-iconic") && b.classList.contains("wv-hid-icon-collection"));
        b.dispatchEvent(new win.Event("command"));   // a throwing handler is logged, not thrown
        const c = lib.wvMenuItem(doc, { label: "wv-lib-c", onCommand: () => Promise.reject(new Error("late")) });
        c.dispatchEvent(new win.Event("command"));   // a rejecting handler is caught, not left unhandled
        await lib.wvSleep(20);
        const sep = lib.wvMenuSeparator(doc, pop);
        assert.strictEqual(sep.localName, "menuseparator");
        assert.strictEqual(sep.parentNode, pop);
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    const s = String(d.value);
                    // An `mk` lambda that still builds the menuitem by hand.
                    if (/const mk = \([^)]*\) => \{[^}]*createXULElement\("menuitem"\)/.test(s)) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "menu items come from wvMenuItem");
    });

    // Survey §4 #10 (2026-10-20): one SVG element builder behind the hand-drawn
    // icons -- the namespace, the attribute chain and the append in one call.
    it("wvSvgEl builds an SVG element with its attributes, appended when a parent is given; no method spells the SVG namespace out any more", () => {
        const doc = win.document;
        const svg = lib.wvSvgEl(doc, "svg", { viewBox: "0 0 16 16", width: 16, "aria-hidden": "true" });
        assert.strictEqual(svg.namespaceURI, lib.WV_SVG_NS, "the SVG namespace");
        assert.strictEqual(svg.localName, "svg");
        assert.strictEqual(svg.getAttribute("viewBox"), "0 0 16 16");
        assert.strictEqual(svg.getAttribute("width"), "16", "a number is stringified");
        assert.strictEqual(svg.getAttribute("aria-hidden"), "true");
        assert.isNull(svg.parentNode, "no parent: detached");
        const p = lib.wvSvgEl(doc, "path", { d: "M0 0h16v16H0z" }, svg);
        assert.strictEqual(p.parentNode, svg, "appended to the parent");
        assert.strictEqual(p.namespaceURI, lib.WV_SVG_NS);
        assert.strictEqual(lib.wvSvgEl(doc, "g").attributes.length, 0, "no attrs: none set");
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    // A local namespace constant (`const NS = "http://www.w3.org/2000/svg"`);
                    // markup strings (`xmlns="..."`) are data and stay.
                    if (/= "http:\/\/www\.w3\.org\/2000\/svg"/.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "the SVG namespace comes from lib/svg");
    });

    // Survey §4 #9 (2026-10-20): the window-type read and the typing check, one way each.
    it("wvWinType reads a window's or a document's windowtype, \"\" otherwise; no method spells the read out any more", () => {
        assert.strictEqual(lib.wvWinType(win), "navigator:browser", "the main window");
        assert.strictEqual(lib.wvWinType(win.document), "navigator:browser", "its document");
        assert.strictEqual(lib.wvWinType(null), "");
        assert.strictEqual(lib.wvWinType({}), "", "not a window");
        assert.strictEqual(lib.wvWinType({ document: {} }), "", "no root yet");
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    if (/getAttribute\("windowtype"\)/.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "the window type comes from wvWinType");
    });

    it("wvIsTextEntry: editable regions, inputs, textareas and selects take typed text; no method spells the check out any more", () => {
        const doc = win.document, X = "http://www.w3.org/1999/xhtml";
        const mk = (tag) => doc.createElementNS(X, tag);
        for (const tag of ["input", "textarea", "select"]) assert.isTrue(lib.wvIsTextEntry(mk(tag)), tag);
        assert.isFalse(lib.wvIsTextEntry(mk("div")));
        assert.isFalse(lib.wvIsTextEntry(mk("span")));
        assert.isFalse(lib.wvIsTextEntry(null));
        const ed = mk("div"); ed.setAttribute("contenteditable", "true");
        doc.documentElement.appendChild(ed);
        try { assert.isTrue(lib.wvIsTextEntry(ed), "an editable region"); } finally { ed.remove(); }
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    if (/isContentEditable \|\| \w+\.localName === "input"/.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "the typing check comes from wvIsTextEntry");
    });

    // Survey §4 #10 (2026-10-21): one HTML element builder behind the namespace constants.
    it("wvHtmlEl builds an XHTML element with its class, text and parent when given; no method spells the XHTML namespace out any more", () => {
        const doc = win.document, host = doc.createElementNS(lib.WV_XHTML_NS, "div");
        const a = lib.wvHtmlEl(doc, "span", "wv-a wv-b", "hello", host);
        assert.strictEqual(a.namespaceURI, lib.WV_XHTML_NS);
        assert.strictEqual(a.localName, "span");
        assert.strictEqual(a.className, "wv-a wv-b");
        assert.strictEqual(a.textContent, "hello");
        assert.strictEqual(a.parentNode, host, "appended to the parent");
        const b = lib.wvHtmlEl(doc, "div");
        assert.strictEqual(b.className, ""); assert.strictEqual(b.textContent, ""); assert.isNull(b.parentNode);
        const c = lib.wvHtmlEl(doc, "div", undefined, "");
        assert.strictEqual(c.textContent, "", "an empty text is still set");
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    if (/= "http:\/\/www\.w3\.org\/1999\/xhtml"|createElementNS\("http:\/\/www\.w3\.org\/1999\/xhtml"/.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "the XHTML namespace comes from lib/dom");
    });

    // Survey §4 #10 (2026-10-20): the link colours, one set.
    it("the link palette: one set of colours, light and dark, as CSS variables, class rules and a colour; no method spells the hex values out any more", () => {
        const P = lib.WV_LINK_PALETTE;
        assert.deepEqual(Object.keys(P), ["http", "zotero", "app"]);
        for (const k of Object.keys(P)) {
            assert.match(P[k].light, /^#[0-9a-f]{6}$/, k + " light");
            assert.match(P[k].dark, /^#[0-9a-f]{6}$/, k + " dark");
            assert.notStrictEqual(P[k].light, P[k].dark, k + " differs by scheme");
        }
        const light = lib.wvLinkVars("light"), dark = lib.wvLinkVars("dark");
        assert.include(light, "--wv-link-http: " + P.http.light + ";");
        assert.include(light, "--wv-link-zotero: " + P.zotero.light + ";");
        assert.include(light, "--wv-link-app: " + P.app.light + ";");
        assert.include(dark, "--wv-link-http: " + P.http.dark + ";");
        assert.strictEqual(lib.wvLinkColor("zotero", true), P.zotero.dark);
        assert.strictEqual(lib.wvLinkColor("app", false), P.app.light);
        const rules = lib.wvLinkClassRules(".wv-x");
        assert.strictEqual(rules.length, 8, "three light rules, a media block of three dark ones");
        assert.strictEqual(rules[0], ".wv-x.wv-link-http{color:" + P.http.light + ";}");
        assert.strictEqual(rules[3], "@media (prefers-color-scheme: dark){");
        assert.strictEqual(rules[4], " .wv-x.wv-link-http{color:" + P.http.dark + ";}");
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    if (/--wv-link-http:\s*#[0-9a-f]{6}|"#8ab4f8"|"#1a73e8"/i.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "the link colours come from WV_LINK_PALETTE");
    });

    // Survey §4 #10 (2026-10-20): one row builder behind the reader panels' context menus.
    it("_wvCtxItem builds a context-menu row (icon cell, label, hint, default mark, classes) and runs close before onClick; no menu hand-builds the row in a lambda any more", () => {
        assert.isFunction(wv._wvCtxItem); assert.isFunction(wv._wvCtxHeading); assert.isFunction(wv._wvCtxSep);
        const doc = win.document, menu = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        const order = [];
        // Markup icons are the reader frame's SVG strings; the main window's
        // sanitizer strips a bare <svg> from innerHTML, so the probe is a span.
        const it = wv._wvCtxItem(doc, menu, { label: "wv-lib-row", icon: "<span class=\"wv-lib-ic\"></span>", hint: "Ctrl+K", def: true, danger: true,
            close: () => order.push("close"), onClick: (ev) => order.push("click:" + ev.type) });
        assert.strictEqual(it.parentNode, menu, "appended to the menu");
        assert.isTrue(it.classList.contains("wv-ctx-item") && it.classList.contains("wv-ctx-danger"));
        assert.strictEqual(it.children[0].className, "wv-ctx-ic");
        assert.isOk(it.children[0].querySelector(".wv-lib-ic"), "a markup string becomes markup");
        assert.strictEqual(it.children[1].textContent, "wv-lib-row");
        assert.strictEqual(it.querySelector(".wv-ctx-hint").textContent, "Ctrl+K");
        assert.strictEqual(it.querySelector(".wv-ctx-def").textContent, "(default)");
        it.dispatchEvent(new win.Event("click"));
        assert.deepEqual(order, ["close", "click:click"], "close first, then the handler with the event");
        const tick = wv._wvCtxItem(doc, null, { label: "t", ticked: true, off: true, disabled: true });
        assert.isNull(tick.parentNode, "no parent: detached");
        assert.strictEqual(tick.children[0].textContent, "✓", "a tick is text");
        assert.isTrue(tick.classList.contains("wv-ctx-off"));
        assert.include(tick.getAttribute("style"), "pointer-events:none");
        assert.isNull(tick.querySelector(".wv-ctx-hint"), "no hint span without a hint");
        const emoji = wv._wvCtxItem(doc, null, { label: "e", icon: "👍" });
        assert.strictEqual(emoji.children[0].textContent, "👍", "an emoji is text");
        const hd = wv._wvCtxHeading(doc, menu, "Sort by");
        assert.strictEqual(hd.className, "wv-ctx-heading"); assert.strictEqual(hd.parentNode, menu);
        const s1 = wv._wvCtxSep(doc, menu), s2 = wv._wvCtxSep(doc, menu, true);
        assert.strictEqual(s1.className, "wv-ctx-sep"); assert.isNull(s2, "a deduped separator never doubles");
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    if (/const (mk|row|item|mkItem) = \([^)]*\) => \{\s*const it = idoc\.createElementNS\(\w+, "div"\);\s*it\.className = "wv-ctx-item/.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "context-menu rows come from _wvCtxItem");
    });

    // Survey §4 #10 (2026-10-20): the filter popups' option-tile rules, one generator.
    it("wvFilterTileRules scopes the tile rules under a prefix and adds the dark selected variant the way the surface signals dark; no method spells a selected-tile rule out any more", () => {
        const none = lib.wvFilterTileRules("#wv-x");
        assert.strictEqual(none.length, 7, "idle, hover, selected, selected hover, excluded, excluded hover, icon tile");
        assert.isTrue(none.every(r => r.startsWith("#wv-x .wv-filter-opt")), "every rule scoped");
        assert.include(none[2], "[data-selected=\"true\"]{background:rgba(94,106,210,0.34)");
        assert.include(none[4], "[data-excluded=\"true\"]{border-color:rgba(220,72,72,0.7);background:linear-gradient(");
        assert.include(none[6], ".wv-filter-opt-icon{padding:4px;min-width:26px;height:26px;");
        const cls = lib.wvFilterTileRules("", "class");
        assert.strictEqual(cls.length, 9);
        assert.isTrue(cls[0].startsWith(".wv-filter-opt{"), "no prefix: bare selectors");
        assert.isTrue(cls[7].startsWith(":root.wv-ui-dark .wv-filter-opt[data-selected=\"true\"]{background:rgba(120,134,255,0.40)"), "dark by root class");
        const media = lib.wvFilterTileRules("#wv-y", "media");
        assert.strictEqual(media.length, 8);
        assert.isTrue(media[7].startsWith("@media (prefers-color-scheme: dark){#wv-y .wv-filter-opt[data-selected=\"true\"]{"), "dark by the OS scheme");
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    if (/\.wv-filter-opt\[data-selected=\\?"true\\?"\]\s*\{/.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "the tile rules come from wvFilterTileRules");
    });

    // Survey §4 #10 (2026-10-20): one outside-click dismisser behind the popups
    // that each hand-rolled a document mousedown closer.
    it("wvOutsideClick dismisses on a press outside the panel and its kept nodes, never inside; removes itself once closed; marks no-drag while open; no method hand-rolls a closer any more", async () => {
        const doc = win.document, X = "http://www.w3.org/1999/xhtml";
        const el = (cls) => { const e = doc.createElementNS(X, "div"); e.className = cls; return e; };
        const host = el("wv-lib-dismiss-host"), panel = el("wv-lib-dismiss-panel"), inner = el("inner"), anchor = el("anchor"), other = el("other"), dragArea = el("drag");
        panel.appendChild(inner);
        for (const n of [panel, anchor, other, dragArea]) host.appendChild(n);
        doc.documentElement.appendChild(host);
        const press = (n) => n.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
        try {
            const seen = [];
            const off = lib.wvOutsideClick({ panel, keep: [anchor], noDrag: [dragArea], owner: wv, onOutside: (e) => seen.push(e.target === other ? "other" : "?") });
            assert.strictEqual(panel._wvDismissOff, off, "the teardown is kept on the panel");
            assert.isTrue(wv._wvDismissOffs.has(off), "registered for destroy()");
            assert.strictEqual(dragArea.getAttribute("data-wv-nodrag"), "1", "marked no-drag while open");
            assert.isOk(doc.getElementById("wv-nodrag"), "the no-drag rule is in the document");
            press(inner); press(anchor);
            assert.deepEqual(seen, [], "a press inside the panel or on a kept node never dismisses");
            press(other);
            assert.deepEqual(seen, ["other"], "a press elsewhere does");
            panel.style.display = "none";
            press(other);
            assert.deepEqual(seen, ["other"], "closed: the press removes the listener instead of dismissing");
            assert.isFalse(wv._wvDismissOffs.has(off), "and unregisters it");
            assert.isNull(dragArea.getAttribute("data-wv-nodrag"), "the no-drag mark is gone");
            assert.isNull(panel._wvDismissOff, "the panel's handle is cleared");
            press(other);
            assert.deepEqual(seen, ["other"], "no listener left");
            panel.style.display = "";
            // A deferred dismisser torn down before its tick never attaches.
            const off2 = lib.wvOutsideClick({ panel, defer: true, hostWin: win, onOutside: () => seen.push("late") });
            off2();
            await lib.wvSleep(30);
            press(other);
            assert.deepEqual(seen, ["other"], "a torn-down deferred dismisser never attaches");
            // isOpen and allow are the caller's; the opener anchor is skipped.
            let open = true;
            panel._wvOpenedFor = anchor;
            const off3 = lib.wvOutsideClick({ panel, isOpen: () => open, allow: (e) => e.target === other, onOutside: (e) => seen.push(e.target === dragArea ? "drag" : "?") });
            press(other); press(anchor);
            assert.deepEqual(seen, ["other"], "allowed target and the opener anchor pass");
            press(dragArea);
            assert.deepEqual(seen, ["other", "drag"]);
            open = false;
            press(dragArea);
            assert.deepEqual(seen, ["other", "drag"], "isOpen false: removed");
            off3();
            // A second dismisser on the same panel retires the first.
            const off4 = lib.wvOutsideClick({ panel, onOutside: () => seen.push("4") });
            const off5 = lib.wvOutsideClick({ panel, onOutside: () => seen.push("5") });
            press(other);
            assert.deepEqual(seen, ["other", "drag", "5"], "only the newest dismisser is live");
            off4(); off5();
            delete panel._wvOpenedFor;
            // The reachable-documents walk includes this document, once.
            const docs = lib.wvReachableDocs(doc);
            assert.isTrue(Array.isArray(docs) && docs.includes(doc), "the host document is reachable");
            assert.strictEqual(new Set(docs).size, docs.length, "no duplicates");
            // wvDismissOff runs and drops a stashed teardown; tolerates nothing stashed.
            const holder = {};
            let ran = 0; holder.k = () => { ran++; };
            lib.wvDismissOff(holder, "k"); lib.wvDismissOff(holder, "k");
            assert.strictEqual(ran, 1); assert.isFalse("k" in holder);
        } finally {
            host.remove();
        }
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    // A document mousedown closer registered by hand under one of the old
                    // names (the pin drag's `onDocMouseDown` kills the reader's text
                    // selection; it is not a closer and keeps its name).
                    if (/addEventListener\("mousedown", (onOutside|onDoc|dismissHandler|outsideHandler|onDown), true\)/.test(String(d.value))) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "outside-click closers come from wvOutsideClick");
    });

    it("no method resolves the plugin with a `|| self` / `|| this` fallback any more", () => {
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    const s = String(d.value);
                    if (/plugin\)?\s*\|\|\s*(self|this)\b/.test(s)) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "a captured instance must never stand in for a missing live plugin");
    });

    it("no method takes Zotero.getMainWindow() as a mere timer host (an arbitrary window that can close)", () => {
        // The "(w && w.setTimeout) ? w.setTimeout.bind(w) : setTimeout" idiom
        // on the FOCUSED main window hosted plugin-level timers (holds, tick
        // loops, flag resets) on whichever window happened to be focused --
        // dead when that window closed (src-ts.md timer hosts). Such sites
        // use wvTimeout now; a timer hosted on the window the work concerns
        // (`win.setTimeout`) is a deliberate "dies with the window" choice.
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    const s = String(d.value);
                    if (/getMainWindow\(\);[^\n]*\n[^\n]*(?:\n[^\n]*)?setTimeout\.bind\(/.test(s)) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "plugin-level timers run on the sandbox clock (wvTimeout)");
    });

    it("Zotero_Tabs and itemsView wraps are layered under the instance tag; legacy keys are gone", () => {
        const Z = win.Zotero_Tabs, tag = wv._wvWireTag();
        const layers = (host, m) => lib.wvWrapLayers(host, m);
        assert.deepEqual(layers(Z, "getState").map(l => l.layer), ["normalize"]);
        assert.includeMembers(layers(Z, "close").map(l => l.layer), ["trace", "lastView"]);
        assert.deepEqual(layers(Z, "restoreState").map(l => l.layer), ["trace"]);
        for (const m of ["getState", "close", "restoreState", "markAsLoaded", "select"]) {
            for (const l of layers(Z, m)) assert.strictEqual(l.tag, tag, m + "/" + l.layer + " carries this instance's tag");
        }
        for (const k of ["_wvGetStatePatchVer", "_wvGetStateOrig", "_wvGetStateFull", "_wvLastViewWired", "_wvOrigTabsClose",
            "_wvRestoreTraceWired", "_wvOrigClose", "_wvOrigRestoreState", "_wvOrigMarkAsLoaded", "_wvOrigSelect"]) {
            assert.isUndefined(Z[k], k + " (legacy key) must be gone");
        }
        // The normalize layer still does its job: a transient type reads as its base type.
        const saved = Z._tabs;
        try {
            Z._tabs = [{ id: "zotero-pane", type: "library", title: "", data: {} }, { id: "wv-x", type: "reader-loading", title: "t", data: { itemID: 1 } }];
            const st = Z.getState();
            assert.strictEqual(st[1].type, "reader", "-loading serialized as the base type");
            assert.notStrictEqual(st[1].data, Z._tabs[1].data, "data is cloned, never aliased");
        }
        finally { Z._tabs = saved; }
        const iv = win.ZoteroPane.itemsView;
        assert.deepEqual(layers(iv, "selectItems").map(l => l.layer), ["filterParity"]);
        assert.isUndefined(iv._wvSelectItemsWrapVer);
        const rp = iv.rowProvider || iv;
        assert.isUndefined(rp._wvUserOpenTrackingPatched, "legacy tracker stamp");
        const trk = lib.wvWrapLayers(rp, "toggleOpenState").filter(l => l.layer === "userOpenTracking");
        assert.lengthOf(trk, 1, "the manual-expand tracker is a layer");
        assert.strictEqual(trk[0].tag, tag);
    });

    it("a reload leaves nothing of the previous instance on Zotero_Tabs (simulated foreign layer)", () => {
        const Z = win.Zotero_Tabs, tag = wv._wvWireTag();
        const before = Z.getState;
        // Plant a dead instance's layer, then let the live instance re-wire.
        lib.wvWrap(Z, "getState", "normalize", "wv@dead#0", () => function () { throw new Error("dead layer ran"); });
        assert.throws(() => Z.getState(), /dead layer ran/);
        wv._wvPatchTabsGetState(win);
        assert.doesNotThrow(() => Z.getState());
        assert.deepEqual(lib.wvWrapLayers(Z, "getState").map(l => l.tag), [tag]);
        assert.notStrictEqual(Z.getState, before, "re-wrapped (a new wrapper closure)");
    });
});
