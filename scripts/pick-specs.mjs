// Pick the spec files a change needs, instead of the full suite.
//
//   node scripts/pick-specs.mjs [--base <ref>] [--head <ref>] [--list]   (npm run test:pick -- --list)
//
// Prints a WV_TEST_ENTRIES value (comma-separated spec paths) for
// `WV_TEST_ENTRIES=<value> npm test -- --exit-on-finish`; with --list, one
// line per picked spec with the reason -- which changed file led to it -- on
// stderr.
//
// The change is the working tree against its merge base with <base> (commits,
// uncommitted and untracked files), or with --head, `git diff <base>...<head>`
// read at <head> (to try the picker on a branch or a past range).
// --base defaults to `main` on a branch and to `origin/main` on main.
//
// A spec is picked when (scripts/pick-specs-lib.mjs):
//   - it is itself changed or new;
//   - it names an identifier that a changed src/ line adds or removes
//     (`_wvSomething`, `wv-something`, `weavero.somePref`, a Fluent id);
//   - it names a definition the change reaches through the IMPORT GRAPH: the
//     function or method each changed line sits in, then every function and
//     method that uses one of those -- in the same file and, through named
//     imports, in the files importing it, transitively -- up to the plugin's
//     methods (a class or a module's method bundle). A src/lib/ change picks
//     the specs of the methods that call it (2026-11-20; before, any src/lib/
//     change meant the full suite);
//   - a FILE RULE matches a changed file or a file the change reaches
//     (strings, Settings, wiring, split view, tab groups, filter);
//   - it is in the BASE set (always run).
// A name in more than COMMON spec files (a shared helper such as `_wvWireTag`)
// picks nothing and is listed as too common.
// It says "run the full suite" -- with the reason -- when src/index.ts or the
// scaffold config changed, when a changed file is imported by no file and is no
// entry point, or imported in a form it does not follow, when a changed source
// file's change reaches no spec it can name, or when more than half of the
// suite is picked.
//
// This is for DAY-TO-DAY work. The full suite still runs once on each tree that
// lands on main and at every release (verify skill §5).

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseDiff, pickSpecs } from "./pick-specs-lib.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const LIST = args.includes("--list");

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 << 20 }).trim();
const lines = (s) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const base = opt("--base") || (branch === "main" ? "origin/main" : "main");
const head = opt("--head");

/** path -> text for every file under the given roots: at a commit, or on disk. */
function readTree(roots) {
  const out = new Map();
  if (head) {
    const paths = lines(git("ls-tree", "-r", "--name-only", head, "--", ...roots));
    const buf = execFileSync("git", ["cat-file", "--batch"], { input: paths.map((p) => `${head}:${p}`).join("\n") + "\n", maxBuffer: 256 << 20 });
    let at = 0;
    for (const p of paths) {
      const nl = buf.indexOf(10, at);
      const size = Number(buf.toString("utf8", at, nl).split(" ")[2]);
      out.set(p, buf.toString("utf8", nl + 1, nl + 1 + size));
      at = nl + 1 + size + 1;
    }
    return out;
  }
  const walk = (p) => {
    if (!existsSync(p)) return;
    if (!statSync(p).isDirectory()) { out.set(p, readFileSync(p, "utf8")); return; }
    for (const f of readdirSync(p)) walk(p + "/" + f);
  };
  for (const r of roots) walk(r);
  return out;
}

let changed, diffText;
if (head) {
  changed = lines(git("diff", "--name-only", `${base}...${head}`));
  diffText = git("diff", "--unified=0", `${base}...${head}`, "--", "src");
} else {
  const mb = git("merge-base", base, "HEAD");
  const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
  changed = [...new Set([...lines(git("diff", "--name-only", mb)), ...untracked])];
  diffText = git("diff", "--unified=0", mb, "--", "src");
  // An untracked source file: every line is new.
  for (const f of untracked.filter((p) => p.startsWith("src/"))) {
    const t = readFileSync(f, "utf8").split(/\r?\n/);
    diffText += `\n+++ b/${f}\n@@ -0,0 +1,${t.length} @@\n` + t.map((l) => "+" + l).join("\n");
  }
}

const tree = readTree(["src", "test", "zotero-plugin.config.ts"]);
const src = new Map([...tree].filter(([p]) => p.startsWith("src/")));
const specs = new Map([...tree].filter(([p]) => /^test\/[^/]+\.spec\.js$/.test(p) && !/^test\/000-/.test(p)).map(([p, t]) => [p.slice(5), t]));
const config = tree.get("zotero-plugin.config.ts") || "";
const entries = [...config.matchAll(/entryPoints:\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]));

const { picked, full, common, graph } = pickSpecs({ changed, diff: parseDiff(diffText), src, specs, entries });

if (LIST) {
  console.error(`[pick-specs] ${base}...${head || "the working tree"}: ${changed.length} changed files`);
  for (const g of graph) console.error(`  graph: ${g}`);
  for (const [s, why] of picked) console.error(`  ${s}  -- ${why}`);
  if (common.length) console.error(`[pick-specs] too common to pick by (more than 12 specs): ${common.join(", ")}`);
  console.error(`[pick-specs] ${picked.size} of ${specs.size} spec files`);
}
for (const why of full) console.error(`[pick-specs] run the full suite: ${why}`);
console.log([...picked.keys()].join(","));
