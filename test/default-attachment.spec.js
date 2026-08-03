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

    // ---- migration from PikaPei/zotero-default-attachment ----------

    // That plugin's ENTIRE state is one pref holding {parentID: attachmentID}
    // with LOCAL numeric ids — nothing synced, no second copy. Clearing it is
    // therefore irreversible, which is why the purge must prove every pick
    // reached Weavero first. These tests own that guarantee.
    describe("legacy purge", () => {
        const PREF = "extensions.zotero.defaultattachment.mappings";
        let parent, att, saved;

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
        });

        after(async () => {
            try {
                if (saved === undefined) Zotero.Prefs.clear(PREF, true);
                else Zotero.Prefs.set(PREF, saved, true);
            } catch (e) { /* leave as-is */ }
            for (const it of [att, parent]) {
                try { if (it) await it.eraseTx(); } catch (e) { /* already gone */ }
            }
        });

        it("counts what the old plugin stores", () => {
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            expect(wv._wvLegacyDefaultAttachmentCount()).to.equal(1);
        });

        it("imports a valid entry as a Weavero mark", async () => {
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            await wv._wvClearDefaultChild(att);
            const r = await wv._wvImportLegacyMappings();
            expect(r.migrated).to.equal(1);
            expect(r.unresolved).to.have.length(0);
            expect(wv._wvIsDefaultChild(att)).to.equal(true);
        });

        it("clears only after every pick carries the Weavero marker", async () => {
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            const r = await wv._wvClearLegacyDefaultAttachments();
            expect(r.cleared).to.equal(true);
            expect(r.unresolved).to.have.length(0);
            expect(Zotero.Prefs.get(PREF, true)).to.equal(undefined);
        });

        // Migration runs ONCE, so a pick made by the old plugin after Weavero
        // first started was never imported. The purge must import it rather
        // than delete it.
        it("imports a pick migration never saw, instead of deleting it", async () => {
            await wv._wvClearDefaultChild(att);
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            Zotero.Prefs.set("weavero.defaultChildMigrated", true);   // migration already done
            const r = await wv._wvClearLegacyDefaultAttachments();
            expect(r.imported).to.equal(1);
            expect(r.cleared).to.equal(true);
            expect(wv._wvIsDefaultChild(att)).to.equal(true);
        });

        // The dangerous case: an entry that CANNOT become a mark. Its
        // attachment may come back (restored from the trash), and the pref is
        // the only record, so nothing may be deleted.
        it("REFUSES to clear when an entry cannot be imported", async () => {
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: 999999999 }), true);
            const r = await wv._wvClearLegacyDefaultAttachments();
            expect(r.cleared).to.equal(false);
            expect(r.unresolved.length).to.be.above(0);
            // The proof that matters: the data is still there.
            expect(Zotero.Prefs.get(PREF, true)).to.be.a("string");
            expect(wv._wvLegacyDefaultAttachmentCount()).to.equal(1);
        });

        it("REFUSES to clear when the entry's attachment is trashed", async () => {
            Zotero.Prefs.set(PREF, JSON.stringify({ [parent.id]: att.id }), true);
            att.deleted = true;
            await att.saveTx();
            try {
                const r = await wv._wvClearLegacyDefaultAttachments();
                expect(r.cleared).to.equal(false);
                expect(Zotero.Prefs.get(PREF, true)).to.be.a("string");
            }
            finally {
                att.deleted = false;
                await att.saveTx();
            }
        });

        it("refuses on an unparsable pref rather than discarding it", async () => {
            Zotero.Prefs.set(PREF, "{not json", true);
            const r = await wv._wvClearLegacyDefaultAttachments();
            expect(r.cleared).to.equal(false);
            expect(Zotero.Prefs.get(PREF, true)).to.be.a("string");
        });

        it("does nothing (and reports nothing) when the pref is absent", async () => {
            Zotero.Prefs.clear(PREF, true);
            const r = await wv._wvClearLegacyDefaultAttachments();
            expect(r.cleared).to.equal(false);
            expect(r.total).to.equal(0);
            expect(r.unresolved).to.have.length(0);
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
