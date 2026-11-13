// Module: the reader toolbar collapses what does not fit into a "more" button at
// its end. WV-TEMP-4185: retire when Zotero's reader collapses its own toolbar.
//
// Zotero's reader toolbar (zotero/reader src/common/components/toolbar.js,
// _toolbar.scss) is one flex row -- start | annotation tools | end -- with no rule for
// a narrow reader: its controls run into each other and past the end (838px measured
// on 11.0-beta.4: start 387 + tools 322 + end 117, 154 with the context-pane toggle).
// In a narrow window, or a split view's side (MJT 2026-11-11: "The right side is not
// visible anymore. I cannot toggle the right pane", then, with a reader whose tools
// covered its page count: "I remember that dstillman suggested that the icons in the
// toolbar go into a dropdown menu at the end when there is not enough space. Can you
// find his comment and implement in the way he suggested?").
//
// dstillman, forums.zotero.org/discussion/118746 (2024-10-14), answering "the icons in
// the center will cover the page numbers": "This can happen at narrow window widths.
// In a future update the icons will collapse into a submenu automatically." The plan,
// zotero/zotero#4185 "Fix reader toolbar at narrow window width" (open): controls
// collapse into a dropdown at the toolbar's end as it narrows -- the Google Docs
// model adomasven proposed and yexingsha adopted -- plugin items and the annotation
// tools first, then zoom, then back and page up/down and the view buttons; "page
// numbers are the most important thing to stay visible". zotero/reader#17 "Handle
// toolbar overflow" (open). Not in the reader as of the 2026-11-10 mirror.
//
// How: only when the toolbar does not fit (a toolbar that fits is left exactly as it
// is). Controls are hidden by an attribute React does not render (it keeps it across
// its re-renders), in that order, until the rest fits; the "more" button, before the
// controls that never collapse at the end (the context-pane toggle), lists them in
// toolbar order with Zotero's own icons and labels, and an entry presses the real
// control -- shown for that moment over the "more" button, so what it opens (the
// colour menu) opens there. Never collapsed: the sidebar toggle, the page field and
// count, the context-pane toggle. Measured again on every width change of the toolbar
// (a ResizeObserver) and every change of its controls (a plugin adding one, React
// redrawing one). Given back whole on disable (_wvTbOverflowTeardown).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvHtmlEl, wvSetBoolAttr } from "../lib/dom";
import { wvLivePlugin } from "../lib/live";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvStr } from "../lib/l10n";
import { wvSvgEl } from "../lib/svg";

declare const Zotero: any;

const STYLE_ID = "wv-tbo-style";
const MORE_ID = "wv-tbo-more";
const MENU_ID = "wv-tbo-menu";
const HIDE = "data-wv-tbo-hidden";
const PROXY = "data-wv-tbo-proxy";
// Room kept between the toolbar's groups (the gap between Zotero's tools).
const GAP = 4;

const CSS = `
.toolbar [${HIDE}] { display: none !important; }
.toolbar [${PROXY}] {
  display: flex !important; position: fixed !important; visibility: hidden !important;
  left: var(--wv-tbo-x, 0px) !important; top: var(--wv-tbo-y, 0px) !important;
}
#${MORE_ID}[hidden] { display: none !important; }
#${MORE_ID} { -moz-window-dragging: no-drag; }
`;

const live = () => wvLivePlugin();

/** What a toolbar control is, for the collapse order and the never-collapse set. */
function kindOf(el: any): "never" | "plugin" | "tool" | "zoom" | "nav" | "end" | "divider" | "more" {
    const id = el.id || "";
    const cl = el.classList;
    if (id === MORE_ID) return "more";
    if (cl.contains("divider")) return "divider";
    if (id === "sidebarToggle" || id === "pageNumber" || id === "numPages" || cl.contains("context-pane-toggle")) return "never";
    if (id === "zoomOut" || id === "zoomIn" || id === "zoomAuto") return "zoom";
    if (id === "readingMode" || id === "read-aloud" || id === "navigateBack" || id === "previous" || id === "next") return "nav";
    if (id === "appearance" || cl.contains("find") || cl.contains("wv-reader-filter-btn")) return "end";
    const tool = ["highlight", "underline", "note", "text", "area", "ink", "toolbar-dropdown-button"];
    if (cl.contains("toolbar-button") && tool.some((c) => cl.contains(c))) return "tool";
    return "plugin";
}

class _ToolbarOverflowMixin {
    [k: string]: any;

    /** Wire reader page `idoc` (idempotent; every scan of the page calls it). */
    _wvTbOverflowEnsure(reader: any, idoc: any) {
        try {
            if (this._wvDestroyed || !idoc) return;
            const tb = idoc.querySelector(".toolbar");
            const end = tb && tb.querySelector(":scope > .end");
            if (!tb || !end) return;
            const tag = this._wvWireTag();
            wvInjectStyle(idoc, STYLE_ID, CSS);
            let more: any = idoc.getElementById(MORE_ID);
            if (more && more.getAttribute("data-wv-tag") !== tag) { more.remove(); more = null; }
            if (!more) {
                more = wvHtmlEl(idoc, "button", "toolbar-button");
                more.id = MORE_ID;
                more.setAttribute("data-wv-tag", tag);
                more.setAttribute("tabindex", "-1");
                const label = wvStr("weavero-reader-toolbar-more");
                more.setAttribute("title", label);
                more.setAttribute("aria-label", label);
                more.setAttribute("aria-haspopup", "menu");
                // A 20px "more" glyph: three dots.
                const svg = wvSvgEl(idoc, "svg", { width: 20, height: 20, viewBox: "0 0 20 20", fill: "currentColor" }, more);
                for (const cx of [4, 10, 16]) wvSvgEl(idoc, "circle", { cx, cy: 10, r: 1.5 }, svg);
                more.hidden = true;
                more.addEventListener("click", (e: any) => {
                    try { e.preventDefault(); e.stopPropagation(); } catch (er) {}
                    const lp = live();
                    if (lp && !lp._wvDestroyed) lp._wvTbOverflowMenu(reader, idoc);
                });
                end.appendChild(more);
            }
            this._wvTbOverflowPlaceMore(idoc);
            const w: any = idoc.__wvTbo;
            if (!w || w.tag !== tag || w.tb !== tb) {
                if (w) { try { w.ro && w.ro.disconnect(); } catch (e) {} try { w.mo && w.mo.disconnect(); } catch (e) {} }
                const iwin = idoc.defaultView;
                const state: any = { tag, tb, pending: false };
                const schedule = () => {
                    if (state.pending) return;
                    state.pending = true;
                    iwin.requestAnimationFrame(() => {
                        state.pending = false;
                        const lp = live();
                        if (lp && !lp._wvDestroyed) lp._wvTbOverflowApply(idoc);
                    });
                };
                state.schedule = schedule;
                if (typeof iwin.ResizeObserver === "function") {
                    state.ro = new iwin.ResizeObserver(schedule);
                    state.ro.observe(tb);
                }
                // A control added, removed or redrawn by React or a plugin: measure again.
                state.mo = new iwin.MutationObserver((recs: any[]) => {
                    for (const r of recs) {
                        const mine = (n: any) => n && n.nodeType === 1 && n.id === MORE_ID;
                        if (Array.from(r.addedNodes || []).every(mine) && Array.from(r.removedNodes || []).every(mine)) continue;
                        schedule();
                        return;
                    }
                });
                state.mo.observe(tb, { childList: true, subtree: true });
                idoc.__wvTbo = state;
                schedule();
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTbOverflowEnsure err: " + e); }
    }

    /** The "more" button at the end of the end group, before the controls that never
     *  collapse there (the context-pane toggle). */
    _wvTbOverflowPlaceMore(idoc: any) {
        const more = idoc.getElementById(MORE_ID);
        const end = idoc.querySelector(".toolbar > .end");
        if (!more || !end) return;
        let before: any = null;
        for (const c of Array.from(end.children) as any[]) {
            if (c !== more && kindOf(c) === "never") { before = c; break; }
        }
        if (before) { if (more.nextSibling !== before || more.parentNode !== end) end.insertBefore(more, before); }
        else if (end.lastChild !== more) end.appendChild(more);
    }

    /** Groups of the toolbar. */
    _wvTbOverflowGroups(idoc: any): { tb: any; start: any; center: any; end: any } | null {
        const tb = idoc.querySelector(".toolbar");
        if (!tb) return null;
        return { tb, start: tb.querySelector(":scope > .start"), center: tb.querySelector(":scope > .center"), end: tb.querySelector(":scope > .end") };
    }

    /** Everything that may collapse, first to collapse first: plugin items (the end
     *  of the tools group, then the plugin toolbar sections), the annotation tools
     *  from the end, zoom, back / page up-down / the view buttons, and last the end
     *  group (Find, Appearance, the annotation filter). */
    _wvTbOverflowOrder(idoc: any): any[] {
        const g = this._wvTbOverflowGroups(idoc);
        if (!g) return [];
        const kids = (el: any) => (el ? Array.from(el.children) as any[] : []);
        const sections = g.end ? g.end.querySelector(":scope > .custom-sections") : null;
        const flat = (el: any) => kids(el).flatMap((c: any) => (c === sections ? kids(c) : [c]));
        const all = [...flat(g.start), ...flat(g.center), ...flat(g.end)];
        const by = (k: string) => all.filter((c) => c !== sections && kindOf(c) === k).reverse();
        const centerPlugins = kids(g.center).filter((c: any) => kindOf(c) === "plugin").reverse();
        const otherPlugins = by("plugin").filter((c) => !centerPlugins.includes(c));
        return [...centerPlugins, ...otherPlugins, ...by("tool"), ...by("zoom"), ...by("nav"), ...by("end")];
    }

    /** Dividers next to nothing go too: a divider whose block after it is gone, or
     *  with nothing left before it in its group; a plugin section left empty. */
    _wvTbOverflowDividers(idoc: any) {
        const g = this._wvTbOverflowGroups(idoc);
        if (!g) return;
        const shown = (c: any) => !c.hasAttribute(HIDE) && kindOf(c) !== "divider" && c.id !== MORE_ID;
        for (const group of [g.start, g.center, g.end]) {
            if (!group) continue;
            const kids = Array.from(group.children) as any[];
            for (let i = 0; i < kids.length; i++) {
                const d = kids[i];
                if (kindOf(d) !== "divider") continue;
                let after = false;
                for (let j = i + 1; j < kids.length && kindOf(kids[j]) !== "divider"; j++) { if (shown(kids[j])) { after = true; break; } }
                const before = kids.slice(0, i).some(shown);
                const hide = !after || !before;
                if (hide !== d.hasAttribute(HIDE)) { if (hide) d.setAttribute(HIDE, ""); else d.removeAttribute(HIDE); }
            }
        }
        const sec = g.end && g.end.querySelector(":scope > .custom-sections");
        if (sec) {
            const empty = sec.children.length > 0 && Array.from(sec.children).every((c: any) => c.hasAttribute(HIDE));
            if (empty !== sec.hasAttribute(HIDE)) { if (empty) sec.setAttribute(HIDE, ""); else sec.removeAttribute(HIDE); }
        }
    }

    /** The toolbar shows every control it keeps whole, none over another. */
    _wvTbOverflowFits(idoc: any): boolean {
        const g = this._wvTbOverflowGroups(idoc);
        if (!g || !g.start || !g.end) return true;
        const iwin = idoc.defaultView;
        const tr = g.tb.getBoundingClientRect();
        const cs = iwin.getComputedStyle(g.tb);
        const padEnd = parseFloat(cs.paddingInlineEnd) || 0;
        const sr = g.start.getBoundingClientRect();
        const er = g.end.getBoundingClientRect();
        const cr = g.center ? g.center.getBoundingClientRect() : null;
        // Zotero draws the page count's "/ N" past the start group (position: absolute).
        const np = g.start.querySelector("#numPages div");
        const sEnd = Math.max(sr.right, np ? np.getBoundingClientRect().right : 0);
        if (er.right > tr.right - padEnd + 0.5) return false;
        if (cr && cr.width >= 1) {
            if (sEnd + GAP > cr.left + 0.5) return false;
            if (cr.right + GAP > er.left + 0.5) return false;
        }
        else if (sEnd + GAP > er.left + 0.5) return false;
        return true;
    }

    /** Collapse what does not fit (see the header). */
    _wvTbOverflowApply(idoc: any) {
        try {
            if (this._wvDestroyed || !idoc || !idoc.defaultView) return;
            const g = this._wvTbOverflowGroups(idoc);
            const more = idoc.getElementById(MORE_ID);
            if (!g || !more) return;
            this._wvTbOverflowPlaceMore(idoc);
            // Everything back, then measure (one write, one read, then the writes).
            for (const el of Array.from(g.tb.querySelectorAll("[" + HIDE + "]")) as any[]) el.removeAttribute(HIDE);
            more.hidden = true;
            if (this._wvTbOverflowFits(idoc)) return;
            more.hidden = false;
            for (const el of this._wvTbOverflowOrder(idoc)) {
                el.setAttribute(HIDE, "");
                this._wvTbOverflowDividers(idoc);
                if (this._wvTbOverflowFits(idoc)) break;
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTbOverflowApply err: " + e); }
    }

    /** The controls hidden now, in toolbar order, with the block each belongs to
     *  (a divider or a group boundary starts a new one). */
    _wvTbOverflowHidden(idoc: any): Array<{ el: any; block: number }> {
        const g = this._wvTbOverflowGroups(idoc);
        const out: Array<{ el: any; block: number }> = [];
        if (!g) return out;
        let block = 0;
        const walk = (el: any) => {
            for (const c of Array.from(el.children) as any[]) {
                const k = kindOf(c);
                if (k === "divider") { block++; continue; }
                if (c.classList.contains("custom-sections")) { block++; walk(c); block++; continue; }
                if (k === "more" || k === "never") continue;
                if (c.hasAttribute(HIDE)) out.push({ el: c, block });
            }
        };
        for (const group of [g.start, g.center, g.end]) { if (group) { block++; walk(group); } }
        return out;
    }

    /** The "more" button's menu, in the reader's own window (where Zotero opens the
     *  reader's menus), under the button. */
    _wvTbOverflowMenu(reader: any, idoc: any) {
        try {
            const win: any = reader && reader._window;
            const more = idoc.getElementById(MORE_ID);
            if (!win || !win.document || !more) return;
            const doc = win.document;
            const old = doc.getElementById(MENU_ID);
            if (old) { try { old.hidePopup(); } catch (e) {} old.remove(); }
            const pop = doc.createXULElement("menupopup");
            pop.id = MENU_ID;
            let lastBlock = -1;
            for (const { el, block } of this._wvTbOverflowHidden(idoc)) {
                if (lastBlock >= 0 && block !== lastBlock) pop.appendChild(doc.createXULElement("menuseparator"));
                lastBlock = block;
                pop.appendChild(this._wvTbOverflowItem(win, reader, idoc, el));
            }
            if (!pop.firstChild) return;
            (doc.querySelector("popupset") || doc.documentElement).appendChild(pop);
            pop.addEventListener("popuphidden", (e: any) => { if (e.target === pop) { try { pop.remove(); } catch (er) {} } });
            const r = more.getBoundingClientRect();
            const iwin = idoc.defaultView;
            pop.openPopupAtScreen(Math.round(iwin.mozInnerScreenX + r.left), Math.round(iwin.mozInnerScreenY + r.bottom), false);
        } catch (e) { Zotero.debug("[Weavero] _wvTbOverflowMenu err: " + e); }
    }

    /** One entry: the control's own label (its title, already localized by the
     *  reader) and icon, checked when the control is on (the active tool), disabled
     *  when it is. */
    _wvTbOverflowItem(win: any, reader: any, idoc: any, el: any): any {
        const doc = win.document;
        const mi = doc.createXULElement("menuitem");
        const label = (el.getAttribute("title") || el.getAttribute("aria-label") || (el.textContent || "").trim() || el.id || "").trim();
        mi.setAttribute("label", label);
        let uri: string | null = null;
        try {
            const img = el.querySelector("img");
            const svg = el.querySelector("svg");
            if (svg) {
                const text = new win.XMLSerializer().serializeToString(svg).replace(/currentColor/g, "context-fill");
                uri = "data:image/svg+xml," + encodeURIComponent(text.indexOf("xmlns=") < 0 ? text.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"') : text);
            }
            else if (img && img.getAttribute("src")) uri = img.getAttribute("src");
        } catch (e) {}
        if (uri) {
            // Zotero 11's menus draw --menuitem-icon (menu.css); 10's list-style-image.
            mi.classList.add("menuitem-iconic");
            mi.setAttribute("image", uri);
            mi.style.setProperty("--menuitem-icon", 'url("' + uri + '")');
            mi.style.listStyleImage = 'url("' + uri + '")';
            mi.style.setProperty("-moz-context-properties", "fill, fill-opacity");
            mi.style.fill = "currentColor";
        }
        if (el.classList.contains("active")) { mi.setAttribute("type", "checkbox"); wvSetBoolAttr(mi, "checked", true); }
        wvSetBoolAttr(mi, "disabled", !!(el.disabled || el.hasAttribute("disabled")));
        // Pressed once this menu has closed: a popup the control opens (the colour
        // menu) would otherwise go with this one's rollup.
        mi.addEventListener("command", () => {
            const pop = mi.parentNode;
            try { if (pop && typeof pop.hidePopup === "function") pop.hidePopup(); } catch (e) {}
            win.setTimeout(() => { const lp = live(); if (lp && !lp._wvDestroyed) lp._wvTbOverflowPress(idoc, el); }, 0);
        });
        void reader;
        return mi;
    }

    /** Press a collapsed control: shown for that moment over the "more" button
     *  (invisible), so a control that opens something from its own place -- the
     *  colour picker's menu -- opens it there. */
    _wvTbOverflowPress(idoc: any, el: any) {
        try {
            const more = idoc.getElementById(MORE_ID);
            if (more && !more.hidden) {
                const r = more.getBoundingClientRect();
                el.style.setProperty("--wv-tbo-x", r.left + "px");
                el.style.setProperty("--wv-tbo-y", r.top + "px");
                el.setAttribute(PROXY, "");
            }
            try {
                if (el.localName === "input") el.focus();
                else el.click();
            }
            finally {
                el.removeAttribute(PROXY);
                el.style.removeProperty("--wv-tbo-x");
                el.style.removeProperty("--wv-tbo-y");
            }
        } catch (e) { Zotero.debug("[Weavero] _wvTbOverflowPress err: " + e); }
    }

    /** Give the toolbar back: every control shown, the button, its menu, the sheet
     *  and the observers gone. */
    _wvTbOverflowTeardown(idoc: any) {
        try {
            if (!idoc) return;
            const w: any = idoc.__wvTbo;
            if (w) {
                try { w.ro && w.ro.disconnect(); } catch (e) {}
                try { w.mo && w.mo.disconnect(); } catch (e) {}
                delete idoc.__wvTbo;
            }
            for (const el of Array.from(idoc.querySelectorAll("[" + HIDE + "], [" + PROXY + "]")) as any[]) {
                el.removeAttribute(HIDE);
                el.removeAttribute(PROXY);
                el.style.removeProperty("--wv-tbo-x");
                el.style.removeProperty("--wv-tbo-y");
            }
            const more = idoc.getElementById(MORE_ID);
            if (more) more.remove();
            wvRemoveStyle(idoc, STYLE_ID);
        } catch (e) {}
    }
}

const _tbOverflowDescriptors = Object.getOwnPropertyDescriptors(_ToolbarOverflowMixin.prototype);
delete (_tbOverflowDescriptors as any).constructor;
export const toolbarOverflowMethods = _tbOverflowDescriptors;
