import { defineConfig } from "zotero-plugin-scaffold";

export default defineConfig({
  // Plain-JS plugin: scaffold copies src/* into the build verbatim
  // — no esbuild, no transpilation. The XPI it produces is
  // functionally equivalent to what scripts/build.ps1 makes.
  source: ["src"],
  dist: ".scaffold/build",

  // Identity — must match src/manifest.json so Zotero installs the
  // right add-on into the temp test profile.
  name: "Weavero",
  id: "weavero@mjthoraval",
  namespace: "weavero",

  build: {
    // Non-bundled assets are copied verbatim; .ts files are
    // bundled by esbuild (below) and must NOT also be copied as
    // sources, so we negate them here.
    assets: ["src/**/*", "!src/**/*.ts"],
    // esbuild entry points. Scaffold passes each block straight
    // to esbuild; an `outfile` not already inside `dist` gets
    // `dist/` prepended automatically. The bundled output lands
    // at `<dist>/addon/index.js`, which is the XPI root, so
    // bootstrap.js can load it as `rootURI + "index.js"`.
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        bundle: true,
        target: "firefox115",
        platform: "browser",
        format: "iife",
        outfile: "addon/index.js",
      },
      {
        entryPoints: ["src/prefs/index.ts"],
        bundle: true,
        target: "firefox115",
        platform: "browser",
        format: "iife",
        outfile: "addon/prefs.js",
      },
      {
        // Injected INTO the note-editor iframe (page compartment) to add a
        // ProseMirror decoration plugin. Bundles version-matched
        // prosemirror-view/-state so `Decoration` is available there.
        entryPoints: ["src/note-editor-inject.ts"],
        bundle: true,
        target: "firefox115",
        platform: "browser",
        format: "iife",
        outfile: "addon/note-editor-inject.js",
      },
    ],
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
    // One-shot run: exit after a single pass instead of staying in
    // watch mode (the scaffold's local default). This is the
    // detectable-completion contract — `npm test` STOPS when the
    // suite finishes, so its process exit (and exit code) is the
    // signal that it's done. In watch mode the runner never exits,
    // so a finished OR a stalled run looked identical (it just sat
    // there) — which is exactly the "is it done or hung?" ambiguity
    // we hit. With watch off: clean exit = done; no exit past a
    // sensible wall-clock timeout = stalled (kill the temp-profile
    // Zotero — the one launched with `-profile .scaffold/test/profile`
    // — and retry). CI already runs with watch off.
    // ⚠ This config value ALONE is not enough: scaffold's CLI (0.8.7,
    // cli.js `watch: !options.exitOnFinish && options.watch`) always
    // overrides it with the commander default (true) — the npm script
    // must pass `--exit-on-finish`. Without it the runner stays alive,
    // and editing any test file mid-run triggers a plugin reload + full
    // re-run INSIDE the same Zotero: dead readers from the previous
    // pass then poison reader-lifecycle tests with cross-run state.
    watch: false,
  },

  release: {
    // Match the existing v0.7.0 release flow — version-tagged
    // releases (`vX.Y.Z`) carry the XPI as an asset, and a
    // separate rolling `release` tag holds `update.json` so
    // Zotero's auto-updater can find the latest version.
    bumpp: {
      // Critical: bump src/manifest.json AS WELL AS package.json.
      // The shipped XPI's user-visible version comes from
      // src/manifest.json — without this, every release would
      // package an XPI labelled with the OLD version while the
      // GitHub release tag carries the new one.
      files: ["package.json", "src/manifest.json"],
      execute: "npm run build",
      // Don't open an editor for the commit message — use the
      // default.
      confirm: true,
      tag: "v%s",
    },
    github: {
      // Scaffold's isEnabled() only accepts the strings "always" |
      // "ci" | "local". Boolean `true` SILENTLY returns false, so
      // the publish step never ran (this was the v0.8.1 release
      // bug). "always" enables both CI runs and local
      // `npm run release` invocations.
      enable: "always",
      // No custom `releaseNote` — fall back to the scaffold default
      // (`ctx => ctx.release.changelog`), which is changelogen's
      // convention-based changelog grouped by type (🚀 Enhancements,
      // 🩹 Fixes, …) built from our `feat(scope): …` / `fix(scope): …`
      // commit messages. This is the compact, readable format the
      // windingwind plugins (e.g. Better Notes) use. Hand-curated
      // bodies can still be edited via the GitHub UI after publish.
    },
  },
});
