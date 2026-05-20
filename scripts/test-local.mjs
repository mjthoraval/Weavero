// Local one-shot test runner that GUARANTEES termination.
//
// Background: `zotero-plugin test` (= `npm test`) relies on the
// in-Zotero reporter calling `Zotero.Utilities.Internal.quit(0)` to
// close the test Zotero; the scaffold host then exits when it sees
// that process "close" (with code 0 pass / 1 fail). That quit DOES
// fire in CI, but on a local Zotero 10.0-beta it doesn't actually
// close the process — so `npm test` produces results and then hangs
// forever, holding the temp-profile Zotero open.
//
// This wrapper streams the scaffold output and, the moment it logs
// "Test run completed …" (the reporter's end-of-run line), force-
// closes the temp-profile Zotero. That makes the host's "close"
// handler fire, so it exits cleanly with the correct code — which we
// propagate. A hard timeout is the backstop if the line never comes
// (a real stall). Windows-targeted (the dev platform); on other
// platforms it just streams, since the scaffold self-terminates there.
//
// Use: `npm run test:local`. CI keeps using plain `npm test`.

import { spawn, execSync } from "node:child_process";

const IS_WIN = process.platform === "win32";
const HARD_TIMEOUT_MS = 240_000; // 4 min backstop
const GRACE_AFTER_RESULT_MS = 1_500; // let the host record results first

/** Kill ONLY the temp-profile Zotero — its command line carries the
 *  `.scaffold/test/profile` path, which the user's MAIN Zotero never
 *  has, so matching 'scaffold' is safe and distinctive. Single-quoted
 *  PowerShell strings only (no nested double quotes) so the command
 *  survives Node's cmd.exe layer — an earlier `\"…\"` form silently
 *  failed there, and the `scaffold..test..profile` regex never matched
 *  (single backslashes, not two chars). */
function killTestZotero() {
  if (!IS_WIN) return;
  try {
    execSync(
      "powershell -NoProfile -Command \"Get-CimInstance Win32_Process | " +
        "? { $_.Name -eq 'zotero.exe' -and $_.CommandLine -match 'scaffold' } | " +
        "% { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }\"",
      { stdio: "ignore" },
    );
  } catch {
    /* best-effort */
  }
}

const child = spawn("npx", ["zotero-plugin", "test"], {
  shell: true,
  stdio: ["inherit", "pipe", "pipe"],
});

let resultSeen = false;
function onData(buf) {
  const s = buf.toString();
  process.stdout.write(s);
  // The scaffold reporter logs this once, on the mocha "end" event,
  // BEFORE the (broken) auto-quit. It's our reliable completion signal.
  if (!resultSeen && /Test run completed/i.test(s)) {
    resultSeen = true;
    setTimeout(killTestZotero, GRACE_AFTER_RESULT_MS);
  }
}
child.stdout.on("data", onData);
child.stderr.on("data", onData);

const backstop = setTimeout(() => {
  console.error(
    "\n[test-local] no completion after " +
      HARD_TIMEOUT_MS / 1000 +
      "s — force-closing the test Zotero (stall).",
  );
  killTestZotero();
}, HARD_TIMEOUT_MS);

child.on("exit", (code) => {
  clearTimeout(backstop);
  process.exit(code ?? 0);
});
