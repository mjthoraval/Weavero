// Node-tier tests for the feature registry's guard (scripts/check-features-lib.mjs,
// `npm run check:features`; no Zotero): its rules on a fixture, then the check
// on this tree, so that `npm run test:unit` (CI) fails where the registry and the
// code disagree.
import { expect } from "chai";
// Node's own modules: tsconfig types the Zotero runner's world, without @types/node.
// @ts-ignore
import { execFileSync } from "node:child_process";
// @ts-ignore
import { fileURLToPath } from "node:url";
import { checkFeatures, readmeNames } from "../../scripts/check-features-lib.mjs";

declare const process: any;
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const README = [
    "# X",
    "## Features",
    "<details id=\"a\">",
    "<summary><b>Group A</b></summary>",
    "",
    "- **Feature one** — text.",
    "- **Two display modes:**",
    "**Feature two.** More text.",
    "#### Heading three",
    "</details>",
    "## Install",
    "### Backups of things",
    "",
].join("\n");

const feature = (over: Record<string, any> = {}) => ({
    id: "one", name: "One", group: "g", surfaces: ["s"], master: "enableOne", prefs: ["one.*"],
    modules: ["modules/one.ts"], wiring: ["one-wire"], docs: "one.md", specs: ["one.spec.js"], readme: ["Feature one"],
    status: "stable", ...over,
});

const input = (over: Record<string, any> = {}) => ({
    registry: {
        features: [feature(), feature({ id: "two", master: "enableTwo", prefs: [], readme: ["Feature two."], wiring: ["reader:two"] })],
        groups: { g: "Group" },
        surfaces: ["s"],
        sectionMasters: { enableAll: "All" },
    },
    untabled: {},
    prefs: { enableAll: { def: true }, enableOne: { def: true }, enableTwo: { def: false } },
    prefValues: { "one.size": 3, "one.mode": "off" },
    wires: ["one-wire", "reader:two"],
    settingsKeys: ["enableOne", "one.mode"],
    settingsFamilies: ["one."],
    codeKeys: new Map([["enableOne", new Set(["src/a.ts"])]]),
    codeFamilies: new Map([["one.", new Set(["src/a.ts"])]]),
    wvPrefKeys: new Map([["enableTwo", new Set(["src/a.ts"])]]),
    exists: (p: string) => ["src/modules/one.ts", "docs/one.md", "test/one.spec.js"].includes(p),
    readme: readmeNames(README),
    specs: ["one.spec.js"],
    modules: ["modules/one.ts"],
    ...over,
});

describe("check-features — README names", () => {
    it("reads bullets, paragraphs and #### headings of ## Features, groups apart, ### anywhere", () => {
        const r = readmeNames(README);
        expect(r.features).to.deep.equal(["Feature one", "Feature two", "Heading three"]);
        expect(r.groups).to.deep.equal(["Group A"]);
        expect([...r.names]).to.include.members(["Two display modes", "Backups of things", "Group A"]);
    });
});

describe("check-features — the rules", () => {
    it("a registry that matches the code passes", () => {
        expect(checkFeatures(input()).errors).to.deep.equal([]);
    });
    it("a table pref in no feature, or in two, fails", () => {
        const none = input({ prefValues: { "one.size": 3, "one.mode": "off", stray: 1 } });
        expect(checkFeatures(none).errors).to.deep.equal(['pref "stray" (prefs-table.ts) belongs to no feature: add it to a feature\'s master or prefs in src/features.ts']);
        const reg = input().registry;
        const two = input({ registry: { ...reg, features: [reg.features[0], { ...reg.features[1], prefs: ["one.size"] }] } });
        expect(checkFeatures(two).errors).to.deep.equal(['pref "one.size" belongs to 2 features (one, two): one only']);
    });
    it("a weavero.* key the code uses must be in the table or UNTABLED, and UNTABLED must be in use", () => {
        const keys = new Map([["enableOne", new Set(["src/a.ts"])], ["tabState", new Set(["src/b.ts"])]]);
        expect(checkFeatures(input({ codeKeys: keys })).errors[0]).to.match(/^"weavero\.tabState" is used in src\/b\.ts and declared nowhere/);
        expect(checkFeatures(input({ codeKeys: keys, untabled: { tabState: { feature: "one", kind: "state", why: "x" } } })).errors).to.deep.equal([]);
        expect(checkFeatures(input({ untabled: { gone: { feature: null, kind: "state", why: "x" } } })).errors)
            .to.deep.equal(['UNTABLED "gone" is no longer used in src/ (or is in the table now): remove it']);
    });
    it("Settings may bind only table keys; _wvPref only WV_PREFS rows", () => {
        expect(checkFeatures(input({ settingsKeys: ["nope"] })).errors).to.deep.equal(['Settings binds "nope", which the prefs table does not declare']);
        expect(checkFeatures(input({ wvPrefKeys: new Map([["one.size", new Set(["src/a.ts"])]]) })).errors)
            .to.deep.equal(['_wvPref("one.size") in src/a.ts: no WV_PREFS row (it would answer false)']);
    });
    it("a missing docs page, spec, module, wiring id or README name fails", () => {
        const reg = input().registry;
        const bad = feature({ docs: "gone.md", specs: ["gone.spec.js"], modules: ["modules/gone.ts"], wiring: ["gone"], readme: ["Gone"] });
        const errs = checkFeatures(input({ registry: { ...reg, features: [bad, reg.features[1]] } })).errors;
        expect(errs).to.have.length(5);
        expect(errs.join("\n")).to.match(/docs\/gone\.md/).and.match(/test\/gone\.spec\.js/).and.match(/src\/modules\/gone\.ts/)
            .and.match(/wiring id "gone"/).and.match(/README has no feature named "Gone"/);
    });
    it("a devOnly pref makes the feature a trial, and only that does", () => {
        const prefs = { enableAll: { def: true }, enableOne: { def: true, devOnly: true }, enableTwo: { def: false } };
        expect(checkFeatures(input({ prefs })).errors).to.deep.equal(['feature "one": a devOnly pref makes it status "trial"']);
        const reg = input().registry;
        const trial = input({ registry: { ...reg, features: [feature({ status: "trial" }), reg.features[1]] } });
        expect(checkFeatures(trial).errors).to.deep.equal(['feature "one": status "trial" without a devOnly pref (or a partOf in trial)']);
    });
});

describe("check-features — this tree", () => {
    it("src/features.ts agrees with the prefs table, Settings, the code, docs/, test/ and README (npm run check:features)", function () {
        this.timeout(120000);
        let out = "";
        try {
            out = execFileSync(process.execPath, ["--import", "tsx", "scripts/check-features.mjs"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
        }
        catch (e: any) {
            throw new Error("npm run check:features failed:\n" + String(e.stderr || "") + String(e.stdout || ""));
        }
        expect(out).to.match(/\[features\] ok\s*$/);
    });
});
