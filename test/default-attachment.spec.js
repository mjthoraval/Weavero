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

        // A marker is only readable on a CHILD — resolution walks a regular
        // item's children — and the context menu requires a parent, so a
        // marker written to a top-level attachment could never be cleared
        // through Weavero's UI. Found by audit 2026-08-04.
        it("refuses to mark a STANDALONE attachment (unreadable, unclearable)", async () => {
            const solo = new Zotero.Item("attachment");
            solo.libraryID = Zotero.Libraries.userLibraryID;
            solo.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
            solo.attachmentContentType = "application/pdf";
            solo.setField("title", "WV-TEST defatt standalone");
            await solo.saveTx();
            try {
                expect(await wv._wvSetDefaultChild(solo)).to.equal(false);
                expect(wv._wvIsDefaultChild(solo)).to.equal(false);
            }
            finally { await solo.eraseTx(); }
        });

        // The sweep that enforces "one marked child per parent" used to skip
        // TRASHED siblings, so a marked child could come back from the trash
        // alongside a newer pick — two markers, with the winner decided by
        // getAttachments() order, which flips with an unrelated sort pref.
        it("sweeps a TRASHED sibling's marker, so restoring it cannot double-mark", async () => {
            await wv._wvSetDefaultChild(fileAtt);
            fileAtt.deleted = true;
            await fileAtt.saveTx();
            try {
                await wv._wvSetDefaultChild(note);       // sweep must reach the trashed one
                expect(wv._wvIsDefaultChild(fileAtt)).to.equal(false);
                expect(wv._wvIsDefaultChild(note)).to.equal(true);
            }
            finally {
                fileAtt.deleted = false;
                await fileAtt.saveTx();
                await wv._wvClearDefaultChild(note);
            }
        });

        // The toggle used to return `true` unconditionally, so a write that
        // failed (read-only group library) was reported as success.
        it("toggle reports the LIVE state, not the intent", async () => {
            const on = await wv._wvToggleDefaultChild(fileAtt);
            expect(on).to.equal(wv._wvIsDefaultChild(fileAtt));
            expect(on).to.equal(true);
            const off = await wv._wvToggleDefaultChild(fileAtt);
            expect(off).to.equal(wv._wvIsDefaultChild(fileAtt));
            expect(off).to.equal(false);
        });

        // Zotero caches the parent's best-attachment state and clears it only
        // on child add/remove/file change — a tags-only save reaches none of
        // those, so the items-tree attachment column kept painting the OLD
        // pick until a restart.
        it("invalidates the parent's cached best-attachment state on set", async function () {
            if (typeof parent.getBestAttachmentState !== "function") this.skip();
            const second = new Zotero.Item("attachment");
            second.libraryID = Zotero.Libraries.userLibraryID;
            second.parentID = parent.id;
            second.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
            second.attachmentContentType = "application/epub+zip";
            second.setField("title", "WV-TEST defatt second file");
            await second.saveTx();
            try {
                await wv._wvSetDefaultChild(fileAtt);
                await parent.getBestAttachmentState();          // populate the cache
                await wv._wvSetDefaultChild(second);            // switch the pick
                const state = await parent.getBestAttachmentState();
                expect(state && state.key).to.equal(second.key);
            }
            finally {
                await wv._wvClearDefaultChild(second);
                await second.eraseTx();
            }
        });

        // -- getBestAttachment override ------------------------------

        it("getBestAttachment returns the marked FILE attachment", async () => {
            await wv._wvSetDefaultChild(fileAtt);
            const best = await parent.getBestAttachment();
            expect(best && best.id).to.equal(fileAtt.id);
            await wv._wvClearDefaultChild(fileAtt);
        });

        // A "Copy Open Link" bakes the chosen key into the URL, so getting
        // this wrong is permanent and travels to whoever the link is sent to.
        // `_openableAttachmentFor` (url.ts) is a third private replica of the
        // ranking and used to ignore the marker entirely.
        it("an Open link targets the chosen default, not the ranking", async function () {
            if (typeof wv._buildOpenLink !== "function") this.skip();
            const second = new Zotero.Item("attachment");
            second.libraryID = Zotero.Libraries.userLibraryID;
            second.parentID = parent.id;
            second.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
            second.attachmentContentType = "application/epub+zip";
            second.setField("title", "WV-TEST defatt link target");
            await second.saveTx();
            try {
                await wv._wvSetDefaultChild(second);
                expect(wv._buildOpenLink(parent)).to.contain(second.key);
                // A NOTE cannot be a zotero://open target — must fall through
                // to a real file rather than producing a dead link.
                await wv._wvSetDefaultChild(note);
                const noteLink = wv._buildOpenLink(parent);
                expect(noteLink).to.not.contain(note.key);
                expect(noteLink).to.contain(fileAtt.key);
            }
            finally {
                await wv._wvClearDefaultChild(note);
                await second.eraseTx();
            }
        });

        // The PLURAL is a separate upstream entry point, not a caller of the
        // singular: patching only the singular left the locate menu's "View
        // in Tab"/"View in Window", its external-viewer path and note
        // citation-with-locator jumps opening Zotero's heuristic pick, so one
        // item could open different files from different buttons. The pick is
        // HOISTED, not substituted, because callers walk the rest of the list.
        it("getBestAttachments (plural) hoists the pick to index 0, keeping the rest", async function () {
            if (typeof parent.getBestAttachments !== "function") this.skip();
            const second = new Zotero.Item("attachment");
            second.libraryID = Zotero.Libraries.userLibraryID;
            second.parentID = parent.id;
            second.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
            second.attachmentContentType = "application/epub+zip";
            second.setField("title", "WV-TEST defatt plural second");
            await second.saveTx();
            try {
                const before = await parent.getBestAttachments();
                if (before.length < 2) this.skip();
                await wv._wvSetDefaultChild(second);
                const after = await parent.getBestAttachments();
                expect(after[0] && after[0].id).to.equal(second.id);
                expect(after.length).to.equal(before.length);
                expect(after.map(a => a.id).sort()).to.deep.equal(before.map(a => a.id).sort());
            }
            finally {
                await wv._wvClearDefaultChild(second);
                await second.eraseTx();
            }
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

        // Detection ASKS, it does not act. Importing writes tags and queues
        // items for sync — not something to do uninvited, when the user may
        // only have been trying that plugin, or may prefer to keep using it.
        it("detects legacy data without importing or spending the guard", async () => {
            await wv._wvClearDefaultChild(att);
            Zotero.Prefs.clear("weavero.defaultChildMigrated");
            Zotero.Prefs.clear("weavero.defaultChildLegacyPending");
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            const r = await wv._wvMigrateDefaultAttachmentPlugin();
            expect(r.found).to.equal(1);
            expect(r.migrated).to.equal(0);
            expect(wv._wvIsDefaultChild(att), "nothing imported yet").to.equal(false);
            expect(Zotero.Prefs.get("weavero.defaultChildMigrated")).to.equal(undefined);
            expect(Number(Zotero.Prefs.get("weavero.defaultChildLegacyPending"))).to.equal(1);
        });

        // An EMPTY run must not spend the guard, or someone who installs
        // Weavero before the other plugin never gets asked at all.
        it("does not spend the guard when there is nothing to find", async () => {
            Zotero.Prefs.clear(PREF, true);
            Zotero.Prefs.clear("weavero.defaultChildMigrated");
            const r = await wv._wvMigrateDefaultAttachmentPlugin();
            expect(r.ran).to.equal(true);
            expect(r.found).to.equal(0);
            expect(Zotero.Prefs.get("weavero.defaultChildMigrated")).to.equal(undefined);
        });

        it("stops asking once answered", async () => {
            Zotero.Prefs.clear("weavero.defaultChildMigrated");
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            expect((await wv._wvMigrateDefaultAttachmentPlugin()).found).to.equal(1);
            await wv._wvApplyLegacyChoice("skip");
            expect(!!Zotero.Prefs.get("weavero.defaultChildMigrated")).to.equal(true);
            expect(Zotero.Prefs.get("weavero.defaultChildLegacyPending")).to.equal(undefined);
            expect((await wv._wvMigrateDefaultAttachmentPlugin()).ran).to.equal(false);
        });

        // ---- the three answers -------------------------------------

        it("'import' converts the picks into Weavero tags", async () => {
            await wv._wvClearDefaultChild(att);
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            const r = await wv._wvApplyLegacyChoice("import");
            expect(r.migrated).to.equal(1);
            expect(wv._wvIsDefaultChild(att)).to.equal(true);
            await wv._wvClearDefaultChild(att);
        });

        it("'skip' imports nothing — for someone who was only trying it", async () => {
            await wv._wvClearDefaultChild(att);
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            const r = await wv._wvApplyLegacyChoice("skip");
            expect(r.migrated).to.equal(0);
            expect(wv._wvIsDefaultChild(att)).to.equal(false);
        });

        it("'other' switches Weavero's feature off and imports nothing", async () => {
            await wv._wvClearDefaultChild(att);
            Zotero.Prefs.clear("weavero.enableDefaultChild");
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            try {
                const r = await wv._wvApplyLegacyChoice("other");
                expect(r.migrated).to.equal(0);
                expect(wv._wvDefaultChildEnabled(), "feature off").to.equal(false);
                expect(wv._wvIsDefaultChild(att), "nothing imported").to.equal(false);
            }
            finally {
                Zotero.Prefs.clear("weavero.enableDefaultChild");
            }
        });

        // "Keep using the other plugin" means "not now", NOT "never". Someone
        // who changes their mind must still be offered the import, or choosing
        // that option once would silently forfeit it forever.
        it("'other' leaves the offer open for when the user changes their mind", async () => {
            await wv._wvClearDefaultChild(att);
            Zotero.Prefs.clear("weavero.defaultChildMigrated");
            Zotero.Prefs.clear("weavero.enableDefaultChild");
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            try {
                await wv._wvApplyLegacyChoice("other");
                expect(Zotero.Prefs.get("weavero.defaultChildMigrated"),
                    "guard NOT spent").to.equal(undefined);
                // While off, detection stays quiet — no recurring prompt.
                expect((await wv._wvMigrateDefaultAttachmentPlugin()).ran).to.equal(false);
                // Turn it back on: the offer returns.
                Zotero.Prefs.clear("weavero.enableDefaultChild");
                const back = await wv._wvMigrateDefaultAttachmentPlugin();
                expect(back.ran).to.equal(true);
                expect(back.found).to.equal(1);
            }
            finally {
                Zotero.Prefs.clear("weavero.enableDefaultChild");
                Zotero.Prefs.clear("weavero.defaultChildLegacyPending");
            }
        });

        // The guarantee the whole coexistence story rests on.
        it("leaves the legacy pref byte-identical whichever answer is given", async () => {
            const map = JSON.stringify({ [parent.id]: att.id });
            for (const choice of ["import", "skip", "other"]) {
                Zotero.Prefs.set(PREF, map, true);
                await wv._wvClearDefaultChild(att);
                await wv._wvApplyLegacyChoice(choice);
                expect(Zotero.Prefs.get(PREF, true), choice).to.equal(map);
                Zotero.Prefs.clear("weavero.enableDefaultChild");
            }
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

        it("queues the question only when legacy data exists", async () => {
            Zotero.Prefs.clear("weavero.defaultChildLegacyPending");
            Zotero.Prefs.clear("weavero.defaultChildMigrated");
            Zotero.Prefs.clear(PREF, true);
            await wv._wvMigrateDefaultAttachmentPlugin();
            expect(Zotero.Prefs.get("weavero.defaultChildLegacyPending")).to.equal(undefined);
        });

        // A decision must not be answerable by a stray click, and ignoring it
        // must not silently choose anything — so the prompt renders buttons,
        // its body is inert, and the pending flag survives until one is used.
        it("prompts with buttons and stays pending until one is clicked", async () => {
            const win = Zotero.getMainWindow();
            const doc = win.document;
            Zotero.Prefs.clear("weavero.defaultChildMigrated");
            Zotero.Prefs.clear(PREF, true);
            // The enableDefaultChild watcher can raise a prompt of its own
            // when an earlier spec touches that pref — real behaviour, but it
            // would leave a stale element here and _wvShowLegacyPrompt
            // deliberately refuses to stack a second one. Start from a clean
            // slate so this asserts the prompt IT builds.
            const prior = doc.getElementById("wv-defatt-notice");
            if (prior) prior.remove();
            Zotero.Prefs.set("weavero.defaultChildLegacyPending", 2);
            try {
                await wv._wvShowLegacyPrompt(win);
                const el = doc.getElementById("wv-defatt-notice");
                expect(el, "prompt rendered").to.not.equal(null);
                expect(el.textContent).to.contain("2");
                const buttons = el.querySelectorAll("button");
                expect(buttons.length, "at least import + don't import")
                    .to.be.at.least(2);

                // clicking the BODY must not answer it
                el.click();
                expect(doc.getElementById("wv-defatt-notice"), "body click inert")
                    .to.not.equal(null);
                expect(Number(Zotero.Prefs.get("weavero.defaultChildLegacyPending")))
                    .to.equal(2);

                buttons[1].click();                     // "Don't import"
                expect(doc.getElementById("wv-defatt-notice"), "closed on answer")
                    .to.equal(null);
                expect(Zotero.Prefs.get("weavero.defaultChildLegacyPending"))
                    .to.equal(undefined);
                expect(!!Zotero.Prefs.get("weavero.defaultChildMigrated")).to.equal(true);
            }
            finally {
                const stale = doc.getElementById("wv-defatt-notice");
                if (stale) stale.remove();
                Zotero.Prefs.clear("weavero.defaultChildLegacyPending");
            }
        });

        it("offers the third option only when that plugin is actually running", () => {
            const win = Zotero.getMainWindow();
            const doc = win.document;
            const had = !!doc.getElementById("defaultattachment-set-default-menuitem");
            expect(wv._wvRivalDefaultPluginActive(win)).to.equal(had);
            expect(wv._wvRivalDefaultPluginActive(null)).to.equal(false);
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
    // ---- 6. reparent guard (upstream zotero#3333 parity) -----------------
    //
    // The marker tag TRAVELS with a child moved to a different parent, which
    // would silently make it the NEW parent's default. Upstream's relation
    // design clears the pick on reparent, and Weavero matches it with a
    // notifier-driven guard (_wvWireReparentGuard, 0.18.3-dev.17): a marked
    // child observed with a parent other than the cached one is stripped.
    // Four scenarios, each verified live 2026-08-05 before being locked here:
    // plain reparent, merge (adopted pick stripped / master's kept), move to
    // standalone and back (no silent resurrection), and move onto a parent
    // that already has its own pick (exactly one marked child survives).

    describe("reparent guard", () => {
        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
        async function waitCleared(item, timeout = 6000) {
            const t0 = Date.now();
            while (Date.now() - t0 < timeout) {
                if (!wv._wvIsDefaultChild(Zotero.Items.get(item.id))) return true;
                await sleep(200);
            }
            return !wv._wvIsDefaultChild(Zotero.Items.get(item.id));
        }
        async function mkParentWithNote(tag) {
            const lib = Zotero.Libraries.userLibraryID;
            const p = new Zotero.Item("journalArticle");
            p.libraryID = lib;
            p.setField("title", "WV-TEST reparent " + tag);
            await p.saveTx();
            const n = new Zotero.Item("note");
            n.libraryID = lib;
            n.parentID = p.id;
            n.setNote("WV-TEST reparent child " + tag);
            await n.saveTx();
            return { p, n };
        }
        const junk = [];
        after(async () => {
            for (const it of junk.reverse()) {
                try { if (Zotero.Items.get(it.id)) await it.eraseTx(); } catch (e) {}
            }
        });

        it("clears the pick when its child moves to another parent", async function () {
            this.timeout(20000);
            const a = await mkParentWithNote("plain-A");
            const b = await mkParentWithNote("plain-B");
            junk.push(a.p, a.n, b.p, b.n);
            expect(await wv._wvSetDefaultChild(a.n)).to.equal(true);
            a.n.parentID = b.p.id;
            await a.n.saveTx();
            expect(await waitCleared(a.n), "marker must clear on reparent").to.equal(true);
        });

        it("merge: master keeps its pick, the adopted pick arrives stripped", async function () {
            this.timeout(20000);
            const a = await mkParentWithNote("merge-A");
            const b = await mkParentWithNote("merge-B");
            junk.push(a.p, a.n, b.p, b.n);
            expect(await wv._wvSetDefaultChild(a.n)).to.equal(true);
            expect(await wv._wvSetDefaultChild(b.n)).to.equal(true);
            await Zotero.Items.merge(a.p, [b.p]);
            expect(await waitCleared(b.n), "adopted pick must be stripped").to.equal(true);
            expect(wv._wvIsDefaultChild(Zotero.Items.get(a.n.id)),
                "master's own pick must survive the merge").to.equal(true);
            const marked = a.p.getNotes(true)
                .filter(id => wv._wvIsDefaultChild(Zotero.Items.get(id)));
            expect(marked.length, "exactly one marked child after merge").to.equal(1);
        });

        it("move to standalone clears; moving back does not resurrect", async function () {
            this.timeout(20000);
            const a = await mkParentWithNote("standalone");
            junk.push(a.p, a.n);
            expect(await wv._wvSetDefaultChild(a.n)).to.equal(true);
            a.n.parentID = false;
            await a.n.saveTx();
            expect(await waitCleared(a.n), "marker must clear on move-out").to.equal(true);
            a.n.parentID = a.p.id;
            await a.n.saveTx();
            await sleep(1200);
            expect(wv._wvIsDefaultChild(Zotero.Items.get(a.n.id)),
                "returning must NOT silently restore the pick").to.equal(false);
        });

        it("moving a pick onto a parent with its own pick leaves exactly one", async function () {
            this.timeout(20000);
            const a = await mkParentWithNote("target");
            const c = await mkParentWithNote("mover");
            junk.push(a.p, a.n, c.p, c.n);
            expect(await wv._wvSetDefaultChild(a.n)).to.equal(true);
            expect(await wv._wvSetDefaultChild(c.n)).to.equal(true);
            c.n.parentID = a.p.id;
            await c.n.saveTx();
            expect(await waitCleared(c.n), "arriving pick must be stripped").to.equal(true);
            expect(wv._wvIsDefaultChild(Zotero.Items.get(a.n.id)),
                "target's own pick must survive").to.equal(true);
            const marked = a.p.getNotes(true)
                .filter(id => wv._wvIsDefaultChild(Zotero.Items.get(id)));
            expect(marked.length).to.equal(1);
        });
    });
});
