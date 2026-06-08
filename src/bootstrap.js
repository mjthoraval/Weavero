// Weavero — Zotero 7+ lifecycle entry shim.
//
// Plain JavaScript on purpose: Zotero loads `bootstrap.js` as a
// non-module privileged script, so the real plugin code can't
// live here directly (a TS-bundled IIFE would lose the lifecycle
// function names that Zotero looks up by name on this scope).
// Instead, the bundled `index.js` is loaded as a sub-script and
// exposes its lifecycle on `Zotero.Weavero.hooks`. This file
// stays small and stable; the bundle is what changes per release.

/* global Zotero, Services */

function install() {}
function uninstall() {}

async function startup({ id, version, rootURI }) {
    await Zotero.initializationPromise;
    try {
        // `ignoreCache: true` so a fresh install of the same version
        // path (e.g. during dev) actually picks up the new bundled
        // index.js. Without this the bytecode cache happily serves
        // the previous content from the same URL — silent regression.
        Services.scriptloader.loadSubScriptWithOptions(
            rootURI + "index.js",
            { ignoreCache: true });
    } catch (e) {
        Zotero.debug("[Weavero] failed to load index.js: " + e);
        return;
    }
    if (Zotero.Weavero && Zotero.Weavero.hooks
            && Zotero.Weavero.hooks.onStartup) {
        Zotero.Weavero.hooks.onStartup({ id, version, rootURI });
    } else {
        Zotero.debug("[Weavero] index.js loaded but hooks missing");
    }
}

function shutdown(_data, reason) {
    // `reason` is Zotero's numeric bootstrap code (ADDON_DISABLE=4,
    // ADDON_UNINSTALL=6, APP_SHUTDOWN=2, ADDON_UPGRADE=7, …). Forwarded so the
    // plugin can migrate reader tabs to the main window on a real disable but
    // not on a hot-reload/upgrade or app-quit.
    if (Zotero.Weavero && Zotero.Weavero.hooks
            && Zotero.Weavero.hooks.onShutdown) {
        Zotero.Weavero.hooks.onShutdown(reason);
    }
    delete Zotero.Weavero;
}

function onMainWindowLoad({ window }) {
    if (Zotero.Weavero && Zotero.Weavero.hooks
            && Zotero.Weavero.hooks.onMainWindowLoad) {
        Zotero.Weavero.hooks.onMainWindowLoad(window);
    }
}

function onMainWindowUnload({ window }) {
    if (Zotero.Weavero && Zotero.Weavero.hooks
            && Zotero.Weavero.hooks.onMainWindowUnload) {
        Zotero.Weavero.hooks.onMainWindowUnload(window);
    }
}
