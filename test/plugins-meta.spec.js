/* global describe, it, before, assert, Zotero */

// Plugins Manager card meta line (2026-09-07): every list-view card shows
// "v<version> · updated <relative>" under the plugin name, absolute date-time
// as the hover title. Written only on change so the observer that re-runs the
// decoration on every re-render can never loop.

describe("Weavero — Plugins Manager card meta", () => {
	let wv;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvPMRelTime !== "function") this.skip();
	});

	describe("_wvPMRelTime", () => {
		const MIN = 60000, H = 3600000, DAY = 86400000;

		it("scales through min / hours / days", () => {
			assert.equal(wv._wvPMRelTime(Date.now() - 30000).rel, "just now");
			assert.equal(wv._wvPMRelTime(Date.now() - 5 * MIN).rel, "5 min ago");
			assert.equal(wv._wvPMRelTime(Date.now() - H - 1000).rel, "1 hour ago");
			assert.equal(wv._wvPMRelTime(Date.now() - 5 * H).rel, "5 hours ago");
			assert.equal(wv._wvPMRelTime(Date.now() - DAY - H).rel, "1 day ago");
			assert.equal(wv._wvPMRelTime(Date.now() - 3 * DAY).rel, "3 days ago");
		});

		it("≥14 days switches to the absolute date inline", () => {
			const when = Date.now() - 82 * DAY;
			const t = wv._wvPMRelTime(when);
			assert.notInclude(t.rel, "ago", "no vague '82 days ago'");
			assert.equal(t.rel, new Date(when).toLocaleDateString());
		});

		it("bad input degrades to 'unknown'", () => {
			assert.equal(wv._wvPMRelTime(0).rel, "unknown");
			assert.equal(wv._wvPMRelTime(NaN).rel, "unknown");
		});
	});

	describe("_wvPMDecorateCards", () => {
		const mkDoc = (cards) => {
			const d = Zotero.getMainWindow().document.implementation
				.createHTMLDocument("wv-pm-meta-test");
			const list = d.createElement("addon-list");
			d.body.appendChild(list);
			for (const c of cards) {
				const card = /** @type {any} */ (d.createElement("addon-card"));
				const nc = d.createElement("div");
				nc.className = "addon-name-container";
				card.appendChild(nc);
				const desc = d.createElement("div");
				desc.className = "addon-description";
				card.appendChild(desc);
				card.addon = c;
				list.appendChild(card);
			}
			return d;
		};
		const DAY = 86400000;

		it("adds the meta line with version + relative time, under the name", () => {
			const d = mkDoc([{ version: "1.2.3", updateDate: new Date(Date.now() - 3 * DAY) }]);
			wv._wvPMDecorateCards(d);
			const meta = d.querySelector(".wv-pm-meta");
			assert.isOk(meta, "meta line created");
			assert.equal(meta.textContent, "v1.2.3 · updated 3 days ago");
			assert.isOk(meta.getAttribute("title"), "absolute time as tooltip");
			assert.equal(meta.previousElementSibling.className, "addon-name-container",
				"sits under the name, above the description");
		});

		it("is idempotent and updates in place on change (observer-safe)", () => {
			const addon = { version: "1.0.0", updateDate: new Date(Date.now() - 3 * DAY) };
			const d = mkDoc([addon]);
			wv._wvPMDecorateCards(d);
			wv._wvPMDecorateCards(d);
			assert.lengthOf(d.querySelectorAll(".wv-pm-meta"), 1, "no duplicate line");
			addon.version = "1.0.1";
			wv._wvPMDecorateCards(d);
			assert.lengthOf(d.querySelectorAll(".wv-pm-meta"), 1);
			assert.include(d.querySelector(".wv-pm-meta").textContent, "v1.0.1",
				"same node, refreshed text");
		});

		it("ignores cards outside an addon-list (detail view untouched)", () => {
			const d = mkDoc([]);
			const stray = /** @type {any} */ (d.createElement("addon-card"));
			const nc = d.createElement("div");
			nc.className = "addon-name-container";
			stray.appendChild(nc);
			stray.addon = { version: "9.9.9", updateDate: new Date() };
			d.body.appendChild(stray);   // NOT inside addon-list
			wv._wvPMDecorateCards(d);
			assert.isNull(d.querySelector(".wv-pm-meta"));
		});
	});
});
