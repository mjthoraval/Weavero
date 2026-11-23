// Node-tier unit tests for src/lib/open-guard.ts: which files a link may hand
// to the system (the in-Zotero guard is test/open-guard.spec.js).
import { expect } from "chai";
import { wvFileExt, wvIsRunnableFile, wvIsImageFileName, WV_RUNNABLE_EXTENSIONS } from "../../src/lib/open-guard";

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
