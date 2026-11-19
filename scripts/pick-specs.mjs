// Pick the spec files a change needs, instead of the full suite.
//
//   node scripts/pick-specs.mjs [--base <ref>] [--list]      (npm run test:pick -- --list)
//
// Prints a WV_TEST_ENTRIES value (comma-separated spec paths) for
// `WV_TEST_ENTRIES=<value> npm test -- --exit-on-finish`; with --list, one
// line per picked spec with the reason, on stderr.
//
// The change is `git diff <base>...HEAD` plus uncommitted and untracked files.
// --base defaults to `main` on a branch and to `origin/main` on main.
//
// A spec is picked when:
//   - it is itself changed or new;
//   - it names an identifier that a changed src/ line adds or removes
//     (`_wvSomething`, `wv-something`, `weavero.somePref`, a Fluent id). An
//     identifier named by more than COMMON spec files (a shared helper such as
//     `_wvWireTag`) picks nothing and is listed as too common;
//   - a FILE RULE below matches a changed file (strings, Settings, wiring);
//   - it is in the BASE set (always run).
// A changed src/lib/ file (shared by every module) or more than half of the
// suite picked: it says "run the full suite".
//
// This is for DAY-TO-DAY work. The full suite still runs once on each tree that
// lands on main and at every release (verify skill §5).

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const LIST = args.includes("--list");
const COMMON = 12;

const BASE = [
  "test/popups.spec.js",          // popup contracts (CLAUDE.md hard invariant)
  "test/compat.spec.js",          // winOf(node) rule (CLAUDE.md hard invariant)
  "test/reader-leak.spec.js",     // closed readers and windows are freed
  "test/prefs-defaults.spec.js",  // every pref's default
  "test/option-gates.spec.js",    // every setting turns its feature off
];
const FILE_RULES = [
  [/^src\/locale\//, (s) => /^(menus-l10n|prefs-l10n)\.spec\.js$/.test(s), "strings changed"],
  [/^src\/(prefs\.html|prefs\/|modules\/prefs)/, (s) => /^prefs-/.test(s), "Settings changed"],
  [/^src\/(index\.ts|bootstrap\.js)$/, (s) => /^(init-phases|window-wiring|window-wiring-table|destroyed-instance-wiring|zz-reload-listeners|zzz-disable-leftovers)\.spec\.js$/.test(s), "startup / wiring changed"],
  [/^src\/modules\/tab-split/, (s) => /^split-/.test(s), "split view changed"],
  [/^src\/modules\/tab-groups/, (s) => /^tab-group/.test(s), "tab groups changed"],
  [/^src\/modules\/filter/, (s) => /^filter/.test(s), "filter changed"],
];

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const base = opt("--base") || (branch === "main" ? "origin/main" : "main");

const lines = (s) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const changed = new Set([
  ...lines(git("diff", "--name-only", `${base}...HEAD`)),
  ...lines(git("diff", "--name-only", "HEAD")),
  ...lines(git("ls-files", "--others", "--exclude-standard")),
]);

// Identifiers that changed src/ lines add or remove.
const idents = new Set();
const srcDiff = git("diff", "--unified=0", `${base}...HEAD`, "--", "src") + "\n" + git("diff", "--unified=0", "HEAD", "--", "src");
for (const l of srcDiff.split(/\r?\n/)) {
  if (!/^[+-]/.test(l) || /^(\+\+\+|---) /.test(l)) continue;
  for (const m of l.matchAll(/\b_wv[A-Za-z0-9_]{3,}\b|\bwv-[a-z0-9-]{3,}\b|\bweavero\.[A-Za-z0-9_.]{3,}\b|\bweavero-[a-z0-9-]{3,}\b/g)) idents.add(m[0]);
}

const specs = readdirSync("test").filter((f) => f.endsWith(".spec.js") && !f.startsWith("000-")).sort();
const texts = new Map(specs.map((s) => [s, readFileSync(join("test", s), "utf8")]));
const picked = new Map();   // spec path -> reason
const pick = (path, why) => { if (!picked.has(path)) picked.set(path, why); };

for (const f of changed) {
  if (/^test\/[^/]+\.spec\.js$/.test(f) && existsSync(f) && !basename(f).startsWith("000-")) pick(f, "changed spec");
}
for (const f of changed) {
  for (const [re, test, why] of FILE_RULES) {
    if (re.test(f)) for (const s of specs) if (test(s)) pick("test/" + s, why);
  }
}
const common = [];
for (const id of idents) {
  const users = specs.filter((s) => texts.get(s).includes(id));
  if (users.length > COMMON) { common.push(`${id} (${users.length})`); continue; }
  for (const s of users) pick("test/" + s, "names " + id);
}
for (const b of BASE) if (existsSync(b)) pick(b, "base set");

const out = [...picked.keys()];
const lib = [...changed].filter((f) => /^src\/lib\//.test(f));
if (LIST) {
  console.error(`[pick-specs] base ${base}: ${changed.size} changed files, ${idents.size} changed identifiers`);
  for (const [s, why] of picked) console.error(`  ${s}  -- ${why}`);
  if (common.length) console.error(`[pick-specs] too common to pick by (more than ${COMMON} specs): ${common.join(", ")}`);
  console.error(`[pick-specs] ${out.length} of ${specs.length} spec files`);
}
if (lib.length) console.error(`[pick-specs] shared code changed (${lib.join(", ")}): run the full suite`);
else if (out.length > specs.length / 2) console.error(`[pick-specs] more than half of the suite picked: run the full suite`);
console.log(out.join(","));
