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
});
