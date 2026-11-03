// Switch a published release on: write the update manifests for the XPI
// that IS on the release, so Zotero's auto-update offers it (the 2026-11-03
// study, recommendation 6, "stage, then flip" -- Zotero's own
// build_for_deploy uploads without making a build live, a separate deploy
// step does). release.yml publishes with the manifests left alone; once the
// published XPI has been installed and checked, flip.yml runs this.
//
// usage: node ci/flip-manifest.mjs <xpi> <manifest.json of that xpi> <tag> <out dir>
// Writes <out>/update-beta.json always and <out>/update.json for a release
// (a version without "-"), in the scaffold's format (scaffold-src-*.mjs
// buildUpdateJson): one entry, the XPI's sha512, the manifest's Zotero
// range. A beta therefore never reaches update.json; a release reaches
// both, which brings beta testers back to it.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [xpi, manifestPath, tag, out] = process.argv.slice(2);
if (!xpi || !manifestPath || !tag || !out) {
    console.error("usage: node ci/flip-manifest.mjs <xpi> <manifest.json> <tag> <out dir>");
    process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = manifest.version;
if ("v" + version !== tag) {
    console.error("the XPI is " + version + ", the tag " + tag + ": refusing");
    process.exit(1);
}
const z = (manifest.applications && manifest.applications.zotero) || {};
const hash = "sha512:" + crypto.createHash("sha512").update(fs.readFileSync(xpi)).digest("hex");
const repo = process.env.GITHUB_REPOSITORY || "mjthoraval/Weavero";
const entry = {
    version,
    update_link: "https://github.com/" + repo + "/releases/download/" + tag + "/" + path.basename(xpi),
    update_hash: hash,
    applications: { zotero: { ...(z.strict_min_version && { strict_min_version: z.strict_min_version }), ...(z.strict_max_version && { strict_max_version: z.strict_max_version }) } },
};
const data = { addons: { [z.id || "weavero@mjthoraval"]: { updates: [entry] } } };
fs.mkdirSync(out, { recursive: true });
const write = (name) => { fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 2) + "\n"); console.log(name + ": " + version + " " + hash.slice(0, 20) + "..."); };
write("update-beta.json");
if (!version.includes("-")) write("update.json");
