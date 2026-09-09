/* global describe, it, before, assert, Zotero */

// Plugins Manager card meta line (2026-09-07): every list-view card shows
// "<author> · v<version> · updated <relative>" under the plugin name — the
// detail view's own Author / Version / Last Updated order (author added
// 2026-09-08) — absolute date-time as the hover title. Written only on change
// so the observer that re-runs the decoration on every re-render can never
// loop.

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

	it("keeps the Recent Updates category permanently visible (pref flipped)", function () {
		if (!wv._getEnablePluginsSearch || !wv._getEnablePluginsSearch()) this.skip();
		assert.isFalse(
			Services.prefs.getBoolPref("extensions.ui.recent-updates.hidden", true),
			"aboutaddons hides the category behind this pref by default");
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

		it("adds the meta line with author + version + relative time, under the name", () => {
			const d = mkDoc([{ version: "1.2.3", creator: { name: "mobench" },
				updateDate: new Date(Date.now() - 3 * DAY) }]);
			wv._wvPMDecorateCards(d);
			const meta = d.querySelector(".wv-pm-meta");
			assert.isOk(meta, "meta line created");
			assert.equal(meta.textContent, "mobench · v1.2.3 · updated 3 days ago",
				"the detail view's order: Author, Version, Last Updated");
			assert.isOk(meta.getAttribute("title"), "absolute time as tooltip");
			assert.equal(meta.previousElementSibling.className, "addon-name-container",
				"sits under the name, above the description");
		});

		it("starts at the version when the plugin declares no author", () => {
			const when = new Date(Date.now() - 3 * DAY);
			const d = mkDoc([
				{ version: "1.2.3", updateDate: when },                       // no creator at all
				{ version: "2.0", creator: { name: "  " }, updateDate: when },  // blank name
			]);
			wv._wvPMDecorateCards(d);
			const metas = [...d.querySelectorAll(".wv-pm-meta")].map((m) => m.textContent);
			assert.deepEqual(metas, ["v1.2.3 · updated 3 days ago", "v2.0 · updated 3 days ago"],
				"no dangling separator, no 'undefined'");
		});

		// GitHub owner in brackets (2026-09-09): the manifest author and the
		// repository owner are different kinds of label (real name vs handle,
		// org, spelling variant), so the owner is appended when it adds
		// information and dropped when it merely repeats the author.
		it("appends the GitHub owner in brackets when it differs from the author", () => {
			const when = new Date(Date.now() - 3 * DAY);
			const d = mkDoc([
				{ version: "4.2.2", creator: { name: "Will Shanks" }, updateDate: when,
					updateURL: "https://raw.githubusercontent.com/wshanks/Zutilo/release/deploy/updates.json" },
				{ version: "0.5.1", creator: { name: "Wakam Chang" }, updateDate: when,
					homepageURL: "https://github.com/SciImage/zotero-attachment-scanner" },
			]);
			wv._wvPMDecorateCards(d);
			const metas = [...d.querySelectorAll(".wv-pm-meta")].map((m) => m.textContent);
			assert.deepEqual(metas, [
				"Will Shanks [wshanks] · v4.2.2 · updated 3 days ago",
				"Wakam Chang [SciImage] · v0.5.1 · updated 3 days ago",
			]);
		});

		it("drops the bracket when the owner merely repeats the author (case-insensitive)", () => {
			const when = new Date(Date.now() - 3 * DAY);
			const d = mkDoc([
				{ version: "2.6.1", creator: { name: "windingwind" }, updateDate: when,
					homepageURL: "https://github.com/windingwind/zotero-actions-tags#readme" },
				{ version: "1.0", creator: { name: "MJThoraval" }, updateDate: when,
					homepageURL: "https://github.com/mjthoraval/Weavero" },
				// The name part decides: an email suffix is not a different identity.
				{ version: "0.6.3", creator: { name: "qrkks <34028312@qq.com>" }, updateDate: when,
					updateURL: "https://raw.githubusercontent.com/qrkks/zotero-annotation-markdown/main/updates.json" },
			]);
			wv._wvPMDecorateCards(d);
			const metas = [...d.querySelectorAll(".wv-pm-meta")].map((m) => m.textContent);
			assert.deepEqual(metas, [
				"windingwind · v2.6.1 · updated 3 days ago",
				"MJThoraval · v1.0 · updated 3 days ago",
				"qrkks <34028312@qq.com> · v0.6.3 · updated 3 days ago",
			]);
		});

		it("an author-less plugin shows the owner alone in brackets", () => {
			const d = mkDoc([{ version: "9.0.63", updateDate: new Date(Date.now() - 3 * DAY),
				updateURL: "https://github.com/retorquere/zotero-better-bibtex/releases/download/release/updates.json" }]);
			wv._wvPMDecorateCards(d);
			assert.equal(d.querySelector(".wv-pm-meta").textContent, "[retorquere] · v9.0.63 · updated 3 days ago");
		});

		it("owner comes from the homepage first, then the update URL, then the install source; other hosts give nothing", () => {
			assert.equal(wv._wvPMGitHubOwner({ homepageURL: "https://github.com/muisedestiny/zotero-style#readme",
				updateURL: "https://raw.giteeusercontent.com/MuiseDestiny/plugins/raw/master/update.json" }), "muisedestiny");
			assert.equal(wv._wvPMGitHubOwner({ homepageURL: "https://www.beaverapp.ai",
				updateURL: "https://github.com/jlegewie/beaver-zotero/releases/download/release/update.json" }), "jlegewie");
			assert.equal(wv._wvPMGitHubOwner({ homepageURL: null, updateURL: "https://invalid.localhost/no-updates.json",
				sourceURI: { spec: "https://github.com/introfini/mcp-server-zotero-dev/releases/download/v1/x.xpi" } }), "introfini");
			assert.equal(wv._wvPMGitHubOwner({ updateURL: "https://zotero-download.s3.amazonaws.com/tmp/make-it-red/updates-2.0.json",
				sourceURI: { spec: "file:///D:/Downloads/toggle-bars.xpi" } }), "", "S3 + local file: no owner");
			assert.equal(wv._wvPMGitHubOwner({}), "");
		});

		it("shows the author exactly as the detail view does: plain text, email kept, no link", () => {
			const d = mkDoc([{ version: "1.0.1-dev.4", updateDate: new Date(Date.now() - 3 * DAY),
				creator: { name: "Guilherme Pires <mail@gpir.es>", url: "https://example.org/" } }]);
			wv._wvPMDecorateCards(d);
			const meta = d.querySelector(".wv-pm-meta");
			assert.equal(meta.textContent, "Guilherme Pires <mail@gpir.es> · v1.0.1-dev.4 · updated 3 days ago");
			assert.isNull(meta.querySelector("a"), "the homepage link belongs to the detail view");
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
