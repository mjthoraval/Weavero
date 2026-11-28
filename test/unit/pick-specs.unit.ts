// Node-tier tests for scripts/pick-specs-lib.mjs -- the import graph behind
// `npm run test:pick` (`npm run test:unit`, no Zotero), on a fixture tree.
import { expect } from "chai";
import { pickSpecs, parseDiff, parseImports, analyzeSource, enclosingDef } from "../../scripts/pick-specs-lib.mjs";

const UTIL = [
    "export function wvHelperA(x) {",
    "    return inner(x) + 1;",
    "}",
    "",
    "function inner(x) {",
    "    return x * 2;",
    "}",
    "",
    "export function wvUnused() {",
    "    return 0;",
    "}",
    "",
].join("\n");
const MID = [
    "import { wvHelperA } from \"./util\";",
    "",
    "export function wvMid(y) {",
    "    return wvHelperA(y);",
    "}",
    "",
].join("\n");
const FEATURE = [
    "import { wvMid } from \"../lib/mid\";",
    "import {",
    "    wvUnused,",
    "} from \"../lib/util\";",
    "import { WV_BADGE } from \"../lib/badge\";",
    "",
    "const _featureMethods = {",
    "    _wvFeatureRun(a: number) {",
    "        const cb = () => {",
    "            return wvMid(a);",
    "        };",
    "        return cb();",
    "    },",
    "    _wvFeatureOther() {",
    "        // Guard: test/guarded.spec.js",
    "        return wvUnused();",
    "    },",
    "    _wvFeatureBadge() {",
    "        return WV_BADGE;",
    "    },",
    "};",
    "export const featureMethods = _featureMethods;",
    "",
].join("\n");
const BADGE = "export const WV_BADGE = \"<svg/>\";\n";
const SPLIT = [
    "import { wvHelperA } from \"../lib/util\";",
    "class _SplitMixin {",
    "    _wvSplitThing() {",
    "        return wvHelperA(1);",
    "    }",
    "}",
    "export const splitMethods = _SplitMixin;",
    "",
].join("\n");
const INDEX = [
    "import { featureMethods } from \"./modules/feature\";",
    "import { splitMethods } from \"./modules/tab-split\";",
    "Object.assign({}, featureMethods, splitMethods);",
    "",
].join("\n");

const SRC = new Map<string, string>([
    ["src/index.ts", INDEX],
    ["src/lib/util.ts", UTIL],
    ["src/lib/mid.ts", MID],
    ["src/lib/badge.ts", BADGE],
    ["src/lib/orphan.ts", "export function wvOrphan() {\n    return 1;\n}\n"],
    ["src/modules/feature.ts", FEATURE],
    ["src/modules/tab-split.ts", SPLIT],
]);
const SPECS = new Map<string, string>([
    ["feature-run.spec.js", "it('runs', () => plugin._wvFeatureRun(1));"],
    ["feature-other.spec.js", "it('other', () => plugin._wvFeatureOther());"],
    ["feature-badge.spec.js", "it('badge', () => plugin._wvFeatureBadge());"],
    ["guarded.spec.js", "it('guarded', () => {});"],
    ["split-a.spec.js", "it('split', () => {});"],
    ["lib-util.spec.js", "it('lib', () => lib.wvHelperA(2));"],
    ["popups.spec.js", "it('popups', () => {});"],
    ["unrelated-1.spec.js", "it('x', () => {});"],
    ["unrelated-2.spec.js", "it('y', () => {});"],
    ["unrelated-3.spec.js", "it('z', () => {});"],
    ["unrelated-4.spec.js", "it('w', () => {});"],
    ["unrelated-5.spec.js", "it('v', () => {});"],
]);
const ENTRIES = ["src/index.ts"];

/** One `git diff --unified=0` hunk replacing new line `at` of `path`. */
const hunk = (path: string, at: number, minus: string[], plus: string[]) =>
    `+++ b/${path}\n@@ -${at},${minus.length} +${at},${plus.length} @@\n` + minus.map((l) => "-" + l).join("\n")
    + (minus.length ? "\n" : "") + plus.map((l) => "+" + l).join("\n") + "\n";
const lineOf = (text: string, needle: string) => text.split("\n").findIndex((l) => l.includes(needle)) + 1;
const run = (changed: string[], diffText: string, src = SRC) =>
    pickSpecs({ changed, diff: parseDiff(diffText), src, specs: SPECS, entries: ENTRIES });

describe("pick-specs — the import graph", () => {
    it("a private lib helper: through its exported users, transitively, up to the methods that call them", () => {
        const at = lineOf(UTIL, "return x * 2");
        const r = run(["src/lib/util.ts"], hunk("src/lib/util.ts", at, ["    return x * 2;"], ["    return x * 3;"]));
        expect([...r.picked.keys()].sort()).to.deep.equal([
            "test/feature-run.spec.js", "test/lib-util.spec.js", "test/popups.spec.js", "test/split-a.spec.js",
        ]);
        expect(r.picked.get("test/feature-run.spec.js")).to.equal("names _wvFeatureRun (src/modules/feature.ts, which uses src/lib/util.ts)");
        expect(r.picked.get("test/split-a.spec.js")).to.equal("split view changed (src/modules/tab-split.ts uses src/lib/util.ts)");
        expect(r.picked.get("test/popups.spec.js")).to.equal("base set");
        expect(r.full).to.deep.equal([]);
    });
    it("a lib function used by one method picks that method's specs only", () => {
        const at = lineOf(UTIL, "return 0");
        const r = run(["src/lib/util.ts"], hunk("src/lib/util.ts", at, ["    return 0;"], ["    return -1;"]));
        expect(r.picked.has("test/feature-other.spec.js")).to.equal(true);
        expect(r.picked.has("test/feature-run.spec.js")).to.equal(false);
        expect(r.picked.has("test/split-a.spec.js")).to.equal(false);
        expect(r.full).to.deep.equal([]);
    });
    it("a changed method is named directly; a guard named on a changed line is picked", () => {
        const at = lineOf(FEATURE, "Guard: test/guarded.spec.js");
        const r = run(["src/modules/feature.ts"], hunk("src/modules/feature.ts", at, ["        // Guard: test/old.spec.js"], ["        // Guard: test/guarded.spec.js"]));
        expect(r.picked.get("test/guarded.spec.js")).to.equal("named by a changed line of src/modules/feature.ts");
        // a comment line alone moves no definition
        expect(r.picked.has("test/feature-other.spec.js")).to.equal(false);
        expect(r.full).to.deep.equal([]);
    });
    it("a removed top-level definition (moved to a lib file) reaches the methods that used it", () => {
        const at = lineOf(FEATURE, "const _featureMethods");
        const diffText = hunk("src/modules/feature.ts", lineOf(FEATURE, "WV_BADGE }"), [], ["import { WV_BADGE } from \"../lib/badge\";"])
            + `@@ -6,2 +${at - 1},0 @@\n-const WV_BADGE = "<svg>"\n-    + "</svg>";\n`;
        const r = run(["src/modules/feature.ts", "src/lib/badge.ts"], diffText
            + `+++ b/src/lib/badge.ts\n@@ -0,0 +1 @@\n+export const WV_BADGE = "<svg/>";\n`);
        expect(r.picked.get("test/feature-badge.spec.js")).to.match(/^names _wvFeatureBadge \(src\/modules\/feature\.ts/);
        expect(r.full).to.deep.equal([]);
    });
    it("only an import line changed: nothing to follow, no full-suite verdict", () => {
        const r = run(["src/modules/feature.ts"], hunk("src/modules/feature.ts", 3, ["    wvOld,"], ["    wvUnused,"]));
        expect(r.full).to.deep.equal([]);
        expect([...r.picked.keys()]).to.deep.equal(["test/popups.spec.js"]);
    });
    it("the feature registry (src/features.ts, imported by no runtime file) needs no Zotero spec", () => {
        const src = new Map(SRC);
        src.set("src/features.ts", "export const WV_FEATURES = [\n    { id: \"a\", wiring: [\"wv-feature-run\"] },\n];\n");
        const r = run(["src/features.ts"], hunk("src/features.ts", 2, ["    { id: \"a\" },"], ["    { id: \"a\", wiring: [\"wv-feature-run\"] },"]), src);
        expect(r.full).to.deep.equal([]);
        expect([...r.picked.keys()]).to.deep.equal(["test/popups.spec.js"]);
    });
});

describe("pick-specs — when it says: run the full suite", () => {
    it("src/index.ts changed", () => {
        const r = run(["src/index.ts"], hunk("src/index.ts", 3, ["Object.assign({}, featureMethods);"], ["Object.assign({}, featureMethods, splitMethods);"]));
        expect(r.full).to.include("src/index.ts changed: it wires every module");
    });
    it("the scaffold config changed", () => {
        expect(run(["zotero-plugin.config.ts"], "").full).to.include("the scaffold config changed: it shapes every run");
    });
    it("a changed file no file imports (and no entry point)", () => {
        const r = run(["src/lib/orphan.ts"], hunk("src/lib/orphan.ts", 2, ["    return 1;"], ["    return 2;"]));
        expect(r.full).to.deep.equal(["src/lib/orphan.ts: no file imports it, and it is no entry point"]);
    });
    it("a change that reaches no spec the picker can name", () => {
        const src = new Map(SRC);
        src.set("src/modules/feature.ts", FEATURE.replace("_wvFeatureOther()", "_wvFeatureUnnamed()"));
        const at = lineOf(FEATURE, "return wvUnused()");
        const r = run(["src/modules/feature.ts"], hunk("src/modules/feature.ts", at, ["        return 1;"], ["        return wvUnused();"]), src);
        expect(r.full).to.deep.equal(["src/modules/feature.ts: its change reaches no spec the picker can name"]);
    });
    it("a namespace import of a changed file is not followed", () => {
        const src = new Map(SRC);
        src.set("src/modules/ns.ts", "import * as U from \"../lib/util\";\nconst m = {\n    _wvNs() {\n        return U.wvHelperA(1);\n    },\n};\n");
        const at = lineOf(UTIL, "return x * 2");
        const r = run(["src/lib/util.ts"], hunk("src/lib/util.ts", at, ["    return x * 2;"], ["    return x * 3;"]), src);
        expect(r.full).to.include("src/modules/ns.ts imports src/lib/util.ts as a namespace: not followed");
    });
    it("more than half of the suite picked", () => {
        const changed = ["test/unrelated-1.spec.js", "test/unrelated-2.spec.js", "test/unrelated-3.spec.js", "test/unrelated-4.spec.js", "test/unrelated-5.spec.js", "test/guarded.spec.js"];
        expect(run(changed, "").full).to.deep.equal(["more than half of the suite picked (7 of 12)"]);
    });
});

describe("pick-specs — the source reader", () => {
    it("parses named, multi-line, aliased, type-only, namespace and default imports", () => {
        const imps = parseImports([
            "import { a, b as c } from \"./x\";",
            "import {",
            "    d, // why",
            "    e,",
            "} from \"../y\";",
            "import type { T } from \"./t\";",
            "import * as NS from \"./ns\";",
            "import Def from \"./def\";",
            "import \"./side\";",
        ].join("\n"));
        expect(imps.map((i: any) => [i.spec, i.form, i.names.map((n: any) => n.imported + ">" + n.local).join(",")])).to.deep.equal([
            ["./x", "named", "a>a,b>c"], ["../y", "named", "d>d,e>e"], ["./ns", "namespace", ""], ["./def", "default", ""], ["./side", "side-effect", ""],
        ]);
    });
    it("a line inside a CSS template at column 0 belongs to the function that holds the template", () => {
        const text = ["export function wvCss() {", "    return `", ".wv-x {", "  color: red;", "}", "`;", "}", "export function wvNext() {", "    return 1;", "}"].join("\n");
        const rows = analyzeSource(text);
        expect(enclosingDef(rows, 3)).to.equal("wvCss");
        expect(enclosingDef(rows, 8)).to.equal("wvNext");
    });
    it("a method with its parameters on several lines is still the method", () => {
        const text = ["class _M {", "    async _wvLong(", "        a: number,", "    ) {", "        return a;", "    }", "}"].join("\n");
        expect(enclosingDef(analyzeSource(text), 4)).to.equal("_wvLong");
    });
});
