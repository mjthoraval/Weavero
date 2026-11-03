// CI preparation: no download a run does not need (the 2026-11-03 study,
// work/zotero-release-ci-study-2026-11-03.md, recommendation 2). Run after
// `npm ci`, before any scaffold command.
//
// 1. The scaffold's update notifier (tiny-update-notifier, called from
//    cli.js with a `.catch()` that has no handler) fetches the npm registry
//    once a day; a rate-limited answer ("error code: 1015", not JSON)
//    crashed a Test job before its build (run 41642559949, attempt 1). The
//    notifier skips the fetch while its timestamp file is under a day old:
//    write one now, at the path it reads (tiny-update-notifier/dist/
//    index.mjs: %LOCALAPPDATA%\tiny-update-notifier\Cache, ~/Library/Caches/
//    tiny-update-notifier, $XDG_CACHE_HOME or ~/.cache/tiny-update-notifier).
// 2. The test runner downloads chai.js from chaijs.com on every run when its
//    cache has none, without checking the HTTP status (scaffold-src-*.mjs,
//    copyTestLibraries / saveResource). Put the pinned copy (ci/chai.js,
//    chai 4.3.8, MIT, the one local runs use) where the runner looks first:
//    .scaffold/cache/chai.js.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The repository root, whatever the working directory.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = os.homedir();
const notifierDir = process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "tiny-update-notifier", "Cache")
    : process.platform === "darwin"
        ? path.join(home, "Library", "Caches", "tiny-update-notifier")
        : path.join(process.env.XDG_CACHE_HOME || path.join(home, ".cache"), "tiny-update-notifier");
fs.mkdirSync(notifierDir, { recursive: true });
const stamp = path.join(notifierDir, "zotero-plugin-scaffold");
fs.writeFileSync(stamp, String(Date.now()), "utf8");
console.log("update notifier: stamp written, no fetch today -- " + stamp);

const cacheDir = path.join(root, ".scaffold", "cache");
fs.mkdirSync(cacheDir, { recursive: true });
fs.copyFileSync(path.join(root, "ci", "chai.js"), path.join(cacheDir, "chai.js"));
console.log("chai.js: pinned copy in " + cacheDir + " (" + fs.statSync(path.join(root, "ci", "chai.js")).size + " bytes)");
