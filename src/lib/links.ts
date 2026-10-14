// Pure link/markdown helpers — NO Zotero imports, NO plugin state.
// Pref reading stays in modules/url.ts; this module owns the pure
// assembly and classification so it can be unit-tested under plain Node
// (test/unit/*.unit.ts). Re-exported onto the plugin class by thin
// adapters — behavior in Zotero is byte-identical.

/** Inline-markdown detector: **bold**, *italic* (single-star, no
 *  space-hugging), ~~strikethrough~~, `code`, [label](url). Single-line
 *  by construction for the star form. No `g` flag — stateless shared
 *  instance. */
export const MD_REGEX =
    /(\*\*[\s\S]+?\*\*|\*(?!\s)[^*\n]+?(?<!\s)\*|~~[\s\S]+?~~|`[^`\n]+?`|\[[^\]\n]+?\]\([^)\s]+\))/;

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
 *  2026-10-14). The `[^\s"'<>]*` run covers every position inside the
 *  value, so a match cannot restart at the value's `www.` either. */
const NOT_IN_XMLNS_VALUE = "(?<!\\bxmlns(?::[\\w.-]+)?\\s*=\\s*[\"']?[^\\s\"'<>]*)";

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
