#!/usr/bin/env node
// @ts-nocheck — Node-side launcher; the project tsconfig has no Node types
// (everything else in test/ runs inside Zotero).
// Plugin-compat tier launcher (TESTING.md roadmap #6).
//
// The compat spec (test/plugin-compat.spec.js) is staged with the core
// suite but SELF-SKIPS unless WV_COMPAT_TIER=1 — the core run stays
// hermetic (no companion plugins). This launcher:
//   1. verifies every vendored companion XPI against PINS.json (sha256),
//      so a silently-swapped binary can never enter the run,
//   2. exports the gate + the absolute XPI directory into the child env
//      (the spec runs inside Zotero from a resource:// bundle and cannot
//      derive repo paths itself),
//   3. runs the normal `npm test -- --exit-on-finish` pipeline.
//
// Deliberate consequence: the WHOLE suite runs with companions installed
// (there is no partial spec runner). That is a feature — it exercises
// every core spec under coexistence — but it means a compat-run failure
// in a CORE spec is a real coexistence finding, not flake.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pins = JSON.parse(readFileSync(path.join(here, "PINS.json"), "utf8"));

for (const [name, pin] of Object.entries(pins)) {
    const file = path.join(here, "xpi", pin.file);
    const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (digest !== pin.sha256) {
        console.error(`PIN MISMATCH for ${name}: ${pin.file}\n  expected ${pin.sha256}\n  actual   ${digest}`);
        process.exit(2);
    }
    console.log(`pinned ok: ${name} ${pin.version} (${pin.file})`);
}

// ---- Pin freshness (ADVISORY, never a failure) ----------------------------
// The asserts deliberately run against the PINNED versions — a compat claim
// is only meaningful for the version actually tested, and the run must not
// change meaning because a companion shipped overnight. But a stale pin is a
// stale claim, so the launcher SAYS so: best-effort GitHub query, skipped
// silently offline. Bumping a pin = download, update PINS.json (file,
// version, sha256), re-run, and only then commit — the new version becomes
// the tested truth.
async function checkFreshness() {
    for (const [name, pin] of Object.entries(pins)) {
        if (!pin.repo) continue;
        try {
            const res = await fetch(
                `https://api.github.com/repos/${pin.repo}/releases/latest`,
                { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const latest = String((await res.json()).tag_name || "").replace(/^v/, "");
            if (latest && latest !== pin.version) {
                console.warn(`⚠ PIN STALE: ${name} pinned ${pin.version}, latest release is ${latest} (${pin.source})`);
            }
            else if (latest) {
                console.log(`pin fresh: ${name} ${pin.version} is the latest release`);
            }
        }
        catch (e) {
            console.log(`pin freshness unknown for ${name} (offline?): ${e.message || e}`);
        }
    }
}
await checkFreshness();

// `npm run test:compat:check` — pins + freshness only, no suite boot.
if (process.argv.includes("--check") || process.env.WV_COMPAT_CHECK_ONLY === "1") {
    console.log("check-only mode: not launching the suite");
    process.exit(0);
}

const env = {
    ...process.env,
    WV_COMPAT_TIER: "1",
    WV_COMPAT_XPI_DIR: path.join(here, "xpi"),
};
const res = spawnSync("npm", ["test", "--", "--exit-on-finish"], {
    stdio: "inherit",
    env,
    shell: true,
    cwd: path.join(here, "..", ".."),
});
process.exit(res.status == null ? 1 : res.status);
