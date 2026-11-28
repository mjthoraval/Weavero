# Reference identification: where Weavero fills in for Zotero

Zotero 11 reads a PDF's structure: its in-text citations and its reference list. With that,
it shows a reference's text when you rest the pointer on a citation. On some PDFs it finds
neither, and Weavero then reads the reference list itself so its References features still
work there.

This page records those cases publicly, with the papers they come from, so that anyone, Zotero's
developers included, can check them and reuse whatever is useful. Each case says what Zotero
finds, what Weavero does instead, and when Weavero's rule can retire.

## How the cases are checked

- **The papers are real published articles** (DOIs below), from the maintainer's library.
- **At every new Zotero beta or release**, each case is checked again with that version: the
  reference entries Zotero's structure data marks as references, and the in-text citations the
  reader finds on the pages. The result goes in the case's log.
- **When Zotero handles a case itself,** Weavero's rule for it is reviewed. It retires if it
  no longer adds anything, or it is narrowed to what Zotero still misses.

## Cases

| Case | What Zotero misses | Weavero's rule | Status |
|---|---|---|---|
| [R1](#r1-a-numbered-reference-list-that-zotero-does-not-mark) | a numbered reference list | reads the list itself | in development (1.2.1) |
| [R2](#r2-no-in-text-citations-a-page-picture-instead-of-the-reference) | the in-text citations, so a picture of the page is shown | the reference's text from its own list | in development (1.2.1) |

### R1: a numbered reference list that Zotero does not mark

**What Zotero finds.** In these papers' structure data, no entry of the reference list is marked as
a reference (Zotero 11.0-beta.4, PDF processor version 15, Windows; checked 2026-11-20).

| Paper | DOI | Weavero reads |
|---|---|---|
| Baggaley, Laurie & Barenghi 2012, "Vortex-Density Fluctuations, Energy Spectra, and Vortical Regions in Superfluid Turbulence", *Physical Review Letters* 109, 205304 | [10.1103/PhysRevLett.109.205304](https://doi.org/10.1103/PhysRevLett.109.205304) | 29 entries |
| Tsai, Hendrix, Dijkstra, Shui et al. 2011, "Microscopic structure influencing macroscopic splash at high Weber number", *Soft Matter* 7, 11325 | [10.1039/c1sm05801k](https://doi.org/10.1039/c1sm05801k) | 26 entries |
| Backhaus, Turitsyn & Ecke 2011, "Convective Instability and Mass Transport of Diffusion Layers in a Hele-Shaw Geometry", *Physical Review Letters* 106, 104501 | [10.1103/PhysRevLett.106.104501](https://doi.org/10.1103/PhysRevLett.106.104501) | 21 entries |

**Weavero's rule.** When Zotero marks no reference, Weavero looks in the same structure data for a
numbered list, labelled "[1]", "1.", "(1)" or with superscript numbers, after the paper's own
title, and reads its entries with their positions on the page
([src/lib/ref-list.ts](../src/lib/ref-list.ts), `wvRefList`). A paper with no list that cites in
footnotes has them read from its page footers.

**Retire when.** Zotero marks these reference lists itself, and Weavero's own reading finds
nothing more on the other cases.

**Log.**
- 2026-11-20, Zotero 11.0-beta.4 (PDF processor v15): 0 references marked by Zotero in each of the
  three papers; Weavero reads 29, 26 and 21 entries.

### R2: no in-text citations, a picture of the page instead of the reference

**What Zotero finds.** In Baggaley et al. 2012 and Backhaus et al. 2011, Zotero 11 recognises no
in-text citation (11.0-beta.4, PDF processor v15, Windows; checked 2026-11-20). Each citation
number there is the PDF's own link to the reference list, with a link of Zotero's text matcher
over the same number. Resting the pointer on it shows Zotero's link preview, a picture of the
reference-list page, where Zotero shows the reference's text for the citations it recognises. In
Tsai et al. 2011 the citations are superscript numbers with no link at all: the reader shows
nothing on them, and this case does not cover them. Zotero 10.0.8 recognises the citations of
the two Physical Review Letters papers itself.

**Weavero's rule.** When the reader is about to show the preview of a PDF link that none of
Zotero's citations covers, Weavero looks at where the link goes. If it lands on an entry of the
list Weavero reads (R1), the reader shows that entry's text in its own citation popup instead of
the picture. In a numbered list the entry is the one carrying the link's number, among the
entries just below the destination. A link that is not a number in a numbered list (a footnote
mark, "Fig. 1", "1(d)"), or whose destination is not close to an entry, keeps its picture. A
link that is one number of a citation group lists the whole group, as Zotero's own popup does:
Backhaus et al. 2011 links the "4" and the "9" of "[4–9]" separately, and either one shows
entries 4 to 9. A number beside the link joins the group only when a link of the page covers
it too. A click on the link still goes where the PDF's link goes. The rule acts link by link, only where
Zotero has nothing, so it steps aside on its own once Zotero recognises the citations
([src/modules/refs-cards.ts](../src/modules/refs-cards.ts), `wvRefsCardEntryFor`,
`_wvRefsCardSwap`).

**How it is checked.** On each paper, every link whose text is a number is hovered: the popup
must show the entry with that number, never another, and links that are not citations keep their
picture. In the test suite: [test/refs-cards.spec.js](../test/refs-cards.spec.js), a PDF built
for the test whose numbered citations are plain links, on Zotero 11 beta and 10.0.8.

**Retire when.** Zotero shows its own reference text for these papers' citations.

**Log.**
- 2026-11-20, Zotero 11.0-beta.4 (PDF processor v15): no citation found by the reader on the first
  pages of the three papers. The citation links of Baggaley et al. and Backhaus et al. show the
  page picture; Tsai et al.'s citations carry no link.
- 2026-11-20, Zotero 11.0-beta.4, Weavero 1.2.1-refscard.5 (counted per link, the PDF's links and
  Zotero's text-matcher links over the same numbers): Baggaley et al. 2012, 98 of the 114 links
  whose text is a number show the entry with that number and none shows another; the other 16 go
  to figures and equations and keep their picture. Backhaus et al. 2011, 66 of 79, none wrong; the
  other 13 go to figures. No card on any of the 56 other links (footnote marks, "Fig. 1", "1(d)").
- 2026-11-20, Zotero 11.0-beta.4, Weavero 1.2.1-dev.51 (groups): Backhaus et al. 2011, pages 1 to
  3, every link of "[4–9]" lists entries 4 to 9, of "[12,13]" entries 12 and 13, of "[15,16]"
  entries 15 and 16; the single citations list their one entry.
  Tsai et al. 2011: no link under its citations, nothing to act on. Zotero 10.0.8 has its own
  citations in both papers, and the rule does not act there.
