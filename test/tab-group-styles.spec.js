/* global describe, it, before, after, assert, Zotero */

// Tab-group panel CSS that once collided (survey 2026-10-06, smaller bugs):
// the collapsed-group hover preview's HEADER and its member titles shared
// `.wv-tg-preview-title`, so the member rule (nowrap, ellipsis) made the
// group's full name truncate -- it is meant to wrap (user request
// 2026-07-15) -- and the header rule made every member bold, padded and
// underlined. And `.wv-tg-title` was defined twice, the two merging.

describe("Weavero — tab-group panel styles", function () {
    let wv, win, doc, host;
    const NS = "http://www.w3.org/1999/xhtml";

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_ensureTabGroupStyles");
        win = Zotero.getMainWindow();
        doc = win.document;
        wv._ensureTabGroupStyles(doc);
        host = doc.createElementNS(NS, "div");
        host.style.cssText = "position: fixed; left: -9999px; top: 0; width: 200px; font: message-box;";
        doc.documentElement.appendChild(host);
    });

    after(() => { try { host.remove(); } catch (_) {} });

    it("the hover preview gives its header its own class, distinct from the member titles", () => {
        const src = wvT.src("_wvTabGroupShowHoverPreview");
        assert.include(src, '"wv-tg-preview-head"', "the header row's class");
        assert.include(src, '"wv-tg-preview-title"', "the member title's class");
    });

    it("a long group name wraps in the header; member titles stay plain one-liners", () => {
        const head = doc.createElementNS(NS, "div");
        head.className = "wv-tg-preview-head";
        const name = doc.createElementNS(NS, "span");
        name.textContent = "A very long tab group name that cannot fit on one line of the preview";
        head.appendChild(name);
        const row = doc.createElementNS(NS, "div");
        row.className = "wv-tg-preview-row";
        const t = doc.createElementNS(NS, "span");
        t.className = "wv-tg-preview-title";
        t.textContent = "member tab";
        row.appendChild(t);
        host.append(head, row);
        const ch = win.getComputedStyle(head), cm = win.getComputedStyle(t);
        assert.strictEqual(ch.whiteSpace, "normal", "the header wraps");
        assert.isAbove(head.getBoundingClientRect().height, 30, "the long name takes more than one line");
        assert.strictEqual(cm.whiteSpace, "nowrap", "a member title stays on one line");
        assert.strictEqual(cm.textOverflow, "ellipsis");
        assert.strictEqual(cm.fontWeight, "400", "a member title is not bold");
        assert.strictEqual(cm.borderBottomWidth, "0px", "a member title has no header rule line");
        assert.notStrictEqual(cm.display, "flex");
    });

    it("the card title has one rule, with the look the two duplicates merged to", () => {
        const sheet = doc.getElementById("wv-tab-group-styles").sheet;
        const rules = [...sheet.cssRules].filter(r => r.selectorText === ".wv-tg-title");
        assert.lengthOf(rules, 1, "one .wv-tg-title rule");
        const el = doc.createElementNS(NS, "div");
        el.className = "wv-tg-title";
        el.textContent = "Manage Window";
        host.appendChild(el);
        const c = win.getComputedStyle(el);
        assert.strictEqual(c.textAlign, "center");
        assert.strictEqual(c.fontWeight, "600");
        assert.strictEqual(c.fontSize, "11px");
        assert.strictEqual(c.opacity, "0.75");
    });
});
