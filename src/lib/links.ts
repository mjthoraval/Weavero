// Pure link/markdown helpers — NO Zotero imports, NO plugin state.
// Pref reading stays in modules/url.ts; this module owns the pure
// assembly and classification so it can be unit-tested under plain Node
// (test/unit/*.unit.ts). Re-exported onto the plugin class by thin
// adapters — behavior in Zotero is byte-identical.

/** The link colours, one set (survey 2026-10-06 §4 #10): URL links Google
 *  blue, Zotero-internal links saddle brown, app links violet, each with a
 *  lighter variant for a dark background (both at least 4.5:1). Six sheets
 *  and one SVG builder spelled the six hex values out. */
export const WV_LINK_PALETTE: { [kind: string]: { light: string; dark: string } } = {
    http:   { light: "#1a73e8", dark: "#8ab4f8" },
    zotero: { light: "#8b4513", dark: "#cd853f" },
    app:    { light: "#9333ea", dark: "#c084fc" },
};

/** The `--wv-link-*` custom-property declarations for one scheme, to wrap
 *  in the sheet's own selector (`:root`, `:root.wv-ui-dark`, a media query). */
export function wvLinkVars(scheme: "light" | "dark"): string {
    return Object.keys(WV_LINK_PALETTE).map((k) => "--wv-link-" + k + ": " + WV_LINK_PALETTE[k][scheme] + ";").join(" ");
}

/** One link colour as a hex string (an SVG built at data-URI time cannot
 *  inherit currentColor). */
export function wvLinkColor(kind: "http" | "zotero" | "app", dark: boolean): string {
    const c = WV_LINK_PALETTE[kind] || WV_LINK_PALETTE.http;
    return dark ? c.dark : c.light;
}

/** Self-contained colour rules for `<prefix>.wv-link-<kind>` labels, dark by
 *  the OS scheme -- for a sheet that cannot count on the surface's
 *  `--wv-link-*` variables being loaded. */
export function wvLinkClassRules(prefix: string): string[] {
    const kinds = Object.keys(WV_LINK_PALETTE);
    return [
        ...kinds.map((k) => prefix + ".wv-link-" + k + "{color:" + WV_LINK_PALETTE[k].light + ";}"),
        "@media (prefers-color-scheme: dark){",
        ...kinds.map((k) => " " + prefix + ".wv-link-" + k + "{color:" + WV_LINK_PALETTE[k].dark + ";}"),
        "}",
    ];
}

/** Inline-markdown detector: **bold**, *italic* (single-star, no
 *  space-hugging), ~~strikethrough~~, `code`, [label](url). Single-line
 *  by construction for the star form. No `g` flag — stateless shared
 *  instance. */
export const MD_REGEX =
    /(\*\*[\s\S]+?\*\*|\*(?!\s)[^*\n]+?(?<!\s)\*|~~[\s\S]+?~~|`[^`\n]+?`|\[[^\]\n]{1,500}?\]\([^)\s]{1,2048}\))/;

/** A markdown link `[label](url)` for the comment tokenizers: group 1 the
 *  label, group 2 the address. Both are bounded (a label of at most 500
 *  characters, an address of at most 2048): unbounded, a run of `[` made the
 *  scan quadratic -- each one searched the rest of the line for its `](`. */
export const MD_LINK_SRC = "\\[([^\\]\\n]{1,500}?)\\]\\(([^)\\s]{1,2048})\\)";

/** How much of one annotation comment or reference entry is scanned for
 *  links; the rest is shown as text. */
export const WV_LINK_SCAN_MAX = 20000;
/** How much of one note the Backlinks index and the note editor scan. */
export const WV_NOTE_SCAN_MAX = 1000000;

/** One scheme entry of the URL alternation: scheme name + its separator
 *  with `/` escaped for embedding in a regex source string. Scheme names
 *  are alphanumeric only — no other metachars to escape. */
export function schemeAltPart(name: string, sep: string): string {
    return name + sep.replace(/\//g, "\\/");
}

/** Join scheme parts into the alternation body. Empty input returns the
 *  `\b\B` sentinel — a word boundary AND a non-word-boundary at the same
 *  position is a contradiction, so the resulting regex matches nothing.
 *  Without it, `[].join("|") === ""` would yield `()[^…]*`, which
 *  matches every non-empty string. */
export function joinSchemeAlt(parts: string[]): string {
    return parts.length ? parts.join("|") : "\\b\\B";
}

/** A URL body: it stops at whitespace and the most common trailing
 *  punctuation. */
const URL_BODY = "[^\\s<>\"')\\]]*";

/** A URL never STARTS inside the value of an XML namespace declaration --
 *  `xmlns="…"`, `xmlns:xlink='…'`, quoted or not. A namespace name only
 *  identifies a vocabulary; nothing is meant to be opened there. SVG
 *  source in a comment got a link badge and a clickable namespace from
 *  `xmlns="http://www.w3.org/2000/svg"`, fenced or bare (issue #56,
 *  2026-10-14). The `[^\s"'<>]` run covers every position inside the
 *  value, so a match cannot restart at the value's `www.` either.
 *  Every part of it is BOUNDED (a value up to 512 characters, a prefix up to
 *  64, up to 16 spaces): the lookbehind runs at every place a scheme starts,
 *  and unbounded it scanned back over the whole run of non-space text each
 *  time -- quadratic, 33 s on a crafted 288 KB note (security review
 *  2026-11-22). A namespace value is far shorter than 512. */
const NOT_IN_XMLNS_VALUE = "(?<!\\bxmlns(?::[\\w.-]{1,64})?\\s{0,16}=\\s{0,16}[\"']?[^\\s\"'<>]{0,512})";

/** The lookahead runs first so the lookbehind is only tried where a scheme
 *  actually starts, not at every position of every comment. */
function urlStart(schemeAlt: string): string {
    return "(?=" + schemeAlt + ")" + NOT_IN_XMLNS_VALUE;
}

/** The URL pattern with NO capture groups, for tokenizers that embed it in
 *  their own alternation (the comment renderers in modules/reader.ts) --
 *  the same rule as buildUrlRegex, so the badge and the rendered links
 *  never disagree. */
export function urlPattern(schemeAlt: string): string {
    return urlStart(schemeAlt) + "(?:" + schemeAlt + ")" + URL_BODY;
}

/** Single-match URL regex over plain text; group 1 is the scheme. */
export function buildUrlRegex(schemeAlt: string): RegExp {
    return new RegExp(urlStart(schemeAlt) + "(" + schemeAlt + ")" + URL_BODY);
}

/** An http(s) address with a host: a web page, and nothing else (no file,
 *  no application link). What a paper's web page may be (View Online, a
 *  paper link to an item with no file). */
export function wvIsWebURL(url: unknown): boolean {
    return typeof url === "string" && /^https?:\/\/[^\s/\\?#]+/i.test(url.trim());
}

/** The site of an http(s) address (or a schemeless `www.` one), lower case,
 *  without `www.`, `dx.doi.org` read as `doi.org`; null for anything else. */
function webHost(s: string): string | null {
    try {
        const u = new URL(/^www\./i.test(s) ? "https://" + s : s);
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
        const h = u.hostname.toLowerCase().replace(/^www\./, "");
        return h === "dx.doi.org" ? "doi.org" : h;
    }
    catch (e) { return null; }
}

/** Whether a link's label spells out an address other than the one the link
 *  opens -- `[https://doi.org/10.1/x](https://elsewhere.example)`, a DOI label
 *  on a link off doi.org, a web address on a link of another kind. The
 *  renderers then show the real target instead of the label. A label that is
 *  no address (a citation, a phrase) never misleads this way. */
export function wvLabelMisleads(label: unknown, url: unknown): boolean {
    const l = String(label == null ? "" : label).trim();
    const u = String(url == null ? "" : url).trim();
    if (!l || l === u) return false;
    let want: string | null;
    if (/^(?:https?:\/\/|www\.)\S/i.test(l)) {
        want = webHost(l.split(/\s/)[0]);
        if (!want) return true;
    }
    else if (/^(?:doi:\s*)?10\.\d{4,9}\//i.test(l)) want = "doi.org";
    else return false;
    const got = webHost(u);
    return got !== want;
}

/** The other computer a file: URL names, or null when it names a file on
 *  this one. A host in the URL (`file://host/share`) or a UNC path after an
 *  empty one (`file:////host/share`, backslashes, percent-escapes) is another
 *  computer: on Windows opening it connects there and authenticates. "?" when
 *  the URL cannot be read. */
export function wvRemoteFileHost(url: unknown): string | null {
    if (typeof url !== "string") return null;
    const m = /^\s*file:([\s\S]*)$/i.exec(url);
    if (!m) return null;
    let rest = m[1];
    try { rest = decodeURIComponent(rest); } catch (e) { return "?"; }
    rest = rest.replace(/\\/g, "/");
    if (!rest.startsWith("//")) return null;
    const a = rest.slice(2);
    const i = a.indexOf("/");
    const host = i < 0 ? a : a.slice(0, i);
    const path = i < 0 ? "" : a.slice(i);
    if (host && host.toLowerCase() !== "localhost") return host;
    if (path.startsWith("//")) {
        const p = path.replace(/^\/+/, "");
        return p.split("/")[0] || "?";
    }
    return null;
}

/** A file: URL that names another computer (wvRemoteFileHost). */
export function wvIsRemoteFileURL(url: unknown): boolean {
    return wvRemoteFileHost(url) !== null;
}

/** Where a file: URL on another computer leads (only when wvRemoteFileHost
 *  calls it remote; null for a file on this computer or no file: URL):
 *  `host`, the server; `path`, the rest (`/share/dir/file`, percent-escapes
 *  decoded, the query and fragment dropped, runs of slashes made one);
 *  `unc`, the Windows path (`\\host\share\dir\file`); `key`, the same with
 *  the host in lower case -- the one form every spelling of the link takes
 *  (backslashes, %5C, four slashes, `file:\\host`), so a link is remembered
 *  as itself (weavero.remoteFileLinks): another link to the same server is
 *  another link. `host` is "?" (and the rest empty) when the URL cannot be
 *  read: such a link is never opened. */
export function wvRemoteFileTarget(url: unknown): { host: string; path: string; unc: string; key: string } | null {
    const h = wvRemoteFileHost(url);
    if (h === null) return null;
    const bad = { host: "?", path: "", unc: "", key: "" };
    if (h === "?") return bad;
    const m = /^\s*file:([\s\S]*)$/i.exec(String(url));
    if (!m) return bad;
    let raw = m[1];
    const cut = raw.search(/[?#]/);
    if (cut >= 0) raw = raw.slice(0, cut);
    let rest: string;
    try { rest = decodeURIComponent(raw); } catch (e) { return bad; }
    rest = rest.replace(/\\/g, "/");
    if (!rest.startsWith("//")) return bad;
    const a = rest.slice(2);
    const i = a.indexOf("/");
    let host = i < 0 ? a : a.slice(0, i);
    let path = i < 0 ? "" : a.slice(i);
    if (!host || host.toLowerCase() === "localhost") {
        const p = path.replace(/^\/+/, "");
        const j = p.indexOf("/");
        host = j < 0 ? p : p.slice(0, j);
        path = j < 0 ? "" : p.slice(j);
    }
    host = host.trim();
    if (!host || /[\s\/\\]/.test(host)) return bad;
    path = path.replace(/\/{2,}/g, "/");
    const win = path.replace(/\//g, "\\");
    return { host, path, unc: "\\\\" + host + win, key: "\\\\" + host.toLowerCase() + win };
}

/** Classify a URL into one of three CSS class buckets so each kind is
 *  colour-coded distinctly across all surfaces:
 *    `wv-link-http`   — http(s)://… (default web links, blue)
 *    `wv-link-zotero` — zotero://…  (Zotero deep links, orange)
 *    `wv-link-app`    — anything else (mailto:, obsidian://, …) —
 *                       the user-enabled App-link schemes, purple. */
export function urlLinkClass(url: string | null | undefined): string {
    if (!url) return "wv-link-http";
    if (url.startsWith("zotero://")) return "wv-link-zotero";
    if (/^https?:\/\//i.test(url)) return "wv-link-http";
    // Schemeless `www.` web links bucket as http (they launch as https).
    if (/^www\./i.test(url)) return "wv-link-http";
    return "wv-link-app";
}
