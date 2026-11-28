// Researchers' authors marked in the item pane's Info section (MJT 2026-11-26,
// "Authors who have a profile in Researchers should be identified"; his picks:
// the Researchers icon right after the name, an initials-only match lighter,
// and "make sure it does not interfere with the hover icons").
//
// Where: in the row's label cell, right before the creator type ("Author"), in
// the room the right-aligned label leaves (MJT 2026-11-26, after seeing it after
// the name: "Try moving the author icon to the left side. I feel that the right
// side is already cluttered with edition icons"). Zotero's `.meta-label` lays out
// its drag handle and its label with `space-between`; the icon's automatic start
// margin puts it against the label, clear of the handle, and the name keeps its
// whole width -- Zotero's switch / minus / plus / options buttons on the right
// meet nothing of Weavero. Blue, Zotero's --accent-blue, as the Researchers tab's
// icon (MJT 2026-11-26, "make the icon blue, similar to Google Contacts, same
// color in the tab header and in the author icon"). A click on it opens the
// person's page (the label still opens the creator types on its own click); the
// right-click menu's Show in Researchers stays the keyboard's way.
//
// When: after every render of the window's `info-box` class (a "ppCmark" layer,
// as upstream-fixes.ts's "paneJump"), and on any change of the records or of the
// Researchers switch (_wvPpCmarkAll, from people.ts _wvPeopleSave / _wvPeopleApply).
// A render that finds the table already drawn (_isAlreadyRendered) keeps the marks
// it has. Reads only: nothing is written to any library.
// Guard: test/people-cmark.spec.js.

import { wvLivePlugin } from "../lib/live";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl } from "../lib/dom";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvWrap, wvUnwrap } from "../lib/wrap";
import { wvListen, wvUnlisten } from "../lib/listen";
import { wvMainWins } from "../lib/windows";
import { wvPpDisplayName } from "../lib/people-record";
import { WV_PP_ICON_SOLID } from "./people";

declare const Zotero: any;

const MARK = "wv-pp-cmark";
const STYLE_ID = "wv-pp-cmark-style";
const LAYER = "ppCmark";
const KEY_DOWN = "lazy:ppCmark:mousedown";
const KEY_CLICK = "lazy:ppCmark:click";

const CSS = `
info-box .meta-label > .${MARK} {
  flex: none; align-self: center; box-sizing: content-box; width: 16px; height: 16px; padding: 1px; margin-inline: auto 4px; border-radius: 4px;
  background: url("${WV_PP_ICON_SOLID}") center / 16px 16px no-repeat; -moz-context-properties: fill; fill: var(--accent-blue, #1a73e8); cursor: pointer;
}
info-box .meta-label > .${MARK}:hover { background-color: var(--fill-quinary, rgba(127,127,127,.15)); }
info-box .meta-label > .${MARK}[data-wv-match="initials"] { opacity: 0.5; }
`;
const SEL = "info-box .meta-label > ." + MARK;

const live = (): any => wvLivePlugin();

class _PeopleCmarkMixin {
    [k: string]: any;

    /** Per main window (WV_MAIN_WIRES "people-cmark"): the layer on the window's own
     *  `info-box` class, the sheet, the click on a mark, and the boxes drawn already. */
    _wvPpCmarkWire(win: any) {
        try {
            const CE = win && win.customElements;
            if (!CE || win.closed) return;
            const cls: any = CE.get("info-box");
            if (!cls) {
                // Zotero defines its elements lazily: wire once it is.
                try {
                    CE.whenDefined("info-box").then(() => {
                        try { const lp = live(); if (lp && !lp._wvDestroyed && !win.closed) lp._wvPpCmarkWire(win); } catch (e) {}
                    }, () => {});
                } catch (e) {}
                return;
            }
            const proto = cls.prototype;
            if (!proto || typeof proto.render !== "function") return;
            wvWrap(proto, "render", LAYER, this._wvWireTag(), (orig: any) => function (this: any, ...args: any[]) {
                const r = orig.apply(this, args);
                try { const lp = live(); if (lp) lp._wvPpCmarkBox(this); } catch (e) {}
                return r;
            });
            const doc = win.document;
            wvInjectStyle(doc, STYLE_ID, CSS);
            // The press would focus a name field (and end an edit elsewhere): the
            // mark's own, taken in the capture phase, before Zotero's handlers.
            const onDown = (e: any) => {
                try {
                    const m = e.target && e.target.closest && e.target.closest(SEL);
                    if (!m || e.button !== 0) return;
                    e.preventDefault(); e.stopPropagation();
                } catch (er) {}
            };
            const onClick = (e: any) => {
                try {
                    const m = e.target && e.target.closest && e.target.closest(SEL);
                    if (!m || e.button !== 0) return;
                    e.preventDefault(); e.stopPropagation();
                    const id = m.getAttribute("data-wv-person");
                    const lp = live();
                    if (lp && id) lp._wvPeopleTabOpen(m.ownerDocument.defaultView, { personID: id });
                } catch (er) { Zotero.debug("[Weavero] researchers mark click err: " + er); }
            };
            wvListen(doc, KEY_DOWN, "mousedown", onDown, true, this._wvWireTag());
            wvListen(doc, KEY_CLICK, "click", onClick, true, this._wvWireTag());
            for (const b of Array.from(doc.querySelectorAll("info-box")) as any[]) this._wvPpCmarkBox(b);
        } catch (e) { Zotero.debug("[Weavero] researchers marks wire err: " + e); }
    }

    /** One Info section: a mark after each author with a profile, the others none. */
    _wvPpCmarkBox(box: any) {
        try {
            if (!box || !box.querySelectorAll) return;
            const marks = Array.from(box.querySelectorAll(".meta-label > ." + MARK)) as any[];
            const item = box.item;
            const on = this._wvPeopleOn() && item && typeof item.isRegularItem === "function" && item.isRegularItem();
            if (!on) { for (const m of marks) m.remove(); return; }
            if (!this._wvPeopleDB) {
                // The records are read at the first need; marked once they are.
                this._wvPeopleLoad().then(() => {
                    try { const lp = live(); if (lp && box.isConnected) lp._wvPpCmarkBox(box); } catch (e) {}
                }, () => {});
                return;
            }
            const doc = box.ownerDocument;
            for (const nb of Array.from(box.querySelectorAll(".creator-name-box")) as any[]) {
                const last = nb.querySelector(".creator-last-name");
                const idx = last && /^itembox-field-value-creator-(\d+)-lastName$/.exec(String(last.id || ""));
                // The item's creator, not the field's text: an edit in progress is not a name yet.
                let c: any = null;
                if (idx) { try { c = item.getCreator(Number(idx[1])); } catch (e) {} }
                const ln = c ? String(c.lastName || "").trim() : "";
                const hit = ln ? this._wvPeopleFindByName(ln, String(c.firstName || "").trim())[0] : null;
                // The row's label cell: Zotero's drag handle, then the creator type's label.
                const row = nb.closest(".meta-row");
                const cell = row && row.querySelector(":scope > .meta-label");
                const label = cell && cell.querySelector(":scope > .creator-type-label");
                let mark: any = cell ? cell.querySelector(":scope > ." + MARK) : null;
                // A mark left in the name box by an earlier build (peoplenet.21) goes.
                for (const old of Array.from(nb.querySelectorAll(":scope > ." + MARK)) as any[]) old.remove();
                if (!hit || !label) { if (mark) mark.remove(); continue; }
                if (!mark) {
                    mark = wvHtmlEl(doc, "span", MARK);
                    mark.setAttribute("role", "button");
                }
                // Right before the label.
                if (label.previousElementSibling !== mark) cell.insertBefore(mark, label);
                mark.setAttribute("data-wv-person", hit.rec.id);
                mark.setAttribute("data-wv-match", hit.match);
                const name = wvPpDisplayName(hit.rec);
                mark.setAttribute("title", wvStr(hit.match === "exact" ? "weavero-people-cmark-tip" : "weavero-people-cmark-tip-maybe", { name }));
            }
        } catch (e) { Zotero.debug("[Weavero] researchers marks err: " + e); }
    }

    /** Every Info section of every main window again (the records or the switch changed). */
    _wvPpCmarkAll() {
        for (const w of wvMainWins() as any[]) {
            try { for (const b of Array.from(w.document.querySelectorAll("info-box")) as any[]) this._wvPpCmarkBox(b); } catch (e) {}
        }
    }

    /** destroy(): the layer, the sheet, the clicks and every mark, in every main window. */
    _wvPpCmarkDestroy() {
        for (const w of wvMainWins() as any[]) {
            try {
                const cls: any = w && w.customElements && w.customElements.get("info-box");
                if (cls && cls.prototype) wvUnwrap(cls.prototype, "render", LAYER);
                const doc = w.document;
                wvUnlisten(doc, KEY_DOWN);
                wvUnlisten(doc, KEY_CLICK);
                for (const m of Array.from(doc.querySelectorAll("info-box ." + MARK)) as any[]) m.remove();
                wvRemoveStyle(doc, STYLE_ID);
            } catch (e) {}
        }
    }
}

const _cmDescriptors = Object.getOwnPropertyDescriptors(_PeopleCmarkMixin.prototype);
delete (_cmDescriptors as any).constructor;
export const peopleCmarkMethods = _cmDescriptors;
