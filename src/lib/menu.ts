// One XUL menuitem builder (survey 2026-10-06 §4 #10). Thirteen `mk`
// lambdas built a menuitem by hand -- label, an icon class or image, an
// acceltext, a disabled flag, a command handler wrapped in its own
// try/catch -- each a little differently. The handler's own extras (stop
// propagation, hide the popup first, resolve the live plugin) stay in the
// caller's handler; what every item shares is here.

export interface WvMenuItemSpec {
    label?: string;
    /** Fluent id (+ args) instead of a literal label, when the document has l10n. */
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
    if (spec.l10n && doc.l10n) doc.l10n.setAttributes(mi, spec.l10n.id, spec.l10n.args || {});
    else if (spec.label != null) mi.setAttribute("label", spec.label);
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

/** A XUL `menuseparator`, appended to `parent` when given. */
export function wvMenuSeparator(doc: any, parent?: any): any {
    const sep: any = doc.createXULElement("menuseparator");
    if (parent) parent.appendChild(sep);
    return sep;
}
