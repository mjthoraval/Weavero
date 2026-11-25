// Node-tier unit tests for src/lib/open-guard.ts: which files a link may hand
// to the system (the in-Zotero guard is test/open-guard.spec.js).
import { expect } from "chai";
import { wvFileExt, wvIsRunnableFile, wvIsImageFileName, wvHasNoExtension, wvIsProgramHeader, WV_RUNNABLE_EXTENSIONS } from "../../src/lib/open-guard";

describe("lib/open-guard — wvFileExt()", () => {
    it("the last extension, lower case", () => {
        expect(wvFileExt("Paper.PDF")).to.equal("pdf");
        expect(wvFileExt("data.tar.gz")).to.equal("gz");
        expect(wvFileExt("Supplementary data (PDF).exe")).to.equal("exe");
    });
    it("Windows' trailing dots and spaces dropped first", () => {
        expect(wvFileExt("run.exe.")).to.equal("exe");
        expect(wvFileExt("run.exe . ")).to.equal("exe");
    });
    it("a path's folders are ignored", () => {
        expect(wvFileExt("C:\\a.b\\file")).to.equal("");
        expect(wvFileExt("/home/x.y/notes.sh")).to.equal("sh");
    });
    it("no extension, nothing", () => {
        expect(wvFileExt("README")).to.equal("");
        expect(wvFileExt("")).to.equal("");
        expect(wvFileExt(null)).to.equal("");
    });
});

describe("lib/open-guard — wvIsRunnableFile()", () => {
    it("programs, scripts, shortcuts and installers of every platform", () => {
        for (const n of ["a.exe", "a.BAT", "a.cmd", "a.com", "a.scr", "a.pif", "a.msi", "a.hta", "a.js", "a.jse", "a.vbs", "a.vbe",
            "a.wsf", "a.wsh", "a.ps1", "a.psm1", "a.lnk", "a.url", "a.jar", "a.reg", "a.cpl", "a.msc", "a.app", "a.command",
            "a.sh", "a.desktop", "a.appref-ms", "a.chm", "a.scf", "a.pdf.exe", "a.exe."]) {
            expect(wvIsRunnableFile(n), n).to.equal(true);
        }
    });
    it("documents and data are not", () => {
        for (const n of ["a.pdf", "a.epub", "a.html", "a.docx", "a.xlsx", "a.csv", "a.txt", "a.png", "a.zip", "a.mp4", "a", ""]) {
            expect(wvIsRunnableFile(n), n).to.equal(false);
        }
    });
    it("the list is lower case and has no duplicates", () => {
        expect(WV_RUNNABLE_EXTENSIONS.every((e) => e === e.toLowerCase())).to.equal(true);
        expect(new Set(WV_RUNNABLE_EXTENSIONS).size).to.equal(WV_RUNNABLE_EXTENSIONS.length);
    });
});

describe("lib/open-guard — wvHasNoExtension()", () => {
    it("no dot, a trailing dot, or a dot only in front (a hidden Unix file)", () => {
        for (const n of ["README", "/home/x/run-me", "C:\\a.b\\file", "run.", ".profile", "/home/x/.bashrc", ""]) {
            expect(wvHasNoExtension(n), n).to.equal(true);
        }
    });
    it("a name with an extension has one", () => {
        for (const n of ["paper.pdf", "/home/x.y/notes.txt", ".config.json", "data.bin"]) {
            expect(wvHasNoExtension(n), n).to.equal(false);
        }
    });
});

describe("lib/open-guard — wvIsProgramHeader()", () => {
    const b = (...x: number[]) => new Uint8Array(x);
    it("a script's #!, ELF, Mach-O (both widths, both byte orders) and a universal binary", () => {
        expect(wvIsProgramHeader(b(0x23, 0x21))).to.equal(true);
        expect(wvIsProgramHeader(b(0x23, 0x21, 0x2f, 0x62))).to.equal(true);
        expect(wvIsProgramHeader(b(0x7f, 0x45, 0x4c, 0x46))).to.equal(true);
        for (const h of [[0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xce, 0xfa, 0xed, 0xfe], [0xcf, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe]]) {
            expect(wvIsProgramHeader(b(...h)), h.join(",")).to.equal(true);
        }
    });
    it("documents and short or empty files are not", () => {
        expect(wvIsProgramHeader(b(0x25, 0x50, 0x44, 0x46))).to.equal(false);   // %PDF
        expect(wvIsProgramHeader(b(0x50, 0x4b, 0x03, 0x04))).to.equal(false);   // a zip (docx)
        expect(wvIsProgramHeader(b(0x23))).to.equal(false);
        expect(wvIsProgramHeader(b(0x7f, 0x45, 0x4c))).to.equal(false);
        expect(wvIsProgramHeader(b())).to.equal(false);
        expect(wvIsProgramHeader(null)).to.equal(false);
    });
});

describe("lib/open-guard — wvIsImageFileName()", () => {
    it("image files by their name", () => {
        expect(wvIsImageFileName("Graphical abstract.PNG")).to.equal(true);
        expect(wvIsImageFileName("toc.jpeg")).to.equal(true);
    });
    it("a picture named as a program is not one", () => {
        expect(wvIsImageFileName("Graphical abstract.hta")).to.equal(false);
        expect(wvIsImageFileName("toc.png.exe")).to.equal(false);
    });
});
