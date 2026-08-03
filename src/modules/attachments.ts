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

/** The marker tag: an EMOJI plus a single HYPHEN-JOINED slug.
 *
 *  Zotero renders the FIRST emoji sequence of a tag name in the items list
 *  (`Zotero.Tags.extractEmojiForItemsList`), so the leading emoji gives the
 *  chosen child a visible marker there — with no setup and without spending
 *  one of the nine colored-tag slots (six are already in use here). The slug
 *  never reaches the items list; it exists for the TAG SELECTOR and tag
 *  exports, where a bare glyph would be a mystery.
 *
 *  TWO NAMING RULES, both paid for by measured search leaks. Quick search is
 *  SUBSTRING-based AND splits the box on whitespace into independent AND-ed
 *  conditions (search.js `addCondition`, the `/^quicksearch/` branch), so:
 *
 *  1. NO "Weavero" IN THE TAG. It made every marked child match a genuine
 *     search for the user's own notes ABOUT Weavero — noise exactly where it
 *     hurts. It also made the bare two-word query "Weavero Default" match,
 *     since both words were substrings of the tag.
 *
 *  2. ONE TOKEN, HYPHEN-JOINED — never spaces. The splitter breaks on
 *     whitespace only, so a hyphenated slug stays a single condition and
 *     typing it matches nothing else in the library: strict-name-only, which
 *     is the point. A spaced name ("▶️ Weavero Default") did the opposite —
 *     it matched any item merely carrying both words ANYWHERE, even as two
 *     unrelated tags on an UNMARKED item.
 *
 *  Underscores are NOT a substitute for a hyphen here: `_` is a live SQL
 *  LIKE wildcard (Zotero passes search terms into LIKE with no ESCAPE
 *  clause), so an underscored name both over-matches and breaks the quoted
 *  phrase search.
 *
 *  3. THE SLUG IS NOT AN ENGLISH WORD, deliberately. The obvious readable
 *     slug ("wv-open-by-default") still leaked: substring matching means a
 *     one-word search for "default" found every marked child. "defatt"
 *     shares no substring with "default" — d-e-f-a-t-t vs d-e-f-a-u-l-t —
 *     so no ordinary word search reaches it. Legibility in the tag selector
 *     was traded away for this ON PURPOSE; do not "fix" it by spelling the
 *     slug out, which silently reopens the leak.
 *
 *  Cost, accepted: the tag selector shows a cryptic slug. The meaning is
 *  discoverable where users actually act — the item context menu ("Set as
 *  Default" / "Clear Default") and the prefs pane.
 *
 *  U+25B6 U+FE0F reads as "this is what opens", and avoids the emoji already
 *  in use in this library (U+2B50, U+203C U+FE0F).
 *
 *  WARNING: the tag IS the storage. Changing this constant orphans every
 *  already-marked child — cheap now, expensive after release. */
export const OPEN_BY_DEFAULT_TAG = "▶️ wv-defatt";

/** Zotero tag types: 0 = manual (user-typed), 1 = automatic (machine-added,
 *  hideable via the tag selector's Display Automatic toggle). */
const TAG_TYPE_AUTOMATIC = 1;

/** Save options for every marker write.
 *
 *  Date Modified is the USER's record of when they last edited an item. Which
 *  child Weavero opens is not such an edit, so marking one must not touch it —
 *  otherwise a sweep of choices silently rewrites the column, scrambling any
 *  Date Modified sort and any "modified since" workflow the user relies on.
 *
 *  `skipDateModifiedUpdate` leaves the column UNWRITTEN on an existing item
 *  (item.js `_saveData`: the column is only pushed when the flag is absent),
 *  rather than writing back the old value — so there is no rounding or
 *  timezone drift either.
 *
 *  Deliberately NOT paired with `skipSyncedUpdate`: that is a separate option
 *  (dataObject.js `_saveData`), so `synced` is still cleared and the marker
 *  still propagates to the user's other devices — which is the entire reason
 *  this feature stores its state in the library rather than in a JSON file. */
const MARKER_SAVE_OPTS = { skipDateModifiedUpdate: true };

/** Wiring version stamp — BUMP whenever a wrapper below changes.
 *
 *  Both markers live on objects that OUTLIVE the plugin (Zotero.Item
 *  .prototype, and the window's ZoteroPane), so they survive a plugin
 *  reload. A boolean marker would therefore make an updated build skip
 *  installation and leave the PREVIOUS build's wrapper in place — which
 *  then calls methods that may have been renamed, throws, and silently
 *  degrades to upstream behaviour. Cost me a debugging round on
 *  2026-08-03; a version stamp forces a clean unwire+rewire instead. */
const WIRE_VERSION = 6;

class _AttachmentsMixin {
    [k: string]: any;

    /** The marker tag, exposed so other bundles/tests don't hardcode it. */
    get _wvOpenByDefaultTag(): string {
        return OPEN_BY_DEFAULT_TAG;
    }

    /** Just the marker's EMOJI — the part Zotero renders in the items list.
     *
     *  Extracted from the tag with the SAME function the items list uses
     *  (`Zotero.Tags.extractEmojiForItemsList`), so anything showing the glyph
     *  in the UI shows exactly what the row shows. Falls back to "" rather
     *  than a hardcoded glyph: if the extraction ever stops matching, callers
     *  degrade to plain text instead of displaying a symbol the items list
     *  does NOT show, which would be worse than no symbol at all. */
    get _wvOpenByDefaultEmoji(): string {
        try {
            return Zotero.Tags.extractEmojiForItemsList(OPEN_BY_DEFAULT_TAG) || "";
        } catch (e) {
            return "";
        }
    }

    /** Append to the persistent trace ring for the default-child path.
     *
     *  The ring lives on the ZOTERO GLOBAL, not on the plugin instance. An
     *  instance-scoped tracer dies on every plugin reload — which is exactly
     *  when an intermittent report gets lost, so by the time someone asks
     *  "what happened?" there is nothing to read. Baked into the build and
     *  capped, so it can stay on indefinitely at negligible cost.
     *
     *  Deliberately NOT wired into the hot `getBestAttachment` path for every
     *  call: only decisions that could plausibly explain "it did nothing" are
     *  recorded, so the ring stays readable instead of drowning in noise.
     *
     *  Read it with `_wvDefAttTraceDump()`. */
    _wvDefAttTrace(ev: string, data?: any): void {
        try {
            const g: any = Zotero;
            const ring = g._wvDefAttLog || (g._wvDefAttLog = []);
            const row: any = { t: new Date().toISOString().slice(11, 23), ev };
            if (data) {
                for (const k of Object.keys(data)) row[k] = data[k];
            }
            ring.push(row);
            if (ring.length > 400) ring.splice(0, ring.length - 400);
        } catch (e) { /* tracing must never break the feature */ }
    }

    /** Read the trace ring (most recent `n` entries, or all). */
    _wvDefAttTraceDump(n?: number): any[] {
        try {
            const ring: any[] = (Zotero as any)._wvDefAttLog || [];
            return n ? ring.slice(-n) : ring.slice();
        } catch (e) {
            return [];
        }
    }

    /** Master switch for the feature (`weavero.enableDefaultChild`, ON).
     *
     *  Read at CALL time, never cached at wire time, so toggling it takes
     *  effect immediately — no reload, no re-wiring. The wrapper stays
     *  installed either way and simply stops overriding; that keeps the
     *  competitor-coexistence chain intact across a toggle.
     *
     *  OFF means "stop overriding", NOT "forget the choices": the marker tags
     *  stay on the children, so switching back on restores every pick. */
    _wvDefaultChildEnabled(): boolean {
        try {
            const v = Zotero.Prefs.get("weavero.enableDefaultChild");
            return v === undefined ? true : !!v;
        } catch (e) {
            return true;
        }
    }

    /** Is this child marked as the one to open? Cheap + synchronous, so it is
     *  safe from `popupshowing` handlers (which cannot await).
     *
     *  Deliberately NOT gated by the master switch — this reports what the
     *  LIBRARY says, which the migration and purge still need while the
     *  feature is off. The gate lives in `_wvGetDefaultChild`. */
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
            // THE gate for the master switch. Every override path funnels
            // through here — the getBestAttachment wrapper, the open helper,
            // and the menu's state — so one check disables the behaviour
            // everywhere without touching any wiring.
            if (!this._wvDefaultChildEnabled()) return null;
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
            if (!isAtt && !isNote) {
                this._wvDefAttTrace("set:reject", { key: child.key, why: "notOpenable" });
                return false;
            }

            const parent = child.parentID ? Zotero.Items.get(child.parentID) : null;
            if (parent) {
                for (const sib of this._wvOpenableChildren(parent)) {
                    if (sib.id === child.id) continue;
                    if (this._wvIsDefaultChild(sib)) {
                        sib.removeTag(OPEN_BY_DEFAULT_TAG);
                        await sib.saveTx(MARKER_SAVE_OPTS);
                    }
                }
            }

            if (!this._wvIsDefaultChild(child)) {
                child.addTag(OPEN_BY_DEFAULT_TAG, TAG_TYPE_AUTOMATIC);
                await child.saveTx(MARKER_SAVE_OPTS);
            }
            this._wvDefAttTrace("set:ok", {
                key: child.key, verified: this._wvIsDefaultChild(child),
                parent: parent && parent.key,
            });
            return true;
        } catch (e) {
            this._wvDefAttTrace("set:err", { key: child && child.key, e: String(e) });
            Zotero.debug("[Weavero] _wvSetDefaultChild err: " + e);
            return false;
        }
    }

    /** Remove the marker from `child` (no-op if not marked). */
    async _wvClearDefaultChild(child: any): Promise<boolean> {
        try {
            if (!child || !this._wvIsDefaultChild(child)) return false;
            child.removeTag(OPEN_BY_DEFAULT_TAG);
            await child.saveTx(MARKER_SAVE_OPTS);
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
            // Unwind ONLY when our wrapper is the outermost one. If another
            // plugin wrapped over us, restoring our stashed original would
            // silently delete THEIR patch — the same trap PikaPei's own
            // unpatch declines ("modified by another plugin after us,
            // skipping restore"). Ours then stays in the chain but is inert:
            // it resolves the live plugin at call time and falls straight
            // through once `_wvDestroyed` is set (or the global is gone).
            if (proto.getBestAttachment !== proto._wvDefaultAttFn) {
                Zotero.debug("[Weavero] getBestAttachment wrapped by another plugin "
                    + "after us — leaving the chain intact");
                return;
            }
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

    /** Hide (or restore) the rival plugin's duplicate items-menu entry.
     *
     *  PikaPei's Default Attachment adds its own "Set Default" entry. With
     *  both plugins enabled the menu shows two near-identical actions, and
     *  clicking theirs writes only THEIR pref — so no Weavero marker tag
     *  appears and the choice does not sync. A real user hit exactly that on
     *  2026-08-03 and reported the feature as broken.
     *
     *  Weavero's entry supersedes theirs (it covers notes and linked URLs
     *  too, and every selection that shows theirs also shows ours), so while
     *  Weavero's feature is ON we hide theirs. Element ids read from their
     *  v1.0.0 bundle: `${addonRef}-set-default-menuitem` / `-separator` with
     *  addonRef "defaultattachment".
     *
     *  TIMING: they set `hidden` themselves on EVERY popupshowing, so a hide
     *  from inside our own popupshowing handler only sticks if our listener
     *  happens to run after theirs — load-order dependent, the same trap as
     *  the getBestAttachment wrapper. Calling this from a MICROTASK instead
     *  runs it after every synchronous popupshowing listener has finished,
     *  but still before the popup paints, so it wins regardless of order and
     *  without a visible flicker.
     *
     *  Nothing needs to restore this on teardown in the normal case: once we
     *  stop hiding, their own popupshowing logic makes it visible again. The
     *  explicit `hide=false` path exists so a disable takes effect
     *  immediately rather than on the next right-click. */
    _wvHideRivalDefaultMenu(doc: any, hide: boolean): void {
        try {
            if (!doc) return;
            for (const id of ["defaultattachment-set-default-menuitem",
                              "defaultattachment-separator"]) {
                const el: any = doc.getElementById(id);
                if (el) el.hidden = !!hide;
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvHideRivalDefaultMenu err: " + e);
        }
    }

    /** Remove the items-menu entry and its listeners from `win`.
     *
     *  The listeners sit on `zotero-itemmenu`, a XUL element that OUTLIVES
     *  the plugin, so without this a disable leaves them attached: they would
     *  keep firing for a dead instance and re-adding the menu item. The
     *  wiring already stores its handler refs for exactly this reason (that
     *  is what makes a reload able to peel the previous build); teardown uses
     *  the same refs. */
    _wvUnwireDefaultChildMenu(win: any): void {
        try {
            const doc = win && win.document;
            if (!doc) return;
            const menu: any = doc.getElementById("zotero-itemmenu");
            if (!menu) return;
            if (menu._wvDefChildMenuHandlers) {
                try {
                    menu.removeEventListener("popupshowing",
                        menu._wvDefChildMenuHandlers.onShowing);
                    menu.removeEventListener("popuphidden",
                        menu._wvDefChildMenuHandlers.onHidden);
                } catch (e) {}
            }
            delete menu._wvDefChildMenuHandlers;
            delete menu._wvDefChildMenuWired;
            // A popup left open at disable time can still hold our entry.
            const stale = doc.getElementById("wv-itemmenu-open-by-default");
            if (stale) stale.remove();
            // Give the rival plugin its entry back immediately, rather than
            // leaving it hidden until its own next popupshowing restores it.
            this._wvHideRivalDefaultMenu(doc, false);
        } catch (e) {
            Zotero.debug("[Weavero] _wvUnwireDefaultChildMenu err: " + e);
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
            this._wvDefAttTrace("open:default", {
                parent: item.key, chosen: chosen.key,
                kind: (typeof chosen.isNote === "function" && chosen.isNote()) ? "note" : "attachment",
            });

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

    /** Re-assert our `getBestAttachment` wrapper whenever ANOTHER plugin
     *  starts or stops.
     *
     *  Weavero's own startup re-assert only covers plugins that were already
     *  loaded, and the 3s/10s timers only cover a window load. A competitor
     *  installed, enabled or updated LATER simply wraps on top of us and wins.
     *  Not hypothetical: verified 2026-08-03 against PikaPei's Default
     *  Attachment v1.0.0 — installed into a running Zotero after Weavero, it
     *  took the outermost slot and Weavero's pick stopped being honoured.
     *
     *  Zotero.Plugins notifies observers AFTER the other plugin's own
     *  bootstrap method has run and been awaited (plugins.js, the observer
     *  loop at the end of `_callMethod`), so by the time `startup` reaches us
     *  their patch is already installed and our re-assert lands above it —
     *  keeping theirs as our fallback rather than discarding it.
     *
     *  The observer is stored on `Zotero`, which outlives the plugin, so a
     *  reload can peel the previous build's copy instead of stacking one per
     *  reload. */
    _wvWirePluginObserver(): void {
        try {
            const P: any = Zotero.Plugins;
            if (!P || typeof P.addObserver !== "function") return;
            const g: any = Zotero;
            if (g._wvDefAttPluginObserver) {
                if (g._wvDefAttPluginObserverVer === WIRE_VERSION) return;
                try { P.removeObserver(g._wvDefAttPluginObserver); } catch (e) {}
            }
            const reassert = (params: any) => {
                try {
                    // Never react to ourselves: our own startup already wires.
                    if (params && params.id === "weavero@mjthoraval") return;
                    // Resolve the LIVE plugin — this observer outlives builds.
                    const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                    if (lp && !lp._wvDestroyed) lp._wvWireDefaultAttachment();
                } catch (e) {
                    Zotero.debug("[Weavero] plugin-observer re-assert err: " + e);
                }
            };
            const observer = { startup: reassert, shutdown: reassert };
            P.addObserver(observer);
            g._wvDefAttPluginObserver = observer;
            g._wvDefAttPluginObserverVer = WIRE_VERSION;
        } catch (e) {
            Zotero.debug("[Weavero] _wvWirePluginObserver err: " + e);
        }
    }

    /** Drop the plugin-lifecycle observer (shutdown path). */
    _wvUnwirePluginObserver(): void {
        try {
            const P: any = Zotero.Plugins;
            const g: any = Zotero;
            if (P && g._wvDefAttPluginObserver) {
                P.removeObserver(g._wvDefAttPluginObserver);
            }
            delete g._wvDefAttPluginObserver;
            delete g._wvDefAttPluginObserverVer;
        } catch (e) {
            Zotero.debug("[Weavero] _wvUnwirePluginObserver err: " + e);
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
        const result: any = { ran: false, found: 0, migrated: 0, skipped: 0 };
        try {
            // Feature off: skip WITHOUT setting the run-once guard, so the
            // import still happens if the user enables it later. Setting the
            // guard here would silently lose their PikaPei picks forever.
            if (!this._wvDefaultChildEnabled()) return result;
            if (Zotero.Prefs.get("weavero.defaultChildMigrated")) return result;
            result.ran = true;
            Object.assign(result, await this._wvImportLegacyMappings());
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

    /** Read the legacy pref and mark every entry it can, WITHOUT touching the
     *  run-once guard. Split out from the migration so the purge can re-run it
     *  immediately before deleting anything (see
     *  `_wvClearLegacyDefaultAttachments`) — the migration only runs once, so
     *  without this a purge could delete picks that were never imported.
     *
     *  Reports `unresolved` — entries that could NOT be turned into a Weavero
     *  mark, with the reason. These are the dangerous ones: their attachment
     *  is gone, trashed, or re-parented, so the legacy pref is the ONLY record
     *  of the user's choice. `skipped` counts them plus entries that were
     *  already marked (harmless). */
    async _wvImportLegacyMappings(): Promise<any> {
        const out: any = { found: 0, migrated: 0, skipped: 0, alreadyMarked: 0, unresolved: [] };
        let raw: any = null;
        try {
            // `true` = global pref name, matching how that plugin writes it.
            raw = Zotero.Prefs.get("extensions.zotero.defaultattachment.mappings", true);
        } catch (e) { /* pref absent — nothing to migrate */ }
        if (!raw) return out;

        let mappings: any = null;
        try { mappings = JSON.parse(String(raw)); } catch (e) {
            Zotero.debug("[Weavero] default-attachment migration: unparsable pref");
            // An unparsable pref is unresolved by definition: we cannot prove
            // anything was imported, so a purge must refuse.
            out.unresolved.push({ parentID: null, attID: null, reason: "unparsable" });
            return out;
        }
        if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) return out;

        for (const parentID of Object.keys(mappings)) {
            out.found++;
            const attID = mappings[parentID];
            try {
                const att = Zotero.Items.get(attID);
                // Validate before writing: the ids are LOCAL and may be stale
                // (item deleted, merged, or re-parented).
                let reason = "";
                if (!att) reason = "missing";
                else if (att.deleted) reason = "trashed";
                else if (String(att.parentID) !== String(parentID)) reason = "reparented";
                if (reason) {
                    out.skipped++;
                    out.unresolved.push({ parentID, attID, reason });
                    continue;
                }
                if (this._wvIsDefaultChild(att)) {
                    out.skipped++;
                    out.alreadyMarked++;
                    continue;
                }
                await this._wvSetDefaultChild(att);
                out.migrated++;
            } catch (e) {
                out.skipped++;
                out.unresolved.push({ parentID, attID, reason: "error" });
                Zotero.debug("[Weavero] migration entry err: " + e);
            }
        }
        return out;
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
     *  and can create new ones again.
     *
     *  VERIFY BEFORE DELETING. The pref is the ONLY record of those choices —
     *  local ids, nothing synced, no second copy — so clearing it is
     *  irreversible. Two ways picks could still be un-imported at this point,
     *  both real:
     *
     *    • migration runs ONCE, so any pick the old plugin made AFTER Weavero
     *      first started was never seen by it;
     *    • migration SKIPS entries whose attachment is missing, trashed or
     *      re-parented — a trashed attachment can be restored, and then the
     *      user would want that choice back.
     *
     *  So this re-imports first, then confirms every remaining entry now
     *  carries the Weavero marker, and REFUSES to clear if even one does not.
     *  Returns {cleared, total, imported, unresolved[]} — `cleared:false` with
     *  a populated `unresolved` means nothing was deleted. */
    async _wvClearLegacyDefaultAttachments(): Promise<any> {
        const res: any = { cleared: false, total: 0, imported: 0, unresolved: [] };
        try {
            res.total = this._wvLegacyDefaultAttachmentCount();
            if (!res.total) return res;

            // 1. Catch anything migration never saw (it runs once).
            const imp = await this._wvImportLegacyMappings();
            res.imported = imp.migrated;
            res.unresolved = imp.unresolved.slice();

            // 2. Independently re-verify EVERY entry against the live library,
            //    rather than trusting the import's own bookkeeping.
            const raw: any = Zotero.Prefs.get("extensions.zotero.defaultattachment.mappings", true);
            const mappings = raw ? JSON.parse(String(raw)) : null;
            if (mappings && typeof mappings === "object" && !Array.isArray(mappings)) {
                for (const parentID of Object.keys(mappings)) {
                    const attID = mappings[parentID];
                    let ok = false;
                    try {
                        const att = Zotero.Items.get(attID);
                        ok = !!att && this._wvIsDefaultChild(att);
                    } catch (e) { ok = false; }
                    if (!ok && !res.unresolved.some((u: any) => String(u.attID) === String(attID))) {
                        res.unresolved.push({ parentID, attID, reason: "unverified" });
                    }
                }
            }

            // 3. All accounted for, or nothing goes.
            if (res.unresolved.length) {
                Zotero.debug("[Weavero] legacy purge REFUSED: "
                    + res.unresolved.length + " of " + res.total + " not imported");
                return res;
            }
            Zotero.Prefs.clear("extensions.zotero.defaultattachment.mappings", true);
            res.cleared = true;
            Zotero.debug("[Weavero] cleared " + res.total + " legacy mapping(s) after verifying "
                + "each one carries the Weavero marker");
        } catch (e) {
            Zotero.debug("[Weavero] _wvClearLegacyDefaultAttachments err: " + e);
        }
        return res;
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
                    // Master switch: no entry at all when the feature is off,
                    // rather than an entry that marks something Weavero will
                    // then ignore.
                    if (!lp._wvDefaultChildEnabled()) {
                        lp._wvDefAttTrace("menu:skip", { why: "featureOff" });
                        return;
                    }
                    // Our entry supersedes the rival plugin's duplicate, so
                    // suppress theirs while this feature is on. Microtask, so
                    // it lands after THEIR popupshowing handler regardless of
                    // listener order. See _wvHideRivalDefaultMenu.
                    Promise.resolve().then(() => {
                        try {
                            const p: any = Zotero.Weavero && Zotero.Weavero.plugin;
                            if (!p || p._wvDestroyed || !p._wvDefaultChildEnabled()) return;
                            p._wvHideRivalDefaultMenu(doc, true);
                        } catch (e) { /* never break the menu */ }
                    });

                    const zp: any = win.ZoteroPane;
                    const sel: any[] = (zp && zp.getSelectedItems && zp.getSelectedItems()) || [];
                    if (sel.length !== 1) {
                        lp._wvDefAttTrace("menu:skip", { why: "selection", n: sel.length });
                        return;
                    }
                    const child = sel[0];
                    if (!child || !child.parentID) {               // must be a CHILD
                        lp._wvDefAttTrace("menu:skip", {
                            why: "notAChild",
                            key: child && child.key,
                            type: child && Zotero.ItemTypes.getName(child.itemTypeID),
                        });
                        return;
                    }
                    const isAtt = typeof child.isAttachment === "function" && child.isAttachment();
                    const isNote = typeof child.isNote === "function" && child.isNote();
                    if (!isAtt && !isNote) {
                        lp._wvDefAttTrace("menu:skip", { why: "notOpenable", key: child.key });
                        return;
                    }

                    // ACTION label (not a checkbox): the entry states what the
                    // click will DO, which reads better than a state label.
                    //
                    // The label carries the SAME emoji the marker tag puts in
                    // the items list, so the menu entry and the row marker are
                    // visibly the same thing. DERIVED from the tag rather than
                    // written out, so the two can never drift apart — this is
                    // the only place the glyph appears outside the tag itself.
                    const marked = lp._wvIsDefaultChild(child);
                    const glyph = lp._wvOpenByDefaultEmoji;
                    const mi = doc.createXULElement("menuitem");
                    mi.id = ID;
                    mi.setAttribute(
                        "label",
                        (glyph ? glyph + " " : "") + (marked ? "Clear Default" : "Set as Default")
                    );
                    mi.addEventListener("command", () => {
                        try {
                            // Re-resolve at click time: the selection can change
                            // between popupshowing and the command firing.
                            const p: any = Zotero.Weavero && Zotero.Weavero.plugin;
                            p && p._wvDefAttTrace("menu:command", {
                                key: child.key, wasMarked: marked, live: !!p,
                            });
                            if (!p) return;
                            p._wvToggleDefaultChild(child).then((now: boolean) => {
                                p._wvDefAttTrace("menu:command:done", {
                                    key: child.key, nowMarked: now,
                                    verified: p._wvIsDefaultChild(child),
                                });
                            }).catch((e: any) => {
                                p._wvDefAttTrace("menu:command:err", { e: String(e) });
                            });
                        } catch (e) {
                            const p: any = Zotero.Weavero && Zotero.Weavero.plugin;
                            p && p._wvDefAttTrace("menu:command:throw", { e: String(e) });
                            Zotero.debug("[Weavero] open-by-default command err: " + e);
                        }
                    });
                    menu.appendChild(mi);
                    lp._wvDefAttTrace("menu:added", {
                        key: child.key, marked, label: mi.getAttribute("label"),
                        kind: isNote ? "note" : "attachment",
                    });
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
