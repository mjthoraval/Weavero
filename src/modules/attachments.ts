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
//     an AUTOMATIC (type 1) tag on the CHOSEN CHILD, led by an emoji that
//     Zotero also renders in the items list (see the tag constant)
//
// COEXISTENCE: PikaPei/zotero-default-attachment patches the same
// getBestAttachment, and whoever wraps LAST wins. Load order is not ours to
// control, so we re-assert: if another wrapper appears on top of ours we
// wrap again over it, keeping it as our fallback. Weavero's pick wins; with
// no Weavero pick the other plugin still gets its say. See
// _wvWireDefaultAttachment.
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

/** The marker tag: an EMOJI followed by a self-describing name.
 *
 *  Zotero renders the FIRST emoji sequence of a tag name in the items list
 *  (`Zotero.Tags.extractEmojiForItemsList`), so the leading emoji gives the
 *  chosen child a visible marker there — with no setup and without spending
 *  one of the nine colored-tag slots (six are already in use here).
 *
 *  The text after the emoji never reaches the items list; it exists for the
 *  TAG SELECTOR and any tag export, where a bare emoji would be a mystery.
 *  It states both the meaning and the owner, so a user meeting this tag in
 *  a synced library knows what created it and why.
 *
 *  U+25B6 U+FE0F reads as "this is what opens", and avoids the emoji already
 *  in use in this library (U+2B50, U+203C U+FE0F).
 *
 *  WARNING: the tag IS the storage. Changing this constant orphans every
 *  already-marked child — cheap now, expensive after release. */
export const OPEN_BY_DEFAULT_TAG = "▶️ Weavero: Open by Default";

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
const WIRE_VERSION = 4;

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

            // Two reasons to (re)wire, checked together:
            //  • our stamp is stale  -> an older build's wrapper is installed
            //  • we are NOT outermost -> ANOTHER plugin wrapped over us after
            //    we loaded. PikaPei/zotero-default-attachment patches this very
            //    method, and whoever wraps LAST decides the winner. Plugin load
            //    order is not ours to control, so instead we re-assert: wrap
            //    whatever is on top now, keeping it as our fallback. Weavero's
            //    pick wins; with no Weavero pick, the other plugin still gets
            //    its say.
            const current = proto.getBestAttachment;
            if (typeof current !== "function") return;
            const weAreOutermost = current === proto._wvDefaultAttFn;
            if (proto._wvDefaultAttWired === WIRE_VERSION && weAreOutermost) return;

            // Only peel our own wrapper off when it is still the top one;
            // unwiring from underneath a foreign wrapper would break ITS chain.
            if (proto._wvDefaultAttWired && weAreOutermost) {
                this._wvUnwireDefaultAttachment();
            }
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
            // Remember OUR function so a later "are we still outermost?"
            // check can tell our wrapper from a foreign one.
            proto._wvDefaultAttFn = proto.getBestAttachment;
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
            delete proto._wvDefaultAttFn;
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

    // ---- Migration from PikaPei/zotero-default-attachment -----------------

    /** Import default-attachment choices from the older
     *  PikaPei/zotero-default-attachment plugin, so users switching to
     *  Weavero keep their picks.
     *
     *  That plugin stores everything OUT OF BAND, in one pref:
     *      extensions.zotero.defaultattachment.mappings
     *      -> JSON  { "<parentItemID>": <attachmentItemID>, ... }
     *  (verified against its src/modules/default-attachment.ts). Those are
     *  LOCAL numeric item IDs, not sync keys, so the mapping is only
     *  meaningful in the profile that wrote it — which is exactly why the
     *  original author's approach doesn't survive a restore or another
     *  machine, and why we convert it into a synced tag here.
     *
     *  Runs ONCE, guarded by `weavero.defaultChildMigrated`. Without that
     *  guard every startup would resurrect choices the user has since
     *  cleared, because the old pref is left untouched.
     *
     *  NON-DESTRUCTIVE: the old pref is deliberately NOT deleted, so the
     *  user can still roll back to that plugin. Note both plugins patch
     *  `getBestAttachment`, so they should not be left enabled together. */
    async _wvMigrateDefaultAttachmentPlugin(): Promise<any> {
        const result = { ran: false, found: 0, migrated: 0, skipped: 0 };
        try {
            if (Zotero.Prefs.get("weavero.defaultChildMigrated")) return result;
            result.ran = true;

            let raw: any = null;
            try {
                // `true` = global pref name, matching how that plugin writes it.
                raw = Zotero.Prefs.get("extensions.zotero.defaultattachment.mappings", true);
            } catch (e) { /* pref absent — nothing to migrate */ }

            if (raw) {
                let mappings: any = null;
                try { mappings = JSON.parse(String(raw)); } catch (e) {
                    Zotero.debug("[Weavero] default-attachment migration: unparsable pref");
                }
                if (mappings && typeof mappings === "object" && !Array.isArray(mappings)) {
                    for (const parentID of Object.keys(mappings)) {
                        result.found++;
                        try {
                            const attID = mappings[parentID];
                            const att = Zotero.Items.get(attID);
                            // Validate before writing: the ids are local and may
                            // be stale (item deleted, merged, or re-parented).
                            if (!att || att.deleted
                                || String(att.parentID) !== String(parentID)) {
                                result.skipped++;
                                continue;
                            }
                            if (this._wvIsDefaultChild(att)) { result.skipped++; continue; }
                            await this._wvSetDefaultChild(att);
                            result.migrated++;
                        } catch (e) {
                            result.skipped++;
                            Zotero.debug("[Weavero] migration entry err: " + e);
                        }
                    }
                }
            }

            Zotero.Prefs.set("weavero.defaultChildMigrated", true);
            if (result.found) {
                Zotero.debug("[Weavero] default-attachment migration: "
                    + result.migrated + " migrated, " + result.skipped + " skipped of "
                    + result.found);
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvMigrateDefaultAttachmentPlugin err: " + e);
        }
        return result;
    }

    /** How many legacy picks the old plugin still stores (0 when none/absent).
     *  Cheap and read-only — safe to call from a prefs pane to decide whether
     *  to offer the purge at all. */
    _wvLegacyDefaultAttachmentCount(): number {
        try {
            const raw: any = Zotero.Prefs.get("extensions.zotero.defaultattachment.mappings", true);
            if (!raw) return 0;
            const m = JSON.parse(String(raw));
            if (!m || typeof m !== "object" || Array.isArray(m)) return 0;
            return Object.keys(m).length;
        } catch (e) {
            return 0;
        }
    }

    /** Purge PikaPei/zotero-default-attachment's stored picks.
     *
     *  All of that plugin's state is ONE pref — the JSON map described in
     *  `_wvMigrateDefaultAttachmentPlugin` — so clearing it removes every
     *  legacy default in a single call. Nothing else of theirs persists: no
     *  tags, no item fields, no files.
     *
     *  Explicit user action ONLY. Migration deliberately leaves the pref
     *  intact so the user can roll back to that plugin; this is the opt-in
     *  tidy-up for when they are sure they are done with it.
     *
     *  NOTE: it does not touch Weavero's own marks — those already live as
     *  tags on the children — and it does not uninstall or disable the other
     *  plugin. If that plugin is still enabled it will simply have no picks,
     *  and can create new ones again. Returns how many were removed. */
    _wvClearLegacyDefaultAttachments(): number {
        const n = this._wvLegacyDefaultAttachmentCount();
        try {
            Zotero.Prefs.clear("extensions.zotero.defaultattachment.mappings", true);
            Zotero.debug("[Weavero] cleared " + n + " legacy default-attachment mapping(s)");
        } catch (e) {
            Zotero.debug("[Weavero] _wvClearLegacyDefaultAttachments err: " + e);
            return 0;
        }
        return n;
    }

    // ---- UI: the items-list context menu ---------------------------------

    /** Add "Open by Default" to a window's items-tree context menu.
     *
     *  Unlike the viewItems case, a SEPARATE `popupshowing` listener is safe
     *  here: listeners stack, and pane.ts's `_setupItemsMenuForWindow`
     *  de-dups only the handler IT tracks, so ours is never torn off.
     *
     *  Entry appears only when exactly ONE openable CHILD (attachment or
     *  note, with a parent) is selected — the only case where "default" is
     *  meaningful. Rendered as a checkbox so the current state is visible,
     *  and rebuilt on every open because the selection changes between
     *  opens; removed on popuphidden so no stale node is left in the DOM. */
    _wvWireDefaultChildMenu(win: any): void {
        try {
            const doc = win && win.document;
            if (!doc) return;
            const menu = doc.getElementById("zotero-itemmenu");
            if (!menu) return;
            if (menu._wvDefChildMenuWired === WIRE_VERSION) return;
            // Peel an older build's listener before re-adding.
            if (menu._wvDefChildMenuHandlers) {
                try {
                    menu.removeEventListener("popupshowing", menu._wvDefChildMenuHandlers.onShowing);
                    menu.removeEventListener("popuphidden", menu._wvDefChildMenuHandlers.onHidden);
                } catch (e) {}
            }
            const ID = "wv-itemmenu-open-by-default";

            const onShowing = () => {
                try {
                    const old = doc.getElementById(ID);
                    if (old) old.remove();
                    // Resolve the live plugin at EVENT time — never close over it.
                    const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                    if (!lp || lp._wvDestroyed) return;

                    const zp: any = win.ZoteroPane;
                    const sel: any[] = (zp && zp.getSelectedItems && zp.getSelectedItems()) || [];
                    if (sel.length !== 1) return;
                    const child = sel[0];
                    if (!child || !child.parentID) return;         // must be a CHILD
                    const isAtt = typeof child.isAttachment === "function" && child.isAttachment();
                    const isNote = typeof child.isNote === "function" && child.isNote();
                    if (!isAtt && !isNote) return;

                    // ACTION label (not a checkbox): the entry states what the
                    // click will DO, which reads better than a state label.
                    const marked = lp._wvIsDefaultChild(child);
                    const mi = doc.createXULElement("menuitem");
                    mi.id = ID;
                    mi.setAttribute("label", marked ? "Clear Default" : "Set as Default");
                    mi.addEventListener("command", () => {
                        try {
                            // Re-resolve at click time: the selection can change
                            // between popupshowing and the command firing.
                            const p: any = Zotero.Weavero && Zotero.Weavero.plugin;
                            if (p) p._wvToggleDefaultChild(child);
                        } catch (e) {
                            Zotero.debug("[Weavero] open-by-default command err: " + e);
                        }
                    });
                    menu.appendChild(mi);
                } catch (e) {
                    Zotero.debug("[Weavero] open-by-default popupshowing err: " + e);
                }
            };
            const onHidden = () => {
                try { const el = doc.getElementById(ID); if (el) el.remove(); } catch (e) {}
            };

            menu.addEventListener("popupshowing", onShowing);
            menu.addEventListener("popuphidden", onHidden);
            menu._wvDefChildMenuHandlers = { onShowing, onHidden };
            menu._wvDefChildMenuWired = WIRE_VERSION;
        } catch (e) {
            Zotero.debug("[Weavero] _wvWireDefaultChildMenu err: " + e);
        }
    }
}

const _attachmentsDescriptors = Object.getOwnPropertyDescriptors(_AttachmentsMixin.prototype);
delete (_attachmentsDescriptors as any).constructor;
export const attachmentsMethods = _attachmentsDescriptors;
