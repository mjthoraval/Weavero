/* global describe, it, before, assert, Zotero */

// No interface English written in the code (l10n branch, 2026-11-19): every
// word Weavero shows comes from weavero.ftl through lib/l10n.ts (wvStr for
// text it writes itself, wvL10n for menu entries), so the four translations
// reach it. This scans the SHIPPED bundles -- index.js (the plugin) and
// prefs.js (the Settings pane's script) -- as compat.spec.js does: what ships
// is what counts. esbuild keeps comments in the bundle, so they are stripped
// first (strings, template literals and regex literals kept as they are).
//
// The places where English used to be written (the align review's Z-L10N
// patterns, 2026-11-11, widened): a label / tooltiptext / title /
// placeholder / aria-label / alt / acceltext attribute; a textContent /
// innerText / title / placeholder / label / ariaLabel / tooltipText / alt
// property; a Services.prompt call; wvHtmlEl's text argument; and the
// label: / title: / tip: / tooltip: / placeholder: / desc: / hint: /
// heading: / caption: keys of the tables menus, tiles and popups are built
// from. Debug output (Zotero.debug, the ring buffers), CSS, selectors, ids,
// names and symbols are not words a translator owns. What legitimately
// remains is written in ALLOW, each with its reason. The twin for a
// developer, on the sources: D:/tmp/wv-scripts/l10n_guard.py (private).
//
// Also: every weavero- id the code hands to wvStr / wvL10n / wvAttr is in
// en-US weavero.ftl, and every ZOTERO id it hands to wvStr resolves on the
// running Zotero (an id Zotero 9 or 10 lacks would show as the raw id).
//
// FAILS on 1.2.0 (about 530 English literals in those places).

describe("Weavero — no interface English written in the code", function () {
    this.timeout(60000);

    const ALLOW = [
        // Names, English on purpose.
        { text: "Weavero", why: "the product's name (prompt titles)" },
        { text: "Zotero", why: "a product name" },
        { text: "Firefox", why: "a product name" },
        { text: "Better Notes", why: "a plugin's name" },
        { text: "Better BibTeX", why: "a plugin's name" },
        { text: "Zotero Reading List", why: "a plugin's name" },
        { text: "GitHub", why: "a product name" },
        { text: "BibTeX", why: "a format name" },
        { text: "BibLaTeX", why: "a format name" },
        { text: "Markdown", why: "a markup language's name" },
    ];

    let bundles, enIds;

    // ---- the scanner ------------------------------------------------------

    // Source without comments; strings, template literals and regex literals
    // kept as they are.
    const stripComments = (src) => {
        const out = [];
        let i = 0, from = 0, prev = "";
        const n = src.length;
        while (i < n) {
            const c = src[i], d = src[i + 1];
            if (c === "/" && d === "/") {
                out.push(src.slice(from, i));
                while (i < n && src[i] !== "\n") i++;
                from = i;
                continue;
            }
            if (c === "/" && d === "*") {
                out.push(src.slice(from, i));
                const j = src.indexOf("*/", i + 2);
                const end = j < 0 ? n : j + 2;
                out.push(src.slice(i, end).replace(/[^\n]/g, ""));
                i = end; from = i;
                continue;
            }
            if (c === "\"" || c === "'" || c === "`") {
                let j = i + 1;
                if (c === "`") {
                    let depth = 0;
                    while (j < n) {
                        const cj = src[j];
                        if (cj === "\\") { j += 2; continue; }
                        if (cj === "$" && src[j + 1] === "{") { depth++; j += 2; continue; }
                        if (depth && cj === "}") { depth--; j++; continue; }
                        if (!depth && cj === "`") break;
                        j++;
                    }
                }
                else {
                    while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
                }
                i = j + 1; prev = c;
                continue;
            }
            if (c === "/" && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prev)) {
                let j = i + 1, cls = false;
                while (j < n && (cls || src[j] !== "/") && src[j] !== "\n") {
                    if (src[j] === "\\") j++;
                    else if (src[j] === "[") cls = true;
                    else if (src[j] === "]") cls = false;
                    j++;
                }
                i = j + 1; prev = "/";
                continue;
            }
            if (!/\s/.test(c)) prev = c;
            i++;
        }
        out.push(src.slice(from));
        return out.join("");
    };
    // Past the string or template literal starting at s[i].
    const skipString = (s, i) => {
        const c = s[i];
        let j = i + 1;
        if (c === "`") {
            let depth = 0;
            while (j < s.length) {
                if (s[j] === "\\") { j += 2; continue; }
                if (s[j] === "$" && s[j + 1] === "{") { depth++; j += 2; continue; }
                if (depth && s[j] === "}") { depth--; j++; continue; }
                if (!depth && s[j] === "`") break;
                j++;
            }
            return j + 1;
        }
        while (j < s.length && s[j] !== c && s[j] !== "\n") j += s[j] === "\\" ? 2 : 1;
        return j + 1;
    };
    // The balanced (...) starting at s[open].
    const balanced = (s, open) => {
        const pairs = { "(": ")", "{": "}", "[": "]" };
        const stack = [];
        for (let i = open; i < s.length && i < open + 20000;) {
            const c = s[i];
            if (c === "\"" || c === "'" || c === "`") { i = skipString(s, i); continue; }
            if (pairs[c]) stack.push(pairs[c]);
            else if (c === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return s.slice(open, i + 1); }
            i++;
        }
        return s.slice(open, open + 2000);
    };
    // A call's arguments, split at the top-level commas.
    const args = (call) => {
        const inner = call.slice(1, -1), out = [];
        let depth = 0, from = 0;
        for (let i = 0; i < inner.length;) {
            const c = inner[i];
            if (c === "\"" || c === "'" || c === "`") { i = skipString(inner, i); continue; }
            if ("([{".includes(c)) depth++;
            else if (")]}".includes(c)) depth--;
            else if (c === "," && depth === 0) { out.push(inner.slice(from, i)); from = i + 1; }
            i++;
        }
        out.push(inner.slice(from));
        return out;
    };
    // An expression from s[i]: up to a top-level ; or , or a closing bracket,
    // or a line end the next line does not continue (+ ? : at either side).
    const rhs = (s, i) => {
        let depth = 0;
        const stop = Math.min(s.length, i + 3000);
        for (let j = i; j < stop;) {
            const c = s[j];
            if (c === "\"" || c === "'" || c === "`") { j = skipString(s, j); continue; }
            if ("([{".includes(c)) depth++;
            else if (")]}".includes(c)) { if (!depth) return s.slice(i, j); depth--; }
            else if ((c === ";" || c === ",") && !depth) return s.slice(i, j);
            else if (c === "\n" && !depth) {
                const before = s.slice(i, j).trimEnd(), after = s.slice(j + 1, j + 200).trimStart();
                if (!/[+?:(]$|\|\||&&$/.test(before) && !/^[+?:]/.test(after)) return s.slice(i, j);
            }
            j++;
        }
        return s.slice(i, stop);
    };
    const unescape = (s) => s
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\(.)/g, "$1");
    const literals = (expr) => {
        const out = [];
        const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
        let m;
        while ((m = re.exec(expr))) out.push(unescape((m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, " ")));
        return out;
    };
    const codeToken = (t) => /^[a-z_$][\w$.:\/#=-]*$/.test(t) || /^[A-Z][A-Z0-9_]+$/.test(t);
    const allowed = (t) => ALLOW.some(a => a.text === t);
    // Words a translator owns, as opposed to code, CSS, markup or a name.
    const english = (s) => {
        const t = s.trim();
        if (!/[A-Za-z]{2,}/.test(t) || t.startsWith("[Weavero]") || allowed(t)) return false;
        if (/^(chrome|resource|zotero|https?|file|data|moz-[a-z-]+|about):/.test(t)) return false;
        // CSS: a rule's braces, a declaration (also one a line break cut), a
        // url()/var() value, a piece ending a declaration.
        if (/[{}]/.test(t) || /(^|[\s;])-?[a-z][a-z-]*\s*:\s*[^;]*;/.test(t) || /\burl\(|\bvar\(--/.test(t)) return false;
        if (/^-?[a-z][a-z-]*\s*:\s/.test(t) && /[();%#]|\d(px|em|rem)\b/.test(t)) return false;
        if (/;\s*$/.test(t) || /\b\d+(\.\d+)?(px|em|rem)\b.*[,;)]\s*$/.test(t)) return false;
        // A selector: starts with # . : @ [ and holds no sentence, or names a
        // tag.class / #id with no capitalized word.
        if (/^[#.:@[]/.test(t) && !/\b[A-Za-z][a-z]+ [a-z]+ [a-z]+/.test(t)) return false;
        if (/(^|[\s>+~,])[a-z]*[.#][a-z][\w-]*/.test(t) && !/\b[A-Z][a-z]+\b/.test(t)) return false;
        if (/<\/?[a-zA-Z][\w:-]*[\s>\/]/.test(t)) return false;
        const toks = t.split(/\s+/);
        if (toks.every(codeToken) && (toks.length === 1 || toks.every(x => /[-_]/.test(x)))) return false;
        return true;
    };
    /** @type {Array<[string, RegExp, string]>} */
    const CONTEXTS = [
        ["setAttribute", /\bsetAttribute\(\s*["'](?:label|tooltiptext|title|placeholder|aria-label|alt|acceltext)["']\s*,/g, "attr"],
        ["property", /\.(?:textContent|innerText|title|placeholder|label|ariaLabel|tooltipText|alt)\s*\+?=(?!=)/g, "rhs"],
        ["prompt", /\bServices\.prompt\.\w+\(|\.(?:alert|confirm|confirmEx|prompt)\(/g, "call"],
        ["wvHtmlEl", /\bwvHtmlEl\(/g, "arg4"],
        ["key", /(?<![\w$.])(?:label|title|tip|tooltip|tooltiptext|placeholder|desc|hint|heading|caption)\s*:(?!:)/g, "rhs"],
    ];
    const DEBUG = /Zotero\.debug|console\.|throw new|Ring\(|_wvDbg|\bdbg\(|_wvTrace|wvTrace/;
    // Where the string and template literals of comment-free source are:
    // a context found INSIDE one (a `title:` in CSS or HTML text) is no code.
    const stringSpans = (s) => {
        const starts = [], ends = [];
        let prev = "";
        for (let i = 0; i < s.length;) {
            const c = s[i];
            if (c === "\"" || c === "'" || c === "`") {
                const j = skipString(s, i);
                starts.push(i); ends.push(j);
                i = j; prev = c;
                continue;
            }
            if (c === "/" && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prev)) {
                let j = i + 1, cls = false;
                while (j < s.length && (cls || s[j] !== "/") && s[j] !== "\n") {
                    if (s[j] === "\\") j++;
                    else if (s[j] === "[") cls = true;
                    else if (s[j] === "]") cls = false;
                    j++;
                }
                starts.push(i); ends.push(j + 1);
                i = j + 1; prev = "/";
                continue;
            }
            if (!/\s/.test(c)) prev = c;
            i++;
        }
        return (pos) => {
            let lo = 0, hi = starts.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (starts[mid] > pos) hi = mid - 1;
                else if (ends[mid] <= pos) lo = mid + 1;
                else return true;
            }
            return false;
        };
    };
    const scan = (name, src) => {
        const s = stripComments(src);
        const inString = stringSpans(s);
        const hits = [];
        for (const [kind, re, how] of CONTEXTS) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(s))) {
                if (inString(m.index)) continue;
                const ls = s.lastIndexOf("\n", m.index) + 1, le = s.indexOf("\n", m.index);
                if (DEBUG.test(s.slice(ls, le < 0 ? s.length : le))) continue;
                let expr = "";
                if (how === "rhs") expr = rhs(s, m.index + m[0].length);
                else {
                    const open = m.index + m[0].length - 1;
                    const a = args(balanced(s, s[open] === "(" ? open : s.lastIndexOf("(", open)));
                    expr = how === "attr" ? a.slice(1).join(",") : how === "arg4" ? (a[3] || "") : a.join(",");
                }
                for (const l of literals(expr)) {
                    if (english(l)) hits.push(name + " " + kind + ": " + JSON.stringify(l.trim().slice(0, 80)));
                }
            }
        }
        return hits;
    };

    before(async function () {
        const rootURI = await wvT.rootURI();
        bundles = {};
        for (const f of ["index.js", "prefs.js"]) bundles[f] = await (await fetch(rootURI + f)).text();
        assert.isAbove(bundles["index.js"].length, 100000, "the plugin bundle was read");
        assert.isAbove(bundles["prefs.js"].length, 1000, "the Settings bundle was read");
        const ftl = await (await fetch(rootURI + "locale/en-US/weavero.ftl")).text();
        enIds = new Set([...ftl.matchAll(/^(weavero-[a-z0-9-]+)\s*=/gm)].map(m => m[1]));
    });

    it("no English in the places interface text is written, outside the allow-list", () => {
        const hits = [];
        for (const [f, src] of Object.entries(bundles)) hits.push(...scan(f, src));
        assert.deepEqual([...new Set(hits)], []);
    });

    // The ids the code names: wvStr(id...), wvAttr(id...), wvL10n(el, id...),
    // a wvMenuItem / MenuManager spec's l10n id. Ids put together from pieces
    // ("weavero-menu-" + x) are not checked here.
    const namedIds = (src) => {
        const s = stripComments(src);
        const own = new Set(), zotero = [];
        const take = (expr, set) => {
            for (const m of expr.matchAll(/["'`](weavero-[a-z0-9-]*[a-z0-9])["'`]/g)) set.add(m[1]);
        };
        for (const m of s.matchAll(/\b(wvStr|wvAttr|wvL10n)\(/g)) {
            const open = m.index + m[0].length - 1;
            const a = args(balanced(s, open));
            const idArg = m[1] === "wvL10n" ? a[1] : a[0];
            if (!idArg) continue;
            take(idArg, own);
            const lit = /^\s*["']([a-z][a-z0-9-]*)["']\s*$/.exec(idArg);
            if (m[1] === "wvStr" && lit && !lit[1].startsWith("weavero-")) {
                const attr = a[2] && /^\s*["']([\w-]+)["']\s*$/.exec(a[2]);
                const none = a[2] && /^\s*null\s*$/.test(a[2]);
                zotero.push({ id: lit[1], attr: none ? null : (attr ? attr[1] : "label") });
            }
        }
        for (const m of s.matchAll(/\b(?:l10nID|l10n\s*:\s*\{\s*id)\s*:\s*["'](weavero-[a-z0-9-]+)["']/g)) own.add(m[1]);
        return { own, zotero };
    };

    it("every weavero- id the code hands to wvStr / wvL10n / wvAttr is in en-US weavero.ftl", () => {
        const missing = [];
        let n = 0;
        for (const [f, src] of Object.entries(bundles)) {
            const { own } = namedIds(src);
            n += own.size;
            for (const id of own) if (!enIds.has(id)) missing.push(f + ": " + id);
        }
        assert.isAbove(n, 600, "the code's ids were found");
        assert.deepEqual(missing, []);
    });

    it("every Zotero id the code hands to wvStr resolves on this Zotero", () => {
        const L = /** @type {any} */ (Zotero).ftl;
        const bad = [];
        const seen = new Set();
        for (const src of Object.values(bundles)) {
            for (const { id, attr } of namedIds(src).zotero) {
                const key = id + "." + attr;
                if (seen.has(key)) continue;
                seen.add(key);
                const [m] = L.formatMessagesSync([{ id, args: { count: 2 } }]);
                if (!m) { bad.push(id + ": no such message in Zotero " + Zotero.version); continue; }
                const a = attr && (m.attributes || []).find(x => x.name === attr);
                // wvStr's own rule: the attribute when the message has it, else the value.
                const text = a ? a.value : (attr && attr !== "label" ? null : m.value);
                if (!String(text || "").trim()) bad.push(id + (attr ? "." + attr : "") + ": empty in Zotero " + Zotero.version);
            }
        }
        assert.deepEqual(bad, []);
    });

    it("the scanner sees what it is meant to see", () => {
        const hits = scan("sample", [
            "function sample(doc, el, n) {",
            "  // el.title = \"In A Comment\";",
            "  /* el.textContent = \"In a block comment\"; */",
            "  el.title = \"Clear search\";",
            "  el.textContent = n > 1 ? \"Show \" + n + \" more\" : wvStr(\"weavero-x\");",
            "  el.setAttribute(\"tooltiptext\", \"Toggle Outline\");",
            "  el.setAttribute(\"data-x\", \"Not A Label\");",
            "  wvHtmlEl(doc, \"div\", \"wv-a wv-b\", \"No items\", el);",
            "  wvHtmlEl(doc, \"div\", \"wv-a\", wvStr(\"weavero-y\"), el);",
            "  Services.prompt.alert(null, \"Weavero\", \"This window has no tabs.\");",
            "  const t = [{ value: \"#ffd400\", label: \"Yellow\" }, { value: \"x\", label: \"PDF\" }];",
            "  style.textContent = `.wv-x { color: red; }\\n#a .b { display: none; }`;",
            "  Zotero.debug(\"[Weavero] el.title = \" + el.title);",
            "  el.title = \"Weavero\";",
            "  const html = '<a title: \"' + href + '\">' + \"menu.wv-x > .menu-icon,\";",
            "  sheet.textContent = \"#x .row .cell-indent {\"",
            "      + \"background-image: repeating-linear-gradient(to right, transparent 0 7px,\"",
            "      + \"7px 8px, transparent 8px 16px);\";",
            "  const re = /\"/g; el.alt = \"Linked File\";",
            "}",
        ].join("\n"));
        assert.deepEqual(hits, [
            'sample setAttribute: "Toggle Outline"',
            'sample property: "Clear search"',
            'sample property: "Show"',
            'sample property: "Linked File"',
            'sample prompt: "This window has no tabs."',
            'sample wvHtmlEl: "No items"',
            'sample key: "Yellow"',
        ]);
        const ids = namedIds([
            "wvStr(\"weavero-a\"); wvStr(c ? \"weavero-b\" : \"weavero-c\", { n });",
            "wvL10n(mi, \"weavero-d\", null); wvAttr(\"weavero-e\", \"acceltext\");",
            "wvStr(\"section-related\", { count: 2 }); wvStr(\"zotero-tabs-menu-filter\", undefined, \"placeholder\");",
            "wvMenuItem(doc, { l10n: { id: \"weavero-f\" } }); wvStr(\"weavero-menu-\" + k);",
        ].join("\n"));
        assert.deepEqual([...ids.own].sort(), ["weavero-a", "weavero-b", "weavero-c", "weavero-d", "weavero-e", "weavero-f"]);
        assert.deepEqual(ids.zotero, [{ id: "section-related", attr: "label" }, { id: "zotero-tabs-menu-filter", attr: "placeholder" }]);
    });
});
