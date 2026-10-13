/* global describe, it, before, assert */

// The reader filter's Custom date range (survey 2026-10-06, smaller bugs):
// the "to" day must end at 23:59:59.999 LOCAL time on that day. It was
// computed as local midnight + 24 h - 1 ms, which is wrong on a DST day
// (23 or 25 hours long): an hour into the next day, or an hour short.
// The dates below are DST transitions in Europe, the US and the southern
// hemisphere, so the check bites in whichever zone the runner uses.

describe("Weavero — reader filter: Custom date range bounds", function () {
    let wv;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvRfDateRange");
    });

    const DAYS = ["2026-03-29", "2026-10-25", "2026-03-08", "2026-11-01", "2026-04-05", "2026-10-04", "2026-06-15"];

    it("'to' ends at 23:59:59.999 local on that very day, DST days included", () => {
        for (const iso of DAYS) {
            const { to } = wv._wvRfDateRange("custom", 0, "d", null, iso);
            const d = new Date(to);
            const [y, m, day] = iso.split("-").map(Number);
            assert.deepEqual(
                [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()],
                [y, m, day, 23, 59, 59, 999], iso);
            assert.strictEqual(new Date(to + 1).getHours(), 0, iso + ": one ms later is the next local midnight");
        }
    });

    it("'from' starts at local midnight of its day", () => {
        for (const iso of DAYS) {
            const { from } = wv._wvRfDateRange("custom", 0, "d", iso, null);
            const d = new Date(from);
            const [y, m, day] = iso.split("-").map(Number);
            assert.deepEqual([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()], [y, m, day, 0, 0], iso);
        }
    });
});
