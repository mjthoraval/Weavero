// Module: bookmarks — a dropdown bookmarks affordance with folders.
//
// A bookmark icon at the top of the collections pane (next to "New
// Collection") opens a dropdown listing the user's bookmarks (items,
// annotations, collections) organized into optional folders. The dropdown
// is a XUL <panel> hosting an HTML list (the same "panel + HTML" pattern
// the filter window uses, #wv-filter-popup) — a native <menupopup> can't
// tint icons, host drag-and-drop, or carry per-row right-click menus.
// Rows show the target's real Zotero icon, navigate on click (modifier-
// aware), can be reordered / nested by drag, and have right-click menus.
//
// Storage (per Claude memory project_weavero_bookmarks_storage): one JSON
// document at `<Zotero data dir>/weavero/bookmarks.json`, behind this thin
// store so the backend can later swap for Zotero's managed synced store.
//
// Data shape (v2 — a tree; v1 flat data is forward-compatible):
//   { version: 2, bookmarks: [
//       { id, type: "item",       libraryID, itemKey,       label, created },
//       { id, type: "collection", libraryID, collectionKey, label, created },
//       { id, type: "folder", name, expanded, created, children: [ … ] }
//   ] }   (annotations are items with itemType 'annotation')
//
// (An alternative docked-panel "tab" UI is parked at
// work/saved-variants/bookmarks-panel-variant.ts.)
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

// Gecko globals — not in the project's TS lib set (cf. tabs.ts).
declare const IOUtils: any;
declare const PathUtils: any;
declare const Services: any;

const BM_BTN_ID = "wv-bookmarks-toolbar-button";
const BM_POPUP_ID = "wv-bookmarks-popup";       // the <panel>
const BM_INNER_ID = "wv-bookmarks-inner";
const BM_STYLE_ID = "wv-bookmarks-style";
const BM_ROW_MENU_ID = "wv-bm-row-menu";
const NS_HTML = "http://www.w3.org/1999/xhtml";

// annotationType → Zotero skin icon (mirrors the filter pane's mapping).
const BM_ANNOTATION_ICONS: { [k: string]: string } = {
    highlight: "annotate-highlight.svg",
    underline: "annotate-underline.svg",
    note: "annotate-note.svg",
    image: "annotate-area.svg",
    ink: "annotate-ink.svg",
    text: "annotate-text.svg",
};

// Hollow bookmark-ribbon glyph for the toolbar button, Obsidian/Lucide
// style (outline, no fill). `context-stroke` themes it; sized a touch
// larger (18px) than the 16px neighbours.
const BOOKMARK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" '
    + 'viewBox="0 0 24 24" fill="none" stroke="context-stroke" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>'
    + '</svg>';

// Neutral-gray fallback for a row whose target can't be resolved.
const BM_FALLBACK_DATA_URI = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
    + '<path fill="#888" d="M4 1.5h8a1 1 0 0 1 1 1V15l-5-3.2L3 15V2.5a1 1 0 0 1 1-1z"/>'
    + '</svg>');

// Red cross for "Delete" — reads as "remove this entry" (not "send to
// trash"). Baked-in red since a native menuitem icon can't be tinted.
const BM_DELETE_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
    + '<path d="M4 4l8 8M12 4l-8 8" stroke="#e0483b" stroke-width="2" stroke-linecap="round"/>'
    + '</svg>');

// Neutral-gray "+" and folder-with-+ for the context-menu "Add Bookmark" /
// "New Folder" items. Baked colour (visible in both themes — a menuitem image
// can't carry -moz-context-properties tinting).
const BM_MENU_ADD_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
    + '<path fill="#888" d="M7 7V2h2v5h5v2H9v5H7V9H2V7z"/></svg>');
const BM_MENU_NEWFOLDER_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" '
    + 'fill="none" stroke="#888" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M18 11.5V6.5H8.5L7 5H2.5V15.5H10"/><path d="M14.5 12.5v5M12 15h5"/></svg>');

// Folder glyph for bookmark folders — an outline (Lucide/Firefox-style)
// folder, deliberately distinct from Zotero's filled blue collection
// icon so bookmark folders aren't confused with bookmarked collections.
// `context-stroke` themes the outline.
const BM_FOLDER_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" '
    + 'viewBox="0 0 16 16" fill="none" stroke="context-stroke" '
    + 'stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter">'
    + '<path d="M1.5 4.5H5.5L7 6.5H14.5V13.5H1.5Z"/></svg>');

// "New Folder" action icon — an outline folder (open at the bottom-right)
// with a "+ in a circle" badge in that corner, mirroring Zotero's New
// Collection icon but in the outline style of our folder rows. Authored
// in a 20-unit box at stroke-width 1 so it's a crisp 1px line at the
// toolbar's 20px size.
const BM_NEW_FOLDER_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" '
    + 'viewBox="0 0 20 20" fill="none" stroke="context-stroke" '
    + 'stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter">'
    + '<path d="M18.5 11V6.5H8L6.5 4.5H2.5V17.5H10"/>'
    + '<circle cx="14.5" cy="14.5" r="3.5"/>'
    + '<path d="M14.5 12.5v4M12.5 14.5h4"/></svg>');

// Pencil for the menu's "Rename…" item (no native Zotero icon for this).
// Baked #888 to sit alongside the gray Add/New-Folder icons; the reader menu
// uses the same pencil path via currentColor (RP_RENAME_SVG). Open and
// Show-in-Library use the native Zotero icons (attachment / library) instead.
const BM_RENAME_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" '
    + 'fill="none" stroke="#888" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M11.5 2.5l2 2"/>'
    + '<path d="M12.2 1.8a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4L5.5 12.5 2.5 13.5 3.5 10.5z"/></svg>');

// Bare-class selectors so the same styles apply in the main panel AND in
// flyout sub-panels (each flyout is a separate <panel>, not nested in the
// main one). The wv-bm-* classes are unique to this module.
const BM_POPUP_CSS = [
    "#" + BM_INNER_ID + ",.wv-bm-flyout-inner{display:flex;flex-direction:column;min-width:230px;max-width:340px;max-height:460px;padding:4px;}",
    ".wv-bm-flyout-inner{overflow:auto;}",
    "#" + BM_INNER_ID + " .wv-bm-actions{display:flex;align-items:center;gap:2px;padding:2px 4px;}",
    ".wv-bm-iconbtn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:none;cursor:pointer;border-radius:5px;}",
    ".wv-bm-iconbtn:hover{background:var(--fill-quinary,rgba(128,128,128,.16));}",
    // 20px icons in 28px buttons, matching the collections toolbar; dimmed
    // like the toolbar icons and brightening on hover.
    ".wv-bm-iconbtn img{width:20px;height:20px;-moz-context-properties:fill,stroke;fill:var(--fill-secondary,rgba(127,127,127,.85));stroke:var(--fill-secondary,rgba(127,127,127,.85));}",
    ".wv-bm-iconbtn:hover img{fill:var(--fill-primary,currentColor);stroke:var(--fill-primary,currentColor);}",
    "#" + BM_INNER_ID + " .wv-bm-sep{height:1px;background:var(--fill-quinary,rgba(128,128,128,.22));margin:4px 2px;}",
    ".wv-bm-scroll{overflow:auto;min-height:0;}",
    ".wv-bm-row{display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;border-radius:4px;}",
    ".wv-bm-row:hover{background:var(--fill-quinary,rgba(128,128,128,.16));}",
    ".wv-bm-row.wv-bm-dragging{opacity:.4;}",
    ".wv-bm-row.wv-bm-dragover{box-shadow:inset 0 2px 0 0 var(--color-accent,#4072e5);}",
    ".wv-bm-row.wv-bm-dragover-bottom{box-shadow:inset 0 -2px 0 0 var(--color-accent,#4072e5);}",
    ".wv-bm-row.wv-bm-dragover-into{background:var(--fill-quinary,rgba(128,128,128,.16));box-shadow:inset 0 0 0 2px var(--color-accent,#4072e5);}",
    ".wv-bm-arrow{flex:0 0 auto;margin-left:auto;opacity:.55;padding-left:8px;}",
    ".wv-bm-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".wv-bm-empty{padding:8px 10px;opacity:.6;font-size:.9em;}",
].join("");

class _BookmarksMixin {
    [k: string]: any;

    // ---- File-backed store ------------------------------------------------

    _bmDir() {
        return PathUtils.join(Zotero.DataDirectory.dir, "weavero");
    }

    _bmFilePath() {
        return PathUtils.join(this._bmDir(), "bookmarks.json");
    }

    _bmNormalize(doc: any) {
        if (!doc || typeof doc !== "object" || !Array.isArray(doc.bookmarks)) {
            return { version: 2, bookmarks: [] };
        }
        const fix = (nodes: any[]): any[] => {
            if (!Array.isArray(nodes)) return [];
            for (const n of nodes) {
                if (n && n.type === "folder") {
                    if (!Array.isArray(n.children)) n.children = [];
                    if (typeof n.expanded !== "boolean") n.expanded = true;
                    fix(n.children);
                }
            }
            return nodes;
        };
        const readerBookmarks = (doc.readerBookmarks && typeof doc.readerBookmarks === "object")
            ? doc.readerBookmarks : {};
        return { version: doc.version || 2, bookmarks: fix(doc.bookmarks), readerBookmarks };
    }

    // ---- Reader (in-document) bookmarks -----------------------------------
    // Per-attachment bookmarks shown in the reader's Bookmarks tab, split into
    // two manually-ordered, foldered sections:
    //   readerBookmarks[<libraryID>:<itemKey>] = { local: Node[], global: Node[] }
    // `local` = "In this document" (positions/selected-text/this-doc
    // annotations); `global` = "Elsewhere in Zotero" (items/collections/…).
    // A Node is a bookmark record or a folder {id, type:"folder", name,
    // expanded, children: Node[]}. Order within a section is the array order
    // (user-draggable); folders may nest. Bookmark records keep their prior
    // shape (location bookmarks: { id, type:"position"|"text", viewType,
    // location, pageLabel, position?, label }; target bookmarks mirror the
    // collections-pane shapes). A legacy flat array is migrated to
    // {local, global} on first access (see _bmReaderDoc).

    _bmReaderKey(libraryID: number, itemKey: string) {
        return libraryID + ":" + itemKey;
    }

    _bmReaderStore() {
        if (!this._bmDoc) return {};
        if (!this._bmDoc.readerBookmarks || typeof this._bmDoc.readerBookmarks !== "object") {
            this._bmDoc.readerBookmarks = {};
        }
        return this._bmDoc.readerBookmarks;
    }

    /** Which section a record belongs to, by type/identity (no reader needed —
     *  mirrors _wvReaderBookmarkIsLocal but keyed off the attachment). */
    _bmReaderEntrySection(attLibraryID: number, attItemKey: string, rec: any): "local" | "global" {
        try {
            if (!rec) return "global";
            if (rec.type === "position" || rec.type === "text" || rec.type === "folder") {
                // Folders carry their own section via _section; default local.
                if (rec.type === "folder") return rec._section === "global" ? "global" : "local";
                return "local";
            }
            if (rec.type === "item") {
                if (rec.libraryID === attLibraryID && rec.itemKey === attItemKey) return "local";
                const it: any = Zotero.Items.getByLibraryAndKey(rec.libraryID, rec.itemKey);
                const att: any = Zotero.Items.getByLibraryAndKey(attLibraryID, attItemKey);
                if (it && att && typeof it.isAnnotation === "function" && it.isAnnotation()
                    && it.parentItemID === att.id) return "local";
            }
        } catch (_) {}
        return "global";
    }

    /** The per-attachment store value as { local: Node[], global: Node[] },
     *  migrating a legacy flat array (split by section) on first access. */
    _bmReaderDoc(libraryID: number, itemKey: string): any {
        const store = this._bmReaderStore();
        const key = this._bmReaderKey(libraryID, itemKey);
        let v = store[key];
        if (Array.isArray(v)) {
            const local: any[] = [], global: any[] = [];
            for (const e of v) (this._bmReaderEntrySection(libraryID, itemKey, e) === "local" ? local : global).push(e);
            v = { local, global };
            store[key] = v;
        } else if (!v || typeof v !== "object") {
            v = { local: [], global: [] };
            store[key] = v;
        } else {
            if (!Array.isArray(v.local)) v.local = [];
            if (!Array.isArray(v.global)) v.global = [];
        }
        return v;
    }

    /** The tree array for one section. */
    _bmReaderSection(libraryID: number, itemKey: string, section: "local" | "global"): any[] {
        const doc = this._bmReaderDoc(libraryID, itemKey);
        return section === "global" ? doc.global : doc.local;
    }

    /** Flattened bookmark records (folders excluded) across BOTH sections —
     *  used for counts and identity checks. */
    _bmReaderList(libraryID: number, itemKey: string): any[] {
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const out: any[] = [];
        const walk = (nodes: any[]) => {
            for (const n of nodes) {
                if (n.type === "folder") walk(n.children || []);
                else out.push(n);
            }
        };
        walk(doc.local); walk(doc.global);
        return out;
    }

    /** Add a bookmark to the appropriate section's root. `rec` carries the
     *  type-specific fields (location bookmark or collections-pane-style
     *  target). Target types are de-duped by identity across both sections;
     *  locations may repeat. */
    async _bmReaderAdd(libraryID: number, itemKey: string, rec: any, opts?: any) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        rec = rec || {};
        const section = this._bmReaderEntrySection(libraryID, itemKey, rec);
        // Drag-to-bookmark passes allowDuplicate so the SAME annotation can be
        // filed into several folders (user choice). The "+" picker leaves it off,
        // so an accidental double-add there is still de-duplicated.
        if (!(opts && opts.allowDuplicate) && rec.type && rec.type !== "position" && rec.type !== "text") {
            const dupe = (e: any) => {
                if (e.type !== rec.type) return false;
                if (rec.type === "item") return e.libraryID === rec.libraryID && e.itemKey === rec.itemKey;
                if (rec.type === "collection") return e.libraryID === rec.libraryID && e.collectionKey === rec.collectionKey;
                if (rec.type === "library") return e.libraryID === rec.libraryID;
                if (rec.type === "treerow") return e.rowID === rec.rowID;
                return false;
            };
            if (this._bmReaderList(libraryID, itemKey).some(dupe)) return null;
        }
        const entry = Object.assign(
            { id: "wv-" + Zotero.Utilities.randomString(8), type: "position", created: new Date().toISOString() },
            rec);
        // Remember the auto-generated label immutably so a later rename (which
        // overwrites `label` for DISPLAY only) never loses the original text.
        // Bookmark-only: lives in our JSON store, never written to the Zotero item.
        if (entry.type !== "folder" && entry.label && entry.originalLabel == null) {
            entry.originalLabel = entry.label;
        }
        doc[section].push(entry);
        await this._bmPersist();
        return entry;
    }

    /** Remove a node (bookmark or folder + its contents) from either section. */
    async _bmReaderRemove(libraryID: number, itemKey: string, id: string) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const loc = this._bmLocate(id, doc.local) || this._bmLocate(id, doc.global);
        if (!loc) return;
        loc.parentArr.splice(loc.index, 1);
        if (!doc.local.length && !doc.global.length) {
            delete this._bmReaderStore()[this._bmReaderKey(libraryID, itemKey)];
        }
        await this._bmPersist();
    }

    /** Rename a bookmark (label) or folder (name) anywhere in either tree. For a
     *  bookmark this sets a CUSTOM display name and flags it `renamed` so the
     *  live source sync no longer overwrites `label`. `originalLabel` is left
     *  alone (it keeps tracking the source). Bookmark-record only — the Zotero
     *  item is never touched. */
    async _bmReaderRename(libraryID: number, itemKey: string, id: string, label: string) {
        await this._bmInit();
        if (!label) return;
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const loc = this._bmLocate(id, doc.local) || this._bmLocate(id, doc.global);
        if (!loc) return;
        if (loc.entry.type === "folder") loc.entry.name = label;
        else { loc.entry.label = label; loc.entry.renamed = true; }
        await this._bmPersist();
    }

    /** The live source name for a bookmark's target — annotation text/comment,
     *  item title, collection/library name, or page. Returns null for targets
     *  with no derivable live source (text selections; deleted items). READ-ONLY:
     *  never writes to the item. */
    _bmReaderDeriveSourceLabel(bm: any): string | null {
        try {
            if (!bm) return null;
            switch (bm.type) {
                case "item": {
                    const it: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
                    if (!it) return null;
                    if (it.isAnnotation && it.isAnnotation()) return this._wvReaderAnnLabel(it);
                    let title = "";
                    try { title = it.getDisplayTitle ? it.getDisplayTitle() : (it.getField ? it.getField("title") : ""); } catch (_) {}
                    return title ? String(title) : null;
                }
                case "collection": {
                    const c: any = (bm.collectionKey && Zotero.Collections.getByLibraryAndKey)
                        ? Zotero.Collections.getByLibraryAndKey(bm.libraryID, bm.collectionKey) : null;
                    return (c && c.name) ? String(c.name) : null;
                }
                case "library": {
                    const lib: any = Zotero.Libraries.get(bm.libraryID);
                    return (lib && lib.name) ? String(lib.name) : null;
                }
                case "position":
                    return bm.pageLabel ? ("Page " + bm.pageLabel) : null;
                default:
                    return null;   // text (no live source), treerow (not re-derived here)
            }
        } catch (_) { return null; }
    }

    /** Whether the user has given this bookmark a custom name. Uses the explicit
     *  `renamed` flag; falls back (for pre-flag bookmarks) to comparing label vs
     *  originalLabel. */
    _bmReaderIsRenamed(bm: any): boolean {
        if (!bm || bm.type === "folder") return false;
        if (bm.renamed != null) return !!bm.renamed;
        return bm.originalLabel != null && bm.label !== bm.originalLabel;
    }

    /** The bookmark's ORIGINAL (auto-generated) name — the live source name when
     *  available, else the last stored `originalLabel`. Used for the tooltip on a
     *  renamed bookmark and for "Reset to original name". READ-ONLY. */
    _bmReaderOriginalLabel(bm: any): string | null {
        if (!bm || bm.type === "folder") return null;
        const live = this._bmReaderDeriveSourceLabel(bm);
        if (live) return live;
        return bm.originalLabel != null ? String(bm.originalLabel) : null;
    }

    /** The page label to show for a bookmark: the stored `pageLabel` (position /
     *  text bookmarks capture it at creation), else — for an annotation item
     *  bookmark — the annotation's live page. Empty string when there's no page.
     *  READ-ONLY. */
    _bmReaderPageLabel(bm: any): string {
        try {
            if (!bm) return "";
            if (bm.pageLabel) return String(bm.pageLabel);
            if (bm.type === "item") {
                const it: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
                if (it && it.isAnnotation && it.isAnnotation() && it.annotationPageLabel) {
                    return String(it.annotationPageLabel);
                }
            }
            return "";
        } catch (_) { return ""; }
    }

    /** Keep `originalLabel` in sync with the live source for every bookmark of
     *  this attachment, and (when NOT renamed) `label` too, so default names
     *  track edits to the underlying annotation/item/collection/library. The
     *  original data stays current even for renamed bookmarks where it isn't
     *  displayed. Synchronous in-memory update + one debounced persist if
     *  anything changed. Item never modified. */
    _bmReaderSyncLabels(libraryID: number, itemKey: string) {
        try {
            if (!this._bmDoc) return;
            const doc = this._bmReaderDoc(libraryID, itemKey);
            let changed = false;
            const walk = (nodes: any[]) => {
                for (const n of (nodes || [])) {
                    if (!n) continue;
                    if (n.type === "folder") { walk(n.children || []); continue; }
                    const renamed = this._bmReaderIsRenamed(n);
                    if (n.renamed == null) { n.renamed = renamed; changed = true; }   // migrate old records
                    const derived = this._bmReaderDeriveSourceLabel(n);
                    if (derived == null) continue;                                    // no live source — keep stored
                    if (n.originalLabel !== derived) { n.originalLabel = derived; changed = true; }
                    if (!renamed && n.label !== derived) { n.label = derived; changed = true; }
                }
            };
            walk(doc.local); walk(doc.global);
            if (changed) this._bmPersist();
        } catch (_) {}
    }

    /** Reset a bookmark's display name back to the original (live source) name
     *  and clear its renamed flag, so it resumes tracking the source. Bookmark-
     *  record only — the Zotero item is untouched. */
    async _bmReaderResetLabel(libraryID: number, itemKey: string, id: string) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const loc = this._bmLocate(id, doc.local) || this._bmLocate(id, doc.global);
        if (!loc || loc.entry.type === "folder") return;
        const orig = this._bmReaderOriginalLabel(loc.entry);
        if (!orig) return;
        loc.entry.label = orig;
        loc.entry.originalLabel = orig;
        loc.entry.renamed = false;
        await this._bmPersist();
    }

    /** Sets of the item + collection keys bookmarked for this attachment — for a
     *  cheap test of whether a changed item/collection affects this pane.
     *  READ-ONLY. */
    _bmReaderBookmarkedKeys(libraryID: number, itemKey: string): { items: Set<string>; collections: Set<string> } {
        const out = { items: new Set<string>(), collections: new Set<string>() };
        try {
            if (!this._bmDoc) return out;
            const doc = this._bmReaderDoc(libraryID, itemKey);
            const walk = (nodes: any[]) => {
                for (const n of (nodes || [])) {
                    if (!n) continue;
                    if (n.type === "folder") { walk(n.children || []); continue; }
                    if (n.type === "item" && n.itemKey) out.items.add(n.itemKey);
                    else if (n.type === "collection" && n.collectionKey) out.collections.add(n.collectionKey);
                }
            };
            walk(doc.local); walk(doc.global);
        } catch (_) {}
        return out;
    }

    /** Reorder / nest `draggedId` relative to `targetId` (mode
     *  before|after|into) WITHIN its section. Cross-section moves are refused
     *  (a bookmark's section is intrinsic to its type). A null target drops at
     *  the dragged item's section root. */
    async _bmReaderMove(libraryID: number, itemKey: string, draggedId: string, targetId: string | null, mode: string) {
        await this._bmInit();
        if (draggedId === targetId) return;
        const doc = this._bmReaderDoc(libraryID, itemKey);
        let srcSection: any = null, src: any = null;
        for (const s of ["local", "global"]) { const f = this._bmLocate(draggedId, doc[s]); if (f) { src = f; srcSection = s; break; } }
        if (!src) return;
        if (targetId) {
            let tgtSection: any = null;
            for (const s of ["local", "global"]) { if (this._bmLocate(targetId, doc[s])) { tgtSection = s; break; } }
            if (tgtSection && tgtSection !== srcSection) return;   // no cross-section moves
        }
        if (src.entry.type === "folder" && targetId && this._bmIsDescendant(targetId, src.entry)) return;
        const arr = doc[srcSection];
        const moved = src.parentArr.splice(src.index, 1)[0];
        if (mode === "into" && targetId) {
            const t = this._bmLocate(targetId, arr);
            if (t && t.entry.type === "folder") { t.entry.children = t.entry.children || []; t.entry.children.push(moved); t.entry.expanded = true; }
            else arr.push(moved);
        } else if (targetId) {
            const t = this._bmLocate(targetId, arr);
            if (!t) arr.push(moved);
            else t.parentArr.splice(t.index + (mode === "after" ? 1 : 0), 0, moved);
        } else {
            arr.push(moved);
        }
        await this._bmPersist();
    }

    /** Create a folder at a section's root, or inside `parentId` (a folder in
     *  the same section) for a subfolder; returns its id. */
    async _bmReaderAddFolder(libraryID: number, itemKey: string, section: "local" | "global", name: string, parentId?: string) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const folder = {
            id: "wv-" + Zotero.Utilities.randomString(8), type: "folder",
            name: name || "New Folder", expanded: true, _section: section,
            created: new Date().toISOString(), children: [] as any[],
        };
        let arr: any[] = (section === "global" ? doc.global : doc.local);
        if (parentId) {
            const loc = this._bmLocate(parentId, doc.local) || this._bmLocate(parentId, doc.global);
            if (loc && loc.entry.type === "folder") {
                loc.entry.children = loc.entry.children || [];
                loc.entry.expanded = true;
                arr = loc.entry.children;
            }
        }
        arr.push(folder);
        await this._bmPersist();
        return folder.id;
    }

    /** Merge updates (e.g. a moved `position` + new pageLabel/label) onto a
     *  reader bookmark anywhere in either section tree. */
    async _bmReaderUpdatePosition(libraryID: number, itemKey: string, id: string, updates: any) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const loc = this._bmLocate(id, doc.local) || this._bmLocate(id, doc.global);
        if (!loc || loc.entry.type === "folder") return;
        Object.assign(loc.entry, updates || {});
        await this._bmPersist();
    }

    async _bmReaderToggleFolder(libraryID: number, itemKey: string, id: string) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const loc = this._bmLocate(id, doc.local) || this._bmLocate(id, doc.global);
        if (!loc || loc.entry.type !== "folder") return;
        loc.entry.expanded = !loc.entry.expanded;
        await this._bmPersist();
    }

    /** Load the file into `_bmDoc` once (cached promise). Missing → fresh;
     *  unreadable → backed up to `*.corrupt-<ts>` and start clean. */
    _bmInit() {
        if (this._bmInitPromise) return this._bmInitPromise;
        this._bmInitPromise = (async () => {
            const path = this._bmFilePath();
            try {
                const text: any = await Zotero.File.getContentsAsync(path);
                this._bmDoc = this._bmNormalize(JSON.parse(text));
            } catch (e) {
                let exists = false;
                try { exists = await IOUtils.exists(path); } catch (_) {}
                if (exists) {
                    const bak = path + ".corrupt-" + Date.now();
                    try { await IOUtils.move(path, bak); } catch (_) {}
                    Zotero.debug("[Weavero] bookmarks.json unreadable, backed up to "
                        + bak + ": " + e);
                }
                this._bmDoc = { version: 2, bookmarks: [] };
            }
            return this._bmDoc;
        })();
        return this._bmInitPromise;
    }

    /** Root-level entries (folders + bookmarks). */
    _bmGetAll() {
        return (this._bmDoc && Array.isArray(this._bmDoc.bookmarks))
            ? this._bmDoc.bookmarks.slice()
            : [];
    }

    _bmRootArray() {
        return (this._bmDoc && Array.isArray(this._bmDoc.bookmarks))
            ? this._bmDoc.bookmarks : [];
    }

    /** Flattened list of every entry in the tree (folders included). */
    _bmFlatten(nodes?: any[], out?: any[]): any[] {
        nodes = nodes || this._bmRootArray();
        out = out || [];
        for (const n of nodes) {
            out.push(n);
            if (n.type === "folder" && Array.isArray(n.children)) {
                this._bmFlatten(n.children, out);
            }
        }
        return out;
    }

    /** Locate an entry anywhere in the tree → { parentArr, index, entry }. */
    _bmLocate(id: string, nodes?: any[]): any {
        nodes = nodes || this._bmRootArray();
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === id) return { parentArr: nodes, index: i, entry: nodes[i] };
            if (nodes[i].type === "folder" && Array.isArray(nodes[i].children)) {
                const found = this._bmLocate(id, nodes[i].children);
                if (found) return found;
            }
        }
        return null;
    }

    _bmFindFolder(id: string) {
        const loc = this._bmLocate(id);
        return (loc && loc.entry.type === "folder") ? loc.entry : null;
    }

    /** True if `id` is `folder` itself or anywhere inside it. */
    _bmIsDescendant(id: string, folder: any): boolean {
        if (!folder) return false;
        if (folder.id === id) return true;
        if (!Array.isArray(folder.children)) return false;
        for (const c of folder.children) {
            if (c.id === id) return true;
            if (c.type === "folder" && this._bmIsDescendant(id, c)) return true;
        }
        return false;
    }

    /** Ensure item data for every referenced library is loaded (icons/
     *  labels). First open after a restart may not have group libraries
     *  cached yet, leaving icons blank until the next open. */
    async _bmPreloadTargets() {
        const libIDs = new Set<number>();
        for (const bm of this._bmFlatten()) {
            if (typeof bm.libraryID === "number") libIDs.add(bm.libraryID);
        }
        for (const libID of libIDs) {
            try {
                const lib: any = Zotero.Libraries.get(libID);
                if (lib && typeof lib.waitForDataLoad === "function") {
                    await lib.waitForDataLoad("item");
                }
            } catch (e) {}
        }
    }

    _bmHasItem(libraryID: number, itemKey: string) {
        return this._bmFlatten().some((b: any) =>
            b.type === "item" && b.libraryID === libraryID && b.itemKey === itemKey);
    }

    _bmHasCollection(libraryID: number, collectionKey: string) {
        return this._bmFlatten().some((b: any) =>
            b.type === "collection" && b.libraryID === libraryID
            && b.collectionKey === collectionKey);
    }

    _bmHasLibrary(libraryID: number) {
        return this._bmFlatten().some((b: any) =>
            b.type === "library" && b.libraryID === libraryID);
    }

    /** A "treerow" bookmark stores a collections-tree row's selectByID id
     *  (e.g. 'S123' saved search, 'D1' duplicates, 'U1' unfiled, 'T1'
     *  trash, 'P1' my publications). */
    _bmHasTreeRow(rowID: string) {
        return this._bmFlatten().some((b: any) =>
            b.type === "treerow" && b.rowID === rowID);
    }

    _bmAddTreeRowSync(rowID: string, libraryID: number, label: string) {
        if (!this._bmDoc || !rowID || this._bmHasTreeRow(rowID)) return false;
        this._bmDoc.bookmarks.push({
            id: "wv-" + Zotero.Utilities.randomString(8),
            type: "treerow",
            rowID,
            libraryID,
            label: label || rowID,
            created: new Date().toISOString(),
        });
        return true;
    }

    /** Atomic, serialized write of the current document to disk. */
    _bmPersist() {
        if (!this._bmDoc) return Promise.resolve();
        const snapshot = JSON.stringify(this._bmDoc, null, 2);
        const dir = this._bmDir();
        const path = this._bmFilePath();
        this._bmWriteChain = (this._bmWriteChain || Promise.resolve())
            .then(async () => {
                await IOUtils.makeDirectory(dir, { ignoreExisting: true });
                await IOUtils.writeUTF8(path, snapshot, { tmpPath: path + ".tmp" });
            })
            .catch((e: any) =>
                Zotero.debug("[Weavero] bookmarks persist failed: " + e));
        return this._bmWriteChain;
    }

    _bmAddItemSync(item: any) {
        if (!item || !this._bmDoc) return false;
        const libraryID = item.libraryID;
        const itemKey = item.key;
        if (!itemKey || this._bmHasItem(libraryID, itemKey)) return false;
        let label = "";
        try {
            label = (typeof item.getDisplayTitle === "function")
                ? item.getDisplayTitle()
                : (item.getField ? item.getField("title") : "");
        } catch (_) {}
        this._bmDoc.bookmarks.push({
            id: "wv-" + Zotero.Utilities.randomString(8),
            type: "item",
            libraryID,
            itemKey,
            label: label || itemKey,
            created: new Date().toISOString(),
        });
        return true;
    }

    _bmAddCollectionSync(collection: any) {
        if (!collection || !this._bmDoc) return false;
        const libraryID = collection.libraryID;
        const collectionKey = collection.key;
        if (!collectionKey || this._bmHasCollection(libraryID, collectionKey)) return false;
        let label = "";
        try { label = collection.name || ""; } catch (_) {}
        this._bmDoc.bookmarks.push({
            id: "wv-" + Zotero.Utilities.randomString(8),
            type: "collection",
            libraryID,
            collectionKey,
            label: label || collectionKey,
            created: new Date().toISOString(),
        });
        return true;
    }

    _bmAddLibrarySync(libraryID: number) {
        if (!this._bmDoc || typeof libraryID !== "number") return false;
        if (this._bmHasLibrary(libraryID)) return false;
        let label = "";
        try { const lib: any = Zotero.Libraries.get(libraryID); label = lib && lib.name; } catch (_) {}
        this._bmDoc.bookmarks.push({
            id: "wv-" + Zotero.Utilities.randomString(8),
            type: "library",
            libraryID,
            label: label || ("Library " + libraryID),
            created: new Date().toISOString(),
        });
        return true;
    }

    async _bmBookmarkLibrary(libraryID: number) {
        try {
            await this._bmInit();
            if (this._bmAddLibrarySync(libraryID)) await this._bmPersist();
        } catch (e) {
            Zotero.debug("[Weavero] _bmBookmarkLibrary err: " + e);
        }
    }

    async _bmBookmarkCollection(collection?: any) {
        try {
            await this._bmInit();
            if (!collection) {
                const win = Zotero.getMainWindow();
                const zp = win && win.ZoteroPane;
                collection = (zp && typeof zp.getSelectedCollection === "function")
                    ? zp.getSelectedCollection() : null;
            }
            if (!collection || !collection.key) return;
            if (this._bmAddCollectionSync(collection)) await this._bmPersist();
        } catch (e) {
            Zotero.debug("[Weavero] _bmBookmarkCollection err: " + e);
        }
    }

    /** Remove an entry (anywhere in the tree). For a folder this drops it
     *  and its contents; folders are normally removed via _bmDeleteFolder. */
    async _bmRemove(id: string) {
        await this._bmInit();
        const loc = this._bmLocate(id);
        if (!loc) return;
        loc.parentArr.splice(loc.index, 1);
        await this._bmPersist();
    }

    // ---- Folders ----------------------------------------------------------

    async _bmAddFolder(name: string, parentId?: string) {
        await this._bmInit();
        if (!this._bmDoc) return null;
        const folder = {
            id: "wv-" + Zotero.Utilities.randomString(8),
            type: "folder",
            name: name || "New Folder",
            expanded: true,
            created: new Date().toISOString(),
            children: [] as any[],
        };
        let arr = this._bmDoc.bookmarks;
        if (parentId) {
            const f = this._bmFindFolder(parentId);
            if (f) { f.children = f.children || []; arr = f.children; }
        }
        arr.push(folder);
        await this._bmPersist();
        return folder.id;
    }

    async _bmRenameFolder(id: string, name: string) {
        await this._bmInit();
        const f = this._bmFindFolder(id);
        if (!f || !name) return;
        f.name = name;
        await this._bmPersist();
    }

    /** Rename a bookmark's display label (non-folder entry, anywhere in tree). */
    async _bmRenameBookmark(id: string, label: string) {
        await this._bmInit();
        const loc = this._bmLocate(id);
        if (!loc || !loc.entry || loc.entry.type === "folder" || !label) return;
        loc.entry.label = label;
        await this._bmPersist();
    }

    async _bmToggleFolder(id: string) {
        await this._bmInit();
        const f = this._bmFindFolder(id);
        if (!f) return;
        f.expanded = !f.expanded;
        await this._bmPersist();
    }

    /** Count every entry nested inside a folder (bookmarks + subfolders,
     *  recursively) — for the delete confirmation. */
    _bmCountDescendants(folder: any): number {
        let n = 0;
        const kids = (folder && Array.isArray(folder.children)) ? folder.children : [];
        for (const c of kids) {
            n += 1;
            if (c.type === "folder") n += this._bmCountDescendants(c);
        }
        return n;
    }

    /** Move an entry next to / into a target. mode ∈ "before"|"after"|"into". */
    async _bmMove(draggedId: string, targetId: string | null, mode: string) {
        await this._bmInit();
        if (!this._bmDoc || draggedId === targetId) return;
        const src = this._bmLocate(draggedId);
        if (!src) return;
        // Never drop a folder into itself or one of its descendants.
        if (src.entry.type === "folder" && targetId
            && this._bmIsDescendant(targetId, src.entry)) return;
        const moved = src.parentArr.splice(src.index, 1)[0];
        if (mode === "into" && targetId) {
            const f = this._bmFindFolder(targetId);
            if (f) { f.children = f.children || []; f.children.push(moved); f.expanded = true; }
            else this._bmDoc.bookmarks.push(moved);
        } else {
            const tgt = targetId ? this._bmLocate(targetId) : null;
            if (!tgt) {
                this._bmDoc.bookmarks.push(moved);
            } else {
                const idx = tgt.index + (mode === "after" ? 1 : 0);
                tgt.parentArr.splice(idx, 0, moved);
            }
        }
        await this._bmPersist();
    }

    /** Bookmark the items currently selected in the items list. (Retained
     *  for a future right-click "Bookmark Item"; not wired to the UI.) */
    async _bmBookmarkSelectedItems() {
        try {
            await this._bmInit();
            const win = Zotero.getMainWindow();
            const items = (win && win.ZoteroPane
                && typeof win.ZoteroPane.getSelectedItems === "function")
                ? win.ZoteroPane.getSelectedItems() : [];
            if (!items || !items.length) return;
            let added = 0;
            for (const it of items) {
                if (this._bmAddItemSync(it)) added++;
            }
            if (added) await this._bmPersist();
        } catch (e) {
            Zotero.debug("[Weavero] _bmBookmarkSelectedItems err: " + e);
        }
    }

    /** Bookmark items/collections dropped onto the toolbar icon. Payloads
     *  (zotero/item, zotero/collection) are comma-separated IDs, read
     *  synchronously by the drop handler. */
    async _bmDropAdd(itemData: string, colData: string, searchData?: string) {
        try {
            await this._bmInit();
            const ids = (s: string) => (s || "").split(",")
                .map(x => parseInt(x, 10)).filter(n => !isNaN(n));
            let added = 0;
            for (const id of ids(itemData)) {
                const it = Zotero.Items.get(id);
                if (it && this._bmAddItemSync(it)) added++;
            }
            for (const id of ids(colData)) {
                const col = Zotero.Collections.get(id);
                if (col && this._bmAddCollectionSync(col)) added++;
            }
            for (const id of ids(searchData || "")) {
                const s: any = Zotero.Searches.get(id);
                if (s && this._bmAddTreeRowSync("S" + id, s.libraryID, s.name)) added++;
            }
            if (added) await this._bmPersist();
            this._bmRenderPopupList();
        } catch (e) {
            Zotero.debug("[Weavero] _bmDropAdd err: " + e);
        }
    }

    /** Open Zotero's select-items dialog (like "Add Related") and bookmark
     *  every chosen item. No library filter — bookmarks may span libraries. */
    async _bmAddBookmarksDialog() {
        try {
            await this._bmInit();
            const win = Zotero.getMainWindow();
            if (!win) return;
            const io: any = {
                dataIn: null,
                dataOut: null,
                deferred: Zotero.Promise.defer(),
                itemTreeID: "weavero-bookmarks-select",
            };
            const dlg: any = win.openDialog(
                "chrome://zotero/content/selectItemsDialog.xhtml", "",
                "chrome,dialog=no,centerscreen,resizable=yes", io);
            // The dialog only returns selected items. If the user instead
            // highlights a library/collection in its tree and hits Select,
            // capture that row at accept-time so we can bookmark it.
            let pickedCollection: any = null;
            let pickedLibraryID: any = null;
            let pickedTreeRow: any = null;
            try {
                dlg && dlg.addEventListener("dialogaccept", () => {
                    try {
                        const cv = dlg.collectionsView;
                        const tr = cv && cv.selectedTreeRow;
                        if (!tr) return;
                        if (typeof tr.isCollection === "function" && tr.isCollection()) {
                            pickedCollection = tr.ref;
                        } else if (this._bmTreeRowIsLibrary(tr) && tr.ref) {
                            pickedLibraryID = tr.ref.libraryID;
                        } else if (this._bmTreeRowIsSpecial(tr) && tr.id && tr.getName) {
                            pickedTreeRow = {
                                rowID: tr.id,
                                libraryID: tr.ref && tr.ref.libraryID,
                                label: tr.getName(),
                            };
                        }
                    } catch (e) {}
                }, true);
            } catch (e) {}
            await io.deferred.promise;
            let added = 0;
            if (io.dataOut && io.dataOut.length) {
                const targets: any = await Zotero.Items.getAsync(io.dataOut);
                for (const it of (targets || [])) if (this._bmAddItemSync(it)) added++;
            } else if (pickedCollection && pickedCollection.key) {
                if (this._bmAddCollectionSync(pickedCollection)) added++;
            } else if (typeof pickedLibraryID === "number") {
                if (this._bmAddLibrarySync(pickedLibraryID)) added++;
            } else if (pickedTreeRow) {
                if (this._bmAddTreeRowSync(pickedTreeRow.rowID, pickedTreeRow.libraryID,
                    pickedTreeRow.label)) added++;
            }
            if (added) await this._bmPersist();
            this._bmRenderPopupList(win);
        } catch (e) {
            Zotero.debug("[Weavero] _bmAddBookmarksDialog err: " + e);
        }
    }

    /** Modal name prompt (folder create/rename). Returns trimmed string or null. */
    _bmPromptName(win: any, title: string, initial: string) {
        try {
            const input = { value: initial || "" };
            const ok = Services.prompt.prompt(win, title, "Name:", input, null, { value: false });
            if (!ok) return null;
            const v = (input.value || "").trim();
            return v || null;
        } catch (e) {
            Zotero.debug("[Weavero] _bmPromptName err: " + e);
            return null;
        }
    }

    // ---- Navigation / opening ---------------------------------------------

    /** Row click. Modifiers pick the destination without the context menu
     *  (mirrors Zotero's Shift = alternate-window convention):
     *    • plain click     → open in a new reader tab
     *    • Shift-click     → open in a new window
     *    • Ctrl/Cmd-click  → show in library (reveal, don't open)
     *  Targets with nothing to open fall back to showing in the library. */
    async _bmActivateBookmark(bm: any, event: any) {
        try {
            if (!bm) return;
            if (event && (event.ctrlKey || event.metaKey)) {
                await this._bmShowInLibrary(bm);
                return;
            }
            const target = await this._bmResolveOpenTarget(bm);
            if (target) {
                await this._bmOpenInReader(bm, !!(event && event.shiftKey));
                return;
            }
            await this._bmShowInLibrary(bm);
        } catch (e) {
            Zotero.debug("[Weavero] _bmActivateBookmark err: " + e);
        }
    }

    async _bmShowInLibrary(bm: any) {
        try {
            if (!bm) return;
            const win = Zotero.getMainWindow();
            const zp = win && win.ZoteroPane;
            if (!zp) return;
            if (bm.type === "library") {
                const cv = zp.collectionsView;
                if (cv && typeof cv.selectLibrary === "function") {
                    await cv.selectLibrary(bm.libraryID);
                }
                return;
            }
            if (bm.type === "treerow") {
                const cv = zp.collectionsView;
                if (cv && typeof cv.selectByID === "function") {
                    await cv.selectByID(bm.rowID);
                }
                return;
            }
            if (bm.type === "collection") {
                const col = Zotero.Collections.getByLibraryAndKey(
                    bm.libraryID, bm.collectionKey);
                if (col && zp.collectionsView
                    && typeof zp.collectionsView.selectCollection === "function") {
                    await zp.collectionsView.selectCollection(col.id);
                }
                return;
            }
            let item: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
            if (!item) return;
            while (item.parentItem) item = item.parentItem;
            await zp.selectItem(item.id);
        } catch (e) {
            Zotero.debug("[Weavero] _bmShowInLibrary err: " + e);
        }
    }

    /** Resolve a bookmark to a reader-openable attachment + location +
     *  type label, or null if there's nothing to open in the reader. */
    async _bmResolveOpenTarget(bm: any) {
        try {
            if (!bm || bm.type === "collection" || bm.type === "folder"
                || bm.type === "library" || bm.type === "treerow") return null;
            const item: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
            if (!item) return null;
            let attachment: any = null;
            let location: any = null;
            if (typeof item.isAnnotation === "function" && item.isAnnotation()) {
                attachment = item.parentItem
                    || (item.parentItemID && Zotero.Items.get(item.parentItemID));
                location = { annotationID: item.key };
            } else if (typeof item.isAttachment === "function" && item.isAttachment()) {
                attachment = item;
            } else if (typeof item.isRegularItem === "function" && item.isRegularItem()) {
                attachment = await item.getBestAttachment();
            }
            if (!attachment) return null;
            let typeLabel = null;
            if (attachment.isPDFAttachment && attachment.isPDFAttachment()) typeLabel = "PDF";
            else if (attachment.isEPUBAttachment && attachment.isEPUBAttachment()) typeLabel = "EPUB";
            else if (attachment.isSnapshotAttachment && attachment.isSnapshotAttachment()) typeLabel = "Snapshot";
            else return null; // not a reader type → no tab/window open
            return { attachment, location, typeLabel };
        } catch (e) {
            Zotero.debug("[Weavero] _bmResolveOpenTarget err: " + e);
            return null;
        }
    }

    async _bmOpenInReader(bm: any, openInWindow: boolean) {
        try {
            const t = await this._bmResolveOpenTarget(bm);
            if (!t) return;
            await Zotero.Reader.open(t.attachment.id, t.location || null,
                { openInWindow: !!openInWindow });
        } catch (e) {
            Zotero.debug("[Weavero] _bmOpenInReader err: " + e);
        }
    }

    // ---- Icons ------------------------------------------------------------

    _bmIsDark(win: any) {
        try {
            return !!(win && win.matchMedia
                && win.matchMedia("(prefers-color-scheme: dark)").matches);
        } catch (e) { return true; }
    }

    _bmShowInLibraryIcon(bm: any, win: any) {
        const theme = this._bmIsDark(win) ? "dark" : "light";
        let name = "library.svg";
        try {
            const lib: any = Zotero.Libraries.get(bm.libraryID);
            if (lib && lib.libraryType === "group") name = "library-group.svg";
            else if (lib && lib.libraryType === "feed") name = "feed-library.svg";
        } catch (e) {}
        return "chrome://zotero/skin/collection-tree/16/" + theme + "/" + name;
    }

    /** `{ image, fill? }` for a bookmark row. */
    _bmIconInfo(bm: any, win: any): any {
        try {
            if (bm.type === "library") {
                return { image: this._bmShowInLibraryIcon(bm, win) };
            }
            if (bm.type === "treerow") {
                const theme = this._bmIsDark(win) ? "dark" : "light";
                const map: { [k: string]: string } = {
                    S: "search.svg", D: "duplicates.svg", U: "unfiled.svg",
                    T: "trash.svg", P: "publications.svg", Y: "retracted.svg",
                };
                const name = map[(bm.rowID || "")[0]] || "search.svg";
                return { image: "chrome://zotero/skin/collection-tree/16/" + theme + "/" + name };
            }
            if (bm.type === "collection") {
                const theme = this._bmIsDark(win) ? "dark" : "light";
                return { image: "chrome://zotero/skin/collection-tree/16/" + theme + "/collection.svg" };
            }
            const item: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
            if (item) {
                if (typeof item.isAnnotation === "function" && item.isAnnotation()) {
                    const svg = BM_ANNOTATION_ICONS[item.annotationType]
                        || "annotate-highlight.svg";
                    return {
                        image: "chrome://zotero/skin/16/universal/" + svg,
                        fill: item.annotationColor || null,
                    };
                }
                if (typeof item.getImageSrc === "function") {
                    return { image: item.getImageSrc() };
                }
            }
        } catch (e) {}
        return { image: BM_FALLBACK_DATA_URI };
    }

    // ---- UI: toolbar button -----------------------------------------------

    _setupBookmarksToolbarButton(win?: any, _attempt?: number) {
        try {
            win = win || Zotero.getMainWindow();
            if (!win || win.closed) return;
            const doc = win.document;
            if (!doc) return;
            const toolbar = doc.getElementById("zotero-collections-toolbar");
            if (!toolbar) {
                const attempt = _attempt || 0;
                if (attempt < 40 && typeof win.setTimeout === "function") {
                    win.setTimeout(
                        () => this._setupBookmarksToolbarButton(win, attempt + 1), 250);
                }
                return;
            }
            this._teardownBookmarksToolbarButton(win);
            const addBtn = doc.getElementById("zotero-tb-collection-add");
            const btn = doc.createXULElement("toolbarbutton");
            btn.id = BM_BTN_ID;
            btn.setAttribute("tabindex", "-1");
            btn.setAttribute("class", "zotero-tb-button");
            btn.setAttribute("tooltiptext", "Bookmarks");
            const dataURI = "data:image/svg+xml," + encodeURIComponent(BOOKMARK_SVG);
            btn.style.setProperty("list-style-image", 'url("' + dataURI + '")');
            btn.style.setProperty("-moz-context-properties", "fill, stroke");
            btn.style.setProperty("fill", "currentColor");
            btn.style.setProperty("stroke", "currentColor");
            btn.addEventListener("command", () => {
                try { this._openBookmarksPopup(btn); }
                catch (e) { Zotero.debug("[Weavero] open bookmarks popup err: " + e); }
            });
            // Drop target: drag items/collections from Zotero onto the icon
            // to bookmark them.
            const dtHasZotero = (dt: any) => {
                try {
                    const t = dt && dt.types;
                    if (!t) return false;
                    const has = (k: string) => (typeof t.includes === "function")
                        ? t.includes(k) : (Array.prototype.indexOf.call(t, k) >= 0);
                    return has("zotero/item") || has("zotero/collection")
                        || has("zotero/search");
                } catch (e) { return false; }
            };
            btn.addEventListener("dragover", (e: any) => {
                if (!dtHasZotero(e.dataTransfer)) return;
                e.preventDefault();
                try { e.dataTransfer.dropEffect = "copy"; } catch (_) {}
                btn.style.outline = "2px solid var(--color-accent,#4072e5)";
                btn.style.outlineOffset = "-2px";
            });
            btn.addEventListener("dragleave", () => { btn.style.outline = ""; });
            btn.addEventListener("drop", (e: any) => {
                btn.style.outline = "";
                if (!dtHasZotero(e.dataTransfer)) return;
                e.preventDefault();
                // Read synchronously — dataTransfer is neutered after an await.
                let itemData = "", colData = "", searchData = "";
                try { itemData = e.dataTransfer.getData("zotero/item") || ""; } catch (_) {}
                try { colData = e.dataTransfer.getData("zotero/collection") || ""; } catch (_) {}
                try { searchData = e.dataTransfer.getData("zotero/search") || ""; } catch (_) {}
                this._bmDropAdd(itemData, colData, searchData);
            });
            if (addBtn && addBtn.parentNode === toolbar) addBtn.after(btn);
            else toolbar.appendChild(btn);
            this._setupCollectionsBookmarkMenu(win);
            this._bmInit();
        } catch (e) {
            Zotero.debug("[Weavero] _setupBookmarksToolbarButton err: " + e);
        }
    }

    _teardownBookmarksToolbarButton(win?: any) {
        try {
            win = win || Zotero.getMainWindow();
            const doc = win && win.document;
            if (doc) {
                this._bmHidePopup(win);
                doc.getElementById(BM_BTN_ID)?.remove();
                doc.getElementById(BM_STYLE_ID)?.remove();
                doc.getElementById(BM_ROW_MENU_ID)?.remove();
            }
            this._teardownCollectionsBookmarkMenu(win);
        } catch (e) {}
    }

    // ---- UI: the dropdown panel -------------------------------------------

    _bmEnsurePopupStyles(doc: any) {
        if (doc.getElementById(BM_STYLE_ID)) return;
        const style = doc.createElementNS(NS_HTML, "style");
        style.id = BM_STYLE_ID;
        style.textContent = BM_POPUP_CSS;
        (doc.documentElement || doc).appendChild(style);
    }

    /** Toggle the bookmarks dropdown: a XUL <panel> hosting an HTML list. */
    _openBookmarksPopup(anchorBtn: any) {
        const win = Zotero.getMainWindow();
        const doc: any = win && win.document;
        if (!doc) return;
        if (doc.getElementById(BM_POPUP_ID)) { this._bmHidePopup(win); return; }
        this._bmEnsurePopupStyles(doc);
        const panel = doc.createXULElement("panel");
        panel.id = BM_POPUP_ID;
        panel.setAttribute("animate", "false");
        panel.setAttribute("noautohide", "true");          // we dismiss manually
        panel.setAttribute("consumeoutsideclicks", "false");
        panel.setAttribute("tooltip", "html-tooltip");
        const inner = doc.createElementNS(NS_HTML, "div");
        inner.id = BM_INNER_ID;
        // Right-click on empty areas (row menus stopPropagation) → Add
        // Bookmark / New Folder, Firefox-bookmarks style.
        inner.addEventListener("contextmenu", (e: any) => {
            e.preventDefault();
            this._bmEmptyContextMenu(win, e.screenX, e.screenY);
        });
        panel.appendChild(inner);
        const host = doc.getElementById("mainPopupSet") || doc.documentElement;
        host.appendChild(panel);
        this._bmRenderPopupList(win);
        this._bmInstallDismiss(win, panel, anchorBtn);
        panel.openPopup(anchorBtn, "after_start", 0, 0, false, false);
        // First open after a restart: a referenced library may not be
        // loaded yet → blank icons. Load them, then refresh if still open.
        this._bmPreloadTargets().then(() => {
            if (doc.getElementById(BM_POPUP_ID)) this._bmRenderPopupList(win);
        }).catch(() => {});
    }

    _bmHidePopup(win?: any) {
        win = win || Zotero.getMainWindow();
        const doc = win && win.document;
        if (!doc) return;
        this._bmCloseAllFlyouts();
        this._bmRemoveDismiss();
        doc.getElementById(BM_ROW_MENU_ID)?.remove();
        const panel = doc.getElementById(BM_POPUP_ID);
        if (panel) {
            try { panel.hidePopup(); } catch (e) {}
            try { panel.remove(); } catch (e) {}
        }
    }

    _bmInstallDismiss(win: any, panel: any, anchorBtn: any) {
        const doc = win.document;
        const onKey = (e: any) => {
            if (e.key === "Escape") { e.preventDefault(); this._bmHidePopup(win); }
        };
        const onDown = (e: any) => {
            try {
                const t = e.target;
                if (panel.contains && panel.contains(t)) return;
                if (t && t.closest && (t.closest(".wv-bm-flyout")
                    || t.closest("#" + BM_ROW_MENU_ID))) return;
                if (anchorBtn && (t === anchorBtn
                    || (anchorBtn.contains && anchorBtn.contains(t)))) return;
                this._bmHidePopup(win);
            } catch (err) {}
        };
        win.addEventListener("keydown", onKey, true);
        doc.addEventListener("mousedown", onDown, true);
        this._bmDismiss = { win, onKey, onDown };
    }

    _bmRemoveDismiss() {
        if (!this._bmDismiss) return;
        try {
            const { win, onKey, onDown } = this._bmDismiss;
            win.removeEventListener("keydown", onKey, true);
            win.document.removeEventListener("mousedown", onDown, true);
        } catch (e) {}
        this._bmDismiss = null;
    }

    /** (Re)build the panel: action buttons + the bookmark/folder tree. */
    _bmRenderPopupList(win?: any) {
        win = win || Zotero.getMainWindow();
        const doc: any = win && win.document;
        if (!doc) return;
        const inner = doc.getElementById(BM_INNER_ID);
        if (!inner) return;
        this._bmCloseAllFlyouts();
        while (inner.firstChild) inner.firstChild.remove();

        // Icon-only action row: "+" (add bookmarks) and folder-with-+
        // (new folder, the same glyph as Zotero's New Collection).
        const actions = doc.createElementNS(NS_HTML, "div");
        actions.className = "wv-bm-actions";
        const mkIconBtn = (iconUrl: string, title: string, onClick: any) => {
            const b = doc.createElementNS(NS_HTML, "button");
            b.className = "wv-bm-iconbtn";
            b.setAttribute("title", title);
            const img = doc.createElementNS(NS_HTML, "img");
            img.setAttribute("src", iconUrl);
            img.setAttribute("width", "20");
            img.setAttribute("height", "20");
            b.appendChild(img);
            b.addEventListener("click", onClick);
            actions.appendChild(b);
            return b;
        };
        mkIconBtn("chrome://zotero/skin/20/universal/plus.svg", "Add Bookmarks…", () => {
            this._bmHidePopup(win);
            this._bmAddBookmarksDialog();
        });
        mkIconBtn(BM_NEW_FOLDER_ICON, "New Folder…", () => {
            const name = this._bmPromptName(win, "New Folder", "New Folder");
            if (name) this._bmAddFolder(name).then(() => this._bmRenderPopupList(win));
        });
        inner.appendChild(actions);

        const sep = doc.createElementNS(NS_HTML, "div");
        sep.className = "wv-bm-sep";
        inner.appendChild(sep);

        const list = doc.createElementNS(NS_HTML, "div");
        list.className = "wv-bm-scroll";
        inner.appendChild(list);

        const root = this._bmGetAll();
        if (!root.length) {
            const empty = doc.createElementNS(NS_HTML, "div");
            empty.className = "wv-bm-empty";
            empty.textContent = "No bookmarks yet. Use ＋ Add Bookmarks…";
            list.appendChild(empty);
            return;
        }
        this._bmRenderInto(doc, win, list, root, 0);
    }

    /** Render ONE level of entries into a container. Children of folders
     *  are NOT shown here — they appear in a hover/click flyout. `level`
     *  is the depth of this container (main list = 0). */
    _bmRenderInto(doc: any, win: any, container: any, nodes: any[], level: number) {
        for (const bm of nodes) {
            if (bm.type === "folder") this._bmRenderFolderRow(doc, win, container, bm, level);
            else this._bmRenderItemRow(doc, win, container, bm, level);
        }
    }

    // ---- Cascading flyout submenus (Firefox-style) ------------------------

    _bmCancelOpenTimer() {
        if (this._bmOpenTimer) {
            try { Zotero.getMainWindow().clearTimeout(this._bmOpenTimer); } catch (e) {}
            this._bmOpenTimer = null;
        }
    }

    _bmCancelCloseTimer() {
        if (this._bmCloseTimer) {
            try { Zotero.getMainWindow().clearTimeout(this._bmCloseTimer); } catch (e) {}
            this._bmCloseTimer = null;
        }
    }

    /** Close flyouts whose depth >= `depth`. */
    _bmCloseFlyoutsFrom(depth: number) {
        const st = this._bmFlyoutStack || [];
        while (st.length && st[st.length - 1].depth >= depth) {
            const f = st.pop();
            try { f.panel.hidePopup(); } catch (e) {}
            try { f.panel.remove(); } catch (e) {}
        }
    }

    _bmCloseAllFlyouts() {
        this._bmCancelOpenTimer();
        this._bmCancelCloseTimer();
        this._bmCloseFlyoutsFrom(0);
        this._bmFlyoutStack = [];
    }

    _bmScheduleOpenFlyout(win: any, rowEl: any, folder: any, depth: number) {
        this._bmCancelOpenTimer();
        this._bmOpenTimer = win.setTimeout(
            () => this._bmOpenFlyout(win, rowEl, folder, depth), 220);
    }

    _bmScheduleCloseFlyouts(depth: number) {
        this._bmCancelCloseTimer();
        const win = Zotero.getMainWindow();
        this._bmCloseTimer = win.setTimeout(() => this._bmCloseFlyoutsFrom(depth), 320);
    }

    /** Open a folder's children as a flyout sub-panel to the right of its
     *  row. Each flyout is its own XUL <panel> (so it's not clipped and
     *  layers above), chained by depth. */
    _bmOpenFlyout(win: any, rowEl: any, folder: any, depth: number) {
        try {
            this._bmCancelCloseTimer();
            this._bmCloseFlyoutsFrom(depth);
            const kids = (folder && Array.isArray(folder.children)) ? folder.children : [];
            const doc: any = win.document;
            const panel = doc.createXULElement("panel");
            panel.id = "wv-bm-flyout-" + depth;
            panel.className = "wv-bm-flyout";
            panel.setAttribute("animate", "false");
            panel.setAttribute("noautohide", "true");
            panel.setAttribute("consumeoutsideclicks", "false");
            panel.setAttribute("tooltip", "html-tooltip");
            const finner = doc.createElementNS(NS_HTML, "div");
            finner.className = "wv-bm-flyout-inner";
            panel.appendChild(finner);
            if (kids.length) {
                this._bmRenderInto(doc, win, finner, kids, depth);
            } else {
                const empty = doc.createElementNS(NS_HTML, "div");
                empty.className = "wv-bm-empty";
                empty.textContent = "(empty)";
                finner.appendChild(empty);
            }
            panel.addEventListener("mouseenter", () => this._bmCancelCloseTimer());
            panel.addEventListener("mouseleave", () => this._bmScheduleCloseFlyouts(depth));
            const host = doc.getElementById("mainPopupSet") || doc.documentElement;
            host.appendChild(panel);
            this._bmFlyoutStack = this._bmFlyoutStack || [];
            this._bmFlyoutStack.push({ panel, depth, folderId: folder.id });
            // To the right of the row, top-aligned.
            panel.openPopup(rowEl, "end_before", 0, 0, false, false);
        } catch (e) {
            Zotero.debug("[Weavero] _bmOpenFlyout err: " + e);
        }
    }

    /** Hover wiring shared by folder rows at any level. */
    _bmAttachFolderHover(win: any, row: any, bm: any, level: number) {
        const childDepth = level + 1;
        row.addEventListener("mouseenter", () => {
            this._bmCancelCloseTimer();
            const open = (this._bmFlyoutStack || []).some(
                (f: any) => f.depth === childDepth && f.folderId === bm.id);
            if (!open) {
                this._bmCloseFlyoutsFrom(childDepth);
                this._bmScheduleOpenFlyout(win, row, bm, childDepth);
            }
        });
        row.addEventListener("mouseleave", () => {
            this._bmCancelOpenTimer();
            this._bmScheduleCloseFlyouts(childDepth);
        });
    }

    /** Shared drag-and-drop wiring. Item rows get before/after zones;
     *  folder rows additionally get a middle "into" zone. */
    _bmAttachDragHandlers(doc: any, win: any, row: any, bm: any, isFolder: boolean) {
        row.setAttribute("draggable", "true");
        const clearDrop = () => row.classList.remove(
            "wv-bm-dragover", "wv-bm-dragover-bottom", "wv-bm-dragover-into");
        const computeMode = (e: any) => {
            const r = row.getBoundingClientRect();
            const y = e.clientY - r.top;
            if (isFolder) {
                if (y < r.height * 0.25) return "before";
                if (y > r.height * 0.75) return "after";
                return "into";
            }
            return (y > r.height / 2) ? "after" : "before";
        };
        row.addEventListener("dragstart", (e: any) => {
            try {
                e.dataTransfer.setData("text/plain", bm.id);
                e.dataTransfer.effectAllowed = "move";
            } catch (_) {}
            row.classList.add("wv-bm-dragging");
        });
        row.addEventListener("dragend", () => row.classList.remove("wv-bm-dragging"));
        row.addEventListener("dragover", (e: any) => {
            e.preventDefault();
            try { e.dataTransfer.dropEffect = "move"; } catch (_) {}
            const mode = computeMode(e);
            clearDrop();
            if (mode === "before") row.classList.add("wv-bm-dragover");
            else if (mode === "after") row.classList.add("wv-bm-dragover-bottom");
            else row.classList.add("wv-bm-dragover-into");
        });
        row.addEventListener("dragleave", clearDrop);
        row.addEventListener("drop", (e: any) => {
            e.preventDefault();
            clearDrop();
            let draggedId = "";
            try { draggedId = e.dataTransfer.getData("text/plain"); } catch (_) {}
            if (draggedId && draggedId !== bm.id) {
                const mode = computeMode(e);
                this._bmMove(draggedId, bm.id, mode)
                    .then(() => this._bmRenderPopupList(win));
            }
        });
    }

    _bmRenderItemRow(doc: any, win: any, container: any, bm: any, _level: number) {
        const row = doc.createElementNS(NS_HTML, "div");
        row.className = "wv-bm-row";

        const ic = this._bmIconInfo(bm, win);
        const icon = doc.createElementNS(NS_HTML, "img");
        icon.setAttribute("src", ic.image);
        icon.setAttribute("width", "16");
        icon.setAttribute("height", "16");
        let st = "flex:0 0 auto;";
        if (ic.fill) st += "-moz-context-properties:fill;fill:" + ic.fill + ";";
        icon.setAttribute("style", st);
        icon.addEventListener("error", () => {
            try {
                if (icon.getAttribute("src") !== BM_FALLBACK_DATA_URI) {
                    icon.setAttribute("src", BM_FALLBACK_DATA_URI);
                }
            } catch (e) {}
        });

        const label = doc.createElementNS(NS_HTML, "div");
        label.className = "wv-bm-label";
        label.textContent = bm.label || bm.itemKey || bm.collectionKey;
        label.setAttribute("title", label.textContent);

        row.appendChild(icon);
        row.appendChild(label);

        // Hovering a non-folder cancels any pending sibling-folder open.
        row.addEventListener("mouseenter", () => this._bmCancelOpenTimer());
        row.addEventListener("click", (e: any) => {
            this._bmActivateBookmark(bm, e);
            this._bmHidePopup(win);
        });
        row.addEventListener("contextmenu", (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            this._bmRowContextMenu(win, bm, e.screenX, e.screenY);
        });
        this._bmAttachDragHandlers(doc, win, row, bm, false);
        container.appendChild(row);
    }

    _bmRenderFolderRow(doc: any, win: any, container: any, bm: any, level: number) {
        const row = doc.createElementNS(NS_HTML, "div");
        row.className = "wv-bm-row wv-bm-folder";

        const folderIcon = doc.createElementNS(NS_HTML, "img");
        folderIcon.setAttribute("src", BM_FOLDER_ICON);
        folderIcon.setAttribute("width", "16");
        folderIcon.setAttribute("height", "16");
        folderIcon.setAttribute("style",
            "flex:0 0 auto;-moz-context-properties:stroke;stroke:currentColor;fill:none;");

        const label = doc.createElementNS(NS_HTML, "div");
        label.className = "wv-bm-label";
        label.textContent = bm.name || "Folder";
        label.setAttribute("title", label.textContent);

        // Right-side arrow, Firefox-style (the flyout opens on hover/click).
        const arrow = doc.createElementNS(NS_HTML, "span");
        arrow.className = "wv-bm-arrow";
        arrow.textContent = "›";

        row.appendChild(folderIcon);
        row.appendChild(label);
        row.appendChild(arrow);

        row.addEventListener("click", () => {
            this._bmCancelOpenTimer();
            this._bmCancelCloseTimer();
            this._bmOpenFlyout(win, row, bm, level + 1);
        });
        row.addEventListener("contextmenu", (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            this._bmFolderContextMenu(win, bm, e.screenX, e.screenY);
        });
        this._bmAttachFolderHover(win, row, bm, level);
        this._bmAttachDragHandlers(doc, win, row, bm, true);
        container.appendChild(row);
    }

    /** Right-click menu for a bookmark row. */
    async _bmRowContextMenu(win: any, bm: any, screenX: number, screenY: number) {
        try {
            const doc: any = win.document;
            doc.getElementById(BM_ROW_MENU_ID)?.remove();
            const menu = doc.createXULElement("menupopup");
            menu.id = BM_ROW_MENU_ID;
            const add = (label: string, fn: any, image?: string) => {
                const mi = doc.createXULElement("menuitem");
                mi.setAttribute("label", label);
                if (image) {
                    mi.classList.add("menuitem-iconic");
                    mi.setAttribute("image", image);
                }
                if (fn) mi.addEventListener("command", fn);
                menu.appendChild(mi);
            };
            const target = await this._bmResolveOpenTarget(bm);
            if (target) {
                let attIcon = "";
                try { attIcon = target.attachment.getImageSrc(); } catch (e) {}
                add("Open " + target.typeLabel + " in New Tab", () => {
                    this._bmOpenInReader(bm, false);
                    this._bmHidePopup(win);
                }, attIcon);
                add("Open " + target.typeLabel + " in New Window", () => {
                    this._bmOpenInReader(bm, true);
                    this._bmHidePopup(win);
                }, attIcon);
            }
            add("Show in Library", () => {
                this._bmShowInLibrary(bm);
                this._bmHidePopup(win);
            }, this._bmShowInLibraryIcon(bm, win));
            menu.appendChild(doc.createXULElement("menuseparator"));
            add("Rename…", () => {
                const cur = bm.label || bm.itemKey || bm.collectionKey || "";
                const name = this._bmPromptName(win, "Rename Bookmark", cur);
                if (name) this._bmRenameBookmark(bm.id, name).then(() => this._bmRenderPopupList(win));
            }, BM_RENAME_ICON);
            add("Delete Bookmark", () => {
                this._bmRemove(bm.id).then(() => this._bmRenderPopupList(win));
            }, BM_DELETE_ICON);
            menu.appendChild(doc.createXULElement("menuseparator"));
            add("Add Bookmark…", () => { this._bmHidePopup(win); this._bmAddBookmarksDialog(); }, BM_MENU_ADD_ICON);
            add("New Folder…", () => {
                const name = this._bmPromptName(win, "New Folder", "New Folder");
                if (name) this._bmAddFolder(name).then(() => this._bmRenderPopupList(win));
            }, BM_MENU_NEWFOLDER_ICON);
            const host = doc.getElementById("mainPopupSet") || doc.documentElement;
            host.appendChild(menu);
            menu.addEventListener("popuphidden",
                () => { try { menu.remove(); } catch (e) {} }, { once: true });
            menu.openPopupAtScreen(screenX, screenY, true);
        } catch (e) {
            Zotero.debug("[Weavero] _bmRowContextMenu err: " + e);
        }
    }

    /** Right-click menu for a folder row. */
    _bmFolderContextMenu(win: any, bm: any, screenX: number, screenY: number) {
        try {
            const doc: any = win.document;
            doc.getElementById(BM_ROW_MENU_ID)?.remove();
            const menu = doc.createXULElement("menupopup");
            menu.id = BM_ROW_MENU_ID;
            const add = (label: string, fn: any, image?: string) => {
                const mi = doc.createXULElement("menuitem");
                mi.setAttribute("label", label);
                if (image) {
                    mi.classList.add("menuitem-iconic");
                    mi.setAttribute("image", image);
                }
                if (fn) mi.addEventListener("command", fn);
                menu.appendChild(mi);
            };
            add("Rename Folder…", () => {
                const name = this._bmPromptName(win, "Rename Folder", bm.name || "");
                if (name) this._bmRenameFolder(bm.id, name).then(() => this._bmRenderPopupList(win));
            }, BM_RENAME_ICON);
            add("New Subfolder…", () => {
                const name = this._bmPromptName(win, "New Folder", "New Folder");
                if (name) this._bmAddFolder(name, bm.id).then(() => this._bmRenderPopupList(win));
            }, BM_MENU_NEWFOLDER_ICON);
            menu.appendChild(doc.createXULElement("menuseparator"));
            // Destructive (folder + contents), but confirm when non-empty —
            // the confirmation stands in for the undo we don't have.
            add("Delete Folder", () => {
                const count = this._bmCountDescendants(bm);
                if (count > 0) {
                    let ok = false;
                    try {
                        ok = Services.prompt.confirm(win, "Delete Folder",
                            'Delete the folder "' + (bm.name || "Folder") + '" and its '
                            + count + " item" + (count === 1 ? "" : "s") + "?");
                    } catch (e) { ok = false; }
                    if (!ok) return;
                }
                this._bmRemove(bm.id).then(() => this._bmRenderPopupList(win));
            }, BM_DELETE_ICON);
            menu.appendChild(doc.createXULElement("menuseparator"));
            add("Add Bookmark…", () => { this._bmHidePopup(win); this._bmAddBookmarksDialog(); }, BM_MENU_ADD_ICON);
            add("New Folder…", () => {
                const name = this._bmPromptName(win, "New Folder", "New Folder");
                if (name) this._bmAddFolder(name).then(() => this._bmRenderPopupList(win));
            }, BM_MENU_NEWFOLDER_ICON);
            const host = doc.getElementById("mainPopupSet") || doc.documentElement;
            host.appendChild(menu);
            menu.addEventListener("popuphidden",
                () => { try { menu.remove(); } catch (e) {} }, { once: true });
            menu.openPopupAtScreen(screenX, screenY, true);
        } catch (e) {
            Zotero.debug("[Weavero] _bmFolderContextMenu err: " + e);
        }
    }

    /** Right-click on the dropdown's empty area → Add Bookmark / New Folder. */
    _bmEmptyContextMenu(win: any, screenX: number, screenY: number) {
        try {
            const doc: any = win.document;
            doc.getElementById(BM_ROW_MENU_ID)?.remove();
            const menu = doc.createXULElement("menupopup");
            menu.id = BM_ROW_MENU_ID;
            const add = (label: string, fn: any, image?: string) => {
                const mi = doc.createXULElement("menuitem");
                mi.setAttribute("label", label);
                if (image) { mi.classList.add("menuitem-iconic"); mi.setAttribute("image", image); }
                mi.addEventListener("command", fn);
                menu.appendChild(mi);
            };
            add("Add Bookmark…", () => { this._bmHidePopup(win); this._bmAddBookmarksDialog(); }, BM_MENU_ADD_ICON);
            add("New Folder…", () => {
                const name = this._bmPromptName(win, "New Folder", "New Folder");
                if (name) this._bmAddFolder(name).then(() => this._bmRenderPopupList(win));
            }, BM_MENU_NEWFOLDER_ICON);
            const host = doc.getElementById("mainPopupSet") || doc.documentElement;
            host.appendChild(menu);
            menu.addEventListener("popuphidden",
                () => { try { menu.remove(); } catch (e) {} }, { once: true });
            menu.openPopupAtScreen(screenX, screenY, true);
        } catch (e) {
            Zotero.debug("[Weavero] _bmEmptyContextMenu err: " + e);
        }
    }

    // ---- Collections right-click "Bookmark Collection" --------------------

    /** True if a tree row is a saved search or a special row (duplicates,
     *  unfiled, trash, my publications, retracted, recently read) — i.e.
     *  bookmarkable as a generic "treerow". */
    _bmTreeRowIsSpecial(tr: any) {
        try {
            const f = (n: string) => typeof tr[n] === "function" && tr[n]();
            return !!(tr && (f("isSearch") || f("isDuplicates") || f("isUnfiled")
                || f("isTrash") || f("isPublications") || f("isRetracted")
                || f("isRecentlyRead")));
        } catch (e) { return false; }
    }

    /** True if a collections-tree row is a library-level row (My Library,
     *  a group library, or a feed) — i.e. bookmarkable as a library. */
    _bmTreeRowIsLibrary(treeRow: any) {
        try {
            return !!(treeRow && (
                (typeof treeRow.isLibrary === "function" && treeRow.isLibrary())
                || (typeof treeRow.isGroup === "function" && treeRow.isGroup())
                || (typeof treeRow.isFeed === "function" && treeRow.isFeed())));
        } catch (e) { return false; }
    }

    _setupCollectionsBookmarkMenu(win?: any) {
        try {
            win = win || Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return;
            const menu = doc.getElementById("zotero-collectionmenu");
            if (!menu) return;
            this._teardownCollectionsBookmarkMenu(win);
            const ID = "wv-collectionmenu-bookmark";
            const mkEntry = (label: string, fn: any) => {
                const mi = doc.createXULElement("menuitem");
                mi.id = ID;
                mi.setAttribute("label", label);
                mi.addEventListener("command", fn);
                menu.appendChild(mi);
            };
            const onShowing = () => {
                try {
                    const stale = doc.getElementById(ID);
                    if (stale) stale.remove();
                    const zp = win.ZoteroPane;
                    if (!zp) return;
                    const col = (typeof zp.getSelectedCollection === "function")
                        ? zp.getSelectedCollection() : null;
                    if (col && col.key) {
                        const bookmarked = this._bmHasCollection(col.libraryID, col.key);
                        mkEntry(bookmarked ? "Remove Collection Bookmark" : "Bookmark Collection",
                            () => {
                                try {
                                    const c = zp.getSelectedCollection();
                                    if (!c || !c.key) return;
                                    if (this._bmHasCollection(c.libraryID, c.key)) {
                                        const ex = this._bmFlatten().find((b: any) =>
                                            b.type === "collection" && b.libraryID === c.libraryID
                                            && b.collectionKey === c.key);
                                        if (ex) this._bmRemove(ex.id);
                                    } else { this._bmBookmarkCollection(c); }
                                } catch (e) {
                                    Zotero.debug("[Weavero] bookmark-collection cmd err: " + e);
                                }
                            });
                        return;
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] collection bookmark popupshowing err: " + e);
                }
            };
            const onHidden = () => {
                try { const el = doc.getElementById(ID); if (el) el.remove(); } catch (e) {}
            };
            menu.addEventListener("popupshowing", onShowing);
            menu.addEventListener("popuphidden", onHidden);
            this._collectionBookmarkMenuHandlers = { menu, onShowing, onHidden };
        } catch (e) {
            Zotero.debug("[Weavero] _setupCollectionsBookmarkMenu err: " + e);
        }
    }

    _teardownCollectionsBookmarkMenu(_win?: any) {
        if (!this._collectionBookmarkMenuHandlers) return;
        try {
            const { menu, onShowing, onHidden } = this._collectionBookmarkMenuHandlers;
            try { menu.removeEventListener("popupshowing", onShowing); } catch (e) {}
            try { menu.removeEventListener("popuphidden", onHidden); } catch (e) {}
            try {
                const stale = menu.ownerDocument.getElementById("wv-collectionmenu-bookmark");
                if (stale) stale.remove();
            } catch (e) {}
        } catch (e) {}
        this._collectionBookmarkMenuHandlers = null;
    }
}

const _bookmarksDescriptors = Object.getOwnPropertyDescriptors(_BookmarksMixin.prototype);
delete (_bookmarksDescriptors as any).constructor;
export const bookmarksMethods = _bookmarksDescriptors;
