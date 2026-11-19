// One XUL menuitem builder (survey 2026-10-06 §4 #10). Thirteen `mk`
// lambdas built a menuitem by hand -- label, an icon class or image, an
// acceltext, a disabled flag, a command handler wrapped in its own
// try/catch -- each a little differently. The handler's own extras (stop
// propagation, hide the popup first, resolve the live plugin) stay in the
// caller's handler; what every item shares is here.

import { wvL10n } from "./l10n";

export interface WvMenuItemSpec {
    /** A label that is DATA (a name, a title): Weavero's own words go in
     *  `l10n` (weavero.ftl; test/menus-l10n.spec.js). */
    label?: string;
    /** Fluent id (+ args): weavero.ftl's, linked into the document first, or
     *  one of Zotero's (lib/l10n.ts wvL10n). */
    l10n?: { id: string; args?: any };
    /** Classes to add, as one string of space-separated names or a list. */
    cls?: string | string[];
    /** An `image` attribute (chrome:// url) -- adds `menuitem-iconic`. */
    image?: string;
    /** A class that carries the icon (`--menuitem-icon` in a sheet) -- adds `menuitem-iconic`. */
    iconClass?: string;
    acceltext?: string;
    disabled?: boolean;
    checked?: boolean;
    /** Extra attributes, verbatim. */
    attrs?: { [name: string]: string };
    /** The command handler; a thrown error is logged, a returned promise's
     *  rejection too (never left unhandled). */
    onCommand?: (ev: any) => any;
}

/** A XUL `menuitem` from `spec`, appended to `parent` when given. */
export function wvMenuItem(doc: any, spec: WvMenuItemSpec, parent?: any): any {
    const mi: any = doc.createXULElement("menuitem");
    if (spec.label != null) mi.setAttribute("label", spec.label);
    if (spec.l10n) wvL10n(mi, spec.l10n.id, spec.l10n.args);
    const classes: string[] = [];
    if (spec.cls) classes.push(...(Array.isArray(spec.cls) ? spec.cls : String(spec.cls).split(/\s+/)).filter(Boolean));
    if (spec.image) { mi.setAttribute("image", spec.image); classes.push("menuitem-iconic"); }
    if (spec.iconClass) classes.push("menuitem-iconic", spec.iconClass);
    for (const c of classes) mi.classList.add(c);
    if (spec.acceltext) mi.setAttribute("acceltext", spec.acceltext);
    if (spec.disabled) mi.setAttribute("disabled", "true");
    if (spec.checked) { mi.setAttribute("type", "checkbox"); mi.setAttribute("checked", "true"); }
    if (spec.attrs) for (const k of Object.keys(spec.attrs)) mi.setAttribute(k, spec.attrs[k]);
    if (spec.onCommand) {
        const fn = spec.onCommand;
        mi.addEventListener("command", (ev: any) => {
            try {
                const r = fn(ev);
                if (r && typeof r.catch === "function") r.catch((e: any) => Zotero.debug("[Weavero] menu command err: " + e));
            }
            catch (e) { Zotero.debug("[Weavero] menu command err: " + e); }
        });
    }
    if (parent) parent.appendChild(mi);
    return mi;
}

/** The menuitem of `popup` whose label is exactly `label`. For the entries
 *  Zotero renders from a plugin's plain-text label (the reader's context
 *  menus: xpcom/reader.js _openContextMenu gives them nothing else), the
 *  label Weavero passed -- from weavero.ftl, in any language -- is the only
 *  handle. Compared as a string: a CSS selector built from it broke on a
 *  translation's quote (test/menus-l10n.spec.js). */
export function wvMenuItemByLabel(popup: any, label: string): any {
    try {
        for (const el of (popup && popup.querySelectorAll ? popup.querySelectorAll("menuitem") : [])) {
            if (el.getAttribute("label") === label) return el;
        }
    } catch (e) {}
    return null;
}

/** Zotero's MenuManager labels an entry only through its data-l10n-id
 *  (xpcom/pluginAPI/menuManager.js: `menuElem.dataset.l10nId`), and Fluent
 *  translates that asynchronously -- not always before the popup is on
 *  screen: Firefox does not promise it (bug 1737951, open), and the
 *  2026-11-16 CI run on Windows, Zotero 10.0.9, saw an entry labelled in
 *  `popupshowing` still empty at `popupshown`. So every Weavero
 *  registration passes its `menus` through this: an entry with an l10nID
 *  writes its text synchronously in `onShowing` (lib/l10n.ts wvL10n, the
 *  element's own current id and args), before its own hook runs, which may
 *  relabel it the same way. A hook relabels with wvL10n(ctx.menuElem, ...),
 *  never with MenuManager's ctx.setL10nArgs (asynchronous again).
 *  Guard: test/menus-l10n.spec.js, every audit with Fluent paused. */
export function wvMMSyncLabels(menus: any[]): any[] {
    return (menus || []).map((m: any) => {
        if (!m || typeof m !== "object") return m;
        const out: any = Object.assign({}, m);
        if (Array.isArray(m.menus)) out.menus = wvMMSyncLabels(m.menus);
        if (!m.l10nID || m.menuType === "separator") return out;
        const orig = m.onShowing;
        out.onShowing = function (this: any, ev: any, ctx: any) {
            try {
                const el = ctx && ctx.menuElem;
                if (el) {
                    const id = el.getAttribute("data-l10n-id") || m.l10nID;
                    let args: any;
                    try { args = JSON.parse(el.getAttribute("data-l10n-args") || "null") || undefined; } catch (e) { args = undefined; }
                    wvL10n(el, id, args);
                }
            }
            catch (e) { Zotero.debug("[Weavero] menu label err: " + e); }
            if (typeof orig === "function") return orig.apply(this, arguments as any);
        };
        return out;
    });
}

/** `MM.registerMenu(opts)` with every entry labelled synchronously
 *  (wvMMSyncLabels): the one way Weavero registers with MenuManager. */
export function wvMMRegister(MM: any, opts: any): any {
    return MM.registerMenu(Object.assign({}, opts, { menus: wvMMSyncLabels(opts && opts.menus) }));
}

/** A XUL `menuseparator`, appended to `parent` when given. */
export function wvMenuSeparator(doc: any, parent?: any): any {
    const sep: any = doc.createXULElement("menuseparator");
    if (parent) parent.appendChild(sep);
    return sep;
}
