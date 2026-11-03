# Weavero's Fluent strings. Zotero registers every `locale/<locale>/*.ftl`
# of a plugin at startup (xpcom/plugins.js registerLocales); a window links
# the file with MozXULElement.insertFTLIfNeeded("weavero.ftl") (the wiring
# table's `backlinks-ftl` entry). First file: the item-pane Backlinks
# section (issue #60), whose ItemPaneManager registration takes l10n ids
# only.

# The count shows at zero too, as Zotero's "{ $count } Related" and
# "{ $count } Tags" do (MJT 2026-10-23: "When no backlink, the Backlinks
# section should show 0, same as Related section"). Zero keeps its own exact
# [0] variant: Zotero copies this en-US file into every UI locale's bundle
# (xpcom/plugins.js registerLocales) and Fluent then uses THAT locale's
# plural rules -- under French, 0 is "one" and read "0 Backlink".
# The count is the paper's own; the references aimed at its parts are listed
# level by level as the header's counts list them (pane-scope.ts, 2026-10-29),
# and counted beside the title so the rows add up (MJT 2026-10-27, "Why 0
# Backlinks when 2 are shown below?"): each level by Zotero's icon, its files,
# notes and annotations apart (2026-10-29, "I would like to use icons to make
# it more compact"; pane-scope.ts _wvScopeSetCounts).
weavero-backlinks-header =
    .label = { $count ->
        [0] { $count } Backlinks
        [one] { $count } Backlink
       *[other] { $count } Backlinks
    }
weavero-backlinks-sidenav =
    .tooltiptext = Backlinks

# The Links section (outgoing references, 2026-10-27): the same shape. The
# count is the references that resolve to an item; the broken ones (an item
# gone, a group library not here) are listed greyed, never counted, and
# counted apart beside the title by their own icon, which shows or hides
# them (pane-scope.ts; MJT 2026-10-30, "Can you put a broken link icon and
# make it a toggle at the end?" -- until then the title read "· N broken").
# Its notes' and its annotations' are counted beside the title by their
# icons, which list them or not (pane-scope.ts, 2026-10-29). Named "Item
# Links" since 2026-10-30 (MJT: "Rename properly the Links column" -> the
# column and the section, as the Has Item Links filter; web links are the
# External Links column's).
weavero-links-header =
    .label = { $count ->
        [0] { $count } Item Links
        [one] { $count } Item Link
       *[other] { $count } Item Links
    }
weavero-links-sidenav =
    .tooltiptext = Item Links
