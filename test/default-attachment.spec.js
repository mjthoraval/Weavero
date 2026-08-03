/* global describe, it, before, after, expect, Zotero */

// Tests for the DEFAULT CHILD feature (modules/attachments.ts): a
// user-chosen child — file attachment, linked URL, or child note — that
// Weavero opens instead of Zotero's fixed getBestAttachment heuristic.
//
// Three groups of contract are locked here, each paid for by a real bug or
// a deliberate design decision that a later edit could silently undo:
//
//  1. THE TAG NAME. The tag IS the storage, and it is user-visible, so its
//     spelling is a compatibility surface AND a search surface. Zotero's
//     quick search matches SUBSTRINGS and splits the box on whitespace into
//     independent AND-ed conditions, so a readable name leaks: earlier
//     revisions ("▶️ Weavero Default", "▶️ wv-open-by-default") made marked
//     children surface in ordinary searches for "Weavero" or "default".
//     The assertions below encode the three rules that fixed it — no
//     "weavero", no "default", one whitespace-free slug — so that spelling
//     the slug out again fails a test instead of shipping.
//
//  2. DATE MODIFIED IS NOT TOUCHED. Marking a child is Weavero metadata,
//     not a user edit. Every marker write passes skipDateModifiedUpdate,
//     and must keep doing so: without it, marking a library's worth of
//     choices silently restamps Date Modified and scrambles that sort.
//     Paired with the inverse assertion — `synced` MUST still be cleared,
//     since syncing is the whole reason this state lives in the library
//     rather than in one of Weavero's JSON stores.
//
//  3. getBestAttachment FALLS THROUGH FOR NON-FILES. Callers of that method
//     expect a file; handing back a note or a linked URL would break them.
//     The override therefore applies ONLY when the chosen child is a real
//     file attachment, and the coexistence re-assert (PikaPei
//     /zotero-default-attachment patches the same method) must leave our
//     wrapper outermost while keeping theirs as the fallback.
//
// Fixtures are built by hand rather than through Zotero.Attachments.*
// helpers: those need real files on disk, and nothing here ever opens one.

describe("Weavero — default child (attachments, notes, links)", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvSetDefaultChild !== "function") this.skip();
    });

    // ---- 1. the tag name is a contract ----------------------------

    describe("marker tag", () => {
        it("exposes the tag so nothing else hardcodes it", () => {
            expect(wv._wvOpenByDefaultTag).to.be.a("string");
            expect(wv._wvOpenByDefaultTag.length).to.be.above(0);
        });

        it("leads with an emoji Zotero renders in the items list", () => {
            const emoji = Zotero.Tags.extractEmojiForItemsList(wv._wvOpenByDefaultTag);
            expect(emoji).to.be.a("string");
            expect(emoji.length).to.be.above(0);
        });

        // The context menu shows this same glyph, so the menu entry and the
        // items-list row marker are visibly the same thing. Derived, never
        // written out twice — this asserts the two cannot drift.
        it("exposes the glyph the items list shows, for the menu to reuse", () => {
            expect(wv._wvOpenByDefaultEmoji)
                .to.equal(Zotero.Tags.extractEmojiForItemsList(wv._wvOpenByDefaultTag));
            expect(wv._wvOpenByDefaultEmoji.length).to.be.above(0);
            expect(wv._wvOpenByDefaultTag.indexOf(wv._wvOpenByDefaultEmoji)).to.equal(0);
        });

        // Rule 1: "Weavero" in the tag made every marked child match a
        // genuine search for the user's own notes ABOUT Weavero.
        it("does NOT contain 'weavero' (would pollute searches for Weavero notes)", () => {
            expect(wv._wvOpenByDefaultTag.toLowerCase()).to.not.contain("weavero");
        });

        // Rule 2: substring matching means any common word leaks.
        it("does NOT contain the word 'default' (substring search would match it)", () => {
            expect(wv._wvOpenByDefaultTag.toLowerCase()).to.not.contain("default");
        });

        // Rule 3: quick search splits on WHITESPACE, so a multi-word tag can
        // never be matched strictly — each word becomes its own condition and
        // matches items carrying those words anywhere. A single whitespace-free
        // slug after the emoji is what makes the tag strict-name-only.
        it("has exactly one whitespace-free slug after the emoji", () => {
            const parts = wv._wvOpenByDefaultTag.split(/\s+/).filter(Boolean);
            expect(parts.length).to.equal(2);          // emoji + slug
            expect(parts[1]).to.not.match(/\s/);
        });
    });

    // ---- fixtures --------------------------------------------------

    describe("marking behaviour", () => {
        let parent, fileAtt, linkAtt, note;

        before(async () => {
            const lib = Zotero.Libraries.userLibraryID;

            parent = new Zotero.Item("journalArticle");
            parent.libraryID = lib;
            parent.setField("title", "WV-TEST defatt parent");
            await parent.saveTx();

            // A FILE attachment: any link mode other than LINKED_URL counts.
            // The file need not exist — nothing here opens it.
            fileAtt = new Zotero.Item("attachment");
            fileAtt.libraryID = lib;
            fileAtt.parentID = parent.id;
            fileAtt.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
            fileAtt.attachmentContentType = "application/pdf";
            fileAtt.setField("title", "WV-TEST defatt file");
            await fileAtt.saveTx();

            linkAtt = new Zotero.Item("attachment");
            linkAtt.libraryID = lib;
            linkAtt.parentID = parent.id;
            linkAtt.attachmentLinkMode = Zotero.Attachments.LINK_MODE_LINKED_URL;
            linkAtt.setField("title", "WV-TEST defatt link");
            linkAtt.setField("url", "https://example.com/wv-defatt");
            await linkAtt.saveTx();

            note = new Zotero.Item("note");
            note.libraryID = lib;
            note.parentID = parent.id;
            note.setNote("WV-TEST defatt note");
            await note.saveTx();
        });

        after(async () => {
            for (const it of [note, linkAtt, fileAtt, parent]) {
                try { if (it) await it.eraseTx(); } catch (e) { /* already gone */ }
            }
        });

        // -- openable children --------------------------------------

        it("counts attachments AND notes as openable children", () => {
            const kids = wv._wvOpenableChildren(parent);
            const ids = kids.map(k => k.id);
            expect(ids).to.include(fileAtt.id);
            expect(ids).to.include(linkAtt.id);
            expect(ids).to.include(note.id);
        });

        it("returns nothing for a non-regular item", () => {
            expect(wv._wvOpenableChildren(note)).to.have.length(0);
            expect(wv._wvOpenableChildren(null)).to.have.length(0);
        });

        // -- file-vs-openable distinction ---------------------------

        it("treats a file attachment as a file", () => {
            expect(wv._wvIsFileAttachment(fileAtt)).to.equal(true);
        });

        it("does NOT treat a linked URL as a file", () => {
            expect(wv._wvIsFileAttachment(linkAtt)).to.equal(false);
        });

        it("does NOT treat a note as a file", () => {
            expect(wv._wvIsFileAttachment(note)).to.equal(false);
        });

        // -- set / get / clear --------------------------------------

        it("marks a child and reads it back", async () => {
            await wv._wvSetDefaultChild(fileAtt);
            expect(wv._wvIsDefaultChild(fileAtt)).to.equal(true);
            expect(wv._wvGetDefaultChild(parent).id).to.equal(fileAtt.id);
        });

        it("marks the tag AUTOMATIC (type 1) so it is hideable", () => {
            const t = fileAtt.getTags().find(x => x.tag === wv._wvOpenByDefaultTag);
            expect(t).to.be.an("object");
            expect(t.type).to.equal(1);
        });

        // Uniqueness is enforced on WRITE: moving the mark must clear the
        // previous holder, or getBestAttachment becomes order-dependent.
        it("moving the mark to a sibling clears the previous one", async () => {
            await wv._wvSetDefaultChild(note);
            expect(wv._wvIsDefaultChild(note)).to.equal(true);
            expect(wv._wvIsDefaultChild(fileAtt)).to.equal(false);
            expect(wv._wvGetDefaultChild(parent).id).to.equal(note.id);
        });

        it("clears the mark", async () => {
            await wv._wvClearDefaultChild(note);
            expect(wv._wvIsDefaultChild(note)).to.equal(false);
            expect(wv._wvGetDefaultChild(parent)).to.equal(null);
        });

        it("ignores a TRASHED child when resolving the default", async () => {
            await wv._wvSetDefaultChild(fileAtt);
            fileAtt.deleted = true;
            await fileAtt.saveTx();
            try {
                expect(wv._wvGetDefaultChild(parent)).to.equal(null);
            }
            finally {
                fileAtt.deleted = false;
                await fileAtt.saveTx();
                await wv._wvClearDefaultChild(fileAtt);
            }
        });

        // -- master switch --------------------------------------------

        // Read at CALL time, so a toggle takes effect with no reload and no
        // re-wiring — the wrapper stays installed and simply stops
        // overriding, which keeps the competitor-coexistence chain intact.
        describe("master switch", () => {
            const PREF = "weavero.enableDefaultChild";
            after(async () => {
                Zotero.Prefs.clear(PREF);
                await wv._wvClearDefaultChild(fileAtt);
            });

            it("defaults ON when the pref was never set", () => {
                Zotero.Prefs.clear(PREF);
                expect(wv._wvDefaultChildEnabled()).to.equal(true);
            });

            it("stops resolving a default when switched off", async () => {
                await wv._wvSetDefaultChild(fileAtt);
                Zotero.Prefs.set(PREF, false);
                expect(wv._wvGetDefaultChild(parent)).to.equal(null);
                // ...and getBestAttachment falls back to Zotero's own choice.
                const best = await parent.getBestAttachment();
                expect(best ? best.id : null).to.not.equal(note.id);
            });

            it("keeps the marker tag while off — off means stop, not forget", () => {
                Zotero.Prefs.set(PREF, false);
                expect(wv._wvIsDefaultChild(fileAtt)).to.equal(true);
            });

            it("restores the pick when switched back on, with no re-wiring", async () => {
                Zotero.Prefs.set(PREF, false);
                expect(wv._wvGetDefaultChild(parent)).to.equal(null);
                Zotero.Prefs.set(PREF, true);
                expect(wv._wvGetDefaultChild(parent).id).to.equal(fileAtt.id);
                const best = await parent.getBestAttachment();
                expect(best && best.id).to.equal(fileAtt.id);
            });

            it("declines the open helper while off", async () => {
                const zp = Zotero.getMainWindow().ZoteroPane;
                Zotero.Prefs.set(PREF, false);
                expect(await wv._wvTryOpenDefaultChild(zp, [parent], null, {}))
                    .to.equal(false);
            });
        });

        // -- Date Modified / sync ------------------------------------

        it("does NOT change Date Modified on set, move, or clear", async () => {
            const before = {
                file: fileAtt.getField("dateModified"),
                note: note.getField("dateModified"),
                parent: parent.getField("dateModified"),
            };
            await wv._wvSetDefaultChild(fileAtt);
            await wv._wvSetDefaultChild(note);      // exercises the sibling-clear path
            await wv._wvClearDefaultChild(note);

            expect(fileAtt.getField("dateModified")).to.equal(before.file);
            expect(note.getField("dateModified")).to.equal(before.note);
            // Tagging a child must not restamp the PARENT either.
            expect(parent.getField("dateModified")).to.equal(before.parent);
        });

        // The inverse of the above: skipping the date must NOT skip the sync
        // flag, or the choice never reaches the user's other devices — which
        // is the only reason this state lives in the library at all.
        it("still queues the item for sync", async () => {
            await wv._wvSetDefaultChild(fileAtt);
            expect(fileAtt.synced).to.equal(false);
            await wv._wvClearDefaultChild(fileAtt);
        });

        // -- rejects non-children ------------------------------------

        it("refuses to mark a regular item", async () => {
            expect(await wv._wvSetDefaultChild(parent)).to.equal(false);
            expect(await wv._wvSetDefaultChild(null)).to.equal(false);
        });

        // -- getBestAttachment override ------------------------------

        it("getBestAttachment returns the marked FILE attachment", async () => {
            await wv._wvSetDefaultChild(fileAtt);
            const best = await parent.getBestAttachment();
            expect(best && best.id).to.equal(fileAtt.id);
            await wv._wvClearDefaultChild(fileAtt);
        });

        // Callers of getBestAttachment expect a FILE. A marked note or linked
        // URL must fall through to upstream rather than be handed back.
        it("getBestAttachment falls through when the marked child is a NOTE", async () => {
            await wv._wvSetDefaultChild(note);
            const best = await parent.getBestAttachment();
            expect(best ? best.id : null).to.not.equal(note.id);
            await wv._wvClearDefaultChild(note);
        });

        it("getBestAttachment falls through when the marked child is a LINKED URL", async () => {
            await wv._wvSetDefaultChild(linkAtt);
            const best = await parent.getBestAttachment();
            expect(best ? best.id : null).to.not.equal(linkAtt.id);
            await wv._wvClearDefaultChild(linkAtt);
        });

        // -- cooperative open helper ---------------------------------

        it("_wvTryOpenDefaultChild declines when nothing is marked", async () => {
            const zp = Zotero.getMainWindow().ZoteroPane;
            expect(await wv._wvTryOpenDefaultChild(zp, [parent], null, {})).to.equal(false);
        });

        it("_wvTryOpenDefaultChild declines for a multi-item selection", async () => {
            const zp = Zotero.getMainWindow().ZoteroPane;
            await wv._wvSetDefaultChild(fileAtt);
            try {
                expect(await wv._wvTryOpenDefaultChild(zp, [parent, parent], null, {}))
                    .to.equal(false);
            }
            finally {
                await wv._wvClearDefaultChild(fileAtt);
            }
        });
    });

    // ---- suppressing the rival's duplicate menu entry --------------

    // With both plugins enabled the items menu carried two near-identical
    // actions — their "Set Default" and Weavero's "▶️ Set as Default" — and
    // clicking theirs wrote only their pref, so no marker tag appeared and
    // the choice did not sync. A user hit exactly that on 2026-08-03 and
    // reported the feature as broken.
    //
    // The temp test profile has no rival plugin, so these drive the
    // mechanism against stand-in elements carrying their v1.0.0 ids. That
    // also pins the ids: if they ever change, this fails rather than the
    // suppression silently becoming a no-op.
    describe("rival menu suppression", () => {
        const IDS = ["defaultattachment-set-default-menuitem",
                     "defaultattachment-separator"];
        let doc, made = [];

        before(() => {
            doc = Zotero.getMainWindow().document;
            const menu = doc.getElementById("zotero-itemmenu");
            for (const id of IDS) {
                if (doc.getElementById(id)) continue;      // real plugin present
                const el = doc.createXULElement("menuitem");
                el.id = id;
                menu.appendChild(el);
                made.push(el);
            }
        });
        after(() => {
            for (const el of made) {
                try { el.remove(); } catch (e) { /* already gone */ }
            }
            made = [];
        });

        it("hides both their menu item and their separator", () => {
            for (const id of IDS) doc.getElementById(id).hidden = false;
            wv._wvHideRivalDefaultMenu(doc, true);
            for (const id of IDS) {
                expect(doc.getElementById(id).hidden, id).to.equal(true);
            }
        });

        it("restores them — so disabling Weavero does not leave the user with neither", () => {
            wv._wvHideRivalDefaultMenu(doc, true);
            wv._wvHideRivalDefaultMenu(doc, false);
            for (const id of IDS) {
                expect(doc.getElementById(id).hidden, id).to.equal(false);
            }
        });

        it("is a no-op when the rival is not installed", () => {
            expect(() => wv._wvHideRivalDefaultMenu(doc, true)).to.not.throw();
            expect(() => wv._wvHideRivalDefaultMenu(null, true)).to.not.throw();
        });
    });

    // ---- migration from PikaPei/zotero-default-attachment ----------

    // That plugin's ENTIRE state is one pref holding {parentID: attachmentID}
    // with LOCAL numeric ids — nothing synced, no second copy. Clearing it is
    // therefore irreversible, which is why the purge must prove every pick
    // reached Weavero first. These tests own that guarantee.
    describe("legacy import", () => {
        const PREF = "extensions.zotero.defaultattachment.mappings";
        let parent, parent2, att, att2, saved;

        before(async () => {
            const lib = Zotero.Libraries.userLibraryID;
            try { saved = Zotero.Prefs.get(PREF, true); } catch (e) { saved = undefined; }

            parent = new Zotero.Item("journalArticle");
            parent.libraryID = lib;
            parent.setField("title", "WV-TEST legacy parent");
            await parent.saveTx();

            att = new Zotero.Item("attachment");
            att.libraryID = lib;
            att.parentID = parent.id;
            att.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
            att.attachmentContentType = "application/pdf";
            att.setField("title", "WV-TEST legacy att");
            await att.saveTx();

            // A sibling, so the "user already chose something else" case can
            // be exercised.
            att2 = new Zotero.Item("attachment");
            att2.libraryID = lib;
            att2.parentID = parent.id;
            att2.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
            att2.attachmentContentType = "application/pdf";
            att2.setField("title", "WV-TEST legacy att 2");
            await att2.saveTx();

            // A second item, so a mapping can point at an attachment that
            // belongs to a DIFFERENT parent — what a re-parented pick looks like.
            parent2 = new Zotero.Item("journalArticle");
            parent2.libraryID = lib;
            parent2.setField("title", "WV-TEST legacy parent 2");
            await parent2.saveTx();
        });

        after(async () => {
            try {
                if (saved === undefined) Zotero.Prefs.clear(PREF, true);
                else Zotero.Prefs.set(PREF, saved, true);
            } catch (e) { /* leave as-is */ }
            for (const it of [att2, att, parent2, parent]) {
                try { if (it) await it.eraseTx(); } catch (e) { /* already gone */ }
            }
        });

        it("imports a valid entry as a Weavero mark", async () => {
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            await wv._wvClearDefaultChild(att);
            const r = await wv._wvImportLegacyMappings();
            expect(r.migrated).to.equal(1);
            expect(r.unresolved).to.have.length(0);
            expect(wv._wvIsDefaultChild(att)).to.equal(true);
        });

        // The import is strictly ONE-SHOT: the guard exists so a pick the user
        // deliberately cleared in Weavero is not resurrected from the legacy
        // pref on every restart. The cost is that picks made with the old
        // plugin AFTER Weavero's first start are not transferred — which is
        // why the README documents resetting the guard to re-run it. Both
        // halves are asserted here, since the README promises the second.
        it("runs once — a second call is a no-op while the guard is set", async () => {
            await wv._wvClearDefaultChild(att);
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            Zotero.Prefs.set("weavero.defaultChildMigrated", true);
            const r = await wv._wvMigrateDefaultAttachmentPlugin();
            expect(r.ran).to.equal(false);
            expect(wv._wvIsDefaultChild(att)).to.equal(false);
        });

        it("re-runs after the guard is reset, as the README instructs", async () => {
            await wv._wvClearDefaultChild(att);
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            Zotero.Prefs.clear("weavero.defaultChildMigrated");
            const r = await wv._wvMigrateDefaultAttachmentPlugin();
            expect(r.ran).to.equal(true);
            expect(r.migrated).to.equal(1);
            expect(wv._wvIsDefaultChild(att)).to.equal(true);
            await wv._wvClearDefaultChild(att);
        });

        // An explicit Weavero choice must never be replaced by the legacy
        // plugin's older, unsynced one. _wvSetDefaultChild clears siblings, so
        // importing over an existing choice would silently swap it.
        it("never overwrites an existing Weavero choice for the same parent", async () => {
            await wv._wvSetDefaultChild(att2);                       // user's choice
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);  // legacy
            const r = await wv._wvImportLegacyMappings();
            expect(r.migrated).to.equal(0);
            expect(r.superseded).to.equal(1);
            expect(wv._wvIsDefaultChild(att2), "user's pick kept").to.equal(true);
            expect(wv._wvIsDefaultChild(att), "legacy pick not applied").to.equal(false);
            expect(wv._wvGetDefaultChild(parent).id).to.equal(att2.id);
        });

        // ...and a superseded entry is reported as such, so the confirmation
        // can say "you already chose something else here" rather than making
        // it look like a loss.
        it("reports a superseded entry, and leaves the user's pick alone", async () => {
            await wv._wvSetDefaultChild(att2);
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            const r = await wv._wvImportLegacyMappings();
            expect(r.superseded).to.equal(1);
            expect(r.migrated).to.equal(0);
            expect(wv._wvIsDefaultChild(att2), "user's pick kept").to.equal(true);
            await wv._wvClearDefaultChild(att2);
        });

        // Weavero NEVER deletes the other plugin's data — removing it is a
        // manual step documented in the README. This pins that: an import
        // leaves the legacy pref exactly as it found it.
        it("never deletes the legacy pref", async () => {
            const map = JSON.stringify({ [parent.id]: att.id });
            Zotero.Prefs.set(PREF, map, true);
            await wv._wvImportLegacyMappings();
            expect(Zotero.Prefs.get(PREF, true)).to.equal(map);
        });

        // Skipping the import while the feature is off must NOT burn the
        // run-once guard, or enabling it later would silently lose the picks.
        it("does not burn the run-once guard while the feature is off", async () => {
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            Zotero.Prefs.clear("weavero.defaultChildMigrated");
            Zotero.Prefs.set("weavero.enableDefaultChild", false);
            try {
                const r = await wv._wvMigrateDefaultAttachmentPlugin();
                expect(r.ran).to.equal(false);
                expect(Zotero.Prefs.get("weavero.defaultChildMigrated")).to.equal(undefined);
            }
            finally {
                Zotero.Prefs.clear("weavero.enableDefaultChild");
            }
            // Enabling it later still imports.
            const r2 = await wv._wvMigrateDefaultAttachmentPlugin();
            expect(r2.ran).to.equal(true);
            expect(wv._wvIsDefaultChild(att)).to.equal(true);
            await wv._wvClearDefaultChild(att);
        });

        it("does nothing (and reports nothing) when the pref is absent", async () => {
            Zotero.Prefs.clear(PREF, true);
            const r = await wv._wvImportLegacyMappings();
            expect(r.found).to.equal(0);
            expect(r.migrated).to.equal(0);
            expect(r.unresolved).to.have.length(0);
        });

        // The notice is what stops the takeover being silent, so it is queued
        // by the migration itself rather than by whoever happens to call it.
        it("queues a one-time notice when it actually imported something", async () => {
            Zotero.Prefs.clear("weavero.defaultChildMigrationNotice");
            Zotero.Prefs.clear("weavero.defaultChildMigrated");
            await wv._wvClearDefaultChild(att);
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            const r = await wv._wvMigrateDefaultAttachmentPlugin();
            expect(r.migrated).to.equal(1);
            expect(Number(Zotero.Prefs.get("weavero.defaultChildMigrationNotice"))).to.equal(1);
            await wv._wvClearDefaultChild(att);
        });

        it("queues no notice when nothing was imported", async () => {
            Zotero.Prefs.clear("weavero.defaultChildMigrationNotice");
            Zotero.Prefs.clear("weavero.defaultChildMigrated");
            Zotero.Prefs.clear(PREF, true);
            await wv._wvMigrateDefaultAttachmentPlugin();
            expect(Zotero.Prefs.get("weavero.defaultChildMigrationNotice")).to.equal(undefined);
        });

        // Sticky by design: an auto-closing startup toast is trivially missed,
        // so the pref is cleared only by a real dismissal.
        it("shows a sticky notice and clears the pref only on dismiss", async () => {
            const win = Zotero.getMainWindow();
            const doc = win.document;
            Zotero.Prefs.set("weavero.defaultChildMigrationNotice", 3);
            try {
                await wv._wvShowMigrationNotice(win);
                const el = doc.getElementById("wv-defatt-notice");
                expect(el, "notice rendered").to.not.equal(null);
                expect(el.textContent).to.contain("3");
                // still pending until acknowledged
                expect(Number(Zotero.Prefs.get("weavero.defaultChildMigrationNotice")))
                    .to.equal(3);
                el.click();
                expect(doc.getElementById("wv-defatt-notice"), "removed on click")
                    .to.equal(null);
                expect(Zotero.Prefs.get("weavero.defaultChildMigrationNotice"))
                    .to.equal(undefined);
            }
            finally {
                const stale = doc.getElementById("wv-defatt-notice");
                if (stale) stale.remove();
                Zotero.Prefs.clear("weavero.defaultChildMigrationNotice");
            }
        });
    });

    // ---- 3. wiring + coexistence -----------------------------------

    describe("getBestAttachment wiring", () => {
        // Weavero's expandos are not on Zotero's typed Item, so the prototype
        // is read through an untyped alias in this group.
        it("is installed with a VERSION stamp, not a boolean", () => {
            // A boolean marker would make an updated build skip installation
            // and leave the PREVIOUS build's wrapper in place, calling methods
            // that may have been renamed. Cost a debugging round on 2026-08-03.
            const proto = /** @type {any} */ (Zotero.Item.prototype);
            expect(proto._wvDefaultAttWired).to.be.a("number");
            expect(proto._wvDefaultAttWired).to.be.above(0);
        });

        it("leaves our wrapper OUTERMOST", () => {
            const proto = /** @type {any} */ (Zotero.Item.prototype);
            expect(proto.getBestAttachment).to.equal(proto._wvDefaultAttFn);
        });

        // A competitor installed or enabled AFTER Weavero started wraps on top
        // of us and wins -- startup wiring only sees plugins already loaded.
        // Observed live on 2026-08-03 with PikaPei's Default Attachment v1.0.0.
        // The fix is a Zotero.Plugins observer that re-asserts on any other
        // plugin's startup; this locks it in place.
        it("registers a plugin-lifecycle observer to survive later installs", () => {
            const Z = /** @type {any} */ (Zotero);
            expect(Z._wvDefAttPluginObserver).to.be.an("object");
            expect(Z._wvDefAttPluginObserver.startup).to.be.a("function");
            expect(Z._wvDefAttPluginObserverVer).to.be.a("number");
        });

        it("re-asserts when another plugin starts up", async () => {
            const proto = /** @type {any} */ (Zotero.Item.prototype);
            const pristine = proto._wvOrigGetBestAttachment;
            const theirs = proto.getBestAttachment;
            // Simulate a competitor patching after us.
            proto.getBestAttachment = async function (...a) {
                return theirs.apply(this, a);
            };
            try {
                expect(proto.getBestAttachment).to.not.equal(proto._wvDefaultAttFn);
                // What Zotero.Plugins would call for a foreign plugin.
                const Z = /** @type {any} */ (Zotero);
                await Z._wvDefAttPluginObserver.startup({ id: "someone-else@example.com" });
                expect(proto.getBestAttachment).to.equal(proto._wvDefaultAttFn);
            }
            finally {
                wv._wvUnwireDefaultAttachment();
                proto.getBestAttachment = typeof pristine === "function" ? pristine : theirs;
                wv._wvWireDefaultAttachment();
            }
        });

        it("ignores its OWN startup (no self-triggered rewire loop)", async () => {
            const proto = /** @type {any} */ (Zotero.Item.prototype);
            const before = proto.getBestAttachment;
            const Z = /** @type {any} */ (Zotero);
            await Z._wvDefAttPluginObserver.startup({ id: "weavero@mjthoraval" });
            expect(proto.getBestAttachment).to.equal(before);
        });

        // PikaPei/zotero-default-attachment patches the same method and load
        // order is not ours to control, so Weavero re-asserts on top and keeps
        // the other wrapper as its fallback.
        it("re-asserts over a competing wrapper, keeping it as fallback", async () => {
            const proto = /** @type {any} */ (Zotero.Item.prototype);
            // The UPSTREAM original, saved when Weavero wired itself. Restoring
            // to this in the finally is what keeps the prototype at exactly one
            // wrapper — re-wiring over the current chain would stack a second.
            const pristine = proto._wvOrigGetBestAttachment;
            const theirs = proto.getBestAttachment;
            let theirsCalled = false;
            proto.getBestAttachment = async function (...a) {
                theirsCalled = true;
                return theirs.apply(this, a);
            };
            try {
                expect(proto.getBestAttachment).to.not.equal(proto._wvDefaultAttFn);

                wv._wvWireDefaultAttachment();
                expect(proto.getBestAttachment).to.equal(proto._wvDefaultAttFn);

                // With no Weavero pick, the competitor still gets its say.
                const probe = new Zotero.Item("journalArticle");
                probe.libraryID = Zotero.Libraries.userLibraryID;
                probe.setField("title", "WV-TEST defatt coexist");
                await probe.saveTx();
                try {
                    await probe.getBestAttachment();
                    expect(theirsCalled).to.equal(true);
                }
                finally {
                    await probe.eraseTx();
                }
            }
            finally {
                // Restore a clean SINGLE wrapper for the rest of the suite:
                // drop ours, drop the competitor and the pre-existing wrapper
                // by going back to the pristine original, then wire once.
                wv._wvUnwireDefaultAttachment();
                if (typeof pristine === "function") {
                    proto.getBestAttachment = pristine;
                }
                else {
                    proto.getBestAttachment = theirs;
                }
                wv._wvWireDefaultAttachment();
                expect(proto.getBestAttachment).to.equal(proto._wvDefaultAttFn);
            }
        });
    });
});
