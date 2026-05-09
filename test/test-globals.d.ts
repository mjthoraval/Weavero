// Ambient global declarations for the scaffold's test environment.
//
// `zotero-plugin-scaffold` runs Mocha + Chai inside Zotero's
// privileged context, with a small bootstrap script that does:
//
//   window.expect = chai.expect;
//   window.assert = chai.assert;
//
// (See `node_modules/zotero-plugin-scaffold/dist/.../mocha-setup-default.js`.)
// Mocha hooks (describe, it, before, after, beforeEach, afterEach)
// come in via `@types/mocha` since `mocha` is in `tsconfig.json`'s
// `types` array.

import type { expect as ChaiExpect, assert as ChaiAssert } from "chai";

declare global {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const expect: typeof ChaiExpect;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const assert: typeof ChaiAssert;

    // Augment the platform-managed `Zotero` namespace with the
    // properties Weavero exposes for its tests.
    namespace Zotero {
        // Set by bootstrap.js startup() so the test suite can
        // reach the live plugin instance without re-running
        // bootstrap. `any` keeps it permissive — the underlying
        // class is a 19k-line plain-JS WeaveroPlugin we don't yet
        // have a type for.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let Weavero: any;

        // The Mozilla AddonManager re-exported on `Zotero` in
        // Zotero 7+. Used by the smoke test.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let AddonManager: any;
    }
}

export {};
