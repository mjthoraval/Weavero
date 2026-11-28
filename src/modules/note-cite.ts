// Module: citations after Zotero links in a note (MJT 2026-11-09, "convert a
// link in a note into a Zotero Note Citation"; picks: Zotero links only, the
// link's text kept with the citation after it, one link / the links in a
// selection / every link in the note, an annotation link as its quote and
// citation).
//
// A zotero:// link to an item, a PDF page or an annotation keeps its text and
// gets Zotero's own citation right after it; an annotation link, the
// annotation's quote and its citation, as Zotero writes an annotation
// dragged into a note. What is added is plain Zotero data, built as Zotero
// builds it (editorInstance.js _digestItems and serializeAnnotations): it
// syncs, reads the same without Weavero, and goes to a word processor
// through Zotero's "Add Note". The page half (note-editor-inject.ts
// __wvZoteroLinks / __wvZoteroCite) finds the links and inserts, all of a
// batch in one transaction (one Ctrl+Z); this half resolves each link to an
// item (backlinks.ts wvBlParseLink, the index's resolvers) and builds the
// HTML. A note cites items of its own library only, as Zotero's Add Citation
// dialog offers (editorInstance.js openCitationPopup: [libraryID]).

import { wvMenuItem, wvMenuSeparator } from "../lib/menu";
import { wvStr } from "../lib/l10n";
import { wvLivePlugin } from "../lib/live";
import { wvBlParseLink } from "./backlinks";

declare const Zotero: any;

interface NcPlan { ok: boolean; why?: string; html?: string }

/** The quote kinds Zotero writes into a note (serializeAnnotations: text
 *  annotations; image, ink and note annotations get the citation alone). */
const NC_QUOTED = ["highlight", "underline"];

class _NoteCiteMixin {
    [k: string]: any;

    _wvNoteCiteOn(): boolean {
        try { return !!this._getEnableNotes() && !!this._wvPref("noteLinkCitations"); }
        catch (e) { return false; }
    }

    /** The page's Zotero links for `scope`, with its facts (read-only,
     *  underline quotes known): note-editor-inject.ts zoteroLinksJSON. */
    _wvNcLinks(iframe: any, scope: any): any {
        const wj = this._wvNnPage(iframe);
        if (!wj || typeof wj.__wvZoteroLinks !== "function") return { links: [] };
        try { return JSON.parse(String(wj.__wvZoteroLinks(JSON.stringify(scope)))) || { links: [] }; }
        catch (e) { return { links: [] }; }
    }

    /** What goes after `link` in a note of library `noteLib`: the HTML, or
     *  why nothing does. */
    _wvNcPlan(link: any, noteLib: number, underline: boolean): NcPlan {
        const parsed = wvBlParseLink(String(link && link.href || ""));
        if (!parsed || !parsed.keys.length) return { ok: false, why: wvStr("weavero-note-cite-why-noitem") };
        if (/^zotero:\/\/note\//i.test(String(link.href))) return { ok: false, why: wvStr("weavero-note-cite-why-note") };
        let lib: number | null = null;
        try {
            lib = parsed.lib === "user" ? Zotero.Libraries.userLibraryID
                : (Zotero.Groups.getLibraryIDFromGroupID(parsed.lib) || null);
        }
        catch (e) { lib = null; }
        if (lib == null) return { ok: false, why: wvStr("weavero-note-cite-why-nolibrary") };
        if (lib !== noteLib) return { ok: false, why: wvStr("weavero-note-cite-why-otherlibrary") };
        // The page a link names: an open link's `?page=` (parsed), and a select
        // link's too -- Zotero ignores it there, but whoever wrote it meant
        // that page (MJT's test note, 2026-11-09: zotero://select/...?page=2).
        let page: string | null = parsed.page;
        if (!page) { const m = /[?&]page=(\d+)/.exec(String(link.href)); if (m) page = m[1]; }
        const quotes: string[] = [];
        const citationItems: any[] = [];
        const wanted: string[] = [];
        const quotedKeys: string[] = [];
        for (const rawKey of parsed.keys) {
            let item: any = null;
            try { item = this._wvResolveItemByKey(lib, rawKey) || this._wvBlForwarded(lib, rawKey); } catch (e) { item = null; }
            if (!item) return { ok: false, why: wvStr("weavero-note-cite-why-missing") };
            let ann: any = null;
            if (item.isAnnotation && item.isAnnotation()) { ann = item; item = item.parentItem; }
            else if (parsed.annotationKey) {
                try { ann = Zotero.Items.getByLibraryAndKey(item.libraryID, parsed.annotationKey) || this._wvBlForwarded(item.libraryID, parsed.annotationKey); }
                catch (e) { ann = null; }
                if (ann && !(ann.isAnnotation && ann.isAnnotation())) ann = null;
            }
            if (!item) return { ok: false, why: wvStr("weavero-note-cite-why-missing") };
            if (item.isNote()) return { ok: false, why: wvStr("weavero-note-cite-why-note") };
            let att: any = null;
            let parent: any = item;
            if (item.isAttachment()) {
                att = item;
                parent = item.parentItem;
                if (!parent || !parent.isRegularItem()) return { ok: false, why: wvStr("weavero-note-cite-why-noparent") };
            }
            if (!parent.isRegularItem()) return { ok: false, why: wvStr("weavero-note-cite-why-notcitable") };
            const uri = Zotero.URI.getItemURI(parent);
            let locator: string | null = null;
            if (ann) locator = ann.annotationPageLabel ? String(ann.annotationPageLabel) : null;
            else if (att && page) locator = this._wvNcPageLabel(att, page);
            const citationItem: any = { uris: [uri] };
            if (locator) citationItem.locator = locator;
            citationItem.itemData = Zotero.Utilities.Item.itemToCSLJSON(parent);
            citationItems.push(citationItem);
            wanted.push(uri);
            if (ann && NC_QUOTED.indexOf(ann.annotationType) >= 0 && String(ann.annotationText || "").trim()) {
                quotes.push(this._wvNcQuoteHTML(ann, ann.parentItem || att, parent, underline));
                quotedKeys.push(ann.key);
            }
        }
        const cites: string[] = (link && link.cites) || [];
        const quoted: string[] = (link && link.quoted) || [];
        if (wanted.every((u) => cites.indexOf(u) >= 0) && quotedKeys.every((k) => quoted.indexOf(k) >= 0)) {
            return { ok: false, why: wvStr("weavero-note-cite-why-cited") };
        }
        // The page puts a space before each piece (note-editor-inject.ts zoteroCite).
        const html = quotes.join("") + this._wvNcCitationHTML(citationItems);
        return { ok: true, html };
    }

    /** A citation as Zotero writes one into a note (_digestItems): the item
     *  data inside, which the editor moves to the note's metadata. */
    _wvNcCitationHTML(citationItems: any[]): string {
        const citation = { citationItems, properties: {} };
        let formatted = "";
        try { formatted = String(Zotero.EditorInstanceUtilities.formatCitation(citation) || ""); } catch (e) {}
        return '<span class="citation" data-citation="' + encodeURIComponent(JSON.stringify(citation)) + '">'
            + this._wvNcEscape(formatted) + "</span>";
    }

    /** An annotation's quote as Zotero writes it (serializeAnnotations: the
     *  stored annotation, the text with its i/b/sub/sup, Zotero's quotation
     *  marks). `underline`: this editor knows the underline quote node
     *  (schema 10); an older one gets a highlight quote. */
    _wvNcQuoteHTML(ann: any, att: any, parent: any, underline: boolean): string {
        let position: any = null;
        try { position = JSON.parse(ann.annotationPosition); } catch (e) {}
        const citationItem: any = { uris: [Zotero.URI.getItemURI(parent)], locator: ann.annotationPageLabel };
        citationItem.itemData = Zotero.Utilities.Item.itemToCSLJSON(parent);
        const stored = {
            attachmentURI: Zotero.URI.getItemURI(att),
            annotationKey: ann.key,
            color: ann.annotationColor,
            pageLabel: ann.annotationPageLabel,
            position,
            citationItem,
        };
        const raw = String(ann.annotationText || "").trim();
        let text = "";
        try { text = String(Zotero.EditorInstanceUtilities._transformTextToHTML(raw)); }
        catch (e) { text = this._wvNcEscape(raw); }
        let open = "“", close = "”";
        try { open = Zotero.getString("punctuation.openingQMark"); close = Zotero.getString("punctuation.closingQMark"); } catch (e) {}
        const cls = ann.annotationType === "underline" && underline ? "underline" : "highlight";
        return '<span class="' + cls + '" data-annotation="' + encodeURIComponent(JSON.stringify(stored)) + '">'
            + open + text + close + "</span>";
    }

    _wvNcEscape(s: string): string {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    /** A PDF page link's page as a citation locator: the PRINTED page of an
     *  annotation on that page when there is one -- `?page=N` counts PDF pages
     *  (ZoteroProtocolHandler.mjs: pageIndex = page - 1) and Zotero keeps
     *  printed page numbers only on annotations -- else N. */
    _wvNcPageLabel(att: any, page: string): string {
        const n = parseInt(String(page), 10);
        if (!(n > 0)) return String(page);
        try {
            for (const a of (att.getAnnotations ? att.getAnnotations() : [])) {
                let p: any = null;
                try { p = JSON.parse(a.annotationPosition); } catch (e) {}
                if (p && p.pageIndex === n - 1 && a.annotationPageLabel) return String(a.annotationPageLabel);
            }
        }
        catch (e) {}
        return String(n);
    }

    /** The citation entries of the note's own menu (from note-nav.ts
     *  _wvNnOnMenuShowing): on a right-clicked Zotero link, "Add Citation
     *  After Link", and with a selection holding Zotero links, "Add Citations
     *  After Links in Selection (N)", at the top; with any Zotero link in the
     *  note, "Add Citations After All Links (N)" at the end, before the
     *  note-wide Fold All. Greyed with the reason when nothing can be added. */
    _wvNcMenuAdd(ne: any, iframe: any, menu: any, st: any) {
        try {
            if (!this._wvNoteCiteOn()) return;
            const doc = menu.ownerDocument;
            const noteLib = ne.item && ne.item.libraryID;
            const run = (scope: any) => {
                const p = wvLivePlugin();
                if (p) p._wvNcRun(ne, scope);
            };
            const roWhy = wvStr("weavero-note-cite-why-readonly");
            const top: any[] = [];
            if (st && st.ctxX != null && Date.now() - st.ctxAt <= 3000) {
                const at = this._wvNcLinks(iframe, { mode: "at", x: st.ctxX, y: st.ctxY });
                const link = at.links && at.links[0];
                if (link) {
                    const ro = ne.mode !== "edit" || at.readOnly;
                    const plan = ro ? { ok: false, why: roWhy } : this._wvNcPlan(link, noteLib, !!at.underline);
                    const scope = { mode: "at", x: st.ctxX, y: st.ctxY };
                    const mi = wvMenuItem(doc, { l10n: { id: "weavero-menu-note-cite-link" }, attrs: { id: "wv-note-cite-link" },
                        disabled: !plan.ok, onCommand: () => run(scope) });
                    if (!plan.ok && plan.why) mi.setAttribute("tooltiptext", plan.why);
                    top.push(mi);
                }
            }
            const selRes = this._wvNcLinks(iframe, { mode: "sel" });
            if (selRes.links && selRes.links.length) {
                const ro = ne.mode !== "edit" || selRes.readOnly;
                const n = ro ? 0 : selRes.links.filter((l: any) => this._wvNcPlan(l, noteLib, !!selRes.underline).ok).length;
                const mi = wvMenuItem(doc, { l10n: { id: "weavero-menu-note-cite-sel", args: { n } }, attrs: { id: "wv-note-cite-sel" },
                    disabled: !n, onCommand: () => run({ mode: "sel" }) });
                if (ro) mi.setAttribute("tooltiptext", roWhy);
                top.push(mi);
            }
            if (top.length) {
                const sep = wvMenuSeparator(doc);
                sep.id = "wv-note-cite-sep";
                menu.insertBefore(sep, menu.firstChild);
                for (const mi of top.reverse()) menu.insertBefore(mi, menu.firstChild);
            }
            const all = this._wvNcLinks(iframe, { mode: "all" });
            if (all.links && all.links.length) {
                const ro = ne.mode !== "edit" || all.readOnly;
                const n = ro ? 0 : all.links.filter((l: any) => this._wvNcPlan(l, noteLib, !!all.underline).ok).length;
                wvMenuSeparator(doc, menu).id = "wv-note-cite-all-sep";
                const mi = wvMenuItem(doc, { l10n: { id: "weavero-menu-note-cite-all", args: { n } }, attrs: { id: "wv-note-cite-all" },
                    disabled: !n, onCommand: () => run({ mode: "all" }) }, menu);
                if (ro) mi.setAttribute("tooltiptext", roWhy);
            }
        }
        catch (er) { Zotero.debug("[Weavero] note citation menu err: " + er); }
    }

    /** Add the citations for `scope` (the links found again now, so the
     *  positions are the note's current ones). The number added. */
    _wvNcRun(ne: any, scope: any): number {
        try {
            const iframe = this._wvNnIframe(ne);
            const res = this._wvNcLinks(iframe, scope);
            const noteLib = ne.item && ne.item.libraryID;
            const plan: any[] = [];
            for (const l of (res.links || [])) {
                const p = this._wvNcPlan(l, noteLib, !!res.underline);
                if (p.ok) plan.push({ insertAt: l.insertAt, html: p.html });
            }
            if (!plan.length) return 0;
            const wj = this._wvNnPage(iframe);
            if (!wj || typeof wj.__wvZoteroCite !== "function") return 0;
            const r = JSON.parse(String(wj.__wvZoteroCite(JSON.stringify(plan))));
            if (r && r.error) Zotero.debug("[Weavero] note citations not added: " + r.error);
            return (r && r.added) || 0;
        }
        catch (e) { Zotero.debug("[Weavero] note citations err: " + e); return 0; }
    }
}

const _noteCiteDescriptors = Object.getOwnPropertyDescriptors(_NoteCiteMixin.prototype);
delete (_noteCiteDescriptors as any).constructor;
export const noteCiteMethods = _noteCiteDescriptors;
