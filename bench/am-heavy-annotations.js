(async () => {
  try {
    const att = await Zotero.Items.getAsync(276);
    await att.loadAllData();
    const pad = (n, w) => String(n).padStart(w, "0");

    // Heavy LaTeX + Markdown payloads. Every template is multi-line and
    // structurally rich; delimiter coverage: $..$, $$..$$, \(..\), \[..\].
    const templates = [
      (i) => "## Ann " + i + " — momentum budget\n\n"
        + "$$\\frac{\\partial \\rho u_i}{\\partial t} + \\frac{\\partial}{\\partial x_j}\\left(\\rho u_i u_j\\right) = -\\frac{\\partial p}{\\partial x_i} + \\frac{\\partial}{\\partial x_j}\\left[\\mu\\left(\\frac{\\partial u_i}{\\partial x_j} + \\frac{\\partial u_j}{\\partial x_i} - \\frac{2}{3}\\delta_{ij}\\frac{\\partial u_k}{\\partial x_k}\\right)\\right] + \\rho g_i$$\n\n"
        + "With $\\mathrm{Re} = \\frac{\\rho U L}{\\mu}$ and $\\mathrm{We} = \\frac{\\rho U^2 L}{\\sigma}$:\n\n"
        + "- **laminar** if $\\mathrm{Re} \\lesssim 2300$\n"
        + "  - sub-case: Stokes, $\\mathrm{Re} \\ll 1$\n"
        + "  - sub-case: Oseen correction\n"
        + "- *transitional* otherwise, see https://doi.org/10.1017/jfm.2018.12",
      (i) => "### Ann " + i + " — eigenproblem\n\n"
        + "$$\\begin{pmatrix} \\lambda_{11} & \\lambda_{12} & \\lambda_{13} & \\lambda_{14} \\\\ \\lambda_{21} & \\lambda_{22} & \\lambda_{23} & \\lambda_{24} \\\\ \\lambda_{31} & \\lambda_{32} & \\lambda_{33} & \\lambda_{34} \\\\ \\lambda_{41} & \\lambda_{42} & \\lambda_{43} & \\lambda_{44} \\end{pmatrix} \\mathbf{v} = \\omega^2 \\mathbf{v}$$\n\n"
        + "| mode | $\\omega/2\\pi$ (Hz) | damping |\n|---|---|---|\n| 1 | $12.4$ | $0.02$ |\n| 2 | $37.1$ | $0.11$ |\n\n"
        + "> Block quote: the spectrum is discrete because $\\Omega$ is bounded — cf. `eig(A)` in the notebook, and zotero://select/library/items/ABCD2345",
      (i) => "**Ann " + i + "** — energy cascade, inline-heavy: the flux $\\varepsilon = -\\frac{\\mathrm{d}}{\\mathrm{d}t}\\int_0^\\infty E(k)\\,\\mathrm{d}k$ balances $\\nu \\int_0^\\infty 2 k^2 E(k)\\,\\mathrm{d}k$, giving $E(k) = C_K \\varepsilon^{2/3} k^{-5/3}$ for $k_L \\ll k \\ll k_\\eta$ where $k_\\eta = (\\varepsilon/\\nu^3)^{1/4}$, $C_K \\approx 1.5$, and the Taylor microscale $\\lambda = \\sqrt{15 \\nu u'^2/\\varepsilon}$; the anisotropy tensor $b_{ij} = \\frac{\\overline{u_i u_j}}{2k} - \\frac{\\delta_{ij}}{3}$ has invariants $\\mathrm{II} = -b_{ij}b_{ji}/2$, $\\mathrm{III} = b_{ij}b_{jk}b_{ki}/3$.",
      (i) => "#### Ann " + i + " — alternative delimiters\n\n"
        + "Paren form \\(\\Gamma(z) = \\int_0^\\infty t^{z-1} e^{-t}\\,\\mathrm{d}t\\) and bracket display:\n\n"
        + "\\[\\zeta(s) = \\prod_{p\\ \\mathrm{prime}} \\frac{1}{1 - p^{-s}}, \\qquad \\Re(s) > 1\\]\n\n"
        + "```python\nfor k in range(1, N):\n    E[k] = C_K * eps**(2/3) * k**(-5/3)\n```\n"
        + "1. first ordered item with $\\sqrt{\\frac{a^2+b^2}{c^2}}$\n"
        + "2. second, nested:\n"
        + "   - bullet with `inline code` and ***bold-italic***\n"
        + "   - bullet with a URL https://arxiv.org/abs/2301.00001",
      (i) => "Ann " + i + " — boundary layer summary: with $\\delta_{99}$, $\\delta^* = \\int_0^\\infty (1 - \\frac{u}{U_e})\\,\\mathrm{d}y$ and $\\theta = \\int_0^\\infty \\frac{u}{U_e}(1 - \\frac{u}{U_e})\\,\\mathrm{d}y$, the shape factor $H = \\delta^*/\\theta$ falls from $2.59$ (Blasius) toward $1.4$ in turbulence.\n\n"
        + "$$C_f = \\frac{\\tau_w}{\\tfrac{1}{2}\\rho U_e^2} = \\frac{0.664}{\\sqrt{\\mathrm{Re}_x}} \\quad \\text{(laminar)}, \\qquad C_f \\approx \\frac{0.0592}{\\mathrm{Re}_x^{1/5}} \\quad \\text{(turbulent)}$$\n\n"
        + "- [ ] verify against Fig. 7\n- [x] recompute $\\mathrm{Re}_\\theta$ — **done**, see https://example.org/notes/re-theta",
    ];

    const N = 200;
    const t0 = Date.now();
    let created = 0;
    await Zotero.DB.executeTransaction(async () => {
      for (let i = 0; i < N; i++) {
        const page = Math.floor((i * 1000) / N);
        const ann = new Zotero.Item("annotation");
        ann.libraryID = att.libraryID;
        ann.parentID = att.id;
        ann.annotationType = "highlight";
        ann.annotationText = "sample passage " + i;
        ann.annotationComment = templates[i % 5](i);
        ann.annotationColor = "#a28ae5";
        ann.annotationPageLabel = String(page + 1);
        ann.annotationSortIndex = pad(page, 5) + "|" + pad(i * 10, 6) + "|" + pad(200, 5);
        ann.annotationPosition = JSON.stringify({ pageIndex: page, rects: [[100, 400, 400, 415]] });
        ann.addTag("wv-am-perf-test");
        await ann.save({ skipSelect: true });
        created++;
      }
    });
    // Verify no escape mangling survived the pipeline: the stored comment
    // must contain a literal backslash sequence.
    const probe = att.getAnnotations().find(a => a.hasTag("wv-am-perf-test"));
    const sample = probe ? String(probe.annotationComment) : "";
    return JSON.stringify({
      created,
      ms: Date.now() - t0,
      backslashIntact: sample.indexOf("\\frac") !== -1 || sample.indexOf("\\rho") !== -1
        || sample.indexOf("\\delta") !== -1,
      sampleStart: sample.slice(0, 90),
    });
  } catch (e) {
    return "ERR: " + e.message + " | " + (e.stack || "").split("\n")[0];
  }
})()