/* global describe, it, before, assert, Zotero */

// References in your library: the matcher (src/lib/ref-match.ts, published as
// Zotero.Weavero.lib), offline, on a fixture from the 2026-11-11 test library
// (work/reference-feature-feasibility-2026-11-18.md): 66 regular items (10
// papers with a PDF each, the works they cite that the library holds, a
// distractor), and the reference texts of Zotero 11.0-beta.4's own citation
// popups for the 10 papers, with which library items each paper really cites
// (checked by hand against Crossref, 2026-11-11). Anonymous: titles, DOIs,
// URLs, first authors, years, volumes and pages only; ids renumbered.
//
// To keep it small, a popup text is kept only when one of the matcher's rules
// could fire on it: it holds a library DOI, a library title (compact, 10+
// characters) or a library first author's surname (compact). Every rule needs
// one of these, so the dropped texts (335 of 627) cannot be marked whatever
// the rules decide, rightly or wrongly. A new rule that needs none of them
// regenerates the fixture with every text (D:/tmp/wv-scripts/refs-fixture-gen.py
// --all-texts).
//
// Done-when (plan): no false marks, and at least 75% of the in-library
// references found. Measured on 1.1.1-refs.1 (node, the same code): 57 of 73,
// 0 false; Reference Checker's method alone found 55 (the offline prototype).

describe("Weavero — references in your library: the matcher", function () {
    let L;
    const FIXTURE = /*FIXTURE*/{
        "items": [
            {"title": "Drop impact on viscous liquid films", "DOI": "10.1017/jfm.2023.13", "url": "https://www.cambridge.org/core/product/identifier/S0022112023000137/type/journal_article", "extra": "", "first": "Sanjay", "date": "2023", "volume": "958", "pages": "A25", "pdf": true, "id": 1},
            {"title": "Theory of the jets ejected after the inertial collapse of cavities with applications to bubble bursting jets", "DOI": "10.1103/PhysRevFluids.8.073606", "url": "https://link.aps.org/doi/10.1103/PhysRevFluids.8.073606", "extra": "", "first": "Gordillo", "date": "2023", "volume": "8", "pages": "073606", "pdf": true, "id": 2},
            {"title": "Bouncing or Merging in Drop-Bath Impacts", "DOI": "10.48550/arXiv.2611.07942", "url": "http://arxiv.org/abs/2611.07942", "extra": "", "first": "Lewin-Jones", "date": "2026", "volume": "", "pages": "", "pdf": true, "id": 3},
            {"title": "Review of experimental studies of secondary ice production", "DOI": "10.5194/acp-20-11767-2020", "url": "https://acp.copernicus.org/articles/20/11767/2020/", "extra": "", "first": "Korolev", "date": "2020", "volume": "20", "pages": "11767-11797", "pdf": true, "id": 4},
            {"title": "Analysis of animal-to-human translation shows that only 5% of animal-tested therapeutic interventions obtain regulatory approval for human applications", "DOI": "10.1371/journal.pbio.3002667", "url": "https://dx.plos.org/10.1371/journal.pbio.3002667", "extra": "", "first": "Ineichen", "date": "2024", "volume": "22", "pages": "e3002667", "pdf": true, "id": 5},
            {"title": "The flow of ideas: shared symbolism during the Neolithic emergence in Southwest Asia: WF16 and Göbekli Tepe", "DOI": "10.15184/aqy.2023.67", "url": "https://www.cambridge.org/core/product/identifier/S0003598X23000674/type/journal_article", "extra": "", "first": "Mithen", "date": "2023", "volume": "97", "pages": "829-849", "pdf": true, "id": 6},
            {"title": "Spray Drying: An Overview", "DOI": "10.5772/intechopen.72247", "url": "http://www.intechopen.com/books/biomaterials-physics-and-chemistry-new-edition/spray-drying-an-overview", "extra": "", "first": "Pignatello", "date": "2018", "volume": "", "pages": "", "pdf": true, "id": 7},
            {"title": "Waterdrop collisions with solid surfaces", "DOI": "10.6028/jres.054.033", "url": "https://nvlpubs.nist.gov/nistpubs/jres/54/jresv54n5p281_A1b.pdf", "extra": "", "first": "Engel", "date": "1955", "volume": "54", "pages": "281", "pdf": true, "id": 8},
            {"title": "Unifying Theory of Scaling in Drop Impact: Forces and Maximum Spreading Diameter", "DOI": "10.1103/PhysRevLett.134.104003", "url": "https://link.aps.org/doi/10.1103/PhysRevLett.134.104003", "extra": "", "first": "Sanjay", "date": "2025", "volume": "134", "pages": "104003", "pdf": true, "id": 9},
            {"title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", "DOI": "10.18653/v1/N19-1423", "url": "https://aclanthology.org/N19-1423", "extra": "", "first": "Devlin", "date": "2019", "volume": "", "pages": "4171-4186", "pdf": true, "id": 10},
            {"title": "Non-wetting impact of a sphere onto a bath and its application to bouncing droplets", "DOI": "10.1017/jfm.2017.424", "url": "https://www.cambridge.org/core/product/identifier/S0022112017004244/type/journal_article", "extra": "", "first": "Galeano-Rios", "date": "2017", "volume": "826", "pages": "97-127", "pdf": true, "id": 11},
            {"title": "Dimple drainage before the coalescence of a droplet deposited on a smooth substrate", "DOI": "10.1073/pnas.2007857117", "url": "https://pnas.org/doi/full/10.1073/pnas.2007857117", "extra": "", "first": "Duchemin", "date": "2020", "volume": "117", "pages": "20416-20422", "pdf": false, "id": 12},
            {"title": "A quadtree-adaptive multigrid solver for the Serre–Green–Naghdi equations", "DOI": "10.1016/j.jcp.2015.09.009", "url": "https://linkinghub.elsevier.com/retrieve/pii/S0021999115005902", "extra": "", "first": "Popinet", "date": "2015", "volume": "302", "pages": "336-358", "pdf": false, "id": 13},
            {"title": "Phenomena of liquid drop impact on solid and liquid surfaces", "DOI": "10.1016/0169-5983(93)90106-K", "url": "https://iopscience.iop.org/article/10.1016/0169-5983(93)90106-K", "extra": "", "first": "Rein", "date": "1993", "volume": "12", "pages": "61-93", "pdf": false, "id": 14},
            {"title": "Advanced Transport Phenomena: Fluid Mechanics and Convective Transport Processes", "DOI": "10.1017/CBO9780511800245", "url": "https://www.cambridge.org/core/product/identifier/9780511800245/type/book", "extra": "", "first": "Leal", "date": "2007", "volume": "", "pages": "", "pdf": false, "id": 15},
            {"title": "Drop Impact on Superheated Surfaces", "DOI": "10.1103/PhysRevLett.108.036101", "url": "https://link.aps.org/doi/10.1103/PhysRevLett.108.036101", "extra": "", "first": "Tran", "date": "2012", "volume": "108", "pages": "036101", "pdf": false, "id": 16},
            {"title": "Breakup of Air Bubbles in Water: Memory and Breakdown of Cylindrical Symmetry", "DOI": "10.1103/PhysRevLett.97.144503", "url": "https://link.aps.org/doi/10.1103/PhysRevLett.97.144503", "extra": "", "first": "Keim", "date": "2006", "volume": "97", "pages": "144503", "pdf": true, "id": 17},
            {"title": "Bursting bubble in a viscoplastic medium", "DOI": "10.1017/jfm.2021.489", "url": "https://www.cambridge.org/core/product/identifier/S0022112021004894/type/journal_article", "extra": "", "first": "Sanjay", "date": "2021", "volume": "922", "pages": "A2", "pdf": true, "id": 18},
            {"title": "Highly Focused Supersonic Microjets", "DOI": "10.1103/PhysRevX.2.031002", "url": "https://link.aps.org/doi/10.1103/PhysRevX.2.031002", "extra": "", "first": "Tagawa", "date": "2012", "volume": "2", "pages": "031002", "pdf": false, "id": 19},
            {"title": "Ocean Spray", "DOI": "10.1146/annurev-fluid-010814-014651", "url": "https://www.annualreviews.org/doi/10.1146/annurev-fluid-010814-014651", "extra": "", "first": "Veron", "date": "2015", "volume": "47", "pages": "507-538", "pdf": false, "id": 20},
            {"title": "Axisymmetric bubble collapse in a quiescent liquid pool. I. Theory and numerical simulations", "DOI": "10.1063/1.3009297", "url": "https://pubs.aip.org/pof/article/20/11/112103/256195/Axisymmetric-bubble-collapse-in-a-quiescent-liquid", "extra": "", "first": "Gordillo", "date": "2008", "volume": "20", "pages": "112103", "pdf": false, "id": 21},
            {"title": "An accurate adaptive solver for surface-tension-driven interfacial flows", "DOI": "10.1016/j.jcp.2009.04.042", "url": "https://linkinghub.elsevier.com/retrieve/pii/S002199910900240X", "extra": "", "first": "Popinet", "date": "2009", "volume": "228", "pages": "5838-5866", "pdf": false, "id": 22},
            {"title": "Inertio-capillary rebound of a droplet impacting a fluid bath", "DOI": "10.1017/jfm.2023.88", "url": "https://www.cambridge.org/core/product/identifier/S0022112023000885/type/journal_article", "extra": "", "first": "Alventosa", "date": "2023", "volume": "958", "pages": "A24", "pdf": true, "id": 23},
            {"title": "Skating on a Film of Air: Drops Impacting on a Surface", "DOI": "10.1103/PhysRevLett.108.074503", "url": "https://link.aps.org/doi/10.1103/PhysRevLett.108.074503", "extra": "", "first": "Kolinski", "date": "2012", "volume": "108", "pages": "074503", "pdf": true, "id": 24},
            {"title": "From Bouncing to Floating: Noncoalescence of Drops on a Fluid Bath", "DOI": "10.1103/PhysRevLett.94.177801", "url": "https://link.aps.org/doi/10.1103/PhysRevLett.94.177801", "extra": "", "first": "Couder", "date": "2005", "volume": "94", "pages": "177801", "pdf": false, "id": 25},
            {"title": "Drop Impact on a Solid Surface", "DOI": "10.1146/annurev-fluid-122414-034401", "url": "https://www.annualreviews.org/content/journals/10.1146/annurev-fluid-122414-034401", "extra": "", "first": "Josserand", "date": "2016", "volume": "48", "pages": "365-391", "pdf": false, "id": 26},
            {"title": "Gas Microfilms in Droplet Dynamics: When Do Drops Bounce?", "DOI": "10.1146/annurev-fluid-121021-021121", "url": "https://www.annualreviews.org/doi/10.1146/annurev-fluid-121021-021121", "extra": "", "first": "Sprittles", "date": "2024", "volume": "56", "pages": "91-118", "pdf": false, "id": 27},
            {"title": "Dynamics of droplet–film collision", "DOI": "10.1017/S002211200700657X", "url": "https://www.cambridge.org/core/product/identifier/S002211200700657X/type/journal_article", "extra": "", "first": "Pan", "date": "2007", "volume": "587", "pages": "1-22", "pdf": false, "id": 28},
            {"title": "On the importance of small ice crystals in tropical anvil cirrus", "DOI": "10.5194/acp-9-5519-2009", "url": "https://acp.copernicus.org/articles/9/5519/2009/", "extra": "", "first": "Jensen", "date": "2009", "volume": "9", "pages": "5519-5537", "pdf": true, "id": 29},
            {"title": "Freezing of Water Drops", "DOI": "10.3189/S0022143000022371", "url": "https://www.cambridge.org/core/product/identifier/S0022143000022371/type/journal_article", "extra": "", "first": "Murray", "date": "1972", "volume": "11", "pages": "415-429", "pdf": true, "id": 30},
            {"title": "Formation of Ice Crystals in Ordinary and Nuclei-Free Air", "DOI": "10.1021/ie50510a033", "url": "https://pubs.acs.org/doi/abs/10.1021/ie50510a033", "extra": "", "first": "Schaefer", "date": "1952", "volume": "44", "pages": "1300-1304", "pdf": false, "id": 31},
            {"title": "CRACK FORMATION IN ICE PLATES BY THERMAL SHOCK", "DOI": "10.1139/p63-172", "url": "https://cdnsciencepub.com/doi/10.1139/p63-172", "extra": "", "first": "Gold", "date": "1963", "volume": "41", "pages": "1712-1728", "pdf": false, "id": 32},
            {"title": "The mechanism of ice splinter production during riming", "DOI": "10.1029/GL007i002p00167", "url": "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/GL007i002p00167", "extra": "", "first": "Mossop", "date": "1980", "volume": "7", "pages": "167-169", "pdf": false, "id": 33},
            {"title": "Habits of ice grown in supercooled water and aqueous solutions", "DOI": "10.1080/14786436608211977", "url": "https://www.tandfonline.com/doi/full/10.1080/14786436608211977", "extra": "", "first": "Macklin", "date": "1966", "volume": "14", "pages": "847-860", "pdf": false, "id": 34},
            {"title": "Dose Articulation in Preclinical and Clinical Stroke Recovery: Refining a Discovery Research Pipeline and Presenting a Scoping Review Protocol", "DOI": "10.3389/fneur.2019.01148", "url": "https://www.frontiersin.org/article/10.3389/fneur.2019.01148/full", "extra": "", "first": "Dalton", "date": "2019", "volume": "10", "pages": "1148", "pdf": true, "id": 35},
            {"title": "Preclinical to Clinical Translation of Studies of Transcranial Direct-Current Stimulation in the Treatment of Epilepsy: A Systematic Review", "DOI": "10.3389/fnins.2018.00189", "url": "http://journal.frontiersin.org/article/10.3389/fnins.2018.00189/full", "extra": "", "first": "Regner", "date": "2018", "volume": "12", "pages": "189", "pdf": true, "id": 36},
            {"title": "Translational challenges of remote ischemic conditioning in ischemic stroke – a systematic review", "DOI": "10.1002/acn3.51405", "url": "https://onlinelibrary.wiley.com/doi/10.1002/acn3.51405", "extra": "", "first": "Hansen", "date": "2021", "volume": "8", "pages": "1720-1729", "pdf": false, "id": 37},
            {"title": "Investigator initiated trials versus industry sponsored trials - translation of randomized controlled trials into clinical practice (IMPACT)", "DOI": "10.1186/s12874-021-01359-x", "url": "https://bmcmedresmethodol.biomedcentral.com/articles/10.1186/s12874-021-01359-x", "extra": "", "first": "Blümle", "date": "2021", "volume": "21", "pages": "182", "pdf": false, "id": 38},
            {"title": "Systematic Reviews and Meta-Analysis of Preclinical Studies: Why Perform Them and How to Appraise Them Critically", "DOI": "10.1038/jcbfm.2014.28", "url": "https://journals.sagepub.com/doi/10.1038/jcbfm.2014.28", "extra": "", "first": "Sena", "date": "2014", "volume": "34", "pages": "737-742", "pdf": false, "id": 39},
            {"title": "Design, power, and interpretation of studies in the standard murine model of ALS", "DOI": "10.1080/17482960701856300", "url": "https://www.tandfonline.com/doi/full/10.1080/17482960701856300", "extra": "", "first": "Scott", "date": "2008", "volume": "9", "pages": "4-15", "pdf": false, "id": 40},
            {"title": "Lime plaster cover of the dead 12,000 years ago – new evidence for the origins of lime plaster technology", "DOI": "10.1017/ehs.2019.9", "url": "https://www.cambridge.org/core/product/identifier/S2513843X19000094/type/journal_article", "extra": "", "first": "Friesem", "date": "2019", "volume": "1", "pages": "e9", "pdf": true, "id": 41},
            {"title": "Nahal Ein Gev II, a Late Natufian Community at the Sea of Galilee", "DOI": "10.1371/journal.pone.0146647", "url": "https://dx.plos.org/10.1371/journal.pone.0146647", "extra": "", "first": "Grosman", "date": "2016", "volume": "11", "pages": "e0146647", "pdf": true, "id": 42},
            {"title": "The origins of sedentism and farming communities in the Levant", "DOI": "10.1007/BF00975111", "url": "http://link.springer.com/10.1007/BF00975111", "extra": "", "first": "Bar-Yosef", "date": "1989", "volume": "3", "pages": "447-498", "pdf": false, "id": 43},
            {"title": "New insights on plant domestication, production intensification, and food storage: the archaeobotanical evidence from PPNA Dhra‘", "DOI": "10.1080/00758914.2018.1424746", "url": "https://www.tandfonline.com/doi/full/10.1080/00758914.2018.1424746", "extra": "", "first": "Colledge", "date": "2018", "volume": "50", "pages": "14-31", "pdf": false, "id": 44},
            {"title": "Developing a complex network model of obsidian exchange in the Neolithic Near East: Linear regressions, ethnographic models and archaeological data", "DOI": "10.3406/paleo.2016.5718", "url": "https://www.persee.fr/doc/paleo_0153-9345_2016_num_42_2_5718", "extra": "", "first": "Ibáñez", "date": "2016", "volume": "42", "pages": "9-32", "pdf": false, "id": 45},
            {"title": "Prelude to village life. Environmental data and building traditions of the Epipalaeolithic settlement at Körtik Tepe, Southeastern Turkey", "DOI": "10.3406/paleo.2015.5673", "url": "https://www.persee.fr/doc/paleo_0153-9345_2015_num_41_2_5673", "extra": "", "first": "Benz", "date": "2015", "volume": "41", "pages": "9-30", "pdf": false, "id": 46},
            {"title": "Spray Drying Technique. I: Hardware and Process Parameters", "DOI": "10.1002/jps.21886", "url": "https://linkinghub.elsevier.com/retrieve/pii/S0022354916303926", "extra": "", "first": "Cal", "date": "2010", "volume": "99", "pages": "575-586", "pdf": false, "id": 47},
            {"title": "Spray Drying Techniques for Food Ingredient Encapsulation", "DOI": "10.1002/9781118863985", "url": "https://onlinelibrary.wiley.com/doi/book/10.1002/9781118863985", "extra": "", "first": "Anandharamakrishnan", "date": "2015", "volume": "", "pages": "", "pdf": false, "id": 48},
            {"title": "Spray drying technology: an overview", "DOI": "10.17485/ijst/2009/v2i10.3", "url": "https://indjst.org/articles/spray-drying-technology-an-overview", "extra": "", "first": "Patel", "date": "2009", "volume": "2", "pages": "44-47", "pdf": false, "id": 49},
            {"title": "Particle formation in spray drying", "DOI": "10.1016/j.jaerosci.2007.04.005", "url": "https://linkinghub.elsevier.com/retrieve/pii/S0021850207000699", "extra": "", "first": "Vehring", "date": "2007", "volume": "38", "pages": "728-746", "pdf": false, "id": 50},
            {"title": "Progress in developing spray-drying methods for the production of controlled morphology particles: From the nanometer to submicrometer size ranges", "DOI": "10.1016/j.apt.2010.09.011", "url": "https://linkinghub.elsevier.com/retrieve/pii/S0921883110001883", "extra": "", "first": "Nandiyanto", "date": "2011", "volume": "22", "pages": "1-19", "pdf": false, "id": 51},
            {"title": "Handbook of Drying for Dairy Products", "DOI": "10.1002/9781118930526", "url": "https://onlinelibrary.wiley.com/doi/book/10.1002/9781118930526", "extra": "", "first": "Anandharamakrishnan", "date": "2017", "volume": "", "pages": "", "pdf": false, "id": 52},
            {"title": "XXVIII. On the forms assumed by drops of liquids falling vertically on a horizontal plate", "DOI": "10.1098/rspl.1876.0048", "url": "https://royalsocietypublishing.org/rspl/article/25/171-178/261/37842/XXVIII-On-the-forms-assumed-by-drops-of-liquids", "extra": "", "first": "Worthington", "date": "1877", "volume": "25", "pages": "261-272", "pdf": false, "id": 53},
            {"title": "III. A second paper on the forms assumed by drops of liquids falling vertically on a horizontal plate", "DOI": "10.1098/rspl.1876.0073", "url": "https://royalsocietypublishing.org/rspl/article/25/171-178/498/37714/III-A-second-paper-on-the-forms-assumed-by-drops", "extra": "", "first": "Worthington", "date": "1877", "volume": "25", "pages": "498-503", "pdf": false, "id": 54},
            {"title": "A theory on the spreading of impacting droplets", "DOI": "10.1017/jfm.2019.117", "url": "https://www.cambridge.org/core/product/identifier/S0022112019001174/type/journal_article", "extra": "", "first": "Gordillo", "date": "2019", "volume": "866", "pages": "298-315", "pdf": true, "id": 55},
            {"title": "Statistical hydrodynamics", "DOI": "10.1007/BF02780991", "url": "http://link.springer.com/10.1007/BF02780991", "extra": "", "first": "Onsager", "date": "1949", "volume": "6", "pages": "279-287", "pdf": false, "id": 56},
            {"title": "Drop impact on a solid surface: short-time self-similarity", "DOI": "10.1017/jfm.2016.142", "url": "https://www.cambridge.org/core/product/identifier/S0022112016001427/type/journal_article", "extra": "", "first": "Philippi", "date": "2016", "volume": "795", "pages": "96-135", "pdf": false, "id": 57},
            {"title": "DROP IMPACT DYNAMICS: Splashing, Spreading, Receding, Bouncing…", "DOI": "10.1146/annurev.fluid.38.050304.092144", "url": "https://www.annualreviews.org/doi/10.1146/annurev.fluid.38.050304.092144", "extra": "", "first": "Yarin", "date": "2006", "volume": "38", "pages": "159-192", "pdf": false, "id": 58},
            {"title": "Ultrafast Interference Imaging of Air in Splashing Dynamics", "DOI": "10.1103/PhysRevLett.107.154502", "url": "https://link.aps.org/doi/10.1103/PhysRevLett.107.154502", "extra": "", "first": "Driscoll", "date": "2011", "volume": "107", "pages": "154502", "pdf": false, "id": 59},
            {"title": "Deep Contextualized Word Representations", "DOI": "10.18653/v1/N18-1202", "url": "http://aclweb.org/anthology/N18-1202", "extra": "", "first": "Peters", "date": "2018", "volume": "", "pages": "2227-2237", "pdf": true, "id": 60},
            {"title": "Universal Language Model Fine-tuning for Text Classification", "DOI": "10.18653/v1/P18-1031", "url": "http://aclweb.org/anthology/P18-1031", "extra": "", "first": "Howard", "date": "2018", "volume": "", "pages": "328-339", "pdf": true, "id": 61},
            {"title": "Glove: Global Vectors for Word Representation", "DOI": "10.3115/v1/D14-1162", "url": "http://aclweb.org/anthology/D14-1162", "extra": "", "first": "Pennington", "date": "2014", "volume": "", "pages": "1532-1543", "pdf": false, "id": 62},
            {"title": "SWAG: A Large-Scale Adversarial Dataset for Grounded Commonsense Inference", "DOI": "10.18653/v1/D18-1009", "url": "http://aclweb.org/anthology/D18-1009", "extra": "", "first": "Zellers", "date": "2018", "volume": "", "pages": "93-104", "pdf": false, "id": 63},
            {"title": "Discussion: “Laboratory Investigations of the Mechanism of Cavitation” (Knapp, R. T., and Hollander, A., 1948, Trans. ASME, 70, pp. 419–431)", "DOI": "10.1115/1.4017760", "url": "https://asmedigitalcollection.asme.org/fluidsengineering/article/70/5/432/1152834/Discussion-Laboratory-Investigations-of-the", "extra": "", "first": "Spannhake", "date": "1948", "volume": "70", "pages": "432-433", "pdf": false, "id": 64},
            {"title": "Translating translation", "DOI": "10.1038/nrd.2018.27", "url": "https://www.nature.com/articles/nrd.2018.27", "extra": "", "first": "Austin", "date": "2018", "volume": "17", "pages": "455-456", "pdf": false, "id": 65},
            {"title": "A Comparison of a Vote Count and a Meta-Analysis Review of Intervention Research With Adult Cancer Patients", "DOI": "10.1177/15527581-00010001-02", "url": "https://journals.sagepub.com/doi/10.1177/15527581-00010001-02", "extra": "", "first": "Cwikel", "date": "2000", "volume": "10", "pages": "139-158", "pdf": false, "id": 66},
        ],
        "papers": {
            "01": {
                "citing": 1, "truth": [[11], [12], [13], [14], [15], [16], [22], [25], [26], [28], [53], [58]],
                "texts": [
                    "YARIN, A.L., ROISMAN, I.V. & TROPEA, C. 2017 Collision Phenomena in Liquids and Solids. Cambridge University Press.",
                    "REIN, M. 1993 Phenomena of liquid drop impact on solid and liquid surfaces. Fluid Dyn. Res. 12 (2), 61.",
                    "WEISS, D.A. & YARIN, A.L. 1999 Single drop impact onto liquid films: neck distortion, jetting, tiny bubble entrainment, and crown formation. J. Fluid Mech. 385, 229–254.",
                    "YARIN, A.L. 2006 Drop impact dynamics: splashing, spreading, receding, bouncing . . . . Annu. Rev. Fluid Mech. 38, 159–192.",
                    "JOSSERAND, C. & THORODDSEN, S.T. 2016 Drop impact on a solid surface. Annu. Rev. Fluid Mech. 48, 365–391.",
                    "WORTHINGTON, A.M. 1877 On the forms assumed by drops of liquids falling vertically on a horizontal plate. Proc. R. Soc. Lond. A 25 (171–178), 261–272.",
                    "WORTHINGTON, A.M. 1908 A Study of Splashes. Longman, Green and Co.",
                    "VAN DER VEEN, R.C., TRAN, T., LOHSE, D. & SUN, C. 2012 Direct measurements of air layer profiles under impacting droplets using high-speed color interferometry. Phys. Rev. E 85 (2), 026315.",
                    "KOLINSKI, J.M., MAHADEVAN, L. & RUBINSTEIN, S.M. 2014 Drops can bounce from perfectly hydrophilic surfaces. Europhys. Lett. 108 (2), 24001.",
                    "PAN, K.L. & LAW, C.K. 2007 Dynamics of droplet–film collision. J. Fluid Mech. 587, 1–22.",
                    "TANG, X., SAHA, A., LAW, C.K. & SUN, C. 2018 Bouncing-to-merging transition in drop impact on liquid film: role of liquid viscosity. Langmuir 34 (8), 2654–2662.",
                    "COUDER, Y., FORT, E., GAUTIER, C.H. & BOUDAOUD, A. 2005a From bouncing to floating: noncoalescence of drops on a fluid bath. Phys. Rev. Lett. 94 (17), 177801.",
                    "COUDER, Y., PROTIERE, S., FORT, E. & BOUDAOUD, A. 2005b Walking and orbiting droplets. Nature 437 (7056), 208–208.",
                    "CHANTELOT, P. & LOHSE, D. 2021 Leidenfrost effect as a directed percolation phase transition. Phys. Rev. Lett. 127 (12), 124502.",
                    "TRAN, T., STAAT, H.J.J., PROSPERETTI, A., SUN, C. & LOHSE, D. 2012 Drop impact on superheated surfaces. Phys. Rev. Lett. 108 (3), 036101.",
                    "SHIROTA, M., VAN LIMBEEK, M.A.J., SUN, C., PROSPERETTI, A. & LOHSE, D. 2016 Dynamic Leidenfrost effect: relevant time and length scales. Phys. Rev. Lett. 116 (6), 064501.",
                    "CHUBYNSKY, M.V., BELOUSOV, K.I., LOCKERBY, D.A. & SPRITTLES, J.E. 2020 Bouncing off the walls: the influence of gas-kinetic and van der Waals effects in drop impact. Phys. Rev. Lett. 124, 084501.",
                    "LI, E.Q., VAKARELSKI, I.U. & THORODDSEN, S.T. 2015 Probing the nanoscale: the first contact of an impacting drop. J. Fluid Mech. 785, R2.",
                    "LO, H.Y., LIU, Y. & XU, L. 2017 Mechanism of contact between a droplet and an atomically smooth substrate. Phys. Rev. X 7 (2), 021036.",
                    "DUCHEMIN, L. & JOSSERAND, C. 2020 Dimple drainage before the coalescence of a droplet deposited on a smooth substrate. Proc. Natl Acad. Sci. USA 117 (34), 20416–20422.",
                    "PROSPERETTI, A. 1977 Viscous effects on perturbed spherical flows. Q. Appl. Maths 34 (4), 339–352.",
                    "GALEANO-RIOS, C.A., CIMPEANU, R., BAUMAN, I.A., MACEWEN, A., MILEWSKI, P.A. & HARRIS, D.M. 2021 Capillary-scale solid rebounds: experiments, modelling and simulations. J. Fluid Mech. 912, A17.",
                    "REIZMAN, F. 1965 Optical thickness measurement of thin transparent films on silicon. J. Appl. Phys. 36 (12), 3804–3807.",
                    "POPINET, S. et al. 2013–2022a Basilisk C. Available at: http://basilisk.fr.",
                    "TRYGGVASON, G., SCARDOVELLI, R. & ZALESKI, S. 2011 Direct Numerical Simulations of Gas–Liquid Multiphase Flows. Cambridge University Press.",
                    "RAMÍREZ-SOTO, O., SANJAY, V., LOHSE, D., PHAM, J.T. & VOLLMER, D. 2020 Lifting a sessile oil drop from a superamphiphobic surface with an impacting one. Sci. Adv. 6 (34), eaba4330.",
                    "NARU, M.C. 2021 Numerical simulation of a water/oil emulsion in a multiscale/multiphysics context. PhD thesis, Sorbonne University.",
                    "POPINET, S. 2015 A quadtree-adaptive multigrid solver for the Serre–Green–Naghdi equations. J. Comput. Phys. 302, 336–358.",
                    "SANJAY, V. 2022 Code repository: drop impact on viscous liquid films. Available at: https://github.com/ VatsalSy/Drop-impact-on-viscous-liquid-films.",
                    "JOSSERAND, C., RAY, P. & ZALESKI, S. 2016 Droplet impact on a thin liquid film: anatomy of the splash. J. Fluid Mech. 802, 775–805.",
                    "LING, Y., FUSTER, D., ZALESKI, S. & TRYGGVASON, G. 2017 Spray formation in a quasiplanar gas–liquid mixing layer at moderate density ratios: a numerical closeup. Phys. Fluids 2 (1), 014005.",
                    "POPINET, S. 2009 An accurate adaptive solver for surface-tension-driven interfacial flows. J. Comput. Phys. 228 (16), 5838–5866.",
                    "POPINET, S. et al. 2013–2022b Basilisk C: surface tension library. Available at: http://basilisk.fr/src/tension.h.",
                    "WACHTERS, L.H.J. & WESTERLING, N.A.J. 1966 The heat transfer from a hot wall to impinging water drops in the spheroidal state. Chem. Engng Sci. 21 (11), 1047–1056.",
                    "EGGERS, J., FONTELOS, M.A., JOSSERAND, C. & ZALESKI, S. 2010 Drop dynamics after impact on a solid wall: theory and simulations. Phys. Fluids 22 (6), 062101.",
                    "LEAL, L.G. 2007 Advanced Transport Phenomena: Fluid Mechanics and Convective Transport Processes, vol. 7. Cambridge University Press.",
                    "LANDAU, L.D. & LIFSHITZ, E.M. 1987 Fluid Mechanics – Volume 6: Course of Theoretical Physics, 2nd edn. Elsevier.",
                    "ZHANG, B., SANJAY, V., SHI, S., ZHAO, Y., LV, C. & LOHSE, D. 2022 Impact forces of water drops falling on superhydrophobic surfaces. Phys. Rev. Lett. 129 (10), 104501.",
                    "GALEANO-RIOS, C.A., MILEWSKI, P.A. & VANDEN-BROECK, J.-M. 2017 Non-wetting impact of a sphere onto a bath and its application to bouncing droplets. J. Fluid Mech. 826, 97–127.",
                    "SANJAY, V., CHANTELOT, P. & LOHSE, D. 2023 When does an impacting drop stop bouncing? J. Fluid Mech. 958, A26.",
                    "BARTOLO, D., JOSSERAND, C. & BONN, D. 2006 Singular jets and bubbles in drop impact. Phys. Rev. Lett. 96 (12), 124501.",
                    "TANG, X., SAHA, A., LAW, C.K. & SUN, C. 2016 Nonmonotonic response of drop impacting on liquid film: mechanism and scaling. Soft Matt. 12 (20), 4521–4529.",
                ],
            },
            "02": {
                "citing": 2, "truth": [[17], [18], [19], [20], [21], [22]],
                "texts": [
                ],
            },
            "03": {
                "citing": 3, "truth": [[1], [12], [13], [14], [23], [24], [25], [26], [27], [28], [58], [59]],
                "texts": [
                    "Liang, Gangtao & Mudawar, Issam2017 Review of spray cooling – Part 1: Single-phase and nucleate boiling regimes, and critical heat flux.International Journal of Heat and Mass Transfer115, 1174–1205.",
                    "Rein, Martin1993 Phenomena of liquid drop impact on solid and liquid surfaces.Fluid Dynamics Research 12(2), 61–93.",
                    "Yarin, A.l.2006 DROP IMPACT DYNAMICS: Splashing, Spreading, Receding, Bouncing. . . .Annual Review of Fluid Mechanics38(1), 159–192.",
                    "Jayaratne, O. W., Mason, Basil John, Bartlett, J. T. & Blackett, Patrick Maynard Stuart1964 The coalescence and bouncing of water drops at an air/water interface.Proceedings of the Royal Society of London. Series A. Mathematical and Physical Sciences280(1383), 545–565.",
                    "Pan, K. L. & Law, C. K.2007 Dynamics of droplet–film collision.Journal of Fluid Mechanics587, 1–22.",
                    "Klyuzhin, Ivan S., Ienna, Federico, Roeder, Brandon, Wexler, Adam & Pollack, Gerald H.2010 Persisting Water Droplets on Water Surfaces.The Journal of Physical Chemistry B114(44), 14020–14027.",
                    "Driscoll, Michelle M. & Nagel, Sidney R.2011 Ultrafast Interference Imaging of Air in Splashing Dynamics.Physical Review Letters107(15), 154502.",
                    "van der Veen, Roeland C. A., Tran, Tuan, Lohse, Detlef & Sun, Chao2012 Direct measurements of air layer profiles under impacting droplets using high-speed color interferometry.Physical Review E 85(2), 026315.",
                    "Josserand, C. & Thoroddsen, S.T.2016 Drop Impact on a Solid Surface.Annual Review of Fluid Mechanics48(1), 365–391.",
                    "Lewin-Jones, Peter, Lockerby, Duncan A. & Sprittles, James E.2024 Collision of liquid drops: Bounce or merge?Journal of Fluid Mechanics995, A1.",
                    "Wu, Xian & Saha, Abhishek2022 Droplet impact on liquid films: Bouncing-to-merging transitions for two-liquid systems.Physics of Fluids34(10), 103313.",
                    "Chubynsky, Mykyta V., Belousov, Kirill I., Lockerby, Duncan A. & Sprittles, James E.2020 Bouncing off the Walls: The Influence of Gas-Kinetic and van der Waals Effects in Drop Impact. Physical Review Letters124(8), 084501.",
                    "Li, Jie2016 Macroscopic Model for Head-On Binary Droplet Collisions in a Gaseous Medium.Physical Review Letters117(21), 214502.",
                    "Albertoni, Sergio, Cercignani, Carlo & Gotusso, Laura1963 Numerical Evaluation of the Slip Coefficient.Physics of Fluids6(7), 993.",
                    "Huang, Kuan-Ling & Pan, Kuo-Long2021 Transitions of bouncing and coalescence in binary droplet collisions.Journal of Fluid Mechanics928, A7.",
                    "Popinet, Stéphane2015 A quadtree-adaptive multigrid solver for the Serre–Green–Naghdi equations. Journal of Computational Physics302, 336–358.",
                    "Gabbard, Chase T., Aguero, Elvis A., Cimpeanu, Radu, Kuehr, Katharina, Silver, Eli, Barotta, Jack-William, Galeano-Rios, Carlos A. & Harris, Daniel M.2025 Drop rebound at low Weber number.Journal of Fluid Mechanics1019, A25.",
                    "Harris, Daniel M., Alventosa, Luke, Sand, Oliver, Silver, Eli, Mohammadi, Arman, Sykes, Thomas C., Castrejoń -Pita, Alfonso A. & Cimpeanu, Radu2026 Bouncing to coalescence transition for droplet impact onto moving liquid pools.Journal of Fluid Mechanics1030, A16.",
                    "Alventosa, Luke F. L., Cimpeanu, Radu & Harris, Daniel M.2023 Inertio-capillary rebound of a droplet impacting a fluid bath.Journal of Fluid Mechanics958, A24.",
                    "Tang, Xiaoyu, Saha, Abhishek, Law, Chung K. & Sun, Chao2016 Nonmonotonic response of drop impacting on liquid film: Mechanism and scaling.Soft Matter12(20), 4521–4529.",
                    "Temizer, İ. & Stupkiewicz, S.2016 Formulation of the Reynolds equation on a time-dependent lubrication surface.Proceedings of the Royal Society A: Mathematical, Physical and Engineering Sciences 472(2187), 20160032.",
                    "Lo, Hau Yung, Liu, Yuan & Xu, Lei2017 Mechanism of Contact between a Droplet and an Atomically Smooth Substrate.Physical Review X7(2), 021036.",
                    "Phillips, K. A., Cimpeanu, R. & Milewski, P. A.2025 Modelling two-dimensional droplet rebound off deep fluid baths.Proceedings of the Royal Society A: Mathematical, Physical and Engineering Sciences 481(2317), 20240956.",
                    "Josserand, Christophe, Ray, Pascal & Zaleski, Stéphane2016 Droplet impact on a thin liquid film: Anatomy of the splash.Journal of Fluid Mechanics802, 775–805.",
                    "Cercignani, Carlo, Lampis, Maria & Lorenzani, Silvia2004 Plane Poiseuille Flow with Symmetric and Nonsymmetric Gas-Wall Interactions.Transport Theory and Statistical Physics33(5-7), 545–561.",
                ],
            },
            "04": {
                "citing": 4, "truth": [[29], [30], [31], [32], [33], [34]],
                "texts": [
                    "Hallett, J. and Mossop, S. C.: Production of secondary ice particles during the riming process, Nature, 249, 26–28, https://doi.org/10.1038/249026a0, 1974.",
                    "Dudetski, V. and Sidorov, I. : About structure of water droplets freezing under different conditions, Journal of Russian Physical and Chemical Society, 43, 340–343, 1911.",
                    "Malkina, A. D. and Zak, E. G.: Mechanism of freezing of liquid droplets, Transactions of the Central Aerological Observatory (Trudi TsAO), 9, 61–75, 1952.",
                    "Puzanov, P. and Accuratov, V. I.: Towards formation mechanism of some types of hail, Gidrologia i Meteorologia, N6, 29–33, 1952.",
                    "Schaefer, V. J.: Formation of Ice Crystals in Ordinary and Nuclei-Free Air, Ind. Eng. Chem., 44, 1300–1304, https://doi.org/10.1021/ie50510a033, 1952.",
                    "Mossop, S. C.: Concentrations of Ice Crystals in Clouds, B. Amer. Meteorol. Soc., 51, 474–479, https://doi.org/10.1175/15200477(1970)051<0474:COICIC>2.0.CO;2, 1970.",
                    "Mossop, S. C., Ono, A., and Heffernan, K. J.: Studies of ice crystal in natural clouds, Journal de Recherches Atmosphériques, 3, 45–64, 1964.",
                    "Mossop, S. C., Cottis, R. E., and Bartlett, B. M.: Ice crystal concentrations in cumulus and stratocumulus clouds, Q. J. Roy. Meteor. Soc., 98, 105–123, https://doi.org/10.1002/qj.49709841509, 1972.",
                    "Beard, K. V: Ice initiation in warm-base convective clouds: An assessment of microphysical mechanisms, Atmos. Res., 28, 125–152, https://doi.org/10.1016/0169-8095(92)90024-5, 1992.",
                    "Muchnik, V. M. and Rudko, J. S.: Peculiarities of freezing supercooled water drops, Transactions of Ukrainian Hydro Meteorological Institute (Trudi UkrNIGMI), 26, 64–73, 1961.",
                    "Macklin, W. C. and Payne, G.: A theoretical study of the ice accretion process, Q. J. Roy. Meteor. Soc., 93, 195–214. https://doi.org/10.1002/qj.49709339606, 1967.",
                    "Shibkov, A. A., Golovin, Yu. I., Zheltov, M. A., Korolev, A. A., and Leonov, A. A.: Morphology diagram of nonequilibrium patterns of ice crystals growing in supercooled water, Physica A, 319, 65 – 79, 2003.",
                    "Shibkov, A. A., Zheltov, M.A., Korolev, A. A., Kazakov, A. A., Leonov, A. A.: Crossover from diffusion-limited to kineticslimited growth of ice crystals. J. Cryst. Growth, 285, 215–227, https://doi.org/10.1016/j.jcrysgro.2005.08.007, 2005",
                    "Macklin, W. C. and Ryan, B. F.: Growth velocities of ice in supercooled water and aqueous sucrose solutions, Philos. Mag., 17, 83-87, https://doi.org/10.1080/14786436808218182, 1968.",
                    "Kallungal, J. P. and Barduhn, A. J.: Growth rate of an ice crystal in subcooled pure water, AiChe J., 23, 294–303, https://doi.org/10.1002/aic.690230312, 1977.",
                    "Muchnik, V. M. and Rudko, J. S.: Processes of cooling and freezing of water drops, Transactions of Ukrainian Hydro Meteorological Institute (Trudi UkrNIGMI), 31, 133–144, 1962.",
                    "Murray, W. A. and List, R.: Freezing of water drops, J. Glaciol., 11, 415–429, 1972",
                    "Hindmarsh, J. P., Russell, A. B., and Chen, X. D.: Experimental and numerical analysis of the temperature transition of a suspended freezing water droplet, Int. J. Heat Mass Tran., 46, 1199–1213, https://doi.org/10.1016/S0017-9310(02)00399-X, 2003.",
                    "Gupta, S. C. and Arora, P. R.: Analytical and numerical solutions of inward spherical solidification of a superheated melt with radiative–convective heat transfer and density jump at freezing front, Heat Mass Transfer, 27, 377–384, https://doi.org/10.1007/BF01600027, 1992.",
                    "Macklin, W. C. and Ryan, B. F.: The Structure of Ice Grown in Bulk Supercooled Water, J. Atmos. Sci., 22, 452–459, https://doi.org/10.1175/15200469(1965)022<0452:TSOIGI>2.0.CO;2, 1965.",
                    "Macklin, W. C. and Ryan, B. F.: Habits of ice grown in supercooled water and aqueous solutions, Philos. Mag., 14, 847–860, https://doi.org/10.1080/14786436608211977, 1966.",
                    "Iwabuchi, T. and Magono, C.: A Laboratory Experiment on the Freezing Electrification of Freely Falling Water Droplets, J. Meteorol. Soc. Jpn., 53, 393–401, https://doi.org/10.2151/jmsj1965.53.6_393, 1975.",
                    "Pruppacher, H. R. and Schlamp, R. J.: A wind tunnel investigation on ice multiplication by freezing of waterdrops falling at terminal velocity in air, J. Geophys. Res., 80, 380–386, https://doi.org/10.1029/jc080i003p00380, 1975.",
                    "Lauber, A., Kiselev, A., Pander, T., Handmann, P., and Leisner, T.: Secondary Ice Formation during Freezing of Levitated Droplets, J. Atmos. Sci., 75, 2815–2826, https://doi.org/10.1175/JAS-D18-0052.1, 2018.",
                    "Schaefer, V. S.: Condensed Water in the Free Atmosphere in Air Colder than −40C, J. Appl. Meteor., 1, 481–488, https://doi.org/10.1175/15200450(1962)001<0481:CWITFA>2.0.CO;2, 1962.",
                    "Bader, M., Gloster, J., Brownscombe, J. L. Goldsmith, P.: The production of sub-micron ice fragments by water droplets freezing in free fall or on accretion upon an ice surface, Q. J. Roy. Meteor. Soc., 100, 420–426, https://doi.org/10.1002/qj.49710042513, 1974.",
                    "Keinert, A., Spannagel, D., Leisner, T., and Kiselev, A.: Secondary ice production upon freezing of freely falling drizzle droplets, J. Atmos. Sci., 77, 2959–2967, https://doi.org/10.1175/JAS-D-200081.1, 2020.",
                    "Pander, T.: Laboratory ice multiplication experiments in levitated microdroplets, PhD dissertation, University of Heidelberg, https://doi.org/10.11588/heidok.00018784, 2015.",
                    "Macklin, W. C. and Payne, G. S.: Growth velocities of ice in supercooled water and aqueous sucrose solutions, Philos. Mag., 17, 83–87, https://doi.org/10.1080/14786436808218182, 1968.",
                    "Korolev, A., Heckman, I., Wolde, M., Ackerman, A. S., Fridlind, A. M., Ladino, L. A., Lawson, R. P., Milbrandt, J., and Williams, E.: A new look at the environmental conditions favorable to secondary ice production, Atmos. Chem. Phys., 20, 1391–1429, https://doi.org/10.5194/acp-20-1391-2020, 2020.",
                    "Macklin, W. C.: The Production of Ice Splinters During Riming, Nubila, 3, 30–33, 1960.",
                    "Mossop, S. C. and Hallett, J.: Ice Crystal Concentration in Cumulus Clouds: Influence of the Drop Spectrum, Science, 186, 632–634, https://doi.org/10.1126/science.186.4164.632, 1974.",
                    "Mossop, S. C.: Secondary ice particle production during rime growth: The effect of drop size distribution and rimer velocity, Q. J. Roy. Meteor. Soc., 111, 1113–1124, https://doi.org/10.1002/qj.49711147012, 1985b.",
                    "Saunders, C. P. R. and Hosseini, A. S.: A laboratory study of the effect of velocity on Hallett–Mossop ice crystal multiplication, Atmos. Res., 59, 3–14, https://doi.org/10.1016/S01698095(01)00106-5, 2001.",
                    "Heymsfield, A. J. and Mossop, S. C.: Temperature dependence of secondary ice crystal production during soft hail growth by riming, Q. J. Roy. Meteor. Soc., 110, 765–770, https://doi.org/10.1002/qj.49711046512, 1984.",
                    "Cotton, W. R., Tripoli, G. J., Rauber, R. M., Mulvihill, E. A.: Numerical Simulation of the Effects of Varying Ice Crystal Nucleation Rates and Aggregation Processes on Orographic Snowfall, J. Clim. Appl. Meteorol., 25, 1658–1680, https://doi.org/10.1175/15200450(1986)025<1658:NSOTEO>2.0.CO;2, 1986.",
                    "Reisner, J., Rasmussen, R. M., and Bruintjes, R. T.: Explicit forecasting of supercooled liquid water in winter storms using the MM5 mesoscale model, Q. J. Roy. Meteor. Soc., 124, 1071–1107, https://doi.org/10.1002/qj.49712454804, 1998.",
                    "Mossop, S. C.: Production of secondary ice particles during the growth of graupel by riming, Q. J. Roy. Meteor. Soc., 102, 45–57, https://doi.org/10.1002/qj.49710243104, 1976.",
                    "Mossop, S. C.: The mechanism of ice splinter production during riming, Geoph. Res. Lett., 7, 167–169, https://doi.org/10.1029/GL007i002p00167, 1980.",
                    "Macklin, W. C. and Payne, G. S.: The spreading of accreted droplets, Q. J. Roy. Meteor. Soc., 95, 724–730, https://doi.org/10.1002/qj.49709540606, 1969.",
                    "Takahashi, T.: High ice crystal production in winter cumuli over the Japan Sea, Geophys. Res. Lett., 20, 451–454, https://doi.org/10.1029/93GL00613, 1993.",
                    "Gold, L. W.: Crack formation in ice plates by thermal shock, Can. J. Phys., 4, 1712–1728, https://doi.org/10.1139/p63-172, 1963.",
                    "Rosinski, J., Nagamoto, C. T., and Kerrigan, T. C.: Heterogeneous nucleation of water and ice in the transient supersaturation field surrounding a freezing drop, Journal de Recherches Atmosphériques, 9, 107–117, 1975.",
                    "Fukuta, N. and Lee, H. J.: A Numerical Study of the Supersaturation Field around Growing Graupel, J. Atmos. Sci., 43, 1833–1843, https://doi.org/10.1175/15200469(1986)043<1833:ANSOTS>2.0.CO;2, 1986.",
                    "Chouippe, A., Krayer, M., Uhlmann, M., Dusek, J., Kiselev, A., and Leisner, T.: Heat and water vapor transfer in the wake of a falling ice sphere and its implication for secondary ice formation in clouds, New J. Phys., 21, 043043, https://doi.org/10.1088/13672630/ab0a94, 2019.",
                    "Schaefer, V. J. and Cheng, R. J.: The production of ice crystal fragments by sublimation and electrification, Journal de Recherches Atmosphériques, 5, 5–10, 1971.",
                    "Knollenberg, R. G.: Techniques for probing cloud microstructure, in: Clouds their Formation, Optical Properties, and Effects, edited by: Hobbs, P. V and Deepak, A., Academic Press, New York, 15–91,1981.",
                    "Korolev, A. V. and Isaac, G. A.: Shattering during sampling by OAPs and HVPS. Part 1: Snow particles, J. Atmos. Ocean. Tech., 22, 528–542, https://doi.org/10.1175/JTECH1720.1, 2005.",
                    "Field, P. R., Heymsfield, A. J., and Bansemer, A.: Shattering and Particle Interarrival Times Measured by Optical Array Probes in Ice Clouds, J. Atmos. Ocean. Tech., 23, 1357–1371, https://doi.org/10.1175/JTECH1922.1, 2006.",
                    "Korolev, A. V., Emery, E. F., Strapp, J. W., Cober, S. G., Isaac, G. A., Wasey, M., and Marcotte, D.: Small Ice Particles in Tropospheric Clouds: Fact or Artifact? Airborne Icing Instrumentation Evaluation Experiment, B. Am. Meteorol. Soc., 92, 967–973, https://doi.org/10.1175/2010BAMS3141.1, 2011.",
                    "Korolev, A. V., Emery, E., and Creelman, K.: Modification and Tests of Particle Probe Tips to Mitigate Effects of Ice Shattering, J. Atmos. Ocean. Tech., 30, 690–708, https://doi.org/10.1175/JTECH-D-12-00142.1, 2013a.",
                    "Korolev, A. V, Emery, E. F., Strapp, J. W., Cober, S. G., and Isaac, G. A.: Quantification of the Effects of Shattering on Airborne Ice Particle Measurements, J. Atmos. Ocean. Tech., 30, 2527–2553, https://doi.org/10.1175/JTECH-D-13-00115.1, 2013b.",
                    "McFarquhar, G. M., Um, J., Freer, M., Baumgardner, D., Kok, G. L., and Mace, G.: Importance of small ice crystals to cirrus properties: Observations from the Tropical Warm Pool International Cloud Experiment (TWP-ICE), Geophys. Res. Lett., 34, L13803, https://doi.org/10.1029/2007GL029865, 2007.",
                    "Jensen, E. J., Lawson, P., Baker, B., Pilson, B., Mo, Q., Heymsfield, A. J., Bansemer, A., Bui, T. P., McGill, M., Hlavka, D., Heymsfield, G., Platnick, S., Arnold, G. T., and Tanelli, S.: On the importance of small ice crystals in tropical anvil cirrus, Atmos. Chem. Phys., 9, 5519–5537, https://doi.org/10.5194/acp-95519-2009, 2009.",
                    "Jackson, R. C., McFarquhar, G. M., Stith, J., Beals, M., Shaw, R., Jensen, J., Fugal, J., and Korolev, A.: An assessment of the impact of anti-shattering tips and artifact removal",
                    "Korolev, A. V.: Reconstruction of the Sizes of Spherical Particles from Their Shadow Images. Part I: Theoretical Considerations, J. Atmos. Ocean. Tech., 24, 376–389, https://doi.org/10.1175/JTECH1980.1, 2007.",
                    "Vaillant de Guélis, T., Schwarzenböck, A., Shcherbakov, V., Gourbeyre, C., Laurent, B., Dupuy, R., Coutris, P., and Duroure, C.: Study of the diffraction pattern of cloud particles and the respective responses of optical array probes, Atmos. Meas. Tech., 12, 2513–2529, https://doi.org/10.5194/amt12-2513-2019, 2019.",
                    "Crosier, J., Choularton, T. W., Westbrook, C. D., Blyth, A. M., Bower, K. N., Connolly, P. J., Dearden, C., Gallagher, M. W., Cui, Z., and Nicol, J. C.: Microphysical properties of cold frontal rainbands, Q. J. Roy. Meteor. Soc., 140, 1257–1268, https://doi.org/10.1002/qj.2206, 2014.",
                    "Heymsfield, A. and Willis, P.: Cloud Conditions Favoring Secondary Ice Particle Production in Tropical Maritime Convection, J. Atmos. Sci., 71, 4500–4526, https://doi.org/10.1175/JAS-D14-0093.1, 2014.",
                    "Lawson, R. P., Woods, S., and Morrison, H.: The microphysics of ice and precipitation development in tropical cumulus clouds, J. Atmos. Sci., 72, 2429–2445, https://doi.org/10.1175/JAS-D-140274.1, 2015",
                    "Lasher-Trapp, S., Leon, D. C., DeMott, P. J., Villanueva-Birriel, C. M., Johnson, A. V, Moser, D. H., Tully, C. S., and Wu, W.: A Multisensor Investigation of Rime Splintering in Tropical Maritime Cumuli, J. Atmos. Sci., 73, 2547–2564, https://doi.org/10.1175/JAS-D-15-0285.1, 2016.",
                    "Ladino, L. A., Korolev, A., Heckman, I., Wolde, M., Fridlind, A. M., and Ackerman, A. S.: On the role of ice-nucleating aerosol in the formation of ice particles in tropical mesoscale convective systems, Geophys. Res. Lett., 44, 1574–1582, https://doi.org/10.1002/2016GL072455, 2017.",
                    "Korolev, A. V. , McFarquhar, G., Field, P. R., Franklin, C., Lawson, P., Wang, Z., Williams, E., Abel, S. J., Axisa, D., Borrmann, S., Crosier, J., Fugal, J., Krämer, M., Lohmann, U., Schlenczek, O., Schnaiter, M., and Wendisch, M.: MixedPhase Clouds: Progress and Challenges, Meteor. Mon., 58, 5.1–5.50, https://doi.org/10.1175/AMSMONOGRAPHS-D-170001.1, 2017.",
                    "McFarquhar, G. M., Ghan, S., Verlinde, J., Korolev, A., Strapp, J. W., Schmid, B., Tomlinson, J. M., Wolde, M., Brooks, S. D., Cziczo, D., Dubey, M. K., Fan, J., Flynn, C. R., Gultepe, I., Hubbe, J., Gilles, M. K., Laskin, A., Lawson, P., Leaitch, W. R., Liu, P., Liu, X., Lubin, D., Mazzoleni, C., Macdonald, A.M., Moffet, R. C., Morrison, H., Ovchinnikov, M., Shupe, M. D., Turner, D. D., Xie, S., ",
                    "Shaw, R. A., Cantrell, W., Chen, C., Chuang, P., Donahue, N., Feingold, G., Kollias, P., Korolev, A., Kreidenweis, S., Krueger, S., Mellado J. P., Niedermeier, D., Xue, L.: Cloud–Aerosol–Turbulence Interactions: Science Priorities and Concepts for a Large-Scale Laboratory Facility, B. Amer. Meteor. Soc., 101, E1026–E1035, https://doi.org/10.1175/BAMS-D-200009.1, 2020.",
                ],
            },
            "05": {
                "citing": 5, "truth": [[35], [36], [37], [38], [39], [40], [65], [66]],
                "texts": [
                    "2. Howells DW, Sena ES, Macleod MR. Bringing rigour to translational medicine. Nat Rev Neurol. 2014; 10(1):37. https://doi.org/10.1038/nrneurol.2013.232 PMID: 24247324",
                    "3. Ioannidis JP. Extrapolating from animals to humans. Sci Transl Med. 2012; 4(151):151ps15. Epub 2012/09/14. https://doi.org/10.1126/scitranslmed.3004631 PMID: 22972841.",
                    "4. Seyhan AA. Lost in translation: the valley of death across preclinical and clinical divide—identification of problems and overcoming obstacles. Transl Med Commun. 2019; 4(1):1–19.",
                    "7. Friese MA, Montalban X, Willcox N, Bell JI, Martin R, Fugger L. The value of animal models for drug development in multiple sclerosis. Brain J Neurol. 2006; 129(Pt 8):1940–1952. https://doi.org/10.1093/ brain/awl083 PMID: 16636022.",
                    "9. Ahmed Z, Fulton D, Douglas MR. Opicinumab: is it a potential treatment for multiple sclerosis? Ann Transl Med. 2020; 8(14). https://doi.org/10.21037/atm.2020.03.131 PMID: 32793736",
                    "10. Ruan Y, Robinson NB, Khan FM, Hameed I, Rahouma M, Naik A, et al. The translation of surgical animal models to human clinical research: A cross-sectional study. Int J Surg. 2020; 77:25–29. https://doi. org/10.1016/j.ijsu.2020.03.023 PMID: 32198098",
                    "17. Sena ES, Currie GL, McCann SK, Macleod MR, Howells DW. Systematic reviews and meta-analysis of preclinical studies: why perform them and how to appraise them critically. J Cereb Blood Flow Metab. 2014; 34(5):737–742. https://doi.org/10.1038/jcbfm.2014.28 PMID: 24549183",
                    "18. Austin CP. Translating translation. Nat Rev Drug Discov. 2018; 17(7):455–6. Epub 2018/04/21. https:// doi.org/10.1038/nrd.2018.27 PMID: 29674698.",
                    "19. Cwikel J, Behar L, Rabson-Hare J. A comparison of a vote count and a meta-analysis review of intervention research with adult cancer patients. Res Soc Work Pract. 2000; 10(1):139–158.",
                    "22. Hansen LF, Nielsen NSK, Christoffersen LC, Kruuse C. Translational challenges of remote ischemic conditioning in ischemic stroke—a systematic review. Ann Clin Transl Neurol. 2021; 8(8):1720–1729. https://doi.org/10.1002/acn3.51405 PMID: 34133841.",
                    "26. Voulgaropoulou SD, van Amelsvoort T, Prickaerts J, Vingerhoets C. The effect of curcumin on cognition in Alzheimer’s disease and healthy aging: A systematic review of pre-clinical and clinical studies. Brain Res. 2019; 1725:146476. https://doi.org/10.1016/j.brainres.2019.146476 PMID: 31560864.",
                    "27. Regner GG, Pereira P, Leffa DT, de Oliveira C, Vercelino R, Fregni F, et al. Preclinical to Clinical Translation of Studies of Transcranial Direct-Current Stimulation in the Treatment of Epilepsy: A Systematic Review. Front Neurosci. 2018; 12:189. https://doi.org/10.3389/fnins.2018.00189 PMID: 29623027.",
                    "29. Daldegan-Bueno D, Maia LO, Glass M, Jutras-Aswad D, Fischer B. Co-exposure of cocaine and cannabinoids and its association with select biological, behavioural and health outcomes: A systematic scoping review of multi-disciplinary studies. Eur Neuropsychopharmacol. 2021; 51:106–131. https://doi.org/ 10.1016/j.euroneuro.2021.06.002 PMID: 34273801.",
                    "30. Daldegan-Bueno D, Maia LO, Glass M, Jutras-Aswad D, Fischer B. Co-exposure of cannabinoids with amphetamines and biological, behavioural and health outcomes: a scoping review of animal and human studies. Psychopharmacology. 2022; 239(5):1211–1230. https://doi.org/10.1007/s00213-02105960-2 PMID: 34613429.",
                    "31. Reis DJ, Ilardi SS, Punt SEW. The anxiolytic effect of probiotics: A systematic review and meta-analysis of the clinical and preclinical literature. PLoS ONE [Electronic Resource]. 2018; 13(6):e0199041. https://doi.org/10.1371/journal.pone.0199041 PMID: 29924822.",
                    "32. Li Y, Fu SC, Cheuk YC, Song G, Feng H, Yung SH. The non-reconstructive treatment of complete ACL tear with biological enhancement in clinical and preclinical studies: A systematic review. Asia Pac J Sports Med Arthrosc Rehabil Technol. 2018; 14:10–16. https://doi.org/10.1016/j.asmart.2018.04.002 PMID: 30302314",
                    "33. Goldberg A, Mitchell K, Soans J, Kim L, Zaidi R. The use of mesenchymal stem cells for cartilage repair and regeneration: a systematic review. J Orthop Surg. 2017; 12(1):39. https://doi.org/10.1186/s13018017-0534-y PMID: 28279182.",
                    "34. Dalton EJ, Churilov L, Lannin NA, Corbett D, Campbell BCV, Hayward KS. Early-phase dose articulation trials are underutilized for post-stroke motor recovery: A systematic scoping review. Ann Phys Rehabil Med. 2022; 65(1):101487. https://doi.org/10.1016/j.rehab.2021.101487 PMID: 33429089.",
                    "36. Schmidt-Pogoda A, Bonberg N, Koecke MHM, Strecker JK, Wellmann J, Bruckmann NM, et al. Why Most Acute Stroke Studies Are Positive in Animals but Not in Patients: A Systematic Comparison of Preclinical, Early Phase, and Phase 3 Clinical Trials of Neuroprotective Agents. Ann Neurol. 2020; 87 (1):40–51. https://doi.org/10.1002/ana.25643 PMID: 31714631.",
                    "37. Baker TS, Durbin J, Troiani Z, Ascanio-Cortez L, Baron R, Costa A, et al. Therapeutic hypothermia for intracerebral hemorrhage: Systematic review and meta-analysis of the experimental and clinical literature. Int J Stroke. 2022; 17(5):506–516. https://doi.org/10.1177/17474930211044870 PMID: 34427479",
                    "38. Lalu MM, Montroy J, Dowlatshahi D, Hutton B, Juneau P, Wesch N, et al. From the Lab to Patients: a Systematic Review and Meta-Analysis of Mesenchymal Stem Cell Therapy for Stroke. Transl Stroke Res. 2020; 11(3):345–364. https://doi.org/10.1007/s12975-019-00736-5 PMID: 31654281.",
                    "39. Cottrill E, Pennington Z, Ahmed AK, Lubelski D, Goodwin ML, Perdomo-Pantoja A, et al. The effect of electrical stimulation therapies on spinal fusion: a cross-disciplinary systematic review and meta-analysis of the preclinical and clinical data. J Neurosurg Spine. 2019:1–21. https://doi.org/10.3171/2019.5. SPINE19465 PMID: 31593923.",
                    "40. Cottrill E, Pennington Z, Lankipalle N, Ehresman J, Valencia C, Schilling A, et al. The effect of bioactive glasses on spinal fusion: A cross-disciplinary systematic review and meta-analysis of the preclinical and clinical data. J Clin Neurosci. 2020; 78:34–46. https://doi.org/10.1016/j.jocn.2020.04.035 PMID: 32331941.",
                    "41. Lind PC, Johannsen CM, Vammen L, Magnussen A, Andersen LW, Granfeldt A. Translation from animal studies of novel pharmacological therapies to clinical trials in cardiac arrest: A systematic review. Resuscitation. 2021; 158:258–269. https://doi.org/10.1016/j.resuscitation.2020.10.028 PMID: 33147523.",
                    "42. Reynolds JC, Rittenberger JC, Menegazzi JJ. Drug administration in animal studies of cardiac arrest does not reflect human clinical experience. Resuscitation. 2007; 74(1):13–26. https://doi.org/10.1016/j. resuscitation.2006.10.032 PMID: 17360097",
                    "43. Lalu M, Leung GJ, Dong YY, Montroy J, Butler C, Auer RC, et al. Mapping the preclinical to clinical evidence and development trajectory of the oncolytic virus talimogene laherparepvec (T-VEC): a systematic review. BMJ Open. 2019; 9(12):e029475. https://doi.org/10.1136/bmjopen-2019-029475 PMID: 31796474.",
                    "44. Beuker C, Strecker JK, Rawal R, Schmidt-Pogoda A, Ruck T, Wiendl H, et al. Immune Cell Infiltration into the Brain After Ischemic Stroke in Humans Compared to Mice and Rats: a Systematic Review and Meta-Analysis. Transl Stroke Res. 2021; 12(6):976–90. Epub 20210126. https://doi.org/10.1007/ s12975-021-00887-4 PMID: 33496918.",
                    "45. Friedman LM, Furberg CD, DeMets DL, Reboussin DM, Granger CB. Fundamentals of clinical trials. Springer; 2015.",
                    "46. Eichler H-G, Abadie E, Breckenridge A, Flamion B, Gustafsson LL, Leufkens H, et al. Bridging the efficacy—effectiveness gap: a regulator’s perspective on addressing variability of drug response. Nat Rev Drug Discov. 2011; 10(7):495–506. https://doi.org/10.1038/nrd3501 PMID: 21720406",
                    "47. Djulbegovic B, Paul A. From efficacy to effectiveness in the face of uncertainty: indication creep and prevention creep. JAMA. 2011; 305(19):2005–2006. https://doi.org/10.1001/jama.2011.650 PMID: 21586716",
                    "49. Knopman DS, Amieva H, Petersen RC, Chételat G, Holtzman DM, Hyman BT, et al. Alzheimer disease. Nat Rev Dis Primers. 2021; 7(1):33. Epub 2021/05/15. https://doi.org/10.1038/s41572-021-00269-y PMID: 33986301.",
                    "51. Dalton E, Churilov L, Lannin NA, Corbett D, Hayward KS. Dose Articulation in Preclinical and Clinical Stroke Recovery: Refining a Discovery Research Pipeline and Presenting a Scoping Review Protocol. Front Neurol. 2019; 10:1148. Epub 20191106. https://doi.org/10.3389/fneur.2019.01148 PMID: 31781018.",
                    "52. Ogier R, Knecht W, Schwab ME. Academic leadership: (with)holding the keys to translational medicine? Nat Med. 2019; 25(12):1812–3. Epub 2019/12/07. https://doi.org/10.1038/s41591-019-0670-5 PMID: 31806891.",
                    "53. Heneghan C, Goldacre B, Mahtani KR. Why clinical trial outcomes fail to translate into benefits for patients. Trials. 2017; 18:1–7.",
                    "54. Khan A, Fahl Mar K, Brown WA. The Impact of Underpowered Studies on Clinical Trial Results. Am J Psychiatry. 2018; 175(2):188. https://doi.org/10.1176/appi.ajp.2017.17091016 PMID: 29385825.",
                    "56. Molnar FJ, Man-Son-Hing M, Fergusson D. Systematic review of measures of clinical significance employed in randomized controlled trials of drugs for dementia. J Am Geriatr Soc. 2009; 57(3):536–546. https://doi.org/10.1111/j.1532-5415.2008.02122.x PMID: 19187414",
                    "57. Scott S, Kranz JE, Cole J, Lincecum JM, Thompson K, Kelly N, et al. Design, power, and interpretation of studies in the standard murine model of ALS. Amyotroph Lateral Scler. 2008; 9(1):4–15. https://doi. org/10.1080/17482960701856300 PMID: 18273714",
                    "59. Lourbopoulos A, Mourouzis I, Xinaris C, Zerva N, Filippakis K, Pavlopoulos A, et al. Translational Block in Stroke: A Constructive and “Out-of-the-Box” Reappraisal. Front Neurosci. 2021; 15:652403. Epub 20210514. https://doi.org/10.3389/fnins.2021.652403 PMID: 34054413.",
                    "60. Lapchak PA, Zhang JH, Noble-Haeusslein LJ. RIGOR guidelines: escalating STAIR and STEPS for effective translational research. Transl Stroke Res. 2013; 4:279–285. https://doi.org/10.1007/s12975012-0209-2 PMID: 23658596",
                    "62. Macleod MR, Michie S, Roberts I, Dirnagl U, Chalmers I, Ioannidis JP, et al. Biomedical research: increasing value, reducing waste. Lancet. 2014; 383(9912):101–104. https://doi.org/10.1016/S01406736(13)62329-6 PMID: 24411643",
                    "63. Bretthauer M, Gerke S, Hassan C, Ahmad OF, Mori Y. The new European Medical Device Regulation: balancing innovation and patient safety. Ann Intern Med. 2023. https://doi.org/10.7326/M23-0454 PMID: 37068279",
                    "64. Blum̈le A, Wollmann K, Bischoff K, Kapp P, Lohner S, Nury E, et al. Investigator initiated trials versus industry sponsored trials-translation of randomized controlled trials into clinical practice (IMPACT). BMC Med Res Methodol. 2021; 21(1):182. https://doi.org/10.1186/s12874-021-01359-x PMID: 34465296",
                    "65. Boutron I, Dutton S, Ravaud P, Altman DG. Reporting and interpretation of randomized controlled trials with statistically nonsignificant results for primary outcomes. JAMA. 2010; 303(20):2058–2064. https:// doi.org/10.1001/jama.2010.651 PMID: 20501928",
                ],
            },
            "06": {
                "citing": 6, "truth": [[41], [42], [43], [44], [45], [46]],
                "texts": [
                    "WEISS, E., W. WETTERSTROM, D. NADEL & O. BAR-YOSEF. 2004. The broad spectrum revisited: evidence from plant remains. Anthropology 101: 9551–55. https://doi.org/10.1073/pnas.0402362101",
                    "WILLCOX, G. & D. STORDEUR. 2012. Large-scale cereal processing before domestication during the tenth millennium cal BC in northern Syria. Antiquity 86: 99–114.",
                    "COLLEDGE, S., J. CONOLLY, B. FINLAYSON & I. KUIJT. 2018. New insights on plant domestication, production intensification, and food storage: the archaeobotanical evidence from PPNA Dhra‘. Levant 50: 14–31.",
                    "WEIDE, A., L. GREEN, J.G. HODGSON et al. 2022. A new functional ecological model reveals the nature of early plant management in Southwest Asia. Nature Plants 8: 623–34. https://doi.org/10.1038/s41477-022-01161-7",
                    "ASOUTI, E. & D.Q. FULLER. 2013. A contextual approach to the emergence of agriculture in Southwest Asia: reconstructing Early Neolithic plant-food production. Current Anthropology 54: 299–345. https://doi.org/10.1086/670679",
                    "STINER, M.C. et al. 2022. An endemic pathway to sheep and goat domestication at Aşıklı Höyük (central Anatolia, Turkey). Proceedings of the National Academy of Sciences of the USA 119: e2110930119. https://doi.org/10.1073/pnas.2110930119",
                    "BAR-YOSEF, O. & A. BELFER-COHEN. 1989. The origins of sedentism and farming communities in the Levant. Journal of World Prehistory 3: 447–98. https://doi.org/10.1007/BF00975111",
                    "BAR-YOSEF, O. & R. MEADOW. 1995. The origins of agriculture in the Near East, in T. Price & A. Gebauer (ed.) Last hunters-first farmers: new perspectives on the prehistoric transition to agriculture: 39–94. Santa Fe (NM): School of American Research.",
                    "HAYDEN, B. 1995. An overview of domestication, in T. Price & B. Gebauer (ed.) Last hunters-first farmers: new perspectives on the prehistoric transition to agriculture: 273–300. Santa Fe (NM): School of American Research.",
                    "MITHEN, S.J. 1997. Did farming arise from a misapplication of social intelligence? Philosophical Transactions of the Royal Society B 362: 705–18. https://doi.org/10.1098/rstb.2006.2005",
                    "POWERS, S.T. & L. LEHMANN. 2014. An evolutionary model explaining the Neolithic transition from egalitarianism to leadership and despotism. Proceedings of the Royal Society B 281: 20141349. https://doi.org/10.1098/rspb.2014.1349",
                    "FEYNMAN, J. & A. RUZMAIKIN. 2018. Climate stability and the origin of agriculture, in S. Hussain (ed.) Climate Change and Agriculture: 1–18. London: IntechOpen.",
                    "BOWLES, S. & J.-K. CHOI. 2019. The Neolithic agricultural revolution and the origins of private property. Journal of Political Economy 127: 2186–228. https://doi.org/10.1086/701789",
                    "BIRD, D.W., R.B. BIRD, B.F. CODDING & D.W. ZEANAH. 2019. Variability in the organization and size of hunter-gatherer groups: foragers do not live in small-scale societies. Journal of Human Evolution 131: 96–108. https://doi.org/10.1016/j.jhevol.2019.03.005",
                    "WHALLON, R. 2006. Social networks and information: non-‘utilitarian‘ mobility among hunter-gatherers. Journal of Anthropological Archaeology 25: 259–70. https://doi.org/10.1016/j.jaa.2005.11.004",
                    "JOHNSON, G. 1982. Organizational structure and scalar stress, in C. Renfrew, M. Rowlands & B. Seagraves (ed.) Theory and explanation in archaeology: 389–421. New York: Academic Press.",
                    "STORDEUR, D. & F. ABBÈS. 2002. Du PPNA au PPNB, mise en lumière d’une phase de transition à Jerf el-Ahmar (Syrie). Bulletin de la Société Préhistorique Française 99: 563–95. https://doi.org/10.3406/bspf.2002.12712",
                    "FINLAYSON, B. & S.J. MITHEN. 2007. The early prehistory of Wadi Faynan, southern Jordan. London: CBRL. https://doi.org/10.1017/ehs.2019.9",
                    "MITHEN, S.J. et al. 2018. WF16, the excavation of an Early Neolithic settlement in southern Jordan: architecture, stratigraphy and chronology. London: CBRL. https://10.5284/1034377",
                    "SMITH, S., B. FINLAYSON & S. MITHEN. 2019. The end of the PPNA in southern Jordan: insights from a preliminary analysis of chipped stone from WF16, in L. Astruc, C. McCartney, F. Briois and V. Kassianidou (ed.) Near Eastern lithic technologies on the move: interactions and contexts in Neolithic traditions: 159–72. Nicosia: Astrom.",
                    "KHALAILY, H. & F.R. VALLA. 2013. Obsidian in Natufian context: the case of Eynan (Ain Mallaha), Israel, in O. Bar-Yosef & F.R. Valla",
                    "IBÁÑEZ, J.J. et al. 2016. Developing a complex network model of obsidian exchange in the Neolithic Near East: linear regressions, ethnographic models and archaeological data. Paléorient 42: 9–32.",
                    "GROSMAN, L. et al. 2016, Nahal Ein Gev II, a late Natufian community at the Sea of Galilee. PLoS ONE 11: e0146647. https://doi.org/10.1371/journal.pone.0146647",
                    "RICHTER, T., A.N. GARRARD, S. ALLCOCK & L.A. MAHER. 2011. Interaction before agriculture: exchanging material and sharing knowledge in the final Pleistocene Levant. Cambridge Archaeological Journal 21: 95–114. https://doi.org/10.1017/S0959774311000060",
                    "BOCQUENTIN, F. & A. GARRARD. 2016. Natufian collective burial practice and cranial pigmentation: a reconstruction from Azraq 18 (Jordan). Journal of Archaeological Science 10: 693–702.",
                    "BENZ, M. & J. BAUER. 2015. On scorpions, birds and snakes: evidence for shamanism in Northern Mesopotamia during the Early Holocene. Journal of Ritual Studies 29: 1–23.",
                    "SHAHAM, D. & L. GROSMAN. 2019. Engraved stones from Nahal Ein Gev II: portraying a local style, forming cultural links, in L. Astruc, C. McCartney, F. Briois & V. Kassianidou (ed.) Near Eastern lithic technologies on the move: interactions and contexts in Neolithic traditions: 133–42. Nicosia: Astrom.",
                    "BAR-YOSEF, O. & A. GOPHER. 1997. An Early Neolithic village in the Jordan Valley, part 1: the archaeology of Netiv Hagdud. Cambridge (MA): Peabody Museum of Archaeology and Ethnology.",
                    "PETERS, J. & K. SCHMIDT. 2004. Animals in the symbolic world of Pre-Pottery Neolithic Göbekli Tepe, south-eastern Turkey: a preliminary assessment. Anthropozoologica 39: 179–218.",
                    "PETERS, J., A. VON DEN DRIESCH, N. POLLATH & K. SCHMIDT. 2005. Birds in the megalithic art of Pre-Pottery Neolithic Göbekli Tepe, southeast Turkey. Documenta Archaeobiologiae 3: 223–34.",
                    "GOURICHON, L. 2002. Bird remains from Jerf el Ahmar, a PPNA site in northern Syria, with special reference to the Griffon Vulture, in H. Buitenhuis, A.M. Choyke, M. Mashkour & A.H. Al-Shiyab (ed.) Archaeozoology of the Near East V: 138–52 (ARC-Publicatie 62). Groningen: ARC.",
                    "MITHEN, S.J., B. FINLAYSON & R. SHAFFREY. 2005. Sexual symbolism in the Early Neolithic of the Southern Levant: pestles and mortars from WF16. Documenta Praehistorica 32: 103–10. https://doi.org/10.4312/dp.32.6",
                    "MIYAKE, Y. et al. 2012. New excavations at Hasankeyf Höyük: a tenth millennium cal BC site on the Upper Tigris, southeast Anatolia. Neo-Lithics 1: 3–7.",
                    "FRIESEM, D., I. ABADI, D. SHAHAM & L. GROSMAN. 2019. Lime plaster cover of the dead 12 000 years ago: new evidence for the origins of lime plaster technology. Evolutionary Human Sciences 1: e9. https://10.1017/ehs.2019.9",
                    "BENZ, M. et al. 2015. Prelude to village life: environmental data and building traditions of the Epipalaeolithic settlement at Körtik Tepe, southeastern Turkey. Paléorient 41: 9–30. https://doi.org/10.3406/paleo.2015.5673",
                ],
            },
            "07": {
                "citing": 7, "truth": [[47], [48], [49], [50], [51], [52]],
                "texts": [
                    "[1] Cal K, Sollohub K. Spray drying technique. I: Hardware and process parameters. Journal of Pharmaceutical Sciences. 2010;99(2):575-586",
                    "[2] Anandharamakrishnan C. Spray Drying Techniques for Food Ingredient Encapsulation. John Wiley & Sons; 2015",
                    "[3] Ortega-Rivas E, Juliano P, Yan H. Food Powders: Physical Properties, Processing, and Functionality. Springer Science & Business Media; 2006",
                    "[4] Patel R, Patel M, Suthar A. Spray drying technology: An overview. Indian Journal of Science and Technology. 2009;2(10):44-47",
                    "[5] Vehring R, Foss WR, Lechuga-Ballesteros D. Particle formation in spray drying. Journal of Aerosol Science. 2007;38(7):728-746",
                    "[6] Nandiyanto ABD, Okuyama K. Progress in developing spray-drying methods for the production of controlled morphology particles: From the nanometer to submicrometer size ranges. Advanced Powder Technology. 2011;22(1):1-19",
                    "[7] Anandharamakrishnan C. Handbook of Drying for Dairy Products. John Wiley & Sons; 2017",
                    "[12] Handscomb C, Kraft M, Bayly A. A new model for the drying of droplets containing suspended solids. Chemical Engineering Science. 2009;64(4):628-637",
                    "[28] Büchi. Mini Spray Dryer B-290—Technical Data Sheet [Internet]. 2017. Available from: https://www.buchi.com/sites/default/files/downloads/B-290_Data_Sheet_en_D.pdf?83b 925aae302a8e76f002d1ce679fa06904d1039. [Accessed: 2017-11-02]",
                    "[29] Büchi. Nano Spray Dryer B-90 HP—Technical data sheet [Internet]. 2017. Available from: https://www.buchi.com/sites/default/files/technical-data-pdf/B-90_Data_Sheet_en.pdf? 507a2adc7486d8ee2dfa592c9638749918452ed3. [Accessed: 2017-11-02]",
                    "[25] Wu X, Hayes Jr D, Zwischenberger JB, Kuhn RJ, Mansour HM. Design and physicochemical characterization of advanced spray-dried tacrolimus multifunctional particles for inhalation. Drug Design, Development and Therapy. 2013;7:59",
                    "[26] B Patel B, K Patel J, Chakraborty S. Review of patents and application of spray drying in pharmaceutical, food and flavor industry. Recent Patents on Drug Delivery & Formulation. 2014;8(1):63-78",
                    "[33] Sollohub K, Cal K. Spray drying technique: II. Current applications in pharmaceutical technology. Journal of Pharmaceutical Sciences. 2010;99(2):587-597",
                    "[11] Jain Manu S, Lohare Ganesh B, Chavan Randhir B, Barhate Shashikant D, Shah CB. Spray drying in pharmaceutical industry: A review. Research Journal of Pharmaceutical Dosage Forms and Technology. 2012;4:74-79",
                    "[42] Alves GP, Santana MHA. Phospholipid dry powders produced by spray drying processing: Structural, thermodynamic and physical properties. Powder Technology. 2004; 145(2):139-148",
                    "[43] Adi H, Young PM, Chan HK, Stewart P, Agus H, Traini D. Cospray dried antibiotics for dry powder lung delivery. Journal of Pharmaceutical Sciences. 2008;97(8):3356-3366",
                    "[44] Grenha A, Seijo B, Remunán-López C. Microencapsulated chitosan nanoparticles for lung protein delivery. European Journal of Pharmaceutical Sciences. 2005;25(4):427-437",
                    "[45] Alhalaweh A, Andersson S, Velaga SP. Preparation of zolmitriptan–chitosan microparticles by spray drying for nasal delivery. European Journal of Pharmaceutical Sciences. 2009;38(3):206-214",
                    "[46] Tadwee I, Shahi S, Thube M. Spray dried nasal mucoadhesive microspheres of carbamazepine: Preparation and invitro/ex-vivo evaluation. International Journal of Phar maceutical Sciences and Research. 2011;2:23-32",
                    "[48] Zadeh S, Rajabnezhad S, Zandkarimi M, Dahmardeh S, Mir L. Mucoadhesive microspheres of chitosan and polyvinyl alcohol as a carrier for intranasal delivery of insulin: In vitro and in vivo studies. MOJ Bioequivalence & Bioavailability. 2017;3(2):00030",
                    "[50] Ben Y, Zhang L, Wei S, Zhou T, Li Z, Yang H, et al. PVB modified spherical granules of β-TCP by spray drying for 3D ceramic printing. Journal of Alloys and Compounds. 2017;721(Supplement C):312-319",
                    "[54] Lomuscio S, Ma H, Matchett MA, Sandhu HK, Shah NH, Zhang Y-e. Pharmaceutical composition with improved bioavailability. US 20170000764; 2017",
                    "[63] Schultz-fademrecht T, Garidel P, Fischer B, Bechtold-peters K. Powders for inhalation. US20080089849; 2008",
                ],
            },
            "08": {
                "citing": 8, "truth": [[53, 54]],
                "texts": [
                    "[1] A. M. Worthington , On the forms assumed by drops of liquids fallin g vertically on a horizontal plate, Proc. Roy. Soc . 25, 261 (1877); 25, 498 (1877).",
                    "[2] A. M . Wor t hington, A study of splash es (Longman s, Green, and Co., New York, N . Y., 1908) .",
                    "[3] R. T . Knapp and A. H ollander, Laborat ory in vestig-ations of the mechanism of cavitation , Trans. ASME 70, 419 (948) .",
                    "[7] George W . Morey, Properties of glass, p . 201 (R einhold Publishing Corp. , New York, N . Y. , 1945).",
                ],
            },
            "09": {
                "citing": 9, "truth": [[1], [18], [22], [23], [26], [27], [53], [55], [56], [57], [58], [59]],
                "texts": [
                    "[1] C. Josserand and S. T. Thoroddsen, Drop impact on a solid surface, Annu. Rev. Fluid Mech. 48, 365 (2016).",
                    "[2] A. L. Yarin, Drop impact dynamics: Splashing, spreading, receding, bouncing..., Annu. Rev. Fluid Mech. 38, 159 (2006).",
                    "[3] A. L. Yarin, I. V. Roisman, and C. Tropea, Collision Phenomena in Liquids and Solids (Cambridge University Press, Cambridge, England, 2017).",
                    "[4] A. M. Worthington, XXVIII. On the forms assumed by drops of liquids falling vertically on a horizontal plate, Proc. R. Soc. A 25, 261 (1876).",
                    "[6] J. Kim, Spray cooling heat transfer: The state of the art, Int. J. Heat Fluid Flow 28, 753 (2007).",
                    "[8] L. Bourouiba, The fluid dynamics of disease transmission, Annu. Rev. Fluid Mech. 53, 473 (2021).",
                    "[9] B. Zhang, V. Sanjay, S. Shi, Y. Zhao, C. Lv, and D. Lohse, Impact forces of water drops falling on superhydrophobic surfaces, Phys. Rev. Lett. 129, 104501 (2022).",
                    "[12] B. R. Mitchell, J. C. Klewicki, Y. P. Korkolis, and B. L. Kinsey, The transient force profile of low-speed droplet impact: Measurements and model, J. Fluid Mech. 867, 300 (2019).",
                    "[13] X. Cheng, T.-P. Sun, and L. Gordillo, Drop impact dynamics: Impact force and stress distributions, Annu. Rev. Fluid Mech. 54, 57 (2022).",
                    "[15] V. Sanjay, B. Zhang, C. Lv, and D. Lohse, The role of viscosity on drop impact forces on non-wetting surfaces, J. Fluid Mech. 1004, A6 (2025).",
                    "[10] N. Laan, K. G. de Bruin, D. Bartolo, C. Josserand, and D. Bonn, Maximum diameter of impacting liquid droplets, Phys. Rev. Appl. 2, 044018 (2014).",
                    "[17] J. Madejski, Solidification of droplets on a cold surface, Int. J. Heat Mass Transfer 19, 1009 (1976).",
                    "[21] J. Eggers, M. A. Fontelos, C. Josserand, and S. Zaleski, Drop dynamics after impact on a solid wall: Theory and simulations, Phys. Fluids 22, 062101 (2010).",
                    "[25] S. Popinet and Collaborators, BASILISK C: Volume of Fluid method, http://basilisk.fr (2013)–now.",
                    "[26] V. Sanjay, Code repository: Impact forces of water drops falling on superhydrophobic surfaces, 10.5281/zenodo .7598181 (2023).",
                    "[27] See Supplemental Material at http://link.aps.org/ supplemental/10.1103/PhysRevLett.134.104003 for a description of numerical methods and details of the various regimes and transition, which includes Refs. [28–45].",
                    "[46] S. Grossmann and D. Lohse, Scaling in thermal convection: A unifying theory, J. Fluid Mech. 407, 27 (2000).",
                    "[50] V. Sanjay, P. Chantelot, and D. Lohse, When does an impacting drop stop bouncing?, J. Fluid Mech. 958, A26 (2023).",
                    "[53] V. Sanjay, D. Lohse, and M. Jalaal, Bursting bubble in a viscoplastic medium, J. Fluid Mech. 922, A2 (2021).",
                    "[54] S. Afkhami and L. Kondic, Numerical simulation of ejected molten metal nanoparticles liquified by laser irradiation: Interplay of geometry and dewetting, Phys. Rev. Lett. 111, 034501 (2013).",
                    "[57] H. Hertz, On the contact of elastic solids, J. Reine Angew. Math. 92, 156 (1881).",
                    "[59] J. Bilotto, J. M. Kolinski, B. Lecampion, J. Molinari, G. Subhash, and J. Garcia-Suarez, Fluid-mediated impact of soft solids, J. Fluid Mech. 997, A35 (2024).",
                    "[61] J. Philippi, P.-Y. Lagrée, and A. Antkowiak, Drop impact on a solid surface: Short-time self-similarity, J. Fluid Mech. 795, 96 (2016).",
                    "[63] Y. Renardy, S. Popinet, L. Duchemin, M. Renardy, S. Zaleski, C. Josserand, M. A. Drumright-Clarke, D. Richard, C. Clanet, and D. Queŕé, Pyramidal and toroidal water drops after impact on a solid surface, J. Fluid Mech. 484, 69 (2003).",
                    "[68] J. M. Gordillo, G. Riboux, and E. S. Quintero, A theory on the spreading of impacting droplets, J. Fluid Mech. 866, 298 (2019).",
                    "[70] L. Onsager, Statistical hydrodynamics, Il Nuovo Cimento 6, 279 (1949).",
                    "[73] V. Sanjay, U. Sen, P. Kant, and D. Lohse, Taylor-Culick retractions and the influence of the surroundings, J. Fluid Mech. 948, A14 (2022).",
                    "[74] V. Sanjay, J. Talukdar, U. Sen, C. Diddens, and D. Lohse, Sliding drops on dry & wet substrates, Bull. APS (2024).",
                    "[75] L. Kayal, V. Sanjay, N. Yewale, A. Kumar, and R. Dasgupta, Focussing of concentric free-surface waves, J. Fluid Mech. 1003, A14 (2025).",
                ],
            },
            "10": {
                "citing": 10, "truth": [[60], [61], [62], [63]],
                "texts": [
                    "Matthew Peters, Mark Neumann, Mohit Iyyer, Matt Gardner, Christopher Clark, Kenton Lee, and Luke Zettlemoyer. 2018a. Deep contextualized word representations. In NAACL.",
                    "Alec Radford, Karthik Narasimhan, Tim Salimans, and Ilya Sutskever. 2018. Improving language understanding with unsupervised learning. Technical report, OpenAI.",
                    "Jeremy Howard and Sebastian Ruder. 2018.Universal language model fine-tuning for text classification. In ACL. Association for Computational Linguistics.",
                    "William B Dolan and Chris Brockett. 2005. Automatically constructing a corpus of sentential paraphrases. In Proceedings of the Third International Workshop on Paraphrasing (IWP2005).",
                    "Pranav Rajpurkar, Jian Zhang, Konstantin Lopyrev, and Percy Liang. 2016. Squad: 100,000+ questions for machine comprehension of text. In Proceedings of the 2016 Conference on Empirical Methods in Natural Language Processing, pages 2383–2392.",
                    "John Blitzer, Ryan McDonald, and Fernando Pereira. 2006. Domain adaptation with structural correspondence learning. In Proceedings of the 2006 conference on empirical methods in natural language processing, pages 120–128. Association for Computational Linguistics.",
                    "Jeffrey Pennington, Richard Socher, and Christopher D. Manning. 2014.Glove: Global vectors for word representation. In Empirical Methods in Natural Language Processing (EMNLP), pages 1532–1543.",
                    "Andriy Mnih and Geoffrey E Hinton. 2009.A scalable hierarchical distributed language model. In D. Koller, D. Schuurmans, Y. Bengio, and L. Bottou, editors, Advances in Neural Information Processing Systems 21, pages 1081–1088. Curran Associates, Inc.",
                    "Matthew Peters, Waleed Ammar, Chandra Bhagavatula, and Russell Power. 2017. Semi-supervised sequence tagging with bidirectional language models. In ACL.",
                    "Richard Socher, Alex Perelygin, Jean Wu, Jason Chuang, Christopher D Manning, Andrew Ng, and Christopher Potts. 2013. Recursive deep models for semantic compositionality over a sentiment treebank. In Proceedings of the 2013 conference on empirical methods in natural language processing, pages 1631–1642.",
                    "Oren Melamud, Jacob Goldberger, and Ido Dagan. 2016. context2vec: Learning generic context embedding with bidirectional LSTM. In CoNLL.",
                    "Alexis Conneau, Douwe Kiela, Holger Schwenk, Loı̈c Barrault, and Antoine Bordes. 2017.Supervised learning of universal sentence representations from natural language inference data. In Proceedings of the 2017 Conference on Empirical Methods in Natural Language Processing, pages 670–680, Copenhagen, Denmark. Association for Computational Linguistics.",
                    "Bryan McCann, James Bradbury, Caiming Xiong, and Richard Socher. 2017. Learned in translation: Contextualized word vectors. In NIPS.",
                    "J. Deng, W. Dong, R. Socher, L.-J. Li, K. Li, and L. FeiFei. 2009. ImageNet: A Large-Scale Hierarchical Image Database. In CVPR09.",
                    "Jason Yosinski, Jeff Clune, Yoshua Bengio, and Hod Lipson. 2014. How transferable are features in deep neural networks? In Advances in neural information processing systems, pages 3320–3328.",
                    "Yonghui Wu, Mike Schuster, Zhifeng Chen, Quoc V Le, Mohammad Norouzi, Wolfgang Macherey, Maxim Krikun, Yuan Cao, Qin Gao, Klaus Macherey, et al. 2016. Google’s neural machine translation system: Bridging the gap between human and machine translation. arXiv preprint arXiv:1609.08144.",
                    "Pascal Vincent, Hugo Larochelle, Yoshua Bengio, and Pierre-Antoine Manzagol. 2008. Extracting and composing robust features with denoising autoencoders. In Proceedings of the 25th international conference on Machine learning, pages 1096–1103. ACM.",
                    "Daniel Cer, Mona Diab, Eneko Agirre, Inigo LopezGazpio, and Lucia Specia. 2017.Semeval-2017 task 1: Semantic textual similarity multilingual and crosslingual focused evaluation. In Proceedings of the 11th International Workshop on Semantic Evaluation (SemEval-2017), pages 1–14, Vancouver, Canada. Association for Computational Linguistics.",
                    "Ciprian Chelba, Tomas Mikolov, Mike Schuster, Qi Ge, Thorsten Brants, Phillipp Koehn, and Tony Robinson. 2013. One billion word benchmark for measuring progress in statistical language modeling. arXiv preprint arXiv:1312.3005.",
                    "Minghao Hu, Yuxing Peng, Zhen Huang, Xipeng Qiu, Furu Wei, and Ming Zhou. 2018. Reinforced mnemonic reader for machine reading comprehension. In IJCAI.",
                    "Mandar Joshi, Eunsol Choi, Daniel S Weld, and Luke Zettlemoyer. 2017. Triviaqa: A large scale distantly supervised challenge dataset for reading comprehension. In ACL.",
                    "Wei Wang, Ming Yan, and Chen Wu. 2018b. Multigranularity hierarchical attention fusion networks for reading comprehension and question answering. In Proceedings of the 56th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers). Association for Computational Linguistics.",
                    "Rowan Zellers, Yonatan Bisk, Roy Schwartz, and Yejin Choi. 2018. Swag: A large-scale adversarial dataset for grounded commonsense inference. In Proceedings of the 2018 Conference on Empirical Methods in Natural Language Processing (EMNLP).",
                    "Matthew Peters, Mark Neumann, Luke Zettlemoyer, and Wen-tau Yih. 2018b. Dissecting contextual word embeddings: Architecture and representation. In Proceedings of the 2018 Conference on Empirical Methods in Natural Language Processing, pages 1499–1509.",
                    "Luisa Bentivogli, Bernardo Magnini, Ido Dagan, Hoa Trang Dang, and Danilo Giampiccolo. 2009. The fifth PASCAL recognizing textual entailment challenge. In TAC. NIST.",
                    "Hector J Levesque, Ernest Davis, and Leora Morgenstern. 2011. The winograd schema challenge. In Aaai spring symposium: Logical formalizations of commonsense reasoning, volume 46, page 47.",
                ],
            },
        },
    }/*END*/;

    // Paper 02 (Physical Review Fluids) of the same library, as Zotero 11.0-beta.4's
    // structure data has it (its cached pack of 2026-11-18, read with Zotero's own
    // structured-document-text reader: D:/tmp/wv-scripts/refs4-fixture02.js): the last
    // heading, the end of the body and the whole reference list -- three `list` blocks
    // of `[n]` items with the page furniture between them, no block flagged
    // `reference: true` and no "References" heading (APS prints none). Zotero keeps
    // none of it as a reference list (document-worker reference/support.js: "J. Fluid
    // Mech. 768, 492 (2015)." does not look like a source to it), so 1.1.1-refs.3 drew
    // no mark and no References section for this paper. Rects rounded to 0.01 pt.
    const STRUCT02 = /*STRUCT02*/{ "content": [
                {"type":"heading","anchor":{"pageRects":[[24,111.66,313.77,392.39,321.67]]},"content":[{"text":"APPENDIX B: SOLUTION OF THE INTEGRAL EQUATION FOR q"}]},
                {"type":"paragraph","anchor":{"pageRects":[[25,54.76,54.12,449.27,75.1]]},"content":[{"text":"The results in Fig. 17 compare the values of the flow rate at the interface calculated numerically as −q(rs, vs) = −rs(z, τ )vr (r = rs, z, τ ) for a value o..."}]},
                {"type":"paragraph","flowClass":"excluded","anchor":{"pageRects":[[25,232.59,31.19,271.43,39.07]]},"content":[{"text":"073606-26"}]},
                {"type":"paragraph","flowClass":"excluded","anchor":{"pageRects":[[26,133.54,665.43,370.51,673.32]]},"content":[{"text":"THEORY OF THE JETS EJECTED AFTER THE INERTIAL ..."}]},
                {"type":"paragraph","previousPart":[1],"anchor":{"pageRects":[[26,54.76,627.73,449.27,648.82]]},"content":[{"text":"prediction, q∞(1 + | q|), at two different instants of time, finding good agreement between our theory and the numerical results."}]},
                {"type":"list", "content": [
                    {"type":"listitem","anchor":{"pageRects":[[26,59.25,536.29,449.26,555.63]]},"content":[{"text":"[1] C.-D. Ohl, M. Arora, R. Dijkink, V. Janve, and D. Lohse, Surface cleaning from laser-induced cavitation bubbles, Appl. Phys. Lett. 89, 074102 (2006)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,59.25,513.38,449.31,532.72]]},"content":[{"text":"[2] C. Lechner, W. Lauterborn, M. Koch, and R. Mettin, Fast, thin jets from bubbles expanding and collapsing in extreme vicinity to a solid boundary: A numerical study, Phys. Rev. Fluids 4, 021601(R) (2019)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,59.25,490.46,449.27,509.8]]},"content":[{"text":"[3] P. L. L. Walls, J. C. Bird, and L. Bourouiba, Moving with bubbles: A review of the interactions between bubbles and the microorganisms that surround them, Integr. Comp. Biol. 54, 1014 (2014)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,59.25,467.55,449.29,486.89]]},"content":[{"text":"[4] L. Dubitsky, O. McRae, and J. C. Bird, Enrichment of Scavenged Particles in Jet Drops Determined by Bubble Size and Particle Position, Phys. Rev. Lett. 130, 054001 (2023)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,59.25,444.63,449.29,463.97]]},"content":[{"text":"[5] G. Birkhoff, D. P. MacDougall, E. M. Pugh, and S. G. Taylor, Explosives with lined cavities, J. Appl. Phys. 19, 563 (1948)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,59.25,421.72,449.31,441.06]]},"content":[{"text":"[6] Y. Tagawa, N. Oudalov, C. W. Visser, I. R. Peters, D. van der Meer, C. Sun, A. Prosperetti, and D. Lohse, Highly Focused Supersonic Microjets, Phys. Rev. X 2, 031002 (2012)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,59.25,398.81,449.31,418.14]]},"content":[{"text":"[7] I. R. Peters, Y. Tagawa, N. Oudalov, C. Sun, A. Prosperetti, D. Lohse, and D. van der Meer, Highly focused supersonic microjets: Numerical simulations, J. Fluid Mech. 719, 587 (2013)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,59.25,375.89,449.29,395.23]]},"content":[{"text":"[8] B. Ray, G. Biswas, and A. Sharma, Regimes during liquid drop impact on a liquid pool, J. Fluid Mech. 768, 492 (2015)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,59.25,352.98,449.29,372.32]]},"content":[{"text":"[9] G.-J. Michon, C. Josserand, and T. Séon, Jet dynamics post drop impact on a deep pool, Phys. Rev. Fluids 2, 023601 (2017)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,330.06,449.29,349.4]]},"content":[{"text":"[10] S. T. Thoroddsen, K. Takehara, H. D. Nguyen, and T. G. Etoh, Singular jets during the collapse of dropimpact craters, J. Fluid Mech. 848, R3 (2018)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,307.15,449.28,326.49]]},"content":[{"text":"[11] Z. Q. Yang, Y. S. Tian, and S. T. Thoroddsen, Multitude of dimple shapes can produce singular jets during the collapse of immiscible drop-impact craters, J. Fluid Mech. 904, A19 (2020)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,284.23,449.32,303.57]]},"content":[{"text":"[12] F. J. Blanco-Rodríguez and J. M. Gordillo, On the jets produced by drops impacting a deep liquid pool and by bursting bubbles, J. Fluid Mech. 916, A37 (2021)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,261.32,449.34,280.66]]},"content":[{"text":"[13] Y. S. Tian, Z. Q. Yang, and S. T. Thoroddsen, Conical focusing: Mechanism for singular jetting from collapsing drop-impact craters, J. Fluid Mech. 958, R1 (2023)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,238.4,449.28,257.74]]},"content":[{"text":"[14] S. Gekle, J. M. Gordillo, D. van der Meer, and D. Lohse, High-Speed Jet Formation After Solid Object Impact, Phys. Rev. Lett. 102, 034502 (2009)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,215.49,449.29,234.83]]},"content":[{"text":"[15] S. Gekle and J. M. Gordillo, Generation and breakup of worthington jets after cavity collapse. Part 1. Jet formation, J. Fluid Mech. 663, 293 (2010)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,192.58,449.32,211.91]]},"content":[{"text":"[16] S. Krishnan, E. J. Hopfinger, and B. A. Puthenveettil, On the scaling of jetting from bubble collapse at a liquid surface, J. Fluid Mech. 822, 791 (2017)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,169.66,449.32,189]]},"content":[{"text":"[17] J. M. Gordillo, Axisymmetric bubble collapse in a quiescent liquid pool. i. Theory and numerical simulations, Phys. Fluids 20, 112103 (2008)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,146.76,449.31,166.08]]},"content":[{"text":"[18] R. Bolaños-Jiménez, A. Sevilla, C. Martínez-Bazán, and J. M. Gordillo, Axisymmetric bubble collapse in a quiescent liquid pool. ii. Experimental study, Phys. Fluids 20, 112104 (2008)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,123.84,449.29,143.31]]},"content":[{"text":"[19] T. Séon and A. Antkowiak, Large Bubble Rupture Sparks Fast Liquid Jet, Phys. Rev. Lett. 109, 014501 (2012)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,100.93,449.31,120.26]]},"content":[{"text":"[20] S. Popinet, Gerris: A tree-based adaptive solver for the incompressible Euler equations in complex geometries, J. Comput. Phys. 190, 572 (2003)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,78.01,449.29,97.48]]},"content":[{"text":"[21] S. Popinet, An accurate adaptive solver for surface-tension-driven interfacial flows, J. Comput. Phys. 228, 5838 (2009)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[26,54.77,55.1,449.33,74.44]]},"content":[{"text":"[22] A. Antkowiak, N. Bremond, S. Le Dizes, and E. Villermaux, Short-term dynamics of a density interface following an impact, J. Fluid Mech. 577, 241 (2007)."}]},
                ]},
                {"type":"paragraph","flowClass":"excluded","anchor":{"pageRects":[[26,232.6,31.18,271.45,39.07]]},"content":[{"text":"073606-27"}]},
                {"type":"paragraph","flowClass":"excluded","anchor":{"pageRects":[[27,170.77,665.43,333.27,673.32]]},"content":[{"text":"GORDILLO AND BLANCO–RODRÍGUEZ"}]},
                {"type":"list", "content": [
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,627.95,449.28,647.29]]},"content":[{"text":"[23] J. M. Gordillo, H. Onuki, and Y. Tagawa, Impulsive generation of jets by flow focusing, J. Fluid Mech. 894, A3 (2020)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,605.03,449.28,624.5]]},"content":[{"text":"[24] H. Onuki, Y. Oi, and Y. Tagawa, Microjet Generator for Highly Viscous Fluids, Phys. Rev. Appl. 9, 014035 (2018)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,570.66,449.28,601.46]]},"content":[{"text":"[25] A. Fraters, M. Rump, R. Jeurissen, M. van den Berg, Y. de Loore, H. Reinten, H. Wijshoff, D. van der Meer, D. Lohse, M. Versluis, and T. Segers, Meniscus Oscillations Driven by Flow Focusing Lead to Bubble Pinch-Off and Entrainment in a Piezoacoustic Inkjet Nozzle, Phys. Rev. Appl. 16, 044052 (2021)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,559.21,449.28,567.21]]},"content":[{"text":"[26] J. R. Blake and D. C. Gibson, Cavitation bubbles near boundaries, Annu. Rev. Fluid Mech. 19, 99 (1987)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,536.29,449.29,555.63]]},"content":[{"text":"[27] O. Supponen, D. Obreschkow, M. Tinguely, P. Kobel, N. Dorsaz, and M. Farhat, Scaling laws for jets of single cavitation bubbles, J. Fluid Mech. 802, 263 (2016)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,513.38,449.3,532.72]]},"content":[{"text":"[28] F. Reuter and C.-D. Ohl, Supersonic needle-jet generation with single cavitation bubbles, Appl. Phys. Lett. 118, 134103 (2021)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,490.46,449.31,509.8]]},"content":[{"text":"[29] L. Duchemin, S. Popinet, C. Josserand, and S. Zaleski, Jet formation in bubbles bursting at a free surface, Phys. Fluids 14, 3000 (2002)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,467.55,449.29,486.89]]},"content":[{"text":"[30] L. Deike, E. Ghabache, G. Liger-Belair, A. K. Das, S. Zaleski, S. Popinet, and T. Seon, Dynamics of jets produced by bursting bubbles, Phys. Rev. Fluids 3, 013603 (2018)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,444.63,449.29,463.97]]},"content":[{"text":"[31] C. F. Brasz, C. T. Bartlett, P. L. L. Walls, E. G. Flynn, Y. E. Yu, and J. C. Bird, Minimum size for the top jet drop from a bursting bubble, Phys. Rev. Fluids 3, 074001 (2018)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,421.72,449.31,441.06]]},"content":[{"text":"[32] J. M. Gordillo and J. Rodríguez-Rodríguez, Capillary waves control the ejection of bubble bursting jets, J. Fluid Mech. 867, 556 (2019)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,398.8,449.3,418.14]]},"content":[{"text":"[33] A. Berny, L. Deike, T. Séon, and S. Popinet, Role of all jet drops in mass transfer from bursting bubbles, Phys. Rev. Fluids 5, 033605 (2020)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,375.89,449.28,395.35]]},"content":[{"text":"[34] E. Ghabache and T. Seon, Size of the top jet drop produced by bubble bursting, Phys. Rev. Fluids 1, 051901(R) (2016)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,352.97,449.32,372.31]]},"content":[{"text":"[35] B. W. Zeff, B. Kleber, J. Fineberg, and D. P. Lathrop, Singularity dynamics in curvature collapse and jet eruption on a fluid surface, Nature 403, 401 (2000)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,330.06,449.28,349.4]]},"content":[{"text":"[36] C.-Y. Lai, J. Eggers, and L. Deike, Bubble Bursting: Universal Cavity and Jet Profiles, Phys. Rev. Lett. 121, 144501 (2018)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,318.6,371.86,326.61]]},"content":[{"text":"[37] F. MacIntyre, Flow patterns in breaking bubbles, J. Geophys. Res. 77, 5211 (1972)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,295.69,449.29,315.03]]},"content":[{"text":"[38] K. E. Bigg and C. Leck, The composition of fragments of bubbles bursting at the ocean surface, J. Geophys. Res. 113, D11209 (2008)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,272.77,449.3,292.11]]},"content":[{"text":"[39] A. M. Gañán-Calvo, Revision of Bubble Bursting: Universal Scaling Laws of Top Jet Drop Size and Speed, Phys. Rev. Lett. 119, 204502 (2017)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.77,249.86,449.3,269.2]]},"content":[{"text":"[40] J. M. Gordillo and J. Rodríguez-Rodríguez, Comment on Revision of Bubble Bursting: Universal Scaling Laws of Top Jet Drop Size and Speed, Phys. Rev. Lett. 121, 269401 (2018)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,215.5,449.3,246.29]]},"content":[{"text":"[41] X. Wang, G. B. Deane, K. A. Moore, O. S. Ryder, M. D. Stokes, C. M. Beall, D. B. Collins, M. V. Santander, S. M. Burrows, C. M. Sultana, and K. A. Prather, The role of jet and film drops in controlling the mixing state of submicron sea spray aerosol particles, Proc. Natl. Acad. Sci. USA 114, 6978 (2017)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,192.58,449.29,211.92]]},"content":[{"text":"[42] C. R. Constante-Amores, L. Kahouadji, A. Batchvarov, S. Shin, J. Chergui, D. Juric, and O. K. Matar, Dynamics of a surfactant-laden bubble bursting through an interface, J. Fluid Mech. 911, A57 (2021)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,169.67,449.27,189.01]]},"content":[{"text":"[43] B. Ji, Z. Yang, and J. Feng, Compound jetting from bubble bursting at an air-oil-water interface, Nat. Commun. 12, 6305 (2021)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,146.75,449.28,166.09]]},"content":[{"text":"[44] X. Jiang, L. Rotily, E. Villermaux, and X. Wang, Submicron drops from flapping bursting bubbles, Proc. Natl. Acad. Sci. USA 119, e2112924119 (2022)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,123.84,449.28,143.18]]},"content":[{"text":"[45] Z. Yang, B. Ji, J. T. Ault, and J. Feng, Enhanced singular jet formation in oil-coated bubble bursting, Nat. Phys. 19, 884 (2023)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,112.38,300.77,120.39]]},"content":[{"text":"[46] F. Veron, Ocean spray, Annu. Rev. Fluid Mech. 47, 507 (2015)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,89.47,449.32,108.81]]},"content":[{"text":"[47] L. Deike, Mass transfer at the ocean-atmosphere interface: The role of wave breaking, droplets, and bubbles, Annu. Rev. Fluid Mech. 54, 191 (2022)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[27,54.76,55.1,449.28,85.89]]},"content":[{"text":"[48] See Supplemental Material at http://link.aps.org/supplemental/10.1103/PhysRevFluids.8.073606 for the derivation of Eqs. (27) and (29) using the theory of the axisymmetric bubble collapse in Ref. [17] and for further details on the shape of the cavity as a function of La."}]},
                ]},
                {"type":"paragraph","flowClass":"excluded","anchor":{"pageRects":[[27,232.59,31.18,271.43,39.06]]},"content":[{"text":"073606-28"}]},
                {"type":"paragraph","flowClass":"excluded","anchor":{"pageRects":[[28,133.54,665.43,370.51,673.32]]},"content":[{"text":"THEORY OF THE JETS EJECTED AFTER THE INERTIAL ..."}]},
                {"type":"list", "content": [
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,627.95,449.29,647.29]]},"content":[{"text":"[49] F. J. Blanco-Rodríguez and J. M. Gordillo, On the sea spray aerosol originated from bubble bursting jets, J. Fluid Mech. 886, R2 (2020)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,605.03,449.29,624.37]]},"content":[{"text":"[50] V. Lherm and R. Deguen, Velocity field and cavity dynamics in drop impact experiments, J. Fluid Mech. 962, A21 (2023)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,570.66,449.29,602.25]]},"content":[{"text":"[51] In experiments, if Oh is increased by increasing μ instead of by reducing Rb, then the condition Bo 1 assumed here might be violated. Larger values of Bo imply different bubble shapes and different values of La below which a tiny bubble is entrapped [12,32]"}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.76,512.49,449.29,567.09]]},"content":[{"text":"[52] A similar form of Eq. (2), deduced by us in Ref. [12], has also been recently used by Ref. [13] to calculate the initial velocity of the high speed jets after a drop impacts a liquid pool. Moreover, Eq. (2) also explains and recovers the empirical finding in Ref. [19] for Vjet (T = 0) for the case of the purely gravity driven collapse of a long bubble of height H generated from a nozzle of radius R0: Indeed, in this case, ρV 2 ∼ ρgH → V ∝ √gH → Q∞ ∝ H √gH and Rjet (T = 0) ∼ R0."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.76,490.46,449.28,509.93]]},"content":[{"text":"[53] H. Wagner, Über stoß-und gleitvorgänge an der oberfläche von flüssigkeiten, Z. Angew. Math. Mech. 12, 193 (1932)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.76,467.55,449.29,487.01]]},"content":[{"text":"[54] A. A. Korobkin and V. V. Pukhnachov, Initial stage of water impact, Annu. Rev. Fluid Mech. 20, 159 (1988)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,444.64,449.31,463.97]]},"content":[{"text":"[55] S. D. Howison, J. R. Ockendon, and S. K. Wilson, Incompressible water-entry problems at small deadrise angles, J. Fluid Mech. 222, 215 (1991)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,421.72,449.28,441.06]]},"content":[{"text":"[56] G. Riboux and J. M. Gordillo, Experiments of Drops Impacting a Smooth Solid Surface: A Model of a Critical Impact Speed for Drop Splashing, Phys. Rev. Lett. 113, 024507 (2014)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,398.81,449.29,418.27]]},"content":[{"text":"[57] V. Sanjay, D. Lohse, and M. Jalaal, Bursting bubble in a viscoplastic medium, J. Fluid Mech. 922, A2 (2021)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,375.89,449.29,395.23]]},"content":[{"text":"[58] J. C. Burton, R. Waldrep, and P. Taborek, Scaling and Instabilities in Bubble Pinch-Off, Phys. Rev. Lett. 94, 184502 (2005)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,352.98,449.31,372.32]]},"content":[{"text":"[59] J. M. Gordillo, A. Sevilla, J. Rodríguez-Rodríguez, and C. Martínez-Bazán, Axisymmetric Bubble PinchOff at High Reynolds Numbers, Phys. Rev. Lett. 95, 194501 (2005)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,330.06,449.32,349.4]]},"content":[{"text":"[60] R. Bergmann, D. van der Meer, M. Stijnman, M. Sandtke, A. Prosperetti, and D. Lohse, Giant Bubble Pinch-Off, Phys. Rev. Lett. 96, 154505 (2006)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,307.15,449.29,326.49]]},"content":[{"text":"[61] J. M. Gordillo and M. Pérez-Saborid, Axisymmetric breakup of bubbles at high reynolds numbers, J. Fluid Mech. 562, 303 (2006)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,284.23,449.31,303.57]]},"content":[{"text":"[62] J. Eggers, M. A. Fontelos, D. Leppinen, and J. H. Snoeijer, Theory of the Collapsing Axisymmetric Cavity, Phys. Rev. Lett. 98, 094502 (2007)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.77,146.75,449.31,280.66]]},"content":[{"text":"[63] In Ref. [32], where the velocity field was also expressed as a line of sinks located at the axis of symmetry, we reported that, if the inertiocapillary balance held right before the instant of jet ejection, q∞ ∝ r1/2 jet0 . Then, from the condition for jet ejection when a bubble is entrapped for La < 2500, i.e., that the local Reynolds number is of order unity, namely q∞ ∝ Oh, it follows that rjet0 ∝ Oh2 and, from the second of the equations in (29), it follows that vjet0 ∝ Oh−1, recovering the results in Ref. [32]. The reason why the result of solving Eqs. (29) is similar to the one deduced assuming that the inertiocapillary scaling holds when the jet is ejected [32], can be understood in view of the results depicted in Fig. 12(b), which reveal that the exponents for rjet (τ ) and vjet (τ ) become very close to 2/3 and −1/3, respectively, as τ → 0. The result depicted in Fig. 12(b) as τ → 0 can be explained in terms of the results in Refs. [12,60], where it is shown that the exponents describing the purely inertial pinch-off of bubbles become similar to the ones corresponding to an inertiocapillary collapse when the initial aspect ratio of the cavity is not large, as it is the case here."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.76,123.84,449.32,143.18]]},"content":[{"text":"[64] N. C. Keim, P. Møller, W. W. Zhang, and S. R. Nagel, Breakup of Air Bubbles in Water: Memory and Breakdown of Cylindrical Symmetry, Phys. Rev. Lett. 97, 144503 (2006)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.76,100.93,449.28,120.39]]},"content":[{"text":"[65] A. Iafrati and A. A. Korobkin, Initial stage of flat plate impact onto liquid free surface, Phys. Fluids 16, 2214 (2004)."}]},
                    {"type":"listitem","anchor":{"pageRects":[[28,54.76,78.01,449.31,97.35]]},"content":[{"text":"[66] I. R. Peters, D. van der Meer, and J. M. Gordillo, Splash wave and crown breakup after disc impact on a liquid surface, J. Fluid Mech. 724, 553 (2013)."}]},
                ]},
                {"type":"paragraph","flowClass":"excluded","anchor":{"pageRects":[[28,232.6,31.18,271.44,39.07]]},"content":[{"text":"073606-29"}]},
    ] }/*END02*/;

    before(function () {
        L = wvT.lib();
        if (!L) wvT.absent("Zotero.Weavero.lib");
        for (const f of ["wvRefIndexNew", "wvRefIndexPut", "wvRefIndexDrop", "wvRefMatch", "wvRefSelfOf", "wvRefCompact", "wvRefApproxDistance", "wvRefVolPages"]) {
            if (typeof L[f] !== "function") wvT.absent("lib." + f);
        }
    });

    function indexOf(items, lib) {
        const ix = L.wvRefIndexNew();
        for (const it of items) L.wvRefIndexPut(ix, Object.assign({ lib: lib || 1 }, it));
        return ix;
    }

    it("finds at least 75% of the in-library references Zotero's popups show, and marks nothing wrongly", function () {
        const ix = indexOf(FIXTURE.items);
        let need = 0, got = 0;
        const falses = [], misses = [];
        for (const sid of Object.keys(FIXTURE.papers).sort()) {
            const p = FIXTURE.papers[sid];
            const self = L.wvRefSelfOf(ix, [p.citing]);
            const truth = new Set([].concat(...p.truth));
            const found = new Set();
            for (const t of p.texts) {
                const m = L.wvRefMatch(ix, t, self);
                if (!m) continue;
                if (truth.has(m.ids[0])) found.add(m.ids[0]);
                else falses.push(sid + ": " + m.how + " -> " + m.ids[0] + " <= " + t.slice(0, 80));
            }
            need += p.truth.length;
            const hit = p.truth.filter((g) => g.some((id) => found.has(id))).length;
            got += hit;
            if (hit < p.truth.length) misses.push(sid + " " + hit + "/" + p.truth.length);
        }
        assert.deepEqual(falses, [], "no reference marked as an item it does not name");
        assert.isAtLeast(got / need, 0.75, "found " + got + " of " + need + " (short: " + misses.join(", ") + ")");
    });

    it("never takes the citing paper itself: its DOI or its title, in any library", function () {
        const items = [
            { id: 1, title: "Bouncing drops on a vibrating bath of silicone oil", DOI: "10.1234/self.1", first: "Smith", date: "2020" },
            // A copy of the citing paper in a group library: the same DOI.
            { id: 2, lib: 7, title: "Bouncing drops on a vibrating bath of silicone oil", DOI: "10.1234/self.1", first: "Smith", date: "2020" },
            { id: 3, title: "Splashing on dry surfaces at low pressure", DOI: "10.1234/other.3", first: "Jones", date: "2011" },
        ];
        const ix = L.wvRefIndexNew();
        for (const it of items) L.wvRefIndexPut(ix, Object.assign({ lib: 1 }, it));
        const self = L.wvRefSelfOf(ix, [1]);
        // "See Supplemental Material" lines carry the paper's own DOI (Reference Checker's false mark).
        assert.isNull(L.wvRefMatch(ix, "See Supplemental Material at http://link.example.org/supplemental/10.1234/self.1 for movies.", self));
        assert.isNull(L.wvRefMatch(ix, "[3] A. Smith, Bouncing drops on a vibrating bath of silicone oil, J. Test 1, 2 (2020).", self),
            "the paper's own title, in another library too");
        assert.deepEqual(L.wvRefMatch(ix, "[4] Jones, B. 2011 Splashing on dry surfaces at low pressure. J. Test 3, 4.", self).ids, [3]);
        // (Since 1.2.1-refs.7 a DOI names its item with the item's author or year beside it.)
        assert.deepEqual(L.wvRefMatch(ix, "See A. Smith (2020), 10.1234/self.1", undefined).ids.slice().sort(), [1, 2], "without the guard both copies match");
    });

    it("names every copy of the work: the same DOI, or the same title by the same first author", function () {
        const ix = L.wvRefIndexNew();
        L.wvRefIndexPut(ix, { id: 10, lib: 1, title: "Dimple drainage before the coalescence of a droplet", DOI: "10.1073/pnas.1", first: "Chubynsky", date: "2020" });
        L.wvRefIndexPut(ix, { id: 11, lib: 5, title: "Dimple drainage before the coalescence of a droplet", first: "Chubynsky", date: "2020" });
        L.wvRefIndexPut(ix, { id: 12, lib: 6, title: "Dimple drainage before the coalescence of a droplet", first: "Other", date: "1999" });
        L.wvRefIndexPut(ix, { id: 13, lib: 8, title: "Something else entirely, by DOI", DOI: "https://doi.org/10.1073/PNAS.1", first: "Chubynsky", date: "2020" });
        const m = L.wvRefMatch(ix, "Chubynsky, M. V. et al. 2020 Dimple drainage before the coalescence of a droplet. PNAS 117, 18041.");
        assert.equal(m.how, "title");
        assert.deepEqual(m.ids.slice().sort((a, b) => a - b), [10, 11, 13], "not the same title by another author");
    });

    it("an entry without a title: volume and first page, with the first author at the start", function () {
        const ix = L.wvRefIndexNew();
        L.wvRefIndexPut(ix, { id: 20, lib: 1, title: "Singular jets and bubbles in drop impact", first: "Bartolo", date: "2006", volume: "96", pages: "124501" });
        L.wvRefIndexPut(ix, { id: 21, lib: 1, title: "A paper by someone else", first: "Zhang", date: "2006", volume: "96", pages: "124502" });
        assert.equal(L.wvRefMatch(ix, "[7] D. Bartolo, C. Josserand, and D. Bonn, Phys. Rev. Lett. 96, 124501 (2006).").ids[0], 20);
        assert.isNull(L.wvRefMatch(ix, "[8] K. Miller, Phys. Rev. Lett. 96, 124501 (2006)."), "another first author: not taken");
        assert.includeMembers(L.wvRefVolPages("Physics of Fluids6(7), 993."), ["6|993"]);
        assert.includeMembers(L.wvRefVolPages("J. Fluid Mech. 958, A24."), ["958|a24"]);
        assert.includeMembers(L.wvRefVolPages("Computational linguistics, 18(4):467–479."), ["18|467"]);
    });

    it("an approximate title only when the first author and the year agree, at most 10% wrong", function () {
        const ix = L.wvRefIndexNew();
        L.wvRefIndexPut(ix, { id: 30, lib: 1, title: "Character-level language modeling with deeper self-attention", first: "Al-Rfou", date: "2018" });
        // The PDF's line break hyphenated a word and dropped a letter: no exact title.
        const text = "Rami Al-Rfou, Dokook Choe, Noah Constant, Mandy Guo, and Llion Jones. 2018. Character-level lan- guage modling with deeper self-attention. arXiv preprint arXiv:1808.04444.";
        assert.equal(L.wvRefMatch(ix, text).how, "approx");
        assert.isNull(L.wvRefMatch(ix, text.replace("2018.", "2019.")), "another year");
        assert.isNull(L.wvRefMatch(ix, text.replace("Rami Al-Rfou", "Rami Other")), "another first author");
        assert.isNull(L.wvRefMatch(ix, text.replace("modling with deeper", "modelling and shallower")), "too many differences");
        assert.equal(L.wvRefApproxDistance("abcdef", "xxabdefxx", 2), 1);
    });

    // 2026-11-20 night: the approximate-title step asks an index (year + first-author form) instead of
    // walking every item of the year; its answers stay the old ones -- the same on 113,496 full-text
    // entries and every accuracy set -- ties and another script's names included.
    it("an approximate title through the year-and-surname index: a tie to the item that entered first, a crowd of the year's other items no matter, another script's first author still found", function () {
        const ix = L.wvRefIndexNew();
        const title = "Character-level language modeling with deeper self-attention";
        const text = "Rami Al-Rfou, Dokook Choe, Noah Constant, Mandy Guo, and Llion Jones. 2018. Character-level lan- guage modling with deeper self-attention. arXiv preprint arXiv:1808.04444.";
        L.wvRefIndexPut(ix, { id: 51, lib: 1, title, first: "Al-Rfou", date: "2018" });
        L.wvRefIndexPut(ix, { id: 52, lib: 2, title, first: "Al-Rfou", date: "2018" });
        const m = L.wvRefMatch(ix, text);
        assert.equal(m.how, "approx");
        assert.deepEqual(Array.from(m.ids), [51, 52], "the copy that entered first, then the other");
        L.wvRefIndexPut(ix, { id: 51, lib: 1, title, first: "Al-Rfou", date: "2018" });
        assert.deepEqual(Array.from(L.wvRefMatch(ix, text).ids), [52, 51], "an item put again enters last");
        for (let k = 0; k < 200; k++) L.wvRefIndexPut(ix, { id: 1000 + k, lib: 1, title: title + " part " + k, first: "Other" + k, date: "2018" });
        assert.deepEqual(Array.from(L.wvRefMatch(ix, text).ids), [52, 51], "200 items of the year by other first authors change nothing");
        L.wvRefIndexPut(ix, { id: 60, lib: 1, title: "Numerical simulation of droplet impact on a heated wall", first: "王伟", date: "2015" });
        const o = L.wvRefMatch(ix, "王伟, 李明. 2015. Numerical simulaton of droplet impact on a heated wall. J. Test 1, 2.");
        assert.equal(o && o.how, "approx", "a first author in another script");
        assert.deepEqual(Array.from(o.ids), [60]);
    });

    it("the index follows changes: an item dropped is never found again", function () {
        const ix = L.wvRefIndexNew();
        L.wvRefIndexPut(ix, { id: 40, lib: 1, title: "Inverse Leidenfrost effect: levitating drops on liquid nitrogen", first: "Adda-Bedia", date: "2016" });
        const t = "ADDA-BEDIA, M. et al. 2016 Inverse Leidenfrost effect: levitating drops on liquid nitrogen. Langmuir 32, 4179.";
        assert.equal(L.wvRefMatch(ix, t).ids[0], 40);
        const seq = ix.seq;
        assert.isTrue(L.wvRefIndexDrop(ix, 40));
        assert.isAbove(ix.seq, seq, "a change moves the index's seq (caches key on it)");
        assert.isNull(L.wvRefMatch(ix, t));
    });

    // ---- 1.2.1-refs.7: the fixes from the 2026-11-19 comparison and the 2026-11-20 survey
    // (work/refs-vs-plugins-2026-11-19.md "refs.7", work/refs-library-survey-2026-11-20.md).

    it("fix 1: a Physical Review page with \"(R)\" after it matches the entry's plain number", function () {
        // MJT's papers 05 [30], 05 [68], 07 [25]: the library's pages read "051901(R)".
        const ix = indexOf([{ id: 1, title: "Size of the top jet drop produced by bubble bursting", first: "Ghabache", date: "2016", volume: "1", pages: "051901(R)" },
            { id: 2, title: "Experimental observation of von Kármán vortices during drop impact", first: "Castrejón-Pita", date: "2012", volume: "86", pages: "045301(R)" }]);
        const m = L.wvRefMatch(ix, "[30] E. Ghabache and T. Seón, Phys. Rev. Fluids 1, 051901(R) (2016).");
        assert.ok(m, "matched");
        assert.deepEqual([m.ids[0], m.how], [1, "volpage"]);
        // A combining accent (o + U+0301) keeps the surname whole.
        const m2 = L.wvRefMatch(ix, "[25] A. A. Castrejón-Pita, J. R. Castrejón-Pita, and I. M. Hutchings, Phys. Rev. E 86, 045301(R) (2012).");
        assert.equal(m2 && m2.ids[0], 2, "Castrejón-Pita written with a combining accent");
    });

    it("fix 2: a short title needs its first author as a word, not inside another word (\"landau\" in \"Queensland\")", function () {
        // MJT's paper 05 [9]: 1.2.1-refs.6 marked Liow & Cole 2007 as Landau & Lifshitz, "Fluid mechanics".
        const ix = indexOf([{ id: 1, title: "Fluid mechanics", first: "Landau", date: "1987" }]);
        assert.isNull(L.wvRefMatch(ix, "[9] J.-L. Liow, Fluid Mechanics. The University of Queensland, Australia, 2007, p. 1."), "\"landau\" inside \"Queensland, Australia\"");
        assert.equal(L.wvRefMatch(ix, "[3] L. D. Landau and E. M. Lifshitz, Fluid Mechanics (Pergamon, 1987).").ids[0], 1, "Landau's own entry still");
    });

    it("fix 3: a library title inside a longer title is that work only by the entry's first author", function () {
        const ix = indexOf([
            { id: 1, title: "Highly Focused Supersonic Microjets", first: "Tagawa", date: "2012", volume: "2", pages: "031002" },
            { id: 2, title: "Experimental investigation", first: "Bhakhar", date: "2006" },
            { id: 3, title: "Droplet Impact on a Solid Surface", first: "Moreira", date: "2011" },
        ]);
        // The 11-11 test set's paper 02 [7] (Reference Checker made the same mistake).
        assert.isNull(L.wvRefMatch(ix, "[7] I. R. Peters, Y. Tagawa, N. Oudalov, C. Sun, A. Prosperetti, D. Lohse, and D. van der Meer, Highly focused supersonic microjets: Numerical simulations, J. Fluid Mech. 719, 587 (2013)."));
        assert.equal(L.wvRefMatch(ix, "[6] Y. Tagawa, N. Oudalov, C. W. Visser, I. R. Peters, D. van der Meer, C. Sun, A. Prosperetti, and D. Lohse, Highly Focused Supersonic Microjets, Phys. Rev. X 2, 031002 (2012).").ids[0], 1);
        // The 2026-11-20 survey: more words after the title, or one before it.
        assert.isNull(L.wvRefMatch(ix, "20 Y. Pan, K. Shi, X. Duan, and G. F. Naterer, “Experimental investigation of water droplet impact and freezing on micropatterned stainless steel surfaces,” Int. J. Heat Mass Transfer 129, 1 (2019)."));
        assert.isNull(L.wvRefMatch(ix, "4 A. J. Diaz and A. Ortega, “Gas-assisted droplet impact on a solid surface,” J. Fluids Eng. 138, 081104 (2016)."));
        assert.equal(L.wvRefMatch(ix, "N. Moreira, A. Moita and M. Panão, Droplet impact on a solid surface: a review, Prog. Energy Combust. Sci. 36 (2011) 554.").ids[0], 3, "the item's own first author: a subtitle the item lacks is fine");
    });

    it("fix 4: a DOI names its item only with the item's first author or year in the entry, outside the DOI itself", function () {
        // The 11-11 test set's paper 06 prints Friesem et al. 2019's DOI under Finlayson & Mithen 2007.
        const ix = indexOf([{ id: 1, title: "Lime plaster cover of the dead 12,000 years ago – new evidence for the origins of lime plaster technology", DOI: "10.1017/ehs.2019.9", first: "Friesem", date: "2019" }]);
        assert.isNull(L.wvRefMatch(ix, "FINLAYSON, B. & S.J. MITHEN. 2007. The early prehistory of Wadi Faynan, southern Jordan. London: CBRL. https://doi.org/10.1017/ehs.2019.9"));
        assert.equal(L.wvRefMatch(ix, "FRIESEM, D., I. ABADI, D. SHAHAM & L. GROSMAN. 2019. Lime plaster cover of the dead. Evolutionary Human Sciences 1: e9. https://doi.org/10.1017/ehs.2019.9").ids[0], 1);
        assert.equal(L.wvRefMatch(ix, "[4] Friesem D, et al. Evol. Hum. Sci. doi:10.1017/ehs.2019.9").ids[0], 1, "the author alone is enough");
        assert.equal(L.wvRefMatch(ix, "[4] Evol. Hum. Sci. 1, e9 (2020). doi:10.1017/ehs.2019.9").ids[0], 1, "the year alone, one off (online / issue)");
        // An item with neither an author nor a year: its DOI alone.
        const ix2 = indexOf([{ id: 2, title: "Anonymous report on drops", DOI: "10.5555/anon.1" }]);
        assert.equal(L.wvRefMatch(ix2, "See 10.5555/anon.1").ids[0], 2);
    });

    it("F6: volume and page in RSC / ACS / MDPI (YEAR, VOL, PAGE), EPL / Elsevier (VOL (YEAR) PAGE) and IOP (VOL PAGE) styles", function () {
        assert.includeMembers(L.wvRefVolPages("C. Wares, Int. J. Heat Mass Transfer, 1966, 9, 1153."), ["9|1153"]);
        assert.includeMembers(L.wvRefVolPages("J. Fluid Mech. 2006, 554, 85−97."), ["554|85"]);
        assert.includeMembers(L.wvRefVolPages("Phys. Lett. A 554 (2006) 85."), ["554|85"]);
        assert.includeMembers(L.wvRefVolPages("Bernal L P and Roshko A 1986 J. Fluid Mech. 170 499–525"), ["170|499"]);
        const ix = indexOf([{ id: 1, title: "A paper on heat transfer to drops", first: "Wares", date: "1966", volume: "9", pages: "1153-1162" },
            { id: 2, title: "Spume drops produced by the wind tearing of wave crests", first: "Anguelova", date: "1999", volume: "29", pages: "1156-1165" }]);
        assert.equal(L.wvRefMatch(ix, "15 C. Wares, Int. J. Heat Mass Transfer, 1966, 9, 1153.").ids[0], 1, "RSC");
        assert.equal(L.wvRefMatch(ix, "[413] Anguelova M and Barber R P 1999 J. Phys. Oceanogr. 29 1156–65").ids[0], 2, "IOP");
    });

    it("volume + page: the entry's FIRST author, and the year when the entry writes one", function () {
        const ix = indexOf([{ id: 1, title: "Polymeric flaky nanostructures", first: "Wang", date: "2016", volume: "3", pages: "1-12" },
            { id: 2, title: "Processing and design methodologies for coatings", first: "Kumar", date: "2016", volume: "27", pages: "1-20" },
            { id: 3, title: "Bubble entrainment by the impact of drops on liquid surfaces", first: "Oğuz", date: "1990", volume: "219", pages: "143-179" }]);
        // The survey's lists: a co-author's surname, another year.
        assert.isNull(L.wvRefMatch(ix, "25. Weiss K, Khoshgoftaar T M, Wang D D. A survey of transfer learning[J]. Journal of Big data, 2016, 3(1): 1-40."));
        assert.isNull(L.wvRefMatch(ix, "[31] Kumar S 2006 Nanofluids—the cooling medium of the future Heat Transfer Eng. 27 1–2"));
        // An OCR'd surname in two pieces is still the first author.
        assert.equal(L.wvRefMatch(ix, "Ogũ z, H. N., and A. Prosperetti, 1990, J. Fluid Mech. 219, 143.").ids[0], 3);
    });

    it("1.2.1-refs.8: a numbered part of a series is never another part -- no approximate title, no title inside one that goes on with another numeral", function () {
        const ix = indexOf([
            { id: 1, title: "Statistical theory of turbulence", first: "Taylor", date: "1935" },
            { id: 2, title: "Statistical theory of turbulence-II", first: "Taylor", date: "1935" },
            { id: 3, title: "Transient cavities near boundaries. Part 1. Rigid boundary", first: "Blake", date: "1986" },
        ]);
        // r3's NACA scan (paper 26), its reference 17 as OCR'd: Taylor's part III.
        assert.isNull(L.wvRefMatch(ix, "17. Taylor, G. I.: Statistical Theory of Turbulence lII- 1)islribulion of I)issil)alion of F, ner_y in a Pipe Over Its ('ross-Seclion. I)roc. Roy. Soc. (London), ser. A, vol. 151, no. 874, Sept. 1935, pp. 455-464."));
        assert.isNull(L.wvRefMatch(ix, "Blake, J. R., Taib, B. B. & Doherty, G. 1987 Transient cavities near boundaries. Part 2. Free surface. J. Fluid Mech. 181, 197-212."), "part 2 is not part 1");
        assert.equal(L.wvRefMatch(ix, "16. Taylor, G. I.: Statistical Theory of Turbulence II. Proc. Roy. Soc. (London), ser. A, vol. 151, 1935, pp. 444-454.").ids[0], 2, "part II itself");
        assert.equal(L.wvRefMatch(ix, "15. Taylor, G. I.: Statistical Theory of Turbulence. Proc. Roy. Soc. (London), ser. A, vol. 151, 1935, pp. 421-444.").ids[0], 1, "part I, written without a numeral");
        assert.equal(L.wvRefMatch(ix, "Blake, J. R., Taib, B. B. & Doherty, G. 1986 Transient cavities near boundaries. Part 1. Rigid boundary. J. Fluid Mech. 170, 479-497.").ids[0], 3);
    });

    it("1.2.1-refs.8: a title names its item only when the item's first author is in the entry -- names in particles, OCR, small capitals and given name first still count", function () {
        const ix = indexOf([
            { id: 1, title: "Handbook of Mathematical Functions", first: "Boisvert", date: "2001", pages: "135-139" },
            { id: 2, title: "Handbook of mathematical Functions With Formulas, Graphs, and Mathematical Tables", first: "Abramovitz", date: "1972" },
            { id: 3, title: "Liquid Drops on the Same Liquid Surface", first: "Katalinic", date: "1931" },
            { id: 4, title: "Liquid Drops on the Same Liquid Surface", first: "Hughes", date: "1932" },
            { id: 5, title: "The Fluid Dynamics of Taylor Cones", first: "Fernández de la Mora", date: "2007" },
            { id: 6, title: "The splash/non-splash boundary upon a dry surface and thin fluid film", first: "Vander Wal", date: "2006" },
            { id: 7, title: "On the stability, or instability, of certain fluid motions", first: "Lord Rayleigh", date: "1880" },
            { id: 8, title: "Limiting forms for capillary-gravity waves", first: "Longuet-Higgins", date: "1988" },
            { id: 9, title: "Viscous and resistive eddies near a sharp corner", first: "Moffatt", date: "1964" },
            { id: 10, title: "Numerical study of droplet fragmentation during impact on mesh screens", first: "Wang", date: "2019" },
            { id: 11, title: "An Introduction to Fluid Dynamics", first: "Batchelor", date: "1967" },
            { id: 12, title: "Inclined impact of drops", first: "García-Geijo", date: "2020" },
        ]);
        const m = (t) => { const r = L.wvRefMatch(ix, t); return r ? r.ids[0] : null; };
        // The survey's lists: another work with the same title.
        assert.isNull(m("ABRAMOWITZ, M. & STEGUN, I. A. 1972 Handbook of Mathematical Functions. Dover."), "not Boisvert's 2001 chapter");
        assert.equal(m("[13] W. Hughes and A. R. Hughes, Liquid drops on the same liquid surface, Nature (London) 129, 59 (1932)."), 4, "Hughes, not Katalinic");
        // Name forms the item writes otherwise.
        assert.equal(m("32 J. F. de La Mora, “The fluid dynamics of Taylor cones,” Annu. Rev. Fluid Mech. 39, 217–243 (2007)."), 5);
        assert.equal(m("19 R. L. V. Wal, G. M. Berger, and S. D. Mozes, “The splash/non-splash boundary upon a dry surface and thin fluid film,” Exp. Fluids 40, 53 (2006)."), 6);
        assert.equal(m("Rayleigh, Lord 1880 On the stability, or instability, of certain fluid motions. Proc. London Math. Soc. 11, 57-70."), 7);
        assert.equal(m("LONQUET-HIQQINMS.,S. 1988 Limiting forms for capillary-gravity waves. J. Fluid Mech. 194, 351-375."), 8, "an OCR'd name, letters off");
        assert.equal(m("M, H. K. 1964 Viscous and resistive eddies near a sharp corner. J. Fluid Mech. 18, 1–18."), 9, "small capitals cut to one letter, the year agreeing");
        assert.equal(m("[35] W. Liwei, W. Xiao, Y. Weijie, H. Pengfei, H. Feng, Z. Xiwen, Numerical study of droplet fragmentation during impact on mesh screens, Phys. Fluids 31 (2019) 062102."), 10, "given name first");
        // Adobe's private-use small capitals ("B" + U+F761 ...) and AIP's dotless ı are the letters they draw.
        const pua = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(0xf761 + c.charCodeAt(0) - 97));
        assert.equal(m("G. K. B" + pua("atchelor") + ", An Introduction to Fluid Dynamics (Cambridge University Press, 1967)."), 11);
        assert.equal(m("42 P. Garcıa-Geijo, G. Riboux, and J. M. Gordillo, “Inclined impact of drops,” J. Fluid Mech. 897, A12 (2020)."), 12);
        const s = { content: [{ type: "heading", content: [{ text: "References" }] },
            { type: "paragraph", reference: true, anchor: { pageRects: [[9, 50, 600, 400, 610]] }, content: [{ text: "S" + pua("affman") + ", P. G. 1970 The velocity of viscous vortex rings. Stud. Appl. Maths 49, 371–380." }] }] };
        assert.match(L.wvRefList(s).entries[0].text, /^Saffman, P\. G\. 1970/, "the section shows the name");
    });

    it("1.2.1-refs.8: r3's last misses -- a subtitle or a roman numeral only in the item, Rayleigh as Strutt, a title of under ten letters, a PNAS article number", function () {
        const ix = indexOf([
            { id: 1, title: "An Introduction to Interfaces and Colloids: The Bridge to Nanoscience", first: "Berg", date: "2009" },
            { id: 2, title: "VI. On the capillary phenomena of jets", first: "Strutt", date: "1879", volume: "29", pages: "71-97" },
            { id: 3, title: "Fast R-CNN", first: "Girshick", date: "2015" },
            { id: 4, title: "Periodic bouncing of a plasmonic bubble in a binary liquid by competing solutal and thermal Marangoni forces", first: "Zeng", date: "2021", volume: "118", pages: "e2103215118" },
            { id: 5, title: "Evaporation of Pinned Sessile Microdroplets of Water: Computer Simulations", first: "Semenov", date: "2012" },
            { id: 6, title: "An Analysis of Cloud Drop Growth by Collection: Part I. Double Distributions", first: "Berry", date: "1974" },
        ]);
        const m = (t) => { const r = L.wvRefMatch(ix, t); return r ? r.ids[0] : null; };
        assert.equal(m("Berg, J.C., 2009. An Introduction To Interfaces and Colloids. WORLD SCIENTIFIC."), 1, "the subtitle only in the item");
        assert.equal(m("5. Rayleigh L. On the capillary phenomena of jets. Proc R Soc Lond (1879) 29(30):71–97."), 2, "a roman numeral only in the item; Lord Rayleigh is John William Strutt");
        assert.equal(m("[23] Ross Girshick. Fast R-CNN. In ICCV, 2015."), 3, "a title of eight letters, by its author, of its year, as a phrase");
        assert.isNull(m("[57] Shaoqing Ren, Kaiming He, Ross Girshick, and Jian Sun. Faster R-CNN: Towards real-time object detection with region proposal networks. In NeurIPS, 2015."));
        assert.equal(m("18 B. Zeng, K. L. Chong, Y. Wang, C. Diddens, X. Li, M. Detert, H. J. Zandvliet and D. Lohse, Proc. Natl. Acad. Sci. U. S. A., 2021, 118, e2103215118."), 4, "an eleven-character article number");
        // Not another work whose title begins as the item's main title does, nor another part of a series.
        assert.isNull(m("55. Semenov, S., Starov, V. M., Rubio, R. G. (2013). Evaporation of pinned sessile microdroplets of water on a highly heat-conductive substrate: computer simulations."));
        assert.isNull(m("22 E. X. Berry and R. L. Reinhardt, “An analysis of cloud drop growth by collection: Part III. Accretion and self-collection,” J. Atmos. Sci. 31, 2118 (1974)."));
    });

    // ---- 1.2.1-refsacc.1: accuracy (work/refs-accuracy-2026-11-20.md), each case from the 2026-11-20 survey of
    // MJT's library or the r4 books / old-papers benchmark.

    it("1.2.1-refsacc.1: volume + page -- a first author OCR or a typist misspelt (the exact year), a surname without its particle or initial, the DOI's own volume and page, an item with no creator, a spaced article number", function () {
        const ix = indexOf([
            { id: 1, title: "Sudden collapse of a colloidal gel", first: "Bartlett", date: "2012", volume: "85", pages: "021404" },
            { id: 2, title: "Change in interface and film shapes for a deformable drop", first: "Burrill", date: "1969", volume: "30", pages: "511-524" },
            { id: 3, title: "Inkjet printing of well-defined polymer dots and arrays", first: "de Gans", date: "2004", volume: "20", pages: "7789-7793" },
            { id: 4, title: "On the Spreading of Liquids on Solid Surfaces: Static and Dynamic Contact Lines", first: "Dussan V.", date: "1979", volume: "11", pages: "371-400" },
            { id: 5, title: "Direct Measurement of the Flow Field around Swimming Microorganisms", first: "Drescher", date: "2010", volume: "105", DOI: "10.1103/PhysRevLett.105.168101" },
            { id: 6, title: "The instability of liquid surfaces when accelerated in a direction perpendicular to their planes. I", date: "1950", volume: "201", pages: "192-196" },
            { id: 7, title: "The role of interstitial gas in determining the impact response of granular beds", first: "Royer", date: "2011", volume: "93", pages: "28008" },
        ]);
        const m = (t) => { const r = L.wvRefMatch(ix, t); return r ? r.ids[0] : null; };
        assert.equal(m("Barlett, P., L. Teece, and M. Faers (2012), Phys. Rev. E 85, 021404."), 1, "Barlett for Bartlett");
        assert.isNull(m("Barlett, P., L. Teece, and M. Faers (2011), Phys. Rev. E 85, 021404."), "a misspelt name only with the exact year");
        assert.isNull(m("[8] K. Miller, Phys. Rev. E 85, 021404 (2012)."), "another first author still refused");
        assert.equal(m("11. ]~URRILL, K. A., AND WOODS, D. R., J. Colloid Interface Sci. 30, 511 (1969)."), 2, "an old scan's OCR");
        assert.equal(m("(4) Gans, B.-J.; Schubert, U. S. Langmuir 2004, 20, 7789−7793."), 3, "the particle left out");
        assert.equal(m("[16] Dussan EB. Ann. Rev. Fluid Mech. 1979;11:371."), 4, "the library's trailing initial");
        assert.equal(m("[5] K. Drescher, R. E. Goldstein, N. Michel, M. Polin, and I. Tuval, Phys. Rev. Lett. 105, 168101 (2010)."), 5, "the DOI's own volume and article number");
        assert.equal(m("[416] Taylor G I 1950 Proc. R. Soc. Lond. A 201 192–6"), 6, "a record without a creator: volume, page and the year exactly");
        assert.isNull(m("[416] Taylor G I 1951 Proc. R. Soc. Lond. A 201 192–6"), "... not another year");
        assert.equal(m("[9] J. R. Royer, B. Conyers, E. I. Corwin, P. J. Eng, and H. M. Jaeger, Europhys. Lett. 93, 28 008 (2011)."), 7, "a thin space in the article number");
        // A volume and a page each named (NASA / AIAA, old footnotes), a roman volume read as its number too.
        assert.includeMembers(L.wvRefVolPages("E. L. Harrington, Phys.Rev., Series 2, Vol.8, p 738, 1916."), ["8|738"]);
        assert.includeMembers(L.wvRefVolPages("Journal of Fluid Mechanics, Vol. 23, 1965, pp. 31-64."), ["23|31"]);
        assert.includeMembers(L.wvRefVolPages("Maxwell, Proceedings of the Royal Society, Vol. XV, p 14, 1866."), ["15|14"]);
        L.wvRefIndexPut(ix, { id: 8, lib: 1, title: "The structure of a self-preserving turbulent plane jet", first: "Bradbury", date: "1965", volume: "23", pages: "31-64" });
        assert.equal(m("13 Bradbury, L. J. S., \"The structure of the self-preserving jet,\" Journal of Fluid Mechanics, Vol. 23, 1965, pp. 31-64."), 8);
        // The volume left out, the year in its place (RSC lists).
        L.wvRefIndexPut(ix, { id: 9, lib: 1, title: "Properties of liquid marbles", first: "Aussillous", date: "2006", volume: "462", pages: "973-999" });
        assert.equal(m("29 P. Aussillous and D. Quéré, Proc. R. Soc. A, 2006, 973–999."), 9);
        assert.isNull(m("30 D. Quéré, Proc. R. Soc. A, 2006, 973–999."), "... by its first author still");
    });

    it("1.2.1-refsacc.1: titles -- a short title by a first author OCR spelt (the exact year), a title an old scan's line stops inside of", function () {
        const ix = indexOf([
            { id: 1, title: "The Underwater Noise of Rain", first: "Prosperetti", date: "1989" },
            { id: 2, title: "The interaction of falling water drops: coalescence", first: "Brazier-Smith", date: "1972" },
            { id: 3, title: "The Collision, Coalescence, and Disruption of Water Droplets", first: "Adam", date: "1968" },
            { id: 4, title: "Fluid Mechanics", first: "Landau", date: "1959" },
        ]);
        const m = (t) => { const r = L.wvRefMatch(ix, t); return r ? r.ids[0] : null; };
        assert.equal(m("PROSPEREAT.,TIC,RUM,L. A. & PUMPHREH.Y,C. 1989 The underwater noise of rain. J.Qeophys."), 1);
        assert.isNull(m("PROSPEREAT.,TIC,RUM,L. A. & PUMPHREH.Y,C. 1990 The underwater noise of rain. J.Qeophys."), "a short title's OCR'd author needs the exact year");
        assert.equal(m("LANDAUL,. D . & LIFSHITZE, . M. 1959 Fluid Mechanics, p. 54. Addison-Wesley."), 4);
        assert.equal(m("BRAZIER-SMITPH.,R., JENNINS.OGS. ,& LATHAMJ,. 1972 The interaction of falling water drops:"), 2, "the entry stops inside the title");
        assert.equal(m("ADAM, J. R., LINDBLAD,N. R. & HENDRICKSC,. D. 1968 The collision, coalescence, and"), 3);
        assert.isNull(m("ADAM, J. R., LINDBLAD,N. R. & HENDRICKSC,. D. 1970 The collision, coalescence, and"), "... of the item's year");
        assert.isNull(m("SMITH, J. R. 1968 The collision, coalescence, and"), "... by its first author");
        // Two works of that author and year begin so: none is taken.
        L.wvRefIndexPut(ix, { id: 5, lib: 1, title: "The collision, coalescence, and breakup of raindrops", first: "Adam", date: "1968" });
        assert.isNull(m("ADAM, J. R., LINDBLAD,N. R. & HENDRICKSC,. D. 1968 The collision, coalescence, and"), "two works fit");
    });

    it("1.2.1-refsacc.1: no title across the years where the entry names another work -- inside a longer title, by a co-author, before another part's numeral; a SICI DOI read whole", function () {
        const ix = indexOf([
            { id: 1, title: "Computational Aeroacoustics", first: "Hardin", date: "1993" },
            { id: 2, title: "The International Linear Collider", first: "Michizono", date: "2019" },
            { id: 3, title: "Spectral (Finite) Volume Method for Conservation Laws on Unstructured Grids", first: "Wang", date: "2002", volume: "179", pages: "665-697" },
            { id: 4, title: "A Monte Carlo Implementation of the Nonlinear Filtering Problem", first: "Anderson", date: "1999", DOI: "10.1175/1520-0493(1999)127<2741:AMCIOT>2.0.CO;2" },
            { id: 5, title: "Digital particle image velocimetry", first: "Willert", date: "1991" },
            { id: 6, title: "An Introduction to Fluid Dynamics", first: "Batchelor", date: "2000" },
        ]);
        const m = (t) => { const r = L.wvRefMatch(ix, t); return r ? r.ids[0] : null; };
        // The r4 books.
        assert.isNull(m("9. Hardin, J.C. et al., “ICASE/LaRC Workshop Benchmark Problems in Computational Aeroacoustics (CAA)”, NASA Conference Publication 3300, May 1995."));
        assert.isNull(m("[2]L. Evans and S. Michizono, The International Linear Collider Machine Staging Report, November 2017, https://arxiv.org/abs/1711.00568."));
        assert.isNull(m("3. Wang Z.J. and Liu, Y.: Spectral (Finite) Volume Method for Conservation Laws on Unstructured Grids III: Extension to One-Dimensional Systems, Journal of Scientific Computing, Vol. 20, No. 1, pp. 137-157, 2004."));
        assert.isNull(m("4. Wang, Z.J., Zhang, L. and Liu, Y.: Spectral (Finite) Volume Method for Conservation Laws on Unstructured Grids IV: Extension to Two-Dimensional Euler Equations, to appear in, J. Computational Physics."));
        assert.equal(m("2. Wang, Z.J. and Liu, Y.: Spectral (Finite) Volume Method for Conservation Laws on Unstructured Grids II: Extension to Two-Dimensional Scalar Equation, J. Computational Physics, Vol. 179, pp. 665-697, 2002."), 3, "part II, of the item's year");
        assert.isNull(m("Leeuwen, P. J. van (1999). “Comment on “Data assimilation using an ensemble Kalman filter technique”.” In: Monthly Weather Review 127.6, pp. 1374–1377. doi: 10.1175/1520-0493(1999)127<1374:CODAUA>2.0.CO;2."), "another article of the volume");
        assert.equal(L.wvRefCleanDOI("doi: 10.1175/1520-0493(1999)127<1374:CODAUA>2.0.CO;2."), "10.1175/1520-0493(1999)127<1374:codaua>2.0.co;2");
        // The survey: a longer title of another year by the same author.
        assert.isNull(m("9. Willert, C. Stereoscopic digital particle image velocimetry for application in wind tunnel flows. Meas. Sci. Technol. 1997, 8, 1465."));
        // A book's other edition, by its title and an OCR'd author, stays the book.
        assert.equal(m("BATCHELOGR,. K. 1967 An Introduction to Fluid Dynamics. Cambridge University Press."), 6);
    });

    it("1.3.0-refyear.1: a journal article's exact title across the years is another work unless the entry prints its volume and page -- a book's other edition stays the book", function () {
        // MJT 2026-11-26: Schmid 2022 (Annu. Rev. Fluid Mech. 54) cites the 2008 APS DFD talk
        // that bears the exact title of Schmid's 2010 J. Fluid Mech. paper; the talk was marked
        // as the paper.
        const ix = indexOf([
            { id: 1, title: "Dynamic mode decomposition of numerical and experimental data", first: "Schmid", date: "2010", volume: "656", pages: "5-28" },
            { id: 2, title: "An Introduction to Fluid Dynamics", first: "Batchelor", date: "2000" },
        ]);
        const m = (t) => { const r = L.wvRefMatch(ix, t); return r ? r.ids[0] : null; };
        assert.isNull(m("Schmid PJ, Sesterhenn JL. 2008. Dynamic mode decomposition of numerical and experimental data. Paper presented at 61st Annual Meeting of the APS Division of Fluid Dynamics, Nov. 25, San Antonio, TX"), "the 2008 talk is not the 2010 paper");
        assert.equal(m("Schmid PJ. 2010. Dynamic mode decomposition of numerical and experimental data. J. Fluid Mech. 656:5–28"), 1, "the paper itself");
        assert.equal(m("Schmid PJ. 2009. Dynamic mode decomposition of numerical and experimental data. J. Fluid Mech."), 1, "one year off: online or issue year");
        assert.equal(m("Schmid PJ. 2008. Dynamic mode decomposition of numerical and experimental data. J. Fluid Mech. 656:5–28"), 1, "a misprinted year, the item's volume and page printed");
        assert.equal(m("BATCHELOR, G. K. 1967 An Introduction to Fluid Dynamics. Cambridge University Press."), 2, "a book's other edition stays the book");
        // An earlier version of the paper, named as such, stays the paper (the library survey's
        // "J. Fluid Mech. (submitted)", "Harvard University preprint", "arXiv:2012.10433 (2021)").
        assert.equal(m("SCHMID, P. J. 2008 Dynamic mode decomposition of numerical and experimental data. J. Fluid Mech. (submitted)."), 1, "submitted");
        assert.equal(m("P. J. Schmid, “Dynamic mode decomposition of numerical and experimental data,” arXiv:0811.0000 (2008)."), 1, "a preprint");
    });

    it("1.3.0-refyear.1: a DOI the entry writes whole that goes on past an item's DOI names a component of it (a supplementary file), not the item -- a DOI the layout split still names it", function () {
        // MJT 2026-11-26: an entry citing AIP's supplementary material, registered as
        // "<article DOI>.8", was marked as the article itself: the split-DOI rule compares
        // compact DOIs, and the article's is a prefix of the file's.
        const ix = indexOf([
            { id: 1, title: "Drop impact on a sessile soap bubble", first: "Zhang", date: "2022", DOI: "10.1063/5.0129427" },
        ]);
        const m = (t) => { const r = L.wvRefMatch(ix, t); return r ? r.how + ":" + r.ids[0] : null; };
        assert.isNull(m("Xurui Zhang, Zhen Jian, Boyu Hou. (2022). 10.1063/5.0129427.8. Physics of Fluids. https://doi.org/10.1063/5.0129427.8"), "the supplementary file is not the article");
        assert.equal(m("Zhang X, Jian Z, Hou B. 2022. Phys. Fluids. https://doi.org/10.1063/5.0129427"), "doi:1", "the article's own DOI");
        assert.equal(m("Zhang X, Jian Z, Hou B. 2022. Phys. Fluids. doi:10.1063/5. 0129427"), "doi:1", "a DOI the layout split");
    });

    it("1.3.0-refyear.2: a reprint or a translation is found by its original date's year -- the Original Date field, or an Extra line as Zotero reads it", function () {
        // MJT 2026-11-26 ("Use Original Date"): Kolmogorov's 1941 Doklady paper, which the
        // library holds as its 1991 Proc. R. Soc. A English translation.
        const K41 = "Kolmogorov AN. 1941 The local structure of turbulence in incompressible viscous fluid for very large Reynolds numbers. Dokl. Akad. Nauk SSSR 30, 301-305";
        const item = { id: 1, title: "The Local Structure of Turbulence in Incompressible Viscous Fluid for Very Large Reynolds Numbers", first: "Kolmogorov", date: "1991-07", volume: "434", pages: "9-13" };
        const m = (ix, t) => { const r = L.wvRefMatch(ix, t); return r ? r.ids[0] : null; };
        assert.isNull(m(indexOf([item]), K41), "no original date: the 1991 reprint is not the 1941 paper");
        assert.equal(m(indexOf([Object.assign({ extra: "Original Date: 1941" }, item)]), K41), 1, "Extra's Original Date");
        assert.equal(m(indexOf([Object.assign({ extra: "PMID: 1\noriginal-date: 1941-06" }, item)]), K41), 1, "the CSL form, on any line");
        assert.equal(m(indexOf([Object.assign({ originalDate: "1941" }, item)]), K41), 1, "the Original Date field (a type that has it)");
        assert.isNull(m(indexOf([Object.assign({ extra: "  Original Date: 1941" }, item)]), K41), "as Zotero: a key starts its line");
        // The year-keyed steps find it by that year too: an approximate title.
        assert.equal(m(indexOf([Object.assign({ extra: "Original Date: 1941" }, item)]), "KOLMOGOROV, A. N. 1941 The local structure of turbulence in incompressible viscous fluid for very large Reynolds number. Dokl. Akad. Nauk SSSR 30, 301."), 1, "an approximate title, by the original year");
        assert.isNull(m(indexOf([item]), "KOLMOGOROV, A. N. 1941 The local structure of turbulence in incompressible viscous fluid for very large Reynolds number. Dokl. Akad. Nauk SSSR 30, 301."), "... not without it");
    });

    // ---- the reference list itself (src/lib/ref-list.ts) --------------------

    function refListFns() {
        for (const f of ["wvRefList", "wvRefListFlagged", "wvRefListDetect", "wvRefListLabel", "wvRefListIsTitle"]) {
            if (typeof L[f] !== "function") wvT.absent("lib." + f);
        }
    }

    it("a numbered list Zotero does not flag (paper 02): read as the paper's reference list, matched with no false mark", function () {
        refListFns();
        const r = L.wvRefList(JSON.parse(JSON.stringify(STRUCT02)));
        assert.equal(r.how, "detected");
        assert.equal(r.entries.length, 66, "[1] ... [66], across the three lists and two page breaks");
        r.entries.forEach((e, i) => assert.match(e.text, new RegExp("^\\[" + (i + 1) + "\\] "), "entry " + (i + 1) + " in order"));
        assert.deepEqual(r.entries[0].rects, [[26, 59.25, 536.29, 449.26, 555.63]], "each entry keeps its box (where its margin mark goes)");
        const ix = indexOf(FIXTURE.items);
        const p = FIXTURE.papers["02"];
        const self = L.wvRefSelfOf(ix, [p.citing]);
        const truth = new Set([].concat(...p.truth));
        const found = new Set(), falses = [];
        for (const e of r.entries) {
            const m = L.wvRefMatch(ix, e.text, self);
            if (!m) continue;
            if (truth.has(m.ids[0])) found.add(m.ids[0]);
            else falses.push(m.how + " -> " + m.ids[0] + " <= " + e.text.slice(0, 80));
        }
        assert.deepEqual(falses, [], "no entry marked as an item it does not name (the Supplemental Material line [48] carries the paper's own DOI)");
        assert.equal(p.truth.filter((g) => g.some((id) => found.has(id))).length, p.truth.length, "every in-library reference of the paper");
    });

    it("Zotero's flagged entries come first; a numbered list counts only where it reads as a reference list", function () {
        refListFns();
        const P = (text, extra) => Object.assign({ type: "paragraph", anchor: { pageRects: [[0, 50, 100, 400, 110]] }, content: [{ text }] }, extra || {});
        const H = (text) => ({ type: "heading", content: [{ text }] });
        const LIST = (...texts) => ({ type: "list", content: texts.map((text) => ({ type: "listitem", anchor: { pageRects: [[1, 50, 100, 400, 110]] }, content: [{ text }] })) });
        const aps = (n) => "[" + n + "] A. Author" + n + ", Some title number " + n + ", Phys. Rev. Fluids " + n + ", 0" + n + "1 (20" + (10 + n) + ").";
        // Flagged blocks: Zotero's list as it is; a numbered list elsewhere is not looked at.
        let s = { content: [LIST(aps(1), aps(2), aps(3), aps(4), aps(5)), P("Smith, J. 2001 A flagged entry. J. Test 1, 2.", { reference: true })] };
        assert.deepEqual(L.wvRefList(s), { how: "flagged", entries: [{ text: "Smith, J. 2001 A flagged entry. J. Test 1, 2.", rects: [[0, 50, 100, 400, 110]] }] });
        // No heading: [n] entries with years, numbered 1, 2, 3 ... across page furniture (the APS shape).
        s = { content: [P("The body's last words."), LIST(aps(1), aps(2), aps(3)), P("12", { flowClass: "excluded" }), LIST(aps(4), aps(5))] };
        assert.equal(L.wvRefList(s).entries.length, 5);
        // No heading, and not a reference list: steps without years, too few, not from 1.
        assert.equal(L.wvRefList({ content: [LIST("[1] Stir the mixture.", "[2] Heat it slowly.", "[3] Let it cool.", "[4] Filter it.", "[5] Weigh the rest.")] }).how, "none", "no years");
        assert.equal(L.wvRefList({ content: [H("Methods"), ...[1, 2, 3, 4, 5].map((n) => P(n + ". Stir the mixture, step " + n + "."))] }).how, "none", "\"1.\" steps without years");
        // Since 1.2.1-refs.7 (the survey's F3): "1." or "(1)" without a references heading under the
        // same evidence as "[1]" -- five entries or more, most with a year (Nature letters, ACS).
        assert.equal(L.wvRefList({ content: [H("Received 14 June; accepted 21 December 1999."), ...[1, 2, 3, 4, 5].map((n) => P(n + ". Smith, J. Some title. Nature " + n + ", 2 (200" + n + ")."))] }).entries.length, 5, "\"1.\" with years");
        assert.equal(L.wvRefList({ content: [LIST(aps(1), aps(2), aps(3), aps(4))] }).how, "none", "four entries without a heading");
        assert.equal(L.wvRefList({ content: [LIST(aps(2), aps(3), aps(4), aps(5), aps(6))] }).how, "none", "a list starts at 1");
        // After a references heading: any numbering; a line without a number joins the entry before it.
        s = { content: [H("7 References"), P("1. Smith, J. 2001 A first title."), P("J. Test Mech. 12, 34."), P("2. Jones, K. 2003 A second title. J. Test 5, 6.")] };
        const r = L.wvRefList(s);
        assert.equal(r.how, "detected");
        assert.deepEqual(r.entries.map((e) => e.text), ["1. Smith, J. 2001 A first title. J. Test Mech. 12, 34.", "2. Jones, K. 2003 A second title. J. Test 5, 6."]);
        assert.equal(r.entries[0].rects.length, 2, "the joined line's box too");
        // The title may be a paragraph of its own; the list ends at the next heading.
        s = { content: [P("REFERENCES"), LIST("[1] Smith, J. A first title (2001).", "[2] Jones, K. A second title (2003)."), H("Appendix A"), P("[3] Not a reference: after the appendix's heading.")] };
        assert.equal(L.wvRefList(s).entries.length, 2);
        for (const t of ["References", "7 References", "VII. REFERENCES", "References:", "Références", "Literaturverzeichnis", "Bibliography"]) assert.isTrue(L.wvRefListIsTitle(t), t);
        for (const t of ["Reference frames in rotating flows", "Methods", ""]) assert.isFalse(L.wvRefListIsTitle(t), t);
        const lab = (t) => { const l = L.wvRefListLabel(t); return l ? [l.n, l.kind, l.label, l.rest] : null; };
        assert.deepEqual(lab("[12] A. B."), [12, "bracket", "[12]", "A. B."]);
        assert.deepEqual(lab("12. Smith"), [12, "dot", "12.", "Smith"]);
        assert.deepEqual(lab("(3) Smith"), [3, "paren", "(3)", "Smith"]);
        assert.isNull(L.wvRefListLabel("1.5 mm thick films"));
        // 1.2.1-refs.7: the space lost ("3.Rayleigh", MDPI; "1.Quéré", Nature Physics) and AIP's
        // superscript glued to the first initial or word.
        assert.deepEqual(lab("3.Rayleigh, L. On the capillary"), [3, "dot", "3.", "Rayleigh, L. On the capillary"]);
        assert.deepEqual(lab("6V. Bertola and M. Marengo"), [6, "glued", "6", "V. Bertola and M. Marengo"]);
        assert.deepEqual(lab("14Fundamentals of Inkjet Printing"), [14, "glued", "14", "Fundamentals of Inkjet Printing"]);
        for (const t of ["■ REFERENCES", "▪ References"]) assert.isTrue(L.wvRefListIsTitle(t), t);
    });

    // MJT 2026-11-19, his default profile on refs.6: Zhu, Kherbeche, Feng & Thoraval 2020 (Phys.
    // Fluids 32, 041705, CC BY 4.0), as Zotero 11.0-beta.4's structure data has it -- page 1's
    // "Cite as:" and "Submitted:" lines flagged as references, entries 1-5 a list of their own
    // under the REFERENCES heading, NOT flagged, entries 6-55 flagged on the next page; every
    // number AIP's superscript glued to the first initial. Kept here: 1-7 of the list.
    const AIPP = (t, ref, page) => ({ type: "paragraph", reference: ref || undefined, anchor: { pageRects: [[page || 0, 50, 700, 400, 710]] }, content: [{ text: t }] });
    const AIPL = (page, ref, ...ts) => ({ type: "list", content: ts.map((t, i) => ({ type: "listitem", reference: ref || undefined, anchor: { pageRects: [[page, 50, 600 - 12 * i, 400, 610 - 12 * i]] }, content: [{ text: t }] })) });
    const ZHU = (frontFlagged, restFlagged) => ({ content: [
        { type: "heading", content: [{ text: "Impact of an air-in-liquid compound drop onto a liquid surface" }] },
        AIPP("Cite as: Phys. Fluids 32, 041705 (2020);doi: 10.1063/5.0005702", frontFlagged),
        AIPP("Submitted: 24 February 2020 • Accepted: 3 April 2020 •", frontFlagged),
        AIPP("Published Online: 29 April 2020"),
        AIPP("The impact of a drop on a solid or liquid surface is important for a large range of applications."),
        { type: "heading", content: [{ text: "REFERENCES" }] },
        AIPL(5, false,
            "1S. T. Thoroddsen, T. G. Etoh, and K. Takehara, “High-speed imaging of drops and bubbles,”Annu. Rev. Fluid Mech. 40, 257 (2008).",
            "2C. Josserand and S. T. Thoroddsen, “Drop impact on a solid surface,”Annu. Rev. Fluid Mech. 48, 365 (2016).",
            "3A. L. Yarin, “Drop impact dynamics: Splashing, spreading, receding, bouncing. . .,”Annu. Rev. Fluid Mech. 38, 159 (2006).",
            "4G. Liang and I. Mudawar, “Review of mass and momentum interactions during drop impact on a liquid film,”Int. J. Heat Mass Transfer 101, 577 (2016).",
            "5A. L. Yarin, I. V. Roisman, and C. Tropea, Collision Phenomena in Liquids and Solids (Cambridge University Press, Cambridge, 2017)."),
        { type: "paragraph", flowClass: "excluded", content: [{ text: "Phys. Fluids 32, 041705 (2020); doi: 10.1063/5.0005702 32, 041705-6" }] },
        AIPL(6, restFlagged,
            "6V. Bertola and M. Marengo, “Single drop impacts of complex fluids: A review,” in Drops and Bubbles in Contact with Solid Surfaces (CRC Press, 2013), p. 267.",
            "7B. Prunet-Foch, F. Legay, M. Vignes-Adler, and C. Delmotte, “Impacting emulsion drop on a steel plate: Influence of the solid substrate,” J. Colloid Interface Sci. 199, 151 (1998).",
            "8V. Bergeron, D. Bonn, J. Y. Martin, and L. Vovelle, “Controlling droplet deposition with polymer additives,”Nature 405, 772 (2000).",
            "9E. J. Vega and A. A. Castrejón-Pita, “Suppressing prompt splash with polymer additives,”Exp. Fluids 58, 57 (2017).",
            "10J. M. López-Herrera, S. Popinet, and A. A. Castrejón-Pita, “An adaptive solver for viscoelastic incompressible two-phase problems applied to the study of the splashing of weakly viscoelastic droplets,”J. Non-Newtonian Fluid Mech. 264, 144 (2019)."),
    ] });

    it("1.2.1-refs.7: front-matter lines are never entries; a list Zotero flagged in part is read whole; AIP's glued numbers are labels, written with a space (Zhu et al. 2020)", function () {
        refListFns();
        const r = L.wvRefList(ZHU(true, true));
        assert.equal(r.how, "flagged");
        assert.deepEqual(r.entries.map((e) => e.label), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], "1-5 Zotero did not flag, 6-10 it did; no front matter: " + JSON.stringify(r.entries.map((e) => e.text.slice(0, 20))));
        assert.match(r.entries[0].text, /^1 S\. T\. Thoroddsen, /, "the label, one space, the text");
        assert.match(r.entries[5].text, /^6 V\. Bertola and M\. Marengo/);
        assert.deepEqual(r.entries[5].rects, [[6, 50, 600, 400, 610]], "each entry keeps its own box");
        for (const t of ["Cite as: Phys. Fluids 32, 041705 (2020)", "Submitted: 24 February 2020 • Accepted: 3 April 2020", "Received 3 March 2020; accepted 5 June 2020", "Published Online: 29 April 2020", "© 2020 Author(s)."]) {
            assert.isTrue(L.wvRefListIsFrontMatter(t), t);
        }
        assert.isFalse(L.wvRefListIsFrontMatter("S. T. Thoroddsen, T. G. Etoh, and K. Takehara, High-speed imaging"));
    });

    it("1.2.1-refs.7: only front matter flagged -- Weavero reads the list itself (Wei & Thoraval 2021)", function () {
        refListFns();
        // Wei & Thoraval 2021 (Phys. Fluids 33, 061703): Zotero flagged its two front-matter lines alone.
        const r = L.wvRefList(ZHU(true, false));
        assert.equal(r.how, "detected", "the numbered list under REFERENCES");
        assert.equal(r.entries.length, 10);
        assert.equal(r.entries[9].label, "10");
        // AIP before 2019: no heading at all, glued numbers 1, 2, 3, ... with years (Castrejón-Pita 2015).
        const s = ZHU(false, false);
        s.content.splice(5, 1);
        assert.equal(L.wvRefList(s).entries.length, 10, "no heading: a glued run of five or more, with years");
    });

    it("1.2.1-refs.7: unflagged entries between flagged ones are read when they look like references; annotations are not (COCIS 2021)", function () {
        refListFns();
        // Blanken et al. 2021, Curr. Opin. Colloid Interface Sci.: annotated entries ("* . Zhang JM, ...",
        // then a paragraph about the paper) left unflagged between flagged ones (MJT's paper 02).
        const LI = (t, ref, extra) => Object.assign({ type: "listitem", reference: ref || undefined, anchor: { pageRects: [[15, 50, 600, 400, 610]] }, content: [{ text: t }] }, extra || {});
        const s = { content: [
            { type: "heading", content: [{ text: "References" }] },
            { type: "list", content: [
                LI("13. de Gennes P-G, Brochard-Wyart F, Quéré D: Capillarity and wetting phenomena. Springer; 2004.", true),
                LI("14 *", true, { nextPart: [1, 2] }),
                LI(". Blanken N, Saleem MS, Antonini C, Thoraval M-J: Rebound of self-lubricating compound drops. Sci Adv 2020, 6, eaay3499, https://doi.org/10.1126/sciadv.aay3499.", true, { previousPart: [1, 1] }),
            ] },
            { type: "list", content: [
                LI("By studying water-in-oil compound drops, the authors demonstrate a self-lubrication mechanism, which leads to a rebound."),
                LI("*", false, { nextPart: [2, 2] }),
                LI(". Zhang JM, Li EQ, Thoroddsen ST: Fine radial jetting during the impact of compound drops. J Fluid Mech 2020, 883:A46, https://doi.org/10.1017/jfm.2019.895.", false, { previousPart: [2, 1] }),
                LI("The authors study the impact of a liquid-in-liquid compound drop onto a solid surface."),
            ] },
            { type: "list", content: [
                LI("18. Visser CW, Kamperman T, Karbaat LP, Lohse D, Karperien M: In-air microfluidics enables rapid fabrication of emulsions. Sci Adv 2018, 4, eaao1175.", true),
            ] },
        ] };
        const r = L.wvRefList(s);
        const texts = r.entries.map((e) => e.text);
        assert.equal(texts.length, 4, JSON.stringify(texts.map((t) => t.slice(0, 30))));
        assert.match(texts[2], /^Zhang JM, Li EQ, Thoroddsen ST: Fine radial jetting/, "the unflagged entry, its stray marks off");
        assert.notOk(texts.some((t) => /By studying|The authors study/.test(t)), "no annotation");
        assert.match(texts[1], /^14 \* \. Blanken/, "Zotero's own split entry joined as before");
    });

    it("1.2.1-refs.7: a flagged block before the first references heading is not an entry", function () {
        refListFns();
        const s = { content: [
            AIPP("Collisional ice fragmentation was also studied by Hobbs and Farber (1972), Vardiman (1978), and Phillips et al. (2018).", true),
            { type: "heading", content: [{ text: "References" }] },
            AIPP("Hobbs, P. V. and Farber, R. J.: Fragmentation of ice particles in clouds, J. Rech. Atmos., 6, 245-258, 1972.", true),
            AIPP("Vardiman, L.: The generation of secondary ice particles in clouds, J. Atmos. Sci., 35, 2168-2180, 1978.", true),
        ] };
        assert.deepEqual(L.wvRefList(s).entries.map((e) => e.text.slice(0, 6)), ["Hobbs,", "Vardim"]);
    });

    it("1.2.1-refs.8 F9: a paragraph of prose Zotero flags is not an entry; APS's \"(Received ...)\" and \"This paper is associated with ...\" are front matter (Durey et al. 2018)", function () {
        refListFns();
        const PP = (t, ref) => ({ type: "paragraph", reference: ref || undefined, anchor: { pageRects: [[3, 50, 600, 400, 610]] }, content: [{ text: t }] });
        // An old JFM scan: two paragraphs of the text flagged among the references (Coutanceau & Bouard 1977, the survey).
        const prose = "Smith et al. (1964) and Jones et al. (1968) it can be seen that, within the accuracy of the measurements, the slope is the same for the three values of the parameter, and we can deduce that the length of the wake grows linearly with the Reynolds number.";
        const rayleigh = "Rayleigh, Lord (1916a). On convection currents in a horizontal layer of fluid, when the higher temperature is on the under side. Phil. Mag. (6) 32, 529-46. Also Scientific papers (1920), vol. VI, pp. 432-46.";
        let s = { content: [{ type: "heading", content: [{ text: "References" }] }, PP("Acrivos, A. & Leal, L. G. 1968 Further experiments on steady separated flows. J. Fluid Mech. 34, 25.", true), PP(prose, true), PP(rayleigh, true)] };
        assert.deepEqual(L.wvRefList(s).entries.map((e) => e.text.slice(0, 9)), ["Acrivos, ", "Rayleigh,"], "the prose out; a reference with two dated names kept");
        // Durey et al. 2018 (Phys. Rev. Fluids 3, 100501): only these two lines flagged; the seven [n] entries not.
        for (const t of ["(Received 2 February 2018; published 17 October 2018)", "This paper is associated with a video winner of a 2017 APS/DFD Milton van Dyke Award for work presented at the DFD Gallery of Fluid Motion."]) {
            assert.isTrue(L.wvRefListIsFrontMatter(t), t);
        }
        assert.isFalse(L.wvRefListIsFrontMatter("[3] This paper was written by A. Author, J. Test 1, 2 (2001)."));
        const aps = (n) => PP("[" + n + "] A. Author" + n + ", Some title number " + n + ", Phys. Rev. Fluids " + n + ", 0" + n + "1 (20" + (10 + n) + ").");
        s = { content: [PP("(Received 2 February 2018; published 17 October 2018)", true), PP("This paper is associated with a video winner of a 2017 APS/DFD Milton van Dyke Award for work presented at the DFD Gallery of Fluid Motion.", true),
            PP("The body of the paper."), ...[1, 2, 3, 4, 5, 6, 7].map(aps)] };
        const r = L.wvRefList(s);
        assert.equal(r.how, "detected", "nothing flagged is left: Weavero reads the list itself");
        assert.deepEqual(r.entries.map((e) => e.label), ["[1]", "[2]", "[3]", "[4]", "[5]", "[6]", "[7]"]);
    });

    it("1.2.1-refs.8 F5: a list printed before the paper's own title is another article's (old Nature letters, a Science report)", function () {
        refListFns();
        const PG = (page, t, ref, type) => ({ type: type || "paragraph", reference: ref || undefined, anchor: { pageRects: [[page, 50, 600, 400, 610]] }, content: [{ text: t }] });
        const nat = (page, n, ref) => PG(page, n + ". Author" + n + ", A. A title of work " + n + ". Nature " + (300 + n) + ", " + (10 * n) + "±" + (10 * n + 5) + " (19" + (90 + n) + ").", ref);
        // Aussillous & Quéré 2001 (Nature 411, 924): page 1 starts with the letter printed before it, whose list
        // Zotero flags; this letter's own list, on its last page, it does not.
        const s = { content: [
            PG(0, "ences in the end of the previous letter's text."),
            PG(0, "Received 8 January; accepted 3 April 2001.", false, "heading"),
            ...[1, 2, 3, 4, 5, 6].map((n) => nat(0, n, true)),
            PG(0, "Acknowledgements", false, "heading"),
            PG(0, "................................................................. Liquid marbles"),
            PG(0, "Pascale Aussillous & David Quéré"),
            PG(1, "The body of the letter."),
            PG(3, "Received 19 February; accepted 5 April 2000.", false, "heading"),
            ...[1, 2, 3, 4, 5].map((n) => nat(3, n)),
        ] };
        const title = "Liquid marbles";
        let r = L.wvRefList(JSON.parse(JSON.stringify(s)), { title });
        assert.equal(r.how, "detected", "the other letter's flagged list is out: this one's is read");
        assert.deepEqual(r.entries.map((e) => e.rects[0][0]), [3, 3, 3, 3, 3], "its own five entries, on its last page");
        r = L.wvRefList(JSON.parse(JSON.stringify(s)));
        assert.equal(r.entries.length, 6, "without the title: Zotero's flags, as before");
        // An ACS letter prints its own notes at the foot of page 1, under the title: they stay.
        const acs = { content: [PG(0, "Penetration of Living Cell Membranes with Fortified Carbon Nanotube Tips", false, "heading"), PG(0, "The body of the letter."),
            ...[1, 2, 3, 4, 5].map((n) => PG(0, "(" + n + ") Author" + n + ", A. J. Test " + n + ", " + n + "1 (200" + n + ").", true))] };
        assert.equal(L.wvRefList(acs, { title: "Penetration of living cell membranes with fortified carbon nanotube tips" }).entries.length, 5);
    });

    it("1.2.1-refs.8 F2: a numbered list's missing numbers are looked for -- side-note blocks, page-foot notes, merged entries, a block taken for page furniture", function () {
        refListFns();
        const B = (type, page, t, extra) => Object.assign({ type, anchor: { pageRects: [[page, 50, 600, 400, 610]] }, content: [{ text: t }] }, extra || {});
        const glued = (n) => n + "A. Author" + n + ", “Title number " + n + ",” Phys. Fluids " + n + ", 0" + n + "1 (20" + (10 + n) + ").";
        const labels = (s, o) => L.wvRefList(JSON.parse(JSON.stringify(s)), o).entries.map((e) => e.label);
        // Phys. Fluids 2011: references 1-5 in a list Zotero classed as a side note (`auxiliary`), 6-9 flagged.
        let s = { content: [B("paragraph", 11, "The body."), { type: "list", flowClass: "auxiliary", content: [1, 2, 3, 4, 5].map((n) => B("listitem", 12, glued(n))) },
            { type: "list", content: [6, 7, 8, 9].map((n) => B("listitem", 12, glued(n), { reference: true })) }] };
        assert.deepEqual(labels(s), ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
        // Phys. Rev. E 2023: [1] a side-note paragraph at a page foot, [2] a paragraph, then the flagged list.
        const aps = (n, extra) => B("listitem", 5, "[" + n + "] A. Author" + n + ", Some title " + n + ", Phys. Rev. E " + n + ", 0" + n + "1 (20" + (10 + n) + ").", extra);
        s = { content: [B("heading", 4, "APPENDIX B: CURVATURE"), B("paragraph", 4, "It can be shown that each pillar has a constant curvature."),
            B("paragraph", 4, "[1] S. Mora, T. Phou, and Y. Pomeau, Capillarity driven instability of a soft solid, Phys. Rev. Lett. 105, 214301 (2010).", { flowClass: "auxiliary" }),
            B("paragraph", 4, "[2] R. W. Style, A. Jagota, C.-Y. Hui, and E. R. Dufresne, Elastocapillarity, Annu. Rev. Condens. Matter Phys. 8, 99 (2017)."),
            B("paragraph", 4, "L043001-5", { flowClass: "excluded" }), { type: "list", content: [3, 4, 5, 6].map((n) => aps(n, { reference: true })) }] };
        assert.deepEqual(labels(s), ["[1]", "[2]", "[3]", "[4]", "[5]", "[6]"]);
        // J. Appl. Phys. 2016, no heading: a glued run in which "28online database ..." keeps its number.
        s = { content: [B("paragraph", 6, "The acknowledgments."), { type: "list", content: [24, 25, 26, 27].map((n) => B("listitem", 6, glued(n))) }] };
        s.content[1].content.unshift(...Array.from({ length: 23 }, (x, i) => B("listitem", 6, glued(i + 1))));
        s.content[1].content.push(B("listitem", 6, "28online database Engineering ToolBox at http://www.engineeringtoolbox.com (2015)."), B("listitem", 6, glued(29)), B("listitem", 6, glued(30)));
        const r = L.wvRefList(s);
        assert.equal(r.entries.length, 30, "a strict glued run with no step lost");
        assert.equal(r.entries[27].label, "28");
        // Langmuir 2007 (ACS): its notes at the foot of each page -- (1)-(5) on page 1, (6) a side note on page 3,
        // (7) and (8) on page 4, body text between them.
        const acs = (page, n, extra) => B("listitem", page, "(" + n + ") Author" + n + ", A. B.; Other, C. Langmuir 200" + n + ", " + (20 + n) + ", " + (100 * n) + "-" + (100 * n + 4) + ".", extra);
        s = { content: [B("heading", 0, "Penetration of Living Cell Membranes with Fortified Carbon Nanotube Tips"), B("paragraph", 0, "The body of the letter."),
            { type: "list", content: [1, 2, 3, 4, 5].map((n) => acs(0, n, { reference: true })) },
            B("paragraph", 1, "More of the body."), B("paragraph", 2, "Still more of the body."),
            Object.assign(acs(2, 6), { type: "paragraph", flowClass: "auxiliary" }),
            B("paragraph", 3, "The last words of the body."), { type: "list", content: [acs(3, 7), acs(3, 8)] }] };
        assert.deepEqual(labels(s, { title: "Penetration of living cell membranes with fortified carbon nanotube tips" }), ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)"]);
        // New J. Phys. 2024: Zotero merged [3] into [2]; [3] is cut off, with its own box from the text map.
        const run = (t, line) => ({ text: t, anchor: { textMap: JSON.stringify([[0, 13].concat(line, Array.from(t.replace(/\s+/g, ""), () => 2))]) } });
        const merged = { type: "listitem", reference: true, anchor: { pageRects: [[13, 50, 688, 400, 710]] }, content: [
            run("[2] Putterman S J and Weninger K R 2000 Sonoluminescence: how bubbles turn sound into light Annu. Rev. Fluid Mech. 32 445–76 ", [50, 700, 400, 710]),
            run("[3] Ronald Young F 2004 Sonoluminescence (CRC Press)", [60, 688, 300, 698])] };
        const njp = (n) => B("listitem", 13, "[" + n + "] Author" + n + " A " + (2000 + n) + " A title number " + n + " Phys. Rev. Lett. " + n + " " + (100 * n) + "–" + (100 * n + 4), { reference: true });
        s = { content: [{ type: "list", content: [njp(1), merged, njp(4), njp(5), njp(6)] }] };
        let es = L.wvRefList(s).entries;
        assert.deepEqual(es.map((e) => e.label), ["[1]", "[2]", "[3]", "[4]", "[5]", "[6]"]);
        assert.match(es[2].text, /^\[3\] Ronald Young F 2004 Sonoluminescence/);
        assert.deepEqual(es[2].rects[0], [13, 60, 688, 300, 698], "[3]'s mark goes beside [3], not on [2]'s line");
        assert.deepEqual(es[1].rects, [[13, 50, 688, 400, 710]], "[2] keeps the entry's box");
        // Phys. Fluids 2013: Zotero took entry 54 for page furniture (`excluded`); it sits between 53 and 55 (here 3 and 5).
        // A page number does not count.
        const pf = (n, extra) => B("paragraph", 25, n + " A. Author" + n + ", “Title " + n + ",” J. Fluid Mech. " + n + ", 1–18 (196" + n + ").", extra);
        s = { content: [pf(1, { reference: true }), pf(2, { reference: true }), pf(3, { reference: true }), B("paragraph", 25, "4", { flowClass: "excluded" }),
            pf(4, { flowClass: "excluded" }), pf(5, { reference: true }), pf(6, { reference: true })] };
        assert.deepEqual(labels(s), ["1", "2", "3", "4", "5", "6"]);
        // Not a far "1." above a list that starts at 2: it is more likely another list's.
        const nat = (n, ref) => B("listitem", 0, n + ". Author" + n + ", A. A title " + n + ". Nature " + (300 + n) + ", " + n + "0 (200" + n + ").", { reference: ref });
        s = { content: [nat(1), ...Array.from({ length: 14 }, (x, i) => B("paragraph", 0, "Body paragraph " + i + ".")), { type: "list", content: [2, 3, 4, 5, 6].map((n) => nat(n, true)) }] };
        assert.deepEqual(labels(s), ["2.", "3.", "4.", "5.", "6."]);
    });

    it("1.2.1-refs.8 F7: an author-year list under a references heading is read -- the part Zotero left unflagged, an old JFM scan's small capitals, OCR's column order", function () {
        refListFns();
        const LI = (page, t, ref) => ({ type: "listitem", reference: ref || undefined, anchor: { pageRects: [[page, 50, 600, 400, 610]] }, content: [{ text: t }] });
        const H = (t) => ({ type: "heading", content: [{ text: t }] });
        const rmp = (n) => ["Acrivos", "Bacri", "Bohr", "Chandrasekhar", "Eggers", "Fenn", "Forest", "Green", "Hinch", "Keller"][n] + ", A. B., and C. D. Other, 19" + (50 + n) + ", J. Fluid Mech. " + (10 + n) + ", " + (100 + n) + ".";
        // Rev. Mod. Phys. 1997: the first page of the list unflagged, the rest flagged.
        let s = { content: [{ type: "paragraph", content: [{ text: "The end of the review." }] }, H("REFERENCES"),
            { type: "list", content: [0, 1, 2, 3, 4].map((n) => LI(61, rmp(n))) },
            { type: "paragraph", flowClass: "excluded", content: [{ text: "Rev. Mod. Phys., Vol. 69, No. 3, July 1997" }] },
            { type: "list", content: [5, 6, 7, 8, 9].map((n) => LI(62, rmp(n), true)) }] };
        let r = L.wvRefList(s);
        assert.equal(r.how, "flagged");
        assert.deepEqual(r.entries.map((e) => e.text.split(",")[0]), ["Acrivos", "Bacri", "Bohr", "Chandrasekhar", "Eggers", "Fenn", "Forest", "Green", "Hinch", "Keller"]);
        // An old JFM scan, nothing flagged: small capitals, a line split off joins its entry.
        const jfm = [["CRAPPER,G. D. 1957 An exact solution for progressive capillary waves of arbitrary", "amplitude. J. Fluid Mech. 2, 532-540."],
            ["LONGUET-HIQGINMS., S. 1983 Bubbles, breaking waves and hyperbolic jets at a free", "surface. J. Fluid Mech. 127, 103-121."],
            ["NYSTUENJ,. A. 1986 Rainfall measurements using underwater ambient noise.", "J. Acoust. Soc. Am. 79, 972-982."],
            ["OQUZ,H. N. & PROSPERETTI, A. 1990 Bubble entrainment by the impact of drops on liquid", "surfaces. J. Fluid Mech. 219, 143-179."],
            ["PUMPHREY, H. C. & CRUM, L. A. 1988 Acoustic emissions associated with drop impacts.", "In Sea Surface Sound, pp. 463-483."]];
        s = { content: [H("8. Conclusions"), { type: "paragraph", content: [{ text: "We have shown that the conical profile is associated with the flow." }] }, H("REFERENCES"),
            { type: "list", content: [].concat(...jfm.map(([a, b]) => [LI(14, a), LI(14, b)])) }] };
        r = L.wvRefList(s);
        assert.equal(r.how, "detected");
        assert.deepEqual(r.entries.map((e) => e.text.slice(-12)), jfm.map(([a, b]) => b.slice(-12)), "each entry with its second line");
        assert.equal(r.entries[0].rects.length, 2);
        // OCR in column order: all the first lines, then all the second lines -- the first lines alone.
        s.content[3].content = jfm.map(([a]) => LI(14, a)).concat(jfm.map(([, b]) => LI(14, b)));
        r = L.wvRefList(s);
        assert.deepEqual(r.entries.map((e) => e.text), jfm.map(([a]) => a), "no second line joined to the wrong entry");
        // Without a references heading an author-year list is not read.
        s.content.splice(2, 1);
        assert.equal(L.wvRefList(s).how, "none");
    });

    it("1.2.1-refs.8 F8: an entry that lists several works under one number is one entry per work, each with the number", function () {
        refListFns();
        const run = (t, line) => ({ text: t, anchor: { textMap: JSON.stringify([[0, 3].concat(line, Array.from(t.replace(/\s+/g, ""), () => 2))]) } });
        const LI = (t, extra) => Object.assign({ type: "listitem", reference: true, anchor: { pageRects: [[3, 50, 600, 400, 620]] }, content: [{ text: t }] }, extra || {});
        const aps = (n) => LI("[" + n + "] A. Author" + n + ", Phys. Rev. E " + n + ", 0" + n + "1 (20" + (10 + n) + ").");
        // Phys. Rev. E 2013 (the survey): Swegle & Robinson's two papers under [9]; the second gets its own box.
        const swegle = { type: "listitem", reference: true, anchor: { pageRects: [[3, 50, 600, 400, 620]] }, content: [
            run("[9] J. W. Swegle and A. C. Robinson, J. Appl. Phys. 66, 2838 (1989); ", [50, 610, 400, 620]),
            run("A. C. Robinson and J. W. Swegle, ibid. 66, 2859 (1989).", [60, 600, 300, 610])] };
        let s = { content: [{ type: "list", content: [aps(7), aps(8), swegle, aps(10), aps(11)] }] };
        let es = L.wvRefList(s).entries;
        assert.deepEqual(es.map((e) => e.label), ["[7]", "[8]", "[9]", "[9]", "[10]", "[11]"]);
        assert.equal(es[2].text, "[9] J. W. Swegle and A. C. Robinson, J. Appl. Phys. 66, 2838 (1989)");
        assert.equal(es[3].text, "[9] A. C. Robinson and J. W. Swegle, ibid. 66, 2859 (1989).");
        assert.deepEqual(es[3].rects[0], [3, 60, 600, 300, 610], "the second work's mark goes beside it");
        // ACS writes its works (a), (b), ... and separates one work's authors with "; ".
        const acs = (n) => LI("(" + n + ") Author" + n + ", A. B.; Other, C. D. J. Test " + (2000 + n) + ", " + n + ", " + (10 * n) + ".");
        s = { content: [{ type: "list", content: [acs(1), LI("(2) (a) Flint, E. B.; Suslick, K. S. Science 1991, 253, 1397–1399. (b) McNamara, W. B., III; Didenko, Y.; Suslick, K. S. Nature 1999, 401, 772–775."), acs(3), acs(4), acs(5)] }] };
        es = L.wvRefList(s).entries;
        assert.deepEqual(es.map((e) => e.text.slice(0, 22)), ["(1) Author1, A. B.; Ot", "(2) (a) Flint, E. B.; ", "(2) (b) McNamara, W. B", "(3) Author3, A. B.; Ot", "(4) Author4, A. B.; Ot", "(5) Author5, A. B.; Ot"]);
        // One entry still: one author's two papers, a journal after the semicolon, one ACS work.
        for (const t of ["[9] D. B. Bogy, Phys. Fluids 22, 224 (1979); 23, 421 (1980).", "[9] T. H. Virtanen and E. V. Thuneberg, AIP Conf. Proc. 850, 113 (2006); J. Phys. Conf. Ser. 150, 032115 (2009)."]) {
            s = { content: [{ type: "list", content: [aps(7), aps(8), LI(t), aps(10), aps(11)] }] };
            assert.equal(L.wvRefList(s).entries.length, 5, t);
        }
    });

    it("1.2.1-refsacc.1: lists -- labels OCR misread under a heading, one number merged away, one entry under a heading, figure captions after the list, \"the same authors\" written in", function () {
        refListFns();
        const B = (type, page, t, extra) => Object.assign({ type, anchor: { pageRects: [[page, 50, 600, 400, 610]] }, content: [{ text: t }] }, extra || {});
        const H = (t) => ({ type: "heading", content: [{ text: t }] });
        const read = (s) => L.wvRefList(JSON.parse(JSON.stringify(s)));
        // J. Res. NBS 1947 (the r4 old papers): "[11" and "[21" for [1] and [2], "[71" for [7].
        const nbs = (n) => B("listitem", 41, (n === 1 || n === 2 || n === 7 ? "[" + n + "1" : "[" + n + "]") + " H. Author" + n + ", A title " + n + ", Z. a. Math. Mech. " + n + ", " + (100 + n) + " (193" + n + ").");
        let r = read({ content: [B("paragraph", 39, "The body of the paper."), H("X. References"), { type: "list", content: [1, 2, 3, 4, 5, 6, 7, 8].map(nbs) }] });
        assert.deepEqual(r.entries.map((e) => e.label), ["[1]", "[2]", "[3]", "[4]", "[5]", "[6]", "[7]", "[8]"]);
        assert.match(r.entries[0].text, /^\[1\] H\. Author1, A title 1/, "the label written as it is");
        // Rep. Prog. Phys. 1937: "(I)", "(IO)", "(I I )".
        const rpp = (lab, n) => B("listitem", 12, lab + " AUTHOR" + n + ", A. J. Test " + n + ", " + (10 + n) + " (193" + (n % 10) + ").");
        r = read({ content: [H("REFERENCES"), { type: "list", content: [rpp("(I)", 1), ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => rpp("(" + n + ")", n)), rpp("(IO)", 10), rpp("(I I )", 11), rpp("(12)", 12)] }] });
        assert.deepEqual(r.entries.map((e) => e.label), ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)", "(9)", "(10)", "(11)", "(12)"]);
        // Without a heading, OCR'd labels are not guessed at.
        r = read({ content: [{ type: "list", content: [1, 2, 3, 4, 5, 6, 7, 8].map(nbs) }] });
        assert.notInclude(r.entries.map((e) => e.label), "[1]");
        // Phys. Fluids 2012, no heading: bare numbers, 9 merged into 8 -- one step in ten may be skipped.
        const pf = (n) => B("listitem", 16, n + " A. Author" + n + ", “Title " + n + ",” Phys. Fluids " + n + ", 0" + n + "1 (20" + (10 + n) + ").");
        const list = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16].map(pf);
        r = read({ content: [B("paragraph", 15, "The appendix."), { type: "list", content: list }] });
        assert.equal(r.entries.length, 15);
        r = read({ content: [B("paragraph", 15, "The appendix."), { type: "list", content: [1, 2, 3, 5, 6, 8, 9].map(pf) }] });
        assert.equal(r.entries.length, 0, "two skips in six steps: not a list");
        // APS Physics: one reference under its heading.
        r = read({ content: [B("paragraph", 0, "The viewpoint."), H("REFERENCES"), B("paragraph", 0, "1. J. McCraney et al., “Oscillations of drops with mobile contact lines on the International Space Station,” J. Fluid Mech. 935, A22 (2022).")] });
        assert.equal(r.entries.length, 1);
        // arXiv 1994: an author-year list, then "Figure Captions:" numbered 1., 2. -- the list, not the captions.
        const ay = ["Ahrens, B., Stix, M., & Thorn, M. 1992, A&A, 264, 673", "Anders, E., & Grevesse, N. 1989, Geochim. Cosmochim. Acta, 53, 197",
            "Bahcall, J. N. 1989, Neutrino Astrophysics (Cambridge: Cambridge Univ. Press)", "Iglesias, C. A., & Rogers, F. J. 1991a, ApJ, 371, 408", ". 1991b, ApJ, 371, L73",
            "Iben, I. 1965, ApJ, 141, 993"];
        r = read({ content: [H("References"), { type: "list", content: ay.map((t) => B("listitem", 23, t)) }, B("paragraph", 25, "Figure Captions:"),
            B("paragraph", 25, "1. The logarithm of the radiative opacity vs. the solar radius, for Model 2."), B("paragraph", 25, "2. Profiles of the temperature vs. the solar radius.")] });
        assert.equal(r.how, "detected");
        assert.deepEqual(r.entries.map((e) => e.text.slice(0, 24)), ["Ahrens, B., Stix, M., & ", "Anders, E., & Grevesse, ", "Bahcall, J. N. 1989, Neu", "Iglesias, C. A., & Roger", "Iglesias, C. A., & Roger", "Iben, I. 1965, ApJ, 141,"]);
        assert.match(r.entries[4].text, /^Iglesias, C\. A\., & Rogers, F\. J\. 1991b, ApJ, 371, L73/, "the same authors, another year");
        // AMS 1995: "2. , Differentiation ..." -- the rule of "the same authors" lost from the text.
        const ams = ["1. A. Carbery, A version of Cotlar's lemma for Lp spaces and some applications, Contemp. Math. 189 (1995), 117–134.",
            "2. , Differentiation in lacunary directions and an extension of the Marcinkiewicz multiplier theorem, Ann. Inst. Fourier 38 (1988), 157–168.",
            "3. M. Christ, Hilbert transforms along curves, Ann. of Math. 122 (1985), 575–596.", "4. ———, Weak type (1,1) bounds for rough operators, Ann. of Math. 128 (1988), 19–42.",
            "5. R. Fefferman, Some recent developments in Fourier analysis, Bull. AMS 21 (1989), 1–20."];
        r = read({ content: [H("References"), { type: "list", content: ams.map((t) => B("listitem", 27, t)) }] });
        assert.equal(r.entries[1].text, "2. A. Carbery, Differentiation in lacunary directions and an extension of the Marcinkiewicz multiplier theorem, Ann. Inst. Fourier 38 (1988), 157–168.");
        assert.match(r.entries[3].text, /^4\. M\. Christ, Weak type/);
        // Antiquity 2023: "– 2000." after Cauvin's 1994 entry; "C" + a combining cedilla starts "ÇELIK".
        const ant = { content: [H("References"), { type: "list", content: [
            B("listitem", 16, "BOWLES, S. & J.-K. CHOI. 2019. The Neolithic agricultural revolution and the origins of private property. Journal of Political Economy 127: 2186–228."),
            B("listitem", 16, "CAUVIN, J. 1994. Naissance des Divinités, Naissance de l’Agriculture. Paris: CNRS.")] },
            B("paragraph", 16, "– 2000. The birth of the gods and the origins of agriculture. Cambridge: Cambridge University Press."),
            { type: "list", content: [B("listitem", 16, "ÇELIK, B. 2011. Karahan Tepe: a new cultural centre in the Urfa Area in Turkey. Documenta Praehistorica 38: 241–54."),
                B("listitem", 16, "CHILDE, V.-G. 1928. The most ancient East. London: Kegan Paul."), B("listitem", 16, "CLARE, L. et al. 2019. Ritual practices and conflict mitigation. Cambridge University Press.")] }] };
        r = read(ant);
        assert.deepEqual(r.entries.map((e) => e.text.slice(0, 16)), ["BOWLES, S. & J.-", "CAUVIN, J. 1994.", "CAUVIN, J. 2000.", "ÇELIK, B. 2011.", "CHILDE, V.-G. 19", "CLARE, L. et al."]);
    });

    it("1.2.1-refsacc.1: references printed as footnotes -- read where a paper has no list and no references heading, at the page foot, as references", function () {
        refListFns();
        const B = (type, page, t, extra) => Object.assign({ type, anchor: { pageRects: [[page, 50, 600, 400, 610]] }, content: [{ text: t }] }, extra || {});
        const P = (page, t, extra) => B("paragraph", page, t, extra);
        // An M.A. thesis of 1919 (the r4 old papers): typed footnotes 1.-15. at the foot of the pages.
        const thesis = [P(8, "The viscosity of a gas may be defined as that property whereby it resists the relative motion of its parts."),
            P(8, "1. Brillouin, Lecons sur la Viscosite des Liquides et des Gas, Vol. II, Book III."),
            P(10, "Newton formulated the general law of viscous resistance."), P(10, "2 Now at the University of Illinois."),
            P(10, "2. 0. E. Meyer, The Kinetic Theory of Gases, R. E. Baynes, Trans., p 174.", { flowClass: "excluded" }),
            P(12, "Substituting the value for the mean free path given by Clausius,"), P(12, "3 Loc. cit., p. 182."),
            P(12, "4 Maxwell, Proceedings of the Royal Society, Vol. XV, p 14, 1866."), P(12, "12", { flowClass: "excluded" }),
            P(14, "12. Sutherland, Phil. Mag. , Series 5, Vol.36, p 507."), P(14, "The constant C of Sutherland's formula was found to be 117."),
            P(16, "13. Holman, Phil. Mag., Series 5, Vol. XXI, p 199, 1886.")];
        let r = L.wvRefList(JSON.parse(JSON.stringify({ content: thesis })));
        assert.deepEqual(r.entries.map((e) => e.text.slice(0, 14)), ["1. Brillouin, ", "2. 0. E. Meyer", "4 Maxwell, Pro", "13. Holman, Ph"],
            "not a note without a reference, not a bare loc. cit., not a footnote with the text going on below it");
        const ix = indexOf([{ id: 1, title: "XXIX. On the effect of temperature on the viscosity of air and carbon dioxide", first: "Holman", date: "1886", volume: "21", pages: "199-222" }]);
        assert.equal(L.wvRefMatch(ix, r.entries[3].text).ids[0], 1, "the footnote's roman volume and page");
        // A paper with a references heading: its footnotes are not read.
        r = L.wvRefList(JSON.parse(JSON.stringify({ content: thesis.concat([{ type: "heading", content: [{ text: "References" }] }, P(20, "A closing remark.")]) })));
        assert.equal(r.entries.length, 0);
        // Fewer than three: nothing.
        r = L.wvRefList(JSON.parse(JSON.stringify({ content: thesis.slice(0, 5) })));
        assert.equal(r.entries.length, 0);
    });

    // Franz 1959 (J. Acoust. Soc. Am. 31, 1080; MJT's scan, 2026-11-27), as Zotero 11's structure data has it:
    // nothing flagged, no list, no heading -- the references are numbered footnotes at the foot of each column,
    // 16 on the first page, the OCR text layer printing most superscript numbers as letters or bullets ("t
    // A.M. Worthington", "aA. May", ",oM. Minnaert", "n j. H. McMillen"), two or three notes merged into one
    // list item. The issue's next paper starts on the PDF's last page, its own notes at the foot of its first
    // column. Its first three pages and the last one, every note as the structure data spells it, rectangles
    // as there (two columns, x 29-260 and 268-503); body paragraphs cut short. The ASA download stamp at
    // each page's foot is page furniture; on some pages it starts with its date ("18 Feb 2011 to ...").
    const FRANZ1959 = () => {
        const C1 = [29, 260], C2 = [268, 503];
        const B = (type, page, col, y, t) => ({ type, anchor: { pageRects: [[page, col[0], y, col[1], y + 10]] }, content: [{ text: t }] });
        const P = (page, col, y, t) => B("paragraph", page, col, y, t);
        const LI = (page, col, y, t) => B("listitem", page, col, y, t);
        const list = (...items) => ({ type: "list", content: items });
        const furniture = (page, t) => ({ type: "paragraph", flowClass: "excluded", anchor: { pageRects: [[page, -4, 6, 524, 14]] }, content: [{ text: t }] });
        const stamp = (page, lead) => furniture(page, lead + "18 Feb 2011 to 109.171.129.59. Redistribution subject to ASA license or copyright; see http://asadl.org/journals/doc/ASALIB-home/info");
        // The item with two notes: a run per line with its text map (a width of 2 per character), so that
        // the second note's box starts where it does on the page.
        const run = (t, line) => ({ text: t, anchor: { textMap: JSON.stringify([[0, 0].concat(line, Array.from(t.replace(/\s+/g, ""), () => 2))]) } });
        const merged = { type: "listitem", anchor: { pageRects: [[0, 36, 118, 260, 134]] }, content: [
            run("• E.G. RichardsonP,roc.Phys.Soc.(London)61, 352 (1948). ", [36, 126, 260, 134]),
            run("aA. May etaL, J. Appl.Phys.19, 1109(1948).", [36, 118, 260, 126])] };
        return { content: [
            furniture(0, "THE JOURNALOF THE ACOUSTICALSOCIETYOF AMERICA VOLUME31, NUMBER 8 AUGUST,1059"),
            B("heading", 0, [150, 375], 666, "Splashesas Sourcesof Soundin Liquids*"),
            P(0, [238, 278], 651, "G. J. F•x•z"),
            P(0, [218, 306], 631, "(ReceivedJuly 14, 1958)"),
            P(0, [75, 458], 529, "The mechanismosf soundproductionby the splashesmadeby the gas-to-liquiedntryof objectsare discusseTdh.esoun fdromthesplasihsconsideretodbeassociatewdithacousticmultipoleosfall orders."),
            B("heading", 0, [102, 164], 495, "I. INTRODUCTION"),
            P(0, C1, 323, "HE splasmhadebythegas-to-liqeuindtryofan objectradiatessoundbothintothegasandinto theliquid."),
            P(0, C1, 190, "Sinceabout 1920,generalobservationsof the sounds producedby singlesplashehsavebeenreportedby a numberof authors."),
            B("heading", 0, [38, 257], 179, "About 1933, MinnaerOø explainedthe generationof"),
            P(0, C1, 150, "* Researchundertakenas part of the FundamentalHydromechanicsResearchProgram(NS 715-102)."),
            list(LI(0, C1, 134, "t A.M. Worthington,A S•udyof Splashe(sLongman'sGreen, andCompanyI,nc., New York, 1908)."), merged,
                LI(0, C1, 103, "• V. Hobbse$aJ.,\"Obliqueentry of spheresinto water,\" Natl. Bur. StandardsRept. No. 2788,August16, 1954."),
                LI(0, C1, 95, "sA. Mallock,Proc.Roy.Soc.(London)A95,138(1919)."),
                LI(0, C1, 79, "• W. Bragg,Tit, Worldof Sound(G. Bell and Sons,Ltd., London, 1920)."),
                LI(0, C1, 71, "• A. T. Jones,Scienc5e2,295 (1920).")),
            list(LI(0, C1, 64, "8C. V. Ramanand A. Dey, Phil. Mag. 39, 145 (1920)."), LI(0, C1, 56, "* A. L. Narayan,Phil. Mag. 42, 773 (1921).")),
            P(0, C1, 48, ",oM. Minnaert,Phil Mag. 16, 235 (1933)."),
            P(0, C2, 447, "underwatersoundby bubbles,and suggeste tdhat the soundsof runningwaterareassociatedwith theseresonant bubbles."),
            P(0, C2, 314, "In the courseof theirstudyonfleshwoundsmadeby high-speedmissilesM, cMillenTMandHarvef aobtained someexcellentshadowgramosf the shockwaves."),
            P(0, C2, 140, "The underwatersoundfrom the impact of rain on a water surface has been observed in a number of instances•),•"),
            list(LI(0, C2, 119, "n j. H. McMillen, Phys.Rev. 68, 198 (1945).'"),
                LI(0, C2, 104, "n j. H. McMillen and E. N. Harvey, J. Appl. Phys. 17, 541 (1946)."),
                LI(0, C2, 96, "•aE. N. Harvey e•aL, War Med. 8, 91 (1945)."),
                LI(0, C2, 64, "•4E.G. Richardson,Proc. Phys.Soc. (London)68, 541 (1955). x•V. O. KnudseneSaL, \"Survey of underwatersound,\"Rept. No. 3, \"Ambient Noise\" Office of Scientific Research and Development,No. 4333, September26, 1944."),
                LI(0, C2, 49, "x•Helndsmann, Smith, and Ameson, J. Acoust. Soc. Am. 378 0955).")),
            furniture(0, "1080"), stamp(0, "ded "),
            // Page 1081: two notes at the foot of the first column (the second one without initials), one at the second's.
            furniture(1, "SPLASHES AS SOURCES OF SOUND 1081"),
            P(1, C1, 476, "Surfacedisturbance tstrealsoan important sourceof ambient noise in the sea."),
            P(1, C1, 89, "Air-borne sound radiated directly into the air may originatefrom the transientpassageof the object"),
            P(1, C1, 53, "•7R. J. Urick, \"Somedirectionalpropertiesof deepwater ambientnoise,\"U.S. Naval ResearchLaboratoryRept. No. 3796, January 16, 1951."),
            P(1, C1, 29, "• Folsom,Howe, and O'Brien, \"Notes on hydraulicnoise,\" Officeof ScientificResearchand DevelopmentRept. No. 949, Juae 11, 1942."),
            P(1, C2, 565, "throughthe freesurfacef,romvibrationsof the object, fromthespraythrownup fromthesplashf."),
            P(1, C2, 50, "Three of the orders of acoustic multipoles that may beexpectetdo be associatewdith splasheasre (1) the simplesource."),
            P(1, C2, 30, "•9M. Strasberg,J. Acoust.Soc.Am. 28, 20 (1956)."),
            stamp(1, "d "),
            // Page 1082: three notes in one item (a reference, a remark, a reference), one more below it.
            furniture(2, "1082 G.J. FRANZ"),
            P(2, C1, 100, "wherethe sourcestrengthsare functionsof retarded time t--r/c; 1⁄2is the velocityof soundin the fluid."),
            list(LI(2, C1, 52, "a•M. J. Lighthill, Proc. Roy. Soc.(London)211, 564 (1952). I The soundpressureof the dipolecomponenits alsorelatedto the more conventionallymeasuredvertical drag force F on the enteringbodyby theexpressiopn= (1/2•r)cosO[F/ra+(8F/Ot)/r•]. \"R. H. Randall, Art Irttroductgortto Actrustics (AddisonWesleyPress,Inc., Cambridge,1951),p. 107."),
                LI(2, C1, 36, "aaH. H. Skilling,Fundamentalosf ElectricWaves(JohnWiley & Sons,Inc., New York, 1942),p. 138.")),
            P(2, C2, 65, "When the underwatersoundradiated during the subsonicflow regimeof the flow establishmenpt haseis considered."),
            P(2, C2, 37, "a•P. Dergarabedian,\"Compressibilityeffectsduring water entry,\" IgAVORD Rept. 3523,June23, 1955."),
            stamp(2, ""),
            // Page 1083: three notes at the first column's foot (the first one's mark lost, the second's
            // name OCR'd past reading), two remarks at the second's -- and the download stamp typed as an
            // item of the remarks' list, below everything.
            furniture(3, "SPLASHES AS SOURCES OF SOUND 1083"),
            P(3, C1, 98, "Since the image systemin the pseudobodyof the sourcedistributionon fixesurfaceof the pseudobodiys notknownin general."),
            list(LI(3, C1, 60, "M. Schiffmanand D. Spencer, The forceof impact on a spherestrikinga watersurface,\"Officeof ScientificResearchand DevelopmentRept. 42.1R, February1945."),
                LI(3, C1, 45, "•6I-I. Y6ttinger,Jahrb.schiffbautechG.es.25,295(1924)(David Taylor Model Basintra•nslation48, p. 16)."),
                LI(3, C1, 29, "•?L. M. Milne-Thomson,TheoreticalHydrodynamics(The MacmillanCompany,New York, 1950),pp. 207,417.")),
            P(3, C2, 92, "In general,the shapeof the pseudobodcyhangesas the real body entersthe free surface."),
            P(3, C2, 59, "• In the caseof the verticalentryof a sphereof radiusa, for exampleA, = •r(2as-- s•."),
            list(LI(3, C2, 29, "õif no cavity is formed,the pseudobodyeventuallybecomes just two spheres."),
                { type: "listitem", anchor: { pageRects: [[3, -3, 6, 510, 14]] }, content: [{ text: "d 18 Feb 2011 to 109.171.129.59. Redistribution subject to ASA license or copyright; see http://asadl.org/journals/doc/ASALIB-home/inf" }] }),
            // The PDF's last page: Franz's last lines, then the next paper of the issue and its own notes.
            furniture(4, "1096 G.J. FRANZ"),
            P(4, C1, 572, "The underwater sound from large-scalesplashing, such as that due to breaking waves or rain, may be estimated."),
            P(4, [33, 500], 527, "TI-IE JOURNAL OF THE .kCOIJSIICIL SOCIETY OF AMERICA VOLUME 31, NUMBER 8 .%UGUST, 1959"),
            B("heading", 4, [139, 395], 500, "Steady-State Behavior of the Dynamic Absorber"),
            P(4, [239, 301], 485, "J. C. SNOW•)ON"),
            P(4, [74, 426], 465, "Acousticasnd$eirmicsLaboratory,The U•i'oersityof Mickigan,WilltooRun LaboratoriesA,nn Arbor, (ReceivedMarch 4, 1959)"),
            P(4, C1, 116, "The assumptionms adehere aboutthe behaviorof thedynamicstiffnesasnddampingpossessbeydrubberlike materials."),
            list(LI(4, C1, 69, "• J. OrmondroyadndJ.P. DenHartog,Trans.Am. Soc.Mech. Engrs.50, 9 (1928)."), LI(4, C1, 54, "• J.P. DenHartog,Me•ka•icd Vibratiorz(sMcGraw-HillBook Company,Inc., New York, 1934).")),
            list(LI(4, C1, 46, "aL. Collatz,Ing. Arch.10, 269 (1939)."), LI(4, C1, 38, "• J. C. SnowdonB, rit. J. Appl.Phys.9, 461 (1958).")),
            P(4, C2, 326, "ports the vibrating item is neglectedearly in the analysisT. hisisnecessarify expressiofnosr thedesign."),
            stamp(4, "ed "),
        ] };
    };
    const FRANZ_TITLE = "Splashes as sources of sound in liquids";

    it("2026-11-27: an old scan's footnotes after the paper's title -- marks OCR read as letters and bullets, 16 notes on the first page, notes merged into one item, each column's foot; not the next paper's notes (Franz 1959)", function () {
        refListFns();
        const r = L.wvRefList(FRANZ1959(), { title: FRANZ_TITLE });
        assert.equal(r.how, "detected", JSON.stringify(r.entries.map((e) => e.text.slice(0, 20))));
        assert.deepEqual(r.entries.map((e) => e.text.slice(0, 16)), [
            // Page 1080: 15 notes (the 16th lost its year to the OCR: "378 0955)").
            "A.M. Worthington", "E.G. RichardsonP", "A. May etaL, J. ", "V. Hobbse$aJ.,\"O", "A. Mallock,Proc.", "W. Bragg,Tit, Wo", "A. T. Jones,Scie",
            "8C. V. Ramanand ", "* A. L. Narayan,", "M. Minnaert,Phil", "j. H. McMillen, ", "j. H. McMillen a", "E. N. Harvey e•a", "E.G. Richardson,", "V. O. KnudseneSa",
            // Page 1081: the note without initials ("• Folsom, ...") is not read, nor does it end the one above it.
            "R. J. Urick, \"So", "M. Strasberg,J. ",
            // Page 1082: a reference, a remark and a reference in one item -- two entries; the remark stays with the first.
            "M. J. Lighthill,", "R. H. Randall, A", "H. H. Skilling,F", "P. Dergarabedian",
            // Page 1083 (franz.2): the download stamp below it, typed as a list item, does not end its column's foot.
            "L. M. Milne-Thom",
        ], "every note that reads as a reference, OCR's mark left out; real marks kept (\"8C.\", \"*\")");
        assert.deepEqual(r.entries.map((e) => e.rects[0][0]), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 3]);
        assert.deepEqual(r.entries[1].rects, [[0, 36, 118, 260, 134]], "the first note of the item keeps the item's box");
        assert.deepEqual(r.entries[2].rects, [[0, 38, 118, 260, 126]], "the second gets its own, from the text map, past OCR's \"a\"");
        assert.equal(r.entries[2].text, "A. May etaL, J. Appl.Phys.19, 1109(1948).");
        assert.equal(r.entries[14].text.slice(0, 40), "V. O. KnudseneSaL, \"Survey of underwater");
        assert.isFalse(r.entries.some((e) => /Ormondroy|Collatz|Snowdon|Folsom|Helndsmann|Redistribution/.test(e.text)), "not the next paper's notes, nor a note without a year or initials, nor the download stamp");
        // The mark off, the matcher reads the author first: ",oM. Minnaert" is Minnaert 1933.
        const ix = indexOf([{ id: 1, title: "On musical air-bubbles and the sounds of running water", first: "Minnaert", date: "1933", volume: "16", pages: "235-248" }]);
        assert.equal(L.wvRefMatch(ix, r.entries[9].text).ids[0], 1);
        // Without the paper's title (the title not found in the PDF): as before, none of this.
        assert.equal(L.wvRefList(FRANZ1959()).how, "none");
    });

    it("2026-11-27: OCR'd note marks only at a column's foot, after the title -- never another article's list, more than four on a later page, a word before initials, a note with the column's text going on below it", function () {
        refListFns();
        const C1 = [29, 260], C2 = [268, 503];
        const Q = (page, col, y, t, type) => ({ type: type || "paragraph", anchor: { pageRects: [[page, col[0], y, col[1], y + 10]] }, content: [{ text: t }] });
        // Three notes on two pages after the title: the base, read.
        const doc = (before, page1) => ({ content: [...before, Q(0, [150, 375], 666, "Splashesas Sourcesof Soundin Liquids*", "heading"),
            Q(0, C1, 300, "The body of the paper's first column."), Q(0, C1, 60, "t A.M. Worthington,A S•udyof Splashe(sLongman'sGreen, andCompanyI,nc., New York, 1908)."),
            Q(0, C2, 300, "The body of its second column."), Q(0, C2, 60, "sA. Mallock,Proc.Roy.Soc.(London)A95,138(1919)."),
            ...page1,
            Q(2, C1, 300, "The body of the third page."), Q(2, C1, 40, "•9M. Strasberg,J. Acoust.Soc.Am. 28, 20 (1956).")] });
        const heads = (s) => L.wvRefList(s, { title: FRANZ_TITLE }).entries.map((e) => e.text.slice(0, 12));
        const base = ["A.M. Worthin", "A. Mallock,P", "M. Strasberg"];
        assert.deepEqual(heads(doc([], [])), base);
        // Another article's list before the title on the first page (an old Nature or Science PDF): not read.
        const other = [1, 2, 3, 4, 5].map((n) => Q(0, C1, 700 - 10 * n, "• B. Other" + n + ", Nature " + (100 + n) + ", " + n + "1 (192" + n + ").", "listitem"));
        assert.deepEqual(heads(doc([{ type: "list", content: other }], [])), base, "a list before the title");
        // A later page with more than four: a list, not footnotes -- the cap stays off the first page only.
        const many = [1, 2, 3, 4, 5].map((n) => Q(1, C2, 100 - 12 * n, "• C. Author" + n + ", Phys. Rev. " + n + ", " + n + "1 (195" + n + ").", "listitem"));
        assert.deepEqual(heads(doc([], [Q(1, C2, 300, "The body of page two."), { type: "list", content: many }])), base, "five on a later page");
        // Body text at a column's foot that starts with a word before initials, or with no mark at all.
        const prose = [Q(1, C1, 300, "More of the body."), Q(1, C1, 40, "of G. I. Taylor (1950), Proc. Roy. Soc. A 201, 192, who showed that the drop flattens."),
            Q(1, C2, 300, "The second column goes on."), Q(1, C2, 60, "In 1933, M. Minnaert explained the sound of bubbles, Phil. Mag. 16, 235."),
            Q(1, C2, 40, "cf. A. Smith, Phys. Rev. 5, 12 (1950), and the drop spreads.")];
        assert.deepEqual(heads(doc([], prose)), base, "a word, not a mark");
        // A bare back-pointer is no reference: "l. c." as an Ann. IHP 1930 scan's OCR wrote it, and before a space (Lamb).
        assert.deepEqual(heads(doc([], [Q(1, C1, 300, "The body."), Q(1, C1, 40, "(9) Voir L c. 7) b) p. 56-66."), Q(1, C2, 40, "* Stokes, l.c. ante p. 123.")])), base, "back-pointers");
        // A note with its column's text going on below it is no footnote.
        const below = [Q(1, C1, 60, "•7R. J. Urick, \"Somedirectionalpropertiesof deepwater ambientnoise,\"U.S. Naval ResearchLaboratoryRept. No. 3796, January 16, 1951."),
            Q(1, C1, 40, "and the text of the first column goes on below it, as a paragraph does."), Q(1, C2, 300, "The second column.")];
        assert.deepEqual(heads(doc([], below)), base, "the column's text below it");
        assert.deepEqual(heads(doc([], below.slice(0, 1).concat(below.slice(2)))), ["A.M. Worthin", "A. Mallock,P", "R. J. Urick,", "M. Strasberg"], "and without that text, it is one");
        // An OCR'd note below it (initials, no year) does not end its foot; a remark after a note in its block is no note of its own.
        const urick = "•7R. J. Urick, Phys. Rev. 5, 12 (1951).";
        assert.deepEqual(heads(doc([], [Q(1, C1, 60, urick), Q(1, C1, 40, "t A. B. Smith, unpublished.")])), ["A.M. Worthin", "A. Mallock,P", "R. J. Urick,", "M. Strasberg"], "an OCR'd note below");
        const one = L.wvRefList(doc([], [Q(1, C1, 60, urick + " • J. H. McMillen kindly lent the shadowgraphs of Fig. 4.")]), { title: FRANZ_TITLE }).entries;
        assert.deepEqual(one.map((e) => e.text.slice(0, 12)), ["A.M. Worthin", "A. Mallock,P", "R. J. Urick,", "M. Strasberg"], "a remark is not cut off as an entry");
    });

    it("franz.2 (the 2026-11-27 review): a cover sheet and the paper's own dateline stop nothing; \"L. C.\" is an author's initials; a page over the cap keeps what the first rule reads; an ACS DOI line is no note", function () {
        refListFns();
        const C1 = [29, 260], C2 = [268, 503];
        const Q = (page, col, y, t, type) => ({ type: type || "paragraph", anchor: { pageRects: [[page, col[0], y, col[1], y + 10]] }, content: [{ text: t }] });
        const heads = (s, title) => L.wvRefList(JSON.parse(JSON.stringify(s)), title ? { title } : undefined).entries.map((e) => e.text.slice(0, 12));
        const title = "On the sound of a drop striking a liquid surface";
        const TITLE = "On the Sound of a Drop Striking a Liquid Surface";
        // A ResearchGate-style cover sheet prints the title on page 0; the paper prints "(Received ...)" under it on page 1.
        const paper = (shift) => [Q(shift, [100, 400], 660, TITLE, "heading"), Q(shift, [200, 300], 640, "By A. Author"), Q(shift, [200, 300], 630, "(Received 10 November 1949)"),
            Q(shift, C1, 300, "The body of the first page."), Q(shift, C1, 60, "* A. M. Worthington, A Study of Splashes (Longmans, London, 1908)."),
            Q(shift + 1, C1, 300, "The body of the second page."), Q(shift + 1, C1, 60, "† Lord Rayleigh, Proc. Roy. Soc. A 84, 247 (1910)."),
            Q(shift + 2, C1, 300, "The body of the third page."), Q(shift + 2, C1, 60, "‡ G. I. Taylor, Proc. Roy. Soc. A 186, 273 (1946).")];
        const three = ["* A. M. Wort", "† Lord Rayle", "‡ G. I. Tayl"];
        assert.deepEqual(heads({ content: paper(0) }, title), three, "no cover");
        const cover = [Q(0, [100, 400], 600, TITLE, "heading"), Q(0, [100, 400], 560, "See discussions, stats, and author profiles for this publication at: https://www.researchgate.net/publication/123"),
            Q(0, [100, 400], 520, "A. Author, University of Somewhere, 12 publications")];
        assert.deepEqual(heads({ content: cover.concat(paper(1)) }, title), three, "a cover sheet: the paper's own dateline is no other article's");
        // The paper's own received date at its end, before its last page's note: it stops nothing either.
        const end = { content: paper(0).slice(0, 7).concat([Q(1, C1, 90, "(Received 3 May 1950)")], paper(0).slice(7)) };
        assert.deepEqual(heads(end, title), three, "the paper's own dateline at its end");
        // Notes by an author with the initials L. C. are no "l. c." back-pointers -- with or without the title.
        const lc = { content: ["1 A. B. Smith, Phil. Mag. 39, 145 (1920).", "2 L. C. Burrill, Trans. Inst. Nav. Arch. 93, 1 (1951).", "3 L. C. Woods, Proc. Roy. Soc. A 229, 152 (1955).", "4 C. D. Jones, Phys. Rev. 68, 198 (1945)."]
            .flatMap((t, p) => [Q(p, C1, 300, "The body of page " + p + "."), Q(p, C1, 60, t)]) };
        assert.deepEqual(heads(lc), ["1 A. B. Smit", "2 L. C. Burr", "3 L. C. Wood", "4 C. D. Jone"]);
        // A later two-column page with three notes at one column's foot and two at the other's: over the cap, it keeps the
        // two the first rule reads (the second column's, nothing after them on the page), as before the column rule.
        const cap = { content: [Q(0, [100, 400], 660, TITLE, "heading"), Q(0, C1, 300, "The body."), Q(0, C1, 60, "1 A. M. Worthington, A Study of Splashes (Longmans, London, 1908)."),
            Q(0, C2, 300, "The second column."),
            Q(1, C1, 300, "The body of page two."), Q(1, C1, 80, "2 E. G. Richardson, Proc. Phys. Soc. 61, 352 (1948)."), Q(1, C1, 70, "3 A. May, J. Appl. Phys. 19, 1109 (1948)."),
            Q(1, C1, 60, "4 A. Mallock, Proc. Roy. Soc. A 95, 138 (1919)."), Q(1, C2, 300, "Its second column."), Q(1, C2, 70, "5 A. T. Jones, Science 52, 295 (1920)."),
            Q(1, C2, 60, "6 C. V. Raman and A. Dey, Phil. Mag. 39, 145 (1920)."),
            Q(2, C1, 300, "The body of page three."), Q(2, C1, 60, "7 M. Minnaert, Phil. Mag. 16, 235 (1933).")] };
        assert.includeMembers(heads(cap, title), ["5 A. T. Jone", "6 C. V. Rama", "7 M. Minnaer"], "base0's entries stay");
        // ACS's first-page line "10.1021/... CCC: $37.00 © 2007 American Chemical Society" (page furniture) is no note.
        const acs = { content: [Q(0, [100, 400], 660, TITLE, "heading"), Q(0, C1, 300, "The body."),
            ...[1, 2, 3, 4].map((n) => Q(0, C1, 100 - 10 * n, "(" + n + ") Author" + n + ", A. B. Langmuir 200" + n + ", " + (20 + n) + ", " + (100 * n) + ".", "listitem")),
            { type: "paragraph", flowClass: "excluded", anchor: { pageRects: [[0, 29, 20, 260, 28]] }, content: [{ text: "10.1021/la701878n CCC: $37.00 © 2007 American Chemical Society" }] },
            Q(1, C1, 300, "More of the body."), Q(1, C1, 60, "(17) Author17, C. D. Langmuir 2005, 21, 1700.")] };
        assert.isFalse(L.wvRefList(acs, { title }).entries.some((e) => /CCC|10\.1021/.test(e.text)), "the DOI line");
    });

    // MJT's 1966 Chemical Engineering Science scan (2026-11-21), as Zotero 11's structure data has it:
    // nothing flagged, no "REFERENCES" heading and no entry [1] in the publisher's OCR text layer,
    // entry [2] typed as a heading, [3]-[6] a list of four at the end, the French and German
    // summaries after it; "[S]" for [5], "I879" for 1879. Rebuilt here from those facts (titles of
    // [3]-[5] shortened); the library item is Rayleigh's 1879 paper.
    const CES1966 = () => {
        const B = (type, page, t, extra) => Object.assign({ type, anchor: { pageRects: [[page, 60, 600, 400, 610]] }, content: [{ text: t }] }, extra || {});
        return { content: [
            B("heading", 0, "Heat transfer to a cold surface from impinging drops"),
            B("paragraph", 0, "When a drop of liquid is placed on a surface at a temperature well above its boiling point it does not wet the surface."),
            ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => B("paragraph", Math.ceil(n / 3), "Paragraph " + n + " of the paper's body: the drops were released from a needle above the heated plate, and the plate's temperature was measured by thermocouples set below its surface; the heat taken by each drop was found from the fall of that temperature.")),
            B("paragraph", 5, "The heat flux to the surface falls when the temperature of the surface rises above the Leidenfrost point, as Fig. 6 shows."),
            B("paragraph", 6, "12", { flowClass: "excluded" }),
            B("heading", 6, "[2] MARQUENIEL., Znstrum. Pratt. 1962 16 45."),
            { type: "list", content: [
                B("listitem", 6, "[3] WACHTERSL. H. J., De warmteoverdracht van een hete wand naar druppels in de sferoidale toestand. Thesis, Delft, 1965."),
                B("listitem", 6, "[4] SA~IC P. and G. J. BOULT,The fluid flow associated with the impact of liquid drops. Nat. Res. Coun. Canada, Rep. MT-26, 1955."),
                B("listitem", 6, "[S] SAVICP., The cooling of a hot surface by drops boiling in the spheroidal state. Rep. MT-37, Ottawa, 1958."),
                B("listitem", 6, "[6] Lord RAYLEIGH,Proc.R. Sot. I879 29 71."),
            ] },
            B("paragraph", 6, "Résumé-On a étudié le transfert de chaleur entre une surface chaude et des gouttes qui la frappent."),
            B("paragraph", 6, "Zusammenfassung-Der Wärmeübergang zwischen einer heissen Wand und auftreffenden Tropfen wurde untersucht."),
        ] };
    };
    const RAYLEIGH1879 = { id: 1, title: "On the capillary phenomena of jets", first: "Rayleigh", date: "1879", volume: "29", pages: "71-97", DOI: "10.1098/rspl.1879.0015" };

    it("1.2.1-citd.1: an old scan's short numbered list at the document's end is read -- its first entry lost, the second typed as a heading (Chem. Eng. Sci. 1966)", function () {
        refListFns();
        const r = L.wvRefList(CES1966());
        assert.equal(r.how, "detected");
        assert.deepEqual(r.entries.map((e) => e.label), ["[2]", "[3]", "[4]", "[5]", "[6]"], JSON.stringify(r.entries.map((e) => e.text.slice(0, 16))));
        assert.match(r.entries[0].text, /^\[2\] MARQUENIEL\., Znstrum\. Pratt\. 1962/, "the entry typed as a heading");
        assert.match(r.entries[3].text, /^\[5\] SAVICP\., The cooling/, "[S] read as [5], written as the label it is");
        assert.deepEqual(r.entries[4].rects, [[6, 60, 600, 400, 610]]);
        // Not elsewhere: four [n] items in the body, text going on after them; nor items without years; nor a list from [5] on.
        const body = CES1966();
        body.content.push(...Array.from({ length: 12 }, (x, i) => ({ type: "paragraph", anchor: { pageRects: [[7, 60, 600, 400, 610]] }, content: [{ text: "The discussion goes on here with paragraph " + i + " of the paper, and its words are many more than a summary has, so many that they are a body of text and not a summary at the end of a paper." }] })));
        assert.equal(L.wvRefList(body).how, "none", "not at the document's end");
        const at = (s) => s.content.findIndex((b) => b.type === "list");
        const noYears = CES1966();
        noYears.content[at(noYears)].content.forEach((it) => { it.content[0].text = it.content[0].text.replace(/1\d\d\d|I879/g, "the next one"); });
        noYears.content[at(noYears) - 1].content[0].text = "[2] A step that names no year.";
        assert.equal(L.wvRefList(noYears).how, "none", "items without years");
        const late = CES1966();
        late.content.splice(at(late) - 1, 1);
        late.content[at(late)].content.splice(0, 2);
        assert.equal(L.wvRefList(late).how, "none", "two items from [5] on: not a list");
        const bare = CES1966();
        bare.content = bare.content.slice(at(bare) - 1);
        assert.equal(L.wvRefList(bare).how, "none", "a list alone, no document before it");
    });

    it("1.2.1-citd.1: OCR'd labels and years -- \"[S]\" for [5] inside a numbered run, \"I879\" for 1879", function () {
        refListFns();
        assert.includeMembers(L.wvRefYears("[6] Lord RAYLEIGH,Proc.R. Sot. I879 29 71."), ["1879"]);
        assert.includeMembers(L.wvRefYears("Ann. Phys. l905, 17, 549."), ["1905"]);
        assert.deepEqual(L.wvRefYears("Fig. IlOl, Table lOI, Report 1O4"), [], "letters alone, or three characters, are no year");
        // A run under a heading or not: [S] continues [4]; it never starts a run, and never stands for a far number.
        const B = (t) => ({ type: "listitem", anchor: { pageRects: [[3, 60, 600, 400, 610]] }, content: [{ text: t }] });
        const e = (lab, n) => B(lab + " A. Author" + n + ", Title number " + n + ", J. Test " + n + ", " + (10 * n) + " (19" + (50 + n) + ").");
        const r = L.wvRefList({ content: [{ type: "list", content: [e("[1]", 1), e("[2]", 2), e("[3]", 3), e("[4]", 4), e("[S]", 5), e("[6]", 6), e("[7]", 7)] }] });
        assert.deepEqual(r.entries.map((x) => x.label), ["[1]", "[2]", "[3]", "[4]", "[5]", "[6]", "[7]"]);
        const r2 = L.wvRefList({ content: [{ type: "list", content: [e("[1]", 1), e("[2]", 2), e("[S]", 3), ...[4, 5, 6, 7, 8, 9, 10].map((n) => e("[" + n + "]", n))] }] });
        assert.deepEqual(r2.entries.map((x) => x.label), ["[1]", "[2]", "[4]", "[5]", "[6]", "[7]", "[8]", "[9]", "[10]"], "an [S] where 3 is due is no label: its line joins [2]");
    });

    it("1.2.1-citd.1: volume and page after the year (\"Proc. R. Soc. 1879 29 71\")", function () {
        assert.includeMembers(L.wvRefVolPages("Lord RAYLEIGH, Proc. R. Soc. 1879 29 71."), ["29|71"]);
        assert.includeMembers(L.wvRefVolPages("MARQUENIE L., Instrum. Pract. 1962 16 45."), ["16|45"]);
        assert.notInclude(L.wvRefVolPages("Lord RAYLEIGH, Proc. R. Soc. 1879 29 71."), "1879|29", "the year is no volume");
        const ix = indexOf([RAYLEIGH1879, { id: 2, title: "A paper by someone else", first: "Rayleigh", date: "1879", volume: "28", pages: "71" }]);
        assert.equal(L.wvRefMatch(ix, "Lord RAYLEIGH, Proc. R. Soc. 1879 29 71.").ids[0], 1);
        assert.equal(L.wvRefMatch(ix, "[6] Lord RAYLEIGH,Proc.R. Sot. I879 29 71.").ids[0], 1, "the OCR'd year too");
        assert.isNull(L.wvRefMatch(ix, "Lord RAYLEIGH, Proc. R. Soc. 1885 29 71."), "another year");
    });

    // refsfix (2026-11-24): the same 1966 scan as Zotero 11's structure data REALLY has it (MJT:
    // "Why these references are not marked?"), read off the real pack: no [1], and [2] lost its
    // label too ("[2] DE JONG J.," OCR'd away) -- the heading reads "MARQUENIEL., Znstrum. Pratt. 1962
    // 16 45." -- and [4] prints no year ("..., rep. MT-26."). The blocks are the real ones, in their
    // order and with their types: the body, a caption and a table, the page number and the running
    // head (`excluded`), the label-less heading, the list of four, the two summaries, the page
    // number. Texts other than the references' short facts are written here.
    const CES1966REAL = () => {
        const B = (type, page, t, extra) => Object.assign({ type, anchor: { pageRects: [[page, 60, 600, 400, 610]] }, content: [{ text: t }] }, extra || {});
        return { content: [
            B("heading", 0, "Heat transfer to a cold surface from impinging drops"),
            ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => B("paragraph", Math.ceil(n / 2), "Paragraph " + n + " of the paper's body: the drops were released from a needle above the heated plate, and the plate's temperature was measured by thermocouples set below its surface; the heat taken by each drop was found from the fall of that temperature.")),
            B("paragraph", 8, "is likely."),
            B("caption", 8, "NOTATION"),
            B("table", 8, "Thermal diffusivity m2/sec Specific heat J/kg °C Vapour layer thickness m"),
            B("paragraph", 8, "1055", { flowClass: "excluded" }),
            B("paragraph", 9, "A. B. AUTHOR and C. D. WRITER", { flowClass: "excluded" }),
            B("heading", 9, "MARQUENIEL., Znstrum. Pratt. 1962 16 45."),
            { type: "list", content: [
                B("listitem", 9, "[3] WACHTERSL. H. J., De warmteoverdracht van een hete wand naar druppels in de sferoidale toestand. Doctoral thesis, Technische Hogeschool, Delft, 1965."),
                B("listitem", 9, "[4] SA~IC P. and G. J. BOULT,The fluid flow associated with the impact of liquid drops with solid surfaces,Nat. Res. Lab. Canada, rep. MT-26."),
                B("listitem", 9, "[S] SAVICP., The cooling of a hot surface by drops boiling in contact with it, Nat. Res. Lab. Canada, Rep. MT-37 1958."),
                B("listitem", 9, "[6] Lord RAYLEIGH,Proc.R. Sot. I879 29 71."),
            ] },
            B("paragraph", 9, "Résumé-On a étudié le transfert de chaleur entre une surface très chaude et une goutte qui la heurte et prend une forme sphéroïdale."),
            B("paragraph", 9, "Zusammenfassung-Es wurde der Wärmeübergang beim Auftreffen eines Tropfens auf eine sehr heisse Platte untersucht."),
            B("paragraph", 9, "1056", { flowClass: "excluded" }),
        ] };
    };

    it("refsfix: the 1966 scan's real blocks -- [2]'s label lost (a heading of a reference's shape), [4] without a year; [6] marked (Chem. Eng. Sci. 1966)", function () {
        refListFns();
        const r = L.wvRefList(CES1966REAL());
        assert.equal(r.how, "detected", "a list is read");
        assert.deepEqual(r.entries.map((e) => e.label), ["[2]", "[3]", "[4]", "[5]", "[6]"], JSON.stringify(r.entries.map((e) => e.text.slice(0, 16))));
        assert.equal(r.entries[0].text, "[2] MARQUENIEL., Znstrum. Pratt. 1962 16 45.", "the heading as the number before [3]");
        assert.match(r.entries[2].text, /^\[4\] SA~IC P\..*rep\. MT-26\.$/, "the report without a year kept");
        assert.deepEqual(r.entries[0].rects, [[9, 60, 600, 400, 610]], "its own box");
        const ix = indexOf([RAYLEIGH1879]);
        assert.deepEqual(r.entries.map((e) => { const m = L.wvRefMatch(ix, e.text); return m ? m.ids[0] : null; }), [null, null, null, null, 1], "[6] is Rayleigh's 1879 paper");
        const at = (s) => s.content.findIndex((b) => b.type === "list");
        // The heading joins only with a reference's shape, and only right before the first number.
        const titled = CES1966REAL();
        titled.content[at(titled) - 1].content[0].text = "Concluding remarks";
        assert.deepEqual(L.wvRefList(titled).entries.map((e) => e.label), ["[3]", "[4]", "[5]", "[6]"], "a heading of the paper's own: not an entry");
        const away = CES1966REAL();
        away.content.splice(at(away), 0, { type: "paragraph", anchor: { pageRects: [[9, 60, 600, 400, 610]] }, content: [{ text: "The lines above are a reference; this one is not." }] });
        assert.notInclude(L.wvRefList(away).entries.map((e) => e.label), "[2]", "a heading further up: not joined");
        // One entry without a year, and only one that names a report, a thesis or a publisher.
        const two = CES1966REAL();
        two.content[at(two)].content[2].content[0].text = "[S] SAVICP., The cooling of a hot surface by drops boiling in contact with it, Nat. Res. Lab. Canada, Rep. MT-37.";
        assert.equal(L.wvRefList(two).how, "none", "two entries without a year");
        const plain = CES1966REAL();
        plain.content[at(plain)].content[1].content[0].text = "[4] SA~IC P. and G. J. BOULT,The fluid flow associated with the impact of liquid drops with solid surfaces, Ottawa.";
        assert.equal(L.wvRefList(plain).how, "none", "an undated entry that names no report, thesis or publisher");
    });

    // refsfix (2026-11-24): Akao et al. 1980, Trans. ISIJ (MJT's scan; "no marks on its list"), as
    // Zotero 11's structure data REALLY has it: a REFERENCES heading, then a list whose first label OCR
    // read as "I)", "2)" and "3)" printed alone (two items) with their texts after them -- the first
    // tied to "3)" as its continuation, the second cut in two out of order --, the running head
    // (`excluded`), the list 4) to 10), and 11) OCR'd as "II )" in a paragraph of its own. The blocks'
    // types and order are the real ones; the references' texts are written here.
    const ISIJ1980 = () => {
        const B = (type, t, extra) => Object.assign({ type, anchor: { pageRects: [[6, 60, 600, 400, 610]] }, content: [{ text: t }] }, extra || {});
        return { content: [
            B("heading", "Acknowledgements"),
            B("paragraph", "This work was supported by a grant. The authors thank their colleagues for discussions."),
            B("heading", "REFERENCES"),
            { type: "list", content: [
                B("listitem", "I) A . Morita: Tralls.ISIJ, 14 (1974), 285."),
                B("listitem", "2)"),
                B("listitem", "3)", { nextPart: [3, 3] }),
                B("listitem", "A. Morita: Tralls.ISlJ, 14 (1974), 290.", { previousPart: [3, 2] }),
                B("listitem", "A. Morita and K . Arai: 533."),
                B("listitem", "Tetsu-to-Test, 64 ( 1978),"),
            ] },
            B("paragraph", "Transactions Test, Vol. 20, 1980 ( 743)", { flowClass: "excluded" }),
            { type: "list", content: [4, 5, 6, 7, 8, 9, 10].map((n) => B("listitem", n + ") B. Writer" + n + " and C. Other: J. Test Heat Transfer, " + (10 + n) + " (19" + (60 + n) + "), " + (100 * n) + ".")) },
            B("paragraph", "II ) B. S. Gottfr ied, C.]. Lee and K ..J. Bell: lnt 'l J. H eat Mass Transfer, 9 ( 1966), 11 67."),
            B("paragraph", "Research Article", { flowClass: "excluded" }),
        ] };
    };

    it("refsfix: a list under REFERENCES whose labels OCR broke -- \"I)\" first, \"2)\" and \"3)\" alone before their texts, \"II )\" in a paragraph (Trans. ISIJ 1980)", function () {
        refListFns();
        const r = L.wvRefList(ISIJ1980());
        assert.equal(r.how, "detected", "a list is read");
        assert.deepEqual(r.entries.map((e) => e.label), ["1)", "2)", "3)", "4)", "5)", "6)", "7)", "8)", "9)", "10)", "11)"], JSON.stringify(r.entries.map((e) => e.text.slice(0, 20))));
        assert.equal(r.entries[0].text, "1) A . Morita: Tralls.ISIJ, 14 (1974), 285.", "\"I)\" read as 1), written as the label it is");
        assert.equal(r.entries[1].text, "2) A. Morita: Tralls.ISlJ, 14 (1974), 290.", "the first text after the two labels is 2)'s");
        assert.equal(r.entries[2].text, "3) A. Morita and K . Arai: 533. Tetsu-to-Test, 64 ( 1978),", "the rest 3)'s, never joined to 2)");
        assert.match(r.entries[10].text, /^11\) B\. S\. Gottfr ied/, "\"II )\" read as 11), across the running head and into a paragraph");
        // Each text goes to its own number: the volume and page of 2) find 2)'s work, not 1)'s.
        const ix = indexOf([{ id: 1, title: "A first paper on drops", first: "Morita", date: "1974", volume: "14", pages: "285-289" },
            { id: 2, title: "A second paper on drops", first: "Morita", date: "1974", volume: "14", pages: "290-296" }]);
        assert.deepEqual(r.entries.slice(0, 3).map((e) => { const m = L.wvRefMatch(ix, e.text); return m ? m.ids[0] : null; }), [1, 2, null]);
        // Not without the heading: "I)" starts no run, and no list starts at 4).
        const bare = ISIJ1980();
        bare.content.splice(2, 1);
        assert.equal(L.wvRefList(bare).how, "none", "no heading: no list");
        // A label printed alone whose text never comes is no entry.
        const lone = ISIJ1980();
        lone.content[3].content.splice(3, 3);
        assert.deepEqual(L.wvRefList(lone).entries.map((e) => e.label).slice(0, 3), ["1)", "4)", "5)"], "2) and 3) alone, no text: dropped");
    });

    // The r5 set (2026-11-21): headings the papers in Russian, Japanese, Chinese, Italian and German
    // print, which neither route took for a references heading -- the structure route reads no list
    // under them, the full-text route (Cited by) finds no section.
    it("1.2.1-citd.1: reference-list headings in other languages and scripts, letter-spaced, in two languages -- both routes", function () {
        refListFns();
        for (const t of ["СПИСОК ЛИТЕРАТУРЫ", "ЛИТЕРАТУРА", "Литературные источники", "Список литературы", "参 考 文 献", "引 用 文 献", "引用文献", "参考文献(References)",
            "참고 문헌", "Opere citate", "Schriftenverzeichnis.", "R E F E R E N C E S", "Литература / References", "Literatura citada"]) assert.isTrue(L.wvRefListIsTitle(t), t);
        for (const t of ["Literature review", "Список", "参考", "Opere", "Reference frames (in rotating flows)", "参考文献の検討", "Literatur und Methode"]) assert.isFalse(L.wvRefListIsTitle(t), t);
        const B = (type, t) => ({ type, anchor: { pageRects: [[9, 60, 600, 400, 610]] }, content: [{ text: t }] });
        const ru = (n) => B("paragraph", n + ". Иванов" + n + " И.И., Петров П.П. Название статьи номер " + n + " // Журнал. 20" + (10 + n) + ". № " + n + ". С. " + (10 * n) + "–" + (10 * n + 9) + ".");
        const s = { content: [B("paragraph", "Текст статьи."), B("heading", "СПИСОК ЛИТЕРАТУРЫ"), ru(1), ru(2), ru(3)] };
        assert.equal(L.wvRefList(s).entries.length, 3, "three entries under the heading");
        s.content.splice(1, 1);
        assert.equal(L.wvRefList(s).how, "none", "without it: three entries are no list");
        if (typeof L.wvCbSection !== "function") return;
        const body = "Текст статьи. ".repeat(200);
        assert.equal(L.wvCbSection(body + "\nСПИСОК ЛИТЕРАТУРЫ\n1. Иванов И.И. Название. Журнал. 2011. С. 10–19.\n2. Петров П.П. Другое. Журнал. 2012. С. 20–29.").how, "heading");
        assert.equal(L.wvCbSection(body + "\n参 考 文 献\n[1] 王小明, 李华. 标题[J]. 期刊, 2020, 41(3): 1-10.").how, "heading");
    });

    // The r5 set (2026-11-21): Japanese, Korean and Chinese papers' entries against items as Crossref
    // and the CJK databases store them -- romanized names, surnames kept apart from given names.
    it("1.2.1-citd.1: CJK titles and names -- a CJK character weighs two letters, a name in another script, a surname inside the full name, GB/T 7714's [J]", function () {
        const ix = indexOf([
            { id: 1, title: "健康と場所―近隣環境と健康格差研究―", first: "Nakaya", date: "2011", volume: "63", pages: "360-377" },
            { id: 2, title: "초기 청소년기 공격성의 발달적 변화와 가족 영향 요인에 대한 다층모형 분석", first: "Choi", date: "2014", volume: "14", pages: "294-307" },
            { id: 3, title: "フレイルをどのように診断するか", first: "荒井", date: "2018" },
            { id: 4, title: "论乡村重构", first: "龙", date: "2017" },
            { id: 5, title: "论乡村振兴", first: "龙", date: "2017" },
            { id: 6, title: "城市化进程中的社会治理研究", first: "王", date: "2015" },
            { id: 7, title: "城市化进程与社会治理", first: "王", date: "2016" },
        ]);
        const id = (t) => { const m = L.wvRefMatch(ix, t); return m ? m.ids[0] : null; };
        assert.equal(id("中谷 友樹（2011）．健康と場所―近隣環境と健康格 差研究― 人文地理， 63, 360–377."), 1, "kanji in the entry, the romanized name in the library");
        assert.isNull(id("中谷 友樹（2015）．健康と場所―近隣環境と健康格 差研究― 人文地理， 63, 360–377."), "another year: not without the name");
        assert.equal(id("[14] 최정아, “초기 청소년기 공격성의 발달적 변화와 가족 영향 요인에 대한 다층모형 분석,” 한국콘텐 츠학회논문지, 제14권, 제2호, pp.294-307, 2014."), 2, "Hangul in the entry");
        assert.equal(id("2）荒井秀典 編集主幹 フレイルをどのように診断する か．フレイル診療ガイド 2018 年版，第 1 版，ライフ・ サイエンス，東京，2018，p4―8."), 3, "the surname at the start of the full name");
        assert.isNull(id("2）鈴木秀典 編集主幹 フレイルをどのように診断する か．フレイル診療ガイド 2018 年版，2018，p4―8."), "another surname");
        assert.equal(id("龙花楼, 屠爽爽. 2017. 论乡村重构[J]. 地理学报, 72(4): 563- 576."), 4, "a five-character title followed by [J]");
        assert.isNull(id("龙花楼. 2017. 论乡村重构与发展[J]. 地理学报, 72(4): 563- 576."), "not inside a longer title");
        assert.isNull(id("李明, 张华. 2015. 城市化进程中的社会治理研究[J]. 社会学研究, 30(2): 1-20."), "no short title, but a one-character surname is asked all the same");
        assert.equal(id("王建国, 张华. 2015. 城市化进程中的社会治理研究[J]. 社会学研究, 30(2): 1-20."), 6, "... and with it, it is found");
        assert.isNull(id("李明, 张华. 2016. 城市化进程与社会治理[M]. 北京: 商务印书馆."), "a ten-character title is a short one: it needs its author");
        assert.equal(id("王建国. 2016. 城市化进程与社会治理[M]. 北京: 商务印书馆."), 7);
    });

    it("1.2.1-citd.1: letters other lists write otherwise -- ß, ø, æ, ł; an umlaut written out; a Russian name in Latin letters", function () {
        for (const [a, b] of [["Straße", "Strasse"], ["Sørensen", "Sorensen"], ["Łukasz", "Lukasz"], ["Æsthetik", "Aesthetik"], ["Œuvres", "Oeuvres"]]) assert.equal(L.wvRefCompact(a), L.wvRefCompact(b), a);
        const ix = indexOf([
            { id: 1, title: "Die Wohnungsfrage in der Großstadt", first: "Müller", date: "1999", volume: "12", pages: "301-320" },
            { id: 2, title: "Распространенность хронической сердечной недостаточности", first: "Фомин", date: "2006", volume: "7", pages: "4-7" },
            { id: 3, title: "Эволюция рождаемости за последние полвека в России", first: "Фрейка", date: "2014", volume: "14", pages: "9-25" },
        ]);
        const id = (t) => { const m = L.wvRefMatch(ix, t); return m ? m.ids[0] : null; };
        assert.equal(id("Mueller H (1999) Die Wohnungsfrage in der Grossstadt. Z Soziol 12:301-320"), 1, "ue and ss");
        assert.equal(id("19. Fomin I.V., Belenkov Yu.N., Mareev V.Yu. et al. Prevalence of CHF in European part of the Russian Federation. Russian Heart Failure Journal. 2006;7(1):4–7."), 2, "the name in Latin letters, the volume and page");
        assert.equal(id("Frejka T., Zakharov S. (2014). Evolyutsiya rozhdayemosti v Rossii za polveka. Demograficheskoe obozrenie, 14(1), 9-25."), 3, "й as j");
        assert.isNull(id("19. Fomina A.V. Prevalence of something else. Russian Heart Failure Journal. 2006;7(1):4–7."), "another name");
    });

    it("1.2.1-citd.1: a chapter's entry names its book after \"In\" -- the chapter when the library holds it, else the book", function () {
        const book = { id: 1, title: "The Politics of International Migration Management", first: "Geiger", date: "2010" };
        const chapter = { id: 2, title: "Expanded Borders: Policies and Practices of Preventive Refoulement in Italy", first: "Marchetti", date: "2010", pages: "160-183" };
        const marchetti = "MARCHETTI, Chiara. The expanded border. Policies and practices of preventive refoulement in Italy. In GEIGER, Martin; PÉCOUD, Antoine (eds.). The politics of international migration management. Basingstoke: Palgrave MacMillan, 2010, p. 160-183.";
        let ix = indexOf([book, chapter]);
        assert.equal(L.wvRefMatch(ix, marchetti).ids[0], 2, "the chapter (its title a little off), not the book");
        ix = indexOf([book]);
        assert.equal(L.wvRefMatch(ix, marchetti).ids[0], 1, "the book alone: the book");
        const gelichi = "S. Gelichi, D. Calaon, E. Grandi, C. Negrelli, History of a forgotten town: Comacchio and its archaeology, in From one sea to another. Trading places in the European and Mediterra- nean Early Middle ages, a cura di S. Gelichi, R. Hodges, Turnhout 2012, pp. 169-206.";
        const vol = { id: 3, title: "From one sea to another. Trading places in the European and Mediterranean Early Middle Ages", first: "Gelichi", date: "2012" };
        assert.equal(L.wvRefMatch(indexOf([vol, { id: 4, title: "The history of a forgotten town: Comacchio and its archaeology", first: "Gelichi", date: "2012", pages: "169-205" }]), gelichi).ids[0], 4, "\", in\" and the volume's title: the chapter");
        assert.equal(L.wvRefMatch(ix, "Bertola V, Marengo M. Single drop impacts. In: Geiger M, Pécoud A, editors. The politics of international migration management. London: Palgrave; 2010. p. 267.").ids[0], 1, "Vancouver's \"In: ..., editors.\"");
        assert.equal(L.wvRefMatch(ix, "Geiger, M. & Pécoud, A. (eds) 2010. The Politics of International Migration Management. Basingstoke: Palgrave.").ids[0], 1, "the book cited as itself");
    });

    it("1.2.1-citd.1: volume and page between titles -- the one the entry's pages fit, not a short title inside a longer one with other pages", function () {
        const paper = { id: 1, title: "Global Prevalence of Diabetes", first: "Wild", date: "2004", volume: "27", pages: "1047-1053" };
        const reply = { id: 2, title: "Global Prevalence of Diabetes: Estimates for the Year 2000 and Projections for 2030", first: "Wild", date: "2004", volume: "27", pages: "2569-2569" };
        const wild = "2. Wild S, Roglic G, Green A, Sicree R, King H. Global prevalence of diabetes: estimates for the year 2000 and projections for 2030. Diabetes Care. 2004 mai; 27(5):1047- 53.";
        assert.equal(L.wvRefMatch(indexOf([paper, reply]), wild).ids[0], 1, "the paper, whose volume and page the entry prints");
        assert.equal(L.wvRefMatch(indexOf([paper, reply]), wild.replace("1047- 53", "104753")).ids[0], 1, "the range joined at a line break, as Zotero's text has it");
        assert.equal(L.wvRefMatch(indexOf([reply]), wild.replace("27(5):1047- 53", "27(10):2569")).ids[0], 2, "the reply where its own pages are printed");
        assert.equal(L.wvRefMatch(indexOf([reply]), wild).ids[0], 2, "the longer title alone: as before");
        const enc = { id: 3, title: "Health Literacy", first: "Sørensen", date: "2015", pages: "653-656" };
        const s = "4. Sørensen K, Brand H (2014) Health literacy lost in translations? Introducing the European Health Literacy Glossary. Health Promot Int 29:634–644";
        assert.isNull(L.wvRefMatch(indexOf([enc]), s), "a short title inside a longer one, other pages");
        assert.equal(L.wvRefMatch(indexOf([enc]), "Sørensen K (2015) Health literacy. In: Wright JD (ed) International Encyclopedia of the Social & Behavioral Sciences, 653-656").ids[0], 3, "its own pages");
    });

    it("1.2.1-citd.1: a footnote's signal before its author (\"Cf.\", \"See\", \"Vgl.\") is no name", function () {
        const ix = indexOf([{ id: 1, title: "The Civil Contract of Photography", first: "Azoulay", date: "2021" }, { id: 2, title: "Die Wohnungsfrage", first: "Engels", date: "1887", volume: "4", pages: "12" }]);
        assert.equal(L.wvRefMatch(ix, "15. Cf. Ariella Azoulay, The Civil Contract of Photography, New York, Zone Books, 2008.").ids[0], 1, "its reissue's year: by the first author");
        assert.isNull(L.wvRefMatch(ix, "15. Cf. Ariella Shamir, The Civil Contract of Photography, New York, Zone Books, 2008."), "another author");
        assert.equal(L.wvRefMatch(ix, "3 Vgl. Engels, F., Zur Wohnungsfrage, Leipzig 1887, 4, 12.").ids[0], 2, "volume and page by the first author after \"Vgl.\"");
    });

    it("1.2.1-citd.1: law reports and reviews -- volume, reporter, page; a case's short title by its year", function () {
        for (const [t, k] of [["403 U.S. 388, 389 (1971)", "403|388"], ["5 U.S. (1 Cranch) 137, 163 (1803)", "5|137"], ["78 N.Y.U. L. REV. 1309 (2003)", "78|1309"],
            ["28 Yale L.J. 1 (1918)", "28|1"], ["[1911] 1 KB 410 at 413", "1|410"], ["2018 SCC 30 at para 81", "2018|30"], ["102 DLR (4th) 456", "102|456"]]) assert.include(L.wvRefVolPages(t), k, t);
        assert.notInclude(L.wvRefVolPages("Proc. R. Soc. Lond. 2006 J. Fluid Mech. 554 85"), "2006|554");
        const ix = indexOf([
            { id: 1, title: "Marbury v. Madison", date: "1803", volume: "5", pages: "137" },
            { id: 2, title: "Bivens v. Six Unknown Named Agents of Federal Bureau of Narcotics", date: "1971", volume: "403", pages: "388" },
            { id: 3, title: "The Constitutional Right to a Remedy", first: "Phillips", date: "2003", volume: "78", pages: "1309" },
            { id: 4, title: "Ewert v Canada", date: "2018", volume: "2018", pages: "30" },
            { id: 5, title: "Introduction", date: "2016" },
        ]);
        const id = (t) => { const m = L.wvRefMatch(ix, t); return m ? m.ids[0] : null; };
        assert.equal(id("1. See Marbury v. Madison, 5 U.S. (1 Cranch) 137, 163 (1803) (quoting 3 WILLIAM BLACKSTONE, COMMENTARIES *23, *109)."), 1);
        assert.equal(id("16. See Bivens v. Six Unknown Named Agents of Fed. Bureau of Narcotics, 403 U.S. 388, 389 (1971)."), 2, "the title abbreviated: the report's volume and page, the year");
        assert.equal(id("Thomas R. Phillips, The Constitutional Right to a Remedy, 78 N.Y.U. L. REV. 1309 (2003)."), 3);
        assert.equal(id("1 Ewert v Canada, 2018 SCC 30 at para 81 [Ewert]."), 4);
        assert.isNull(id("Marbury v. Madison, a play in three acts (1998)."), "another year");
        assert.isNull(id("Smith J. 2016. Introduction. In: A handbook of something. Oxford."), "one word: no");
    });

    it("1.2.1-citd.1: the day a web page was read is no year of the work", function () {
        for (const c of [{ t: "Statement. http://example.org/x.pdf （accessed 2018-02-15）.", y: [] }, { t: "Leitlinie. https://x.de (Zugegriffen: 12. März 2015)", y: [] },
            { t: "Nuevo coronavirus (COVID-19). http://www.x.eus/ (accedido el 20/Mar/2020).", y: [] }, { t: "Отчёт 2017. URL: http://x.ru (дата обращения 10.12.2019).", y: ["2017"] },
            { t: "Smith J (2014) A title. Health 29:634 [cited 2020 Mar 3]", y: ["2014"] }, { t: "Rapport. Paris, 2011. Consulté le 3 mai 2016.", y: ["2011"] }]) assert.deepEqual(L.wvRefYears(c.t), c.y, c.t);
        const ix = indexOf([{ id: 1, title: "フレイルに関する日本老年医学会からのステートメント", first: "日本老年医学会", date: "2014" }]);
        assert.equal(L.wvRefMatch(ix, "1）日本老年医学会 フレイルに関する日本老年医学会か らのステートメント．http://www.jpn-geriat-soc.or.jp/ info/topics/pdf/20140513_01_01.pdf，（accessed 2018- 02-15）.").ids[0], 1);
    });

    // ---- 1.3.0-refkeys.1 (2026-11-24, MJT "Also ok" after the 2026-11-24 plugin survey): an arXiv
    // key, and an "ambiguous" answer when several works fit about equally (idea from Changed
    // Reference Linker, gesongping, MIT).

    it("refkeys: an arXiv identifier names its item -- every form an entry writes, the version off; a bare decimal number is no identifier", function () {
        const ix = indexOf([
            { id: 1, title: "Bouncing or merging in drop-bath impacts", archiveID: "arXiv:2101.12345", first: "Lewin-Jones", date: "2021" },
            { id: 2, title: "Anti de Sitter space and holography", archiveID: "arXiv:hep-th/9802150", first: "Witten", date: "1998" },
            { id: 3, title: "Ricci flow with surgery on three-manifolds", archiveID: "arXiv:math/0303109", first: "Perelman", date: "2003" },
            { id: 4, title: "Modular forms of low weight and level", archiveID: "arXiv:0706.0001", first: "Stein", date: "2007" },
        ]);
        const got = (t) => { const m = L.wvRefMatch(ix, t); return m ? [m.ids[0], m.how] : null; };
        for (const t of [
            "[1] P. Lewin-Jones, arXiv:2101.12345.",
            "[1] P. Lewin-Jones, arXiv:2101.12345v2 [physics.flu-dyn] (2021).",
            "[1] P. Lewin-Jones, arXiv 2101.12345 (2021).",
            "[1] P. Lewin-Jones, arXiv: 2101.12345 (2021).",
            "[1] P. Lewin-Jones et al., arXiv preprint arXiv:2101.12345 (2021).",
            "[1] P. Lewin-Jones et al. (2021), https://arxiv.org/abs/2101.12345v3",
            "[1] P. Lewin-Jones et al. (2021), http://arxiv.org/pdf/2101.12345v1.pdf",
            "[1] P. Lewin-Jones et al. (2021), https://doi.org/10.48550/arXiv.2101.12345",
        ]) assert.deepEqual(got(t), [1, "arxiv"], t);
        for (const t of ["[2] E. Witten, hep-th/9802150 (1998).", "[2] E. Witten, arXiv:hep-th/9802150v3.", "[2] E. Witten (1998), arxiv.org/abs/hep-th/9802150"]) assert.deepEqual(got(t), [2, "arxiv"], t);
        assert.deepEqual(got("[3] G. Perelman, math.DG/0303109 (2003)."), [3, "arxiv"], "an old identifier's subject class is not part of it");
        assert.deepEqual(got("[4] W. Stein, arXiv:0706.0001v1 [math.NT] 1 Jun 2007."), [4, "arxiv"], "arXiv's own stamp");
        assert.isNull(got("[1] P. Lewin-Jones, Report 2101.12345 (2021)."), "a bare number with nothing of arXiv around it");
        assert.isNull(got("[1] P. Lewin-Jones, J. Test. Phys. 2101.12345 (2021)."), "a decimal in a journal entry");
        assert.isNull(got("[1] P. Lewin-Jones, arXiv:2113.12345 (2021)."), "no month 13");
        assert.isNull(got("[1] P. Lewin-Jones, arXiv:1412.12345 (2014)."), "five digits only from 1501 on");
        assert.isNull(got("[1] P. Lewin-Jones, arXiv:1501.1234 (2015)."), "four digits only up to 1412");
        assert.isNull(got("[1] P. Lewin-Jones, http://example.org/hep-th/9802150 (2021)."), "an old identifier's shape inside another site's path");
        // As a DOI: the entry's other words name the item (fix 4) -- its first author or its year.
        assert.isNull(got("[9] J. Other, arXiv:2101.12345."), "neither the item's first author nor its year");
        assert.deepEqual(got("[9] arXiv:2101.12345 (2021)."), [1, "arxiv"], "its year");
        // The identifier's digits are no year: "2001.01234" is January 2020, not 2001.
        const ix2 = indexOf([{ id: 5, title: "A paper of 2001 by someone", first: "Nobody", date: "2001", archiveID: "arXiv:2001.01234" }]);
        assert.isNull(L.wvRefMatch(ix2, "[9] J. Other, arXiv:2001.01234."), "the id's 2001 is not the item's year");
    });

    it("refkeys: an item's arXiv identifier -- from its DOI, its Archive ID, its URL, an Extra line; the version and the subject class off", function () {
        const ix = indexOf([
            { id: 1, title: "One title of a preprint", DOI: "10.48550/arXiv.2101.12345", first: "A", date: "2021" },
            { id: 2, title: "Two title of a preprint", archiveID: "arXiv:2102.00001v2", first: "B", date: "2021" },
            { id: 3, title: "Three title of a preprint", url: "https://arxiv.org/abs/0706.0001v1", first: "C", date: "2007" },
            { id: 4, title: "Four title of a preprint", url: "http://arxiv.org/pdf/1901.00002v3.pdf", first: "D", date: "2019" },
            { id: 5, title: "Five title of a published paper", DOI: "10.1103/PhysRevLett.1.1", extra: "Citation Key: five\narXiv: 1901.00003\nversion: 2", first: "E", date: "2019" },
            { id: 6, title: "Six title of an old preprint", extra: "arXiv:math.GT/0309136 [math.GT]", first: "F", date: "2003" },
            { id: 7, title: "Seven title with no identifier", url: "https://example.org/2101.12345", extra: "See 2101.12345\nPublisher: arXiv", archiveID: "SSRN 3456789", first: "G", date: "2021" },
            { id: 8, title: "Eight title of a preprint", DOI: "10.48550/arXiv.hep-th/9901001", first: "H", date: "1999" },
        ]);
        const axs = (id) => Array.from(L.wvRefIndexGet(ix, id).axs || []);
        assert.deepEqual(axs(1), ["2101.12345"], "the arXiv DOI");
        assert.deepEqual(axs(2), ["2102.00001"], "the Archive ID, version off");
        assert.deepEqual(axs(3), ["0706.0001"], "an abs link");
        assert.deepEqual(axs(4), ["1901.00002"], "a pdf link");
        assert.deepEqual(axs(5), ["1901.00003"], "an Extra line (Mendeley's \"arXiv: <id>\")");
        assert.deepEqual(axs(6), ["math/0309136"], "the translator's Extra line, an old identifier's subject class off");
        assert.deepEqual(axs(7), [], "a number elsewhere, another archive's id");
        assert.deepEqual(axs(8), ["hep-th/9901001"], "an old identifier in an arXiv DOI");
        const got = (t) => { const m = L.wvRefMatch(ix, t); return m ? [m.ids[0], m.how] : null; };
        assert.deepEqual(got("[5] E. E, arXiv:1901.00003 (2019)."), [5, "arxiv"], "found by its Extra line");
        assert.deepEqual(got("[6] F. F, arXiv:math/0309136 (2003)."), [6, "arxiv"]);
        assert.deepEqual(got("[8] H. H, hep-th/9901001 (1999)."), [8, "arxiv"]);
    });

    it("refkeys: a preprint and its journal version both in the library -- the arXiv identifier names the preprint, the journal's DOI the journal version", function () {
        const journal = { id: 2, itemType: "journalArticle", title: "Drop impact on soft solids", DOI: "10.1017/jfm.2022.1", url: "http://arxiv.org/abs/2101.12345", extra: "arXiv:2101.12345", first: "Smith", date: "2022", volume: "940", pages: "A1" };
        const preprint = { id: 1, itemType: "preprint", title: "Drop impact on soft solids", DOI: "10.48550/arXiv.2101.12345", archiveID: "arXiv:2101.12345", url: "http://arxiv.org/abs/2101.12345", first: "Smith", date: "2021" };
        // The journal version enters first: an order alone would take it.
        const ix = indexOf([journal, preprint]);
        const m = (t) => L.wvRefMatch(ix, t);
        let r = m("Smith, J. 2021 Drop impact on soft solids. arXiv:2101.12345.");
        assert.deepEqual([r.ids[0], r.how], [1, "arxiv"], "the preprint the entry cites");
        assert.notInclude(Array.from(r.ids), 2, "not the journal version as a copy");
        assert.isUndefined(r.ambiguous, "one work: not ambiguous");
        r = m("Smith, J. 2022 Drop impact on soft solids. J. Fluid Mech. 940, A1. doi:10.1017/jfm.2022.1 (arXiv:2101.12345)");
        assert.deepEqual([r.ids[0], r.how], [2, "doi"], "the journal DOI in the entry: the journal version");
        r = m("Smith, J. 2022 Drop impact on soft solids. doi:10.48550/arXiv.2101.12345, doi:10.1017/jfm.2022.1");
        assert.deepEqual([r.ids[0], r.how], [2, "doi"], "both DOIs written, the arXiv one first: the journal DOI still");
        r = m("Smith, J. 2021 Drop impact on soft solids. doi:10.48550/arXiv.2101.12345");
        assert.deepEqual([r.ids[0], r.how], [1, "doi"], "the arXiv DOI alone: the preprint");
        // Without the Extra line (a journal item that names no arXiv id) and without the item types.
        const ix2 = indexOf([Object.assign({}, journal, { extra: "", url: "", itemType: undefined }), Object.assign({}, preprint, { itemType: undefined })]);
        r = L.wvRefMatch(ix2, "Smith, J. 2021 Drop impact on soft solids. arXiv:2101.12345.");
        assert.deepEqual([r.ids[0], r.how], [1, "arxiv"], "the preprint again");
        // The journal version alone, its Extra naming the preprint.
        r = L.wvRefMatch(indexOf([journal]), "Smith, J. 2021 Drop impact on soft solids. arXiv:2101.12345.");
        assert.deepEqual([r.ids[0], r.how], [2, "arxiv"], "the journal version when it is all the library has");
        // Two preprint records of one identifier (My Library and a group, one titled as v2): one work.
        const ix3 = indexOf([preprint, { id: 3, lib: 9, title: "Drop impact on soft elastic solids", archiveID: "arXiv:2101.12345v2", first: "Smith", date: "2021" }]);
        r = L.wvRefMatch(ix3, "Smith, J. 2021 arXiv:2101.12345.");
        assert.sameMembers(Array.from(r.ids), [1, 3], "both records are the work's copies");
        assert.isUndefined(r.ambiguous);
    });

    it("refkeys: ambiguous -- two different works that fit equally: the best and the list; copies are one work; an exact identifier never ambiguous", function () {
        // A conference paper and its journal version a year apart, the same title (not copies: the years differ).
        const conf = { id: 1, title: "Drop impact on a thin liquid film", first: "Smith", date: "2019" };
        const jour = { id: 2, title: "Drop impact on a thin liquid film", first: "Smith", date: "2020", volume: "12", pages: "345" };
        let ix = indexOf([conf, jour]);
        let r = L.wvRefMatch(ix, "Smith, A. Drop impact on a thin liquid film. In: Proceedings of a meeting.");
        assert.equal(r.how, "title");
        assert.equal(r.ids[0], 1, "the first as before");
        assert.deepEqual(Array.from(r.ambiguous || []), [1, 2], "no year: both, the best first");
        r = L.wvRefMatch(ix, "Smith, A. 2020 Drop impact on a thin liquid film. J. Test 12, 345.");
        assert.deepEqual([r.ids[0], r.ambiguous], [2, undefined], "the year (and the volume and page) tell them apart");
        r = L.wvRefMatch(ix, "Smith, A. 2019 Drop impact on a thin liquid film. In: Proceedings of a meeting.");
        assert.deepEqual([r.ids[0], r.ambiguous], [1, undefined], "the year tells the other one");
        // Two works of one title by different first authors, neither the entry's first author.
        ix = indexOf([{ id: 3, title: "Bubble bursting at a free surface", first: "Jones", date: "2020" }, { id: 4, title: "Bubble bursting at a free surface", first: "Smith", date: "2020" }]);
        r = L.wvRefMatch(ix, "Brown, C., Jones, B. & Smith, A. 2020 Bubble bursting at a free surface. J. Test 1, 2.");
        assert.deepEqual(Array.from(r.ambiguous || []), [3, 4], "both: " + JSON.stringify(r));
        r = L.wvRefMatch(ix, "Jones, B., Brown, C. & Smith, A. 2020 Bubble bursting at a free surface. J. Test 1, 2.");
        assert.deepEqual([r.ids[0], r.ambiguous], [3, undefined], "the entry's first author tells them apart");
        // Copies of one work (the same title, first author and year, in two libraries): one work, no ambiguity.
        ix = indexOf([conf, Object.assign({}, conf, { id: 5, lib: 7 })]);
        r = L.wvRefMatch(ix, "Smith, A. Drop impact on a thin liquid film. In: Proceedings of a meeting.");
        assert.sameMembers(Array.from(r.ids), [1, 5]);
        assert.isUndefined(r.ambiguous, "copies are folded");
        // An exact DOI: never ambiguous -- not with another work of the same title, not with a copy whose title is off.
        ix = indexOf([Object.assign({}, jour, { DOI: "10.1234/film.2020" }), conf, { id: 6, lib: 7, title: "Drop impact on thin liquid films", DOI: "10.1234/film.2020", first: "Smith", date: "2020" }]);
        r = L.wvRefMatch(ix, "Smith, A. Drop impact on a thin liquid film. doi:10.1234/film.2020");
        assert.deepEqual([r.ids[0], r.how, r.ambiguous], [2, "doi", undefined]);
        assert.sameMembers(Array.from(r.ids), [2, 6], "the copy with its title off is the same work");
        // ... unless two different works share it (a book and a chapter carrying the book's DOI).
        ix = indexOf([{ id: 7, title: "Handbook of drop dynamics", DOI: "10.1234/book.1", first: "Editor", date: "2015" },
            { id: 8, title: "Splashing on dry surfaces", DOI: "10.1234/book.1", first: "Author", date: "2015" }]);
        r = L.wvRefMatch(ix, "Reader, R. 2015 Handbook. doi:10.1234/book.1");
        assert.equal(r.how, "doi");
        assert.deepEqual(Array.from(r.ambiguous || []), [7, 8], "two works, one DOI: " + JSON.stringify(r));
        assert.notInclude(Array.from(r.ids), 8, "the other work is no copy");
        r = L.wvRefMatch(ix, "Author, A. 2015 Splashing on dry surfaces. In Handbook. doi:10.1234/book.1");
        assert.deepEqual([r.ids[0], r.ambiguous], [8, undefined], "the entry's first author tells them apart");
        // The same for an arXiv identifier two different works carry.
        ix = indexOf([{ id: 9, title: "One preprint about drops", archiveID: "arXiv:2101.12345", first: "Alpha", date: "2021" },
            { id: 10, title: "Another preprint about bubbles", extra: "arXiv: 2101.12345", first: "Beta", date: "2021" }]);
        r = L.wvRefMatch(ix, "Gamma, G. 2021 arXiv:2101.12345.");
        assert.equal(r.how, "arxiv");
        assert.deepEqual(Array.from(r.ambiguous || []), [9, 10]);
    });

    it("refkeys: ambiguous in the approximate step -- within a fifth of its tolerance (0.02), not beyond", function () {
        const text = "Rami Al-Rfou, Dokook Choe, Noah Constant, Mandy Guo, and Llion Jones. 2018. Character-level lan- guage modling with deeper self-attention. arXiv preprint.";
        // Compact lengths and distances (D:/tmp/wv-scripts/refkeys-approx-check.py): 53 chars, 1 off
        // (0.0189); 54, 2 off (0.0370 - 0.0189 = 0.0181, under 0.02); 51, 3 off (0.0588 - 0.0189 = 0.0399).
        const a = { id: 1, title: "Character-level language modeling with deeper self-attention", first: "Al-Rfou", date: "2018" };
        const near = { id: 2, title: "Character-level language modelling with deeper self-attention", first: "Al-Rfou", date: "2018" };
        const far = { id: 3, title: "Character-level language modeling with deep self-attention", first: "Al-Rfou", date: "2018" };
        let r = L.wvRefMatch(indexOf([a, near]), text);
        assert.deepEqual([r.ids[0], r.how], [1, "approx"]);
        assert.deepEqual(Array.from(r.ambiguous || []), [1, 2], "one character apart on 53: a tie");
        r = L.wvRefMatch(indexOf([a, far]), text);
        assert.deepEqual([r.ids[0], r.how, r.ambiguous], [1, "approx", undefined], "two characters more: the best alone");
    });

    it("refkeys: ambiguous by volume and page -- two works by the entry's first author with the same volume and page, the year not telling", function () {
        const ix = indexOf([{ id: 1, title: "A letter on drops", first: "Bartolo", date: "2006", volume: "96", pages: "124501" },
            { id: 2, title: "Another journal's paper", first: "Bartolo", date: "2006", volume: "96", pages: "124501-124509" }]);
        let r = L.wvRefMatch(ix, "[7] D. Bartolo, C. Josserand, and D. Bonn, Phys. Rev. Lett. 96, 124501 (2006).");
        assert.equal(r.how, "volpage");
        assert.deepEqual(Array.from(r.ambiguous || []), [1, 2]);
        r = L.wvRefMatch(indexOf([{ id: 1, title: "A letter on drops", first: "Bartolo", date: "2006", volume: "96", pages: "124501" },
            { id: 2, title: "Another journal's paper", first: "Bartolo", date: "2005", volume: "96", pages: "124501" }]), "[7] D. Bartolo, C. Josserand, and D. Bonn, Phys. Rev. Lett. 96, 124501 (2006).");
        assert.deepEqual([r.ids[0], r.ambiguous], [1, undefined], "the exact year wins over one a year off");
    });

    it("1.2.1-citd.1: lists in CJK author-year style, and \"et al.\" in other languages, read where Zotero flagged nothing or left a gap", function () {
        refListFns();
        const B = (type, t, extra) => Object.assign({ type, anchor: { pageRects: [[9, 60, 600, 400, 610]] }, content: [{ text: t }] }, extra || {});
        const zh = ["龙花楼, 屠爽爽. 2017. 论乡村重构[J]. 地理学报, 72(4): 563-576.", "冯健. 2012. 乡村重构: 模式与创新[M]. 北京: 商务印书馆.", "刘彦随. 2018. 中国新时代城乡融合与乡村振兴[J]. 地理学报, 73(4): 637-650.",
            "张富刚, 刘彦随. 2008. 中国区域农村发展动力机制及其发展模式[J]. 地理学报, 63(2): 115-122.", "中谷 友樹（2011）．健康と場所―近隣環境と健康格差研究― 人文地理， 63, 360–377."];
        const s = { content: [B("paragraph", "正文。"), B("heading", "参考文献(References)"), { type: "list", content: zh.map((t) => B("listitem", t)) }] };
        assert.equal(L.wvRefList(s).entries.length, 5, "five CJK author-year entries under the heading");
        s.content.splice(1, 1);
        assert.equal(L.wvRefList(s).how, "none", "no heading: not read");
        const de = (t, ref) => B("listitem", t, { reference: ref || undefined });
        const g = { content: [B("heading", "Literatur"), { type: "list", content: [de("1. Abel T (2008) Measuring health literacy. Eur J Public Health 18:12–20", true),
            de("Müller H, Schmidt K, Weber L u. a. (2010) Gesundheitskompetenz in Deutschland. Bundesgesundheitsblatt", false),
            de("3. Berens EM (2016) Health literacy in Germany. Bundesgesundheitsblatt 59:1–9", true)] }] };
        assert.include(L.wvRefList(g).entries.map((e) => e.text.slice(0, 10)), "Müller H, ", "\"u. a.\" with a year between two flagged entries");
    });

    it("1.2.1-citd.1: entries Zotero merged into one list item are cut at their numbers -- \"n)\" labels, CJK names after them, a list of one item (J-STAGE 1962)", function () {
        refListFns();
        const B = (type, page, t) => ({ type, anchor: { pageRects: [[page, 60, 600, 400, 610]] }, content: [{ text: t }] });
        const merged = "1) 島薗: 生化学, 34, 42 (1962) 参照 2) 片井: 農化, 19, 837 (1943) 3) 伊藤, 大野: 農学, 2, 382 (1948) 4) 田所, 藤原: 栄養と食糧, 9, 12 (1956) 5) Camiener, Brown: J. Amer. Chem. Soc., 81, 3800 (1959)";
        const s = { content: [B("paragraph", 5, "本文の最後の段落。"), B("heading", 6, "文献"), { type: "list", content: [B("listitem", 6, merged),
            B("listitem", 6, "6) 近藤, 満田, 岩井: 農化, 24, 128 (1950)"), B("listitem", 6, "7) 川崎: ビタミン, 24, 330 (1962)")] }] };
        const r = L.wvRefList(s);
        assert.deepEqual(r.entries.map((e) => e.label), ["1)", "2)", "3)", "4)", "5)", "6)", "7)"], JSON.stringify(r.entries.map((e) => e.text.slice(0, 12))));
        assert.match(r.entries[1].text, /^2\) 片井: 農化, 19, 837 \(1943\)$/);
        // Not a number inside an entry that is no next entry: an issue "(2)" before the pages.
        const one = { content: [B("heading", 6, "References"), { type: "list", content: [B("listitem", 6, "(1) Smith, J. A. Some title. J. Test. 2001, 12 (2) Supplement, 34-56.")] }] };
        assert.equal(L.wvRefList(one).entries.length, 1);
    });

    it("1.2.1-citd.1: an author-year list with given names written out (\"Nom, Prénom (année)\") completes Zotero's flagged part", function () {
        refListFns();
        const B = (page, t, ref) => ({ type: "listitem", reference: ref || undefined, anchor: { pageRects: [[page, 60, 600, 400, 610]] }, content: [{ text: t }] });
        const s = { content: [{ type: "paragraph", content: [{ text: "La conclusion." }] }, { type: "heading", content: [{ text: "Références" }] },
            { type: "list", content: [B(22, "Ayres-Bennett, Wendy (1987), Vaugelas and the Development of the French Language, Londres, MHRA."),
                B(22, "Bauer, Laurie et Peter Trudgill (dir.) (1998), Language Myths, Londres, Penguin.")] },
            { type: "list", content: ["Buffet, Marguerite (1668), Nouvelles Observations sur la langue françoise, Paris.", "Camus, Paul (1966), « Un état fort », Défense de la langue française.",
                "Cohen, Marcel (1950), Regards sur la langue française, Paris, Sedes.", "Druon, Maurice (1999), Le « Bon Français », Monaco, Éditions du Rocher."].map((t) => B(23, t, true)) },
            { type: "list", content: [B(25, "Walsh, Olivia (2012), Linguistic Purism in France and Quebec, thèse de doctorat, Cambridge.")] }] };
        assert.deepEqual(L.wvRefList(s).entries.map((e) => e.text.split(",")[0]), ["Ayres-Bennett", "Bauer", "Buffet", "Camus", "Cohen", "Druon", "Walsh"]);
    });

    it("1.2.1-citd.1: the full-text route cuts a list numbered \"1)\" (Japanese \"1）\") at its numbers, in any script", function () {
        if (typeof L.wvCbChunks !== "function") wvT.absent("lib.wvCbChunks");
        const jp = "1)日本老年医学会 フレイルに関する日本老年医学会からのステートメント.http://www.jpn-geriat-soc.or.jp/,(accessed 2018-02-15).\n"
            + "2)荒井秀典 編集主幹 フレイルをどのように診断するか.フレイル診療ガイド 2018 年版,東京,2018,p4―8.\n"
            + "3)Dent E, Lien C, Lim WS, et al.: The Asia-Pacific clinical practice guideline for the management of frailty. J Am Med Dir Assoc 2017; 18 (7): 564―575.\n"
            + "4)厚生労働省老健局老人保健課.基本チェックリストの考え方について.2006.";
        assert.deepEqual(L.wvCbChunks(jp).map((e) => e.slice(0, 2)), ["1)", "2)", "3)", "4)"]);
        const ay = "Abel T (2008) Measuring health literacy. Eur J Public Health 18:12–20\nBerens EM (2016) Health literacy in Germany: 1) a survey. Bundesgesundheitsblatt 59:1–9\nCohen M (2001) A title. J X 3:4–5";
        assert.equal(L.wvCbChunks(ay).filter((e) => /^\d\)/.test(e)).length, 0, "a \"1)\" inside an author-year entry is no numbering");
    });

    it("the reader's reference list (refs.ts) is Weavero's own reading where Zotero flagged none", async function () {
        refListFns();
        const wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvRefsEntries");
        const Z = /** @type {any} */ (Zotero);
        const SDT = Z.SDT;
        // An attachment id no item has: a stand-in Zotero.SDT (the reader-only
        // shape: no getPack, so lib/sdt.ts asks getReader) answers it with paper
        // 02's structure. A stand-in object, not a patch of Zotero's: zotero#6012
        // has no getReader to patch.
        const FAKE = -900000 - Math.floor(Math.random() * 1000);
        Z.SDT = {
            getReader: function (id) {
                if (id === FAKE) return Promise.resolve({ materialize: () => Promise.resolve(JSON.parse(JSON.stringify(STRUCT02))) });
                return Promise.resolve(null);
            },
        };
        try {
            const entries = await wv._wvRefsEntries(FAKE);
            assert.equal(entries.length, 66);
            assert.match(entries[16].text, /^\[17\] J\. M\. Gordillo, Axisymmetric bubble collapse/);
        }
        finally { Z.SDT = SDT; }
    });
});
