// Timers on the plugin sandbox's global clock, for work that must outlive
// any one window.
//
// A `win.setTimeout` chain dies silently when `win` closes, and a lifecycle
// flag it was due to clear sticks forever (bg-restore teardown, 2026-09-01:
// every later window open got fought; src-ts.md "timer hosts"). Per-window
// UI work should still use that window's own timer so it dies with the
// window; these are for plugin-level state, watchdogs and holds.

/** `setTimeout` on the sandbox global (same shape, so a Promise resolver
 *  or any callback goes in unchanged). */
export function wvTimeout(fn: (...args: any[]) => void, ms: number): any {
    return setTimeout(fn, ms);
}

/** `clearTimeout` for a `wvTimeout` handle; a null handle is a no-op. */
export function wvClearTimeout(t: any): void {
    try { if (t != null) clearTimeout(t); } catch (e) {}
}

/** Resolve after `ms` on the sandbox global clock. */
export function wvSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
