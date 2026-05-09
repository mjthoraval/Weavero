// Refuse to proceed if package.json and src/manifest.json
// disagree about the plugin's version. Run as `npm run
// check-versions` — also wired as `prerelease` so
// `npm run release` aborts before tagging if a previous bump
// only touched one of the two files.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(
    readFileSync(resolve(root, "src/manifest.json"), "utf8"));

if (pkg.version !== manifest.version) {
    process.stderr.write(
        `version mismatch:\n`
        + `  package.json       = ${pkg.version}\n`
        + `  src/manifest.json  = ${manifest.version}\n`
        + `\nBoth must be bumped together — see\n`
        + `  zotero-plugin.config.ts → release.bumpp.files\n`);
    process.exit(1);
}

console.log(`versions in sync: ${pkg.version}`);
