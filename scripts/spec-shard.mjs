// Shard planning for the spec suite: WV_TEST_SHARD=k/n (zotero-plugin.config.ts)
// runs the k-th of n parts whose predicted RUN TIMES are balanced, from the
// committed timing table test/spec-times.json (scripts/spec-times.mjs writes
// it). Pure functions, no I/O: the config, scripts/spec-times.mjs and
// test/unit/spec-shard.unit.ts share them.
//
// Until 2026-11-20 the parts were contiguous slices of equal FILE BYTES: the
// heavy split-view and reader-leak specs sat together at the end of the name
// order, so shard 1/2 ran ~7 min on CI and shard 2/2 ~23 min (test.yml run
// 44546104702) -- the run waited on the second half.

/** WV_TEST_SHARD "k/n" -> { k, n }; throws on anything else. */
export function parseShard(spec) {
  const m = /^(\d+)\/(\d+)$/.exec(String(spec));
  if (!m) throw new Error("WV_TEST_SHARD must read k/n, got " + spec);
  const k = Number(m[1]), n = Number(m[2]);
  if (!(n >= 1 && k >= 1 && k <= n)) throw new Error("WV_TEST_SHARD out of range: " + spec);
  return { k, n };
}

/** The table's one time per file, in ms: the mean of the Zotero majors
 *  measured for it (CI runs the same parts on Zotero's release and beta, so
 *  one plan serves both). `table.files` maps a spec file name to
 *  `{ "<major>": ms, ... }`. A malformed table gives {}. */
export function specTimes(table) {
  const out = {};
  const files = table && typeof table === "object" ? table.files : null;
  if (!files || typeof files !== "object") return out;
  for (const [name, per] of Object.entries(files)) {
    const v = Object.values(per || {}).filter((x) => typeof x === "number" && x >= 0);
    if (v.length) out[name] = v.reduce((a, b) => a + b, 0) / v.length;
  }
  return out;
}

/** Each file's weight: its table time, or -- for a file the table does not
 *  have yet (a new spec) -- its size at the table's average ms per byte. */
export function weights(files, times) {
  let ms = 0, bytes = 0;
  for (const f of files) if (times[f.name] != null) { ms += times[f.name]; bytes += f.bytes; }
  const msPerByte = bytes > 0 ? ms / bytes : 1;
  const estimated = [];
  const w = new Map();
  for (const f of files) {
    if (times[f.name] != null) w.set(f.name, times[f.name]);
    else { w.set(f.name, f.bytes * msPerByte); estimated.push(f.name); }
  }
  return { w, msPerByte, estimated };
}

/** n parts by longest-processing-time-first packing: the files by weight,
 *  heaviest first (ties by name), each into the part with the least load so
 *  far (ties: the lowest part). Deterministic for a given table and file set.
 *  Each part's files are returned in name order -- the order a run takes them
 *  (the zz-/zzz- files still run last in their part).
 *  `files`: [{ name, bytes }] -- the 000- files left out by the caller. */
export function planShards(files, times, n) {
  const { w, msPerByte, estimated } = weights(files, times);
  const order = [...files].sort((a, b) => (w.get(b.name) - w.get(a.name)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const bins = Array.from({ length: n }, () => []);
  const loads = new Array(n).fill(0);
  for (const f of order) {
    let best = 0;
    for (let i = 1; i < n; i++) if (loads[i] < loads[best]) best = i;
    bins[best].push(f.name);
    loads[best] += w.get(f.name);
  }
  for (const b of bins) b.sort();
  return { bins, loads, msPerByte, estimated };
}

/** The former split (before 2026-11-20), kept to compare: contiguous slices
 *  of the name order, a file going to the slice its middle byte falls in. */
export function byteShards(files, n) {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const total = sorted.reduce((a, f) => a + f.bytes, 0);
  const bins = Array.from({ length: n }, () => []);
  let acc = 0;
  for (const f of sorted) {
    const slice = Math.min(n - 1, Math.floor((acc + f.bytes / 2) / (total / n)));
    acc += f.bytes;
    bins[slice].push(f.name);
  }
  return bins;
}

/** Predicted time of each part, in ms, for one set of per-file times. */
export function binTimes(bins, timeOf) {
  return bins.map((b) => b.reduce((a, name) => a + timeOf(name), 0));
}

// ---- from a run to the table ------------------------------------------------

const unescapeJs = (s) => s
  .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\(["'`\\])/g, "$1");

/** Top-level describe titles of each spec text: `describe("...", ...)` at the
 *  start of a line (no indent), any quote. `texts`: Map(file name -> source).
 *  Returns Map(title -> file name); a title in two files maps to the first. */
export function titleIndex(texts) {
  const idx = new Map();
  const re = /^describe(?:\.skip|\.only)?\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/gm;
  for (const [file, text] of texts) {
    for (const m of text.matchAll(re)) {
      const t = unescapeJs(m[2]);
      if (!idx.has(t)) idx.set(t, file);
    }
  }
  return idx;
}

/** The spec file a top-level suite title comes from: an exact top-level
 *  title, else the one file whose source holds the title, else the one file
 *  holding its longest leading part (whole words, 20 characters at least --
 *  a title built from a template or a constant). Null when unclear. */
export function fileOfTitle(title, idx, texts) {
  if (idx.has(title)) return idx.get(title);
  const holders = (s) => [...texts].filter(([, text]) => text.includes(s)).map(([f]) => f);
  let h = holders(title);
  if (h.length === 1) return h[0];
  const words = title.split(" ");
  for (let n = words.length - 1; n > 0; n--) {
    const head = words.slice(0, n).join(" ");
    if (head.length < 20) break;
    h = holders(head);
    if (h.length === 1) return h[0];
    if (h.length > 1) return null;
  }
  return null;
}

/** A scaffold run log's top-level suites, in run order: the "→" headers at
 *  three spaces, with the summed durations ("... 123ms") and count of the
 *  tests printed under each (nested suites included). */
export function parseRunLog(text) {
  const suites = [];
  let cur = null;
  let lines = text.split(/\r?\n/);
  // The build's own "→" steps come first: start after the add-on installs.
  let start = -1;
  lines.forEach((l, i) => { if (/as a temporary add-on/.test(l)) start = i; });
  lines = lines.slice(start + 1);
  for (const line of lines) {
    const h = /^ {3}→ (.+?)\s*$/.exec(line);
    if (h) { cur = { title: h[1], testMs: 0, tests: 0 }; suites.push(cur); continue; }
    const t = /[✔✖] .+? (\d+)ms\s*$/.exec(line);
    if (t && cur) { cur.testMs += Number(t[1]); cur.tests++; }
  }
  return suites;
}
