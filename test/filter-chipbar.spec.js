/* global describe, it, before, after, assert, Zotero, Services, IOUtils */

// The filter chip bar (survey 2026-10-06 step 7, facets slice 3). For every
// state below the bar is rendered and recorded child by child -- a chip as
// field | op | the value segment's markup, the OR badges, the trailing
// buttons -- then each chip is driven: a click on its body (must target its
// group for the panel) and a click on its x (must clear exactly its field,
// drop a group left empty, and keep the first group).
//
// CHARACTERIZATION: CHIPBAR_EXPECTED was recorded in the test runner from the code
// BEFORE slice 3 built the chips from the table (0.21.9-facets.5). Set
// WV_FACETS_RECORD=<path> to dump a new recording instead of comparing. A
// deliberate change edits the affected lines here, in the same commit, with
// the reason.

describe("Weavero — filter chip bar, characterized", function () {
    this.timeout(60000);
    let wv;
    // Restored by VALUE, never cleared: a cleared pref cannot be re-created
    // until restart (NS_ERROR_UNEXPECTED), which would break a later spec.
    // The defaults are what an unset pref reads as.
    const PREFS = { "weavero.devOutlineEval": false, "weavero.enableAddedByColors": true };
    const savedPrefs = {};

    let rlOff = null;
    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_renderFilterBar", "_emptyFilterGroup", "_openFilterPanel", "_applyItemsListFilter"]) wvT.method(m);
        for (const p of Object.keys(PREFS)) savedPrefs[p] = Zotero.Prefs.get(p);
        rlOff = wvT.readingListOn();   // Read Status chips are characterized as available
    });

    after(function () {
        if (rlOff) rlOff();
        for (const p of Object.keys(PREFS)) {
            Zotero.Prefs.set(p, savedPrefs[p] === undefined ? PREFS[p] : savedPrefs[p]);
        }
    });

    /** Run `fn` with plugin methods replaced, restoring them after. */
    function withStubs(stubs, fn) {
        const saved = Object.keys(stubs).map((name) => {
            const own = Object.prototype.hasOwnProperty.call(wv, name);
            const orig = wv[name];
            wv[name] = stubs[name];
            return { name, own, orig };
        });
        try { return fn(); }
        finally {
            for (const s of saved) { if (s.own) wv[s.name] = s.orig; else delete wv[s.name]; }
        }
    }

    function states() {
        const g = (patch) => Object.assign(wv._emptyFilterGroup(), patch);
        const one = (patch) => ({ groups: [g(patch)], activeGroupIndex: 0 });
        const out = [["empty", one({})]];
        const LISTV = {
            annotationColor: ["#ffd400", "#ff6666"], annotationType: ["highlight", "underline"],
            annotationTag: ["t1", "t2"], annotationAuthor: ["Ann Smith", "Bob Jones"],
            itemType: ["book", "journalArticle"], attachmentFileType: ["attachmentPDF", "attachmentEPUB"],
            outlineClass: ["embedded", "flag:spacing"], outlineFlags: ["flag:ws-junk", "flag:spacing"],
            outlineVerdict: ["verdict:good", "verdict:scan"], addedBy: ["alice", "bob"],
            publication: ["Pub A", "Pub B"], readStatus: ["Read", ""],
        };
        for (const [k, v] of Object.entries(LISTV)) {
            out.push([k + " 1", one({ [k]: v.slice(0, 1) })]);
            out.push([k + " 2", one({ [k]: v.slice() })]);
            out.push([k + "Exclude 1", one({ [k + "Exclude"]: v.slice(0, 1) })]);
            out.push([k + "Exclude 2", one({ [k + "Exclude"]: v.slice() })]);
            out.push([k + " inc+exc", one({ [k]: v.slice(0, 1), [k + "Exclude"]: v.slice(1) })]);
        }
        const TRI = ["annotationHasComment", "annotationSource", "hasRelated", "hasLink", "hasTag", "hasBookmarks",
            "itemNote", "standaloneNote", "standaloneAttachment", "hasAbstract", "hasDOI", "hasPMID", "hasPMCID",
            "retracted", "hasURL", "hasAttachment", "hasAnnotations", "hasEmbeddedAnnotations", "hasOutline",
            "inOtherLibrary"];
        for (const k of TRI) {
            out.push([k + "=true", one({ [k]: true })]);
            out.push([k + "=false", one({ [k]: false })]);
        }
        // Everything at once: the chip ORDER.
        const all = {};
        for (const [k, v] of Object.entries(LISTV)) { all[k] = v.slice(0, 1); all[k + "Exclude"] = v.slice(1); }
        for (const k of TRI) all[k] = true;
        out.push(["all", one(all)]);
        // OR groups: badges between ACTIVE groups only; an empty middle group.
        out.push(["or groups", {
            groups: [g({ annotationColor: ["#ffd400"], hasDOI: true }), g({}), g({ itemType: ["book"] }), g({ hasTag: false })],
            activeGroupIndex: 0,
        }]);
        out.push(["or, first empty", {
            groups: [g({}), g({ standaloneNote: true }), g({ publicationExclude: ["Pub B"] })],
            activeGroupIndex: 2,
        }]);
        return out;
    }

    const clone = (st) => JSON.parse(JSON.stringify(st));

    /** A group's set fields, as name -> JSON value. */
    function setFields(grp) {
        const out = {};
        for (const k of Object.keys(grp).sort()) {
            const v = grp[k];
            if (Array.isArray(v) ? v.length > 0 : (v != null && typeof v !== "object")) out[k] = JSON.stringify(v);
        }
        return out;
    }

    /** What an x click changed: per group, the fields it cleared or
     *  changed; the whole remaining state when a group was dropped. */
    function describeChange(before, after) {
        const at = " @" + after.activeGroupIndex;
        if (after.groups.length !== before.groups.length) {
            return "groups " + after.groups.map((grp) => {
                const f = setFields(grp);
                return Object.keys(f).map(k => k + "=" + f[k]).join(",");
            }).join(" | ") + at;
        }
        return after.groups.map((grp, i) => {
            const a = setFields(before.groups[i]), b = setFields(grp);
            const d = [];
            for (const k of Object.keys(a)) if (!(k in b)) d.push("-" + k);
            for (const k of Object.keys(b)) if (!(k in a)) d.push("+" + k + "=" + b[k]); else if (a[k] !== b[k]) d.push("~" + k + "=" + b[k]);
            return d.join(",");
        }).join(" | ") + at;
    }

    function serializeBar(bar) {
        if (bar.style.display === "none") return "(hidden)";
        const parts = [];
        for (const el of bar.children) {
            if (el.classList.contains("wv-filter-chip")) {
                const seg = (c) => el.querySelector(".wv-chip-" + c);
                // The value's icons carry Zotero's LOCALIZED type name as a
                // tooltip ("Livre" here, "Book" in the release CI): left out,
                // the type itself is in data-item-type.
                parts.push("CHIP[" + seg("field").textContent + "|" + seg("op").textContent
                    + "|" + seg("value").innerHTML.replace(/ title="[^"]*"/g, "") + "]" + (el.title ? "" : "(no title)"));
            }
            else parts.push(el.className + ":" + el.textContent);
        }
        return parts.join(" ; ");
    }

    /** Record the states whose name passes `only` (all when omitted). */
    function record(dev, colors, only) {
        Zotero.Prefs.set("weavero.devOutlineEval", dev);
        Zotero.Prefs.set("weavero.enableAddedByColors", colors);
        const saved = wv._filterState;
        const bar = wv._filterBar;
        const res = {};
        let opened = [];
        // No side effects past this spec: no apply, no panel, and no warming
        // of the linked-library cache an In Multiple Libraries chip triggers
        // (a warm cache changes that dimension's row checks in later specs).
        const stubs = {
            _openFilterPanel: () => { opened.push(wv._filterState.activeGroupIndex); },
            _applyItemsListFilter: () => {},
            _wvEnsureLinkedLibCache: () => {},
        };
        return withStubs(stubs, () => { try {
            for (const [name, st] of states()) {
                if (only && !only(name)) continue;
                wv._filterState = clone(st);
                wv._renderFilterBar();
                const lines = [serializeBar(bar)];
                const nChips = bar.querySelectorAll(".wv-filter-chip").length;
                for (let i = 0; i < nChips; i++) {
                    // Body click: targets the chip's group, opens the panel.
                    wv._filterState = clone(st);
                    wv._renderFilterBar();
                    opened = [];
                    bar.querySelectorAll(".wv-filter-chip")[i].querySelector(".wv-chip-field").click();
                    const edit = "edit->" + opened.join(",");
                    // x click: clears its field; the bar re-renders.
                    wv._filterState = clone(st);
                    wv._renderFilterBar();
                    bar.querySelectorAll(".wv-filter-chip")[i].querySelector(".wv-chip-remove").click();
                    lines.push("#" + i + " " + edit + " x-> " + describeChange(st, wv._filterState)
                        + " :: " + bar.querySelectorAll(".wv-filter-chip").length + " chips");
                }
                res[(dev ? "dev " : "") + (colors ? "" : "nocolor ") + name] = lines.join("\n");
            }
        }
        finally {
            wv._filterState = saved;
            wv._renderFilterBar();
        }
        return res; });
    }

    it("renders and drives every chip as recorded", async () => {
        if (!wv._filterBar) wvT.absent("filter bar in the main window");
        // Default prefs for every state; the dev outline chips with the dev
        // pref on; Added By's plain-text value with its colours off.
        const got = Object.assign({}, record(false, true),
            record(true, true, n => n.startsWith("outline") || n === "all"),
            record(false, false, n => n.startsWith("addedBy") || n === "all"));
        let rec = null;
        try { rec = Services.env.get("WV_FACETS_RECORD"); } catch (e) {}
        if (rec) {
            await IOUtils.writeUTF8(rec, JSON.stringify(got, null, 1));
            return;
        }
        const diffs = [];
        for (const n of Object.keys(CHIPBAR_EXPECTED)) {
            if (got[n] !== CHIPBAR_EXPECTED[n]) diffs.push(n + "\n   got " + got[n] + "\n   exp " + CHIPBAR_EXPECTED[n]);
        }
        assert.sameMembers(Object.keys(got), Object.keys(CHIPBAR_EXPECTED), "the state list itself");
        assert.deepEqual(diffs, [], "chip bar changed");
    });
});

// Recorded from 0.21.9-facets.5 in the test runner (twice, identical), 2026-10-09.
const CHIPBAR_EXPECTED = {
 "empty": "(hidden)",
 "annotationColor 1": "CHIP[Annotation Color|is|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ffd400\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Yellow</span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationColor @0 :: 0 chips",
 "annotationColor 2": "CHIP[Annotation Color|is|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ffd400\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ff6666\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Yellow, Red</span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationColor @0 :: 0 chips",
 "annotationColorExclude 1": "CHIP[Annotation Color|is not|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ffd400\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Yellow</span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationColorExclude @0 :: 0 chips",
 "annotationColorExclude 2": "CHIP[Annotation Color|is not|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ffd400\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ff6666\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Yellow, Red</span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationColorExclude @0 :: 0 chips",
 "annotationColor inc+exc": "CHIP[Annotation Color|is|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ffd400\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Yellow</span>] ; CHIP[Annotation Color|is not|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ff6666\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Red</span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationColor @0 :: 1 chips\n#1 edit->0 x-> -annotationColorExclude @0 :: 1 chips",
 "annotationType 1": "CHIP[Annotation Type|is|Highlight] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationType @0 :: 0 chips",
 "annotationType 2": "CHIP[Annotation Type|is|Highlight, Underline] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationType @0 :: 0 chips",
 "annotationTypeExclude 1": "CHIP[Annotation Type|is not|Highlight] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationTypeExclude @0 :: 0 chips",
 "annotationTypeExclude 2": "CHIP[Annotation Type|is not|Highlight, Underline] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationTypeExclude @0 :: 0 chips",
 "annotationType inc+exc": "CHIP[Annotation Type|is|Highlight] ; CHIP[Annotation Type|is not|Underline] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationType @0 :: 1 chips\n#1 edit->0 x-> -annotationTypeExclude @0 :: 1 chips",
 "annotationTag 1": "CHIP[Tag|includes|t1] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationTag @0 :: 0 chips",
 "annotationTag 2": "CHIP[Tag|includes all|t1, t2] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationTag @0 :: 0 chips",
 "annotationTagExclude 1": "CHIP[Tag|excludes any|t1] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationTagExclude @0 :: 0 chips",
 "annotationTagExclude 2": "CHIP[Tag|excludes any|t1, t2] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationTagExclude @0 :: 0 chips",
 "annotationTag inc+exc": "CHIP[Tag|includes|t1] ; CHIP[Tag|excludes any|t2] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationTag @0 :: 1 chips\n#1 edit->0 x-> -annotationTagExclude @0 :: 1 chips",
 "annotationAuthor 1": "CHIP[Author|includes|Ann Smith] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationAuthor @0 :: 0 chips",
 "annotationAuthor 2": "CHIP[Author|includes all|Ann Smith, Bob Jones] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationAuthor @0 :: 0 chips",
 "annotationAuthorExclude 1": "CHIP[Author|excludes any|Ann Smith] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationAuthorExclude @0 :: 0 chips",
 "annotationAuthorExclude 2": "CHIP[Author|excludes any|Ann Smith, Bob Jones] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationAuthorExclude @0 :: 0 chips",
 "annotationAuthor inc+exc": "CHIP[Author|includes|Ann Smith] ; CHIP[Author|excludes any|Bob Jones] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationAuthor @0 :: 1 chips\n#1 edit->0 x-> -annotationAuthorExclude @0 :: 1 chips",
 "itemType 1": "CHIP[Item Type|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"book\"></span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -itemType @0 :: 0 chips",
 "itemType 2": "CHIP[Item Type|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"book\"></span><span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"journalArticle\"></span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -itemType @0 :: 0 chips",
 "itemTypeExclude 1": "CHIP[Item Type|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"book\"></span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -itemTypeExclude @0 :: 0 chips",
 "itemTypeExclude 2": "CHIP[Item Type|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"book\"></span><span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"journalArticle\"></span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -itemTypeExclude @0 :: 0 chips",
 "itemType inc+exc": "CHIP[Item Type|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"book\"></span>] ; CHIP[Item Type|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"journalArticle\"></span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -itemType @0 :: 1 chips\n#1 edit->0 x-> -itemTypeExclude @0 :: 1 chips",
 "attachmentFileType 1": "CHIP[Attachment File Type|is|PDF] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -attachmentFileType @0 :: 0 chips",
 "attachmentFileType 2": "CHIP[Attachment File Type|is|PDF, EPUB] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -attachmentFileType @0 :: 0 chips",
 "attachmentFileTypeExclude 1": "CHIP[Attachment File Type|is not|PDF] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -attachmentFileTypeExclude @0 :: 0 chips",
 "attachmentFileTypeExclude 2": "CHIP[Attachment File Type|is not|PDF, EPUB] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -attachmentFileTypeExclude @0 :: 0 chips",
 "attachmentFileType inc+exc": "CHIP[Attachment File Type|is|PDF] ; CHIP[Attachment File Type|is not|EPUB] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -attachmentFileType @0 :: 1 chips\n#1 edit->0 x-> -attachmentFileTypeExclude @0 :: 1 chips",
 "outlineClass 1": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineClass 2": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineClassExclude 1": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineClassExclude 2": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineClass inc+exc": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineFlags 1": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineFlags 2": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineFlagsExclude 1": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineFlagsExclude 2": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineFlags inc+exc": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineVerdict 1": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineVerdict 2": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineVerdictExclude 1": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineVerdictExclude 2": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "outlineVerdict inc+exc": "wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all",
 "addedBy 1": "CHIP[Added By|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(94, 106, 210); background-color: rgba(94, 106, 210, 0.18);\">alice</span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -addedBy @0 :: 0 chips",
 "addedBy 2": "CHIP[Added By|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(94, 106, 210); background-color: rgba(94, 106, 210, 0.18);\">alice</span><span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-sep\">, </span><span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(241, 152, 55); background-color: rgba(241, 152, 55, 0.18);\">bob</span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -addedBy @0 :: 0 chips",
 "addedByExclude 1": "CHIP[Added By|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(94, 106, 210); background-color: rgba(94, 106, 210, 0.18);\">alice</span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -addedByExclude @0 :: 0 chips",
 "addedByExclude 2": "CHIP[Added By|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(94, 106, 210); background-color: rgba(94, 106, 210, 0.18);\">alice</span><span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-sep\">, </span><span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(241, 152, 55); background-color: rgba(241, 152, 55, 0.18);\">bob</span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -addedByExclude @0 :: 0 chips",
 "addedBy inc+exc": "CHIP[Added By|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(94, 106, 210); background-color: rgba(94, 106, 210, 0.18);\">alice</span>] ; CHIP[Added By|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(241, 152, 55); background-color: rgba(241, 152, 55, 0.18);\">bob</span>] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -addedBy @0 :: 1 chips\n#1 edit->0 x-> -addedByExclude @0 :: 1 chips",
 "publication 1": "CHIP[Publication|includes any|Pub A] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -publication @0 :: 0 chips",
 "publication 2": "CHIP[Publication|includes any|Pub A, Pub B] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -publication @0 :: 0 chips",
 "publicationExclude 1": "CHIP[Publication|excludes any|Pub A] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -publicationExclude @0 :: 0 chips",
 "publicationExclude 2": "CHIP[Publication|excludes any|Pub A, Pub B] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -publicationExclude @0 :: 0 chips",
 "publication inc+exc": "CHIP[Publication|includes any|Pub A] ; CHIP[Publication|excludes any|Pub B] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -publication @0 :: 1 chips\n#1 edit->0 x-> -publicationExclude @0 :: 1 chips",
 "readStatus 1": "CHIP[Read Status|includes any|📗 Read] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -readStatus @0 :: 0 chips",
 "readStatus 2": "CHIP[Read Status|includes any|📗 Read, No Status] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -readStatus @0 :: 0 chips",
 "readStatusExclude 1": "CHIP[Read Status|excludes any|📗 Read] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -readStatusExclude @0 :: 0 chips",
 "readStatusExclude 2": "CHIP[Read Status|excludes any|📗 Read, No Status] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -readStatusExclude @0 :: 0 chips",
 "readStatus inc+exc": "CHIP[Read Status|includes any|📗 Read] ; CHIP[Read Status|excludes any|No Status] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -readStatus @0 :: 1 chips\n#1 edit->0 x-> -readStatusExclude @0 :: 1 chips",
 "annotationHasComment=true": "CHIP[Has Comment|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationHasComment @0 :: 0 chips",
 "annotationHasComment=false": "CHIP[Has Comment|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationHasComment @0 :: 0 chips",
 "annotationSource=true": "CHIP[Annotation Source|is|Embedded in PDF] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationSource @0 :: 0 chips",
 "annotationSource=false": "CHIP[Annotation Source|is|Made in Zotero] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationSource @0 :: 0 chips",
 "hasRelated=true": "CHIP[Has Related|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasRelated @0 :: 0 chips",
 "hasRelated=false": "CHIP[Has Related|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasRelated @0 :: 0 chips",
 "hasLink=true": "CHIP[Has Link|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasLink @0 :: 0 chips",
 "hasLink=false": "CHIP[Has Link|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasLink @0 :: 0 chips",
 "hasTag=true": "CHIP[Has Tag|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasTag @0 :: 0 chips",
 "hasTag=false": "CHIP[Has Tag|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasTag @0 :: 0 chips",
 "hasBookmarks=true": "CHIP[Has Bookmarks|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasBookmarks @0 :: 0 chips",
 "hasBookmarks=false": "CHIP[Has Bookmarks|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasBookmarks @0 :: 0 chips",
 "itemNote=true": "CHIP[Item Note|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -itemNote @0 :: 0 chips",
 "itemNote=false": "CHIP[Item Note|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -itemNote @0 :: 0 chips",
 "standaloneNote=true": "CHIP[Standalone Note|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -standaloneNote @0 :: 0 chips",
 "standaloneNote=false": "CHIP[Standalone Note|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -standaloneNote @0 :: 0 chips",
 "standaloneAttachment=true": "CHIP[Standalone Attachment|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -standaloneAttachment @0 :: 0 chips",
 "standaloneAttachment=false": "CHIP[Standalone Attachment|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -standaloneAttachment @0 :: 0 chips",
 "hasAbstract=true": "CHIP[Has Abstract|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasAbstract @0 :: 0 chips",
 "hasAbstract=false": "CHIP[Has Abstract|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasAbstract @0 :: 0 chips",
 "hasDOI=true": "CHIP[Has DOI|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasDOI @0 :: 0 chips",
 "hasDOI=false": "CHIP[Has DOI|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasDOI @0 :: 0 chips",
 "hasPMID=true": "CHIP[Has PMID|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasPMID @0 :: 0 chips",
 "hasPMID=false": "CHIP[Has PMID|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasPMID @0 :: 0 chips",
 "hasPMCID=true": "CHIP[Has PMCID|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasPMCID @0 :: 0 chips",
 "hasPMCID=false": "CHIP[Has PMCID|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasPMCID @0 :: 0 chips",
 "retracted=true": "CHIP[Retracted|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -retracted @0 :: 0 chips",
 "retracted=false": "CHIP[Retracted|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -retracted @0 :: 0 chips",
 "hasURL=true": "CHIP[Has URL|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasURL @0 :: 0 chips",
 "hasURL=false": "CHIP[Has URL|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasURL @0 :: 0 chips",
 "hasAttachment=true": "CHIP[Has Attachment File|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasAttachment @0 :: 0 chips",
 "hasAttachment=false": "CHIP[Has Attachment File|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasAttachment @0 :: 0 chips",
 "hasAnnotations=true": "CHIP[Has Annotations|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasAnnotations @0 :: 0 chips",
 "hasAnnotations=false": "CHIP[Has Annotations|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasAnnotations @0 :: 0 chips",
 "hasEmbeddedAnnotations=true": "CHIP[Has Embedded Annotations|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasEmbeddedAnnotations @0 :: 0 chips",
 "hasEmbeddedAnnotations=false": "CHIP[Has Embedded Annotations|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasEmbeddedAnnotations @0 :: 0 chips",
 "hasOutline=true": "CHIP[Has Weavero Outline|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasOutline @0 :: 0 chips",
 "hasOutline=false": "CHIP[Has Weavero Outline|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -hasOutline @0 :: 0 chips",
 "inOtherLibrary=true": "CHIP[In Multiple Libraries|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -inOtherLibrary @0 :: 0 chips",
 "inOtherLibrary=false": "CHIP[In Multiple Libraries|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -inOtherLibrary @0 :: 0 chips",
 "all": "CHIP[Annotation Color|is|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ffd400\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Yellow</span>] ; CHIP[Annotation Color|is not|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ff6666\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Red</span>] ; CHIP[Annotation Type|is|Highlight] ; CHIP[Annotation Type|is not|Underline] ; CHIP[Has Comment|is|] ; CHIP[Annotation Source|is|Embedded in PDF] ; CHIP[Tag|includes|t1] ; CHIP[Tag|excludes any|t2] ; CHIP[Author|includes|Ann Smith] ; CHIP[Author|excludes any|Bob Jones] ; CHIP[Item Type|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"book\"></span>] ; CHIP[Item Type|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"journalArticle\"></span>] ; CHIP[Attachment File Type|is|PDF] ; CHIP[Attachment File Type|is not|EPUB] ; CHIP[Added By|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(94, 106, 210); background-color: rgba(94, 106, 210, 0.18);\">alice</span>] ; CHIP[Added By|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(241, 152, 55); background-color: rgba(241, 152, 55, 0.18);\">bob</span>] ; CHIP[Has Related|is|] ; CHIP[Has Link|is|] ; CHIP[Has Bookmarks|is|] ; CHIP[Has Tag|is|] ; CHIP[Item Note|is|] ; CHIP[Standalone Note|is|] ; CHIP[Standalone Attachment|is|] ; CHIP[Has Abstract|is|] ; CHIP[Has DOI|is|] ; CHIP[Has PMID|is|] ; CHIP[Has PMCID|is|] ; CHIP[Retracted|is|] ; CHIP[Has URL|is|] ; CHIP[Has Attachment File|is|] ; CHIP[Has Annotations|is|] ; CHIP[Has Weavero Outline|is|] ; CHIP[Has Embedded Annotations|is|] ; CHIP[Publication|includes any|Pub A] ; CHIP[Publication|excludes any|Pub B] ; CHIP[Read Status|includes any|📗 Read] ; CHIP[Read Status|excludes any|No Status] ; CHIP[In Multiple Libraries|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationColor @0 :: 37 chips\n#1 edit->0 x-> -annotationColorExclude @0 :: 37 chips\n#2 edit->0 x-> -annotationType @0 :: 37 chips\n#3 edit->0 x-> -annotationTypeExclude @0 :: 37 chips\n#4 edit->0 x-> -annotationHasComment @0 :: 37 chips\n#5 edit->0 x-> -annotationSource @0 :: 37 chips\n#6 edit->0 x-> -annotationTag @0 :: 37 chips\n#7 edit->0 x-> -annotationTagExclude @0 :: 37 chips\n#8 edit->0 x-> -annotationAuthor @0 :: 37 chips\n#9 edit->0 x-> -annotationAuthorExclude @0 :: 37 chips\n#10 edit->0 x-> -itemType @0 :: 37 chips\n#11 edit->0 x-> -itemTypeExclude @0 :: 37 chips\n#12 edit->0 x-> -attachmentFileType @0 :: 37 chips\n#13 edit->0 x-> -attachmentFileTypeExclude @0 :: 37 chips\n#14 edit->0 x-> -addedBy @0 :: 37 chips\n#15 edit->0 x-> -addedByExclude @0 :: 37 chips\n#16 edit->0 x-> -hasRelated @0 :: 37 chips\n#17 edit->0 x-> -hasLink @0 :: 37 chips\n#18 edit->0 x-> -hasBookmarks @0 :: 37 chips\n#19 edit->0 x-> -hasTag @0 :: 37 chips\n#20 edit->0 x-> -itemNote @0 :: 37 chips\n#21 edit->0 x-> -standaloneNote @0 :: 37 chips\n#22 edit->0 x-> -standaloneAttachment @0 :: 37 chips\n#23 edit->0 x-> -hasAbstract @0 :: 37 chips\n#24 edit->0 x-> -hasDOI @0 :: 37 chips\n#25 edit->0 x-> -hasPMID @0 :: 37 chips\n#26 edit->0 x-> -hasPMCID @0 :: 37 chips\n#27 edit->0 x-> -retracted @0 :: 37 chips\n#28 edit->0 x-> -hasURL @0 :: 37 chips\n#29 edit->0 x-> -hasAttachment @0 :: 37 chips\n#30 edit->0 x-> -hasAnnotations @0 :: 37 chips\n#31 edit->0 x-> -hasOutline @0 :: 37 chips\n#32 edit->0 x-> -hasEmbeddedAnnotations @0 :: 37 chips\n#33 edit->0 x-> -publication @0 :: 37 chips\n#34 edit->0 x-> -publicationExclude @0 :: 37 chips\n#35 edit->0 x-> -readStatus @0 :: 37 chips\n#36 edit->0 x-> -readStatusExclude @0 :: 37 chips\n#37 edit->0 x-> -inOtherLibrary @0 :: 37 chips",
 "or groups": "CHIP[Annotation Color|is|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ffd400\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Yellow</span>] ; CHIP[Has DOI|is|] ; wv-filter-or:OR ; CHIP[Item Type|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"book\"></span>] ; wv-filter-or:OR ; CHIP[Has Tag|is not|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> groups hasDOI=true | itemType=[\"book\"] | hasTag=false @0 :: 3 chips\n#1 edit->0 x-> groups annotationColor=[\"#ffd400\"] | itemType=[\"book\"] | hasTag=false @0 :: 3 chips\n#2 edit->2 x-> groups annotationColor=[\"#ffd400\"],hasDOI=true | hasTag=false @0 :: 3 chips\n#3 edit->3 x-> groups annotationColor=[\"#ffd400\"],hasDOI=true | itemType=[\"book\"] @0 :: 3 chips",
 "or, first empty": "CHIP[Standalone Note|is|] ; wv-filter-or:OR ; CHIP[Publication|excludes any|Pub B] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->1 x-> groups  | publicationExclude=[\"Pub B\"] @1 :: 1 chips\n#1 edit->2 x-> groups  | standaloneNote=true @1 :: 1 chips",
 "dev outlineClass 1": "CHIP[Outline Source|is|Embedded] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineClass @0 :: 0 chips",
 "dev outlineClass 2": "CHIP[Outline Source|is|Embedded, Spacing suspect] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineClass @0 :: 0 chips",
 "dev outlineClassExclude 1": "CHIP[Outline Source|is not|Embedded] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineClassExclude @0 :: 0 chips",
 "dev outlineClassExclude 2": "CHIP[Outline Source|is not|Embedded, Spacing suspect] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineClassExclude @0 :: 0 chips",
 "dev outlineClass inc+exc": "CHIP[Outline Source|is|Embedded] ; CHIP[Outline Source|is not|Spacing suspect] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineClass @0 :: 1 chips\n#1 edit->0 x-> -outlineClassExclude @0 :: 1 chips",
 "dev outlineFlags 1": "CHIP[Outline Flags|has|Whitespace junk] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineFlags @0 :: 0 chips",
 "dev outlineFlags 2": "CHIP[Outline Flags|has|Whitespace junk + Spacing suspect] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineFlags @0 :: 0 chips",
 "dev outlineFlagsExclude 1": "CHIP[Outline Flags|has none of|Whitespace junk] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineFlagsExclude @0 :: 0 chips",
 "dev outlineFlagsExclude 2": "CHIP[Outline Flags|has none of|Whitespace junk, Spacing suspect] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineFlagsExclude @0 :: 0 chips",
 "dev outlineFlags inc+exc": "CHIP[Outline Flags|has|Whitespace junk] ; CHIP[Outline Flags|has none of|Spacing suspect] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineFlags @0 :: 1 chips\n#1 edit->0 x-> -outlineFlagsExclude @0 :: 1 chips",
 "dev outlineVerdict 1": "CHIP[Outline Verdict|is|Good] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineVerdict @0 :: 0 chips",
 "dev outlineVerdict 2": "CHIP[Outline Verdict|is|Good, Scan] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineVerdict @0 :: 0 chips",
 "dev outlineVerdictExclude 1": "CHIP[Outline Verdict|is not|Good] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineVerdictExclude @0 :: 0 chips",
 "dev outlineVerdictExclude 2": "CHIP[Outline Verdict|is not|Good, Scan] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineVerdictExclude @0 :: 0 chips",
 "dev outlineVerdict inc+exc": "CHIP[Outline Verdict|is|Good] ; CHIP[Outline Verdict|is not|Scan] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -outlineVerdict @0 :: 1 chips\n#1 edit->0 x-> -outlineVerdictExclude @0 :: 1 chips",
 "dev all": "CHIP[Annotation Color|is|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ffd400\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Yellow</span>] ; CHIP[Annotation Color|is not|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ff6666\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Red</span>] ; CHIP[Annotation Type|is|Highlight] ; CHIP[Annotation Type|is not|Underline] ; CHIP[Has Comment|is|] ; CHIP[Annotation Source|is|Embedded in PDF] ; CHIP[Tag|includes|t1] ; CHIP[Tag|excludes any|t2] ; CHIP[Author|includes|Ann Smith] ; CHIP[Author|excludes any|Bob Jones] ; CHIP[Item Type|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"book\"></span>] ; CHIP[Item Type|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"journalArticle\"></span>] ; CHIP[Attachment File Type|is|PDF] ; CHIP[Attachment File Type|is not|EPUB] ; CHIP[Outline Source|is|Embedded] ; CHIP[Outline Source|is not|Spacing suspect] ; CHIP[Outline Flags|has|Whitespace junk] ; CHIP[Outline Flags|has none of|Spacing suspect] ; CHIP[Outline Verdict|is|Good] ; CHIP[Outline Verdict|is not|Scan] ; CHIP[Added By|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(94, 106, 210); background-color: rgba(94, 106, 210, 0.18);\">alice</span>] ; CHIP[Added By|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"wv-chip-value-user\" style=\"color: rgb(241, 152, 55); background-color: rgba(241, 152, 55, 0.18);\">bob</span>] ; CHIP[Has Related|is|] ; CHIP[Has Link|is|] ; CHIP[Has Bookmarks|is|] ; CHIP[Has Tag|is|] ; CHIP[Item Note|is|] ; CHIP[Standalone Note|is|] ; CHIP[Standalone Attachment|is|] ; CHIP[Has Abstract|is|] ; CHIP[Has DOI|is|] ; CHIP[Has PMID|is|] ; CHIP[Has PMCID|is|] ; CHIP[Retracted|is|] ; CHIP[Has URL|is|] ; CHIP[Has Attachment File|is|] ; CHIP[Has Annotations|is|] ; CHIP[Has Weavero Outline|is|] ; CHIP[Has Embedded Annotations|is|] ; CHIP[Publication|includes any|Pub A] ; CHIP[Publication|excludes any|Pub B] ; CHIP[Read Status|includes any|📗 Read] ; CHIP[Read Status|excludes any|No Status] ; CHIP[In Multiple Libraries|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationColor @0 :: 43 chips\n#1 edit->0 x-> -annotationColorExclude @0 :: 43 chips\n#2 edit->0 x-> -annotationType @0 :: 43 chips\n#3 edit->0 x-> -annotationTypeExclude @0 :: 43 chips\n#4 edit->0 x-> -annotationHasComment @0 :: 43 chips\n#5 edit->0 x-> -annotationSource @0 :: 43 chips\n#6 edit->0 x-> -annotationTag @0 :: 43 chips\n#7 edit->0 x-> -annotationTagExclude @0 :: 43 chips\n#8 edit->0 x-> -annotationAuthor @0 :: 43 chips\n#9 edit->0 x-> -annotationAuthorExclude @0 :: 43 chips\n#10 edit->0 x-> -itemType @0 :: 43 chips\n#11 edit->0 x-> -itemTypeExclude @0 :: 43 chips\n#12 edit->0 x-> -attachmentFileType @0 :: 43 chips\n#13 edit->0 x-> -attachmentFileTypeExclude @0 :: 43 chips\n#14 edit->0 x-> -outlineClass @0 :: 43 chips\n#15 edit->0 x-> -outlineClassExclude @0 :: 43 chips\n#16 edit->0 x-> -outlineFlags @0 :: 43 chips\n#17 edit->0 x-> -outlineFlagsExclude @0 :: 43 chips\n#18 edit->0 x-> -outlineVerdict @0 :: 43 chips\n#19 edit->0 x-> -outlineVerdictExclude @0 :: 43 chips\n#20 edit->0 x-> -addedBy @0 :: 43 chips\n#21 edit->0 x-> -addedByExclude @0 :: 43 chips\n#22 edit->0 x-> -hasRelated @0 :: 43 chips\n#23 edit->0 x-> -hasLink @0 :: 43 chips\n#24 edit->0 x-> -hasBookmarks @0 :: 43 chips\n#25 edit->0 x-> -hasTag @0 :: 43 chips\n#26 edit->0 x-> -itemNote @0 :: 43 chips\n#27 edit->0 x-> -standaloneNote @0 :: 43 chips\n#28 edit->0 x-> -standaloneAttachment @0 :: 43 chips\n#29 edit->0 x-> -hasAbstract @0 :: 43 chips\n#30 edit->0 x-> -hasDOI @0 :: 43 chips\n#31 edit->0 x-> -hasPMID @0 :: 43 chips\n#32 edit->0 x-> -hasPMCID @0 :: 43 chips\n#33 edit->0 x-> -retracted @0 :: 43 chips\n#34 edit->0 x-> -hasURL @0 :: 43 chips\n#35 edit->0 x-> -hasAttachment @0 :: 43 chips\n#36 edit->0 x-> -hasAnnotations @0 :: 43 chips\n#37 edit->0 x-> -hasOutline @0 :: 43 chips\n#38 edit->0 x-> -hasEmbeddedAnnotations @0 :: 43 chips\n#39 edit->0 x-> -publication @0 :: 43 chips\n#40 edit->0 x-> -publicationExclude @0 :: 43 chips\n#41 edit->0 x-> -readStatus @0 :: 43 chips\n#42 edit->0 x-> -readStatusExclude @0 :: 43 chips\n#43 edit->0 x-> -inOtherLibrary @0 :: 43 chips",
 "nocolor addedBy 1": "CHIP[Added By|is|alice] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -addedBy @0 :: 0 chips",
 "nocolor addedBy 2": "CHIP[Added By|is|alice, bob] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -addedBy @0 :: 0 chips",
 "nocolor addedByExclude 1": "CHIP[Added By|is not|alice] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -addedByExclude @0 :: 0 chips",
 "nocolor addedByExclude 2": "CHIP[Added By|is not|alice, bob] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -addedByExclude @0 :: 0 chips",
 "nocolor addedBy inc+exc": "CHIP[Added By|is|alice] ; CHIP[Added By|is not|bob] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -addedBy @0 :: 1 chips\n#1 edit->0 x-> -addedByExclude @0 :: 1 chips",
 "nocolor all": "CHIP[Annotation Color|is|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ffd400\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Yellow</span>] ; CHIP[Annotation Color|is not|<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" class=\"wv-swatch-native\"><path d=\"M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z\" fill=\"#ff6666\"/><path d=\"M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z\" stroke=\"black\" stroke-opacity=\"0.1\"/></svg><span xmlns=\"http://www.w3.org/1999/xhtml\">Red</span>] ; CHIP[Annotation Type|is|Highlight] ; CHIP[Annotation Type|is not|Underline] ; CHIP[Has Comment|is|] ; CHIP[Annotation Source|is|Embedded in PDF] ; CHIP[Tag|includes|t1] ; CHIP[Tag|excludes any|t2] ; CHIP[Author|includes|Ann Smith] ; CHIP[Author|excludes any|Bob Jones] ; CHIP[Item Type|is|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"book\"></span>] ; CHIP[Item Type|is not|<span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"icon icon-css icon-item-type\" data-item-type=\"journalArticle\"></span>] ; CHIP[Attachment File Type|is|PDF] ; CHIP[Attachment File Type|is not|EPUB] ; CHIP[Added By|is|alice] ; CHIP[Added By|is not|bob] ; CHIP[Has Related|is|] ; CHIP[Has Link|is|] ; CHIP[Has Bookmarks|is|] ; CHIP[Has Tag|is|] ; CHIP[Item Note|is|] ; CHIP[Standalone Note|is|] ; CHIP[Standalone Attachment|is|] ; CHIP[Has Abstract|is|] ; CHIP[Has DOI|is|] ; CHIP[Has PMID|is|] ; CHIP[Has PMCID|is|] ; CHIP[Retracted|is|] ; CHIP[Has URL|is|] ; CHIP[Has Attachment File|is|] ; CHIP[Has Annotations|is|] ; CHIP[Has Weavero Outline|is|] ; CHIP[Has Embedded Annotations|is|] ; CHIP[Publication|includes any|Pub A] ; CHIP[Publication|excludes any|Pub B] ; CHIP[Read Status|includes any|📗 Read] ; CHIP[Read Status|excludes any|No Status] ; CHIP[In Multiple Libraries|is|] ; wv-filter-add:+ Filter ; wv-filter-add wv-filter-add-group:+ OR Group ; wv-filter-clear:Clear all\n#0 edit->0 x-> -annotationColor @0 :: 37 chips\n#1 edit->0 x-> -annotationColorExclude @0 :: 37 chips\n#2 edit->0 x-> -annotationType @0 :: 37 chips\n#3 edit->0 x-> -annotationTypeExclude @0 :: 37 chips\n#4 edit->0 x-> -annotationHasComment @0 :: 37 chips\n#5 edit->0 x-> -annotationSource @0 :: 37 chips\n#6 edit->0 x-> -annotationTag @0 :: 37 chips\n#7 edit->0 x-> -annotationTagExclude @0 :: 37 chips\n#8 edit->0 x-> -annotationAuthor @0 :: 37 chips\n#9 edit->0 x-> -annotationAuthorExclude @0 :: 37 chips\n#10 edit->0 x-> -itemType @0 :: 37 chips\n#11 edit->0 x-> -itemTypeExclude @0 :: 37 chips\n#12 edit->0 x-> -attachmentFileType @0 :: 37 chips\n#13 edit->0 x-> -attachmentFileTypeExclude @0 :: 37 chips\n#14 edit->0 x-> -addedBy @0 :: 37 chips\n#15 edit->0 x-> -addedByExclude @0 :: 37 chips\n#16 edit->0 x-> -hasRelated @0 :: 37 chips\n#17 edit->0 x-> -hasLink @0 :: 37 chips\n#18 edit->0 x-> -hasBookmarks @0 :: 37 chips\n#19 edit->0 x-> -hasTag @0 :: 37 chips\n#20 edit->0 x-> -itemNote @0 :: 37 chips\n#21 edit->0 x-> -standaloneNote @0 :: 37 chips\n#22 edit->0 x-> -standaloneAttachment @0 :: 37 chips\n#23 edit->0 x-> -hasAbstract @0 :: 37 chips\n#24 edit->0 x-> -hasDOI @0 :: 37 chips\n#25 edit->0 x-> -hasPMID @0 :: 37 chips\n#26 edit->0 x-> -hasPMCID @0 :: 37 chips\n#27 edit->0 x-> -retracted @0 :: 37 chips\n#28 edit->0 x-> -hasURL @0 :: 37 chips\n#29 edit->0 x-> -hasAttachment @0 :: 37 chips\n#30 edit->0 x-> -hasAnnotations @0 :: 37 chips\n#31 edit->0 x-> -hasOutline @0 :: 37 chips\n#32 edit->0 x-> -hasEmbeddedAnnotations @0 :: 37 chips\n#33 edit->0 x-> -publication @0 :: 37 chips\n#34 edit->0 x-> -publicationExclude @0 :: 37 chips\n#35 edit->0 x-> -readStatus @0 :: 37 chips\n#36 edit->0 x-> -readStatusExclude @0 :: 37 chips\n#37 edit->0 x-> -inOtherLibrary @0 :: 37 chips"
};
