/* Four-type classification (2026-08-19): notes are their own row kind,
 * scopes carry a `note` toggle with preserve-behaviour migration from
 * the pre-four-type shape, and the standalone-attachment dimension
 * completes the attachment type's position scopes.
 *
 * Guard for: feat(filter) four-type classification. These invariants
 * were previously implicit in the three-kind vocabulary and broke
 * silently when terminology and machinery disagreed (the note-kind
 * confusion documented in docs/filter-rules.md "Types and positions").
 */
/* global describe, it, assert, Weavero */

describe("Weavero — four-type classification", function () {
    const plugin = () => Zotero.Weavero.plugin;

    const stub = (over) => Object.assign({
        isAnnotation: () => false,
        isAttachment: () => false,
        isNote: () => false,
        isRegularItem: () => false,
        parentItem: null,
    }, over);

    const regular = () => stub({ isRegularItem: () => true });
    const attachment = (parent) => stub({ isAttachment: () => true, parentItem: parent || null });
    const note = (parent) => stub({ isNote: () => true, parentItem: parent || null });
    const annotation = () => stub({ isAnnotation: () => true, parentItem: {} });

    describe("_rowKindOf", function () {
        it("classifies notes as their own kind at BOTH positions", function () {
            assert.equal(plugin()._rowKindOf(note(null)), "note");
            assert.equal(plugin()._rowKindOf(note({})), "note");
        });
        it("classifies attachments by type regardless of position", function () {
            assert.equal(plugin()._rowKindOf(attachment(null)), "attachment");
            assert.equal(plugin()._rowKindOf(attachment({})), "attachment");
        });
        it("keeps parent and annotation kinds", function () {
            assert.equal(plugin()._rowKindOf(regular()), "parent");
            assert.equal(plugin()._rowKindOf(annotation()), "annotation");
        });
    });

    describe("_wvScopeAllows — migration from pre-four-type scopes", function () {
        it("unset note key: in scope iff a covering toggle is on", function () {
            // Old scope shapes have no `note` key.
            assert.isTrue(plugin()._wvScopeAllows(
                { parent: true, attachment: false, annotation: true }, "note"));
            assert.isTrue(plugin()._wvScopeAllows(
                { parent: false, attachment: true, annotation: true }, "note"));
            assert.isFalse(plugin()._wvScopeAllows(
                { parent: false, attachment: false, annotation: true }, "note"));
        });
        it("explicit note key wins over the migration fallback", function () {
            assert.isFalse(plugin()._wvScopeAllows(
                { parent: true, attachment: true, note: false }, "note"));
            assert.isTrue(plugin()._wvScopeAllows(
                { parent: false, attachment: false, note: true }, "note"));
        });
        it("missing scope object or kind means in-scope", function () {
            assert.isTrue(plugin()._wvScopeAllows(null, "note"));
            assert.isTrue(plugin()._wvScopeAllows({ parent: false }, null));
        });
    });

    describe("standaloneAttachment dimension", function () {
        it("is a kind-match for parentless attachments only", function () {
            const g = { standaloneAttachment: true };
            assert.isTrue(plugin()._rowHasOwnKindMatch(attachment(null), g));
            assert.isFalse(plugin()._rowHasOwnKindMatch(attachment({}), g));
        });
        it("exclude direction inverts", function () {
            const g = { standaloneAttachment: false };
            assert.isTrue(plugin()._rowHasOwnKindMatch(attachment({}), g));
            assert.isFalse(plugin()._rowHasOwnKindMatch(attachment(null), g));
        });
        it("registers as an active group dimension", function () {
            const g = plugin()._emptyFilterGroup();
            assert.isFalse(plugin()._isGroupActive(g));
            g.standaloneAttachment = true;
            assert.isTrue(plugin()._isGroupActive(g));
        });
    });

    describe("Standalone Note ↔ Item Note OR pair", function () {
        it("both includes ON: any note passes the per-row filter", function () {
            const g = Object.assign(plugin()._emptyFilterGroup(),
                { standaloneNote: true, itemNote: true });
            assert.isTrue(plugin()._rowPassesFilters(note(null), g, {}));
            assert.isTrue(plugin()._rowPassesFilters(note({}), g, {}));
        });
        it("single include keeps its position restriction", function () {
            const g = Object.assign(plugin()._emptyFilterGroup(),
                { standaloneNote: true });
            assert.isTrue(plugin()._rowPassesFilters(note(null), g, {}));
            assert.isFalse(plugin()._rowPassesFilters(note({}), g, {}));
        });
    });

    describe("tree-level checks see notes (four-type candidates bucket)", function () {
        // Regression guard: the four-type classifier made _rowKindOf
        // return "note", and the tree-walk candidates had no note
        // bucket -- notes silently vanished from itemNote/hasTag/
        // hasLink tree checks (caught 2026-08-19 by the pair-OR work).
        it("child note satisfies the both-ON Notes requirement via its own spine", function () {
            const parent = stub({ isRegularItem: () => true,
                getAttachments: () => [], getNotes: () => [] });
            const child = note(parent);
            const g = Object.assign(plugin()._emptyFilterGroup(),
                { standaloneNote: true, itemNote: true });
            assert.isTrue(plugin()._treeSatisfiesCrossLevelScoped(child, g));
        });
        it("child note satisfies the single itemNote requirement", function () {
            const parent = stub({ isRegularItem: () => true,
                getAttachments: () => [], getNotes: () => [] });
            const child = note(parent);
            const g = Object.assign(plugin()._emptyFilterGroup(),
                { itemNote: true });
            assert.isTrue(plugin()._treeSatisfiesCrossLevelScoped(child, g));
        });
    });

    describe("_effectiveSelectionTargetKinds — four-way", function () {
        let saved;
        beforeEach(function () { saved = plugin()._filterState; });
        afterEach(function () { plugin()._filterState = saved; });

        it("explicit note target narrows to notes", function () {
            plugin()._filterState = {
                groups: [plugin()._emptyFilterGroup()],
                selectionTarget: { note: true },
            };
            const eff = plugin()._effectiveSelectionTargetKinds();
            assert.deepEqual(eff,
                { parent: false, attachment: false, note: true, annotation: false });
        });
        it("note-dimension chips contribute the note kind (smart default)", function () {
            const g = plugin()._emptyFilterGroup();
            g.standaloneNote = true;
            plugin()._filterState = { groups: [g] };
            const eff = plugin()._effectiveSelectionTargetKinds();
            assert.isTrue(eff.note);
            assert.isFalse(eff.parent);
        });
        it("standaloneAttachment contributes the attachment kind", function () {
            const g = plugin()._emptyFilterGroup();
            g.standaloneAttachment = true;
            plugin()._filterState = { groups: [g] };
            const eff = plugin()._effectiveSelectionTargetKinds();
            assert.isTrue(eff.attachment);
            assert.isFalse(eff.note);
        });
    });
});
