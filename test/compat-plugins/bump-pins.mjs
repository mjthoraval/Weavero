#!/usr/bin/env node
// @ts-nocheck — Node-side tool; the project tsconfig has no Node types.
// `npm run test:compat:bump`: move every pin in PINS.json to its repo's latest
// release -- download the release's XPI, replace the old one, record file,
// version, sha256 and source. MJT 2026-11-05: "Update all and keep updating them
// in the future". A release gate runs this first (the release skill), then
// `npm run test:compat`: a compat claim only counts for the version tested, so
// a new pin is committed once that run has been read, never before.
import { createHash } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pinsFile = path.join(here, "PINS.json");
const pins = JSON.parse(readFileSync(pinsFile, "utf8"));
let moved = 0, failed = 0;

for (const [name, pin] of Object.entries(pins)) {
    if (!pin.repo) continue;
    try {
        const res = await fetch(`https://api.github.com/repos/${pin.repo}/releases/latest`,
            { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error("GitHub answered " + res.status);
        const rel = await res.json();
        const version = String(rel.tag_name || "").replace(/^v/, "");
        if (!version) throw new Error("no tag on the latest release");
        if (version === pin.version) { console.log(`current: ${name} ${version}`); continue; }
        const xpis = (rel.assets || []).filter(a => a.name.endsWith(".xpi"));
        if (xpis.length !== 1) throw new Error(`${xpis.length} XPI assets on ${rel.tag_name}, expected 1`);
        const dl = await fetch(xpis[0].browser_download_url, { signal: AbortSignal.timeout(120000) });
        if (!dl.ok) throw new Error("download answered " + dl.status);
        const bytes = Buffer.from(await dl.arrayBuffer());
        if (bytes.length !== xpis[0].size) throw new Error(`downloaded ${bytes.length} bytes, the release lists ${xpis[0].size}`);
        const file = `${name}-${version}.xpi`;
        writeFileSync(path.join(here, "xpi", file), bytes);
        if (file !== pin.file) unlinkSync(path.join(here, "xpi", pin.file));
        console.log(`moved: ${name} ${pin.version} -> ${version}`);
        Object.assign(pin, { file, version, sha256: createHash("sha256").update(bytes).digest("hex"), source: rel.html_url });
        moved++;
    }
    catch (e) {
        console.error(`NOT MOVED: ${name}: ${e.message || e}`);
        failed++;
    }
}

writeFileSync(pinsFile, JSON.stringify(pins, null, 2) + "\n");
console.log(`${moved} moved, ${failed} failed.` + (moved ? " Run `npm run test:compat`, read it, then commit." : ""));
process.exit(failed ? 1 : 0);
