/* global describe, it, before, after, assert, Zotero, Services, IOUtils, PathUtils, wvT, Components */

// Does Weavero's text fit in every language it ships? (MJT 2026-11-26: "make sure
// that all the text of Weavero fits correctly in all languages in the UI".) An
// AUDIT: each surface Weavero draws is opened in the runner, in the runner's UI
// language (WV_TEST_LOCALE, zotero-plugin.config.ts), and a generic detector
// measures every Weavero element that carries text or is a control:
//   (a) text cut: scrollWidth > clientWidth + 1 (or the height) where the box
//       hides its overflow -- with an ellipsis (recorded; the cut matters where
//       it hides the meaning) or without one; a single-line XUL label measured
//       against its box; a placeholder against its field; text cut by an
//       ancestor that clips it; a line clamp that bites;
//   (b) a box that leaves its container, its surface or the window: a button
//       or an icon pushed out of view;
//   (c) two sibling boxes that overlap, and text that spills over another box;
//   (d) a label that wraps to 2+ lines in a place meant to be one line (a
//       button, a chip, a header, a tab, a menu row).
// Menus and panels are windows of their own: their geometry is recorded (the
// popup's width, the entry cap --menuitem-max-width / 42em, the entries whose
// words are cut). Findings never fail a test; a surface that cannot be opened
// does. They are written as JSON to $WV_L10N_FIT_OUT, else to
// D:\tmp\l10n-fit\<locale>-<Zotero major>.json (Windows); a PNG per surface
// under D:\tmp\l10n-fit\png\<locale>\ (drawSnapshot of the window; a popup
// gets its place on the screen instead, drawSnapshot never paints one).
// The report and its method: work/l10n-fit-2026-11-26.md (private).
//
// It runs only when asked: named in WV_TEST_ENTRIES (a targeted run), or with
// WV_L10N_FIT set -- the full suite and CI leave it pending (PENDING_ALLOWLIST).
// python D:/tmp/wv-scripts/l10nfit-run.py <worktree> en-US:z11 de:z11 ... runs it
// in several languages.

describe("Weavero — l10n fit audit: Weavero's text in the UI language", function () {
    this.timeout(900000);
    const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    const XHTML = "http://www.w3.org/1999/xhtml";
    /** @type {any} */ let wv;
    /** @type {any} */ let lib;
    /** @type {any} */ let win;
    /** @type {any} */ let doc;
    /** @type {any} */ let ZP;
    let LOC = "", ZV = 0, OUT = "", PNG = "";
    let size0 = null, runner0 = null;
    /** @type {any} */ let P, A, N, X, S, T1, T2, R1;
    const bms = [];
    /** Text that is data (fixture titles, names): an ellipsis on it is not a finding. */
    const DATA = ["WVFIT", "Wvfit", "wvfit", "example.org"];
    /** @type {any} */
    const R = { spec: 4, locale: "", zotero: "", weavero: "", started: new Date().toISOString(), window: null, surfaces: {} };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const r1 = (x) => Math.round(x * 10) / 10;
    const bx = (r) => [r1(r.left), r1(r.top), r1(r.width), r1(r.height)];
    const gcs = (el) => el.ownerDocument.defaultView.getComputedStyle(el);
    const parentOf = (e) => e.parentElement || (e.parentNode && e.parentNode.host) || null;
    async function until(fn, ms, every) {
        const end = Date.now() + (ms || 5000);
        for (;;) {
            let v = null;
            try { v = await fn(); } catch (e) { v = null; }
            if (v || Date.now() > end) return v;
            await sleep(every || 100);
        }
    }
    /** Two frames (bounded: a hidden window never runs its rAF) and a beat. */
    async function settle(view, extra) {
        const v = view || win;
        await new Promise((res) => {
            let done = false;
            const t = setTimeout(() => { if (!done) { done = true; res(null); } }, 300);
            try { v.requestAnimationFrame(() => v.requestAnimationFrame(() => { if (!done) { done = true; clearTimeout(t); res(null); } })); } catch (e) {}
        });
        await sleep(extra == null ? 150 : extra);
    }

    // ---- the detector ---------------------------------------------------------

    const ownText = (el) => [...el.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim());
    const textOf = (el) => {
        const t = ownText(el).map(n => n.nodeValue).join(" ").replace(/\s+/g, " ").trim();
        if (t) return t;
        if (el.namespaceURI === XUL && (el.localName === "label" || el.localName === "description")) return String(el.getAttribute("value") || "").trim();
        return "";
    };
    const isData = (t) => DATA.some(d => t.includes(d));
    let ctx2d = null;
    /** The rendered width of `text` in `el`'s font (canvas measure). */
    function textWidth(text, el) {
        if (!ctx2d) ctx2d = /** @type {any} */ (doc.createElementNS(XHTML, "canvas")).getContext("2d");
        const cs = gcs(el);
        ctx2d.font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].filter(Boolean).join(" ");
        const t = cs.textTransform === "uppercase" ? text.toUpperCase() : text;
        return ctx2d.measureText(t).width + (parseFloat(cs.letterSpacing) || 0) * t.length;
    }
    function textRects(el) {
        const out = [];
        const d = el.ownerDocument;
        for (const tn of ownText(el)) {
            const rg = d.createRange();
            rg.selectNodeContents(tn);
            for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) out.push(r);
        }
        return out;
    }
    const union = (rs) => {
        const u = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, width: 0, height: 0 };
        for (const r of rs) { u.left = Math.min(u.left, r.left); u.top = Math.min(u.top, r.top); u.right = Math.max(u.right, r.right); u.bottom = Math.max(u.bottom, r.bottom); }
        u.width = u.right - u.left; u.height = u.bottom - u.top;
        return u;
    };
    const lineCount = (rs) => {
        if (!rs.length) return 0;
        const h = Math.max(4, Math.min(...rs.map(r => r.height)) * 0.6);
        let n = 0, last = -1e9;
        for (const t of rs.map(r => r.top).sort((a, b) => a - b)) if (t - last > h) { n++; last = t; }
        return n;
    };
    const visible = (el) => {
        try {
            if (typeof el.checkVisibility === "function" && !el.checkVisibility({ checkVisibilityCSS: true })) return false;
            const r = el.getBoundingClientRect();
            return r.width >= 1 && r.height >= 1;
        } catch (e) { return false; }
    };
    const innerBox = (a) => {
        const r = a.getBoundingClientRect();
        const left = r.left + (a.clientLeft || 0), top = r.top + (a.clientTop || 0);
        const w = a.clientWidth || r.width, h = a.clientHeight || r.height;
        return { left, top, right: left + w, bottom: top + h, width: w, height: h };
    };
    /** The nearest ancestor that clips or scrolls horizontally, up to `stop` (included). */
    function clipAncestor(el, stop) {
        for (let a = parentOf(el); a; a = parentOf(a)) {
            try { if (gcs(a).overflowX !== "visible") return a; } catch (e) {}
            if (a === stop) break;
        }
        return null;
    }
    const CONTROL_TAGS = new Set(["button", "toolbarbutton", "input", "select", "menulist", "textarea", "img", "image", "search-textbox", "checkbox", "radio"]);
    const isControl = (el) => {
        if (CONTROL_TAGS.has(el.localName)) return true;
        if (el.localName === "svg" && !(el.parentElement && el.parentElement.closest && el.parentElement.closest("svg"))) return true;
        const role = el.getAttribute && el.getAttribute("role");
        if (role && /^(button|tab|menuitem|checkbox|switch)$/.test(role)) return true;
        for (const c of el.classList || []) if (/^wv-.*(btn|button|twisty|toggle|remove|close|icon|more|add)$/.test(c)) return true;
        return false;
    };
    const ONE_LINE_TAGS = new Set(["button", "toolbarbutton", "menuitem", "menu", "tab", "menulist", "option", "select", "summary", "h1", "h2", "h3", "h4", "th"]);
    const ONE_LINE_CLS = /^wv-.*(btn|button|chip|pill|tab|head|header|headtitle|title|count|sort|sortlab|sortlabel|scope|nav|navitem|navlab|caption|badge|menuitem|trigger|toggle|seg|field|op|label|name|grouphead|gh-title|more)$/;
    const FREE_CLS = /^wv-.*(desc|hint|empty|text|excerpt|note|msg|info|sub|abs|reason|intro|explain|help|tip|body|lines?)$/;
    /** Why `el` should hold one line ("button", ".wv-x-chip", ...), or null. */
    function oneLine(el, root, cs) {
        if (/-webkit-box/.test(cs.display) || (cs.webkitLineClamp && cs.webkitLineClamp !== "none")) return null;
        if (/anywhere|break-word/.test(cs.overflowWrap || "")) return null;
        for (let e = el, d = 0; e && d < 3; e = parentOf(e), d++) {
            for (const c of e.classList || []) if (FREE_CLS.test(c)) return null;
            if (ONE_LINE_TAGS.has(e.localName)) return e.localName;
            if (e.localName === "checkbox" || e.localName === "radio") return e.localName;
            const role = e.getAttribute && e.getAttribute("role");
            if (role && /^(button|tab|menuitem|option)$/.test(role)) return "role=" + role;
            for (const c of e.classList || []) if (ONE_LINE_CLS.test(c)) return "." + c;
            if (e === root) break;
        }
        return null;
    }
    const tok = (e) => {
        let t = e.localName || "?";
        if (e.id && !/\d{2,}|[A-Z0-9]{8}/.test(e.id)) t += "#" + e.id;
        const cls = [...(e.classList || [])].filter(c => !/^(hover|active|selected|focus|focused|open|is-|wv-on$|wv-active$)/.test(c)).slice(0, 2);
        if (cls.length) t += "." + cls.join(".");
        const pane = e.getAttribute && e.getAttribute("data-pane");
        if (pane) t += "[" + pane.replace(/^.*-(weavero-)/, "$1") + "]";
        return t;
    };
    /** A key for `el` that holds across languages: its tokens up to `root`, an
     *  index among same-token siblings. */
    function keyOf(el, root) {
        const parts = [];
        let e = el;
        for (let d = 0; e && d < 6; d++) {
            let t = tok(e);
            const p = parentOf(e);
            if (p && p.children) {
                const same = [...p.children].filter(c => tok(c) === t);
                if (same.length > 1) t += ":" + same.indexOf(e);
            }
            parts.unshift(t);
            if (e === root) break;
            e = p;
        }
        return parts.join(" > ");
    }
    const l10nOf = (el, root) => {
        for (let e = el, d = 0; e && d < 4; e = parentOf(e), d++) {
            const id = e.getAttribute && e.getAttribute("data-l10n-id");
            if (id) return id;
            if (e === root) break;
        }
        return null;
    };
    /** Every element under `root` (its shadow trees too), closed popups left
     *  out (a menulist's list reports boxes while it is shut). */
    function collect(root) {
        const out = [];
        const walk = (el) => {
            if (!el || el.nodeType !== 1) return;
            if (el.localName === "style" || el.localName === "script" || el.localName === "link") return;
            if (el !== root && /^(menupopup|panel|tooltip)$/.test(el.localName) && el.state !== "open") return;
            out.push(el);
            for (const c of el.children) walk(c);
            const sr = el.openOrClosedShadowRoot || el.shadowRoot;
            if (sr) for (const c of sr.children) walk(c);
        };
        walk(root);
        return out;
    }
    const SEV = { "cut": 3, "cut-v": 3, "cut-by": 3, "out-clipped": 3, "out-root": 3, "out-frame": 3, "root-out": 3, "overlap": 3, "text-overlap": 3,
        "menu-cut": 3, "ellipsis": 2, "ellipsis-same": 3, "wrap": 2, "spill": 2, "hscroll": 2, "placeholder-cut": 2, "menu-at-cap": 1, "clamped": 1, "nav-rows": 1, "wrap-control": 1 };
    function add(Sx, f) {
        if (Sx.findings.length >= 600) { Sx.dropped = (Sx.dropped || 0) + 1; return; }
        if (f.sev == null) f.sev = SEV[f.type] == null ? 1 : SEV[f.type];
        Sx.findings.push(f);
    }

    /** Audit the subtree `root` into surface record `Sx`. opts: sub (a name for
     *  this part), frame (the element or rect the surface must stay inside:
     *  its pane, its popup; default the window), only (el => bool). */
    function audit(Sx, root, opts) {
        const o = opts || {};
        const sub = o.sub || "";
        const view = root.ownerDocument.defaultView;
        const rootR = root.getBoundingClientRect();
        let frameR = null;
        if (o.frame && o.frame.getBoundingClientRect) frameR = innerBox(o.frame);
        else if (o.frame) frameR = o.frame;
        else frameR = { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight, width: view.innerWidth, height: view.innerHeight };
        const part = { sub, root: bx(rootR), frame: bx(frameR), audited: 0, texts: 0, wrapsFree: 0 };
        Sx.parts.push(part);
        const rkey = (el) => keyOf(el, root);
        if (rootR.right > frameR.right + 1 || rootR.left < frameR.left - 1) {
            add(Sx, { sub, type: "root-out", key: rkey(root), text: "", box: bx(rootR), lim: bx(frameR) });
        }
        const els = collect(root).filter(visible);
        const textBoxes = [];
        const textUnion = new Map();
        const boxes = new Map();
        const parents = new Set();
        const hscrolled = new Set();
        for (const el of els) {
            try {
                if (o.only && !o.only(el)) continue;
                // A field's own insides (its placeholder's box): the field is measured itself.
                if (el.localName !== "input" && el.closest && el.closest("input, textarea")) continue;
                {
                    let inField = false;
                    for (let a = parentOf(el); a && !inField; a = parentOf(a)) if (a.localName === "input" || a.localName === "textarea") inField = true;
                    if (inField) continue;
                }
                const txt = textOf(el);
                const ctl = isControl(el);
                if (!txt && !ctl) continue;
                part.audited++;
                const r = el.getBoundingClientRect();
                boxes.set(el, r);
                if (parentOf(el)) parents.add(parentOf(el));
                const cs = gcs(el);
                const base = () => ({ sub, key: rkey(el), l10n: l10nOf(el, root), text: txt.slice(0, 90) });
                const data = txt && isData(txt);
                if (txt) {
                    part.texts++;
                    // What the surface showed (the static pass's ids are matched against it).
                    if (Sx.seen.length < 3000 && !Sx.seen.includes(txt)) Sx.seen.push(txt.slice(0, 160));
                    const hidesX = cs.overflowX === "hidden" || cs.overflowX === "clip";
                    const hidesY = cs.overflowY === "hidden" || cs.overflowY === "clip";
                    const ell = /ellipsis/.test(cs.textOverflow);
                    const sw = el.scrollWidth, cw = el.clientWidth, sh = el.scrollHeight, ch = el.clientHeight;
                    const xulValue = !ownText(el).length;
                    if (hidesX && cw > 0 && sw > cw + 1) {
                        add(Sx, Object.assign(base(), { type: ell ? "ellipsis" : "cut", sev: ell && data ? 0 : undefined, sw, cw }));
                    }
                    else if (xulValue && cw > 0) {
                        const tw = textWidth(txt, el);
                        if (tw > cw + 1.5) add(Sx, Object.assign(base(), { type: (el.hasAttribute("crop") || ell) ? "ellipsis" : "cut", sev: data ? 0 : undefined, textW: r1(tw), cw }));
                    }
                    const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== "none";
                    if (hidesY && ch > 0 && sh > ch + 1 && !(hidesX && sw > cw + 1)) {
                        add(Sx, Object.assign(base(), { type: clamp ? "clamped" : "cut-v", sev: data ? 0 : undefined, sh, ch, clamp: clamp ? cs.webkitLineClamp : null }));
                    }
                    const trs = textRects(el);
                    if (trs.length) {
                        const tu = union(trs);
                        textUnion.set(el, tu);
                        // (A one-glyph arrow or mark a hair wider than its box is the font's.)
                        if (!hidesX && txt.length > 2 && (tu.right > r.right + 1.5 || tu.left < r.left - 1.5)) {
                            add(Sx, Object.assign(base(), { type: "spill", textBox: bx(tu), box: bx(r) }));
                            textBoxes.push({ el, tu });
                        }
                        const A = clipAncestor(el, o.frame && o.frame.nodeType ? o.frame : root);
                        if (A && !hidesX) {
                            const ib = innerBox(A);
                            const scrolls = /auto|scroll/.test(gcs(A).overflowX);
                            if (!scrolls && (tu.right > ib.right + 1.5 || tu.left < ib.left - 1.5)) {
                                add(Sx, Object.assign(base(), { type: "cut-by", sev: data ? 1 : undefined, by: keyOf(A, root), textBox: bx(tu), clip: bx(ib) }));
                            }
                        }
                        const lines = lineCount(trs);
                        if (lines >= 2 && !/nowrap|pre$/.test(cs.whiteSpace)) {
                            const why = oneLine(el, root, cs);
                            if (why) add(Sx, Object.assign(base(), { type: (why === "checkbox" || why === "radio") ? "wrap-control" : "wrap", lines, why, box: bx(r) }));
                            else part.wrapsFree++;
                        }
                    }
                }
                // Placeholders: the field's words against the field.
                const field = el.localName === "search-textbox" ? (el.inputField || el) : el;
                const ph = field && field.getAttribute && (field.getAttribute("placeholder") || el.getAttribute("placeholder"));
                if (ph && !field.value && field.clientWidth > 0) {
                    const fcs = gcs(field);
                    const avail = field.clientWidth - (parseFloat(fcs.paddingLeft) || 0) - (parseFloat(fcs.paddingRight) || 0);
                    const tw = textWidth(ph, field);
                    if (tw > avail + 1.5) add(Sx, { sub, type: "placeholder-cut", key: rkey(el), l10n: l10nOf(el, root), text: ph.slice(0, 90), textW: r1(tw), avail: r1(avail) });
                }
                // (b) the box against what holds it.
                const A = clipAncestor(el, root);
                const lim = A ? innerBox(A) : rootR;
                if (r.right > lim.right + 1.5 || r.left < lim.left - 1.5) {
                    const scrolls = A && /auto|scroll/.test(gcs(A).overflowX);
                    if (scrolls) { if (!hscrolled.has(A)) { hscrolled.add(A); add(Sx, { sub, type: "hscroll", key: keyOf(A, root), text: "", sw: A.scrollWidth, cw: A.clientWidth }); } }
                    else add(Sx, Object.assign(base(), { type: A ? "out-clipped" : "out-root", sev: data && !ctl ? 1 : undefined, ctl, box: bx(r), lim: bx(lim) }));
                }
                if (r.right > frameR.right + 1.5 || r.left < frameR.left - 1.5) {
                    add(Sx, Object.assign(base(), { type: "out-frame", ctl, box: bx(r), lim: bx(frameR) }));
                }
            }
            catch (e) { Sx.errors = (Sx.errors || 0) + 1; if (!Sx.firstError) Sx.firstError = String(e); }
        }
        // (c) siblings that overlap (boxes laid out side by side: an inline
        // box that runs over two lines spans both, so inline ones are left to
        // the text check); text spilling over another box.
        for (const p of parents) {
            try {
                const kids = [...p.children].filter((c) => {
                    if (!visible(c)) return false;
                    const cs = gcs(c);
                    // (A rotated twisty's box is its turned bounding box, not its glyph.)
                    return !/absolute|fixed/.test(cs.position) && cs.display !== "contents" && cs.display !== "inline" && cs.transform === "none"
                        && !/^(menupopup|panel|tooltip|popupset|style|script)$/.test(c.localName);
                }).map(c => [c, c.getBoundingClientRect()]);
                for (let i = 0; i < kids.length; i++) {
                    for (let j = i + 1; j < kids.length; j++) {
                        const a = kids[i][1], b = kids[j][1];
                        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                        if (ox > 1.5 && oy > 1.5) {
                            add(Sx, { sub, type: "overlap", key: keyOf(kids[i][0], root), with: keyOf(kids[j][0], root), text: (textOf(kids[i][0]) || textOf(kids[j][0]) || "").slice(0, 60),
                                l10n: l10nOf(kids[i][0], root) || l10nOf(kids[j][0], root), ox: r1(ox), oy: r1(oy), a: bx(a), b: bx(b) });
                        }
                    }
                }
            }
            catch (e) { Sx.errors = (Sx.errors || 0) + 1; }
        }
        for (const { el, tu } of textBoxes) {
            for (const [other, b] of boxes) {
                if (other === el || other.contains(el) || el.contains(other)) continue;
                const ox = Math.min(tu.right, b.right) - Math.max(tu.left, b.left);
                const oy = Math.min(tu.bottom, b.bottom) - Math.max(tu.top, b.top);
                if (ox > 1.5 && oy > 1.5) {
                    add(Sx, { sub, type: "text-overlap", key: rkey(el), with: rkey(other), l10n: l10nOf(el, root), text: textOf(el).slice(0, 60), ox: r1(ox), oy: r1(oy) });
                    break;
                }
            }
        }
        // A small control placed absolutely (a row's mark or buttons, at most
        // 120 x 48 px -- a dropdown is meant to cover what is under it) drawn
        // over words that are not its own (the Researchers row's ★ over the
        // last column, 2026-11-26: its box of three 24-px buttons is 82 px).
        for (const [el, b] of boxes) {
            try {
                if (!isControl(el)) continue;
                let fl = null;
                for (let a = el; a && a !== root; a = parentOf(a)) { if (/absolute|fixed/.test(gcs(a).position)) { fl = a; break; } }
                if (!fl) continue;
                const fr = fl.getBoundingClientRect();
                if (fr.width > 120 || fr.height > 48) continue;
                for (const [t, tu] of textUnion) {
                    if (fl.contains(t) || t.contains(fl)) continue;
                    const ox = Math.min(tu.right, b.right) - Math.max(tu.left, b.left);
                    const oy = Math.min(tu.bottom, b.bottom) - Math.max(tu.top, b.top);
                    if (ox > 2 && oy > 2) {
                        add(Sx, { sub, type: "covers-text", sev: 2, key: rkey(el), with: rkey(t), l10n: l10nOf(t, root), text: textOf(t).slice(0, 60), ox: r1(ox), oy: r1(oy), box: bx(b), textBox: bx(tu) });
                        break;
                    }
                }
            }
            catch (e) { Sx.errors = (Sx.errors || 0) + 1; }
        }
        // Ellipses that leave two entries reading the same (a guess: the visible
        // characters estimated from the widths).
        const ells = Sx.findings.filter(f => f.sub === sub && f.type === "ellipsis" && f.cw && (f.sw || f.textW));
        const seen = new Map();
        for (const f of ells) {
            const full = f.text;
            const vis = full.slice(0, Math.max(1, Math.floor(full.length * (f.cw - 8) / (f.sw || f.textW))));
            const k = f.key.replace(/:\d+(?= >|$)/g, "") + "|" + vis;
            if (seen.has(k) && seen.get(k) !== full) add(Sx, { sub, type: "ellipsis-same", key: f.key, text: full, other: seen.get(k), visible: vis, guess: true });
            else seen.set(k, full);
        }
        return part;
    }

    const isWeavero = (el) => {
        if (el.id && el.id.startsWith("wv-")) return true;
        for (const c of el.classList) if (c.startsWith("wv-") || c.startsWith("weavero@mjthoraval-")) return true;
        for (const a of el.attributes) if (a.name.startsWith("data-wv")) return true;
        const id = el.getAttribute("data-l10n-id");
        return !!(id && id.startsWith("weavero-"));
    };
    /** A XUL menu's geometry: its width, the entries' cap, the entries whose
     *  words do not fit (Weavero's: a finding). */
    function auditMenu(Sx, popup, sub) {
        const pr = popup.getBoundingClientRect();
        const items = [...popup.querySelectorAll(":scope > menuitem, :scope > menu, :scope > menugroup > menuitem")].filter(visible);
        const rec = { sub, popupW: r1(pr.width), popupH: r1(pr.height), items: items.length, weavero: 0, cap: null, widest: 0, rows: [] };
        for (const mi of items) {
            const own = isWeavero(mi);
            const r = mi.getBoundingClientRect();
            const cs = gcs(mi);
            if (rec.cap == null) rec.cap = cs.maxWidth;
            const label = String(mi.getAttribute("label") || "");
            const lab = mi.querySelector(":scope > .menu-text, :scope > .menu-iconic-text, :scope > label, :scope > .menu-iconic-left + label");
            const avail = lab ? lab.clientWidth : 0;
            const tw = label && lab ? textWidth(label, lab) : 0;
            rec.widest = Math.max(rec.widest, r1(r.width));
            if (own) rec.weavero++;
            const capPx = parseFloat(cs.maxWidth);
            const atCap = !isNaN(capPx) && r.width >= capPx - 1;
            // Below the cap a menu takes its widest entry's width: a label can
            // be cut only at the cap (the canvas measure is a few px off).
            const cut = !!lab && avail > 0 && tw > avail + 1.5 && atCap;
            rec.rows.push({ label: label.slice(0, 90), own, w: r1(r.width), textW: r1(tw), avail, cut, atCap, l10n: mi.getAttribute("data-l10n-id") });
            if (own && label && Sx.seen.length < 3000 && !Sx.seen.includes(label)) Sx.seen.push(label.slice(0, 160));
            if (cut) add(Sx, { sub, type: "menu-cut", sev: own ? 3 : 1, key: sub + " > " + (mi.getAttribute("data-l10n-id") || mi.id || tok(mi)), l10n: mi.getAttribute("data-l10n-id"), text: label.slice(0, 90), textW: r1(tw), avail, own });
            else if (atCap && own) add(Sx, { sub, type: "menu-at-cap", key: sub + " > " + (mi.getAttribute("data-l10n-id") || mi.id || tok(mi)), l10n: mi.getAttribute("data-l10n-id"), text: label.slice(0, 90), w: r1(r.width), cap: cs.maxWidth });
        }
        Sx.menus.push(rec);
        return rec;
    }

    // ---- pictures -------------------------------------------------------------

    const pngPath = (name) => PathUtils.join(PNG, (ZV && ZV < 11 ? "z" + ZV + "-" : "") + name.replace(/[^\w.-]+/g, "_") + ".png");
    /** A picture of `rect` (CSS px of `view`) through `bc`'s WindowGlobal. */
    async function snap(Sx, name, view, rect, bc) {
        if (!PNG) return null;
        try {
            const x = Math.max(0, Math.floor(rect.left - 4)), y = Math.max(0, Math.floor(rect.top - 4));
            const w = Math.min(Math.ceil(rect.width + 8), view.innerWidth - x), h = Math.min(Math.ceil(rect.height + 8), view.innerHeight - y);
            if (w < 2 || h < 2) return null;
            const wg = (bc || view.browsingContext).currentWindowGlobal;
            const bmp = await wg.drawSnapshot(new win.DOMRect(x, y, w, h), 1, "white");
            const c = /** @type {any} */ (doc.createElementNS(XHTML, "canvas"));
            c.width = bmp.width; c.height = bmp.height;
            c.getContext("2d").drawImage(bmp, 0, 0);
            const blob = await new Promise(res => c.toBlob(res, "image/png"));
            const p = pngPath(name);
            await IOUtils.write(p, new Uint8Array(await /** @type {any} */ (blob).arrayBuffer()));
            Sx.png.push(p);
            return p;
        }
        catch (e) { Sx.notes.push("snap " + name + ": " + e); return null; }
    }
    /** A popup's place on the screen (drawSnapshot never paints a popup, and
     *  a grab of the screen shows whatever window is in front there: the
     *  runner's window is never raised -- tried 2026-11-26, it grabbed another
     *  window). The popup must fit on the screen. */
    function grab(Sx, name, el) {
        try {
            const view = el.ownerDocument.defaultView;
            let r = null;
            try { r = el.getOuterScreenRect(); } catch (e) {}
            if (!r || r.width < 2) {
                const b = el.getBoundingClientRect();
                r = { left: view.mozInnerScreenX + b.left, top: view.mozInnerScreenY + b.top, width: b.width, height: b.height };
            }
            const sc = /** @type {any} */ (view.screen);
            const scr = { left: sc.availLeft, top: sc.availTop, right: sc.availLeft + sc.availWidth, bottom: sc.availTop + sc.availHeight };
            const g = { name, screen: bx(r) };
            Sx.popups.push(g);
            if (r.left < scr.left - 1 || r.left + r.width > scr.right + 1 || r.top < scr.top - 1 || r.top + r.height > scr.bottom + 1) {
                add(Sx, { sub: name, type: "popup-off-screen", sev: 3, key: name, text: "", box: bx(r), lim: [scr.left, scr.top, sc.availWidth, sc.availHeight] });
            }
        }
        catch (e) { Sx.notes.push("popup " + name + ": " + e); }
        return null;
    }

    // ---- bookkeeping ----------------------------------------------------------

    async function save() {
        if (!OUT) return;
        try { await IOUtils.writeUTF8(OUT, JSON.stringify(R, null, 1)); } catch (e) {}
    }
    /** One surface: `fn(Sx)` opens it (an assertion there fails the test: the
     *  surface could not be reached) and audits it. */
    async function surface(name, fn) {
        const Sx = { reached: false, parts: [], findings: [], menus: [], popups: [], notes: [], png: [], seen: [] };
        R.surfaces[name] = Sx;
        const t0 = Date.now();
        try { await fn(Sx); Sx.reached = true; }
        catch (e) { Sx.error = String((e && e.stack) || e).slice(0, 1500); throw e; }
        finally { Sx.ms = Date.now() - t0; await save(); }
    }
    const libTab = () => win.Zotero_Tabs._tabs.find(t => String(t.type).startsWith("library"));
    const toLibrary = async () => {
        try { win.Zotero_Tabs.select(libTab().id); } catch (e) {}
        await settle();
    };
    const itemPane = () => (lib.wvViewEl && lib.wvViewEl(doc, "zotero-item-pane")) || doc.getElementById("zotero-item-pane");
    const det = () => { const p = itemPane(); return p && p.querySelector("item-details"); };
    /** The reader tab of A, open (one for the whole audit). */
    let reader = null;
    async function readerOfA() {
        if (reader && reader._iframeWindow && !reader._iframeWindow.closed && win.Zotero_Tabs._tabs.some(t => t.id === reader.tabID)) {
            win.Zotero_Tabs.select(reader.tabID);
            await settle(win, 400);
            return reader;
        }
        reader = await wvT.openReaderTab(A.id);
        assert.ok(reader, "the reader of the fixture PDF");
        await until(() => { const d = reader._iframeWindow && reader._iframeWindow.document; return d && d.querySelector("#sidebarContainer"); }, 20000);
        await settle(win, 600);
        return reader;
    }
    async function withStubs(stubs, fn) {
        const saved = Object.keys(stubs).map((name) => ({ name, own: Object.prototype.hasOwnProperty.call(wv, name), orig: wv[name] }));
        for (const k of Object.keys(stubs)) wv[k] = stubs[k];
        try { return await fn(); }
        finally { for (const s of saved) { if (s.own) wv[s.name] = s.orig; else delete wv[s.name]; } }
    }

    /** A three-page PDF with an embedded outline (as outline-sdt.spec.js builds one). */
    function outlinePDF() {
        /** @type {Array<[string, number, number]>} */
        const HEADS = [["1. Introduction", 0, 640], ["2. Methods", 0, 520], ["2.1. Experimental set-up", 0, 400], ["3. Results", 1, 640], ["4. Conclusions", 2, 640], ["References", 2, 520]];
        const line = (font, x, y, size, text) => "BT /" + font + " " + size + " Tf " + x + " " + y + " Td (" + text + ") Tj ET\n";
        const pages = ["", "", ""];
        pages[0] += line("F2", 72, 720, 20, "WVFIT drops on soft solids");
        for (const [t, p, y] of HEADS) { pages[p] += line("F2", 72, y, 14, t) + line("F1", 72, y - 22, 10, "The quick brown fox jumps over the lazy dog again and again."); }
        const objs = [];
        objs[1] = "<< /Type /Catalog /Pages 2 0 R /Outlines 11 0 R /PageMode /UseOutlines >>";
        objs[2] = "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>";
        for (let i = 0; i < 3; i++) objs[3 + i] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R /F2 7 0 R >> >> /Contents " + (8 + i) + " 0 R >>";
        objs[6] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
        objs[7] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
        for (let i = 0; i < 3; i++) objs[8 + i] = "<< /Length " + pages[i].length + " >>\nstream\n" + pages[i] + "endstream";
        const dest = (i) => "/Dest [" + (3 + HEADS[i][1]) + " 0 R /XYZ 72 " + (Number(HEADS[i][2]) + 20) + " 0]";
        objs[11] = "<< /Type /Outlines /First 12 0 R /Last 16 0 R /Count 6 >>";
        objs[12] = "<< /Title (" + HEADS[0][0] + ") /Parent 11 0 R /Next 13 0 R " + dest(0) + " >>";
        objs[13] = "<< /Title (" + HEADS[1][0] + ") /Parent 11 0 R /Prev 12 0 R /Next 15 0 R /First 14 0 R /Last 14 0 R /Count 1 " + dest(1) + " >>";
        objs[14] = "<< /Title (" + HEADS[2][0] + ") /Parent 13 0 R " + dest(2) + " >>";
        objs[15] = "<< /Title (" + HEADS[3][0] + ") /Parent 11 0 R /Prev 13 0 R /Next 16 0 R " + dest(3) + " >>";
        objs[16] = "<< /Title (" + HEADS[4][0] + ") /Parent 11 0 R /Prev 15 0 R " + dest(4) + " >>";
        let body = "%PDF-1.4\n";
        const offs = [];
        for (let i = 1; i < objs.length; i++) { if (!objs[i]) continue; offs[i] = body.length; body += i + " 0 obj\n" + objs[i] + "\nendobj\n"; }
        const xref = body.length;
        let x = "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
        for (let i = 1; i < objs.length; i++) x += objs[i] ? String(offs[i]).padStart(10, "0") + " 00000 n \n" : "0000000000 65535 f \n";
        return body + x + "trailer\n<< /Size " + objs.length + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    }

    before(async function () {
        let asked = false;
        try {
            asked = Services.env.exists("WV_L10N_FIT") || /l10n-fit/.test(Services.env.get("WV_TEST_ENTRIES") || "");
        } catch (e) {}
        // An audit, run on purpose (a targeted run or WV_L10N_FIT): the full
        // suite and CI leave it pending (PENDING_ALLOWLIST, 000-helpers).
        if (!asked) this.skip();
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!wv || !lib) wvT.absent("plugin");
        win = Zotero.getMainWindows()[0];
        doc = win.document;
        ZP = win.ZoteroPane;
        LOC = String(Services.locale.appLocaleAsBCP47 || "");
        ZV = parseInt(String(Zotero.version), 10) || 0;
        R.locale = LOC;
        R.requested = Services.locale.requestedLocales;
        R.zotero = String(Zotero.version);
        try { R.weavero = String(wv.version || (Zotero.Weavero && Zotero.Weavero.version) || ""); } catch (e) {}
        try {
            if (Services.env.exists("WV_L10N_FIT_OUT")) OUT = Services.env.get("WV_L10N_FIT_OUT");
        } catch (e) {}
        if (Zotero.isWin) {
            const base = PathUtils.join("D:\\tmp", "l10n-fit");
            try {
                await IOUtils.makeDirectory(base, { createAncestors: true, ignoreExisting: true });
                if (!OUT) OUT = PathUtils.join(base, LOC + "-" + ZV + ".json");
                PNG = PathUtils.join(base, "png", LOC);
                await IOUtils.makeDirectory(PNG, { createAncestors: true, ignoreExisting: true });
            }
            catch (e) { PNG = ""; }
        }
        R.out = OUT; R.png = PNG;
        size0 = { w: win.outerWidth, h: win.outerHeight, x: win.screenX, y: win.screenY };
        // The runner's own page is a window too: Zotero's window at the
        // screen's left, the runner page at its right, for the audit (the
        // popups' screen checks read Zotero's window where it is).
        try {
            const sc = /** @type {any} */ (win.screen);
            R.screen = [sc.availLeft, sc.availTop, sc.availWidth, sc.availHeight];
            runner0 = { x: window.screenX, y: window.screenY };
            R.runnerPage = [window.screenX, window.screenY, window.outerWidth, window.outerHeight];
            win.moveTo(sc.availLeft, sc.availTop);
            window.moveTo(sc.availLeft + sc.availWidth - window.outerWidth, sc.availTop + 40);
        }
        catch (e) {}
        try { win.resizeTo(1440, 900); } catch (e) {}
        await until(() => Math.abs(win.outerWidth - 1440) < 2, 5000, 100);
        await toLibrary();
        R.window = [win.innerWidth, win.innerHeight, win.devicePixelRatio];
        // The fixture: a paper with a PDF (an embedded outline), a note and an
        // annotation that link out, a note that links to it, a related item.
        const lid = Zotero.Libraries.userLibraryID;
        T1 = await wvT.createItem("book", { title: "WVFIT target one" });
        T2 = await wvT.createItem("book", { title: "WVFIT target two" });
        R1 = await wvT.createItem("book", { title: "WVFIT related" });
        P = await wvT.createItem("journalArticle", { title: "WVFIT paper on drops", url: "https://example.org/wvfit" });
        const path = PathUtils.join(PathUtils.tempDir, "wvfit-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, outlinePDF());
        A = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID: P.id });
        try { await IOUtils.remove(path); } catch (e) {}
        X = /** @type {any} */ (new Zotero.Item("annotation"));
        X.libraryID = lid; X.parentID = A.id; X.annotationType = "highlight";
        X.annotationText = "WVFIT words"; X.annotationComment = "See zotero://select/library/items/" + T1.key + " here.";
        X.annotationColor = "#ffd400"; X.annotationPageLabel = "1";
        X.annotationSortIndex = "00000|000001|00000";
        X.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10, 60, 20]] });
        await X.saveTx();
        N = /** @type {any} */ (new Zotero.Item("note"));
        N.libraryID = lid; N.parentID = P.id;
        N.setNote("<h1>WVFIT note</h1><p>Go zotero://select/library/items/" + T2.key + " now.</p>");
        await N.saveTx({ skipSelect: true });
        S = /** @type {any} */ (new Zotero.Item("note"));
        S.libraryID = lid;
        S.setNote("<h1>WVFIT source</h1><p>Links zotero://select/library/items/" + P.key + " and zotero://open/library/items/" + A.key + "?annotation=" + X.key + " here.</p>");
        await S.saveTx({ skipSelect: true });
        P.addRelatedItem(R1); await P.saveTx({ skipSelect: true });
        R1.addRelatedItem(P); await R1.saveTx({ skipSelect: true });
        await wv._wvBlEnsure();
        await wvT.waitFor(() => wv._wvBlDirect(P).some((s) => s.srcID === S.id), 10000);
        for (const [i, label] of [[0, "WVFIT bookmark on the first page"], [1, "WVFIT second bookmark"]]) {
            bms.push(await wv._bmReaderAdd(A.libraryID, A.key, { type: "position", label, location: { pageIndex: i }, position: { pageIndex: i, rects: [[0, 0, 1, 1]] } }));
        }
        await save();
    });

    after(async function () {
        if (!wv) return;
        R.finished = new Date().toISOString();
        await save();
        try { if (reader) wvT.closeReaderTab(reader); } catch (e) {}
        await sleep(300);
        for (const b of bms) { try { await wv._bmReaderRemove(A.libraryID, A.key, b.id); } catch (e) {} }
        await toLibrary();
        await wvT.erase(S, N, X, A, P, R1, T1, T2);
        if (size0) { try { win.resizeTo(size0.w, size0.h); win.moveTo(size0.x, size0.y); } catch (e) {} }
        if (runner0) { try { window.moveTo(runner0.x, runner0.y); } catch (e) {} }
    });

    // ---- the surfaces -----------------------------------------------------------

    it("the Settings pane", async function () {
        await surface("settings", async (Sx) => {
            const prefsOpen = () => Services.wm.getEnumerator("zotero:pref").hasMoreElements();
            await until(() => !prefsOpen(), 8000);
            try { Zotero.Prefs.clear("weavero._prefsCollapsed"); } catch (e) {}
            const pw = Zotero.Utilities.Internal.openPreferences("general");
            try {
                const paneID = () => [...pw.Zotero_Preferences.panes.keys()].find(k => /weavero@mjthoraval/.test(k));
                assert.ok(await until(() => !!paneID(), 15000), "Weavero's pane registered in Settings");
                await pw.Zotero_Preferences.navigateToPane(paneID());
                assert.ok(await until(() => pw.document.querySelector(".wv-nav .wv-nav-tab"), 15000), "Weavero's pane rendered");
                await sleep(1200);
                for (const d of pw.document.querySelectorAll("details")) { try { /** @type {any} */ (d).open = true; } catch (e) {} }
                await settle(pw, 500);
                const ms = pw.document.querySelector(".wv-nav").closest(".main-section");
                assert.ok(ms, "the pane's section");
                Sx.window = [pw.innerWidth, pw.innerHeight];
                audit(Sx, ms, { sub: "pane", frame: pw.document.getElementById("prefs-content") || null });
                const tops = new Set([...ms.querySelectorAll(".wv-nav .wv-nav-tab")].filter(visible).map(t => Math.round(t.getBoundingClientRect().top)));
                Sx.notes.push("section strip rows: " + tops.size);
                if (tops.size > 1) add(Sx, { sub: "pane", type: "nav-rows", key: ".wv-nav", text: "", rows: tops.size });
                const secs = [...ms.querySelectorAll("groupbox[id^='wv-sec-']")];
                for (const g of secs) {
                    try { g.scrollIntoView({ block: "start" }); } catch (e) {}
                    await settle(pw, 250);
                    await snap(Sx, "settings-" + g.id.replace("wv-sec-", ""), pw, { left: 0, top: 0, width: pw.innerWidth, height: pw.innerHeight });
                }
            }
            finally {
                try { pw.close(); } catch (e) {}
                await until(() => pw.closed && !prefsOpen(), 8000);
            }
        });
    });

    const allFilterState = () => {
        const g = Object.assign(wv._emptyFilterGroup(), {});
        const LISTV = {
            annotationColor: ["#ffd400", "#ff6666"], annotationType: ["highlight", "ink"], annotationTag: ["t1", "t2"], annotationAuthor: ["Ann Smith", "Bob Jones"],
            itemType: ["book", "journalArticle"], attachmentFileType: ["attachmentPDF", "attachmentEPUB"], outlineClass: ["embedded", "flag:spacing"],
            outlineFlags: ["flag:ws-junk", "flag:spacing"], outlineVerdict: ["verdict:good", "verdict:scan"], addedBy: ["alice", "bob"], publication: ["Pub A", "Pub B"], readStatus: ["Read", ""],
        };
        for (const [k, v] of Object.entries(LISTV)) { g[k] = v.slice(0, 1); g[k + "Exclude"] = v.slice(1); }
        for (const k of ["annotationHasComment", "annotationSource", "hasRelated", "hasLink", "hasTag", "hasBookmarks", "itemNote", "standaloneNote", "standaloneAttachment",
            "hasAbstract", "hasDOI", "hasPMID", "hasPMCID", "retracted", "hasURL", "hasAttachment", "hasAnnotations", "hasEmbeddedAnnotations", "hasOutline", "inOtherLibrary"]) g[k] = true;
        return { groups: [g], activeGroupIndex: 0 };
    };

    it("the items-list filter: its panel, its menus, the chip bar", async function () {
        await surface("filter", async (Sx) => {
            for (const m of ["_openFilterPanel", "_renderFilterBar", "_emptyFilterGroup", "_wvWithFilterWin"]) wvT.method(m);
            await toLibrary();
            await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            const inWin = (fn) => wv._wvWithFilterWin(win, fn);
            const popup = () => doc.getElementById("wv-filter-popup");
            const inner = () => { const p = popup(); return p && p.querySelector(".wv-filter-panel-inner"); };
            const open = async () => {
                try { const p = popup(); if (p && p.state === "open") p.hidePopup(); } catch (e) {}
                await sleep(150);
                inWin(() => wv._openFilterPanel());
                const p = await wvT.waitFor(() => { const x = popup(); return x && x.state === "open" && x.querySelector(".wv-filter-popup-headbar") ? x : null; }, 10000, 50);
                assert.ok(p, "the filter panel opened");
                await sleep(400);
                await settle();
                return p;
            };
            const rl = wvT.readingListOn();
            const saved = wv._filterState;
            try {
                await withStubs({ _applyItemsListFilter: () => {}, _wvEnsureLinkedLibCache: () => {} }, async () => {
                    // Empty: every section's words.
                    let p = await open();
                    audit(Sx, inner(), { sub: "panel", frame: p });
                    await grab(Sx, "filter-panel", p);
                    // The search mode menu.
                    const trig = inner().querySelector(".wv-filter-mode-trigger");
                    if (trig) {
                        trig.click();
                        const mm = await wvT.waitFor(() => { const m = doc.querySelector("menupopup.wv-filter-mode-menupopup"); return m && m.state === "open" ? m : null; }, 3000, 50);
                        if (mm) { await settle(); auditMenu(Sx, mm, "mode-menu"); await grab(Sx, "filter-mode-menu", mm); try { mm.hidePopup(); } catch (e) {} await sleep(200); }
                        else Sx.notes.push("the search mode menu did not open");
                    }
                    else Sx.notes.push("no .wv-filter-mode-trigger");
                    // An "Apply to" menu (Weavero's own dropdown in the panel).
                    const arrow = inner().querySelector(".wv-filter-cross-scope-arrow, .wv-filter-scope-arrow");
                    assert.ok(arrow, "an Apply to ▾ in the panel");
                    arrow.click();
                    const sp = await wvT.waitFor(() => inner().querySelector(".wv-filter-scope-popup"), 3000, 50);
                    assert.ok(sp, "the Apply to menu opened");
                    await settle();
                    audit(Sx, sp, { sub: "apply-to", frame: inner() });
                    await grab(Sx, "filter-apply-to", popup());
                    try { arrow.click(); } catch (e) {}
                    try { popup().hidePopup(); } catch (e) {}
                    await sleep(300);
                    // Values in every dimension: the selected lines and pills.
                    inWin(() => { wv._filterState = allFilterState(); });
                    p = await open();
                    audit(Sx, inner(), { sub: "panel-with-values", frame: p });
                    await grab(Sx, "filter-panel-values", p);
                    try { p.hidePopup(); } catch (e) {}
                    await sleep(300);
                    // The chip bar above the items list, every dimension at once.
                    inWin(() => { wv._filterState = allFilterState(); wv._renderFilterBar(); });
                    await settle(win, 300);
                    const bar = wv._filterBar || doc.getElementById("wv-filter-bar");
                    assert.ok(bar && visible(bar), "the chip bar is shown");
                    const ip = (lib.wvViewEl && lib.wvViewEl(doc, "zotero-items-pane")) || doc.getElementById("zotero-items-pane");
                    audit(Sx, bar, { sub: "chip-bar", frame: ip });
                    await snap(Sx, "filter-chip-bar", win, bar.getBoundingClientRect());
                });
            }
            finally {
                try { const p = popup(); if (p && p.state === "open") p.hidePopup(); } catch (e) {}
                inWin(() => { wv._filterState = saved; try { wv._renderFilterBar(); } catch (e) {} });
                rl();
                await sleep(200);
            }
        });
    });

    /** The paper selected, its pane drawn with Weavero's sections open. */
    async function selectP() {
        await toLibrary();
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await ZP.selectItem(P.id);
        const sec = (k) => det() && det().querySelector('item-pane-custom-section[data-pane$="weavero-' + k + '"]');
        const ok = await wvT.waitFor(() => sec("links") && sec("backlinks") && sec("backlinks").querySelector(".wv-bl-row") && sec("links").querySelector(".wv-bl-row") ? true : null, 15000);
        assert.ok(ok, "the paper's Item Links and Backlinks sections, with rows");
        for (const k of ["links", "backlinks"]) { try { sec(k).querySelector("collapsible-section").open = true; } catch (e) {} }
        for (const t of ["tags", "related"]) { try { det().querySelector(t + '-box[data-pane="' + t + '"] > collapsible-section').open = true; } catch (e) {} }
        await settle(win, 400);
        return sec;
    }
    async function withItemPaneWidth(px, fn) {
        const ipn = doc.getElementById("zotero-item-pane");
        const a0 = ipn.getAttribute("width"), s0 = ipn.style.width;
        try {
            if (px) {
                ipn.setAttribute("width", String(px)); ipn.style.width = px + "px";
                try { ZP.updateLayoutConstraints(); } catch (e) {}
                await settle(win, 500);
            }
            return await fn();
        }
        finally {
            if (px) {
                if (a0 == null) ipn.removeAttribute("width"); else ipn.setAttribute("width", a0);
                ipn.style.width = s0;
                try { ZP.updateLayoutConstraints(); } catch (e) {}
                await settle(win, 300);
            }
        }
    }

    it("the item pane: Item Links, Backlinks, the counts in Tags and Related, the link card", async function () {
        await surface("item-pane", async (Sx) => {
            const sec = await selectP();
            const w0 = Math.round(itemPane().getBoundingClientRect().width);
            for (const px of [0, 320]) {
                await withItemPaneWidth(px, async () => {
                    const at = px ? "@" + px : "";
                    const pane = itemPane();
                    const w = Math.round(pane.getBoundingClientRect().width);
                    Sx.notes.push("item pane " + (px || "default") + ": " + w + " px");
                    // Zotero's minimum already (the side navigation beside 320 px): no second pass.
                    if (px && w === w0) return;
                    for (const k of ["links", "backlinks"]) audit(Sx, sec(k), { sub: k + at, frame: pane });
                    for (const t of ["tags", "related"]) {
                        const head = det().querySelector(t + '-box[data-pane="' + t + '"] > collapsible-section > .head');
                        if (head) audit(Sx, head, { sub: t + "-head" + at, frame: pane });
                    }
                    try { await det().scrollToPane(sec("links").getAttribute("data-pane"), "instant"); } catch (e) {}
                    await settle(win, 300);
                    await snap(Sx, "item-pane" + (px ? "-" + px : ""), win, pane.getBoundingClientRect());
                });
            }
            // The card a Backlinks row shows on a rest.
            const row = sec("backlinks").querySelector(".wv-bl-row");
            wv._wvBlCardShow(row);
            const card = await wvT.waitFor(() => { const c = doc.getElementById("wv-bl-card"); return c && visible(c) ? c : null; }, 4000, 50);
            if (card) {
                await settle();
                audit(Sx, card, { sub: "link-card" });
                await snap(Sx, "link-card", win, card.getBoundingClientRect());
                try { wv._wvLkHoverCardHide(row); } catch (e) {}
            }
            else Sx.notes.push("the Backlinks row's card did not show");
        });
    });

    it("the item count card and the count popups", async function () {
        await surface("counts", async (Sx) => {
            await toLibrary();
            await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            await wvT.withPref("weavero.itemCountBreakdown", true, async () => {
                ZP.itemsView.selection.clearSelection();
                try { await ZP.itemSelected(); } catch (e) {}
                const card = await wvT.waitFor(() => { const b = doc.getElementById("zotero-item-pane-message-box"); return b && b.querySelector(".wv-count-tree"); }, 8000, 50);
                assert.ok(card, "the item count card");
                for (const px of [0, 320]) {
                    await withItemPaneWidth(px, async () => {
                        await settle(win, 300);
                        audit(Sx, card, { sub: "count-card" + (px ? "@" + px : ""), frame: itemPane() });
                        await snap(Sx, "count-card" + (px ? "-" + px : ""), win, itemPane().getBoundingClientRect());
                    });
                }
            });
            await ZP.selectItem(P.id);
            await settle(win, 300);
            for (const kind of ["backlinks", "links", "related"]) {
                wv._wvOpenCountPopup(kind, P.id, { anchorNode: doc.getElementById("zotero-items-tree") || doc.documentElement, scope: "subtree", win });
                const p = await wvT.waitFor(() => { const x = doc.getElementById("weavero-panel"); return x && x.style.display === "block" && visible(x) ? x : null; }, 4000, 50);
                assert.ok(p, "the " + kind + " count popup");
                await settle();
                audit(Sx, p, { sub: "popup-" + kind });
                await snap(Sx, "count-popup-" + kind, win, p.getBoundingClientRect());
                p.style.display = "none";
                await sleep(150);
            }
        });
    });

    /** Open `popup` with `open()`, wait for it, audit it and the Weavero submenus. */
    async function menuAudit(Sx, popup, name, open) {
        const shown = new Promise(r => { const on = (e) => { if (e.target !== popup) return; popup.removeEventListener("popupshown", on); r(true); }; popup.addEventListener("popupshown", on); });
        open();
        const ok = await Promise.race([shown, sleep(3000).then(() => false)]);
        assert.ok(ok, name + " opened");
        try {
            await settle(win, 250);
            auditMenu(Sx, popup, name);
            await grab(Sx, name, popup);
            for (const m of [...popup.querySelectorAll(":scope > menu")]) {
                if (!visible(m) || !isWeavero(m)) continue;
                const sp = m.querySelector(":scope > menupopup");
                if (!sp) continue;
                const s2 = new Promise(r => { const on = (e) => { if (e.target !== sp) return; sp.removeEventListener("popupshown", on); r(true); }; sp.addEventListener("popupshown", on); });
                m.open = true;
                if (await Promise.race([s2, sleep(1500).then(() => false)])) {
                    await settle(win, 150);
                    const nm = name + " > " + (m.getAttribute("data-l10n-id") || m.getAttribute("label"));
                    auditMenu(Sx, sp, nm);
                    await grab(Sx, nm, sp);
                }
                try { sp.hidePopup(); } catch (e) {}
                await sleep(100);
            }
        }
        finally { try { popup.hidePopup(); } catch (e) {} await sleep(200); }
    }

    it("the context menus: items, collections, tabs, the title bar's ☰", async function () {
        await surface("menus", async (Sx) => {
            await toLibrary();
            await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            const im = doc.getElementById("zotero-itemmenu");
            for (const [ids, nm] of [[[P.id], "items-menu-1"], [[P.id, T1.id], "items-menu-2"], [[A.id], "items-menu-pdf"]]) {
                await ZP.selectItems(ids);
                await sleep(250);
                await menuAudit(Sx, im, nm, () => im.openPopupAtScreen(win.screenX + 300, win.screenY + 200, true));
            }
            const cm = doc.getElementById("zotero-collectionmenu");
            await menuAudit(Sx, cm, "collections-menu", () => cm.openPopupAtScreen(win.screenX + 200, win.screenY + 200, true));
            const tabMenu = async (tabID, nm) => {
                const ps = doc.querySelector("popupset");
                let popup = null;
                const on = (e) => { if (e.target && e.target.parentNode === ps && e.target.localName === "menupopup") popup = e.target; };
                ps.addEventListener("popupshowing", on, true);
                try {
                    win.Zotero_Tabs._openMenu(win.screenX + 300, win.screenY + 60, tabID);
                    assert.ok(await wvT.waitFor(() => popup && popup.state === "open", 3000, 50), nm + " opened");
                    await settle(win, 250);
                    auditMenu(Sx, popup, nm);
                    await grab(Sx, nm, popup);
                    for (const m of [...popup.querySelectorAll(":scope > menu")]) {
                        if (!visible(m) || !isWeavero(m)) continue;
                        const sp = m.querySelector(":scope > menupopup");
                        if (!sp) continue;
                        m.open = true;
                        if (await wvT.waitFor(() => sp.state === "open", 1500, 50)) { await settle(win, 150); auditMenu(Sx, sp, nm + " > " + (m.getAttribute("data-l10n-id") || m.getAttribute("label"))); }
                        try { sp.hidePopup(); } catch (e) {}
                    }
                    try { popup.hidePopup(); } catch (e) {}
                }
                finally { ps.removeEventListener("popupshowing", on, true); await sleep(200); }
            };
            await tabMenu(libTab().id, "tab-menu-library");
            const r = await readerOfA();
            await tabMenu(r.tabID, "tab-menu-reader");
            await toLibrary();
            if (!Zotero.isMac) {
                const hp = doc.getElementById("wv-hamburger-popup");
                const hb = doc.querySelector("#zotero-title-bar > .wv-hamburger-btn") || doc.querySelector(".wv-hamburger-btn");
                assert.ok(hp && hb, "the title bar's ☰ and its menu");
                await menuAudit(Sx, hp, "hamburger", () => hp.openPopup(hb, "after_start", 0, 0, false, false));
            }
        });
    });

    it("the reader: Outline and Bookmarks in the sidebar, their menus, the annotation filter, the dialogs", async function () {
        await surface("reader", async (Sx) => {
            for (const m of ["_wvOutlineShowTabMenu", "_wvOutlineShowAddMenu", "_wvBmShowTabMenu", "_wvShowReaderBmSortMenu", "_wvShowReaderBmAddMenu",
                "_wvCloseReaderBmContextMenu", "_wvToggleReaderFilterPopup", "_wvCloseReaderFilterPopup", "_wvShowUrlBookmarkDialog", "_wvReaderPanelNote"]) wvT.method(m);
            const r = await readerOfA();
            const ir = r._internalReader;
            const idoc = r._iframeWindow.document;
            const iview = r._iframeWindow;
            const bc = r._iframe && r._iframe.browsingContext;
            try { ir.toggleSidebar(true); } catch (e) {}
            const sc = () => idoc.getElementById("sidebarContainer");
            const ctx = () => idoc.getElementById("wv-bm-reader-ctxmenu");
            const closeCtx = async () => { try { wv._wvCloseReaderBmContextMenu(idoc); } catch (e) {} await sleep(120); };
            const ctxAudit = async (nm) => {
                const m = await wvT.waitFor(() => { const c = ctx(); return c && visible(c) ? c : null; }, 3000, 50);
                if (!m) { Sx.notes.push(nm + ": no menu"); return; }
                await settle(iview);
                audit(Sx, m, { sub: nm });
                await snap(Sx, "reader-" + nm, iview, m.getBoundingClientRect(), bc);
                await closeCtx();
            };
            // Outline.
            try { ir.setSidebarView("outline"); } catch (e) {}
            const outlineOn = () => sc() && sc().classList.contains("wv-outline-tab-on") && idoc.querySelector(".wv-outline-reader-view");
            let ov = await wvT.waitFor(outlineOn, 8000, 100);
            if (!ov) {
                try { wv._wvReaderEnsureOutlinePanel(r, idoc); wv._wvReaderActivateOutlineTakeover(r, idoc, true); } catch (e) {}
                ov = await wvT.waitFor(outlineOn, 8000, 100);
            }
            assert.ok(ov, "Weavero's Outline view");
            await wvT.waitFor(() => idoc.querySelector(".wv-outline-reader-view .wv-outline-row, .wv-outline-reader-view .wv-outline-empty"), 10000, 100);
            await settle(iview, 500);
            const view = idoc.querySelector(".wv-outline-reader-view");
            Sx.notes.push("sidebar " + Math.round(sc().getBoundingClientRect().width) + " px; outline rows " + idoc.querySelectorAll(".wv-outline-row").length);
            audit(Sx, view, { sub: "outline", frame: sc() });
            await snap(Sx, "reader-outline", iview, sc().getBoundingClientRect(), bc);
            const tabBtn = idoc.querySelector("#viewOutline") || idoc.querySelector("#wv-outline-entry-tab") || idoc.body;
            wv._wvOutlineShowTabMenu(r, idoc, tabBtn);
            await ctxAudit("outline-tab-menu");
            const addBtn = idoc.querySelector(".wv-outline-add-btn");
            if (addBtn) { wv._wvOutlineShowAddMenu(r, idoc, addBtn); await ctxAudit("outline-add-menu"); }
            else Sx.notes.push("no .wv-outline-add-btn");
            const chip = idoc.querySelector(".wv-outline-src-chip");
            if (chip) { chip.click(); await ctxAudit("outline-source-menu"); }
            else Sx.notes.push("no .wv-outline-src-chip");
            // A note in the pane (the toast), the longest of its kind.
            wv._wvReaderPanelNote(idoc, lib.wvStr("weavero-outline-note-anchor-pdf-only"));
            const note = await wvT.waitFor(() => idoc.querySelector(".wv-readingmode-note"), 2000, 50);
            if (note) { await settle(iview); audit(Sx, note, { sub: "outline-note", frame: sc() }); }
            // Bookmarks.
            const bmTab = await wvT.waitFor(() => idoc.querySelector("#sidebarContainer .sidebar-toolbar .wv-bm-reader-tab"), 8000, 100);
            assert.ok(bmTab, "the Bookmarks tab");
            bmTab.click();
            const bv = await wvT.waitFor(() => sc().classList.contains("wv-bm-tab-on") && idoc.querySelector(".wv-bm-reader-view .wv-bm-reader-row"), 8000, 100);
            assert.ok(bv, "the Bookmarks view with the fixture's bookmarks");
            await settle(iview, 400);
            const bview = idoc.querySelector(".wv-bm-reader-view");
            audit(Sx, bview, { sub: "bookmarks", frame: sc() });
            await snap(Sx, "reader-bookmarks", iview, sc().getBoundingClientRect(), bc);
            const sortBtn = idoc.querySelector(".wv-bm-reader-sortbtn") || idoc.body;
            wv._wvShowReaderBmSortMenu(r, idoc, sortBtn, "local");
            await ctxAudit("bookmarks-sort-menu");
            wv._wvShowReaderBmAddMenu(r, idoc, idoc.querySelector(".wv-bm-reader-addbtn, .wv-bm-add-btn") || sortBtn);
            await ctxAudit("bookmarks-add-menu");
            wv._wvBmShowTabMenu(r, idoc, bmTab);
            await ctxAudit("bookmarks-tab-menu");
            const row = idoc.querySelector(".wv-bm-reader-row");
            const rr = row.getBoundingClientRect();
            try {
                await wv._wvReaderShowBmContextMenu(r, idoc, { target: row, clientX: rr.left + 20, clientY: rr.top + 5, screenX: 0, screenY: 0, button: 2, preventDefault() {}, stopPropagation() {} });
                await ctxAudit("bookmark-row-menu");
            }
            catch (e) { Sx.notes.push("row menu: " + e); }
            try {
                wv._wvReaderShowBmHoverCard(r, idoc, row, bms[0]);
                const hc = await wvT.waitFor(() => { const c = idoc.querySelector(".wv-bm-hovercard"); return c && visible(c) ? c : null; }, 3000, 50);
                if (hc) { await settle(iview); audit(Sx, hc, { sub: "bookmark-card" }); await snap(Sx, "reader-bookmark-card", iview, hc.getBoundingClientRect(), bc); hc.remove(); }
                else Sx.notes.push("no bookmark hover card");
            }
            catch (e) { Sx.notes.push("hover card: " + e); }
            const fbtn = idoc.querySelector(".wv-bm-filter-btn");
            if (fbtn && typeof wv._wvReaderToggleBmChipPopup === "function") {
                wv._wvReaderToggleBmChipPopup(r, idoc, fbtn);
                const cp = await wvT.waitFor(() => { const c = idoc.querySelector(".wv-bm-chip-popup"); return c && visible(c) ? c : null; }, 3000, 50);
                if (cp) { await settle(iview); audit(Sx, cp, { sub: "bookmarks-filter" }); await snap(Sx, "reader-bookmarks-filter", iview, cp.getBoundingClientRect(), bc); }
                try { wv._wvReaderToggleBmChipPopup(r, idoc, fbtn); } catch (e) {}
                await sleep(150);
            }
            // The annotation filter's popup from the reader toolbar.
            const funnel = idoc.querySelector(".wv-reader-filter-btn");
            assert.ok(funnel, "the reader toolbar's filter funnel");
            wv._wvToggleReaderFilterPopup(r, idoc, funnel);
            const fp = await wvT.waitFor(() => { const c = idoc.getElementById("wv-reader-filter-popup-v2"); return c && visible(c) ? c : null; }, 5000, 50);
            assert.ok(fp, "the reader's filter popup");
            await settle(iview, 300);
            audit(Sx, fp, { sub: "annotation-filter" });
            await snap(Sx, "reader-annotation-filter", iview, fp.getBoundingClientRect(), bc);
            wv._wvCloseReaderFilterPopup(idoc);
            await sleep(150);
            // The URL bookmark dialog Weavero draws in the page.
            const pr = wv._wvShowUrlBookmarkDialog(idoc, { text: "WVFIT link", url: "https://example.org/wvfit" });
            const dlg = await wvT.waitFor(() => { const c = idoc.querySelector(".wv-bm-url-dialog"); return c && visible(c) ? c : null; }, 3000, 50);
            assert.ok(dlg, "the URL bookmark dialog");
            await settle(iview);
            audit(Sx, dlg, { sub: "url-dialog" });
            await snap(Sx, "reader-url-dialog", iview, dlg.getBoundingClientRect(), bc);
            const btns = [...dlg.querySelectorAll(".wv-bm-url-dialog-btn")];
            try { (btns[0] || dlg).click(); } catch (e) {}
            await Promise.race([pr, sleep(1500)]);
            try { const bd = idoc.querySelector(".wv-bm-url-dialog-backdrop"); if (bd) bd.remove(); } catch (e) {}
            try { ir.setSidebarView("annotations"); } catch (e) {}
        });
    });

    it("the library's bookmarks dropdown and the bookmark editor", async function () {
        await surface("bookmarks", async (Sx) => {
            await toLibrary();
            const btn = await wvT.waitFor(() => doc.getElementById("wv-bookmarks-toolbar-button"), 10000, 100);
            assert.ok(btn, "the bookmarks toolbar button");
            wv._openBookmarksPopup(btn);
            const panel = await wvT.waitFor(() => { const p = doc.getElementById("wv-bookmarks-popup"); return p && p.state === "open" ? p : null; }, 5000, 50);
            assert.ok(panel, "the bookmarks dropdown opened");
            await settle(win, 300);
            const inner = doc.getElementById("wv-bookmarks-inner") || panel;
            audit(Sx, inner, { sub: "dropdown", frame: panel });
            await grab(Sx, "bookmarks-dropdown", panel);
            try { wv._bmHidePopup(win); } catch (e) {}
            await sleep(250);
            wv._bmShowEditDialog(doc, win, { titleValue: "WVFIT bookmark", commentValue: "", originalTitle: "WVFIT original label", onSave: async () => {} });
            const ep = await wvT.waitFor(() => { const p = doc.getElementById("wv-bm-editdlg-panel"); return p && p.state === "open" ? p : null; }, 5000, 50);
            assert.ok(ep, "the bookmark editor opened");
            await settle(win, 300);
            audit(Sx, ep.querySelector(".wv-bm-editdlg") || ep, { sub: "editor", frame: ep });
            await grab(Sx, "bookmark-editor", ep);
            try { ep.hidePopup(); } catch (e) {}
            try { ep.remove(); } catch (e) {}
        });
    });

    it("tabs: the List all tabs panel (sessions, groups, its popups), the group editor and preview, the window card", async function () {
        await surface("tabs", async (Sx) => {
            for (const m of ["_tabGroupCreate", "_wvTabGroupAddTab", "_applyTabGroups", "_wvShowTabGroupEditor", "_tabGroupDelete"]) wvT.method(m);
            const r = await readerOfA();
            await wvT.withPref("weavero.enableTabsFileTypeFilter", true, async () => {
                const g = wv._tabGroupCreate("WVFIT group", "blue");
                try {
                    wv._wvTabGroupAddTab(win, r.tabID, g.id);
                    wv._applyTabGroups(win);
                    const chip = await wvT.waitFor(() => doc.getElementById("wv-tgchip-" + g.id), 5000, 50);
                    assert.ok(chip, "the group's chip in the tab strip");
                    await toLibrary();
                    const panel = doc.getElementById("zotero-tabs-menu-panel");
                    panel.openPopup(doc.getElementById("tab-bar-container"), "after_start", 0, 0, false, false);
                    assert.ok(await wvT.waitFor(() => panel.state === "open", 5000, 50), "the List all tabs panel opened");
                    await settle(win, 500);
                    audit(Sx, panel, { sub: "panel", frame: panel });
                    await grab(Sx, "tabs-panel", panel);
                    for (const [bid, pid, nm] of [["wv-tabs-menu-settings-btn", "wv-tabs-menu-settings-popup", "settings-popup"], ["wv-tabs-menu-filetype-btn", "wv-tabs-menu-filetype-popup", "filetype-popup"]]) {
                        const b = doc.getElementById(bid);
                        if (!b) { Sx.notes.push("no #" + bid); continue; }
                        b.click();
                        const pp = await wvT.waitFor(() => { const x = doc.getElementById(pid); return x && visible(x) ? x : null; }, 3000, 50);
                        if (pp) { await settle(win, 200); audit(Sx, pp, { sub: nm, frame: panel }); await grab(Sx, "tabs-" + nm, panel); }
                        else Sx.notes.push(nm + " did not show");
                        try { b.click(); } catch (e) {}
                        await sleep(200);
                    }
                    try { panel.hidePopup(); } catch (e) {}
                    await wvT.waitFor(() => panel.state === "closed", 3000, 50);
                    await sleep(200);
                    // The group editor and the group's preview, from its chip.
                    wv._wvShowTabGroupEditor(win, g.id, chip);
                    const ed = await wvT.waitFor(() => { const p = doc.getElementById("wv-tab-group-editor"); return p && p.state === "open" ? p : null; }, 4000, 50);
                    assert.ok(ed, "the group editor opened");
                    await settle(win, 300);
                    audit(Sx, ed.querySelector(".wv-tg-panel-body") || ed, { sub: "group-editor", frame: ed });
                    await grab(Sx, "tab-group-editor", ed);
                    try { ed.hidePopup(); } catch (e) {}
                    await sleep(250);
                    // (The group's hover preview shows only data -- its name, its
                    // tabs' titles, a count -- and only for a collapsed group.)
                    // The window card (right-click on the window's mark).
                    const spacer = doc.querySelector("#zotero-title-bar > .wv-titlebar-spacer");
                    if (spacer && typeof wv._wvShowWindowEditor === "function") {
                        wv._wvShowWindowEditor(win, false, win, null, { target: spacer, screenX: win.screenX + 200, screenY: win.screenY + 80 });
                        const we = await wvT.waitFor(() => { const p = doc.getElementById("wv-window-editor"); return p && p.state === "open" ? p : null; }, 4000, 50);
                        if (we) { await settle(win, 300); audit(Sx, we.querySelector(".wv-tg-panel-body") || we, { sub: "window-card", frame: we }); await grab(Sx, "window-card", we); try { we.hidePopup(); } catch (e) {} }
                        else Sx.notes.push("the window card did not open");
                        await sleep(200);
                    }
                    else Sx.notes.push("no title-bar spacer for the window card");
                }
                finally {
                    try { wv._tabGroupDelete(g.id); } catch (e) {}
                    try { wv._wvTabGroupApplyEverywhere(); } catch (e) {}
                    await sleep(200);
                }
            });
        });
    });

    it("split view: the footer, its menu, the tab picker", async function () {
        await surface("split", async (Sx) => {
            for (const m of ["_wvTabSplitCreate", "_wvTabSplitSeparate", "_wvTabSplitAddPicker"]) wvT.method(m);
            const r = await readerOfA();
            const prev = { v: Zotero.Prefs.get("weavero.enableSplitView"), f: Zotero.Prefs.get("weavero.splitViewFooter") };
            const ctxCollapsed = win.ZoteroContextPane && win.ZoteroContextPane.collapsed;
            let s = null;
            try {
                Zotero.Prefs.set("weavero.enableSplitView", true);
                Zotero.Prefs.set("weavero.splitViewFooter", true);
                await toLibrary();
                s = wv._wvTabSplitCreate(win, libTab().id, r.tabID, { select: "right" });
                assert.ok(s, "a split of the library and the reader");
                await sleep(800);
                try { if (win.ZoteroContextPane && !win.ZoteroContextPane.collapsed) win.ZoteroContextPane.togglePane(); } catch (e) {}
                await settle(win, 600);
                const layer = doc.getElementById("wv-tsplit-layer");
                assert.ok(layer, "the split layer");
                const foots = [...layer.querySelectorAll(".wv-tsplit-footer")].filter(f => !f.hidden && visible(f));
                Sx.notes.push("footers shown: " + foots.length);
                for (const [i, f] of foots.entries()) {
                    audit(Sx, f, { sub: "footer-" + i });
                    await snap(Sx, "split-footer-" + i, win, f.getBoundingClientRect());
                }
                const more = foots.length ? foots[0].querySelector(".wv-tsplit-more") : null;
                if (more) {
                    more.click();
                    const pop = await wvT.waitFor(() => { const p = doc.getElementById("wv-tsplit-menu"); return p && p.state === "open" ? p : null; }, 4000, 50);
                    if (pop) { await settle(win, 200); auditMenu(Sx, pop, "footer-menu"); await grab(Sx, "split-footer-menu", pop); try { pop.hidePopup(); } catch (e) {} }
                    else Sx.notes.push("the footer menu did not open");
                    await sleep(200);
                }
                else Sx.notes.push("no footer ⋯");
                // The picker beside a tab that is in no split (Add Split View).
                try { for (const x of (win._wvTSplits || []).slice()) wv._wvTabSplitSeparate(win, x.id); } catch (e) {}
                s = null;
                await sleep(400);
                win.Zotero_Tabs.select(r.tabID);
                await settle(win, 400);
                wv._wvTabSplitAddPicker(win, r.tabID);
                const pk = await wvT.waitFor(() => { const x = doc.querySelector("#wv-tsplit-layer .wv-tsplit-picker"); return x && visible(x) ? x : null; }, 5000, 50);
                assert.ok(pk, "the tab picker");
                await settle(win, 300);
                audit(Sx, pk, { sub: "picker" });
                await snap(Sx, "split-picker", win, pk.getBoundingClientRect());
                try { pk.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {}
                await sleep(300);
            }
            finally {
                try { for (const x of (win._wvTSplits || []).slice()) wv._wvTabSplitSeparate(win, x.id); } catch (e) {}
                try { if (s) wv._wvTabSplitSeparate(win, s.id); } catch (e) {}
                await sleep(300);
                try { if (win.ZoteroContextPane && win.ZoteroContextPane.collapsed !== ctxCollapsed) win.ZoteroContextPane.togglePane(); } catch (e) {}
                /** @type {Array<[string, any]>} */
                const back = [["weavero.enableSplitView", prev.v], ["weavero.splitViewFooter", prev.f]];
                for (const [k, v] of back) {
                    try { if (v === undefined) Zotero.Prefs.clear(k); else Zotero.Prefs.set(k, v); } catch (e) {}
                }
                try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (e) {}
                await toLibrary();
            }
        });
    });

    it("the Researchers tab: the table, a page, the editor, an empty list", async function () {
        await surface("researchers", async (Sx) => {
            for (const m of ["_wvPeopleTabOpen", "_wvPeopleTabRender", "_wvPeopleViewOf", "_wvPeopleRootOf", "_wvPeopleCreate", "_wvPeopleSave", "_wvPeopleLoad"]) wvT.method(m);
            const storePath = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
            const PREFS = ["people.sort", "people.show", "people.filters", "people.columns"];
            const root = () => wv._wvPeopleRootOf(win);
            await wvT.withPref("weavero.enablePeople", true, async () => {
                try {
                    for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
                    try { await IOUtils.remove(storePath, { ignoreAbsent: true }); } catch (e) {}
                    wv._wvPeopleDB = null;
                    await wv._wvPeopleLoad();
                    const line = (fact, value) => ({ fact, value, source: "me", status: "chosen" });
                    const recs = [];
                    for (const [last, first, inst, country, phd, fol] of [["Wvfitlohse", "Detlef", "University of Twente", "NL", "1992", false],
                        ["Wvfitbird", "James", "Brown University", "US", "", false], ["Wvfitthoraval", "Marie-Jean", "LadHyX, École polytechnique", "FR", "2013", true]]) {
                        const rr = await wv._wvPeopleCreate(last, first);
                        if (inst) rr.lines.push(line("institution", inst));
                        if (country) rr.lines.push(line("country", country));
                        if (phd) rr.lines.push(line("phd.year", phd));
                        rr.followed = !!fol;
                        recs.push(rr);
                    }
                    DATA.push("Detlef", "James", "Marie-Jean", "Twente", "Brown University", "LadHyX");
                    await wv._wvPeopleSave(recs);
                    try { await wv._wvPeopleLibIndexBuild(); } catch (e) {}
                    wv._wvPeopleTabOpen(win, {});
                    const v = wv._wvPeopleViewOf(win);
                    v.sel = null; v.filter = "all"; v.view = "table"; v.fix = null;
                    wv._wvPeopleTabRender(win);
                    assert.ok(await wvT.waitFor(() => root() && root().querySelectorAll(".wv-pp-table .virtualized-table-body .row[data-wv-pp-person]").length === 3, 8000, 100), "the table with three researchers");
                    await settle(win, 400);
                    const frame = () => parentOf(root()) || null;
                    audit(Sx, root(), { sub: "table", frame: frame() });
                    await snap(Sx, "researchers-table", win, root().getBoundingClientRect());
                    // A researcher's page, then its editor.
                    wv._wvPeopleTabOpen(win, { personID: recs[2].id });
                    const pg = await wvT.waitFor(() => { const m = root() && root().querySelector(".wv-pp-main[data-wv-pp-record]"); return m && m.getAttribute("data-wv-pp-mode") === "view" ? m : null; }, 8000, 100);
                    assert.ok(pg, "a researcher's page");
                    await settle(win, 400);
                    audit(Sx, root(), { sub: "page", frame: frame() });
                    await snap(Sx, "researchers-page", win, root().getBoundingClientRect());
                    wv._wvPeopleTabOpen(win, { personID: recs[2].id, edit: true });
                    const edv = await wvT.waitFor(() => root() && root().querySelector("[data-wv-pp-sec='contact']"), 8000, 100);
                    if (edv) {
                        await settle(win, 400);
                        audit(Sx, root(), { sub: "editor", frame: frame() });
                        await snap(Sx, "researchers-editor", win, root().getBoundingClientRect());
                    }
                    else Sx.notes.push("the editor did not show its contact section");
                    // A list that matches nothing.
                    const v2 = wv._wvPeopleViewOf(win);
                    v2.sel = null; v2.view = "table"; v2.q = "zzzzwvfit"; v2.fix = null;
                    try { v2.person = null; } catch (e) {}
                    wv._wvPeopleTabOpen(win, {});
                    wv._wvPeopleTabRender(win);
                    const hint = await wvT.waitFor(() => root() && root().querySelector(".wv-pp-main > .wv-pp-hint"), 4000, 100);
                    if (hint) { await settle(win, 200); audit(Sx, root(), { sub: "no-match", frame: frame() }); }
                    else Sx.notes.push("no empty-list hint (the search field may be named otherwise)");
                }
                finally {
                    try { wv._wvPeopleTabClose(win); } catch (e) {}
                    try { for (const x of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(x.id); } catch (e) {}
                    try { await IOUtils.remove(storePath, { ignoreAbsent: true }); } catch (e) {}
                    wv._wvPeopleDB = null;
                    for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
                    await toLibrary();
                }
            });
        });
    });

    it("feeds: the Relevance column, Why relevant, the reference menu and its card", async function () {
        await surface("feeds", async (Sx) => {
            for (const m of ["_wvFdSettingsGet", "_wvFdSettingsSet", "_wvFdRefresh"]) wvT.method(m);
            const savedSettings = JSON.parse(JSON.stringify(await wv._wvFdSettingsGet()));
            let feed = null, MINE = null;
            const iv = () => ZP.itemsView;
            const showRow = async (id) => {
                const cv = ZP.collectionsView;
                assert.ok(await wvT.waitFor(() => cv.getRowIndexByID(id) !== false, 15000, 100), "collection-tree row " + id);
                await cv.selectByID(id);
                await iv().waitForLoad();
                await wvT.waitFor(() => iv().collectionTreeRows && iv().collectionTreeRows[0] && iv().collectionTreeRows[0].id === id, 10000, 50);
            };
            try {
                await toLibrary();
                MINE = new Zotero.Item("journalArticle");
                MINE.libraryID = Zotero.Libraries.userLibraryID;
                MINE.setField("title", "WVFIT bubble entrapment during drop impact on a deep liquid pool");
                MINE.setField("date", "2021");
                MINE.setField("abstractNote", "The entrapment of an air bubble under a drop impacting a deep liquid pool.");
                MINE.setCreators([{ creatorType: "author", lastName: "Wvfitauthor", firstName: "Marie" }]);
                await MINE.saveTx();
                await wv._wvFdSettingsSet({ myNames: ["Wvfitauthor, M."], followed: [], alerts: [], watched: [], citedPersons: [] });
                feed = /** @type {any} */ (new Zotero.Feed());
                feed.name = "WVFIT feed"; feed.description = "";
                feed.url = "https://wv-fit-test.invalid/" + Zotero.Utilities.randomString() + ".xml";
                feed.refreshInterval = 24 * 60; feed.cleanupReadAfter = 60; feed.cleanupUnreadAfter = 90;
                await feed.saveTx();
                const fi = /** @type {any} */ (new Zotero.FeedItem("journalArticle"));
                fi.libraryID = feed.libraryID;
                fi.guid = "wv-fit-" + Zotero.Utilities.randomString();
                fi.setField("title", "WVFIT air bubble entrapment beneath a drop impacting a deep liquid pool");
                fi.setField("date", "2026-11-01");
                fi.setField("abstractNote", "The air film under an impacting drop ruptures and entraps a bubble ring in the liquid pool.");
                fi.setCreators([{ creatorType: "author", lastName: "Wvfitauthor", firstName: "M." }]);
                await fi.saveTx();
                await wv._wvFdRefresh("spec", { rebuild: true });
                await showRow("L" + feed.libraryID);
                await settle(win, 500);
                const header = doc.querySelector("#zotero-items-tree .virtualized-table-header");
                assert.ok(header, "the items list's header");
                const cells = [...header.querySelectorAll(".cell")].filter(c => /weavero/i.test(String((c.querySelector(".label") || c).className || "")) || /weavero/i.test(String(c.getAttribute("data-key") || c.id || "")));
                Sx.notes.push("Weavero header cells: " + cells.length);
                assert.isAbove(cells.length, 0, "the Relevance column in the feed's header");
                for (const [i, c] of cells.entries()) audit(Sx, c, { sub: "header-" + i, frame: header });
                await snap(Sx, "feeds-header", win, header.getBoundingClientRect());
                await iv().selectItem(fi.id);
                const pane = itemPane();
                const sec = await wvT.waitFor(() => { const s = pane && pane.querySelector('item-pane-custom-section[data-pane$="weavero-feeds"]'); return s && !s.hidden ? s : null; }, 10000, 100);
                assert.ok(sec, "Why relevant shown for the feed item");
                try { await pane.querySelector("item-details").scrollToPane(wv._wvFdSecKey, "instant"); } catch (e) {}
                await wvT.waitFor(() => sec.querySelector(".wv-fd-sec .wv-fd-reason"), 10000, 100);
                await settle(win, 400);
                audit(Sx, sec, { sub: "why-relevant", frame: pane });
                await snap(Sx, "feeds-why-relevant", win, pane.getBoundingClientRect());
                const more = sec.querySelector(".wv-fd-row .wv-refs-btn[data-wv-fd-act='more']");
                if (more) {
                    more.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
                    const m = await wvT.waitFor(() => { const p = doc.getElementById("wv-refs-menu"); return p && p.state === "open" ? p : null; }, 5000, 50);
                    if (m) {
                        await settle(win, 300);
                        auditMenu(Sx, m, "reference-menu");
                        const card = m.querySelector(".wv-refs-card");
                        if (card) audit(Sx, card, { sub: "reference-card", frame: m });
                        await grab(Sx, "feeds-reference-menu", m);
                        try { m.hidePopup(); } catch (e) {}
                        await sleep(200);
                    }
                    else Sx.notes.push("the reference menu did not open");
                }
                else Sx.notes.push("no related row with a ⋯ in Why relevant");
            }
            finally {
                try { await showRow("L" + Zotero.Libraries.userLibraryID); } catch (e) {}
                try { await wv._wvFdSettingsSet(savedSettings); } catch (e) {}
                try { if (feed) await feed.eraseTx(); } catch (e) {}
                await wvT.erase(MINE);
            }
        });
    });

    it("wrote the findings", async function () {
        await save();
        const n = Object.values(R.surfaces).reduce((a, s) => a + (/** @type {any} */ (s)).findings.length, 0);
        Zotero.debug("[wv-test] l10n fit " + LOC + " Zotero " + ZV + ": " + n + " findings in " + Object.keys(R.surfaces).length + " surfaces -> " + OUT);
        assert.isAbove(Object.keys(R.surfaces).length, 5, "the surfaces were audited");
    });
});
