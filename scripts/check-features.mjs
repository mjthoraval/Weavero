// The feature registry's guard: src/features.ts against the code, without Zotero.
//
//   npm run check:features            (node --import tsx scripts/check-features.mjs)
//
// Fails (exit 1) when
//   - a pref of the prefs table (prefs-table.ts) belongs to no feature, or to two;
//   - Settings binds a pref (prefs.html `preference=`, src/prefs/index.ts) the
//     table does not declare;
//   - a `weavero.*` key used in src/ is in neither the table nor UNTABLED below;
//   - a feature names a docs page, spec, source file, wiring id or README name
//     that does not exist, or a group, surface or status that is not declared;
// and prints a summary: features per group, the fields still unknown, the
// untabled keys, what README and the registry disagree on, and what no feature
// claims (wiring ids, specs, source files).
//
// The rules themselves are in check-features-lib.mjs (test/unit/features.unit.ts).
// prebuild runs this after the typecheck; `npm run test:unit` runs it too (CI).

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkFeatures, readmeNames } from "./check-features-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The `weavero.*` keys the code uses that the prefs table does not declare,
 * each with its reason. Declaring them in the table is NOT neutral: the table
 * registers a default for every row (Zotero.Prefs.get answers it instead of
 * undefined), a backup restore keeps or clears a key by whether it has a
 * default (backups.ts wvBkPrefsApply), and test/prefs-observer.spec.js fires
 * every boolean row. So they stay out of the table until a stage that may
 * change behaviour (and runs Zotero) moves them in. A key ending in "*" is a
 * family read as a prefix ("weavero.readerBmSort." + scope).
 *   kind: state (written by its feature's own UI), dev (a developer switch),
 *   hidden (a behaviour switch in about:config only), tuning (a hidden value),
 *   migration (a one-time flag), legacy (an old key read once to carry a choice
 *   over), file (not a pref: a file name).
 */
export const UNTABLED = {
  // state: written by the feature's own UI, read back by it
  "tabGroups": { feature: "tab-groups", kind: "state", why: "the saved tab groups (JSON), written by the groups themselves" },
  "tabSplits": { feature: "split-view", kind: "state", why: "the open split views (JSON), restored after a restart" },
  "pinnedTabs": { feature: "pinned-tabs", kind: "state", why: "the pinned tabs, restored after a restart" },
  "pinnedTabNames": { feature: "pinned-tabs", kind: "state", why: "the pinned tabs that show their name (Show Tab Name)" },
  "tabsMenuGroupByLibrary": { feature: "tabs-menu", kind: "state", why: "the tabs popup's gear toggle Sort by Library" },
  "tabsMenuShowAnnotationCount": { feature: "tabs-menu", kind: "state", why: "the tabs popup's gear toggle Show Annotations Count" },
  "windowTitles": { feature: "window-identity", kind: "state", why: "the custom window names (legacy by-position store, migrated per window)" },
  "nextWindowId": { feature: "multiple-main-windows", kind: "state", why: "the counter behind each window's stable id" },
  "windowState": { feature: "zotero-own-windows", kind: "state", why: "Weavero's state of a window on a Zotero with its own windows (lib/windows.ts)" },
  "advSearchWindowSize": { feature: "advsearch-new-window", kind: "state", why: "the Advanced Search window's size the user gave it" },
  "advSearchWindowOuter": { feature: "advsearch-new-window", kind: "state", why: "the Advanced Search window's outer size" },
  "readerItemPaneWidth": { feature: "reader-window-item-pane", kind: "state", why: "the reader window item pane's width, remembered" },
  "readerBmTabs": { feature: "document-bookmarks", kind: "state", why: "the Bookmarks tab's scope per tab (JSON)" },
  "readerBmScope": { feature: "document-bookmarks", kind: "state", why: "the Bookmarks tab's scope (this document / library)" },
  "readerBmSort.*": { feature: "document-bookmarks", kind: "state", why: "the Bookmarks tab's sort, one key per section" },
  "showContextAttachmentRows": { feature: "items-filter", kind: "state", why: "the filter popup's own checkbox for context attachment rows" },
  "itemTypeFilterMRU": { feature: "items-filter", kind: "state", why: "the item types picked last in the filter popup" },
  "pluginsRecentUpdatesDays": { feature: "plugins-manager-extras", kind: "state", why: "Recent Updates' time-frame dropdown, remembered" },
  "appLinkHandlersSkipped": { feature: "app-links", kind: "state", why: "the schemes whose handler Weavero set to don't-ask, so only those are given back" },
  "_prefsCollapsed": { feature: "core", kind: "state", why: "the Settings pane's collapsed blocks" },
  "_reopenOnInit": { feature: "core", kind: "state", why: "a reload reopens Settings on Weavero's pane (set by destroy(), cleared by init)" },
  // dev: developer switches, off unless set by hand
  "devBootTrace": { feature: "core", kind: "dev", why: "boot trace of tabs and groups, opt-in" },
  "devOutlineEval": { feature: "outline-eval", kind: "dev", why: "the outline evaluation tool, opt-in" },
  "filterTrace": { feature: "items-filter", kind: "dev", why: "the filter's trace file (on unless set to false; docs/filter-rules.md)" },
  // hidden: a behaviour switch in about:config only
  "tooltipPersist": { feature: "comment-links", kind: "hidden", why: "a link's tip stays up while the pointer stays on the link (off when unset)" },
  // tuning: hidden values, read with their default in the code
  "previewEvictionMax": { feature: "comment-links", kind: "tuning", why: "the reader sidebar's rendered comment previews kept (400 when unset)" },
  "outlineDefaultSource": { feature: "reader-outline", kind: "tuning", why: "which outline source a document starts on (hidden)" },
  "referencesBuildStructureSkipGroups": { feature: "structure-build", kind: "tuning", why: "the build leaves group libraries out (sdt-build.ts WV_SB_SKIP_PREF)" },
  // migration: one-time flags
  "windowTitlesMigrated": { feature: "window-identity", kind: "migration", why: "the by-position window titles were moved to each window once" },
  "windowsTransferred": { feature: "zotero-own-windows", kind: "migration", why: "windows.json's time at the last transfer to Zotero's own windows" },
  "defaultChildMigrated": { feature: "default-attachment", kind: "migration", why: "the PikaPei import question was answered (README tells users to reset it)" },
  "defaultChildLegacyPending": { feature: "default-attachment", kind: "migration", why: "a PikaPei import notice waits to be shown" },
  "defaultChildLegacyChoice": { feature: "default-attachment", kind: "migration", why: "the user's answer to the PikaPei import question" },
  // legacy: an old key, read once to carry the choice over, then cleared
  "enablePdfReader": { feature: "comment-links", kind: "legacy", why: "the old name of the reader surfaces' switch (index.ts migration)" },
  "showNativeAnnSelector": { feature: "annotation-selector-handle", kind: "legacy", why: "the old, inverted name of hideNativeAnnSelector (v0.20.1)" },
  "readerAnnSort": { feature: "annotation-sort", kind: "legacy", why: "retired: cleared on the first store load (reader-panels.ts)" },
  // file: not a pref
  "ftl": { feature: "core", kind: "file", why: "weavero.ftl, the Fluent strings file" },
};

// ---- gathering -------------------------------------------------------------------

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const exists = (p) => existsSync(join(ROOT, p));
const posix = (p) => p.split(sep).join("/");

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** Keys after `weavero.` in quoted literals, comment lines left out: a literal
 *  that goes on with `+` or `${` is a family (its prefix). Also the pref-name
 *  constants (`const WV_SB_SKIP_PREF = "referencesBuildStructureSkipGroups"`),
 *  whose literal may carry no `weavero.`. Keys read through a variable built
 *  otherwise (index.ts's rename list) are beyond this scan. */
export function scanKeys(text, file, keys, families, wvPref) {
  const add = (m, k, f) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(f); };
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
    for (const m of line.matchAll(/(["'`])(?:extensions\.zotero\.)?weavero\.([A-Za-z_][\w.]*)(["'`]\s*\+|\$\{|["'`])/g)) {
      const key = m[2];
      if (/\+|\$\{/.test(m[3]) || key.endsWith(".")) add(families, key, file);
      else add(keys, key, file);
    }
    for (const m of line.matchAll(/\b[A-Z][A-Z0-9_]*_PREF(?:_[A-Z0-9_]+)?\s*=\s*["']([A-Za-z_][\w]*)["']/g)) add(keys, m[1], file);
    if (wvPref) for (const m of line.matchAll(/_wvPref(?:Default)?\(\s*["']([\w.]+)["']\s*\)/g)) add(wvPref, m[1], file);
  }
}

export async function gather() {
  // The tables are plain data, but their modules declare Zotero globals: give
  // them empty ones for the import (nothing runs at import time).
  const g = globalThis;
  const had = { Zotero: "Zotero" in g, Services: "Services" in g };
  if (!had.Zotero) g.Zotero = {};
  if (!had.Services) g.Services = {};
  const url = (p) => pathToFileURL(join(ROOT, p)).href;
  let table, wiring, registry;
  try {
    table = await import(url("src/modules/prefs-table.ts"));
    wiring = await import(url("src/modules/window-wiring.ts"));
    registry = await import(url("src/features.ts"));
  } finally {
    if (!had.Zotero) delete g.Zotero;
    if (!had.Services) delete g.Services;
  }

  const srcFiles = walk(join(ROOT, "src")).map((p) => posix(relative(ROOT, p)));
  const codeKeys = new Map(), codeFamilies = new Map(), wvPrefKeys = new Map();
  for (const f of srcFiles) {
    if (!/\.(ts|js|mjs)$/.test(f) || f === "src/features.ts") continue;
    scanKeys(read(f), f, codeKeys, codeFamilies, wvPrefKeys);
  }

  // Settings: the native bindings, and the keys the pane's script binds itself.
  const settingsKeys = new Set(), settingsFamilies = new Set();
  const html = read("src/prefs.html").replace(/<!--[\s\S]*?-->/g, "");
  for (const m of html.matchAll(/preference="extensions\.zotero\.weavero\.([\w.]+)"/g)) settingsKeys.add(m[1]);
  const paneKeys = new Map(), paneFamilies = new Map();
  scanKeys(read("src/prefs/index.ts"), "src/prefs/index.ts", paneKeys, paneFamilies, null);
  for (const k of paneKeys.keys()) if (k !== "ftl") settingsKeys.add(k);
  for (const k of paneFamilies.keys()) settingsFamilies.add(k);
  for (const m of read("src/prefs/index.ts").matchAll(/\bprefOn\(\s*["']([\w.]+)["']/g)) settingsKeys.add(m[1]);

  const specs = readdirSync(join(ROOT, "test")).filter((f) => /\.spec\.js$/.test(f) && !f.startsWith("000-")).sort();
  const modules = srcFiles.filter((f) => /\.(ts|js)$/.test(f) && f !== "src/features.ts").map((f) => f.slice(4)).sort();
  return {
    registry: {
      features: registry.WV_FEATURES,
      groups: registry.WV_TASK_GROUPS,
      surfaces: registry.WV_SURFACES,
      sectionMasters: registry.WV_SECTION_MASTERS,
    },
    untabled: UNTABLED,
    prefs: table.WV_PREFS,
    prefValues: table.WV_PREF_VALUES,
    wires: wiring.WV_MAIN_WIRES.map((w) => w.id).concat(wiring.WV_READER_WIRES.map((w) => "reader:" + w.id)),
    settingsKeys: [...settingsKeys].sort(),
    settingsFamilies: [...settingsFamilies].sort(),
    codeKeys, codeFamilies, wvPrefKeys,
    exists,
    readme: readmeNames(read("README.md")),
    specs, modules,
  };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const { errors, notes } = checkFeatures(await gather());
  for (const n of notes) console.log("[features] " + n);
  for (const e of errors) console.error("[features] ERROR " + e);
  console.log(`[features] ${errors.length ? errors.length + " error(s)" : "ok"}`);
  process.exit(errors.length ? 1 : 0);
}
