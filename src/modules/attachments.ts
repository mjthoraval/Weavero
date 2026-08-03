// Module: attachments — a user-chosen DEFAULT CHILD to open for an item.
//
// Zotero opens `item.getBestAttachment()` on double-click, a fixed heuristic
// (PDF first, then URL-match, then oldest by dateAdded — replica in
// pane.ts:37). Users with a main paper plus supplementary files often want
// something else to open. This module lets them pick it, and the choice is
// NOT limited to PDFs: any openable child qualifies —
//
//   • file attachments, PDF *and* non-PDF (EPUB, HTML snapshot, image, …)
//   • LINK attachments (linked URL / linked file)
//   • CHILD NOTES
//
// STORAGE — a DELIBERATE, DOCUMENTED EXCEPTION to Weavero's usual rule.
// Weavero's other stores (bookmarks.json, outlines.json, outline-eval.json)
// are Weavero-owned JSON files that write NOTHING to the user's library
// (see the HARD RULE atop outline-eval.ts). This feature is different on
// purpose: the choice is only useful if it FOLLOWS THE USER ACROSS DEVICES,
// and those JSON stores are local and unsynced. So it lives in the library:
//
//     an AUTOMATIC (type 1) tag `wv-open-by-default` on the CHOSEN CHILD
//
// Chosen over the alternatives (all checked against a live Zotero 10 first):
//   • Extra field — synced, but a crowded shared namespace (Citation Key,
//     qid:, openalex.*, "Citegeist match ID:") and visible clutter.
//   • Child note — heavy and visible (Cita needs 6 notes for 294 citations).
//   • Relation with a custom predicate — invisible and semantically exact,
//     but custom predicates are undocumented (Zotero defines only
//     dc:relation / owl:sameAs / dc:replaces); they persist locally and
//     appear in toJSON(), yet a sync-server round-trip could NOT be
//     verified. Too risky to build persistence on.
//   • Tag on the child — documented, stable API; syncs and exports; children
//     are rarely hand-tagged; and it is SELF-CLEANING (delete the child and
//     the choice goes with it, unlike an id map, which orphans).
//
// Type 1 = AUTOMATIC tag: the convention for machine-added tags, and the tag
// selector's "Display Automatic" toggle lets the user hide them all at once,
// so the visibility cost is under the USER's control rather than hidden.
//
// KNOWN HAZARD (by design): tag-selector → Delete Tag removes a tag from
// EVERY item at once, so one click can clear all choices library-wide.
// Nothing can prevent that, so absence of the tag must ALWAYS mean simply
// "no override" — never an error state.
//
// TWO HOOKS, deliberately:
//   1. `Zotero.Item.prototype.getBestAttachment` — covers every caller
//      (Weavero's own code, other plugins, toolbar actions). Overridden ONLY
//      when the chosen child is a real FILE attachment, because callers of
//      this method expect a file: handing back a note or a linked URL would
//      break them.
//   2. `_wvTryOpenDefaultChild`, called from Weavero's EXISTING
//      `ZoteroPane.viewItems` wrapper in reader.ts. Handles ALL child kinds
//      (notes -> openNote, everything else -> viewAttachment). NOT a second
//      viewItems patch: reader.ts re-wires from a cached pristine original,
//      so a stacked wrapper would be silently discarded.
//
// DEGRADES WITHOUT WEAVERO: uninstall and the tag is just an ordinary
// automatic tag; Zotero opens its usual best attachment. Nothing to repair.

declare const Zotero: any;

/** The marker tag. Namespaced with the project's `wv-` prefix and named for
 *  the behaviour (not "attachment"), since a NOTE can be the chosen child. */
export const OPEN_BY_DEFAULT_TAG = "wv-open-by-default";

/** Zotero tag types: 0 = manual (user-typed), 1 = automatic (machine-added,
 *  hideable via the tag selector's Display Automatic toggle). */
const TAG_TYPE_AUTOMATIC = 1;

/** Wiring version stamp — BUMP whenever a wrapper below changes.
 *
 *  Both markers live on objects that OUTLIVE the plugin (Zotero.Item
 *  .prototype, and the window's ZoteroPane), so they survive a plugin
 *  reload. A boolean marker would therefore make an updated build skip
 *  installation and leave the PREVIOUS build's wrapper in place — which
 *  then calls methods that may have been renamed, throws, and silently
 *  degrades to upstream behaviour. Cost me a debugging round on
 *  2026-08-03; a version stamp forces a clean unwire+rewire instead. */
const WIRE_VERSION = 3;

class _AttachmentsMixin {
    [k: string]: any;

    /** The marker tag, exposed so other bundles/tests don't hardcode it. */
    get _wvOpenByDefaultTag(): string {
        return OPEN_BY_DEFAULT_TAG;
    }

    /** Is this child marked as the one to open? Cheap + synchronous, so it is
     *  safe from `popupshowing` handlers (which cannot await). */
    _wvIsDefaultChild(child: any): boolean {
        try {
            if (!child || typeof child.getTags !== "function") return false;
            for (const t of child.getTags() || []) {
                if (t && t.tag === OPEN_BY_DEFAULT_TAG) return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    /** Every openable child of a regular item, notes included, in a stable
     *  order (attachments first, then notes — matching how the item pane
     *  lists them). Trashed children are skipped. */
    _wvOpenableChildren(item: any): any[] {
        const out: any[] = [];
        try {
            if (!item || typeof item.isRegularItem !== "function" || !item.isRegularItem()) {
                return out;
            }
            const ids = ([] as any[])
                .concat(item.getAttachments() || [])
                .concat(item.getNotes() || []);
            for (const id of ids) {
                const c = Zotero.Items.get(id);
                if (!c || c.deleted) continue;      // in the trash — ignore
                out.push(c);
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvOpenableChildren err: " + e);
        }
        return out;
    }

    /** The user-chosen child to open, or null.
     *
     *  Synchronous on purpose (called from the patched `getBestAttachment`
     *  and from menu builders). If more than one sibling somehow carries the
     *  tag — possible, since the tag is user-editable — the first in the
     *  stable order wins: arbitrary but deterministic, never an error. */
    _wvGetDefaultChild(item: any): any {
        try {
            for (const c of this._wvOpenableChildren(item)) {
                if (this._wvIsDefaultChild(c)) return c;
            }
            return null;
        } catch (e) {
            Zotero.debug("[Weavero] _wvGetDefaultChild err: " + e);
            return null;
        }
    }

    /** True when `child` is a FILE attachment — i.e. something callers of
     *  `getBestAttachment` can safely treat as a file. Notes and linked URLs
     *  are excluded: they are openable, but not files. */
    _wvIsFileAttachment(child: any): boolean {
        try {
            if (!child || typeof child.isAttachment !== "function" || !child.isAttachment()) {
                return false;
            }
            return child.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL;
        } catch (e) {
            return false;
        }
    }

    /** Mark `child` (attachment OR note) as the one to open for its parent,
     *  clearing the marker from every sibling first.
     *
     *  Uniqueness is enforced on WRITE rather than READ because the tag is
     *  user-visible and user-editable: someone can copy it onto a second
     *  child by hand. Reads stay tolerant (first wins) while every write we
     *  control leaves exactly one marked sibling. Siblings are cleared FIRST
     *  so an interrupted run can never leave two marked — worst case none,
     *  which is a safe fallback. */
    async _wvSetDefaultChild(child: any): Promise<boolean> {
        try {
            if (!child) return false;
            const isAtt = typeof child.isAttachment === "function" && child.isAttachment();
            const isNote = typeof child.isNote === "function" && child.isNote();
            if (!isAtt && !isNote) return false;

            const parent = child.parentID ? Zotero.Items.get(child.parentID) : null;
            if (parent) {
                for (const sib of this._wvOpenableChildren(parent)) {
                    if (sib.id === child.id) continue;
                    if (this._wvIsDefaultChild(sib)) {
                        sib.removeTag(OPEN_BY_DEFAULT_TAG);
                        await sib.saveTx();
                    }
                }
            }

            if (!this._wvIsDefaultChild(child)) {
                child.addTag(OPEN_BY_DEFAULT_TAG, TAG_TYPE_AUTOMATIC);
                await child.saveTx();
            }
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _wvSetDefaultChild err: " + e);
            return false;
        }
    }

    /** Remove the marker from `child` (no-op if not marked). */
    async _wvClearDefaultChild(child: any): Promise<boolean> {
        try {
            if (!child || !this._wvIsDefaultChild(child)) return false;
            child.removeTag(OPEN_BY_DEFAULT_TAG);
            await child.saveTx();
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _wvClearDefaultChild err: " + e);
            return false;
        }
    }

    /** Toggle; returns the new state (true = now the default). */
    async _wvToggleDefaultChild(child: any): Promise<boolean> {
        if (this._wvIsDefaultChild(child)) {
            await this._wvClearDefaultChild(child);
            return false;
        }
        await this._wvSetDefaultChild(child);
        return true;
    }

    // ---- Hook 1: getBestAttachment (file attachments only) ----------------

    /** Make every `getBestAttachment` caller honour a chosen FILE attachment.
     *
     *  Reload-proof by construction: the wrapper closes over NOTHING from the
     *  plugin instance — it resolves the live `Zotero.Weavero.plugin` at CALL
     *  time, so it survives plugin reloads and degrades to upstream behaviour
     *  if Weavero is gone. Idempotent via the `_wvDefaultAttWired` version
     *  stamp, which also forces a rewire when an older build's wrapper is
     *  still installed after a plugin reload.
     *
     *  Notes and linked URLs are intentionally NOT returned here (callers
     *  expect a file); `viewItems` handles those. */
    _wvWireDefaultAttachment(): void {
        try {
            const proto: any = Zotero.Item && Zotero.Item.prototype;
            if (!proto) return;
            if (proto._wvDefaultAttWired === WIRE_VERSION) return;   // already current
            // A stamp from an OLDER build means a stale wrapper is installed
            // (the marker outlives the plugin) — peel it off before rewiring.
            if (proto._wvDefaultAttWired) this._wvUnwireDefaultAttachment();
            const orig = proto.getBestAttachment;
            if (typeof orig !== "function") return;

            proto._wvOrigGetBestAttachment = orig;
            proto.getBestAttachment = async function (this: any, ...args: any[]) {
                try {
                    const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                    if (lp && !lp._wvDestroyed) {
                        const chosen = lp._wvGetDefaultChild(this);
                        if (chosen && lp._wvIsFileAttachment(chosen)) return chosen;
                    }
                } catch (e) {
                    // Never let the override break opening an item.
                    Zotero.debug("[Weavero] getBestAttachment override err: " + e);
                }
                return orig.apply(this, args);
            };
            proto._wvDefaultAttWired = WIRE_VERSION;
            Zotero.debug("[Weavero] default-child override installed (v" + WIRE_VERSION + ")");
        } catch (e) {
            Zotero.debug("[Weavero] _wvWireDefaultAttachment err: " + e);
        }
    }

    /** Restore Zotero's own `getBestAttachment` (uninstall/test teardown). */
    _wvUnwireDefaultAttachment(): void {
        try {
            const proto: any = Zotero.Item && Zotero.Item.prototype;
            if (!proto || !proto._wvDefaultAttWired) return;
            if (typeof proto._wvOrigGetBestAttachment === "function") {
                proto.getBestAttachment = proto._wvOrigGetBestAttachment;
            }
            delete proto._wvOrigGetBestAttachment;
            delete proto._wvDefaultAttWired;
        } catch (e) {
            Zotero.debug("[Weavero] _wvUnwireDefaultAttachment err: " + e);
        }
    }

    // ---- Hook 2: cooperative, inside Weavero's OWN viewItems wrapper ----

    /** Open the chosen child, if any. Returns true when it handled the open.
     *
     *  This is NOT a separate `viewItems` patch. Weavero already wraps
     *  `ZoteroPane.viewItems` in reader.ts (_wvSetupMultiOpenConsolidation),
     *  and that wrapper CACHES the pristine original
     *  (`orig = ZP._wvOrigViewItems || ZP.viewItems`) and re-wires from it —
     *  so a second wrapper layered on top is silently DISCARDED the next time
     *  reader.ts re-wires. Stacking cannot work; cooperating can. reader.ts
     *  therefore calls this helper at the top of its wrapper.
     *  (Diagnosed the hard way, 2026-08-03.)
     *
     *  Only the single-item case is intercepted: that is the double-click /
     *  Enter path this feature is about. Multi-item opens keep reader.ts's
     *  existing consolidation behaviour untouched. */
    async _wvTryOpenDefaultChild(zp: any, items: any[], event: any, options: any): Promise<boolean> {
        try {
            if (!zp || !Array.isArray(items) || items.length !== 1) return false;
            const item = items[0];
            if (!item || typeof item.isRegularItem !== "function" || !item.isRegularItem()) return false;
            const chosen = this._wvGetDefaultChild(item);
            if (!chosen) return false;

            if (typeof chosen.isNote === "function" && chosen.isNote()) {
                // The ONLY correct way to open a note tab — a bare
                // Zotero_Tabs.add({type:"note"}) yields an editor-less shell.
                await zp.openNote(chosen.id, { openInWindow: false });
            }
            else {
                // Handles non-PDF files AND linked URLs.
                await zp.viewAttachment(
                    chosen.id, event, options && options.noLocateOnMissing, options,
                );
            }
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _wvTryOpenDefaultChild err: " + e);
            return false;   // fall through to normal opening
        }
    }
}

const _attachmentsDescriptors = Object.getOwnPropertyDescriptors(_AttachmentsMixin.prototype);
delete (_attachmentsDescriptors as any).constructor;
export const attachmentsMethods = _attachmentsDescriptors;
