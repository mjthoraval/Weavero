/* Closing a reader tab must not leave Weavero's inner-reader observer
 * throwing on the dead window.
 *
 * Found 2026-09-17 by the plugin-compat lab (AM 0.7.1): every reader
 * close/reopen logged one
 *   NS_ERROR_NOT_INITIALIZED … _setupInnerReaderObserver/wireUp/observer<
 * because the MutationObserver's teardown batch arrived after the docshell
 * was gone and `innerWin.setTimeout` threw. Reproduced with and without
 * companions (one error per reload either way), so it is Weavero's own.
 * Guard: the observer bails on a dead window and its timer calls are wrapped.
 */
describe("Weavero — reader close leaves no dead-window observer errors", function () {
    this.timeout(60000);
    let win, att, reader;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            try { const v = fn(); if (v) return v; } catch (e) {}
            await sleep(250);
        }
        throw new Error("timeout waiting for " + what);
    };
    function minimalPDFBytes() {
        const objs = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n",
        ];
        let body = "%PDF-1.4\n";
        const offsets = [];
        for (const o of objs) { offsets.push(body.length); body += o; }
        const xrefPos = body.length;
        let xref = "xref\n0 4\n0000000000 65535 f \n";
        for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
        return body + xref + "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n"
            + xrefPos + "\n%%EOF\n";
    }
    const deadWindowErrors = () => (Zotero.getErrors(true) || []).map(String)
        .filter(e => /NOT_INITIALIZED/.test(e) && /weavero/i.test(e)).length;

    before(async function () {
        const wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        win = Zotero.getMainWindow();
        const path = PathUtils.join(PathUtils.tempDir, "wv-close-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, minimalPDFBytes());
        att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path) });
    });

    after(async function () {
        try { if (reader && reader.tabID) win.Zotero_Tabs.close(reader.tabID); } catch (e) {}
        try { if (att) await att.eraseTx(); } catch (e) {}
    });

    it("open, close and reopen a reader three times without a NOT_INITIALIZED error", async function () {
        const baseline = deadWindowErrors();
        for (let i = 0; i < 3; i++) {
            await Zotero.Reader.open(att.id, null, { allowDuplicate: false });
            reader = await waitFor(() => Zotero.Reader._readers.find(r => r.itemID === att.id
                && r._internalReader && r._iframeWindow), 30000, "reader " + i);
            // Let the inner-reader observer wire up and run at least one scan.
            await sleep(1500);
            win.Zotero_Tabs.close(reader.tabID);
            reader = null;
            await sleep(1200);
            assert.equal(deadWindowErrors() - baseline, 0,
                "close #" + (i + 1) + " must not throw from the inner observer");
        }
    });
});
