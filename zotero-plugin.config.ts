import { defineConfig } from "zotero-plugin-scaffold";

export default defineConfig({
  // Plain-JS plugin: scaffold should copy src/* into the build
  // verbatim — no esbuild, no transpilation. The XPI it produces
  // is functionally equivalent to what build.ps1 already makes.
  source: ["src"],
  dist: ".scaffold/build",

  // Identity — must match src/manifest.json so Zotero installs the
  // right add-on into the temp test profile.
  name: "Weavero",
  id: "weavero@mjthoraval",
  namespace: "weavero",

  build: {
    // Copy every file under src/ into the build verbatim. No
    // esbuildOptions — scaffold's builder will skip the bundle
    // step when no entry points are declared.
    assets: ["src/**/*"],
    // Disable scaffold's PrefsManager. It expects `prefs.js` to be
    // in Mozilla's default-preferences format (lines like
    // `pref("key", value)`). Weavero's `prefs.js` is an IIFE that
    // binds the prefs-pane HTML at runtime — different role, same
    // filename. Setting both flags false makes `buildPrefs` return
    // before parsing.
    prefs: { prefixPrefKeys: false, dts: false, prefix: "" },
  },

  test: {
    entries: ["test"],
    // We don't yet expose an "initialized" flag on a global, so
    // wait a fixed delay after Zotero starts before kicking off
    // the test suite. Once the plugin is converted to set a
    // `Zotero._weaveroReady = true` flag in init(), switch to
    // `waitForPlugin: () => Zotero._weaveroReady`.
    startupDelay: 8_000,
    abortOnFail: false,
  },

  release: {
    // Match the existing v0.7.0 release flow — version-tagged
    // releases (`vX.Y.Z`) carry the XPI as an asset, and a
    // separate rolling `release` tag holds `update.json` so
    // Zotero's auto-updater can find the latest version.
    bumpp: {
      // Critical: bump src/manifest.json AS WELL AS package.json.
      // The shipped XPI's user-visible version comes from
      // src/manifest.json — without this, every release after
      // the first scaffold-driven one would package an XPI
      // labelled with the OLD version while the GitHub release
      // tag carries the new one.
      files: ["package.json", "src/manifest.json"],
      execute: "npm run build",
      // Don't open an editor for the commit message — use the
      // default.
      confirm: true,
      tag: "v%s",
    },
    github: {
      // `local` mode runs the publish step from the developer's
      // machine; `ci` mode runs it from the GitHub Actions
      // runner. The release.yml workflow sets this implicitly
      // via NODE_ENV detection — set explicitly here too so
      // local invocations also publish if the user wants.
      enable: true,
      releaseNote(ctx) {
        // Default: a short auto-generated note. Custom release
        // bodies (like the v0.7.0 hand-curated changelog) can
        // still be edited via the GitHub UI after publish.
        return `Release v${ctx.version}\n\n`
            + `See [CHANGELOG](https://github.com/`
            + `mjthoraval/Weavero/commits/v${ctx.version}) `
            + `for the commit log since the last tag.`;
      },
    },
  },
});
