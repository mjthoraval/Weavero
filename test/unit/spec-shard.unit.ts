// Node-tier tests for scripts/spec-shard.mjs -- the WV_TEST_SHARD planner and
// the timing-table helpers (`npm run test:unit`, no Zotero).
import { expect } from "chai";
import { parseShard, specTimes, planShards, byteShards, binTimes, titleIndex, fileOfTitle, parseRunLog } from "../../scripts/spec-shard.mjs";

const F = (name: string, bytes = 100) => ({ name, bytes });

describe("spec-shard — parseShard()", () => {
    it("reads k/n and refuses anything else", () => {
        expect(parseShard("2/3")).to.deep.equal({ k: 2, n: 3 });
        for (const bad of ["", "3", "0/2", "3/2", "a/b", "1/0"]) expect(() => parseShard(bad), bad).to.throw();
    });
});

describe("spec-shard — specTimes()", () => {
    it("is the mean of the measured majors; a malformed table is empty", () => {
        expect(specTimes({ files: { "a.spec.js": { "10": 100, "11": 300 }, "b.spec.js": { "11": 50 } } }))
            .to.deep.equal({ "a.spec.js": 200, "b.spec.js": 50 });
        expect(specTimes(null)).to.deep.equal({});
        expect(specTimes({ files: "x" })).to.deep.equal({});
    });
});

describe("spec-shard — planShards()", () => {
    it("packs longest first into the least-loaded part (LPT), ties to the lowest part", () => {
        const files = ["a", "b", "c", "d", "e", "f"].map((n) => F(n));
        const t = { a: 7, b: 6, c: 5, d: 4, e: 3, f: 2 };
        // a->1 (7), b->2 (6), c->2 (11), d->1 (11), e->1 (tie: lowest part, 14), f->2 (13)
        const p = planShards(files, t, 2);
        expect(p.bins).to.deep.equal([["a", "d", "e"], ["b", "c", "f"]]);
        expect(p.loads).to.deep.equal([14, 13]);
    });
    it("orders equal weights by name, so a plan is reproducible", () => {
        const files = ["z", "m", "a", "q"].map((n) => F(n));
        const p1 = planShards(files, { z: 1, m: 1, a: 1, q: 1 }, 2);
        const p2 = planShards([...files].reverse(), { z: 1, m: 1, a: 1, q: 1 }, 2);
        expect(p1.bins).to.deep.equal([["a", "q"], ["m", "z"]]);
        expect(p2.bins).to.deep.equal(p1.bins);
    });
    it("puts every file in exactly one part, each part in name order", () => {
        const files = Array.from({ length: 23 }, (_, i) => F("s" + String(i).padStart(2, "0"), 50 + i));
        const t: Record<string, number> = {};
        files.forEach((f, i) => { t[f.name] = (i * 37) % 11 + 1; });
        for (const n of [1, 2, 3, 4]) {
            const { bins } = planShards(files, t, n);
            expect(bins).to.have.length(n);
            expect(bins.flat().sort()).to.deep.equal(files.map((f) => f.name).sort());
            for (const b of bins) expect(b).to.deep.equal([...b].sort());
        }
    });
    it("weighs a file the table lacks by its size, at the table's average ms per byte", () => {
        const files = [F("a", 100), F("b", 300), F("new", 200)];
        const p = planShards(files, { a: 1000, b: 3000 }, 2);
        // (1000 + 3000) ms / (100 + 300) bytes = 10 ms/byte -> new = 200 * 10 = 2000
        expect(p.msPerByte).to.equal(10);
        expect(p.estimated).to.deep.equal(["new"]);
        expect(p.bins).to.deep.equal([["b"], ["a", "new"]]);
        expect(p.loads).to.deep.equal([3000, 3000]);
    });
    it("with no table at all, balances by size", () => {
        const p = planShards([F("a", 10), F("b", 30), F("c", 20)], {}, 2);
        expect(p.bins).to.deep.equal([["b"], ["a", "c"]]);
    });
    it("balances what byte slices leave lopsided (heavy files at the end of the name order)", () => {
        const files = [F("a", 100), F("b", 100), F("c", 100), F("y", 100), F("z", 100)];
        const t = { a: 10, b: 10, c: 10, y: 400, z: 400 };
        const time = (n: string) => t[n as keyof typeof t];
        const before = binTimes(byteShards(files, 2), time);
        const after = binTimes(planShards(files, t, 2).bins, time);
        expect(before).to.deep.equal([20, 810]);
        expect(Math.max(...after)).to.equal(420);
    });
});

describe("spec-shard — byteShards() (the former split)", () => {
    it("gives contiguous slices by the middle byte of each file", () => {
        const files = [F("a", 10), F("b", 10), F("c", 10), F("d", 10)];
        expect(byteShards(files, 2)).to.deep.equal([["a", "b"], ["c", "d"]]);
        expect(byteShards(files, 3)).to.deep.equal([["a"], ["b", "c"], ["d"]]);
    });
});

describe("spec-shard — from a run log to the files", () => {
    const texts = new Map<string, string>([
        ["a.spec.js", "describe(\"Weavero — the first feature\", () => {\n    describe(\"nested\", () => {});\n});\n"],
        ["b.spec.js", "const T = \"Weavero — built from a constant title and more\";\ndescribe(T + \" (z11)\", () => {});\ndescribe('Weavero — it\\'s quoted', () => {});\n"],
    ]);
    it("indexes the top-level describe titles, unescaped", () => {
        const idx = titleIndex(texts);
        expect([...idx.keys()]).to.deep.equal(["Weavero — the first feature", "Weavero — it's quoted"]);
    });
    it("maps a title to its file: exact, else the one file holding its longest leading part", () => {
        const idx = titleIndex(texts);
        expect(fileOfTitle("Weavero — the first feature", idx, texts)).to.equal("a.spec.js");
        expect(fileOfTitle("Weavero — built from a constant title and more (z11)", idx, texts)).to.equal("b.spec.js");
        expect(fileOfTitle("Weavero — nowhere", idx, texts)).to.equal(null);
    });
    it("sums the test durations under each top-level suite, after the add-on installs", () => {
        const log = [
            "   → Preparing static assets",
            " ℹ Installed /x as a temporary add-on",
            "   → Weavero — the first feature",
            "     ✔ one 12ms",
            "     → nested",
            "       ✔ two 30ms",
            "     ℹ three pending",
            "   → Weavero — it's quoted",
            "     ✖ four, boom",
            "     ✔ five 0ms",
        ].join("\n");
        expect(parseRunLog(log)).to.deep.equal([
            { title: "Weavero — the first feature", testMs: 42, tests: 2 },
            { title: "Weavero — it's quoted", testMs: 0, tests: 1 },
        ]);
    });
});
