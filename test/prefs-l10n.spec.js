/* global describe, it, before, assert, Zotero */

// The Settings pane's strings live in weavero.ftl (localisation slice 1,
// 2026-11-11; zotero/zotero CLAUDE.md: "all new strings in Fluent .ftl", and
// work/align-reviews/2026-11-11.md section 2). prefs.html carries
// data-l10n-id only; Zotero translates the pane after mounting it
// (preferences.js _loadPane -> document.l10n.translateFragment), and the
// pane links weavero.ftl itself (its <linkset>).
//
// Gecko's overlay rules this checks (measured on 11.0-beta.4, 2026-11-11):
//   - a localizable attribute the message does not give is REMOVED (a
//     checkbox whose message had only .label lost its tooltiptext and
//     aria-label), so a message carries every attribute its element shows;
//   - an element child of a translated element survives only when it is
//     named (data-l10n-name) -- and then as a CLONE; an <input> inside one
//     was dropped altogether ("Up to  lines"). Inputs and anything the pane
//     script binds therefore sit outside translated elements.
//
// FAILS on 1.0.5-dev.7's pane (all English inline, no data-l10n-id).

describe("Weavero — Settings pane strings come from weavero.ftl", () => {
    const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    // Text that stays in the markup on purpose: not words a translator owns.
    // Every entry says why; anything else with a non-space character fails.
    const ALLOW = [
        { text: "|", why: "the separator between the About links: punctuation" },
    ];
    // Attributes Fluent localizes on these elements (global ones for XUL and
    // HTML, plus label `value`), i.e. English a translator must be able to
    // reach. `value` on a radio, menuitem or input is a pref value, not text.
    const TEXT_ATTRS = ["label", "tooltiptext", "aria-label", "title", "placeholder", "accesskey", "alt"];

    let html, l10n, ftl, js;
    const fmt = (id, args) => l10n.formatMessagesSync([{ id, args: args || null }])[0];

    before(async () => {
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        html = await (await fetch(rootURI + "prefs.html")).text();
        ftl = await (await fetch(rootURI + "locale/en-US/weavero.ftl")).text();
        js = await (await fetch(rootURI + "prefs.js")).text();
        const L = Zotero.getMainWindow().Localization;
        l10n = new L(["weavero.ftl"], true);
    });

    // Parsed the way Zotero mounts plugin panes, FRESH in each test and read
    // synchronously: in the runner a fragment parsed in `before` came back
    // TRANSLATED by the time the tests read it (the English back in every
    // element, 2026-11-11; not reproduced in the dev instance), so nothing
    // may await between the parse and the checks.
    let ms;
    const parse = () => {
        const frag = Zotero.getMainWindow().MozXULElement.parseXULToFragment(html);
        ms = frag.querySelector(".main-section");
        assert.isOk(ms, "prefs.html parses");
        const p = ms.querySelector("p[data-l10n-id]");
        if (p) assert.equal(p.childNodes.length, 0, "the markup is read untranslated");
        return ms;
    };

    const paneIds = () => [...ms.querySelectorAll("[data-l10n-id]")];
    const named = (s) => [...String(s || "").matchAll(/data-l10n-name="([^"]+)"/g)].map((m) => m[1]).sort();
    const argsOf = (el) => {
        const raw = el.getAttribute("data-l10n-args");
        return raw ? JSON.parse(raw) : null;
    };

    it("every control and heading of the pane is localized", () => {
        parse();
        const bare = [];
        for (const el of ms.querySelectorAll("checkbox, radio, menuitem")) {
            if (!el.hasAttribute("data-l10n-id")) bare.push(el.localName + " " + (el.getAttribute("preference") || el.getAttribute("value") || ""));
        }
        for (const el of ms.querySelectorAll("h2, h3, p, summary, button")) {
            if (!el.hasAttribute("data-l10n-id") && !el.querySelector("[data-l10n-id]")) bare.push(el.localName + " " + el.textContent.trim().slice(0, 40));
        }
        assert.isAbove(paneIds().length, 200, "the pane's strings carry l10n ids");
        assert.deepEqual(bare, []);
    });

    it("every data-l10n-id names a weavero.ftl message that gives its element its text", () => {
        parse();
        const bad = [];
        for (const el of paneIds()) {
            const id = el.getAttribute("data-l10n-id");
            let args;
            try { args = argsOf(el); }
            catch (e) { bad.push(id + ": data-l10n-args is not JSON"); continue; }
            if (!id.startsWith("weavero-")) { bad.push(id + ": not a weavero- id"); continue; }
            const m = fmt(id, args);
            if (!m) { bad.push(id + ": no such message"); continue; }
            const attrs = {};
            for (const a of m.attributes || []) attrs[a.name] = a.value;
            const control = el.namespaceURI === XUL && ["checkbox", "radio", "menuitem"].includes(el.localName);
            if (control) {
                if (!String(attrs.label || attrs["aria-label"] || "").trim()) bad.push(id + ": a " + el.localName + " needs .label or .aria-label");
                if (m.value) bad.push(id + ": a " + el.localName + " takes attributes, not a value");
            }
            else if (!String(m.value || "").trim()) {
                bad.push(id + ": no text for <" + el.localName + ">");
            }
            for (const [k, v] of Object.entries(attrs)) {
                if (!String(v).trim()) bad.push(id + ": empty ." + k);
            }
            // Named children: the markup's and the message's must agree, and
            // nothing unnamed may sit inside a translated element (an
            // unnamed child is wiped by the translation, an input dropped).
            if (m.value) {
                const src = [...el.children].map((c) => c.getAttribute("data-l10n-name"));
                if (src.some((n) => !n)) bad.push(id + ": an unnamed child inside a translated element");
                const a = src.filter(Boolean).sort().join(","), b = named(m.value).join(",");
                if (a !== b) bad.push(id + ": named children [" + a + "] vs message [" + b + "]");
            }
        }
        assert.deepEqual(bad, []);
    });

    it("no English is left in the markup outside the allow-list", () => {
        parse();
        const left = [];
        const allowed = (s) => ALLOW.some((a) => a.text === s.trim());
        const walk = (node) => {
            for (const c of node.childNodes) {
                if (c.nodeType === 3) {
                    if (c.nodeValue.trim() && !allowed(c.nodeValue)) left.push("text: " + c.nodeValue.trim().slice(0, 60));
                    continue;
                }
                if (c.nodeType !== 1 || c.localName === "style") continue;
                for (const a of TEXT_ATTRS) {
                    const v = c.getAttribute(a);
                    if (v && v.trim() && !allowed(v)) left.push(c.localName + " " + a + ": " + v.slice(0, 60));
                }
                const isLabel = c.namespaceURI === XUL && (c.localName === "label" || c.localName === "description");
                const v = isLabel && c.getAttribute("value");
                if (v && v.trim() && !allowed(v)) left.push(c.localName + " value: " + v.slice(0, 60));
                walk(c);
            }
        };
        walk(ms);
        assert.deepEqual(left, []);
    });

    it("every Settings message is used by the pane or its script, and the script's exist", () => {
        parse();
        const inFtl = [...ftl.matchAll(/^(weavero-pref-[a-z0-9-]+)\s*=/gm)].map((m) => m[1]);
        const inHtml = new Set(paneIds().map((el) => el.getAttribute("data-l10n-id")));
        const inJs = new Set([...js.matchAll(/["'](weavero-pref-[a-z0-9-]+)["']/g)].map((m) => m[1]));
        assert.isAbove(inFtl.length, 200, "weavero.ftl holds the pane's messages");
        assert.deepEqual(inFtl.filter((id) => !inHtml.has(id) && !inJs.has(id)), [], "messages nothing uses");
        const missing = [...inJs].filter((id) => !fmt(id, { count: 2, px: 13, mode: "fixed" }));
        assert.deepEqual(missing, [], "ids prefs.js sets that weavero.ftl lacks");
    });

    // The "Up to N lines / levels" units follow the number in their box. Zotero
    // copies this en-US file into every UI locale's bundle and Fluent applies
    // THAT locale's plural rules (French: 0 is "one"), so zero has its own
    // exact variant -- the runner's French locale is the case that tells.
    it("the count units read plural at zero and singular at one", () => {
        parse();
        const units = paneIds().filter((el) => argsOf(el) && "count" in argsOf(el));
        assert.isAtLeast(units.length, 2, "the lines and levels units");
        for (const el of units) {
            const id = el.getAttribute("data-l10n-id");
            const v = (n) => fmt(id, { count: n }).value;
            assert.equal(v(0), v(5), id + ": 0 reads as many");
            assert.notEqual(v(1), v(5), id + ": 1 reads as one");
        }
    });

    // The pane's parser (parseXULToFragment, as Zotero mounts it) deletes
    // every whitespace-only text node and Fluent trims a message, so a plain
    // space beside a number box rendered as nothing: "Up to[2]lines" in the
    // first l10n build (live check, 2026-11-11). The words after each box
    // keep a non-breaking space.
    it("a number box keeps its space before the words after it", () => {
        parse();
        const boxes = [...ms.querySelectorAll("input[type=number]")];
        assert.isAtLeast(boxes.length, 2, "the lines and levels boxes");
        for (const box of boxes) {
            const next = box.nextSibling;
            assert.isOk(next && next.nodeType === 3 && next.nodeValue.includes(" "), box.id + ": a non-breaking space after the box");
        }
    });
});
