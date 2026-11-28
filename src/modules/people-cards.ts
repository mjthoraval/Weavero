// Researchers: the Contact card and the custom fields (MJT 2026-11-25, the Google
// Contacts design, approved): the user's own data, in people.json only.
//   - CONTACT ("record the address of the researcher, phone number, ... And
//     multiple of them, with proper labels, like on Google Contacts"): emails,
//     phones, postal addresses (several lines), websites -- several of each,
//     labelled Work / Home / Mobile (a phone) / Other or the user's own words;
//     an email opens a message (mailto:), a phone the phone app (tel:), a
//     website the browser; an address offers a map search, whose tooltip says
//     it sends the address to OpenStreetMap.
//   - CUSTOM FIELDS ("I should also be able to add some manual custom fields,
//     same as in Google Contacts"): a label (the ones used on other
//     researchers offered) and a value; a web address is a link, its address
//     in the tooltip.
// Each row: Edit and Remove under the mouse, and on a right-click. "Add" sits in
// the card's title for now; the page's Edit pencil (the design's step 3) will
// take it. The links go through `_launchURL`: mailto: and tel: then follow the
// user's link settings (url.ts), never straight to the OS.
//
// Mixed onto WeaveroPlugin.prototype after people.ts (index.ts).

import { wvLivePlugin } from "../lib/live";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl } from "../lib/dom";
import { wvMenuItem } from "../lib/menu";
import {
    WvPpContact, WvPpCustom, WvPpRecord, WV_PP_CONTACT_KINDS, WV_PP_CONTACT_LABELS,
    wvPpContactCheck, wvPpContactNorm, wvPpContactSorted, wvPpCustomLabels, wvPpCustomNorm, wvPpEventLink,
} from "../lib/people-record";

declare const Zotero: any;
declare const Services: any;

const live = (): any => wvLivePlugin();
const MENU_ROW = "wv-pp-row-menu";

/** The form being filled, per window: a contact detail or a custom field,
 *  new (`id` null) or edited; kept across a redraw. */
interface CardEdit { card: "contact" | "custom"; rec: string; id: string | null; kind: string; label: string; custom: string; value: string; err: string }
const edits = new WeakMap<any, CardEdit | null>();

/** The label as shown: Work / Home / Mobile / Other in the UI's words, the
 *  user's own as written. */
function labelText(label: string): string {
    return (WV_PP_CONTACT_LABELS as readonly string[]).includes(label) ? wvStr("weavero-people-contact-label", { label }, null) : label;
}

class _PeopleCardsMixin {
    [k: string]: any;

    _wvPeopleCardEdit(win: any): CardEdit | null { return edits.get(win) || null; }

    /** The page is in its edit mode (people.ts, the Edit pencil). */
    _wvPeopleCardEditMode(win: any): boolean {
        const v = this._wvPeopleViewOf(win);
        return !!(v && v.pageEdit);
    }

    _wvPeopleCardSetEdit(win: any, e: CardEdit | null) {
        edits.set(win, e);
        this._wvPeopleTabRender(win);
    }

    /** Edit / Remove on the row under the mouse (shown by the CSS) and by a
     *  right-click. */
    _wvPeopleCardRowActions(win: any, row: any, onEdit: () => void, onRemove: () => void) {
        const doc = win.document;
        // The buttons in the page's edit mode only (MJT 2026-11-26); the
        // right-click offers the same in both modes.
        if (this._wvPeopleCardEditMode(win)) {
            const bs = wvHtmlEl(doc, "span", "wv-pp-vbtns", undefined, row);
            const eb = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr("weavero-people-edit", null, null), bs);
            eb.setAttribute("type", "button");
            eb.setAttribute("data-wv-pp-cact", "edit");
            eb.addEventListener("click", () => { try { onEdit(); } catch (e) {} });
            const rb = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr("weavero-people-event-remove", null, null), bs);
            rb.setAttribute("type", "button");
            rb.setAttribute("data-wv-pp-cact", "remove");
            rb.addEventListener("click", () => { try { onRemove(); } catch (e) {} });
        }
        row.addEventListener("contextmenu", (ev: any) => {
            try {
                ev.preventDefault();
                const lp: any = live();
                if (!lp) return;
                lp._wvPeopleOpenMenu(win, row, MENU_ROW, (pop: any) => {
                    wvMenuItem(doc, { l10n: { id: "weavero-people-row-edit" }, attrs: { "data-wv-pp-cact": "edit" }, onCommand: () => { try { onEdit(); } catch (e) {} } }, pop);
                    wvMenuItem(doc, { l10n: { id: "weavero-people-row-remove" }, attrs: { "data-wv-pp-cact": "remove" }, onCommand: () => { try { onRemove(); } catch (e) {} } }, pop);
                });
            }
            catch (e) {}
        });
    }

    _wvPeopleCardRemoveAsk(win: any, recID: string, card: "contact" | "custom", id: string, what: string) {
        let ok = false;
        try { ok = Services.prompt.confirm(win, wvStr("weavero-people-event-remove", null, null), wvStr("weavero-people-card-remove-confirm", { what }, null)); } catch (e) {}
        if (ok) this._wvPeopleCardRemove(recID, card, id).catch((e: any) => Zotero.debug("[Weavero] people card remove err: " + e));
    }

    async _wvPeopleCardRemove(recID: string, card: "contact" | "custom", id: string): Promise<boolean> {
        const rec: WvPpRecord | null = this._wvPeopleGetRec(recID);
        const list: any[] | undefined = rec ? (rec as any)[card] : undefined;
        if (!rec || !list || !list.some((x) => x.id === id)) return false;
        const left = list.filter((x) => x.id !== id);
        if (left.length) (rec as any)[card] = left;
        else delete (rec as any)[card];
        await this._wvPeopleSave([rec]);
        this._wvPeopleRenderAll();
        return true;
    }

    /** The Contact card. */
    _wvPeopleRenderContact(win: any, main: any, rec: WvPpRecord) {
        const doc = win.document;
        const ed = this._wvPeopleCardEdit(win);
        const mine = ed && ed.card === "contact" && ed.rec === rec.id ? ed : null;
        const items = wvPpContactSorted(rec.contact || []);
        const editMode = this._wvPeopleCardEditMode(win);
        // Nothing to show out of the edit mode: no card (as Google Contacts).
        if (!editMode && !items.length && !mine) return;
        const sec = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, main);
        sec.setAttribute("data-wv-pp-sec", "contact");
        const title = wvHtmlEl(doc, "div", "wv-pp-sectitle", undefined, sec);
        wvHtmlEl(doc, "span", undefined, wvStr("weavero-people-sec-contact", null, null), title);
        const list = wvHtmlEl(doc, "div", "wv-pp-evs", undefined, sec);
        for (const c of items) {
            if (mine && mine.id === c.id) { this._wvPeopleCardForm(win, list, rec); continue; }
            const row = wvHtmlEl(doc, "div", "wv-pp-ev wv-pp-crow", undefined, list);
            row.setAttribute("data-wv-pp-contact", c.id);
            row.setAttribute("data-kind", c.kind);
            wvHtmlEl(doc, "span", "wv-pp-evdate", wvStr("weavero-people-contact-kind", { kind: c.kind }, null), row);
            const body = wvHtmlEl(doc, "span", "wv-pp-evbody", undefined, row);
            const url = c.kind === "email" ? "mailto:" + c.value : c.kind === "phone" ? "tel:" + c.value.replace(/[^\d+]/g, "") : c.kind === "web" ? c.value : "";
            const v = wvHtmlEl(doc, "span", url ? "wv-pp-evlink wv-pp-cval" : "wv-pp-cval", c.value, body);
            if (c.kind === "address") v.classList.add("wv-pp-caddr");
            if (url) this._wvPeopleCardLink(v, url);
            wvHtmlEl(doc, "span", "wv-pp-clabel", labelText(c.label), body);
            if (c.kind === "address") {
                const map = wvHtmlEl(doc, "span", "wv-pp-evlink wv-pp-cmap", wvStr("weavero-people-contact-map", null, null), body);
                this._wvPeopleCardLink(map, "https://www.openstreetmap.org/search?query=" + encodeURIComponent(c.value.replace(/\n/g, ", ")),
                    wvStr("weavero-people-contact-map-tip", null, null));
            }
            this._wvPeopleCardRowActions(win, row,
                () => this._wvPeopleCardSetEdit(win, { card: "contact", rec: rec.id, id: c.id, kind: c.kind,
                    label: (WV_PP_CONTACT_LABELS as readonly string[]).includes(c.label) ? c.label : "custom",
                    custom: (WV_PP_CONTACT_LABELS as readonly string[]).includes(c.label) ? "" : c.label, value: c.value, err: "" }),
                () => { const lp: any = live(); if (lp) lp._wvPeopleCardRemoveAsk(win, rec.id, "contact", c.id, c.value.split("\n")[0]); });
        }
        if (mine && mine.id === null) this._wvPeopleCardForm(win, list, rec);
        if (!mine && editMode) {
            const add = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-contact-add", null, null), title);
            add.setAttribute("type", "button");
            add.setAttribute("data-wv-pp-act", "contact-add");
            add.addEventListener("click", () => {
                const lp: any = live();
                if (!lp) return;
                lp._wvPeopleCardSetEdit(win, { card: "contact", rec: rec.id, id: null, kind: "email", label: "work", custom: "", value: "", err: "" });
                try { const f = win.document.querySelector("[data-wv-pp-focus='card-value']"); if (f) f.focus(); } catch (e) {}
            });
            if (!items.length) wvHtmlEl(doc, "div", "wv-pp-muted", wvStr("weavero-people-contact-none", null, null), sec);
        }
    }

    /** The custom fields' card. */
    _wvPeopleRenderCustom(win: any, main: any, rec: WvPpRecord) {
        const doc = win.document;
        const ed = this._wvPeopleCardEdit(win);
        const mine = ed && ed.card === "custom" && ed.rec === rec.id ? ed : null;
        const editMode = this._wvPeopleCardEditMode(win);
        if (!editMode && !(rec.custom || []).length && !mine) return;
        const sec = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, main);
        sec.setAttribute("data-wv-pp-sec", "custom");
        const title = wvHtmlEl(doc, "div", "wv-pp-sectitle", undefined, sec);
        wvHtmlEl(doc, "span", undefined, wvStr("weavero-people-sec-custom", null, null), title);
        const list = wvHtmlEl(doc, "div", "wv-pp-evs", undefined, sec);
        for (const c of rec.custom || []) {
            if (mine && mine.id === c.id) { this._wvPeopleCardForm(win, list, rec); continue; }
            const row = wvHtmlEl(doc, "div", "wv-pp-ev wv-pp-crow", undefined, list);
            row.setAttribute("data-wv-pp-custom", c.id);
            const lab = wvHtmlEl(doc, "span", "wv-pp-evdate", c.label, row);
            lab.setAttribute("title", c.label);
            const body = wvHtmlEl(doc, "span", "wv-pp-evbody", undefined, row);
            // A value that is a web address (with its scheme, or www.) is a link.
            const url = /^(https?:\/\/|www\.)\S+$/i.test(c.value) ? wvPpEventLink(c.value) : "";
            const v = wvHtmlEl(doc, "span", url ? "wv-pp-evlink wv-pp-cval" : "wv-pp-cval", c.value, body);
            if (url) this._wvPeopleCardLink(v, url);
            this._wvPeopleCardRowActions(win, row,
                () => this._wvPeopleCardSetEdit(win, { card: "custom", rec: rec.id, id: c.id, kind: "", label: c.label, custom: "", value: c.value, err: "" }),
                () => { const lp: any = live(); if (lp) lp._wvPeopleCardRemoveAsk(win, rec.id, "custom", c.id, c.label); });
        }
        if (mine && mine.id === null) this._wvPeopleCardForm(win, list, rec);
        if (!mine && editMode) {
            const add = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-custom-add", null, null), title);
            add.setAttribute("type", "button");
            add.setAttribute("data-wv-pp-act", "custom-add");
            add.addEventListener("click", () => {
                const lp: any = live();
                if (!lp) return;
                lp._wvPeopleCardSetEdit(win, { card: "custom", rec: rec.id, id: null, kind: "", label: "", custom: "", value: "", err: "" });
                try { const f = win.document.querySelector("[data-wv-pp-focus='card-label']"); if (f) f.focus(); } catch (e) {}
            });
            if (!(rec.custom || []).length) wvHtmlEl(doc, "div", "wv-pp-muted", wvStr("weavero-people-custom-none", null, null), sec);
        }
    }

    /** A value that opens `url` on a click or Enter; its address in the tooltip
     *  (or `tip`). */
    _wvPeopleCardLink(el: any, url: string, tip?: string) {
        el.setAttribute("role", "link");
        el.setAttribute("tabindex", "0");
        el.setAttribute("title", tip || url);
        el.setAttribute("data-wv-url", url);
        const go = () => { const lp: any = live(); if (lp) lp._launchURL(url); };
        el.addEventListener("click", go);
        el.addEventListener("keydown", (e: any) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    }

    /** The form of the card being edited. Contact: the kind, the label (Work,
     *  Home, Mobile for a phone, Other, or one's own words), the value (several
     *  lines for an address). Custom: the label (the ones used before offered)
     *  and the value. Enter saves (but in an address), Escape cancels. */
    _wvPeopleCardForm(win: any, parent: any, rec: WvPpRecord) {
        const doc = win.document;
        const ed = this._wvPeopleCardEdit(win);
        if (!ed) return;
        const form = wvHtmlEl(doc, "div", "wv-pp-evform", undefined, parent);
        form.setAttribute("data-wv-pp-cform", ed.card + ":" + (ed.id || "new"));
        const keys = (inp: any, multi: boolean) => inp.addEventListener("keydown", (e: any) => {
            const lp: any = live();
            if (!lp) return;
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); lp._wvPeopleCardSetEdit(win, null); }
            else if (e.key === "Enter" && !multi) { e.preventDefault(); e.stopPropagation(); lp._wvPeopleCardSave(win); }
        });
        const keep = (inp: any, key: "label" | "custom" | "value" | "kind") => inp.addEventListener("input", () => { const cur = edits.get(win); if (cur) (cur as any)[key] = inp.value; });
        const label = (text: string) => wvHtmlEl(doc, "label", "wv-pp-flabel", text, form);
        if (ed.card === "contact") {
            label(wvStr("weavero-people-contact-field", { field: "kind" }, null));
            const kind = wvHtmlEl(doc, "select", undefined, undefined, form);
            kind.setAttribute("data-wv-pp-cfield", "kind");
            for (const k of WV_PP_CONTACT_KINDS) {
                const o = wvHtmlEl(doc, "option", undefined, wvStr("weavero-people-contact-kind", { kind: k }, null), kind);
                o.setAttribute("value", k);
            }
            kind.value = ed.kind;
            // Another kind may take another field (an address: several lines).
            kind.addEventListener("change", () => { const cur = edits.get(win); const lp: any = live(); if (cur && lp) { cur.kind = kind.value; lp._wvPeopleTabRender(win); } });
            label(wvStr("weavero-people-contact-field", { field: "label" }, null));
            const lrow = wvHtmlEl(doc, "div", "wv-pp-evbtns", undefined, form);
            lrow.style.gridColumn = "auto";
            const sel = wvHtmlEl(doc, "select", undefined, undefined, lrow);
            sel.setAttribute("data-wv-pp-cfield", "label");
            for (const l of WV_PP_CONTACT_LABELS) {
                if (l === "mobile" && ed.kind !== "phone") continue;
                const o = wvHtmlEl(doc, "option", undefined, labelText(l), sel);
                o.setAttribute("value", l);
            }
            const oc = wvHtmlEl(doc, "option", undefined, wvStr("weavero-people-contact-label-custom", null, null), sel);
            oc.setAttribute("value", "custom");
            sel.value = ed.label === "mobile" && ed.kind !== "phone" ? "other" : ed.label;
            sel.addEventListener("change", () => { const cur = edits.get(win); const lp: any = live(); if (cur && lp) { cur.label = sel.value; lp._wvPeopleTabRender(win); } });
            if (sel.value === "custom") {
                const own = wvHtmlEl(doc, "input", undefined, undefined, lrow);
                own.setAttribute("type", "text");
                own.setAttribute("data-wv-pp-cfield", "custom");
                own.setAttribute("data-wv-pp-focus", "card-custom");
                own.setAttribute("placeholder", wvStr("weavero-people-contact-ph", { field: "custom" }, null));
                own.value = ed.custom;
                keep(own, "custom");
                keys(own, false);
            }
            label(wvStr("weavero-people-contact-field", { field: "value" }, null));
            const multi = ed.kind === "address";
            const val = wvHtmlEl(doc, multi ? "textarea" : "input", undefined, undefined, form);
            if (!multi) val.setAttribute("type", "text");
            val.setAttribute("data-wv-pp-cfield", "value");
            val.setAttribute("data-wv-pp-focus", "card-value");
            val.setAttribute("placeholder", wvStr("weavero-people-contact-ph", { field: ed.kind }, null));
            val.value = ed.value;
            keep(val, "value");
            keys(val, multi);
        }
        else {
            label(wvStr("weavero-people-custom-field", { field: "label" }, null));
            const lab = wvHtmlEl(doc, "input", undefined, undefined, form);
            lab.setAttribute("type", "text");
            lab.setAttribute("data-wv-pp-cfield", "label");
            lab.setAttribute("data-wv-pp-focus", "card-label");
            lab.value = ed.label;
            keep(lab, "label");
            keys(lab, false);
            const used = wvPpCustomLabels(this._wvPeopleAllSync()).slice(0, 12);
            if (used.length) {
                const box = wvHtmlEl(doc, "div", "wv-pp-evsugg", undefined, form);
                box.setAttribute("data-wv-pp-csugg", "label");
                for (const u of used) {
                    const b = wvHtmlEl(doc, "button", undefined, u, box);
                    b.setAttribute("type", "button");
                    b.setAttribute("tabindex", "-1");
                    b.addEventListener("mousedown", (e: any) => e.preventDefault());
                    b.addEventListener("click", () => { lab.value = u; const cur = edits.get(win); if (cur) cur.label = u; try { lab.focus(); } catch (e) {} });
                }
            }
            label(wvStr("weavero-people-custom-field", { field: "value" }, null));
            const val = wvHtmlEl(doc, "input", undefined, undefined, form);
            val.setAttribute("type", "text");
            val.setAttribute("data-wv-pp-cfield", "value");
            val.setAttribute("data-wv-pp-focus", "card-value");
            val.value = ed.value;
            keep(val, "value");
            keys(val, false);
        }
        const btns = wvHtmlEl(doc, "div", "wv-pp-evbtns", undefined, form);
        const save = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-save", null, null), btns);
        save.setAttribute("type", "button");
        save.setAttribute("data-wv-pp-cact", "save");
        save.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleCardSave(win); });
        const cancel = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-event-cancel", null, null), btns);
        cancel.setAttribute("type", "button");
        cancel.setAttribute("data-wv-pp-cact", "cancel");
        cancel.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleCardSetEdit(win, null); });
        if (ed.err) wvHtmlEl(doc, "span", "wv-pp-everr", ed.err, btns).setAttribute("role", "alert");
    }

    /** Save the form: a contact detail its kind accepts (an email, a phone,
     *  a web address, an address not empty) and a label; a custom field a
     *  label and a value. Saved to people.json, then drawn. */
    async _wvPeopleCardSave(win: any): Promise<boolean> {
        const ed = this._wvPeopleCardEdit(win);
        if (!ed) return false;
        const rec: WvPpRecord | null = this._wvPeopleGetRec(ed.rec);
        if (!rec) { this._wvPeopleCardSetEdit(win, null); return false; }
        if (ed.card === "contact") {
            const label = ed.label === "custom" ? ed.custom.trim() : ed.label;
            const bad = wvPpContactCheck(ed.kind, ed.value);
            if (bad || !label) {
                ed.err = wvStr("weavero-people-contact-bad", { why: !label ? "label" : bad }, null);
                this._wvPeopleTabRender(win);
                return false;
            }
            const c = wvPpContactNorm({ id: ed.id || undefined, kind: ed.kind, label, value: ed.value });
            if (!c) return false;
            const list: WvPpContact[] = (rec.contact || []).slice();
            const at = list.findIndex((x) => x.id === c.id);
            if (at >= 0) list[at] = c;
            else list.push(c);
            rec.contact = list;
        }
        else {
            const f = wvPpCustomNorm({ id: ed.id || undefined, label: ed.label, value: ed.value });
            if (!f) {
                ed.err = wvStr("weavero-people-custom-bad", null, null);
                this._wvPeopleTabRender(win);
                return false;
            }
            const list: WvPpCustom[] = (rec.custom || []).slice();
            const at = list.findIndex((x) => x.id === f.id);
            if (at >= 0) list[at] = f;
            else list.push(f);
            rec.custom = list;
        }
        edits.set(win, null);
        await this._wvPeopleSave([rec]);
        this._wvPeopleRenderAll();
        return true;
    }
}

const _peopleCardsDescriptors = Object.getOwnPropertyDescriptors(_PeopleCardsMixin.prototype);
delete (_peopleCardsDescriptors as any).constructor;
export const peopleCardsMethods = _peopleCardsDescriptors;
