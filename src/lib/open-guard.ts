// Which files a link, a row or a card may hand to the system -- pure, no
// Zotero (unit-tested under Node, test/unit/open-guard.unit.ts).
//
// The rule (url.ts `_wvMayOpenAttachment`): a file Zotero's reader shows
// opens; a file the system would RUN (a program, a script, a shortcut, an
// installer) is never opened from a link; any other file Zotero cannot show
// opens only after the user confirms, with its real name in front of them.

/** Extensions the system runs, interprets or installs instead of showing:
 *  Windows (PATHEXT, the Windows Script Host, shortcuts, installers, control
 *  panel and management snap-ins, help and settings files that run code,
 *  mounted images), macOS (applications, installers, scripts, Terminal
 *  commands, web locations) and Linux (shell scripts, desktop entries,
 *  self-running and package files), plus Java and common script
 *  interpreters an installed runtime opens by default. */
export const WV_RUNNABLE_EXTENSIONS: readonly string[] = [
    // Windows programs and PATHEXT
    "exe", "com", "bat", "cmd", "scr", "pif", "cpl", "msc",
    // Windows Script Host and PowerShell
    "js", "jse", "vbs", "vbe", "vb", "wsf", "wsh", "wsc", "ws", "sct", "hta",
    "ps1", "ps1xml", "ps2", "ps2xml", "psc1", "psc2", "psd1", "psm1", "msh", "msh1", "msh2", "mshxml", "msh1xml", "msh2xml",
    // installers and packages
    "msi", "msp", "mst", "appx", "appxbundle", "msix", "msixbundle", "appinstaller", "application", "appref-ms", "xbap", "gadget", "vsix",
    // shortcuts, settings and registry
    "lnk", "url", "scf", "website", "library-ms", "search-ms", "searchconnector-ms", "settingcontent-ms", "reg", "inf", "ins", "isp", "chm", "hlp", "diagcab", "xll", "shb", "shs",
    // disk images (mounted, their contents then run)
    "iso", "img", "vhd", "vhdx",
    // Java and interpreted scripts
    "jar", "jnlp", "py", "pyw", "pyz", "pyzw", "pyc", "pyo", "pl", "rb", "php", "tcl", "lua",
    // macOS
    "app", "command", "tool", "terminal", "pkg", "mpkg", "dmg", "scpt", "scptd", "applescript", "workflow", "action", "osax", "prefpane", "webloc", "inetloc", "fileloc", "kext",
    // Linux and Unix
    "sh", "bash", "zsh", "csh", "ksh", "fish", "run", "desktop", "appimage", "deb", "rpm", "snap", "flatpak", "flatpakref",
    // browser and Zotero add-ons
    "xpi", "crx",
];

const RUNNABLE = new Set(WV_RUNNABLE_EXTENSIONS);

/** Extensions an image viewer opens (the reference card's picture). */
export const WV_IMAGE_EXTENSIONS: readonly string[] = [
    "png", "jpg", "jpeg", "jpe", "jfif", "gif", "webp", "avif", "bmp", "tif", "tiff", "svg", "ico", "heic", "heif",
];
const IMAGE = new Set(WV_IMAGE_EXTENSIONS);

/** The extension of a file name (lower case, no dot; "" when it has none).
 *  Trailing dots and spaces go first: Windows drops them, so "run.exe ." is
 *  "run.exe" to the system. A path's folders are ignored. */
export function wvFileExt(name: unknown): string {
    let s = String(name == null ? "" : name);
    const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
    if (slash >= 0) s = s.slice(slash + 1);
    let end = s.length;
    while (end > 0 && (s[end - 1] === "." || s[end - 1] === " ")) end--;
    s = s.slice(0, end);
    const dot = s.lastIndexOf(".");
    if (dot < 0) return "";
    return s.slice(dot + 1).toLowerCase();
}

/** A file the system would run rather than show. */
export function wvIsRunnableFile(name: unknown): boolean {
    const ext = wvFileExt(name);
    return !!ext && RUNNABLE.has(ext);
}

/** Whether a file NAME has no extension: none after the last dot, or a dot
 *  only in front (a hidden Unix file, `.profile`). A path's folders are
 *  ignored, Windows' trailing dots and spaces dropped (wvFileExt). */
export function wvHasNoExtension(name: unknown): boolean {
    let s = String(name == null ? "" : name);
    const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
    if (slash >= 0) s = s.slice(slash + 1);
    return !wvFileExt(s) || s.lastIndexOf(".") === 0;
}

/** Whether a file's first bytes are those of a program the system runs as
 *  it is: a script's `#!`, an ELF binary (Linux), a Mach-O binary (32 or
 *  64 bits, either byte order) or a macOS universal binary. Off Windows, a
 *  file with the executable bit AND such a start is a program whatever its
 *  name (url.ts `_wvRunsAsProgram`; MJT 2026-11-24, "Bit + program
 *  content"). */
export function wvIsProgramHeader(bytes: ArrayLike<number> | null | undefined): boolean {
    if (!bytes || bytes.length < 2) return false;
    const b = (i: number) => (i < bytes.length ? bytes[i] : -1);
    if (b(0) === 0x23 && b(1) === 0x21) return true;   // "#!"
    if (bytes.length < 4) return false;
    const four = [b(0), b(1), b(2), b(3)].map((x) => x.toString(16).padStart(2, "0")).join("");
    return ["7f454c46",                                  // ELF
        "feedface", "feedfacf", "cefaedfe", "cffaedfe",  // Mach-O
        "cafebabe"].includes(four);                      // universal binary
}

/** A file an image viewer opens, by its extension. */
export function wvIsImageFileName(name: unknown): boolean {
    const ext = wvFileExt(name);
    return !!ext && IMAGE.has(ext);
}
