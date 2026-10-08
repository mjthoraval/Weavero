/* global describe, it, before, after, assert, Zotero */

// The undo / redo engine (src/modules/undo.ts, MJT 2026-09-29): one history
// per scope, steps as DATA ({label, type, data}) replayed by handlers the
// live plugin registers per type -- so the stacks, kept on the Zotero object,
// outlive a plugin reload (MJT 2026-09-30). Contract: undo moves a step to
// the redo stack and redo back; a new push clears the redo stack; the cap is
// Zotero's undoHistory.steps; a step that throws, or whose type is unknown,
// is dropped; a call while a step runs is ignored; peek gives the labels.

describe("Weavero — undo engine", () => {
    let wv;
    const SCOPE = "spec:undo-engine";
    const LOG = [];

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvUndoPush !== "function") wvT.absent('!wv || typeof wv._wvUndoPush !== "function"');
        wv._wvUndoClear(SCOPE);
        wv._wvUndoRegisterType("spec.step", {
            undo(d) { d.log.push("undo " + d.label); },
            redo(d) { d.log.push("redo " + d.label); },
        });
        wv._wvUndoRegisterType("spec.throw", { undo() { throw new Error("boom"); }, redo() {} });
        wv._wvUndoRegisterType("spec.slow", {
            async undo(d) { await new Promise(r => setTimeout(r, 20)); d.reentrant = await wv._wvUndo(SCOPE); d.log.push("slow done"); },
            redo() {},
        });
    });

    after(() => { if (wv) wv._wvUndoClear(SCOPE); });

    const step = (label, log) => ({ label, type: "spec.step", data: { label, log } });

    it("undo / redo walk the stacks in order and report the labels", async () => {
        const log = [];
        wv._wvUndoPush(SCOPE, step("A", log));
        wv._wvUndoPush(SCOPE, step("B", log));
        assert.deepEqual(wv._wvUndoPeek(SCOPE), { undo: "B", redo: null });
        assert.strictEqual(await wv._wvUndo(SCOPE), "B");
        assert.deepEqual(wv._wvUndoPeek(SCOPE), { undo: "A", redo: "B" });
        assert.strictEqual(await wv._wvUndo(SCOPE), "A");
        assert.strictEqual(await wv._wvUndo(SCOPE), null, "nothing left");
        assert.strictEqual(await wv._wvRedo(SCOPE), "A");
        assert.strictEqual(await wv._wvRedo(SCOPE), "B");
        assert.strictEqual(await wv._wvRedo(SCOPE), null);
        assert.deepEqual(log, ["undo B", "undo A", "redo A", "redo B"]);
    });

    it("the stacks live on the Zotero object, not on the plugin instance", () => {
        wv._wvUndoClear(SCOPE);
        wv._wvUndoPush(SCOPE, step("S", []));
        const Z = /** @type {any} */ (Zotero);
        assert.ok(Z._wvUndoState instanceof Map || typeof Z._wvUndoState.get === "function", "Zotero._wvUndoState holds the map");
        assert.strictEqual(Z._wvUndoState.get(SCOPE).undo[0].label, "S");
        assert.strictEqual(wv._wvUndoStacks(), Z._wvUndoState, "the same map every time");
        assert.isUndefined(Z._wvUndoState.get(SCOPE).undo[0].undo, "steps carry no closures");
    });

    it("a new action after an undo clears the redo stack", async () => {
        wv._wvUndoClear(SCOPE);
        const log = [];
        wv._wvUndoPush(SCOPE, step("A", log));
        await wv._wvUndo(SCOPE);
        wv._wvUndoPush(SCOPE, step("C", log));
        assert.deepEqual(wv._wvUndoPeek(SCOPE), { undo: "C", redo: null });
    });

    it("the cap follows Zotero's undoHistory.steps pref; 0 records nothing", () => {
        wv._wvUndoClear(SCOPE);
        const before = Zotero.Prefs.get("undoHistory.steps");
        try {
            Zotero.Prefs.set("undoHistory.steps", 3);
            for (let i = 0; i < 5; i++) wv._wvUndoPush(SCOPE, step("P" + i, []));
            assert.deepEqual(wv._wvUndoStacks().get(SCOPE).undo.map(s => s.label), ["P2", "P3", "P4"]);
            Zotero.Prefs.set("undoHistory.steps", 0);
            wv._wvUndoPush(SCOPE, step("P5", []));
            assert.strictEqual(wv._wvUndoPeek(SCOPE).undo, "P4", "undo off: nothing recorded");
        }
        finally { Zotero.Prefs.set("undoHistory.steps", Number.isInteger(before) ? before : 100); wv._wvUndoClear(SCOPE); }
    });

    it("scopes are independent and the cap is 100 by default", async () => {
        wv._wvUndoClear(SCOPE);
        const other = SCOPE + ":other";
        wv._wvUndoClear(other);
        const log = [];
        for (let i = 0; i < 105; i++) wv._wvUndoPush(SCOPE, step("S" + i, log));
        wv._wvUndoPush(other, step("O", log));
        assert.strictEqual(wv._wvUndoStacks().get(SCOPE).undo.length, 100, "oldest steps dropped");
        assert.strictEqual(wv._wvUndoPeek(SCOPE).undo, "S104");
        assert.strictEqual(wv._wvUndoPeek(other).undo, "O");
        await wv._wvUndo(other);
        assert.strictEqual(wv._wvUndoPeek(SCOPE).undo, "S104", "the other scope's undo touched nothing here");
        wv._wvUndoClear(other);
        assert.deepEqual(wv._wvUndoPeek(other), { undo: null, redo: null });
    });

    it("a throwing step is dropped, an async step is awaited, a re-entrant call is ignored, an unknown type is dropped", async () => {
        wv._wvUndoClear(SCOPE);
        const log = [];
        wv._wvUndoPush(SCOPE, { label: "bad", type: "spec.throw" });
        assert.strictEqual(await wv._wvUndo(SCOPE), null, "failure reports nothing");
        assert.deepEqual(wv._wvUndoPeek(SCOPE), { undo: null, redo: null }, "dropped, not left on either stack");
        const slowData = { log, reentrant: "unset" };
        wv._wvUndoPush(SCOPE, { label: "slow", type: "spec.slow", data: slowData });
        wv._wvUndoPush(SCOPE, step("after", log));
        assert.strictEqual(await wv._wvUndo(SCOPE), "after");
        assert.strictEqual(await wv._wvUndo(SCOPE), "slow");
        assert.strictEqual(slowData.reentrant, null, "the nested undo while busy did nothing");
        assert.deepEqual(log, ["undo after", "slow done"]);
        assert.deepEqual(wv._wvUndoPeek(SCOPE), { undo: null, redo: "slow" });
        wv._wvUndoClear(SCOPE);
        wv._wvUndoPush(SCOPE, { label: "orphan", type: "spec.no-such-type" });
        assert.strictEqual(await wv._wvUndo(SCOPE), null, "a type this build does not know: dropped");
        assert.deepEqual(wv._wvUndoPeek(SCOPE), { undo: null, redo: null });
    });

    it("overlapping or throwing batches close: later pushes are not grouped into them (review 2026-10-05)", async () => {
        wv._wvUndoClear(SCOPE);
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        // The first to start ends first: a restore-on-exit depth stuck at 1 here.
        await Promise.all([wv._wvUndoBatch(() => sleep(5)), wv._wvUndoBatch(() => sleep(20))]);
        assert.isFalse(wv._wvUndoInBatch(), "two overlapping gestures: depth back to 0");
        let threw = false;
        try { await wv._wvUndoBatch(async () => { throw new Error("body"); }); } catch (_) { threw = true; }
        assert.isTrue(threw, "the error reaches the caller");
        assert.isFalse(wv._wvUndoInBatch(), "depth back to 0");
        wv._wvUndoPush(SCOPE, step("solo", []));
        assert.notOk(wv._wvUndoList(SCOPE, "undo")[0].groupId, "no stale groupId");
    });

    it("a step pushed while an undo is running drops that undo's redo entry (review 2026-10-05)", async () => {
        wv._wvUndoClear(SCOPE);
        wv._wvUndoRegisterType("spec.push-during", {
            async undo() { await new Promise(r => setTimeout(r, 10)); wv._wvUndoPush(SCOPE, step("new", [])); },
            redo() {},
        });
        wv._wvUndoPush(SCOPE, { label: "old", type: "spec.push-during", data: {} });
        assert.strictEqual(await wv._wvUndo(SCOPE), "old");
        assert.deepEqual(wv._wvUndoPeek(SCOPE), { undo: "new", redo: null }, "no redo across the new action");
    });

    it("rejects malformed steps quietly (no type, closures, empty scope)", () => {
        wv._wvUndoClear(SCOPE);
        wv._wvUndoPush(SCOPE, /** @type {any} */ ({ label: "x" }));
        wv._wvUndoPush(SCOPE, /** @type {any} */ ({ label: "y", undo() {}, redo() {} }));
        wv._wvUndoPush("", { label: "z", type: "spec.step", data: { label: "z", log: [] } });
        assert.deepEqual(wv._wvUndoPeek(SCOPE), { undo: null, redo: null });
    });

    // Slice 2 (MJT 2026-10-01): selective undo, the history list, batches
    // and linked groups.
    const ids = (label, log, list) => ({ label, type: "spec.ids", data: { label, log, ids: list } });

    it("a step below the top can run alone when no later step touched its ids; it moves to the top and runs", async () => {
        wv._wvUndoClear(SCOPE);
        wv._wvUndoRegisterType("spec.ids", {
            undo(d) { d.log.push("undo " + d.label); }, redo(d) { d.log.push("redo " + d.label); }, ids: d => d.ids,
        });
        const log = [];
        wv._wvUndoPush(SCOPE, ids("A", log, ["1"]));
        wv._wvUndoPush(SCOPE, ids("B", log, ["2"]));
        wv._wvUndoPush(SCOPE, ids("C", log, ["1", "3"]));
        const list = wv._wvUndoList(SCOPE, "undo");
        assert.deepEqual(list.map(r => r.label + ":" + r.independent + ":" + r.depth), ["C:true:0", "B:true:1", "A:false:2"], "A shares id 1 with the later C");
        assert.isNull(await wv._wvUndoRunStep(SCOPE, "undo", list[2].id), "A is covered: refused");
        assert.strictEqual(await wv._wvUndoRunStep(SCOPE, "undo", list[1].id), "B", "B ran alone");
        assert.deepEqual(log, ["undo B"]);
        assert.deepEqual(wv._wvUndoStacks().get(SCOPE).undo.map(s => s.label), ["A", "C"], "taken out of the middle");
        assert.deepEqual(wv._wvUndoPeek(SCOPE), { undo: "C", redo: "B" }, "and redoable like any undone step");
        assert.strictEqual(await wv._wvRedo(SCOPE), "B");
        assert.deepEqual(wv._wvUndoStacks().get(SCOPE).undo.map(s => s.label), ["A", "C", "B"], "back on top");
        // A step of a type without ids is never independent below the top.
        wv._wvUndoPush(SCOPE, step("D", log));
        wv._wvUndoPush(SCOPE, ids("E", log, ["9"]));
        const l2 = wv._wvUndoList(SCOPE, "undo");
        assert.deepEqual(l2.slice(0, 2).map(r => r.label + ":" + r.independent), ["E:true", "D:false"]);
        assert.isNull(await wv._wvUndoRunStep(SCOPE, "undo", l2[1].id));
        assert.isNull(await wv._wvUndoRunStep(SCOPE, "undo", "no-such-id"));
        wv._wvUndoClear(SCOPE);
    });

    it("a batch is one gesture: flushers run once at its end, steps pushed inside share a groupId, and twins undo together", async () => {
        const other = SCOPE + ":twin";
        wv._wvUndoClear(SCOPE); wv._wvUndoClear(other);
        const log = [];
        const flushes = [];
        assert.isFalse(wv._wvUndoInBatch());
        const ret = await wv._wvUndoBatch(async () => {
            assert.isTrue(wv._wvUndoInBatch());
            wv._wvUndoOnBatchEnd("k", () => { flushes.push("k"); wv._wvUndoPush(other, ids("T2", log, ["b"])); });
            wv._wvUndoOnBatchEnd("k", () => { flushes.push("dup"); });   // same key: registered once
            await wv._wvUndoBatch(async () => { assert.isTrue(wv._wvUndoInBatch(), "nested"); });   // the inner end does not flush
            assert.deepEqual(flushes, [], "not before the outermost end");
            wv._wvUndoPush(SCOPE, ids("T1", log, ["a"]));
            return 42;
        });
        assert.strictEqual(ret, 42, "the batch returns fn's value");
        assert.isFalse(wv._wvUndoInBatch());
        assert.deepEqual(flushes, ["k"], "flushed once");
        const t1 = wv._wvUndoTop(SCOPE, "undo"), t2 = wv._wvUndoTop(other, "undo");
        assert.ok(t1.groupId && t1.groupId === t2.groupId, "twins share the group (the flusher's push too)");
        wv._wvUndoPush(other, ids("later", log, ["z"]));   // an independent step above the twin in the other scope
        assert.strictEqual(await wv._wvUndo(SCOPE), "T1");
        assert.deepEqual(log, ["undo T1", "undo T2"], "the twin ran too, selectively (independent of 'later')");
        assert.deepEqual([wv._wvUndoPeek(SCOPE), wv._wvUndoPeek(other)], [{ undo: null, redo: "T1" }, { undo: "later", redo: "T2" }]);
        assert.strictEqual(await wv._wvRedo(other), "T2");
        assert.deepEqual(log.slice(2), ["redo T2", "redo T1"], "redo from the other side brings the twin back too");
        // A twin covered by a later step stays put.
        wv._wvUndoPush(other, ids("covers", log, ["b"]));
        log.length = 0;
        assert.strictEqual(await wv._wvUndo(SCOPE), "T1");
        assert.deepEqual(log, ["undo T1"], "T2 is covered by 'covers': left in place");
        assert.strictEqual(wv._wvUndoStacks().get(other).undo.map(s => s.label).join(","), "later,T2,covers");
        wv._wvUndoClear(SCOPE); wv._wvUndoClear(other);
    });

    it("steps carry ids and stamps; the list is newest first with its depth", () => {
        wv._wvUndoClear(SCOPE);
        const t0 = Date.now();
        wv._wvUndoPush(SCOPE, step("A", []));
        wv._wvUndoPush(SCOPE, step("B", []));
        const st = wv._wvUndoStacks().get(SCOPE).undo;
        assert.ok(st[0].id && st[1].id && st[0].id !== st[1].id, "unique ids");
        assert.isAtLeast(st[0].at, t0);
        const list = wv._wvUndoList(SCOPE, "undo");
        assert.deepEqual(list.map(r => [r.label, r.depth]), [["B", 0], ["A", 1]]);
        assert.deepEqual(wv._wvUndoList(SCOPE, "redo"), []);
        wv._wvUndoClear(SCOPE);
    });
});
