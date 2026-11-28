// The decision part of scripts/pick-specs.mjs, free of I/O so that
// test/unit/pick-specs.unit.ts runs it on fixtures. pick-specs.mjs gathers the
// diff and the files from git and prints what `pickSpecs` returns.

export const COMMON = 12;

export const BASE = [
  "test/popups.spec.js",          // popup contracts (CLAUDE.md hard invariant)
  "test/compat.spec.js",          // winOf(node) rule (CLAUDE.md hard invariant)
  "test/reader-leak.spec.js",     // closed readers and windows are freed
  "test/prefs-defaults.spec.js",  // every pref's default
  "test/option-gates.spec.js",    // every setting turns its feature off
];

/** @type {Array<[RegExp, (s: string) => boolean, string]>} */
export const FILE_RULES = [
  [/^src\/locale\//, (s) => /^(menus-l10n|prefs-l10n)\.spec\.js$/.test(s), "strings changed"],
  [/^src\/(prefs\.html|prefs\/|modules\/prefs)/, (s) => /^prefs-/.test(s), "Settings changed"],
  [/^src\/(index\.ts|bootstrap\.js)$/, (s) => /^(init-phases|window-wiring|window-wiring-table|destroyed-instance-wiring|zz-reload-listeners|zzz-disable-leftovers)\.spec\.js$/.test(s), "startup / wiring changed"],
  [/^src\/modules\/tab-split/, (s) => /^split-/.test(s), "split view changed"],
  [/^src\/modules\/tab-groups/, (s) => /^tab-group/.test(s), "tab groups changed"],
  [/^src\/modules\/filter/, (s) => /^filter/.test(s), "filter changed"],
];

/** Source files that no runtime file imports and the build leaves out: a
 *  change to them needs no Zotero spec. src/features.ts is the feature
 *  registry (data; its guard is `npm run check:features`, which
 *  `npm run test:unit` runs too).
 *  @type {RegExp[]} */
export const NO_RUNTIME = [/^src\/features\.ts$/];

/** Changed files the picker cannot follow: the run needs the full suite.
 *  @type {Array<[RegExp, string]>} */
const FULL_FILES = [
  [/^src\/index\.ts$/, "src/index.ts changed: it wires every module"],
  [/^zotero-plugin\.config\.ts$/, "the scaffold config changed: it shapes every run"],
];

// Weavero's prefixed names, and a workaround's WV-TEMP marker (its tripwire spec names it).
const IDENT_RE = /\b_wv[A-Za-z0-9_]{3,}\b|\bwv-[a-z0-9-]{3,}\b|\bweavero\.[A-Za-z0-9_.]{3,}\b|\bweavero-[a-z0-9-]{3,}\b|\bWV-TEMP-[A-Za-z0-9]+\b/g;
// A changed line that points at its guard ("Guard: test/foo.spec.js").
const SPEC_REF_RE = /\btest\/([\w.-]+\.spec\.js)\b/g;
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "with", "do", "else", "try",
  "finally", "new", "typeof", "await", "yield", "super", "constructor", "delete", "void", "throw", "case"]);

// ---- the diff -------------------------------------------------------------------

/** `git diff --unified=0` text -> Map(path -> [{ sign: "+"|"-", text, line }]):
 *  `line` is the NEW side's line number (1-based) of an added line, or the
 *  new-side line a removed line sat before. */
export function parseDiff(text) {
  const out = new Map();
  let file = null, line = 0;
  for (const l of String(text).split(/\r?\n/)) {
    let m;
    if ((m = /^\+\+\+ (?:b\/)?(.+)$/.exec(l))) { file = m[1] === "/dev/null" ? null : m[1]; if (file && !out.has(file)) out.set(file, []); continue; }
    if (/^--- /.test(l) || /^(diff|index|new file|deleted file|similarity|rename) /.test(l)) continue;
    if ((m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(l))) {
      line = Number(m[1]);
      if (m[2] === "0") line++;  // a pure removal after new line c: the lines sat before c+1
      continue;
    }
    if (!file) continue;
    if (l.startsWith("+")) out.get(file).push({ sign: "+", text: l.slice(1), line: line++ });
    else if (l.startsWith("-")) out.get(file).push({ sign: "-", text: l.slice(1), line });
  }
  return out;
}

// ---- one source file ------------------------------------------------------------

const isComment = (t) => /^\s*(\/\/|\*|\/\*)/.test(t);
const indentOf = (t) => /^[ \t]*/.exec(t)[0].replace(/\t/g, "    ").length;

/** Each line: its indent, whether it is code, whether it belongs to an import
 *  statement, and the definition it opens -- { name, top: true, kind } at
 *  column 0 (function, const/let/var, class, type), { name, top: false,
 *  kind: "method" } for a method-shaped line in a class or object body. Lines
 *  inside a template literal (a CSS block), import statements and closing
 *  `)`/`]` continuation lines are not code. */
export function analyzeSource(text) {
  const raw = String(text).split(/\r?\n/);
  const rows = [];
  let inTpl = false, tplIndent = 0, inImport = false;
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    const startedIn = inTpl;
    let imp = false;
    if (!startedIn && /^import\b/.test(t)) { imp = true; inImport = !/["'];?\s*(\/\/.*)?$/.test(t); }
    else if (inImport) { imp = true; if (/\bfrom\s+["']/.test(t)) inImport = false; }
    const indent = startedIn ? tplIndent + 1 : indentOf(t);
    const code = !startedIn && !imp && t.trim() !== "" && !isComment(t) && !/^\s*[)\]]/.test(t);
    if (startedIn || (!imp && !isComment(t))) {
      const body = t.replace(/\s\/\/.*$/, "");
      const ticks = (body.match(/(?<!\\)`/g) || []).length;
      if (ticks % 2 === 1) { if (!inTpl) tplIndent = indent; inTpl = !inTpl; }
    }
    rows.push({ text: t, indent, code, imp, def: code ? defOf(t, indent) : null });
  }
  return rows;
}

function defOf(t, indent) {
  let m;
  if (indent === 0) {
    if ((m = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/.exec(t))) return { name: m[1], top: true, kind: "function" };
    if ((m = /^(?:export\s+)?(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(.*)$/.exec(t))) {
      const rhs = m[2];
      const kind = /^\{\s*(\/\/.*)?$/.test(rhs) ? "object"
        : /^(async\s+)?(function\b|\([^)]*\)\s*(:\s*[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/.test(rhs) ? "function" : "value";
      return { name: m[1], top: true, kind };
    }
    if ((m = /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(t))) return { name: m[1], top: true, kind: "class" };
    if ((m = /^(?:export\s+)?(?:declare\s+)?(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/.exec(t))) return { name: m[1], top: true, kind: "type" };
    return null;
  }
  if ((m = /^\s+(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?([A-Za-z_$][\w$]*)\s*\((.*)$/.exec(t))
      && !KEYWORDS.has(m[1]) && !/^\s*(this|return|await)\b/.test(t)) {
    // name(params) {   on one line, or a _wv method whose parameters run on
    if (/^[^()]*\)\s*(:\s*[^{=()]+)?\{\s*(\/\/.*)?$/.test(m[2])) return { name: m[1], top: false, kind: "method" };
    if (/^_wv/.test(m[1]) && /(\(|,|\{)\s*(\/\/.*)?$/.test(t) && !/=>/.test(t)) return { name: m[1], top: false, kind: "method" };
    return null;
  }
  if ((m = /^\s+([A-Za-z_$][\w$]*)\s*:\s*(async\s+)?(function\b|\([^)]*\)\s*(:\s*[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/.exec(t)) && !KEYWORDS.has(m[1])) {
    return { name: m[1], top: false, kind: "method" };
  }
  return null;
}

/** The definition line i belongs to, as the picker follows a change: the
 *  top-level function it is in; in a class or an object of methods (a
 *  module's method bundle, the plugin class), the member method it is in.
 *  Null for top-level code outside any definition. */
export function enclosingDef(rows, i) {
  const chain = [];
  let need = Infinity;
  for (let j = i; j >= 0; j--) {
    const r = rows[j];
    if (j !== i && !r.code) continue;
    if (j === i || r.indent < need) {
      if (r.def) chain.push(r.def);
      need = Math.min(need, r.indent);
      if (r.indent === 0 && r.code) break;
    }
  }
  const top = chain.find((d) => d.top);
  const members = chain.filter((d) => !d.top);
  if (top && top.kind === "function") return top.name;
  if (members.length) return members[members.length - 1].name;  // the outermost
  return top ? top.name : null;
}

/** Imports: [{ spec, names: [{ imported, local }], form }] -- form "named",
 *  "side-effect", or what the picker does not follow: "namespace", "default".
 *  `import type` is left out (no runtime edge). */
export function parseImports(text) {
  const out = [];
  // The clause holds no quote or semicolon (a `//` comment inside braces may):
  // it cannot run on past a side-effect import into the next statement.
  const re = /^\s*import\s+(type\s+)?((?:[^;"'/]|\/(?!\/)|\/\/[^\n]*)*?)\s+from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
  for (const m of String(text).matchAll(re)) {
    if (m[4]) { out.push({ spec: m[4], names: [], form: "side-effect" }); continue; }
    if (m[1]) continue;
    const clause = m[2].trim();
    const names = [];
    const braces = /\{([\s\S]*)\}/.exec(clause);
    if (braces) {
      for (const part of braces[1].replace(/\/\/[^\n]*/g, "").split(",")) {
        const a = /^\s*(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(part);
        if (a) names.push({ imported: a[1], local: a[2] || a[1] });
      }
    }
    const outside = clause.replace(/\{[\s\S]*\}/, "").replace(/,/g, " ").trim();
    const form = /^\*\s+as\s+/.test(outside) ? "namespace" : outside ? "default" : "named";
    out.push({ spec: m[3], names, form });
  }
  return out;
}

/** local name -> exported name, for `export function/const/class X` and
 *  `export { a as b }` lists. */
export function exportsOf(text) {
  const out = new Map();
  const src = String(text);
  for (const m of src.matchAll(/^export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) out.set(m[1], m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}\s*;?\s*$/gm)) {
    for (const part of m[1].split(",")) {
      const a = /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(part);
      if (a) out.set(a[1], a[2] || a[1]);
    }
  }
  return out;
}

/** "./x" from "src/modules/a.ts" -> "src/modules/x.ts" when that file exists. */
export function resolveImport(from, spec, has) {
  if (!spec.startsWith(".")) return null;
  const parts = from.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop(); else parts.push(seg);
  }
  const p = parts.join("/");
  for (const c of [p, p + ".ts", p + ".js", p + "/index.ts"]) if (has(c)) return c;
  return null;
}

const wordRe = (name) => new RegExp("(?<![\\w$])" + name.replace(/\$/g, "\\$") + "(?![\\w$])");
/** A definition name specific enough to look for in the specs: Weavero's
 *  prefixes (`_wv`, `wv` + capital, `WV_`) or a private plugin method (`_`),
 *  six characters at least. A plain word (`notify`, `onCommand`) also reads
 *  in any spec's prose. */
const nameable = (n) => n.length >= 6 && /^(_|wv[A-Z]|WV_)/.test(n);

// ---- the decision ---------------------------------------------------------------

/**
 * input: {
 *   changed: string[]               every changed path (repo-relative, "/")
 *   diff: Map(path -> lines)        parseDiff of the changes under src/
 *   src: Map(path -> text)          src/ files of the tree being tested
 *   specs: Map(file name -> text)   test/*.spec.js, the 000- files left out
 *   entries: string[]               the build's entry points (nobody imports them)
 * }
 * returns { picked: Map(spec path -> reason), full: string[], common: string[], graph: string[] }
 */
export function pickSpecs({ changed, diff, src, specs, entries }) {
  const runtime = (f) => !NO_RUNTIME.some((re) => re.test(f));
  changed = changed.filter(runtime);
  diff = new Map([...diff].filter(([f]) => runtime(f)));
  const specNames = [...specs.keys()].sort();
  const picked = new Map();
  const led = new Set();   // the changed files that led to a spec (picked first for another reason or not)
  const pick = (path, why, from) => { if (from) led.add(from); if (!picked.has(path)) picked.set(path, why); };
  const full = [], common = [], graph = [];

  for (const f of changed) {
    const base = f.split("/").pop();
    if (/^test\/[^/]+\.spec\.js$/.test(f) && !base.startsWith("000-") && specs.has(base)) pick(f, "changed spec");
    for (const [re, why] of FULL_FILES) if (re.test(f)) full.push(why);
  }
  for (const f of changed) for (const [re, test, why] of FILE_RULES) {
    if (re.test(f)) for (const s of specNames) if (test(s)) pick("test/" + s, `${why} (${f})`, f);
  }

  // 1. Identifiers that changed src/ lines add or remove, and the specs they
  //    name as their guard.
  const idents = new Map();   // identifier -> the changed file it came from
  for (const [file, lines] of diff) {
    if (!file.startsWith("src/")) continue;
    for (const l of lines) {
      for (const m of l.text.matchAll(IDENT_RE)) if (!idents.has(m[0])) idents.set(m[0], file);
      for (const m of l.text.matchAll(SPEC_REF_RE)) if (specs.has(m[1])) pick("test/" + m[1], `named by a changed line of ${file}`, file);
    }
  }
  const usersOf = (name, exact) => specNames.filter((s) => (exact ? specs.get(s).includes(name) : wordRe(name).test(specs.get(s))));
  for (const [id, file] of idents) {
    const users = usersOf(id, true);
    if (users.length > COMMON) { common.push(`${id} (${users.length})`); continue; }
    for (const s of users) pick("test/" + s, `names ${id} (changed in ${file})`, file);
  }

  // 2. The import graph: the definitions a change sits in, then everything
  //    that uses them -- in the same file, and through named imports.
  const info = new Map();
  for (const [p, text] of src) {
    if (/\.ts$/.test(p)) info.set(p, { rows: analyzeSource(text), imports: parseImports(text), exports: exportsOf(text) });
  }
  const importers = new Map();   // file -> [{ file: importer, names, form }]
  for (const [p, inf] of info) for (const imp of inf.imports) {
    const target = resolveImport(p, imp.spec, (c) => info.has(c));
    if (!target) continue;
    if (!importers.has(target)) importers.set(target, []);
    importers.get(target).push({ file: p, names: imp.names, form: imp.form });
  }

  // Each reached definition keeps EVERY changed file it comes from, so that each
  // of them is credited with the specs it leads to.
  const tainted = new Map();    // file -> Map(definition name -> Set(changed file))
  const reached = new Map();    // file using what another changed file changed -> Set(that file)
  const work = [];
  const taint = (file, name, via) => {
    if (!tainted.has(file)) tainted.set(file, new Map());
    const m = tainted.get(file);
    if (!m.has(name)) m.set(name, new Set());
    if (m.get(name).has(via)) return;
    m.get(name).add(via);
    work.push({ file, name, via });
  };
  const usesIn = (file, local, via, self) => {
    const rows = info.get(file).rows;
    const re = wordRe(local);
    rows.forEach((r, i) => {
      if (!r.code || /^\s*import\b/.test(r.text) || /^export\s*\{/.test(r.text) || !re.test(r.text)) return;
      const d = enclosingDef(rows, i);
      if (d != null && d !== self) taint(file, d, via);
    });
  };

  const changedTs = [...changed].filter((f) => /^src\/.+\.ts$/.test(f) && !FULL_FILES.some(([re]) => re.test(f)));
  const effective = new Set();   // changed source files with a line that does something
  for (const f of changedTs) {
    if (!info.has(f)) { graph.push(`${f}: removed -- the files that imported it changed too`); continue; }
    const rows = info.get(f).rows;
    let topLevel = false;
    let removedTop = null;   // a top-level definition this run of removed lines took out
    let any = false;
    for (const l of diff.get(f) || []) {
      const t = l.text.trim();
      if (l.sign === "+") removedTop = null;
      if (!t || isComment(l.text) || /^[}\])][}\]);,]*$/.test(t)) continue;   // blank, comment, closer
      const i = Math.min(rows.length - 1, Math.max(0, l.line - 1));
      // An import line (or a name in a multi-line import): no effect by itself.
      if (l.sign === "+" ? rows[i].imp : (/^import\b|^\}?\s*from\s+["']|^[\w$]+(\s+as\s+[\w$]+)?,?$/.test(t) && (rows[i].imp || (i > 0 && rows[i - 1].imp)))) continue;
      any = true;
      if (l.sign === "-") {
        // A removed definition: what used it carries the change. Its removed
        // body or continuation lines belong to it.
        const gone = indentOf(l.text) === 0 ? defOf(l.text, 0) : null;
        if (gone) { removedTop = gone.name; taint(f, gone.name, f); continue; }
        if (removedTop && indentOf(l.text) > 0) continue;
      }
      let d = enclosingDef(rows, i);
      if (d == null && l.sign === "-" && i > 0) d = enclosingDef(rows, i - 1);
      if (d == null) topLevel = true; else taint(f, d, f);
    }
    if (!any) { graph.push(`${f}: only imports, comments or blank lines changed`); continue; }
    effective.add(f);
    if (!entries.includes(f) && !(importers.get(f) || []).length) full.push(`${f}: no file imports it, and it is no entry point`);
    if (topLevel) {
      graph.push(`${f}: a change outside any definition -- every definition of the file counts`);
      rows.forEach((r, i) => { if (r.def) { const d = enclosingDef(rows, i); if (d != null) taint(f, d, f); } });
    }
  }

  const terminals = new Set();  // "file\tmethod"
  while (work.length) {
    const { file, name, via } = work.shift();
    const def = info.get(file).rows.find((r) => r.def && r.def.name === name)?.def;
    if (def && !def.top) {
      // A method of a class or of a module's method bundle: the plugin's own
      // surface. The specs that name it are the ones to run.
      terminals.add(file + "\t" + name);
      continue;
    }
    usesIn(file, name, via, name);
    const exported = info.get(file).exports.get(name);
    if (!exported) continue;
    for (const imp of importers.get(file) || []) {
      if (imp.form === "namespace" || imp.form === "default") {
        full.push(`${imp.file} imports ${file} as a ${imp.form}: not followed`);
        continue;
      }
      const b = imp.names.find((n) => n.imported === exported);
      if (!b) continue;
      if (imp.file !== via) { if (!reached.has(imp.file)) reached.set(imp.file, new Set()); reached.get(imp.file).add(via); }
      usesIn(imp.file, b.local, via, null);
    }
  }

  // 3. Specs for what the graph reached: the file rules of the files reached,
  //    then the specs naming a reached definition (the methods first).
  for (const [file, vias] of reached) {
    const via = [...vias].join(", ");
    graph.push(`${file} uses what changed in ${via}`);
    for (const [re, test, why] of FILE_RULES) if (re.test(file)) for (const s of specNames) if (test(s)) {
      for (const v of vias) led.add(v);
      pick("test/" + s, `${why} (${file} uses ${via})`);
    }
  }
  const named = [];   // [name, file, Set(via)]
  for (const [file, m] of tainted) for (const [n, vias] of m) named.push([n, file, vias, terminals.has(file + "\t" + n)]);
  named.sort((a, b) => Number(b[3]) - Number(a[3]));
  for (const [n, file, vias] of named) {
    if (!nameable(n)) continue;
    const users = usersOf(n, idents.has(n));
    if (users.length > COMMON) { if (!idents.has(n)) common.push(`${n} (${users.length})`); continue; }
    const others = [...vias].filter((v) => v !== file);
    const at = others.length ? `${file}, which uses ${others.join(", ")}` : file;
    for (const s of users) { for (const v of vias) led.add(v); pick("test/" + s, `names ${n} (${at})`); }
  }

  // A changed source file whose change led to no spec at all: not followed.
  for (const f of changedTs) {
    if (!effective.has(f) || led.has(f) || full.some((x) => x.startsWith(f + ":"))) continue;
    full.push(`${f}: its change reaches no spec the picker can name`);
  }

  for (const b of BASE) if (specs.has(b.slice(5))) pick(b, "base set");
  if (picked.size > specNames.length / 2) full.push(`more than half of the suite picked (${picked.size} of ${specNames.length})`);
  return { picked, full: [...new Set(full)], common: [...new Set(common)], graph };
}
