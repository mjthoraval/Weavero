/* global describe, it, before, expect, Zotero */

// Order guard for the items-view `setFilter` wrapper, asserted against the
// SHIPPED BUNDLE (same technique as compat.spec.js).
//
// After a quick search lands, the wrapper re-refreshes every open container
// so `getChildItems` runs against the NEW search state. That loop calls
// Zotero's index-based `_refreshContainer(i, true)` with raw `_rows`
// indices — and `_toggleOpenState` reads `isContainerOpen` / `getLevel` /
// `getRow` through whatever sits on the row provider while splicing `_rows`
// directly. With the filter's keep[] translation installed those reads
// resolve a DIFFERENT row than the one being spliced: the close loop eats
// unrelated top-level rows and the re-open is skipped. For a month the
// wrapper ran `_applyItemsListFilter` (which installs the translation)
// BEFORE the loop, and every everything-mode search landing under a chip
// lost a parent whose only hit was PDF full text (live search-modes 86/88,
// 2026-09-10).
//
// Invariant: inside the wrapper, the last `_pauseFilterPatches()` before
// the container loop comes AFTER any apply, and the apply that installs
// the translation comes AFTER the loop. Both halves failed on the pre-fix
// bundle.

describe("Weavero — setFilter wrapper mutates rows before re-applying", () => {
    let bundle;

    before(async function () {
        if (!(Zotero.Weavero && Zotero.Weavero.plugin)) this.skip();
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const res = await fetch(rootURI + "index.js");
        bundle = await res.text();
        expect(bundle.length, "bundle looks empty").to.be.above(1000);
    });

    function region() {
        const start = bundle.indexOf("origSetFilter(type, data)");
        const loop = bundle.indexOf("_refreshContainer(i, true)");
        const end = bundle.indexOf("_wvScheduleStaleKeepRetry()", loop);
        expect(start, "setFilter wrapper not found in bundle").to.be.above(-1);
        expect(loop, "container re-refresh loop not found").to.be.above(start);
        expect(bundle.indexOf("_refreshContainer(i, true)", loop + 1),
            "container loop marker must be unique").to.equal(-1);
        expect(end, "stale-keep retry arm not found after the loop").to.be.above(loop);
        return {
            before: bundle.slice(start, loop),
            after: bundle.slice(loop, end),
        };
    }

    it("pauses the filter patches right before the container loop, with no apply in between", () => {
        const { before: pre } = region();
        const pause = pre.lastIndexOf("_pauseFilterPatches()");
        const apply = pre.lastIndexOf("_applyItemsListFilter(");
        expect(pause, "no _pauseFilterPatches() before the loop").to.be.above(-1);
        expect(pause, "an apply runs between the pause and the container loop")
            .to.be.above(apply);
    });

    it("re-applies the filter only after the container loop", () => {
        const { after: post } = region();
        expect(post).to.contain("_applyItemsListFilter({ cascade: true })");
    });
});
