// Module: attachments — a user-chosen DEFAULT ATTACHMENT per item.
//
// Zotero opens `item.getBestAttachment()` on double-click, which is a fixed
// heuristic (PDF first, then URL-match, then oldest by dateAdded — see the
// replica in pane.ts:37). Users with a main paper plus supplementary PDFs
// often want a different one to open. This module lets them pick it.
//
// STORAGE — a DELIBERATE, DOCUMENTED EXCEPTION to Weavero's usual rule.
// Weavero's other stores (bookmarks.json, outlines.json, outline-eval.json)
// are Weavero-owned JSON files and write NOTHING to the user's library
// (see the HARD RULE at the top of outline-eval.ts). This feature is
// different on purpose: a default-attachment choice is only useful if it
// FOLLOWS THE USER ACROSS DEVICES, and Weavero's JSON stores are local and
// unsynced. So the choice is stored IN the library, as:
//
//     an AUTOMATIC (type 1) tag `wv-default-attachment`
//     on the CHOSEN ATTACHMENT itself
//
// Why a tag on the attachment, over the alternatives (all verified against a
// live Zotero 10 before choosing, 2026-08-03):
//   • Extra field  — synced, but a crowded shared namespace (Citation Key,
//     qid:, openalex.*, "Citegeist match ID:") and user-visible clutter.
//   • Child note   — synced but heavy and visible (Cita needs 6 notes for
//     294 citations).
//   • Relations with a custom predicate — invisible and semantically exact,
//     BUT custom predicates are undocumented (Zotero defines only
//     dc:relation / owl:sameAs / dc:replaces) and, while they persist
//     locally and appear in toJSON(), a sync-server round-trip was NOT
//     verified. Too risky to build persistence on.
//   • Tag on the attachment — documented, stable API; syncs and exports;
//     attachments are very rarely hand-tagged by users; and the mapping is
//     SELF-CLEANING (delete the attachment and the choice disappears with
//     it, unlike an out-of-band id map, which orphans).
//
// Type 1 = AUTOMATIC tag: the convention for machine-added tags, and the
// tag selector's "Display Automatic" toggle (`tagSelector.showAutomatic`)
// lets a user hide all of them at once. So the visibility cost is under the
// USER's control rather than hidden by us.
//
// KNOWN HAZARD (by design, not a bug): right-click → Delete Tag in the tag
// selector removes a tag from EVERY item at once, so one click can clear all
// default-attachment choices library-wide. Nothing can prevent that, so the
// feature must degrade gracefully: a missing tag simply means "no override",
// and Zotero's normal best-attachment heuristic applies. Never treat the
// absence of the tag as an error.
//
// DEGRADES WITHOUT WEAVERO: with the plugin uninstalled the tag is just an
// ordinary (automatic) tag, and Zotero opens its usual best attachment — no
// broken state, nothing to clean up.

declare const Zotero: any;

/** The marker tag. Namespaced with the project's `wv-` prefix, and
 *  deliberately distinctive so it is not mistaken for a user tag during
 *  tag tidy-ups. */
export const DEFAULT_ATTACHMENT_TAG = "wv-default-attachment";

/** Zotero tag types: 0 = manual (user-typed), 1 = automatic (machine-added,
 *  hideable via the tag selector's Display Automatic toggle). */
const TAG_TYPE_AUTOMATIC = 1;

class _AttachmentsMixin {
    [k: string]: any;

    /** The marker tag, exposed so other bundles/tests don't hardcode it. */
    get _wvDefaultAttachmentTag(): string {
        return DEFAULT_ATTACHMENT_TAG;
    }

    /** Is this attachment the user-chosen default? Cheap + synchronous, so
     *  it is safe from `popupshowing` handlers (which cannot await). */
    _wvIsDefaultAttachment(att: any): boolean {
        try {
            if (!att || typeof att.getTags !== "function") return false;
            const tags = att.getTags() || [];
            for (const t of tags) {
                if (t && t.tag === DEFAULT_ATTACHMENT_TAG) return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    /** The user-chosen default attachment of a regular item, or null.
     *
     *  Synchronous on purpose: it is called from the patched
     *  `getBestAttachment` and from menu builders. Trashed attachments are
     *  skipped so a deleted-but-not-purged choice doesn't win. If more than
     *  one sibling somehow carries the tag (see `_wvSetDefaultAttachment`
     *  for why that shouldn't happen), the first in Zotero's own child order
     *  wins — arbitrary but stable, never an error. */
    _wvGetDefaultAttachment(item: any): any {
        try {
            if (!item || typeof item.isRegularItem !== "function" || !item.isRegularItem()) {
                return null;
            }
            const ids = item.getAttachments() || [];
            for (const id of ids) {
                const att = Zotero.Items.get(id);
                if (!att) continue;
                if (att.deleted) continue;            // in the trash — ignore
                if (this._wvIsDefaultAttachment(att)) return att;
            }
            return null;
        } catch (e) {
            Zotero.debug("[Weavero] _wvGetDefaultAttachment err: " + e);
            return null;
        }
    }

    /** Mark `att` as its parent's default, clearing the tag from every
     *  sibling first.
     *
     *  Uniqueness is enforced HERE rather than at read time, because the tag
     *  is user-visible and user-editable: someone can copy it onto a second
     *  attachment by hand. Reads therefore stay tolerant (first wins) while
     *  every write we control leaves exactly one tagged sibling. */
    async _wvSetDefaultAttachment(att: any): Promise<boolean> {
        try {
            if (!att || typeof att.isAttachment !== "function" || !att.isAttachment()) return false;
            const parent = att.parentID ? Zotero.Items.get(att.parentID) : null;

            // Clear siblings first so an interrupted run can never leave two
            // defaults; worst case is none, which is a safe fallback state.
            if (parent && typeof parent.getAttachments === "function") {
                for (const id of parent.getAttachments() || []) {
                    if (id === att.id) continue;
                    const sib = Zotero.Items.get(id);
                    if (sib && this._wvIsDefaultAttachment(sib)) {
                        sib.removeTag(DEFAULT_ATTACHMENT_TAG);
                        await sib.saveTx();
                    }
                }
            }

            if (!this._wvIsDefaultAttachment(att)) {
                att.addTag(DEFAULT_ATTACHMENT_TAG, TAG_TYPE_AUTOMATIC);
                await att.saveTx();
            }
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _wvSetDefaultAttachment err: " + e);
            return false;
        }
    }

    /** Remove the default marker from `att` (no-op if it isn't marked). */
    async _wvClearDefaultAttachment(att: any): Promise<boolean> {
        try {
            if (!att || !this._wvIsDefaultAttachment(att)) return false;
            att.removeTag(DEFAULT_ATTACHMENT_TAG);
            await att.saveTx();
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _wvClearDefaultAttachment err: " + e);
            return false;
        }
    }

    /** Toggle: returns the new state (true = now the default). */
    async _wvToggleDefaultAttachment(att: any): Promise<boolean> {
        if (this._wvIsDefaultAttachment(att)) {
            await this._wvClearDefaultAttachment(att);
            return false;
        }
        await this._wvSetDefaultAttachment(att);
        return true;
    }

    /** Make Zotero honour the chosen attachment.
     *
     *  `ZoteroPane.viewItems()` opens a regular item via
     *  `await item.getBestAttachment()` (zoteroPane.js:5467-5471), so
     *  wrapping that ONE method covers double-click, Enter, and every other
     *  caller — no edits to Weavero's own pane/reader code, which keeps this
     *  feature to a single module.
     *
     *  Reload-proof by construction (see the wiring checklist): the wrapper
     *  closes over NOTHING from the plugin instance — it resolves the live
     *  `Zotero.Weavero.plugin` at CALL time, so it keeps working across
     *  plugin reloads and degrades to upstream behaviour if Weavero is gone.
     *  Idempotent via the `_wvDefaultAttPatched` marker, so calling it from
     *  every main-window load is free. */
    _wvWireDefaultAttachment(): void {
        try {
            const proto: any = Zotero.Item && Zotero.Item.prototype;
            if (!proto || proto._wvDefaultAttPatched) return;
            const orig = proto.getBestAttachment;
            if (typeof orig !== "function") return;

            proto._wvOrigGetBestAttachment = orig;
            proto.getBestAttachment = async function (this: any, ...args: any[]) {
                try {
                    const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                    if (lp && !lp._wvDestroyed) {
                        const chosen = lp._wvGetDefaultAttachment(this);
                        if (chosen) return chosen;
                    }
                } catch (e) {
                    // Never let our override break opening an item.
                    Zotero.debug("[Weavero] getBestAttachment override err: " + e);
                }
                return orig.apply(this, args);
            };
            proto._wvDefaultAttPatched = true;
            Zotero.debug("[Weavero] default-attachment override installed");
        } catch (e) {
            Zotero.debug("[Weavero] _wvWireDefaultAttachment err: " + e);
        }
    }

    /** Restore Zotero's own `getBestAttachment`. Only needed for a clean
     *  uninstall/test teardown — the wrapper already no-ops when Weavero is
     *  absent, so leaving it installed across a reload is harmless. */
    _wvUnwireDefaultAttachment(): void {
        try {
            const proto: any = Zotero.Item && Zotero.Item.prototype;
            if (!proto || !proto._wvDefaultAttPatched) return;
            if (typeof proto._wvOrigGetBestAttachment === "function") {
                proto.getBestAttachment = proto._wvOrigGetBestAttachment;
            }
            delete proto._wvOrigGetBestAttachment;
            delete proto._wvDefaultAttPatched;
        } catch (e) {
            Zotero.debug("[Weavero] _wvUnwireDefaultAttachment err: " + e);
        }
    }
}

const _attachmentsDescriptors = Object.getOwnPropertyDescriptors(_AttachmentsMixin.prototype);
delete (_attachmentsDescriptors as any).constructor;
export const attachmentsMethods = _attachmentsDescriptors;
