/* global describe, it, before, assert, Zotero */

// Weavero's translations (l10n branch, 2026-11-19; it-IT, 2026-11-23):
// src/locale/<code>/weavero.ftl for fr-FR, de, es-ES, zh-CN and it-IT --
// Zotero's own locale codes --
// beside the en-US source. Zotero registers every locale directory of a
// plugin at startup (xpcom/plugins.js registerLocales: for each Zotero locale
// the plugin's closest file), so a Localization built for one locale reads
// that locale's file.
//
// What a translation must keep, and why:
//   - EXACTLY en-US's message ids, and per message the same parts: a value
//     when en-US has one, the same attributes. A message missing from a
//     locale falls back to English at best (lib/l10n.ts wvStr's en-US
//     Localization); a missing ATTRIBUTE is worse: Fluent REMOVES a
//     localizable attribute the message lacks (align review 2026-11-11).
//   - no variable en-US does not pass (it would print "{$x}"), and every
//     variable en-US PRINTS (a count, a name); a variable en-US uses only to
//     select a variant may go where the language has no such difference
//     (Chinese plurals).
//   - no message left in English, apart from the written allow-list below
//     (names and codes, and words that are the same in that language).
//   - every message formats through a Localization for that locale, with
//     the variables en-US takes, to text that is neither empty nor its id.
// The run's own UI locale is en-US (zotero-plugin.config.ts pins it): this
// spec reaches the other languages through Localizations of their own.
//
// FAILS on 1.2.0 (no translation shipped).

describe("Weavero — translations: every locale file matches en-US", function () {
    this.timeout(120000);
    const LOCALES = ["fr-FR", "de", "es-ES", "zh-CN", "it-IT"];
    const HEADER = "Machine-assisted translation (Claude)";

    // What a translation may leave as en-US writes it. SAME: codes and names,
    // by message (or `id.attr` part), in every locale. WORDS: per locale, the
    // texts that are the same words in that language (compared with every
    // placeable as written), each with its reason -- a Zotero id of that
    // locale where Zotero shows the same word. SAME_IN: a message of one
    // locale whose every word is such a word (its variants included).
    const SCHEME = "a URL scheme, typed as is";
    const SAME = {
        ...Object.fromEntries(["magnet", "mailto", "skype", "sms", "spotify", "tel", "discord", "evernote", "figma",
            "file", "ftp", "msteams", "notion", "obsidian", "slack", "vscode", "zoom"]
            .map(s => ["weavero-pref-links-scheme-" + s + ".label", SCHEME])),
        "weavero-pref-links-scheme-msteams.tooltiptext": "a product name (Microsoft Teams)",
        "weavero-filter-outline-zotero": "a product name (Zotero's own outline, outline2.4)",
        "weavero-menu-copy-as-bbt-bibtex.label": "Better BibTeX's format name",
        "weavero-menu-copy-as-bbt-biblatex.label": "Better BibTeX's format name",
        "weavero-pref-outline-size-px.label": "a size in pixels: a number and the unit px",
        "weavero-pref-links-show-markdown.label": "the name of the markup language",
        "weavero-key-alt": "the key's name on these languages' keyboards (Zotero <locale> general-key-alt)",
        "weavero-key-win": "the Windows key's name",
        "weavero-note-link-edit-url": "URL, the same abbreviation (Zotero <locale> itemFields.url)",
        "weavero-refs-card-et-al": "the Latin abbreviation, written so in these languages' author lists",
        "weavero-sdt-build-size": "a size: numbers and the unit, MB or GB as German, Spanish and Chinese write them (French: Mo, Go)",
        "weavero-sdt-build-size-one": "a size: a number and the unit, MB or GB as German, Spanish and Chinese write them (French: Mo, Go)",
        "weavero-people-work-cited-tip": "a source's name (OpenAlex) and a date",
        "weavero-people-s2-tip": "a source's name (Semantic Scholar), a date and an address",
    };
    const WORDS = {
        "fr-FR": {
            "Ctrl": "French Firefox and Zotero fr-FR write Ctrl",
            "Notes": "Zotero fr-FR pane-notes", "Note": "Zotero fr-FR itemTypes.note",
            "Annotation": "Zotero fr-FR itemTypes.annotation", "Annotations": "Zotero fr-FR reader-annotations",
            "Image": "Zotero fr-FR file-type-image", "Images": "the plural of Image",
            "Page": "Zotero fr-FR reader-page", "Page { $page }": "Zotero fr-FR reader-page",
            "Collections": "Zotero fr-FR pane.collections.title (the collections funnel's chip and Settings box)",
            "p. { $page }": "the French page abbreviation",
            "Publication": "Zotero fr-FR itemFields.publicationTitle", "Collection": "Zotero fr-FR pane.collections.title",
            "Citation": "Zotero fr-FR note-editor-citation", "Magenta": "Zotero fr-FR general-magenta",
            "Orange": "Zotero fr-FR general-orange", "Source": "the same word in French",
            "Parent": "the same word in French (élément parent)", "Verdict": "the same word in French",
            "Position": "the same word in French", "OK": "the button word in French",
            "Active": "the same word in French (fenêtre active)",
            "Session": "the same word in French", "Sessions": "the same word in French",
            "Session { $date }": "the same word in French", "S": "the initial of Session",
            "auto": "the same abbreviation in French",
            "Publications": "the same word in French (Zotero fr-FR: Mes publications)",
        },
        "de": {
            "Extras": "Zotero de menubar.ftl: the Tools menu is Extras",
            "URLs": "Zotero de itemFields.url (URL)", "Reader:": "Zotero de preferences-reader-title",
            "Editor": "Zotero de zotero.dtd (Editor)", "Text": "Zotero de reader-text-annotation-short",
            "Name": "Zotero de new-collection-name", "Name:": "Zotero de new-collection-name",
            "Tag": "Zotero de general-tag", "Tags": "Zotero de pane-tags", "+ Filter": "the same word in German",
            "Magenta": "Zotero de general-magenta", "Orange": "Zotero de general-orange",
            "Snapshot": "Zotero de preferences-reader-open-snapshots-using", "Video": "Zotero de file-type-video",
            "Flags": "the same word in German (a developer tool's column)", "Scan": "the same word in German",
            "Position": "the same word in German", "OK": "the button word in German",
            "Layout": "Zotero de standalone.dtd layout.label",
            "in: { $title }": "the same preposition in German", "in { $name }": "the same preposition in German",
            "S": "the initial of Sitzung",
            "Feeds": "Zotero de pane.collections.feedLibraries (Feeds)",
        },
        "es-ES": {
            "Ctrl": "Spanish Firefox and Zotero es-ES write Ctrl",
            "Extras": "the same word in Spanish (RAE: extra)", "p. { $page }": "the Spanish page abbreviation",
            "Magenta": "Zotero es-ES general-magenta", "S": "the initial of Sesión",
        },
        "zh-CN": {
            "Ctrl": "Chinese Firefox writes Ctrl", "Shift": "Chinese Firefox writes Shift",
        },
        "it-IT": {
            "Ctrl": "Italian Firefox and Zotero it-IT write Ctrl",
            "Tag": "Zotero it-IT general-tag", "Magenta": "Zotero it-IT general-magenta",
            "Layout": "Zotero it-IT standalone.dtd layout.label", "OK": "Zotero it-IT zotero.general.ok",
            "Debug": "the same word in Italian (Zotero it-IT: Registro dei messaggi di debug)",
            "— in { $title }": "the same preposition in Italian", "{ $label } — in { $title }": "the same preposition in Italian",
            "in: { $title }": "the same preposition in Italian", "in { $name }": "the same preposition in Italian",
        },
    };
    const SAME_IN = {
        "fr-FR": {
            "weavero-bl-chip": "→ annotation / → note: the same words in French; its references are translated",
            "weavero-rpanel-dialog-page": "Page: Zotero fr-FR reader-page",
        },
    };

    let win, en, files;

    // ---- a small structural reader of .ftl files --------------------------
    // Enough for what Weavero's files hold: messages (`id = ...`), indented
    // continuation lines and attributes (`    .name = ...`), comments, select
    // expressions. Each part keeps its pattern's text.
    const parseFtl = (src) => {
        const msgs = new Map();
        const junk = [];
        let cur = null, part = null;
        const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
        lines.forEach((line, i) => {
            if (/^#/.test(line)) { cur = null; part = null; return; }
            if (!line.trim()) { if (part) part.lines.push(""); return; }
            let m = /^(-?[a-zA-Z][\w-]*)\s*=\s?(.*)$/.exec(line);
            if (m) {
                if (msgs.has(m[1])) junk.push((i + 1) + ": duplicate id " + m[1]);
                cur = { id: m[1], value: null, attrs: {} };
                msgs.set(m[1], cur);
                part = { lines: [m[2]] };
                cur.value = part;
                return;
            }
            if (!/^\s/.test(line)) { junk.push((i + 1) + ": " + line.slice(0, 60)); cur = null; part = null; return; }
            if (!cur) { junk.push((i + 1) + ": continuation without a message"); return; }
            m = /^\s+\.([a-zA-Z][\w-]*)\s*=\s?(.*)$/.exec(line);
            if (m) {
                part = { lines: [m[2]] };
                cur.attrs[m[1]] = part;
                return;
            }
            part.lines.push(line.trim());
        });
        for (const msg of msgs.values()) {
            const fin = (p) => {
                if (!p) return null;
                const t = p.lines.join("\n").trim();
                return t ? t : null;
            };
            msg.value = fin(msg.value);
            for (const k of Object.keys(msg.attrs)) msg.attrs[k] = fin(msg.attrs[k]);
        }
        return { msgs, junk };
    };
    // Per part: the variables it prints, the ones it selects on, the
    // messages it references, and its text with every placeable reduced.
    const partInfo = (text) => {
        const t = String(text || "");
        const selectors = new Set([...t.matchAll(/\{\s*\$([\w-]+)\s*->/g)].map(m => m[1]));
        const printed = new Set([...t.matchAll(/\{\s*(?:[A-Z]+\(\s*)?\$([\w-]+)\s*\)?\s*\}/g)].map(m => m[1]));
        const refs = new Set([...t.matchAll(/\{\s*(-?[a-z][\w-]*(?:\.[\w-]+)?)\s*\}/g)].map(m => m[1]));
        const flat = t.replace(/\{\s*"([^"]*)"\s*\}/g, "$1").replace(/\s+/g, " ").trim();
        return { selectors, printed, refs, flat };
    };
    // `{$x}` and `{ $x }` alike: one spelling of every simple placeable.
    const normPlaceables = (s) => String(s).replace(/\{\s*([^{}\s][^{}]*?)\s*\}/g, "{ $1 }");
    // The words of a part once its placeables, string literals, select heads,
    // variant keys and closing braces are gone.
    const wordsOutside = (s) => String(s)
        .replace(/\{\s*"[^"]*"\s*\}/g, " ")
        .replace(/\{\s*-?\$?[\w-]+(?:\.[\w-]+)?\s*\}/g, " ")
        .replace(/\{\s*\$[\w-]+\s*->/g, " ")
        .replace(/\*?\[[\w-]+\]/g, " ")
        .replace(/[{}]/g, " ");
    const partsOf = (msg) => {
        const out = {};
        if (msg.value != null) out[""] = msg.value;
        for (const [k, v] of Object.entries(msg.attrs)) if (v != null) out["." + k] = v;
        return out;
    };

    // Every variable a message's formatting needs: its own and those of the
    // messages it references (they share the caller's arguments).
    const varsOf = (map, id, seen = new Set()) => {
        const out = new Set();
        if (seen.has(id)) return out;
        seen.add(id);
        const msg = map.get(id);
        if (!msg) return out;
        for (const text of Object.values(partsOf(msg))) {
            const p = partInfo(text);
            for (const v of [...p.selectors, ...p.printed]) out.add(v);
            for (const r of p.refs) for (const v of varsOf(map, r.split(".")[0], seen)) out.add(v);
        }
        return out;
    };
    const NUMERIC = /^(count|n|num|total|px|days|hours|minutes|number|level|lines|index|size|pages|shown|hidden|selected|done|left|matched|kept|max|min)$|count$|Count$/;
    const argsFor = (map, id, count) => {
        const a = {};
        for (const v of varsOf(map, id)) a[v] = NUMERIC.test(v) ? count : "Xy";
        return a;
    };

    const L10n = (loc) => new win.Localization(["weavero.ftl"], true, undefined, [loc]);
    const fmtAll = (l10n, map, ids, count) => {
        const keys = ids.map(id => ({ id, args: argsFor(map, id, count) }));
        return l10n.formatMessagesSync(keys);
    };
    const textOf = (m, attr) => {
        if (!m) return null;
        if (attr) {
            const a = (m.attributes || []).find(x => x.name === attr);
            return a ? a.value : null;
        }
        return m.value;
    };

    before(async function () {
        win = Zotero.getMainWindow();
        const rootURI = await wvT.rootURI();
        const get = async (code) => {
            try {
                const r = await fetch(rootURI + "locale/" + code + "/weavero.ftl");
                return r.ok ? await r.text() : null;
            }
            catch (e) { return null; }
        };
        const enSrc = await get("en-US");
        assert.isOk(enSrc, "en-US weavero.ftl ships");
        en = parseFtl(enSrc);
        files = {};
        for (const loc of LOCALES) {
            const src = await get(loc);
            files[loc] = src == null ? null : { src, ...parseFtl(src) };
        }
    });

    it("the en-US source parses, and the reader sees all of it", () => {
        assert.deepEqual(en.junk, [], "en-US: lines the reader could not place");
        assert.isAbove(en.msgs.size, 1000, "en-US holds every interface string");
        // Gecko's own parser agrees: every message the reader found formats.
        const ids = [...en.msgs.keys()].filter(id => !id.startsWith("-"));
        const res = fmtAll(L10n("en-US"), en.msgs, ids, 2);
        const lost = ids.filter((id, i) => !res[i]);
        assert.deepEqual(lost, [], "en-US messages Gecko's Localization does not find");
    });

    for (const loc of LOCALES) {
        describe(loc, () => {
            const file = () => {
                const f = files[loc];
                assert.isOk(f, "locale/" + loc + "/weavero.ftl ships in the XPI");
                return f;
            };

            it("starts with the machine-assisted translation notice", () => {
                const head = file().src.split("\n").slice(0, 8).join("\n");
                assert.include(head, HEADER, "the header says it awaits a native speaker's review");
            });

            it("has exactly en-US's messages and, per message, the same parts", () => {
                const f = file();
                assert.deepEqual(f.junk, [], "lines the reader could not place");
                const missing = [...en.msgs.keys()].filter(id => !f.msgs.has(id));
                const extra = [...f.msgs.keys()].filter(id => !en.msgs.has(id));
                assert.deepEqual(missing, [], "messages missing");
                assert.deepEqual(extra, [], "messages en-US does not have");
                const bad = [];
                for (const [id, e] of en.msgs) {
                    const t = f.msgs.get(id);
                    if (!t) continue;
                    const a = Object.keys(partsOf(e)).sort().join(","), b = Object.keys(partsOf(t)).sort().join(",");
                    if (a !== b) bad.push(id + ": parts [" + a + "] vs [" + b + "]");
                }
                assert.deepEqual(bad, []);
            });

            it("uses en-US's variables: none of its own, and every one en-US prints", () => {
                const f = file();
                const bad = [];
                for (const [id, e] of en.msgs) {
                    const t = f.msgs.get(id);
                    if (!t) continue;
                    const pe = partsOf(e), pt = partsOf(t);
                    for (const k of Object.keys(pe)) {
                        if (pt[k] == null) continue;
                        const a = partInfo(pe[k]), b = partInfo(pt[k]);
                        const known = new Set([...a.selectors, ...a.printed]);
                        const used = new Set([...b.selectors, ...b.printed]);
                        for (const v of used) if (!known.has(v)) bad.push(id + k + ": $" + v + " is not en-US's");
                        for (const v of a.printed) if (!used.has(v)) bad.push(id + k + ": drops $" + v);
                        for (const r of b.refs) if (!a.refs.has(r)) bad.push(id + k + ": references " + r);
                    }
                }
                assert.deepEqual(bad, []);
            });

            it("leaves no message in English outside the allow-list", () => {
                const f = file();
                const words = WORDS[loc] || {}, sameIn = SAME_IN[loc] || {};
                const allowed = (key, id, text) => !!(SAME[key] || SAME[id] || words[text] || sameIn[id]);
                const same = [];
                for (const [id, e] of en.msgs) {
                    const t = f.msgs.get(id);
                    if (!t) continue;
                    const pe = partsOf(e), pt = partsOf(t);
                    for (const k of Object.keys(pe)) {
                        if (pt[k] == null) continue;
                        const a = normPlaceables(partInfo(pe[k]).flat), b = normPlaceables(partInfo(pt[k]).flat);
                        // Nothing to translate: no word outside the placeables
                        // and the select syntax (a message of references only).
                        if (!/[A-Za-z]{2,}/.test(wordsOutside(a))) continue;
                        if (a === b && !allowed(id + k, id, a)) same.push(id + k + ": " + JSON.stringify(a.slice(0, 60)));
                    }
                }
                assert.deepEqual(same, []);
            });

            it("formats every message through a Localization for " + loc, () => {
                const f = file();
                const l10n = L10n(loc);
                const ids = [...en.msgs.keys()].filter(id => !id.startsWith("-"));
                const bad = [];
                for (const count of [0, 1, 2, 5]) {
                    const res = fmtAll(l10n, f.msgs, ids, count);
                    ids.forEach((id, i) => {
                        const m = res[i];
                        if (!m) { bad.push(id + " (count " + count + "): not found"); return; }
                        const parts = [m.value, ...(m.attributes || []).map(a => a.value)].filter(x => x != null);
                        if (!parts.some(x => String(x).trim())) bad.push(id + ": empty");
                        for (const x of parts) {
                            if (/\{\s*\$|\{-?[a-z][\w-]*\}/.test(String(x))) bad.push(id + " (count " + count + "): unresolved " + JSON.stringify(String(x).slice(0, 60)));
                            if (String(x).trim() === id) bad.push(id + ": formats to its id");
                        }
                    });
                    if (bad.length > 40) break;
                }
                assert.deepEqual([...new Set(bad)].slice(0, 40), []);
            });

            it("reads in " + loc + ", not English: a sample", () => {
                const l10n = L10n(loc);
                const enL = L10n("en-US");
                /** @type {Array<[string, any, string|null]>} */
                const sample = [
                    ["weavero-backlinks-header", { count: 2 }, "label"],
                    ["weavero-menu-tab-close", { count: 3 }, "label"],
                    ["weavero-common-cancel", null, null],
                    ["weavero-pref-nav-tabs", null, null],
                ];
                for (const [id, args, attr] of sample) {
                    const [mt] = l10n.formatMessagesSync([{ id, args }]);
                    const [me] = enL.formatMessagesSync([{ id, args }]);
                    const t = textOf(mt, attr), e = textOf(me, attr);
                    assert.isOk(t && String(t).trim(), id + ": formats in " + loc);
                    assert.notStrictEqual(t, e, id + ": " + loc + " differs from English (" + e + ")");
                    if (args && args.count != null) assert.include(t, String(args.count), id + ": shows the count");
                }
            });
        });
    }

    // en-US also serves every language Weavero has no translation for, under
    // THAT language's plural rules: a variant on the category [one] there
    // takes 0 in French or Portuguese ("0 Backlink", 2026-10-23). So en-US
    // selects on the exact [1]; a [one] keeps an exact [0] beside it, and
    // that zero reads as the plural does.
    it("en-US: a [one] variant comes with an exact [0], which reads as the plural", () => {
        const enL = L10n("en-US");
        const bad = [];
        let n = 0;
        for (const [id, msg] of en.msgs) {
            for (const [k, text] of Object.entries(partsOf(msg))) {
                if (!/\[one\]/.test(text)) continue;
                n++;
                if (!/\[0\]/.test(text)) { bad.push(id + k + ": [one] without [0]"); continue; }
                const at = (c) => textOf(enL.formatMessagesSync([{ id, args: argsFor(en.msgs, id, c) }])[0], k ? k.slice(1) : null);
                const norm = (s) => String(s).replace(/\d+/g, "#");
                if (norm(at(0)) !== norm(at(5))) bad.push(id + k + ": 0 reads " + JSON.stringify(at(0)) + ", 5 reads " + JSON.stringify(at(5)));
            }
        }
        assert.isAtLeast(n, 2, "the headers and units with [one] were checked");
        assert.deepEqual(bad, []);
    });

    it("the structural reader sees what it is meant to see", () => {
        const r = parseFtl([
            "# a comment",
            "a-b = Hello { $name }",
            "    .title = { $count ->",
            "        [1] One",
            "       *[other] { $count } more {\"{\"}x{\"}\"}",
            "    }",
            "c-d =",
            "    .label = { a-b.title } and { $who ->",
            "        [x] X",
            "       *[y] Y",
            "    }",
            "",
            "e = Two",
            "    lines",
        ].join("\n"));
        assert.deepEqual(r.junk, []);
        assert.deepEqual([...r.msgs.keys()], ["a-b", "c-d", "e"]);
        assert.strictEqual(r.msgs.get("c-d").value, null);
        assert.deepEqual(Object.keys(r.msgs.get("a-b").attrs), ["title"]);
        const t = partInfo(r.msgs.get("a-b").attrs.title);
        assert.deepEqual([...t.selectors], ["count"]);
        assert.deepEqual([...t.printed], ["count"]);
        const c = partInfo(r.msgs.get("c-d").attrs.label);
        assert.deepEqual([...c.refs], ["a-b.title"]);
        assert.deepEqual([...c.printed], []);
        assert.deepEqual([...varsOf(r.msgs, "c-d")].sort(), ["count", "name", "who"]);
        assert.strictEqual(r.msgs.get("e").value, "Two\nlines");
        assert.strictEqual(normPlaceables("p. {$page}"), "p. { $page }");
        assert.notMatch(wordsOutside("{ $mixed -> [yes] { a-b.title } *[no] { a-b } }"), /[A-Za-z]/, "references only");
        assert.notMatch(wordsOutside("{ $field } { $op } { $value }"), /[A-Za-z]/, "variables only");
        assert.match(wordsOutside("{ $count -> [1] Close Tab *[other] Close { $count } Tabs }"), /Close Tab/, "variant words stay");
    });
});
