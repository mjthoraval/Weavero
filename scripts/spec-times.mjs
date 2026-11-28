// The timing table test/spec-times.json: how long each spec file runs, per
// Zotero major. WV_TEST_SHARD balances its parts by it (scripts/spec-shard.mjs).
//
//   node scripts/spec-times.mjs --json <file>                  merge a run's own record
//   node scripts/spec-times.mjs --log <file> --zotero <major> [--wall-ms <ms>]
//                                                              merge a run's log
//   node scripts/spec-times.mjs --predict 2,3                  the parts the table gives
//   add --dry to print without writing.
//
// A run records itself when WV_TEST_TIMES=<path> is set (test/000-helpers.spec.js):
// each top-level suite's wall time, hooks included, by spec file -- the best
// source. A LOG has only the tests' own durations: each file gets their sum
// plus an equal share of the run's remaining time (hooks, the runner's start),
// estimated from the wall time (--wall-ms, else the log's "Building ... at"
// line to the log file's last write).
//
// Merging replaces the measured files' entries for that major and keeps the
// rest (a shard's record updates its own files); files no longer in test/ are
// dropped. Refresh after a full run on each Zotero major the CI tests -- a
// stale entry only unbalances the parts, never drops a file (a file the table
// lacks is weighed by its size).

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { titleIndex, fileOfTitle, parseRunLog, specTimes, planShards, byteShards, binTimes } from "./spec-shard.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const DRY = args.includes("--dry");
const TABLE = "test/spec-times.json";

const specFiles = readdirSync("test").filter((f) => f.endsWith(".spec.js")).sort();
const texts = new Map(specFiles.map((f) => [f, readFileSync(join("test", f), "utf8")]));
const planned = specFiles.filter((f) => !f.startsWith("000-"));

let table;
try { table = JSON.parse(readFileSync(TABLE, "utf8")); } catch { table = null; }
if (!table || typeof table !== "object") table = {};
table.files = table.files || {};
table.sources = table.sources || {};

const sec = (ms) => (ms / 1000).toFixed(1);

function merge(major, perFile, source) {
  let n = 0;
  for (const [file, ms] of Object.entries(perFile)) {
    if (file.startsWith("000-") || !texts.has(file)) continue;
    (table.files[file] = table.files[file] || {})[major] = Math.round(ms);
    n++;
  }
  for (const f of Object.keys(table.files)) if (!texts.has(f)) delete table.files[f];
  table.sources[major] = source;
  const missing = planned.filter((f) => !(table.files[f] && table.files[f][major] != null));
  console.log(`[spec-times] Zotero ${major}: ${n} files measured; ${missing.length} of ${planned.length} without a Zotero ${major} time${missing.length ? ": " + missing.join(", ") : ""}`);
}

function write() {
  const sorted = {};
  for (const f of Object.keys(table.files).sort()) {
    const per = {};
    for (const k of Object.keys(table.files[f]).sort()) per[k] = table.files[f][k];
    sorted[f] = per;
  }
  const out = {
    about: "Run time of each spec file in ms, per Zotero major: WV_TEST_SHARD balances its parts by it "
      + "(scripts/spec-shard.mjs). Written by scripts/spec-times.mjs from a run's WV_TEST_TIMES record or log; "
      + "refresh after a full run on each Zotero major.",
    sources: table.sources,
    files: sorted,
  };
  if (DRY) { console.log("[spec-times] --dry: not written"); return; }
  // One line per file, so a refresh reads as a short diff.
  const body = Object.entries(out.files).map(([f, per]) => `    ${JSON.stringify(f)}: ${JSON.stringify(per).replace(/,/g, ", ")}`).join(",\n");
  const text = "{\n"
    + `  "about": ${JSON.stringify(out.about)},\n`
    + `  "sources": ${JSON.stringify(out.sources, null, 4).replace(/\n}$/, "\n  }")},\n`
    + `  "files": {\n${body}\n  }\n}\n`;
  JSON.parse(text);   // the hand-built layout is still JSON
  writeFileSync(TABLE, text);
  console.log("[spec-times] wrote " + TABLE);
}

const jsonPath = opt("--json"), logPath = opt("--log"), predict = opt("--predict");

if (jsonPath) {
  // { zotero: "11.0-beta.3", suites: [{ title, file, ms, testMs }] }
  const rec = JSON.parse(readFileSync(jsonPath, "utf8"));
  const major = opt("--zotero") || String(rec.zotero || "").split(".")[0];
  if (!/^\d+$/.test(major)) throw new Error("no Zotero major in the record: pass --zotero <major>");
  const idx = titleIndex(texts);
  const perFile = {}, unmapped = [];
  for (const s of rec.suites || []) {
    const file = s.file || fileOfTitle(s.title, idx, texts);
    if (!file) { unmapped.push(s.title); continue; }
    perFile[file] = (perFile[file] || 0) + s.ms;
  }
  if (unmapped.length) console.log("[spec-times] suites with no file: " + unmapped.join(" | "));
  merge(major, perFile, `${jsonPath.split(/[\\/]/).pop()}: a run's own record (wall per file, hooks included), Zotero ${rec.zotero || major}, ${rec.at || "?"}`);
  write();
} else if (logPath) {
  const major = opt("--zotero");
  if (!/^\d+$/.test(major || "")) throw new Error("--log needs --zotero <major>");
  const text = readFileSync(logPath, "utf8");
  const suites = parseRunLog(text);
  const idx = titleIndex(texts);
  const perFile = {}, unmapped = [];
  let testMs = 0;
  for (const s of suites) {
    testMs += s.testMs;
    const file = fileOfTitle(s.title, idx, texts);
    if (!file) { unmapped.push(s.title); continue; }
    perFile[file] = (perFile[file] || 0) + s.testMs;
  }
  // The wall time: given, or from the build line to the log's last write.
  let wall = Number(opt("--wall-ms")) || 0, wallHow = "--wall-ms";
  if (!wall) {
    const m = /Building version \S+ to \S+ at (\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)/.exec(text);
    if (m) { wall = statSync(logPath).mtimeMs - new Date(m[1] + "T" + m[2]).getTime(); wallHow = `build line ${m[1]} ${m[2]} to the log's last write`; }
  }
  const ran = new Set(Object.keys(perFile));
  const overhead = wall > testMs ? (wall - testMs) / ran.size : 0;
  console.log(`[spec-times] ${suites.length} top-level suites, ${ran.size} files; tests ${sec(testMs)} s; wall ${sec(wall)} s (${wallHow}); `
    + `per-file share of the rest: (${sec(wall)} - ${sec(testMs)}) / ${ran.size} = ${sec(overhead)} s`);
  if (unmapped.length) console.log("[spec-times] suites with no file: " + unmapped.join(" | "));
  for (const f of Object.keys(perFile)) perFile[f] += overhead;
  merge(major, perFile, `${logPath.split(/[\\/]/).pop()}: a run log (tests' own durations + ${sec(overhead)} s per file, `
    + `an equal share of the wall time's remainder: (${sec(wall)} - ${sec(testMs)}) s / ${ran.size} files)`);
  write();
} else if (predict) {
  const files = planned.map((f) => ({ name: f, bytes: statSync(join("test", f)).size }));
  const times = specTimes(table);
  const majors = [...new Set(Object.values(table.files).flatMap((p) => Object.keys(p)))].sort();
  const timeIn = (major) => (name) => {
    const p = table.files[name];
    return p && p[major] != null ? p[major] : (times[name] != null ? times[name] : 0);
  };
  for (const n of predict.split(",").map(Number)) {
    const plan = planShards(files, times, n);
    if (plan.estimated.length) console.log(`  (weighed by size, not in the table: ${plan.estimated.join(", ")})`);
    for (const [label, bins] of [["time-balanced", plan.bins], ["byte slices (before)", byteShards(files, n)]]) {
      for (const major of majors) {
        const t = binTimes(bins, timeIn(major));
        const total = t.reduce((a, b) => a + b, 0);
        console.log(`n=${n} ${label}, Zotero ${major}: ` + t.map((x, i) => `${i + 1}/${n} ${sec(x)} s (${bins[i].length} files)`).join(", ")
          + `; ${t.map(sec).join(" + ")} = ${sec(total)} s; longest part ${sec(Math.max(...t))} s vs total/${n} = ${sec(total / n)} s`);
      }
    }
  }
} else {
  console.log("usage: node scripts/spec-times.mjs --json <file> | --log <file> --zotero <major> [--wall-ms <ms>] | --predict 2,3 [--dry]");
  process.exit(2);
}
