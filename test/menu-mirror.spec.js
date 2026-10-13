/* global describe, it, before, assert, Zotero */

// The reader-window menu mirrors (_wvMirrorMenuPopup: the hamburger and the
// Tools / Help menus a reader window lacks) rebuild a main-window popup as a
// copy. Two Firefox 153 (Zotero 11) changes broke the copy (audit against
// "Zotero 11 for Developers", 2026-10-13):
//   - menu icons are painted from `--menuitem-icon` (menu.css resets
//     list-style-image to none), and the copy only read a COMPUTED
//     list-style-image -- which is "" inside the closed source popup on any
//     version, so other plugins' Zotero.MenuManager icons never came along;
//   - boolean XUL attributes match on PRESENCE: Zotero 11 writes
//     `disabled=""` / `checked=""`, and the value copy skipped the empty
//     string -- the mirrored item came out enabled and unchecked.

describe("Weavero — reader-window menu mirror (Zotero 11 icons and boolean attributes)", () => {
    let wv, win, doc, host;
    const ICON = 'url("chrome://zotero/skin/16/universal/view.svg")';
    const presence = () => (/** @type {any} */ (Zotero).platformMajorVersion || 0) >= 153;
    /** Set a boolean attribute in the running platform's own "on" form. */
    const turnOn = (el, name) => { if (presence()) el.toggleAttribute(name, true); else el.setAttribute(name, "true"); };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvMirrorMenuPopup");
        win = Zotero.getMainWindow();
        doc = win.document;
        host = doc.querySelector("popupset") || doc.documentElement;
    });

    function mirror(build) {
        const src = doc.createXULElement("menupopup");
        const dst = doc.createXULElement("menupopup");
        host.append(src, dst);
        build(src);
        wv._wvMirrorMenuPopup(dst, src);
        return { src, dst, cleanup: () => { src.remove(); dst.remove(); } };
    }
    const byLabel = (popup, label) => [...popup.children].find(c => c.getAttribute("label") === label);

    // (Inline style is asserted, not computed style: a closed popup's subtree
    // is unstyled -- getComputedStyle returns "" for everything in it. That
    // is also why the mirror cannot READ a CSS icon off its closed source.)
    it("copies an icon carried inline in --menuitem-icon", () => {
        const m = mirror((src) => {
            const it = doc.createXULElement("menuitem");
            it.setAttribute("label", "wv-mirror-icon");
            it.classList.add("menuitem-iconic");
            it.style.setProperty("--menuitem-icon", ICON);
            src.append(it);
        });
        try {
            const out = byLabel(m.dst, "wv-mirror-icon");
            assert.isOk(out, "mirrored");
            assert.include(out.style.getPropertyValue("--menuitem-icon"), "view.svg");
            assert.isTrue(out.classList.contains("menuitem-iconic"));
        }
        finally { m.cleanup(); }
    });

    // Zotero.MenuManager entries (other plugins' Tools items): class
    // zotero-custom-menu-item + inline --custom-menu-icon-light / -dark,
    // resolved by Zotero's menu.scss (zotero.css, in the reader window too)
    // into list-style-image (10) and --menuitem-icon (11).
    it("copies a Zotero.MenuManager icon (class + inline light/dark icon properties)", () => {
        const m = mirror((src) => {
            const it = doc.createXULElement("menuitem");
            it.setAttribute("label", "wv-mirror-mm");
            it.classList.add("zotero-custom-menu-item");
            it.style.setProperty("--custom-menu-icon-light", ICON);
            it.style.setProperty("--custom-menu-icon-dark", ICON);
            src.append(it);
        });
        try {
            const out = byLabel(m.dst, "wv-mirror-mm");
            assert.isOk(out, "mirrored");
            assert.isTrue(out.classList.contains("zotero-custom-menu-item"), "the class Zotero's menu.scss keys on");
            assert.include(out.style.getPropertyValue("--custom-menu-icon-light"), "view.svg");
            assert.include(out.style.getPropertyValue("--custom-menu-icon-dark"), "view.svg");
            assert.isTrue(out.classList.contains("menuitem-iconic"));
        }
        finally { m.cleanup(); }
    });

    it("copies disabled / checked as the platform shows them (Zotero 11: the empty-string form)", () => {
        const lib = Zotero.Weavero.lib;
        const m = mirror((src) => {
            const a = doc.createXULElement("menuitem");
            a.setAttribute("label", "wv-mirror-disabled");
            turnOn(a, "disabled");
            const b = doc.createXULElement("menuitem");
            b.setAttribute("label", "wv-mirror-checked");
            b.setAttribute("type", "checkbox");
            turnOn(b, "checked");
            const c = doc.createXULElement("menuitem");
            c.setAttribute("label", "wv-mirror-plain");
            src.append(a, b, c);
        });
        try {
            assert.isTrue(lib.wvBoolAttrOn(byLabel(m.dst, "wv-mirror-disabled"), "disabled"), "still disabled");
            assert.isTrue(lib.wvBoolAttrOn(byLabel(m.dst, "wv-mirror-checked"), "checked"), "still checked");
            const plain = byLabel(m.dst, "wv-mirror-plain");
            assert.isFalse(lib.wvBoolAttrOn(plain, "disabled"), "an enabled item stays enabled");
            assert.isFalse(plain.hasAttribute("checked"));
        }
        finally { m.cleanup(); }
    });
});
