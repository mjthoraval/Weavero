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
const z = { ...((manifest.applications && manifest.applications.zotero) || {}) };
// MAX_VERSION (flip.yml's optional `max_version`): Zotero's way to declare a
// released version compatible with the next major once it is feature-frozen
// -- "If no changes are required, you can simply update strict_max_version in
// your plugin's update manifest without releasing a new version"
// (https://www.zotero.org/support/dev/zotero_11_for_developers, 2026-11-27).
// Only a raise, only the form Zotero asks for ("N.0.*", never higher):
// anything else is refused rather than written.
const maxOverride = (process.env.MAX_VERSION || "").trim();
if (maxOverride) {
    const major = (v) => parseInt(String(v || "0"), 10);
    if (!/^\d+\.0\.\*$/.test(maxOverride)) {
        console.error("max_version must read N.0.* (e.g. 11.0.*): " + maxOverride);
        process.exit(1);
    }
    if (z.strict_max_version && major(maxOverride) < major(z.strict_max_version)) {
        console.error("max_version " + maxOverride + " is lower than the XPI's " + z.strict_max_version + ": refusing");
        process.exit(1);
    }
    console.log("strict_max_version: " + (z.strict_max_version || "(none)") + " -> " + maxOverride + " (max_version)");
    z.strict_max_version = maxOverride;
}
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
