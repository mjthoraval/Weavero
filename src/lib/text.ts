// Pure text helpers — NO Zotero imports, NO plugin state. This module is
// the first slice of the dependency-injected core (see TESTING.md
// "Roadmap"): it runs under plain Node for fast unit tests
// (test/unit/*.unit.ts) and is re-exported onto the plugin class by thin
// adapters, so behavior in Zotero is byte-identical.

/** Source for the invisible-character class: zero-widths, bidi controls,
 *  line/paragraph separators, BOM. Kept as a string so consumers can
 *  build fresh RegExp instances — a shared `/g` regex is a lastIndex
 *  trap for `.test()`/`.exec()` callers. */
export const INVISIBLE_RE_SOURCE = "[\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]";

/** Fresh global-flagged invisible-character regex (safe to own per
 *  instance; `.replace` ignores lastIndex but `.test` does not). */
export function makeInvisibleRe(): RegExp {
    return new RegExp(INVISIBLE_RE_SOURCE, "g");
}

/** Trailing punctuation to strip from detected URLs. No `g` flag — a
 *  single shared instance is stateless. Kept for tests and matching only: to
 *  STRIP, use `wvTrimTrailing` -- this pattern is quadratic on a long run of
 *  punctuation that is not at the end, which crafted text can hold. */
export const TRAILING_RE = /[.,;:!?)\]\}>'"`]+$/;

/** The characters `TRAILING_RE` matches. */
export const TRAILING_CHARS = ".,;:!?)]}>'\"`";

/** `s` without the run of `chars` at its end (default: a URL's trailing
 *  punctuation, TRAILING_CHARS) -- a loop from the end, linear in the run,
 *  where a `[…]+$` replace retries the run at every position in it. */
export function wvTrimTrailing(s: string, chars: string = TRAILING_CHARS): string {
    const str = String(s == null ? "" : s);
    let end = str.length;
    while (end > 0 && chars.indexOf(str[end - 1]) >= 0) end--;
    return end === str.length ? str : str.slice(0, end);
}

const _INVISIBLE = makeInvisibleRe();

/** Strip invisible/bidi characters; coerce anything to a string; null,
 *  undefined and "" all normalize to "". */
export function normalize(t: unknown): string {
    return t ? String(t).replace(_INVISIBLE, "") : "";
}
