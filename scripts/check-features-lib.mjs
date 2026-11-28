// The decision part of scripts/check-features.mjs, free of I/O so that
// test/unit/features.unit.ts runs it on fixtures. check-features.mjs reads the
// registry (src/features.ts), the prefs table, the wiring tables, Settings, the
// source and README, and prints what `checkFeatures` returns.

/** A registry pref entry that ends in ".*" names a family of table keys. */
const isFamily = (p) => p.endsWith(".*");
const familyHas = (p, key) => key.startsWith(p.slice(0, -1));

const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** README names as the registry spells them: bold text loses a trailing "." or
 *  ":", HTML entities are read. */
export function readmeNorm(s) {
  return String(s).replace(/&amp;/g, "&").replace(/[.:]\s*$/, "").trim();
}

/** README.md -> { names: every name a feature may claim, features: the names
 *  of the "## Features" section (bold text opening a bullet or a paragraph,
 *  #### headings), groups: its <summary> group names }. `###` headings anywhere
 *  may be claimed too (Backups lives under Configure). */
export function readmeNames(text) {
  const s = String(text).replace(/\r\n/g, "\n");
  const names = new Set(), features = [], groups = [];
  const a = s.indexOf("\n## Features\n"), b = s.indexOf("\n## Install\n");
  if (a >= 0) {
    for (const ln of s.slice(a, b > a ? b : undefined).split("\n")) {
      let m;
      if ((m = /^<summary><b>(.+?)<\/b>/.exec(ln))) { const n = readmeNorm(m[1]); groups.push(n); names.add(n); continue; }
      if ((m = /^(?:- )?\*\*(.+?)\*\*/.exec(ln) || /^#### (.+)$/.exec(ln))) {
        const raw = m[1].trim();
        const n = readmeNorm(raw);
        names.add(n);
        if (!/:$/.test(raw)) features.push(n);   // "Group-library visuals:" introduces a list
      }
    }
  }
  for (const m of s.matchAll(/^### (.+)$/gm)) names.add(readmeNorm(m[1]));
  return { names, features: [...new Set(features)], groups };
}

/**
 * input: {
 *   registry: { features, groups, surfaces, sectionMasters }   src/features.ts
 *   untabled: { key: { feature: id | null, why } }              keys used in code, not in the table
 *   prefs: { key: row }                                         WV_PREFS
 *   prefValues: { key: value }                                  WV_PREF_VALUES
 *   wires: string[]                                             main ids, then "reader:<id>"
 *   settingsKeys: string[], settingsFamilies: string[]          what Settings binds
 *   codeKeys: Map(key -> Set(file)), codeFamilies: Map(prefix -> Set(file))
 *   wvPrefKeys: Map(key -> Set(file))                           _wvPref("key") calls
 *   exists: (repoPath) => boolean
 *   readme: readmeNames(...) result
 *   specs: string[] (test/*.spec.js names), modules: string[] (src-relative)
 * }
 * returns { errors: string[], notes: string[] }
 */
export function checkFeatures(input) {
  const { registry, untabled, prefs, prefValues, wires, settingsKeys, settingsFamilies, codeKeys, codeFamilies,
    wvPrefKeys, exists, readme, specs, modules } = input;
  const { features, groups, surfaces, sectionMasters } = registry;
  const errors = [], notes = [];
  const err = (m) => errors.push(m);
  const tableKeys = [...Object.keys(prefs), ...Object.keys(prefValues)];
  const inTable = (k) => Object.prototype.hasOwnProperty.call(prefs, k) || Object.prototype.hasOwnProperty.call(prefValues, k);
  const byId = new Map();

  // ---- each feature's own fields
  for (const f of features) {
    const at = `feature "${f.id}"`;
    if (!ID_RE.test(f.id || "")) err(`${at}: an id is lower-case words joined by "-"`);
    if (byId.has(f.id)) err(`${at}: two features have this id`);
    byId.set(f.id, f);
    if (!f.name) err(`${at}: no name`);
    if (!Object.prototype.hasOwnProperty.call(groups, f.group)) err(`${at}: group "${f.group}" is not one of WV_TASK_GROUPS`);
    if (!Array.isArray(f.surfaces) || !f.surfaces.length) err(`${at}: no surface`);
    for (const s of f.surfaces || []) if (!surfaces.includes(s)) err(`${at}: surface "${s}" is not one of WV_SURFACES`);
    if (!["stable", "trial", "deprecated"].includes(f.status)) err(`${at}: status "${f.status}"`);
    if (f.master == null && !f.noSwitch && !f.partOf) err(`${at}: no master pref, and no noSwitch reason or partOf`);
    for (const m of f.modules || []) if (!exists("src/" + m)) err(`${at}: module src/${m} does not exist`);
    if (!(f.modules || []).length) err(`${at}: no module`);
    if (f.docs != null && !exists("docs/" + f.docs)) err(`${at}: docs page docs/${f.docs} does not exist`);
    for (const s of f.specs || []) if (!exists("test/" + s)) err(`${at}: spec test/${s} does not exist`);
    for (const w of f.wiring || []) if (!wires.includes(w)) err(`${at}: wiring id "${w}" is in neither WV_MAIN_WIRES nor WV_READER_WIRES ("reader:<id>")`);
    for (const n of f.readme || []) if (!readme.names.has(readmeNorm(n))) err(`${at}: README has no feature named "${n}"`);
  }
  for (const f of features) {
    if (f.partOf != null && !byId.has(f.partOf)) err(`feature "${f.id}": partOf "${f.partOf}" is no feature`);
  }

  // ---- prefs: every table key belongs to exactly one feature, or is a section master
  const owners = new Map();   // table key -> [feature id]
  for (const k of tableKeys) owners.set(k, []);
  for (const f of features) {
    const own = (f.master != null ? [f.master] : []).concat(f.prefs || []);
    for (const p of own) {
      const hits = isFamily(p) ? tableKeys.filter((k) => familyHas(p, k)) : inTable(p) ? [p] : [];
      if (!hits.length) err(`feature "${f.id}": pref "${p}" is not in the prefs table (prefs-table.ts)`);
      for (const k of hits) owners.get(k).push(f.id);
    }
  }
  for (const k of Object.keys(sectionMasters)) {
    if (!inTable(k)) err(`section master "${k}" is not in the prefs table`);
    else if (owners.get(k).length) err(`section master "${k}" is also a pref of feature ${owners.get(k).join(", ")}`);
  }
  for (const [k, ids] of owners) {
    if (Object.prototype.hasOwnProperty.call(sectionMasters, k)) continue;
    if (!ids.length) err(`pref "${k}" (prefs-table.ts) belongs to no feature: add it to a feature's master or prefs in src/features.ts`);
    else if (ids.length > 1) err(`pref "${k}" belongs to ${ids.length} features (${ids.join(", ")}): one only`);
  }
  // A devOnly row is a feature in trial, and a trial feature has one.
  for (const f of features) {
    const own = (f.master != null ? [f.master] : []).concat(f.prefs || []).filter((p) => !isFamily(p));
    const dev = own.some((p) => prefs[p] && prefs[p].devOnly);
    const parent = f.partOf ? byId.get(f.partOf) : null;
    if (dev && f.status !== "trial") err(`feature "${f.id}": a devOnly pref makes it status "trial"`);
    if (f.status === "trial" && !dev && !(parent && parent.status === "trial")) err(`feature "${f.id}": status "trial" without a devOnly pref (or a partOf in trial)`);
  }

  // ---- Settings rows
  for (const k of settingsKeys) {
    if (!inTable(k) && !Object.prototype.hasOwnProperty.call(untabled, k)) err(`Settings binds "${k}", which the prefs table does not declare`);
  }
  for (const p of settingsFamilies) {
    if (!tableKeys.some((k) => k.startsWith(p))) err(`Settings binds the family "${p}*", which matches no key of the prefs table`);
  }

  // ---- weavero.* keys used in the code
  const untabledUsed = new Set();
  for (const [k, files] of codeKeys) {
    if (inTable(k)) continue;
    if (Object.prototype.hasOwnProperty.call(untabled, k)) { untabledUsed.add(k); continue; }
    err(`"weavero.${k}" is used in ${[...files].join(", ")} and declared nowhere: add it to the prefs table, or to UNTABLED in scripts/check-features.mjs with the reason`);
  }
  for (const [p, files] of codeFamilies) {
    if (tableKeys.some((k) => k.startsWith(p))) continue;
    if (Object.prototype.hasOwnProperty.call(untabled, p + "*")) { untabledUsed.add(p + "*"); continue; }
    err(`the family "weavero.${p}*" is used in ${[...files].join(", ")} and matches no key of the prefs table: declare it, or add "${p}*" to UNTABLED`);
  }
  for (const k of Object.keys(untabled)) {
    const e = untabled[k];
    if (!untabledUsed.has(k)) err(`UNTABLED "${k}" is no longer used in src/ (or is in the table now): remove it`);
    if (!e || !e.why) err(`UNTABLED "${k}": no reason`);
    if (e && e.feature != null && !byId.has(e.feature)) err(`UNTABLED "${k}": feature "${e.feature}" is no feature`);
  }
  for (const [k, files] of wvPrefKeys) {
    if (!Object.prototype.hasOwnProperty.call(prefs, k)) err(`_wvPref("${k}") in ${[...files].join(", ")}: no WV_PREFS row (it would answer false)`);
  }

  // ---- notes: the summary
  const perGroup = Object.keys(groups).map((g) => `${groups[g]} ${features.filter((f) => f.group === g).length}`);
  notes.push(`${features.length} features: ${perGroup.join(", ")}`);
  const kinds = {};
  for (const f of features) kinds[f.kind || "feature"] = (kinds[f.kind || "feature"] || 0) + 1;
  notes.push(`kinds: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(", ")}; status: ${["stable", "trial", "deprecated"].map((s) => `${s} ${features.filter((f) => f.status === s).length}`).join(", ")}`);
  notes.push(`prefs: ${tableKeys.length} in the table (${Object.keys(prefs).length} boolean + ${Object.keys(prefValues).length} values), ${Object.keys(sectionMasters).length} of them section masters; ${settingsKeys.length} keys + ${settingsFamilies.length} families bound by Settings`);
  const noDocs = features.filter((f) => f.docs == null).map((f) => f.id);
  const noSpecs = features.filter((f) => !(f.specs || []).length).map((f) => f.id);
  const noGrad = features.filter((f) => f.status === "trial" && f.graduation == null).map((f) => f.id);
  const noSwitchTodo = features.filter((f) => f.master == null && /TODO/.test(f.noSwitch || "")).map((f) => f.id);
  notes.push(`fields empty or unknown: ${noDocs.length + noSpecs.length + noGrad.length + noSwitchTodo.length} -- no docs page ${noDocs.length}, no spec ${noSpecs.length}, trial graduation date ${noGrad.length}, switch reason (TODO) ${noSwitchTodo.length}`);
  if (noDocs.length) notes.push(`  no docs page: ${noDocs.join(", ")}`);
  if (noSpecs.length) notes.push(`  no spec: ${noSpecs.join(", ")}`);
  if (noGrad.length) notes.push(`  trial without a graduation date: ${noGrad.join(", ")}`);
  if (noSwitchTodo.length) notes.push(`  switch reason to find: ${noSwitchTodo.join(", ")}`);
  const byWhy = {};
  for (const [k, e] of Object.entries(untabled)) (byWhy[e.kind || "other"] = byWhy[e.kind || "other"] || []).push(k);
  notes.push(`untabled keys (used in code, not in the table, allowed with a reason): ${Object.keys(untabled).length} -- ${Object.entries(byWhy).map(([w, ks]) => `${w} ${ks.length}`).join(", ")}`);
  for (const [w, ks] of Object.entries(byWhy)) notes.push(`  ${w}: ${ks.join(", ")}`);

  // README
  const claimed = new Set(features.flatMap((f) => (f.readme || []).map(readmeNorm)));
  const unclaimed = readme.features.filter((n) => !claimed.has(n));
  notes.push(`README: ${readme.features.length} feature names, ${unclaimed.length} claimed by no feature${unclaimed.length ? ": " + unclaimed.map((n) => JSON.stringify(n)).join(", ") : ""}`);
  const notInReadme = features.filter((f) => f.kind !== "infrastructure" && !(f.readme || []).length).map((f) => f.id);
  notes.push(`  features README does not describe: ${notInReadme.length}${notInReadme.length ? " -- " + notInReadme.join(", ") : ""}`);
  notes.push(`  README groups (${readme.groups.length}): ${readme.groups.join(", ")} / registry groups (${Object.keys(groups).length}): ${Object.values(groups).join(", ")}`);

  // Coverage: what no feature claims (information for S3, not an error).
  const wired = new Set(features.flatMap((f) => f.wiring || []));
  const freeWires = wires.filter((w) => !wired.has(w));
  notes.push(`wiring ids claimed by no feature: ${freeWires.length} of ${wires.length}${freeWires.length ? " -- " + freeWires.join(", ") : ""}`);
  const specd = new Set(features.flatMap((f) => f.specs || []));
  const freeSpecs = specs.filter((s) => !specd.has(s));
  notes.push(`spec files claimed by no feature: ${freeSpecs.length} of ${specs.length}${freeSpecs.length ? " -- " + freeSpecs.join(", ") : ""}`);
  const owned = new Set(features.flatMap((f) => f.modules || []));
  const freeMods = modules.filter((m) => !owned.has(m));
  notes.push(`source files claimed by no feature: ${freeMods.length} of ${modules.length}${freeMods.length ? " -- " + freeMods.join(", ") : ""}`);
  return { errors, notes };
}
