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
 *  LANDSCAPE — full dated chronology + the audit of MJT's precursor A&T
 *  script are PUBLIC: docs/default-attachment.md (published at
 *  mjthoraval.github.io/Weavero/default-attachment; private
 *  posting plan stays in ../../work/defatt-history-and-audit.md). Code
 *  comments keep constraints, not history. The facts a maintainer of
 *  THIS file needs:
 *
 *  - The native arbiter is ONE SQL ordering (item.js getBestAttachments):
 *    `contentType='application/pdf' DESC, url=parentURL DESC, dateAdded
 *    ASC`. Every prior solution manipulates or wraps exactly that.
 *  - MJT's A&T script (2026-04, discussion #602) EXPLOITED it (URL +
 *    dateAdded edits — plugin-free at open time, but destructive; the
 *    audit's core finding is its unrecorded date mutations). This module
 *    descends from that lineage and chose the opposite trade:
 *    non-destructive tag + wrapper, graceful heuristic fallback without
 *    the plugin, NO library field ever edited.
 *  - UPSTREAM zotero#3333 ("Primary Attachment", stalled on sync-server
 *    work) drove clear-on-reparent, the plural==singular invariant, and
 *    the getAttachments hoist. Wording stays deliberately DISTINCT (our
 *    "Default" vs their "Primary"); merge contingency in
 *    work/upstream-collision-checklist.md.
 *  - PikaPei's plugin stores LOCAL numeric-itemID prefs (no sync) — see
 *    the migration section below; we import, never touch.
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
const WIRE_VERSION = 9;   // 9: hoist + ▷ marker; 8: reparent guard; 7: plural

// Reentrancy latch for the getAttachments hoist: the automatic-winner
// computation itself calls getAttachments, and the wrap must serve THAT
// call raw (sync, single-threaded, so a module flag suffices).
let _wvHoistBusy = false;

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
     *  LIBRARY says, which the migration still needs while the feature is
     *  off. The gate lives in `_wvGetDefaultChild`. */
    _wvIsDefaultChild(child: any): boolean {
        try {
            // `hasTag` over `getTags`: upstream's getTags() deep-clones the
            // whole tag array (JSON round-trip, item.js), and this runs for
            // EVERY child on every resolution -- which the item pane triggers
            // 2-3 times per selection change, plus once per row when the
            // items-tree best-attachment cache is cold. hasTag() answers the
            // same question with no serialization; the tag TYPE is not part
            // of the check (a hand-typed marker counts too, deliberately).
            if (!child) return false;
            if (typeof child.hasTag === "function") {
                return !!child.hasTag(OPEN_BY_DEFAULT_TAG);
            }
            if (typeof child.getTags !== "function") return false;
            for (const t of child.getTags() || []) {
                if (t && t.tag === OPEN_BY_DEFAULT_TAG) return true;
            }
            return false;
        } catch (e) {
            // An item whose tags are not loaded THROWS here (upstream
            // _requireData); swallowing it silently reads as "no override" --
            // the exact "it did nothing" report the trace ring exists for.
            // Rare (a freshly-fetched item in a never-browsed library), and
            // this path is synchronous by design so it cannot await a load;
            // but it must leave evidence.
            if ((e as any) && (e as any).name === "UnloadedDataException") {
                this._wvDefAttTrace("unloadedData", { key: child && child.key, what: "tags" });
            }
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
            // Same evidence rule as `_wvIsDefaultChild`: unloaded childItems
            // must not silently become "this item has no children".
            if ((e as any) && (e as any).name === "UnloadedDataException") {
                this._wvDefAttTrace("unloadedData", { key: item && item.key, what: "childItems" });
            }
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

    /** Does `child`'s PARENT already carry a Weavero default on any sibling?
     *
     *  Deliberately NOT routed through `_wvGetDefaultChild`, which is gated by
     *  the master switch: the migration must see the library's real state even
     *  while the feature is switched off, or an import run with the feature
     *  off would conclude "no Weavero choice here" and overwrite one. Reads
     *  through the ungated `_wvIsDefaultChild` instead. */
    _wvParentHasDefault(child: any): boolean {
        try {
            const parent = child && child.parentID ? Zotero.Items.get(child.parentID) : null;
            if (!parent) return false;
            for (const c of this._wvOpenableChildren(parent)) {
                if (this._wvIsDefaultChild(c)) return true;
            }
            return false;
        } catch (e) {
            return false;
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

            // A marker is only meaningful on a CHILD: resolution walks a
            // regular item's children, so a tag written to a top-level
            // attachment/note could never be read back -- and the context
            // menu (which requires a parent) would offer no way to clear it.
            if (!child.parentID) {
                this._wvDefAttTrace("set:reject", { key: child.key, why: "noParent" });
                return false;
            }
            const parent = Zotero.Items.get(child.parentID);
            if (parent) {
                // Sweep INCLUDING trashed siblings. `_wvOpenableChildren`
                // skips the trash, so a marked attachment sitting in the
                // trash survived the sweep and came back marked when
                // restored -- two marked siblings, with the winner decided by
                // `getAttachments()` order, which itself flips with the
                // sortAttachmentsChronologically pref. The user's newest
                // deliberate pick could lose to a resurrected one.
                const sibIds = ([] as any[])
                    .concat(parent.getAttachments ? (parent.getAttachments(true) || []) : [])
                    .concat(parent.getNotes ? (parent.getNotes(true) || []) : []);
                for (const sid of sibIds) {
                    if (sid === child.id) continue;
                    const sib = Zotero.Items.get(sid);
                    if (!sib) continue;
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
            // Zotero caches the parent's best-attachment state and only
            // clears it on child add/remove/file change -- a tags-only save
            // reaches none of those paths. Without this the items-tree
            // attachment column keeps painting the OLD pick's type and
            // file-exists dot until a restart.
            try { if (parent && parent.clearBestAttachmentState) parent.clearBestAttachmentState(); } catch (e) {}
            // Reparent-guard cache: remember which parent this pick belongs to.
            try { (Zotero as any)._wvDefattParentCache && (Zotero as any)._wvDefattParentCache.set(child.id, child.parentItemID || null); } catch (e) {}
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
            // Same stale-cache reason as in the setter.
            try {
                const parent = child.parentID ? Zotero.Items.get(child.parentID) : null;
                if (parent && parent.clearBestAttachmentState) parent.clearBestAttachmentState();
            } catch (e) {}
            try { (Zotero as any)._wvDefattParentCache && (Zotero as any)._wvDefattParentCache.delete(child.id); } catch (e) {}
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _wvClearDefaultChild err: " + e);
            return false;
        }
    }

    /** Toggle; returns the LIVE new state (true = now the default).
     *
     *  Reports what actually happened, never what was intended: a write can
     *  fail (a read-only group library throws "Cannot edit item in library"),
     *  and returning an optimistic `true` made the caller record a marked
     *  state that does not exist -- the trace ring showed
     *  `nowMarked:true, verified:false` on the same line. */
    async _wvToggleDefaultChild(child: any): Promise<boolean> {
        if (this._wvIsDefaultChild(child)) {
            await this._wvClearDefaultChild(child);
            return this._wvIsDefaultChild(child);
        }
        await this._wvSetDefaultChild(child);
        return this._wvIsDefaultChild(child);
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
            // Registry of EVERY wrapper this module has ever installed (Set on
            // the prototype, so it survives reloads). Needed because the rival
            // plugin's unpatch restores whatever IT stashed as "the original"
            // -- which, after one of our re-asserts, is a PREVIOUS Weavero
            // wrapper. Comparing only against the most recent `_wvDefaultAttFn`
            // misread that as a foreign wrapper and wrapped again, adding one
            // live layer per disable->enable cycle of the other plugin (audit
            // 2026-08-04). Any of our wrappers is functionally current (they
            // close over nothing and live-resolve the plugin), so when the top
            // is OURS-BUT-OLDER we simply adopt it instead of stacking.
            const fns: Set<any> = proto._wvDefaultAttFns || (proto._wvDefaultAttFns = new Set());
            const topIsOurs = current === proto._wvDefaultAttFn || fns.has(current);
            if (proto._wvDefaultAttWired === WIRE_VERSION && topIsOurs) {
                proto._wvDefaultAttFn = current;
                return;
            }
            const weAreOutermost = current === proto._wvDefaultAttFn;

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
                        // Derived-fields layer: resident pickID, per-id
                        // notifier invalidation (2026-08-06).
                        const dp = lp._wvDefattDerived(this).pickID;
                        const chosen = dp != null ? Zotero.Items.get(dp) : null;
                        if (chosen && lp._wvIsFileAttachment(chosen)) return chosen;
                    }
                } catch (e) {
                    // Never let the override break opening an item.
                    Zotero.debug("[Weavero] getBestAttachment override err: " + e);
                }
                return orig.apply(this, args);
            };
            // Remember OUR function so a later "are we still outermost?"
            // check can tell our wrapper from a foreign one — and register it
            // in the persistent Set so even an OLDER one of ours is never
            // mistaken for foreign (see the adoption branch above).
            proto._wvDefaultAttFn = proto.getBestAttachment;
            fns.add(proto._wvDefaultAttFn);

            // The PLURAL is a separate upstream entry point, not a caller of
            // the singular -- upstream's getBestAttachment is the thin wrapper
            // over getBestAttachments(), so patching only the singular missed
            // every direct caller of the plural: the locate menu's "View in
            // Tab"/"View in Window" (locateMenu.js `_getFirstUsableItem`), its
            // external-viewer path, and clicking a citation WITH A LOCATOR in
            // a note (editorInstance.js). Those opened Zotero's heuristic pick
            // while double-click opened the user's -- two buttons, two files.
            //
            // HOIST rather than replace: the contract is "all usable file
            // attachments, best first", and callers legitimately walk the rest
            // (the external-viewer path looks for the first NON-native one).
            // Moving the pick to index 0 satisfies both.
            // Skip when OUR plural wrapper is already installed: the re-assert
            // path can reach here without an unwire (a foreign plugin wrapped
            // only the singular), and wrapping our own wrapper would both
            // stack a layer per re-assert and point _wvOrigGetBestAttachments
            // at ourselves, so a later unwire could never fully restore.
            const origPlural = proto.getBestAttachments;
            if (typeof origPlural === "function"
                && origPlural !== proto._wvDefaultAttPluralFn
                && !fns.has(origPlural)) {
                proto._wvOrigGetBestAttachments = origPlural;
                proto.getBestAttachments = async function (this: any, ...args: any[]) {
                    const list = await origPlural.apply(this, args);
                    try {
                        const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                        if (lp && !lp._wvDestroyed && Array.isArray(list) && list.length > 1) {
                            const dp = lp._wvDefattDerived(this).pickID;
                            const chosen = dp != null ? Zotero.Items.get(dp) : null;
                            if (chosen && lp._wvIsFileAttachment(chosen)) {
                                const i = list.findIndex((a: any) => a && a.id === chosen.id);
                                if (i > 0) {
                                    const copy = list.slice();
                                    copy.splice(i, 1);
                                    copy.unshift(list[i]);
                                    return copy;
                                }
                            }
                        }
                    } catch (e) {
                        Zotero.debug("[Weavero] getBestAttachments override err: " + e);
                    }
                    return list;
                };
                proto._wvDefaultAttPluralFn = proto.getBestAttachments;
                fns.add(proto._wvDefaultAttPluralFn);
            }
            proto._wvDefaultAttWired = WIRE_VERSION;
            Zotero.debug("[Weavero] default-child override installed (v" + WIRE_VERSION + ")");
            // Reparent guard rides the same wiring entry point (versioned
            // internally, so re-asserts are no-op).
            try { this._wvWireReparentGuard(); } catch (e) {}
            // Derived-fields invalidator too (idempotent).
            try { this._wvWireDerivedInvalidator(); } catch (e) {}
            // HOIST (upstream zotero#3333's getAttachments sort, user-approved
            // 2026-08-05): the effective opener sorts FIRST in every consumer
            // of getAttachments — the item pane's attachments section and the
            // expanded items-tree children both follow it. Two prefs: the
            // explicit default (defattSortFirstDefault) and, when no explicit
            // pick applies, the AUTOMATIC winner (defattSortFirstAuto). Pure
            // reorder — same ids, nothing added or dropped — so exports and
            // other consumers see the same set.
            try {
                if (!proto._wvDefattGetAttsFn || proto.getAttachments !== proto._wvDefattGetAttsFn) {
                    const origGetAtts = proto._wvDefattOrigGetAtts || proto.getAttachments;
                    proto._wvDefattOrigGetAtts = origGetAtts;
                    proto.getAttachments = function (includeTrashed: any) {
                        const ids = origGetAtts.call(this, includeTrashed);
                        try {
                            if (_wvHoistBusy || !Array.isArray(ids) || ids.length < 2) return ids;
                            const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (!lp || lp._wvDestroyed || !lp._wvDefaultChildEnabled()) return ids;
                            if (!this.isRegularItem || !this.isRegularItem()) return ids;
                            _wvHoistBusy = true;
                            let hoistID: any = null;
                            try {
                                // Derived-fields layer (2026-08-06): one
                                // resident {pickID, autoID} per parent
                                // replaces the per-call child walks.
                                const d = lp._wvDefattDerived(this);
                                if (Zotero.Prefs.get("weavero.defattSortFirstDefault") !== false
                                        && d.pickID != null && ids.includes(d.pickID)) {
                                    hoistID = d.pickID;
                                }
                                if (hoistID == null
                                        && Zotero.Prefs.get("weavero.defattSortFirstAuto") !== false
                                        && d.autoID != null && ids.includes(d.autoID)) {
                                    hoistID = d.autoID;
                                }
                            } finally { _wvHoistBusy = false; }
                            if (hoistID != null && ids[0] !== hoistID) {
                                const rest = ids.filter((x: any) => x !== hoistID);
                                return [hoistID, ...rest];
                            }
                        } catch (e) { _wvHoistBusy = false; }
                        return ids;
                    };
                    proto._wvDefattGetAttsFn = proto.getAttachments;
                }
            } catch (e) { Zotero.debug("[Weavero] getAttachments hoist wire err: " + e); }
            // ▷ MARKER (items list) — see _wvWireDefattMarker.
            try { this._wvWireDefattMarker(); } catch (e) {}
        } catch (e) {
            Zotero.debug("[Weavero] _wvWireDefaultAttachment err: " + e);
        }
    }

    // ---- Derived-fields layer (2026-08-06) --------------------------------
    // Zotero's own pattern applied to Weavero data: derive once into a
    // per-item RAM entry, invalidate through the notifier — but PER-ID
    // (the notifier says which items changed), not wholesale. First
    // resident field: the default-attachment pair {pickID, autoID} per
    // parent, because its consumers sit on the HOTTEST paths there are —
    // the items-list _renderCell wrap (every row paint while scrolling)
    // and the getAttachments hoist — and re-walked the children each call.

    /** {pickID, autoID} for a parent item, lazily derived and cached in
     *  `_wvDerivedDefatt`. pickID = the user's marked child (any openable
     *  kind — consumers re-check file-ness where they need it); autoID =
     *  the automatic heuristic winner among attachments. */
    _wvDefattDerived(parent: any): { pickID: number | null, autoID: number | null } {
        let m: Map<number, any> = this._wvDerivedDefatt;
        if (!m) m = this._wvDerivedDefatt = new Map();
        const id = parent && parent.id;
        if (id == null) return { pickID: null, autoID: null };
        const hit = m.get(id);
        if (hit) return hit;
        let pickID: number | null = null;
        let autoID: number | null = null;
        try {
            const p = this._wvGetDefaultChild(parent);
            pickID = p ? p.id : null;
        } catch (e) {}
        try {
            const a = this._wvBestAttachmentHeuristicSync(parent);
            autoID = a ? a.id : null;
        } catch (e) {}
        const v = { pickID, autoID };
        m.set(id, v);
        return v;
    }

    /** Per-ID eviction: an item event evicts that item's entry AND its
     *  parent's (a child change moves the parent's derived pair). A
     *  DELETED id can't be resolved to a parent anymore — clear the map
     *  (rare, and correctness beats cleverness there). item-tag ids come
     *  as "itemID-tagID" composites. */
    _wvWireDerivedInvalidator(): void {
        try {
            const g: any = Zotero;
            if (g._wvDefattDerivedObsID) return;
            const obs = {
                notify: (_ev: string, type: string, ids: any[]) => {
                    try {
                        const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                        const m: Map<number, any> = lp && lp._wvDerivedDefatt;
                        if (!m || !m.size) return;
                        for (const raw of (ids || [])) {
                            // Notifier ids arrive as numbers OR strings
                            // (and "itemID-tagID" composites for item-tag)
                            // — coerce uniformly, or string ids silently
                            // skip eviction (caught live 2026-08-06).
                            const iid = typeof raw === "number"
                                ? raw
                                : parseInt(String(raw).split("-")[0], 10);
                            if (isNaN(iid)) continue;
                            m.delete(iid);
                            let it: any = null;
                            try { it = Zotero.Items.get(iid); } catch (e) {}
                            if (!it) { m.clear(); return; }
                            const pid = it.parentItemID;
                            if (pid) m.delete(pid);
                        }
                    } catch (e) {
                        try {
                            const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                            if (lp && lp._wvDerivedDefatt) lp._wvDerivedDefatt.clear();
                        } catch (e2) {}
                    }
                },
            };
            g._wvDefattDerivedObsID = Zotero.Notifier.registerObserver(
                obs, ["item", "item-tag"], "weavero-defatt-derived", 95);
        } catch (e) {}
    }

    _wvUnwireDerivedInvalidator(): void {
        try {
            const g: any = Zotero;
            if (g._wvDefattDerivedObsID) {
                try { Zotero.Notifier.unregisterObserver(g._wvDefattDerivedObsID); } catch (e) {}
            }
            delete g._wvDefattDerivedObsID;
            this._wvDerivedDefatt = null;
        } catch (e) {}
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
            // Same rule for the plural: restore only if OUR wrapper is on top.
            if (typeof proto._wvOrigGetBestAttachments === "function"
                && proto.getBestAttachments === proto._wvDefaultAttPluralFn) {
                proto.getBestAttachments = proto._wvOrigGetBestAttachments;
            }
            delete proto._wvOrigGetBestAttachment;
            delete proto._wvOrigGetBestAttachments;
            delete proto._wvDefaultAttFn;
            delete proto._wvDefaultAttPluralFn;
            delete proto._wvDefaultAttWired;
            // Hoist wrap: same top-of-chain rule.
            if (typeof proto._wvDefattOrigGetAtts === "function"
                && proto.getAttachments === proto._wvDefattGetAttsFn) {
                proto.getAttachments = proto._wvDefattOrigGetAtts;
            }
            delete proto._wvDefattOrigGetAtts;
            delete proto._wvDefattGetAttsFn;
            // Derived-fields layer: observer + resident map go with us.
            try { this._wvUnwireDerivedInvalidator(); } catch (e) {}
            // ▷ marker wrap on each window's ItemTree renderer prototype.
            try {
                const wins = Zotero.getMainWindows ? Zotero.getMainWindows() : [];
                for (const win of wins) {
                    try {
                        const view: any = (win as any).ZoteroPane && (win as any).ZoteroPane.itemsView;
                        let itp: any = view && Object.getPrototypeOf(view);
                        while (itp && !Object.prototype.hasOwnProperty.call(itp, "_renderCell")) itp = Object.getPrototypeOf(itp);
                        if (itp && typeof itp._wvDefattOrigRenderCell === "function"
                            && itp._renderCell === itp._wvDefattRenderFn) {
                            itp._renderCell = itp._wvDefattOrigRenderCell;
                        }
                        if (itp) { delete itp._wvDefattOrigRenderCell; delete itp._wvDefattRenderFn; }
                    } catch (e) {}
                }
            } catch (e) {}
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

            // Once an open call has been ISSUED, this helper owns the outcome:
            // a throw past this point may have already opened something (e.g.
            // viewAttachment on a linked URL can fail after handing off to
            // loadURI), and returning false there would make the caller run
            // Zotero's normal open on top -- the user gets the chosen child
            // AND the heuristic pick. Opening nothing extra beats opening two.
            let issued = false;
            try {
                if (typeof chosen.isNote === "function" && chosen.isNote()) {
                    // The ONLY correct way to open a note tab — a bare
                    // Zotero_Tabs.add({type:"note"}) yields an editor-less shell.
                    issued = true;
                    await zp.openNote(chosen.id, { openInWindow: false });
                }
                else {
                    // Handles non-PDF files AND linked URLs.
                    issued = true;
                    await zp.viewAttachment(
                        chosen.id, event, options && options.noLocateOnMissing, options,
                    );
                }
            } catch (e) {
                Zotero.debug("[Weavero] _wvTryOpenDefaultChild open err: " + e);
                return issued;   // issued -> claim handled; never double-open
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

    /** Reparent guard (2026-08-05, prompted by upstream PR zotero#3333's
     *  review): the marker tag TRAVELS with an attachment/note moved to a
     *  different parent, silently making it the NEW parent's default -- the
     *  upstream relation design clears the pick on reparent, and that is the
     *  right semantic: the choice belonged to the OLD parent. Detection needs
     *  the old parent, which a modify notification doesn't carry, so a
     *  session cache (attachment id -> parent id) is seeded from a tag scan
     *  at wire time and maintained on every observation; a marked child whose
     *  parent differs from the cached one gets its marker stripped. Covers
     *  same-device moves AND synced moves from another device (the incoming
     *  modify carries the new parent while the cache still holds the old).
     *  Observer + cache live on the Zotero global (versioned) so reloads
     *  peel the previous copy instead of stacking. */
    _wvWireReparentGuard(): void {
        try {
            const g: any = Zotero;
            if (g._wvDefattReparentObsID) {
                if (g._wvDefattReparentObsVer === WIRE_VERSION) return;
                try { Zotero.Notifier.unregisterObserver(g._wvDefattReparentObsID); } catch (e) {}
            }
            if (!g._wvDefattParentCache) g._wvDefattParentCache = new Map();
            const cache: Map<number, number | null> = g._wvDefattParentCache;
            // Seed: every currently-marked child across all libraries.
            (async () => {
                try {
                    for (const lib of (Zotero.Libraries.getAll ? Zotero.Libraries.getAll() : [])) {
                        try {
                            const s: any = new Zotero.Search();
                            s.libraryID = lib.libraryID;
                            s.addCondition("tag", "is", OPEN_BY_DEFAULT_TAG);
                            const ids: number[] = await s.search();
                            for (const id of (ids || [])) {
                                const it: any = Zotero.Items.get(id);
                                if (it && !cache.has(id)) cache.set(id, it.parentItemID || null);
                            }
                        } catch (e) {}
                    }
                } catch (e) {}
            })();
            const obs = {
                notify: (event: string, type: string, ids: any[]) => {
                    try {
                        if (type !== "item" || event !== "modify") return;
                        // Resolve the LIVE plugin -- the observer outlives builds.
                        const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                        if (!lp || lp._wvDestroyed) return;
                        if (!lp._wvDefaultChildEnabled || !lp._wvDefaultChildEnabled()) return;
                        for (const id of (ids || [])) {
                            try {
                                const it: any = Zotero.Items.get(id);
                                if (!it) { cache.delete(id); continue; }
                                const isChildish = (typeof it.isAttachment === "function" && it.isAttachment())
                                    || (typeof it.isNote === "function" && it.isNote());
                                if (!isChildish) continue;
                                if (!lp._wvIsDefaultChild(it)) { cache.delete(id); continue; }
                                const cur = it.parentItemID || null;
                                const prev = cache.has(id) ? cache.get(id) : undefined;
                                if (prev === undefined) { cache.set(id, cur); continue; }   // first sight
                                if (prev !== cur) {
                                    cache.delete(id);
                                    lp._wvDefAttTrace && lp._wvDefAttTrace("reparent:clear",
                                        { id, prevParent: prev, newParent: cur });
                                    Promise.resolve(lp._wvClearDefaultChild(it)).catch(() => {});
                                }
                            } catch (e) {}
                        }
                    } catch (e) {}
                },
            };
            g._wvDefattReparentObsID = Zotero.Notifier.registerObserver(obs, ["item"], "weavero-defatt-reparent");
            g._wvDefattReparentObsVer = WIRE_VERSION;
        } catch (e) {
            Zotero.debug("[Weavero] _wvWireReparentGuard err: " + e);
        }
    }

    /** ▷ MARKER (items list): the AUTOMATIC winner gets a dimmed hollow glyph
     *  before its title, so the user can always see what Zotero would open if
     *  the plugin's default were removed — the explicit pick already shows its
     *  ▶️ tag emoji natively, and a row that is BOTH stays ▶️-only. The
     *  ItemTree class is NOT on the Zotero global — itemTree.jsx loads into
     *  each window's scope — so the `_renderCell`-owning prototype is found by
     *  walking each window's live itemsView and patched per window (subclasses
     *  and rebuilt views share it via the chain). Live plugin + pref resolved
     *  per render; re-runnable (onMainWindowLoad calls it for new windows). */
    _wvWireDefattMarker(): void {
        try {
            const wins = Zotero.getMainWindows ? Zotero.getMainWindows() : [Zotero.getMainWindow()].filter(Boolean);
            for (const win of wins) {
                try {
                    const view: any = (win as any).ZoteroPane && (win as any).ZoteroPane.itemsView;
                    if (!view) continue;
                    let proto: any = Object.getPrototypeOf(view);
                    while (proto && !Object.prototype.hasOwnProperty.call(proto, "_renderCell")) {
                        proto = Object.getPrototypeOf(proto);
                    }
                    if (!proto) continue;
                    if (proto._wvDefattRenderFn && proto._renderCell === proto._wvDefattRenderFn) continue;
                    const origRender = proto._wvDefattOrigRenderCell || proto._renderCell;
                    proto._wvDefattOrigRenderCell = origRender;
                    proto._renderCell = function (index: any, data: any, column: any, isFirstColumn: any) {
                        const cell = origRender.apply(this, arguments);
                        try {
                            if (!isFirstColumn) return cell;
                            const lp: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                            if (!lp || lp._wvDestroyed || !lp._wvDefaultChildEnabled()) return cell;
                            if (Zotero.Prefs.get("weavero.defattMarkAuto") === false) return cell;
                            const row: any = this.getRow && this.getRow(index);
                            const it: any = row && row.ref;
                            if (!it || !it.isAttachment || !it.isAttachment() || !it.parentItemID) return cell;
                            if (lp._wvIsDefaultChild(it)) return cell;   // ▶️ already tells the story
                            const parent: any = Zotero.Items.get(it.parentItemID);
                            if (!parent) return cell;
                            // Derived-fields layer: resident autoID beats a
                            // child-walk per row PAINT (2026-08-06).
                            if (lp._wvDefattDerived(parent).autoID !== it.id) return cell;
                            const txt = cell.querySelector && cell.querySelector(".cell-text");
                            if (!txt || cell.querySelector(".wv-defatt-auto-glyph")) return cell;
                            const g = txt.ownerDocument.createElement("span");
                            g.className = "wv-defatt-auto-glyph";
                            g.textContent = "▷ ";
                            g.style.cssText = "opacity:.5;";
                            g.setAttribute("title", "Automatic default — what Zotero would open without a chosen default");
                            txt.parentNode.insertBefore(g, txt);
                        } catch (e) {}
                        return cell;
                    };
                    proto._wvDefattRenderFn = proto._renderCell;
                } catch (e) {}
            }
        } catch (e) { Zotero.debug("[Weavero] _wvWireDefattMarker err: " + e); }
    }

    /** Drop the reparent guard (shutdown path). */
    _wvUnwireReparentGuard(): void {
        try {
            const g: any = Zotero;
            if (g._wvDefattReparentObsID) {
                try { Zotero.Notifier.unregisterObserver(g._wvDefattReparentObsID); } catch (e) {}
            }
            delete g._wvDefattReparentObsID;
            delete g._wvDefattReparentObsVer;
        } catch (e) {}
    }

    // ---- Migration from PikaPei/zotero-default-attachment -----------------

    /** Detect leftover data from the older PikaPei/zotero-default-attachment
     *  plugin and QUEUE THE QUESTION of what to do with it. Nothing is
     *  imported here — see `_wvApplyLegacyChoice`.
     *
     *  That plugin stores everything OUT OF BAND, in one pref:
     *      extensions.zotero.defaultattachment.mappings
     *      -> JSON  { "<parentItemID>": <attachmentItemID>, ... }
     *  (verified against its shipped bundle). Those are LOCAL numeric item
     *  IDs, not sync keys, so the mapping is only meaningful in the profile
     *  that wrote it — which is why it doesn't survive a restore or another
     *  machine, and why importing converts it into a synced tag.
     *
     *  Runs ONCE per decision, guarded by `weavero.defaultChildMigrated`,
     *  which is set only when the user ANSWERS. Without that guard an import
     *  would resurrect choices the user has since cleared, because the old
     *  pref is never touched.
     *
     *  WEAVERO NEVER WRITES TO THAT PLUGIN'S DATA — not here, not on import,
     *  not on any path. Its pref is read-only to us, so choosing to keep
     *  using that plugin always works: turn Weavero's feature off and it
     *  behaves exactly as it did before Weavero was installed. */
    async _wvMigrateDefaultAttachmentPlugin(): Promise<any> {
        const result: any = { ran: false, found: 0, migrated: 0, skipped: 0 };
        try {
            // Feature off: skip WITHOUT setting the run-once guard, so the
            // import still happens if the user enables it later. Setting the
            // guard here would silently lose their PikaPei picks forever.
            if (!this._wvDefaultChildEnabled()) return result;
            if (Zotero.Prefs.get("weavero.defaultChildMigrated")) return result;
            result.ran = true;
            // ASK, don't act. Importing silently would be wrong in two very
            // ordinary cases: the user may only have been TRYING that plugin
            // and want none of it, or may prefer to keep using it — and an
            // import writes tags to their library and queues those items for
            // sync, which is not something to do on their behalf uninvited.
            //
            // So this run only COUNTS what is there and queues the question.
            // Nothing is imported, and the run-once guard is not spent, until
            // the user answers (see `_wvApplyLegacyChoice`).
            const found = this._wvCountLegacyMappings();
            result.found = found;
            if (found) {
                Zotero.Prefs.set("weavero.defaultChildLegacyPending", found);
                Zotero.debug("[Weavero] legacy default-attachment data found: "
                    + found + " pick(s) — awaiting the user's choice");
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvMigrateDefaultAttachmentPlugin err: " + e);
        }
        return result;
    }

    /** Re-offer the import the moment the feature is switched back ON.
     *
     *  Someone who first chose "keep using the other plugin" and later changes
     *  their mind would otherwise have to restart before Weavero looked at the
     *  legacy data again — and would have no idea that was required. Watching
     *  the pref makes the offer appear as soon as they flip the switch.
     *
     *  Fires only when the pref becomes TRUE and no decision has been
     *  recorded; detection itself returns early while the feature is off, so
     *  toggling cannot produce a recurring prompt. */
    _wvWireDefaultChildPrefWatch(): void {
        try {
            // The observer HANDLE lives on the Zotero global, like every other
            // long-lived hook in this module (`_wvDefAttPluginObserver`,
            // `_wvDefaultAttWired`) -- the observer itself outlives the plugin
            // instance, so an instance-scoped handle is lost with the instance
            // whenever destroy() does not complete the unregister, leaving the
            // observer unreachable forever and a second one stacking on the
            // next wire (each stacked copy would run the migration + legacy
            // prompt once per pref flip). Versioned so a new build re-wires.
            const g: any = Zotero;
            if (g._wvDefChildPrefObs) {
                if (g._wvDefChildPrefObsVer === WIRE_VERSION) return;
                try { Zotero.Prefs.unregisterObserver(g._wvDefChildPrefObs); } catch (e) {}
                delete g._wvDefChildPrefObs;
            }
            g._wvDefChildPrefObsVer = WIRE_VERSION;
            g._wvDefChildPrefObs = Zotero.Prefs.registerObserver(
                "weavero.enableDefaultChild",
                () => {
                    try {
                        // Resolve live — this observer outlives builds.
                        const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                        if (!lp || lp._wvDestroyed) return;
                        if (!lp._wvDefaultChildEnabled()) return;
                        if (Zotero.Prefs.get("weavero.defaultChildMigrated")) return;
                        Promise.resolve(lp._wvMigrateDefaultAttachmentPlugin()).then(() => {
                            const w = Zotero.getMainWindow();
                            if (w) lp._wvShowLegacyPrompt(w);
                        }).catch(() => {});
                    } catch (e) {
                        Zotero.debug("[Weavero] defaultChild pref watch err: " + e);
                    }
                },
            );
        } catch (e) {
            Zotero.debug("[Weavero] _wvWireDefaultChildPrefWatch err: " + e);
        }
    }

    /** Drop the pref watcher (shutdown path). */
    _wvUnwireDefaultChildPrefWatch(): void {
        const g: any = Zotero;
        try {
            if (g._wvDefChildPrefObs) Zotero.Prefs.unregisterObserver(g._wvDefChildPrefObs);
        } catch (e) { /* already gone */ }
        try { delete g._wvDefChildPrefObs; delete g._wvDefChildPrefObsVer; } catch (e) {}
    }

    /** How many picks the old plugin stores. READ-ONLY, like every other
     *  access Weavero makes to that pref. */
    _wvCountLegacyMappings(): number {
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

    /** Is that plugin still RUNNING in this window?
     *
     *  Detected from the menu item it creates at startup rather than through
     *  AddonManager: the element's presence proves the plugin actually
     *  started, which is the thing that matters here — an installed-but-
     *  disabled plugin should be treated as gone. */
    _wvRivalDefaultPluginActive(win: any): boolean {
        try {
            const doc = win && win.document;
            return !!(doc && doc.getElementById("defaultattachment-set-default-menuitem"));
        } catch (e) {
            return false;
        }
    }

    /** Record the user's answer about the old plugin's leftover data.
     *
     *  `choice`:
     *    "import" — convert its picks into Weavero tags (its own data is
     *               still left exactly as it was);
     *    "skip"   — ignore them; the user was only trying that plugin;
     *    "other"  — they prefer that plugin, so switch Weavero's feature OFF.
     *               That restores their plugin completely: Weavero stops
     *               overriding getBestAttachment, stops hiding its menu
     *               entry, and never touched its data in the first place.
     *
     *  Every branch spends the run-once guard, so the question is asked once
     *  and answered once. Weavero writes NOTHING to the other plugin's pref
     *  in any branch. */
    async _wvApplyLegacyChoice(choice: string): Promise<any> {
        const res: any = { choice, migrated: 0, superseded: 0 };
        try {
            if (choice === "import") {
                const imp = await this._wvImportLegacyMappings();
                res.migrated = imp.migrated;
                res.superseded = imp.superseded;
            }
            else if (choice === "other") {
                // Hand the feature back. Existing Weavero marks are left in
                // place: they are inert while the feature is off, and come
                // back if the user changes their mind.
                Zotero.Prefs.set("weavero.enableDefaultChild", false);
            }
            // "other" deliberately does NOT spend the run-once guard. It means
            // "not now, I'm using the other plugin" — not "never". If the user
            // later switches Weavero's feature back on, the offer to bring
            // their picks across must still be there, otherwise choosing the
            // other plugin once would silently forfeit the import forever.
            // While the feature is off, detection returns early, so this
            // cannot turn into a recurring prompt.
            // Don't spend the run-once guard on an import that found picks
            // but wrote none (every write failed — read-only library, DB
            // error): the offer would never come back and the user would be
            // told nothing went wrong. Their data is untouched in the other
            // plugin's pref, so retrying later is safe and correct.
            const importedNothing = choice === "import"
                && res && res.found > 0 && res.migrated === 0;
            if (choice !== "other" && !importedNothing) {
                Zotero.Prefs.set("weavero.defaultChildMigrated", true);
            }
            Zotero.Prefs.set("weavero.defaultChildLegacyChoice", String(choice));
            Zotero.Prefs.clear("weavero.defaultChildLegacyPending");
            Zotero.debug("[Weavero] legacy default-attachment choice: " + choice
                + " (" + res.migrated + " imported)");
        } catch (e) {
            Zotero.debug("[Weavero] _wvApplyLegacyChoice err: " + e);
        }
        return res;
    }

    /** Ask what to do with the old plugin's leftover data, if that question
     *  is still pending.
     *
     *  Called from window load (and from startup for windows already open),
     *  because detection runs before any main window may exist.
     *
     *  A DECISION, not a notice, and deliberately so: importing writes tags
     *  to the user's library and queues those items for sync. Doing that
     *  uninvited is wrong when they may only have been TRYING that plugin, or
     *  may prefer to keep using it.
     *
     *  STICKY and answer-backed: the pending pref is cleared only when an
     *  option is chosen, so closing the window or ignoring it brings the
     *  question back next start rather than silently defaulting to anything.
     *
     *  The third option only appears when that plugin is actually RUNNING —
     *  offering "keep using it" for a plugin that is gone would be nonsense,
     *  and the wording changes to match. */
    async _wvShowLegacyPrompt(win: any): Promise<void> {
        try {
            const n = Number(Zotero.Prefs.get("weavero.defaultChildLegacyPending") || 0);
            if (!n) return;
            const doc = win && win.document;
            if (!doc || doc.getElementById("wv-defatt-notice")) return;

            const active = this._wvRivalDefaultPluginActive(win);
            const picks = n + " default attachment" + (n === 1 ? "" : "s");
            const lines = active
                ? ["Default Attachment (PikaPei) is running and has " + picks + " saved.",
                   "Weavero can do the same job — for any attachment, linked URL or note, "
                       + "not just PDFs — and stores each choice as a tag so it syncs.",
                   "What would you like to do?"]
                : ["Found " + picks + " left over from Default Attachment (PikaPei), "
                       + "which is not running.",
                   "Weavero can take those over and store each as a tag so it syncs, "
                       + "or leave them alone.",
                   "What would you like to do?"];

            const apply = (choice: string) => {
                const lp: any = Zotero.Weavero && Zotero.Weavero.plugin;
                if (!lp) return;
                Promise.resolve(lp._wvApplyLegacyChoice(choice)).then((r: any) => {
                    const msg = choice === "import"
                        ? ["Imported " + r.migrated + " pick" + (r.migrated === 1 ? "" : "s")
                            + " as the tag " + OPEN_BY_DEFAULT_TAG + ".",
                           "Default Attachment's own data was left untouched — the README "
                            + "explains removing it by hand."]
                        : choice === "other"
                            ? ["Weavero's default-attachment feature is now off.",
                               "Default Attachment keeps working exactly as before; Weavero "
                                + "never changed any of its data.",
                               "You can turn Weavero's version back on in Settings → Weavero "
                                + "→ Extras."]
                            : ["Left Default Attachment's data alone.",
                               "Set a default any time by right-clicking a child item."];
                    lp._wvToast("Weavero — default attachments", msg,
                        { id: "wv-defatt-notice", accent: "info", win, autoCloseMs: 15000 });
                }).catch(() => {});
            };

            const actions: any[] = [
                { label: "Import into Weavero", onClick: () => apply("import") },
                { label: "Don’t import", onClick: () => apply("skip") },
            ];
            if (active) {
                actions.push({
                    label: "Keep using Default Attachment",
                    onClick: () => apply("other"),
                });
            }

            this._wvToast("Weavero — default attachments found", lines, {
                id: "wv-defatt-notice",
                accent: "info",
                win,
                actions,
            });
        } catch (e) {
            Zotero.debug("[Weavero] _wvShowLegacyPrompt err: " + e);
        }
    }

    /** Read the legacy pref and mark every entry it can, WITHOUT touching the
     *  run-once guard. Kept separate from `_wvMigrateDefaultAttachmentPlugin`
     *  so the import itself stays callable and testable independently of the
     *  guard that decides *when* it runs.
     *
     *  Reports `unresolved` — entries that could NOT be turned into a Weavero
     *  mark, with the reason: their attachment is gone, trashed, or
     *  re-parented. Weavero leaves the legacy pref alone in every case, so
     *  those picks simply stay where they are; the README explains removing
     *  that data by hand. `skipped` counts them plus entries that were already
     *  marked or superseded (both harmless). */
    async _wvImportLegacyMappings(): Promise<any> {
        const out: any = {
            found: 0, migrated: 0, skipped: 0,
            alreadyMarked: 0, superseded: 0, unresolved: [],
        };
        let raw: any = null;
        try {
            // `true` = global pref name, matching how that plugin writes it.
            raw = Zotero.Prefs.get("extensions.zotero.defaultattachment.mappings", true);
        } catch (e) { /* pref absent — nothing to migrate */ }
        if (!raw) return out;

        let mappings: any = null;
        try { mappings = JSON.parse(String(raw)); } catch (e) {
            Zotero.debug("[Weavero] default-attachment migration: unparsable pref");
            // An unparsable pref is unresolved by definition: nothing in it
            // can be trusted, so nothing is imported from it.
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
                // The user already has a DIFFERENT Weavero choice for this
                // parent. Never overwrite it: the legacy value is older and
                // unsynced, and _wvSetDefaultChild clears siblings, so
                // importing would silently replace a deliberate choice. An
                // explicit Weavero pick supersedes the legacy one; that is not
                // lost information, it was overridden on purpose.
                if (this._wvParentHasDefault(att)) {
                    out.skipped++;
                    out.superseded++;
                    continue;
                }
                // Honour the result: a failed write (read-only library, DB
                // error) must not be reported to the user as an imported
                // pick, and must not let the run-once guard be spent on a
                // migration that imported nothing.
                if (await this._wvSetDefaultChild(att)) {
                    out.migrated++;
                }
                else {
                    out.skipped++;
                    out.unresolved.push({ parentID, attID, reason: "writeFailed" });
                }
            } catch (e) {
                out.skipped++;
                out.unresolved.push({ parentID, attID, reason: "error" });
                Zotero.debug("[Weavero] migration entry err: " + e);
            }
        }
        return out;
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
                    // Read-only library (a group you cannot edit): writing the
                    // marker throws "Cannot edit item in library", which the
                    // setter swallows -- so the entry would appear and do
                    // nothing at all. Don't offer what cannot work.
                    try {
                        if (typeof child.isEditable === "function" && !child.isEditable()) {
                            lp._wvDefAttTrace("menu:skip", { why: "readOnly", key: child.key });
                            return;
                        }
                    } catch (e) {}

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
                        // "Default Attachment" — deliberately DISTINCT from
                        // upstream zotero#3333's pending "Primary Attachment":
                        // "Default" signals a plugin tool and keeps the story
                        // clean if users later migrate from Weavero's Default
                        // Attachment to Zotero's native Primary Attachment
                        // (user decision 2026-08-05, reversing same-day).
                        (glyph ? glyph + " " : "") + (marked ? "Clear Default Attachment" : "Set as Default Attachment")
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
                            // Do what the LABEL promised, not a blind toggle.
                            // The label is a snapshot from popupshowing; if the
                            // marker changes while the menu is open (incoming
                            // sync, a second window, the tag selector), a
                            // toggle would invert the shown action -- "Set as
                            // Default" would clear. Set/clear are idempotent,
                            // so acting on the snapshot is always safe.
                            const act = marked
                                ? p._wvClearDefaultChild(child)
                                : p._wvSetDefaultChild(child);
                            act.then(() => {
                                p._wvDefAttTrace("menu:command:done", {
                                    key: child.key, did: marked ? "clear" : "set",
                                    nowMarked: p._wvIsDefaultChild(child),
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
