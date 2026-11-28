# Weavero's Fluent strings: every word of Weavero's interface (since the
# l10n branch, 2026-11-19), in US English, the source of the translations in
# locale/fr-FR, de, es-ES, zh-CN and it-IT. A new or changed message goes into those
# five files too (test/l10n-locales.spec.js). Zotero registers every
# `locale/<locale>/*.ftl` of a plugin at startup (xpcom/plugins.js
# registerLocales), this file for every Zotero locale without a translation.
# A main window links the file with MozXULElement.insertFTLIfNeeded(
# "weavero.ftl") (the wiring table's `backlinks-ftl` entry); the Settings pane
# links it from its own markup. First file: the item-pane Backlinks section
# (issue #60), whose ItemPaneManager registration takes l10n ids only; then the
# Settings pane (localisation slice 1, 2026-11-11) and the menus (slice 2).

# The count shows at zero too, as Zotero's "{ $count } Related" and
# "{ $count } Tags" do (MJT 2026-10-23: "When no backlink, the Backlinks
# section should show 0, same as Related section"). Zero keeps its own exact
# [0] variant: Zotero serves this en-US file to every UI locale Weavero does
# not translate (xpcom/plugins.js registerLocales) and Fluent then uses THAT
# locale's plural rules -- under such a locale 0 may be "one" ("0 Backlink",
# as French read it before fr-FR had its own file).
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

# The Settings pane (src/prefs.html). Zotero mounts the pane into the
# Settings window and translates it (preferences.js _loadPane ->
# document.l10n.translateFragment); the pane links this file itself (its
# <linkset>, as Zotero's own panes do). prefs.html carries only the ids,
# spelled weavero-pref-<section>-<what>.
# A checkbox's message gives every attribute it shows: Fluent REMOVES a
# localizable attribute (a tooltip, an aria-label) that the message lacks.
# <span data-l10n-name="mono"> (and mono2) is a path, scheme or code
# sample in a monospace font: keep it, and translate around it.
#
# The section strip at the top of the pane, and the pane's opening line.
weavero-pref-nav-links = Links & Relations
weavero-pref-nav-filters = Sort & Filters
weavero-pref-nav-bookmarks = Bookmarks
weavero-pref-nav-tabs = Tabs & Windows
weavero-pref-nav-extras = Extras
weavero-pref-intro = Clickable links in comments and notes, filters in the items list and tabs, bookmarks, and items-tree columns. Most features are on by default; turn off whatever you don’t use.

# Links & Relations: the section header, its master switch (spoken only,
# hence .aria-label) and what the section covers.
weavero-pref-links-title = Links & Relations
weavero-pref-links-enable =
    .aria-label = Enable links and relations
weavero-pref-links-desc = In-text support for clickable URIs and markdown, icons to identify and reach related items, and right-click utilities to copy Zotero links and add related items.

# Links & Relations: how links and markdown render, and which kinds show.
weavero-pref-links-mode-title = Display Mode
weavero-pref-links-mode-desc = How links and markdown appear in comments and notes — <strong>Inline</strong> renders fully; <strong>Icon &amp; popup</strong> keeps text plain and opens a popup (lighter).
weavero-pref-links-mode-inline =
    .label = Inline
weavero-pref-links-mode-icon =
    .label = Icon & popup
weavero-pref-links-show = Show:
weavero-pref-links-show-urls =
    .label = URLs
weavero-pref-links-show-zotero =
    .label = Zotero links
weavero-pref-links-show-app =
    .label = App links
weavero-pref-links-show-markdown =
    .label = Markdown
weavero-pref-links-markdown-desc = Markdown: <strong>**bold**</strong>, <em>*italic*</em>, ~~strike~~, <span data-l10n-name="mono">`code`</span>, <span data-l10n-name="mono2">[label](url)</span>. App-link schemes are picked just below.

# App link schemes (a collapsible list). The labels are the schemes
# themselves -- not translated; the tooltips say what each one opens.
weavero-pref-links-schemes-title = App Link Schemes
weavero-pref-links-schemes-desc = Which schemes Weavero recognizes as app links in comments. Active only when <strong>App links</strong> is on above.
weavero-pref-links-schemes-no-confirm =
    .label = Open without confirmation dialog
weavero-pref-links-schemes-no-confirm-desc = Skip Firefox’s “Allow this site to open the … link?” prompt for the enabled schemes.
weavero-pref-links-scheme-magnet =
    .label = magnet:
    .tooltiptext = Torrent magnet links
weavero-pref-links-scheme-mailto =
    .label = mailto:
    .tooltiptext = Email addresses
weavero-pref-links-scheme-skype =
    .label = skype:
    .tooltiptext = Skype calls / chats
weavero-pref-links-scheme-sms =
    .label = sms:
    .tooltiptext = SMS messages
weavero-pref-links-scheme-spotify =
    .label = spotify:
    .tooltiptext = Spotify tracks / playlists
weavero-pref-links-scheme-tel =
    .label = tel:
    .tooltiptext = Phone numbers
weavero-pref-links-scheme-discord =
    .label = discord://
    .tooltiptext = Discord servers
weavero-pref-links-scheme-evernote =
    .label = evernote://
    .tooltiptext = Evernote notes
weavero-pref-links-scheme-figma =
    .label = figma://
    .tooltiptext = Figma files
weavero-pref-links-scheme-file =
    .label = file://
    .tooltiptext = Local files (asks before opening)
# file:// links to a file on another computer (a network share): refused
# unless this is on.
weavero-pref-links-remote-file =
    .label = Allow links to files on other computers (network shares)
weavero-pref-links-remote-file-desc = Each link asks once before it opens; Weavero remembers the links you open. Turning this off forgets them.
weavero-pref-links-scheme-ftp =
    .label = ftp://
    .tooltiptext = FTP servers
weavero-pref-links-scheme-msteams =
    .label = msteams://
    .tooltiptext = Microsoft Teams
weavero-pref-links-scheme-notion =
    .label = notion://
    .tooltiptext = Notion pages
weavero-pref-links-scheme-obsidian =
    .label = obsidian://
    .tooltiptext = Obsidian notes
weavero-pref-links-scheme-slack =
    .label = slack://
    .tooltiptext = Slack channels
weavero-pref-links-scheme-vscode =
    .label = vscode://
    .tooltiptext = VS Code workspaces / files
weavero-pref-links-scheme-zoom =
    .label = zoommtg://
    .tooltiptext = Zoom meetings

# Links & Relations: the badges over annotations, the surfaces links and
# markdown apply to, and where Ctrl/Shift+click sends an internal link.
weavero-pref-links-view-icons =
    .label = Icons over annotations in the Document view
weavero-pref-links-view-icons-desc = Link / related-item badges drawn on the page over annotations that have a link or related items. Uncheck to keep the document free of overlays.
weavero-pref-links-apply-title = Apply To
weavero-pref-links-apply-library = Library:
weavero-pref-links-apply-items-list =
    .label = Items List
weavero-pref-links-apply-annotations-panel =
    .label = Annotations Panel
weavero-pref-links-apply-reader = Reader:
weavero-pref-links-apply-reader-sidebar =
    .label = Sidebar
weavero-pref-links-apply-document-view =
    .label = Document View
weavero-pref-links-apply-notes = Notes:
weavero-pref-links-apply-note-editor =
    .label = Editor
    .tooltiptext = Links & markdown in the note editor
weavero-pref-links-apply-notes-pane =
    .label = Notes Pane
    .tooltiptext = Links in the context notes list (All Notes)
weavero-pref-links-apply-notes-list =
    .label = Items List
    .tooltiptext = Links in note-item titles in the items list
weavero-pref-links-apply-desc = Surfaces where Weavero renders annotation links & markdown.
weavero-pref-links-internal-title = Internal-Link Navigation
weavero-pref-links-internal-desc = <strong>Ctrl/Cmd+click</strong> an internal link (figure, equation, citation) to send its target to a split pane; <strong>Shift+click</strong> sends it to a separate window. When no split is open yet, create a:
weavero-pref-links-internal-horizontal =
    .label = Horizontal split
weavero-pref-links-internal-vertical =
    .label = Vertical split

# URI utilities: the copy-link entries of the right-click menus.
weavero-pref-uri-title = URI Utilities
weavero-pref-uri-enable =
    .aria-label = Enable URI utilities
weavero-pref-uri-desc = Right-click items that copy <span data-l10n-name="mono">zotero://</span> deep links to the clipboard.
weavero-pref-uri-copy-item =
    .label = “Copy Select Link” / “Copy Open Link” in the item menus
weavero-pref-uri-copy-item-desc = Copies a <span data-l10n-name="mono">zotero://select/…</span> link that navigates to the item.
weavero-pref-uri-copy-collection =
    .label = “Copy Collection Link” / “Copy Saved Search Link”
weavero-pref-uri-copy-collection-desc = Adds a copy-link entry to the collections-tree right-click menu.

# Relations & linked items: related items, Backlinks and Item Links.
weavero-pref-relations-title = Relations & Linked Items
weavero-pref-relations-enable =
    .aria-label = Enable relations and linked-items features
weavero-pref-relations-desc = Features built on Zotero’s related-items relations and the linked-items mechanism.
weavero-pref-relations-add-related =
    .label = “Add Related…” in the items-list menu
weavero-pref-relations-add-related-desc = Opens the select-items dialog and links the chosen items as related peers (multi-annotation aware).
weavero-pref-relations-chain-badge =
    .label = Chain badge on annotation rows with related items
weavero-pref-relations-chain-badge-desc = A chain icon next to annotations that have related items; click it for the list.
weavero-pref-relations-backlinks =
    .label = “Backlinks” section in the item pane
weavero-pref-relations-backlinks-desc = What links here: the annotation comments and notes that carry a Zotero link (zotero://) or a note citation of the selected item, grouped by their item, with the text around the link. Also in the reader’s and note tabs’ context pane, and the “Has Backlinks” filter.
weavero-pref-relations-item-links =
    .label = “Item Links” section in the item pane
weavero-pref-relations-item-links-desc = Where the selected item links out: the Zotero links (zotero://) and note citations (the citations and annotations Zotero’s note editor adds to a note) written in its notes and annotation comments, grouped by the note or annotation that carries them, with the text around each. A link whose item is gone, or whose group library is not in this profile, is listed grayed and not counted. Also in the reader’s and note tabs’ context pane, and the card shown when the pointer rests on a Zotero link or a note citation in a note, an annotation comment or the items list.
weavero-pref-relations-children-scope =
    .label = Count and list the children’s tags and related items in the Tags and Related sections
weavero-pref-relations-children-scope-desc = Beside the Tags and Related section titles, how many the item has itself and how many its attachments, notes and annotations have. Click a count to show only those, Alt+click to hide them; a child’s tags or related items are listed under the item’s own, under a heading for that child. Off, the two sections are as Zotero draws them.
weavero-pref-relations-references =
    .label = Mark the references you have in a PDF’s citation popups
weavero-pref-relations-references-desc = When you hover over an in-text citation, Zotero lists the references it points to. Each reference that is an item in one of your libraries gets a mark — ● with a PDF, ○ without — and buttons to open its PDF in a new tab, in a new window, or beside the paper you are reading (split view: that paper is locked on its side). ⋯ shows it in the library, opens its copy in another library, or copies its link. References are found by DOI, title, or volume and first page, in this computer’s libraries only: nothing goes online, and nothing is changed in your libraries.
weavero-pref-relations-references-marks =
    .label = Mark the entries of the reference list
weavero-pref-relations-references-marks-desc = A small mark in the margin beside each entry of the paper’s reference list that you have; click it to open the reference, show it in the library or copy its link. Not shown in Reading Mode.
weavero-pref-relations-references-section =
    .label = “References” section in the reader’s item pane
weavero-pref-relations-references-section-desc = The paper’s reference list, in document order, with the same marks and buttons, and how many of its references you have; show all of it or only what you have. Click a reference to see it in the PDF.
weavero-pref-relations-references-citedby =
    .label = “Cited by” section in the item pane
weavero-pref-relations-references-citedby-desc = The papers of your libraries whose reference lists cite the item, with how many there are. Weavero reads your PDFs’ reference lists in the background, from what Zotero keeps beside each PDF (its full-text index, and the structure of the PDFs you opened in Zotero’s reader). Click a paper to open it at its reference to the item. Nothing goes through the Internet and nothing is changed in your libraries.
# Build Zotero's structure data for all PDFs (modules/sdt-build.ts, citations M5):
# the option, the warning shown before it goes on (its figures counted from the
# library: $count PDFs; $time and $disk are -dur / -size below), the status line in
# Settings ($left is a -dur-one) and its buttons. $unit is minutes / hours / days,
# MB / GB (the words are chosen here).
weavero-pref-relations-references-sdt-build =
    .label = Build Zotero’s structure data for all PDFs
weavero-pref-relations-references-sdt-build-desc = Zotero builds a PDF’s structure data, its reference list included, when you open the PDF in its reader. This has Zotero build it for every PDF of your libraries in the background, one at a time, the most recently added first, so that References and Cited by read the precise lists. It runs only while you are not using the computer, and what you open never waits for it. Off by default: on a large library it takes hours of work, spread over the times you are away, and some disk space, which you see before it starts.
weavero-sdt-build-warn-title = Build the structure data of all your PDFs?
weavero-sdt-build-warn-intro =
    { $count ->
        [0] Every PDF of your libraries has its structure data already. Zotero will build it for the PDFs you add, one at a time.
        [1] Zotero will build the structure data of { $count } PDF that has none yet, as if you opened it once in Zotero’s reader.
       *[other] Zotero will build the structure data of the { $count } PDFs that have none yet, as if you opened each of them once in Zotero’s reader: one at a time, the most recently added first.
    }
weavero-sdt-build-warn-time = Time: about { $time } of background work. It runs only while you are not using the computer (no keyboard or mouse use for a minute), so it is spread over those times; one processor core is busy while it runs. What you open in Zotero never waits for it. It goes on after a restart.
weavero-sdt-build-warn-disk = Disk: about { $disk } more, in a file beside each PDF.
weavero-sdt-build-warn-sync = Nothing is synced or uploaded: each computer builds its own.
weavero-sdt-build-warn-cache = It is Zotero’s own cache (.zotero-sdt-cache), the same as opening every PDF once. The files can be deleted at any time; Zotero builds one again when it opens that PDF.
weavero-sdt-build-warn-ok = Build
weavero-sdt-build-dur =
    { $unit ->
        [minutes] { $lo }–{ $hi } minutes
        [days] { $lo }–{ $hi } days
       *[hours] { $lo }–{ $hi } hours
    }
weavero-sdt-build-dur-one =
    { $unit ->
        [minutes] { $n ->
            [0] { $n } minutes
            [one] { $n } minute
           *[other] { $n } minutes
        }
        [days] { $n ->
            [0] { $n } days
            [one] { $n } day
           *[other] { $n } days
        }
       *[hours] { $n ->
            [0] { $n } hours
            [one] { $n } hour
           *[other] { $n } hours
        }
    }
weavero-sdt-build-size =
    { $lo }–{ $hi } { $unit ->
        [GB] GB
       *[MB] MB
    }
weavero-sdt-build-size-one =
    { $n } { $unit ->
        [GB] GB
       *[MB] MB
    }
weavero-sdt-build-status-counting = Counting your PDFs: { $done } of { $total }…
weavero-sdt-build-status-run =
    { $wait ->
        [reader] Waiting while a PDF opens: { $done } of { $total } PDFs, about { $left } left.
        [busy] Waiting while Zotero reads another PDF: { $done } of { $total } PDFs, about { $left } left.
        [memory] Waiting while memory is low: { $done } of { $total } PDFs, about { $left } left.
        [active] Waiting while you use the computer: { $done } of { $total } PDFs, about { $left } left.
       *[none] Building: { $done } of { $total } PDFs, about { $left } left.
    }
weavero-sdt-build-status-start = Waiting to start.
weavero-sdt-build-status-paused = Paused.
weavero-sdt-build-status-done =
    { $failed ->
        [0] Done: every PDF has its structure data.
       *[other] Done: every PDF has its structure data but { $failed }, which Zotero could not read.
    }
weavero-sdt-build-status-zotero = Zotero builds the structure data of your PDFs itself.
weavero-sdt-build-pause = Pause
weavero-sdt-build-resume = Resume
weavero-sdt-build-stop = Stop
# Remove Built Data (modules/sdt-build.ts, MJT 2026-11-24): the Settings block right after
# the build option -- its description, the line with what the built data takes
# ($size is a weavero-sdt-build-size-one; $count the documents whose structure data
# Zotero keeps; $index "yes" when the Cited by index has files), the button, the
# progress ($done of $total documents looked at), the report ($failed files could not
# be removed) -- and the confirmation's title, text and button.
weavero-pref-relations-references-sdt-clean-desc = The structure data Zotero keeps beside your documents and the caches Weavero builds from your libraries, the Cited by index among them, take disk space. Removing them loses nothing: they are built again when needed. Your own data stays as it is.
weavero-sdt-clean-measuring = Measuring the built data…
weavero-sdt-clean-size =
    { $index ->
        [yes] { $count ->
            [0] Built data: { $size }, the Cited by index.
            [1] Built data: { $size }, the structure data of { $count } document and the Cited by index.
           *[other] Built data: { $size }, the structure data of { $count } documents and the Cited by index.
        }
       *[no] { $count ->
            [0] Built data: { $size }.
            [1] Built data: { $size }, the structure data of { $count } document.
           *[other] Built data: { $size }, the structure data of { $count } documents.
        }
    }
weavero-sdt-clean-button = Remove Built Data…
weavero-sdt-clean-running = Removing the built data: { $done } of { $total } documents…
weavero-sdt-clean-done =
    { $count ->
        [0] Removed { $size } of built data.
        [1] Removed { $size } of built data, the structure data of { $count } document included.
       *[other] Removed { $size } of built data, the structure data of { $count } documents included.
    }
weavero-sdt-clean-done-failed =
    { $failed ->
        [1] Removed { $size } of built data. { $failed } file could not be removed: another program may be using it. Try again later.
       *[other] Removed { $size } of built data. { $failed } files could not be removed: another program may be using them. Try again later.
    }
weavero-sdt-clean-warn-title = Remove the built data?
weavero-sdt-clean-warn-intro =
    { $count ->
        [0] { $size } of data built from your libraries will be removed: Weavero’s caches, the Cited by index included.
        [1] { $size } of data built from your libraries will be removed: the structure data of { $count } document (Zotero’s own .zotero-sdt-cache file) and Weavero’s caches built from it, the Cited by index included.
       *[other] { $size } of data built from your libraries will be removed: the structure data of { $count } documents (Zotero’s own .zotero-sdt-cache files) and Weavero’s caches built from them, the Cited by index included.
    }
weavero-sdt-clean-warn-back = Nothing is lost: Zotero builds a document’s structure data again when you open it in its reader, or for every PDF with “Build Zotero’s structure data for all PDFs”, and Cited by builds its index again in the background.
weavero-sdt-clean-warn-off = “Build Zotero’s structure data for all PDFs” is turned off.
weavero-sdt-clean-warn-kept = Your own data stays as it is: the outlines you edited, bookmarks, tab groups and sessions, Researchers, and the Feeds settings.
weavero-sdt-clean-warn-ok = Remove
weavero-pref-relations-open-related =
    .label = “Open Related Item” submenu in the reader
weavero-pref-relations-open-related-desc = Open in Reader / In New Window entries for each related item, in the annotation context menu.
weavero-pref-relations-libraries-tint =
    .label = Tint linked-libraries rows in the item pane
weavero-pref-relations-libraries-tint-desc = Highlights the displayed item’s library row in the Libraries and Collections section.

# Sort & Filters.
weavero-pref-filters-title = Sort & Filters
weavero-pref-filters-enable =
    .aria-label = Enable sort and filters
weavero-pref-filters-desc = Controls that order, hide, dim or scope the visible set — annotation sorting in the reader, the items-tree filter pane (the toolbar ▾ button) and the per-library / file-type filters in the tabs menu.
weavero-pref-filters-ann-sort =
    .label = Annotation sorting in the reader
weavero-pref-filters-ann-sort-desc = Sort the reader’s Annotations sidebar by position, date added or date modified — right-click the Annotations tab header for the menu; a one-click sort bar appears while a date sort is active, and the cards then show both dates, the sorted one first.
weavero-pref-filters-card-date-added =
    .label = Show Date Added on annotation cards
weavero-pref-filters-card-date-modified =
    .label = Show Date Modified on annotation cards
weavero-pref-filters-card-dates-desc = Dates at the bottom of each card in the reader’s Annotations sidebar, whatever the sort; hover one for both dates in full. Right-click the Annotations tab header in a reader to choose for that document only. Annotations imported from a PDF made in another program carry the date Zotero imported them.
weavero-pref-filters-items-tree =
    .label = Items-tree filter pane
weavero-pref-filters-items-tree-desc = The toolbar ▾ button next to the search box, plus the filter popup (color/type/file-type, tags, authors, collections, saved searches).
weavero-pref-filters-read-status =
    .label = Read Status filter (Zotero Reading List)
weavero-pref-filters-read-status-desc = Adds a Read Status toggle row to the items-tree filter popup when the Zotero Reading List plugin is installed — filter by ⭐ New / 📙 To Read / 📖 In Progress / 📗 Read / … (Alt+click to exclude).
weavero-pref-filters-item-count =
    .label = Detailed item count
weavero-pref-filters-item-count-desc = Replaces the item pane’s “N items in this view” with a breakdown — items · attachments · notes · annotations — so it is clear what the number counts and why it changes when you expand a row. While a filter is active it also shows how many rows are matches and how many are only there for context. Turn off for Zotero’s single number.
weavero-pref-filters-selection-target =
    .label = Selection Target tri-state
weavero-pref-filters-selection-target-desc = Parent / Attachment / Annotation checkboxes that scope Ctrl+A and dim out-of-scope rows.
weavero-pref-filters-collapse-advanced =
    .label = Collapse Advanced Search back to Quick Search
weavero-pref-filters-collapse-advanced-desc = Zotero’s collapse button hides the Advanced Search editor but keeps its filter applied, leaving only an “Advanced Search” label. With this on, collapsing instead returns to the Quick Search box showing the same query — the natural inverse of expanding it with the funnel button — whenever the search is one Quick Search can express (plain words in Title/Creator/Year, All Fields & Tags or Everything). A search using anything else, such as a creator or date condition, still collapses the way Zotero does. The close ✕ always clears and closes.
weavero-pref-filters-tabs-library =
    .label = Tabs menu per-library filter
weavero-pref-filters-tabs-library-desc = A checkbox next to each library header in the “List all tabs” popup, hiding those tabs.
weavero-pref-filters-tabs-file-type =
    .label = Tabs menu file-type filter
weavero-pref-filters-tabs-file-type-desc = The funnel button in the “List all tabs” popup for a per-attachment-kind filter.

# Bookmarks: the library's and the documents'.
weavero-pref-bookmarks-title = Bookmarks
weavero-pref-bookmarks-enable =
    .aria-label = Enable bookmarks
weavero-pref-bookmarks-desc = Bookmarks across two scopes — a dropdown on the collections-pane toolbar for items / collections / searches, and a tab in the reader sidebar for in-document locations.
weavero-pref-bookmarks-sync-note = Bookmarks don’t sync across computers yet — they’re stored locally in <span data-l10n-name="mono">&lt;Zotero data dir&gt;/weavero/bookmarks.json</span>. (Will switch to Zotero’s plugin-managed synced storage once it ships.)
weavero-pref-bookmarks-library =
    .label = Library bookmarks
weavero-pref-bookmarks-library-desc = A Bookmarks dropdown on the collections-pane toolbar for items / collections / saved searches.
weavero-pref-bookmarks-library-autohide =
    .label = Auto-hide the library bookmarks button when empty
weavero-pref-bookmarks-collection-scroll-title = Where a Bookmarked Collection Appears
weavero-pref-bookmarks-collection-scroll-desc = When a bookmark opens a collection, library or saved search, the collections pane scrolls it to:
weavero-pref-bookmarks-collection-scroll-top =
    .label = The top of the pane (default)
weavero-pref-bookmarks-collection-scroll-native =
    .label = Zotero’s own behavior: scroll only as far as needed
weavero-pref-bookmarks-document =
    .label = Document bookmarks
weavero-pref-bookmarks-document-desc = A Bookmarks tab in the reader sidebar for in-document locations. Drop an annotation or selection on it to bookmark.
weavero-pref-bookmarks-document-autohide =
    .label = Auto-hide the document bookmarks tab when empty
weavero-pref-bookmarks-library-in-reader =
    .label = Show Library bookmarks tab in the reader
weavero-pref-bookmarks-library-in-reader-desc = Browse library bookmarks alongside in-document ones (Ctrl-click to merge both views).
weavero-pref-bookmarks-page-numbers =
    .label = Show page numbers next to document bookmarks
weavero-pref-bookmarks-page-numbers-desc = The “p. N” label at the right of each bookmark. Right-click the Bookmarks tab in a reader to show or hide them for that document only. The hover card still shows the page.

# Tabs & Windows. -windows-only shows under the two Windows-only settings
# on other systems.
weavero-pref-tabs-title = Tabs & Windows
weavero-pref-tabs-enable =
    .aria-label = Enable tabs and windows features
weavero-pref-tabs-desc = Tab groups, browser-style window chrome, multiple main windows, and an item pane in separate reader windows.
# The same on a Zotero with its own windows, where Weavero's reader and note windows never open.
weavero-pref-tabs-desc-native = Tab groups, browser-style window chrome, and tools for working in several windows.
weavero-pref-tabs-groups =
    .label = Tab groups in the tab bar
weavero-pref-tabs-groups-desc = Group tabs Firefox-style: right-click a tab → “Add to Tab Group…” for a named, colored group. Click the group’s chip to collapse or expand it; right-click the chip to rename, recolor, ungroup or close the group. Groups persist across restarts.
weavero-pref-tabs-split-view =
    .label = Split view
weavero-pref-tabs-split-view-desc = Show two tabs side by side, Firefox-style: right-click a tab → “Add Split View”, or select two tabs and choose “Open in Split View”. In the items list, “Open PDF in Split View” opens it beside the library; links in notes and comments offer “Open Link in Split View”. Drag the bar between the two to resize. Splits persist across restarts.
# A tab locked on one side (tab-split-dock.ts): no setting of its own, it is
# turned on per window from any tab's menu.
weavero-pref-tabs-split-dock-desc = To keep a tab in view, right-click it → “Lock Tab”: it moves to the left side of the window, and the right side shows whichever tab you select (lock the library, and an item you open from it opens beside it). The locked tab is framed in gold, with a padlock on its icon; while you are on it, the tab shown beside it is shaded. Click the locked tab to collapse its side, leaving the window to the tab you are on; click it again to bring it back. To unlock it, right-click it → “Unlock Tab”.
weavero-pref-tabs-split-footer =
    .label = Show a label on each side whose item pane is closed
weavero-pref-tabs-split-footer-desc = In a split view, a side with its item pane closed shows its tab’s icon and title in its bottom corner, with a menu for the split (separate the tabs, reverse them, close both). Opening that side’s item pane hides the label: the pane’s header names the item.
weavero-pref-tabs-library-pin-name =
    .label = Show the library tab’s name when it is pinned
weavero-pref-tabs-library-pin-name-desc = A pinned My Library (or group library) tab shows its icon and its name, as wide as the name needs, rather than the icon alone. This option is the default for every library tab; “Show Tab Name” in a pinned tab’s right-click menu shows or hides that tab’s name alone, and the tab’s own choice wins over this option.
weavero-pref-tabs-sessions =
    .label = Tab sessions
weavero-pref-tabs-sessions-desc = Save and switch between named sets of tabs from the “List all tabs” popup. Your current tabs are always the current session; “+ New session” opens a fresh workspace, and switching is one click. Turn this off to hide the Sessions UI and freeze your saved sessions — they stay dormant (never overwritten) and reappear when you re-enable it.
weavero-pref-tabs-window-icons =
    .label = Per-window taskbar icons (Windows)
weavero-pref-tabs-window-icons-desc = Give each extra window its own icon — Zotero’s icon with a colored square badge for main windows and a colored round badge for reader windows (the primary window keeps the plain icon) — so taskbar previews, Task View and Alt+Tab tell the windows apart at a glance, the same way Chrome badges its profile windows. Windows only.
# The same on a Zotero with its own windows, where Weavero's reader and note windows never open.
weavero-pref-tabs-window-icons-desc-native = Give each extra window its own icon — Zotero’s icon with a colored square badge (the primary window keeps the plain icon) — so taskbar previews, Task View and Alt+Tab tell the windows apart at a glance, the same way Chrome badges its profile windows. Windows only.
weavero-pref-tabs-windows-only = Windows only — has no effect on this system.
weavero-pref-tabs-taskbar-buttons =
    .label = Separate taskbar button per window (Windows)
weavero-pref-tabs-taskbar-buttons-desc = Give every extra window (main and reader) its own taskbar button with its badge icon, shown on the monitor where the window is — instead of grouping all windows behind one Zotero button. Note: split windows leave the shared preview flyout. Off by default.
# The same on a Zotero with its own windows, where Weavero's reader and note windows never open.
weavero-pref-tabs-taskbar-buttons-desc-native = Give every extra window its own taskbar button with its badge icon, shown on the monitor where the window is — instead of grouping all windows behind one Zotero button. Note: split windows leave the shared preview flyout. Off by default.
weavero-pref-tabs-progress-window =
    .label = Minimize and maximize buttons on the Find Full Text window
weavero-pref-tabs-progress-window-desc = The progress window of Find Full Text and Retrieve Metadata gets minimize and maximize buttons on its title bar, and its Minimize button minimizes it instead of closing it. The work goes on either way. On by default.
weavero-pref-tabs-title-glyphs =
    .label = Window-type glyph in window titles
weavero-pref-tabs-title-glyphs-desc = Alternative for non-Windows platforms (off by default): prefix each window’s title with a small type mark — ⚓ for the primary window, squares (■ □ ▣) for other main windows, circles (● ○ ◉) for reader windows. Takes effect as titles refresh, e.g. on the next tab switch.
# The same on a Zotero with its own windows, where Weavero's reader and note windows never open.
weavero-pref-tabs-title-glyphs-desc-native = Alternative for non-Windows platforms (off by default): prefix each window’s title with a small type mark — ⚓ for the primary window, squares (■ □ ▣) for the other windows. Takes effect as titles refresh, e.g. on the next tab switch.
weavero-pref-tabs-window-name-title = Window Name in the Window Title
weavero-pref-tabs-window-name-desc = Show a renamed window’s name in its OS title — taskbar previews, Alt+Tab and Task View — like Chrome’s “Name window”. <strong>Before the title</strong> keeps the page context (“Main — Azam et al.”); <strong>Replace the title</strong> shows the name alone. Windows without a custom name always keep the normal title.
weavero-pref-tabs-window-name-off =
    .label = Off
weavero-pref-tabs-window-name-prefix =
    .label = Before the title
weavero-pref-tabs-window-name-replace =
    .label = Replace the title

# Hide Title Bar (Tabs & Windows): the browser-style title bar and the windows it applies to.
weavero-pref-titlebar-title = Hide Title Bar
weavero-pref-titlebar-enable =
    .aria-label = Hide title bar (Firefox-style)
weavero-pref-titlebar-desc = Replace the title bar with a browser-style bar — menus move out of the way (press Alt) and the window buttons move into the tab strip. Windows / Linux only.
weavero-pref-titlebar-apply = Apply to:
weavero-pref-titlebar-main =
    .label = Main window
weavero-pref-titlebar-reader =
    .label = Reader window
weavero-pref-titlebar-note =
    .label = Note window
weavero-pref-titlebar-plugins-manager =
    .label = Plugins Manager
weavero-pref-titlebar-note-deck =
    .label = Open notes in a tab-hosting window
weavero-pref-titlebar-note-deck-desc = Opening a note in a new window uses a reader-style window that can accept dragged-in PDF / note tabs. Needs the reader window’s title bar replaced above. A standalone note (no parent) briefly shows a placeholder document as the window opens.

# Multiple main windows (Tabs & Windows). -native-note shows only on a
# Zotero that has its own windows and library tabs (zotero#6035).
weavero-pref-mainwin-title = Multiple Main Windows
weavero-pref-mainwin-native-note = This version of Zotero has its own windows and library tabs, so it opens, moves and restores them itself, and the options that belong to Weavero’s own extra windows are off here. Saved windows, tab sessions and the Advanced Search window work as ever.
weavero-pref-mainwin-enable =
    .label = Open new main windows
weavero-pref-mainwin-enable-desc = An independent second main window with its own tabs, columns, filters and pane widths: Ctrl+N / ⌘N, <em>File → New Main Window</em>, the <em>New Window</em> entries of the tab and item menus, and Advanced Search in a new window. Off, none of these opens one.
weavero-pref-mainwin-restore =
    .label = Restore extra windows on restart
weavero-pref-mainwin-restore-desc = Reopen the extra windows you had open when Zotero restarts.
weavero-pref-mainwin-adv-shortcut =
    .label = Ctrl+Shift+F / ⇧⌘F opens Advanced Search in a new window
weavero-pref-mainwin-adv-shortcut-desc = Zotero’s Advanced Search shortcut opens the search in this window. With this on it opens a new window on the current collection instead — the same as Shift+click on the funnel or <em>Edit → Advanced Search in New Window</em>. Zotero 10.
weavero-pref-mainwin-adv-hide-panes =
    .label = Hide the side panes in the Advanced Search window
weavero-pref-mainwin-adv-hide-panes-desc = The window opens with the search and its results only — no collections pane, no item pane — like the separate Advanced Search window of Zotero 9. <em>View → Layout</em> brings a pane back in that window.

# Item pane in separate reader windows (Tabs & Windows).
weavero-pref-reader-pane-title = Item Pane in Separate Reader Windows
weavero-pref-reader-pane-enable =
    .label = Show an item pane beside the reader in separate windows
weavero-pref-reader-pane-desc = Adds the item info / context pane (sections, sidenav) to standalone reader windows, like the main window’s right pane.

# Extras: the section header.
weavero-pref-extras-title = Extras
weavero-pref-extras-enable =
    .aria-label = Enable visual extras
weavero-pref-extras-desc = Smaller informational displays attached to existing Zotero UI — items-list badges, items-tree columns and tab-strip glyphs.

# Extras: the items-tree columns.
weavero-pref-columns-title = Items-Tree Columns
weavero-pref-columns-desc = Extra columns, hidden until you enable them from the column picker (right-click the items-tree header).
weavero-pref-columns-annotations =
    .label = “Annotations” column
weavero-pref-columns-annotations-desc = Count of annotations on attachments (summed across attachments on regular items).
weavero-pref-columns-tags-auto =
    .label = “Tags” column — add the automatic-tag count
weavero-pref-columns-tags-auto-desc = Shows manual tags (blue) and automatic tags. Uncheck to show only the manual count. This is the default for every window: a window can choose for itself from the column header’s right-click menu (Tags › Automatic-Tag Count).
weavero-pref-columns-related =
    .label = “Related” column
weavero-pref-columns-related-desc = Count of related items per row.
weavero-pref-columns-backlinks =
    .label = “Backlinks” column
weavero-pref-columns-backlinks-desc = Count of annotation comments and notes elsewhere that link to the item, its attachments, notes or annotations.
weavero-pref-columns-item-links =
    .label = “Item Links” column
weavero-pref-columns-item-links-desc = Count of the Zotero items that the row’s notes and annotation comments link to by Zotero links or note citations (a broken link is listed, not counted).
weavero-pref-columns-ext-links =
    .label = “External Links” column
weavero-pref-columns-ext-links-desc = Count of the web and app links written in the row’s notes and annotation comments (each link once; a zotero:// link is Item Links’). Click the number for the list.

# Extras: the items list and the tabs. The title-lines row reads
# "<lead> [number box] <unit>": the box sits between two messages because
# Fluent drops an input inside a translated element (measured 2026-11-11).
# prefs.js sets the lead's $mode from the radios ("fixed" for Fixed
# height) and the unit's $count from the box.
weavero-pref-itemslist-title = Items List & Tabs
weavero-pref-itemslist-title-lines = Titles in the items list
weavero-pref-itemslist-title-lines-off =
    .label = One line
weavero-pref-itemslist-title-lines-fixed =
    .label = Fixed height
weavero-pref-itemslist-title-lines-adaptive =
    .label = Fit each title
weavero-pref-itemslist-title-lines-lead = { $mode ->
        [fixed] Height of
       *[other] Up to
    }
weavero-pref-itemslist-title-lines-unit = { $count ->
        [0] lines
        [one] line
       *[other] lines
    }
weavero-pref-itemslist-title-lines-desc = Fixed height makes every row as tall as this many lines of text. Fit each title makes each row as tall as its title needs, up to this many lines. The other text columns wrap inside that height, and everything sits at the top of the row. Longer text ends in an ellipsis, and child rows stay on one line.
weavero-pref-itemslist-added-by =
    .label = Show Added By for annotations
weavero-pref-itemslist-added-by-desc = In group libraries, a badge with the annotation’s creator next to its row.
weavero-pref-itemslist-added-by-colors =
    .label = Use a different color per user in Added By
weavero-pref-itemslist-added-by-colors-desc = Tint the Added By text and badge with a per-user color. Uncheck for the default text color.
weavero-pref-itemslist-group-glyph =
    .label = Group-library glyph + tooltip on tabs
weavero-pref-itemslist-group-glyph-desc = A cluster glyph on the file-type icon of tabs whose item is in a group library, plus a richer tooltip.
weavero-pref-itemslist-tab-ring =
    .label = Firefox-style tabs: rounded, with an outline on the selected tab
weavero-pref-itemslist-tab-ring-desc = Pill-shaped tabs, and a thin violet-to-orange outline around the selected tab, like Firefox’s new tab design. Uncheck for Zotero’s own tabs: square corners and a raised selected tab.
weavero-pref-itemslist-layout-menu =
    .label = View → Layout follows the tab
weavero-pref-itemslist-layout-menu-desc = Zotero’s <em>View → Layout</em> items toggle the library’s panes whatever tab is in front. In a reader tab the submenu shows the reader’s own panes instead — <em>Sidebar</em>, <em>Context Pane</em> and the <em>Color and Tag Selector</em> at the foot of the annotations pane — with their real state as check marks; a note tab shows <em>Context Pane</em> (and <em>Outline Pane</em> with Better Notes); the library tab keeps Zotero’s items. A separate reader window gets a Layout submenu of its own. Off, the menu is Zotero’s as it is.
# The same on a Zotero with its own windows, where Weavero's reader and note windows never open.
weavero-pref-itemslist-layout-menu-desc-native = Zotero’s <em>View → Layout</em> items toggle the library’s panes whatever tab is in front. In a reader tab the submenu shows the reader’s own panes instead — <em>Sidebar</em>, <em>Context Pane</em> and the <em>Color and Tag Selector</em> at the foot of the annotations pane — with their real state as check marks; a note tab shows <em>Context Pane</em> (and <em>Outline Pane</em> with Better Notes); the library tab keeps Zotero’s items. Off, the menu is Zotero’s as it is.

# Extras: the collections pane and the item pane. The pinned-parents row
# reads "<lead> [number box] <unit>", as the title-lines row does.
weavero-pref-collections-title = Collections Pane
weavero-pref-collections-pane-toggle =
    .label = Collapse / expand button for the collections pane
weavero-pref-collections-pane-toggle-desc = A button at the left end of the toolbar, like the item pane’s and the reader’s. <em>View → Layout</em> keeps working alongside it.
weavero-pref-collections-tag-selector-handle =
    .label = Handle on the Tag Selector: click to collapse or expand it
weavero-pref-collections-tag-selector-handle-desc = A small pill on the Tag Selector’s top edge. One click folds the selector to that edge, the next brings it back; dragging the edge still resizes it. A selected tag keeps filtering the list while the selector is folded, and the pill turns blue to say so. <em>View → Layout → Tag Selector</em> shows the same state.
weavero-pref-collections-no-collapse =
    .label = Resizing a side pane stops at its minimum width
weavero-pref-collections-no-collapse-desc = Dragging the edge of a side pane stops at its narrowest width instead of snapping it shut: the collections pane, the item pane, the context pane of reader tabs and the item pane of reader windows. Collapse them with their buttons or <em>View → Layout</em>. Off, all of them snap shut as in Zotero.
# The same on a Zotero with its own windows, where Weavero's reader and note windows never open.
weavero-pref-collections-no-collapse-desc-native = Dragging the edge of a side pane stops at its narrowest width instead of snapping it shut: the collections pane, the item pane and the context pane of reader tabs. Collapse them with their buttons or <em>View → Layout</em>. Off, all of them snap shut as in Zotero.
weavero-pref-collections-sticky-parents =
    .label = Keep parent collections pinned at the top while scrolling
weavero-pref-collections-sticky-lead = Up to
weavero-pref-collections-sticky-unit = { $count ->
        [0] levels
        [one] level
       *[other] levels
    }
weavero-pref-collections-sticky-parents-desc = The parents of the collections at the top of the pane stay pinned above them, as in VS Code’s file tree. Click a pinned parent to go to it; its arrow collapses it. The two trees of the Collections and Libraries Manager pin the same way.
# Folders for saved searches (search-folders.ts): Settings.
weavero-pref-collections-search-folders =
    .label = Folders for saved searches
weavero-pref-collections-search-folders-names =
    .label = Also read folders from search names (People/Students/…)
weavero-pref-collections-search-folders-desc = Saved searches can be put into folders under their library: drag a search onto a folder, or right-click it: Move to Folder. Weavero keeps the folders on this computer; nothing changes in your library. Which folders are open is saved with each session. With the second option, a search named “A/B/C” shows as “C” in folder A › B, as with the Saved Search Folders plugin.
# The collections pane's menus for those folders.
weavero-sf-move-to =
    .label = Move to Folder
weavero-sf-unfiled =
    .label = Not in a Folder
weavero-sf-new-folder =
    .label = New Folder…
weavero-sf-new-subfolder =
    .label = New Subfolder…
weavero-sf-new-search-folder =
    .label = New Search Folder…
weavero-sf-rename-folder =
    .label = Rename Folder…
weavero-sf-move-folder =
    .label = Move Folder To
weavero-sf-top-level =
    .label = Top Level
weavero-sf-delete-folder =
    .label = Delete Folder
# The name prompt's title and text.
weavero-sf-folder-name-title = Folder for Saved Searches
weavero-sf-folder-name-prompt = Folder name:
# $name: the folder; $count: its subfolders (1 or more).
weavero-sf-delete-confirm = Delete the folder “{ $name }” and { $count ->
        [1] its subfolder
       *[other] its { $count } subfolders
    }? The saved searches in them stay in your library, outside any folder.
# A folder read from the searches' names ($path: "People / Students").
weavero-sf-name-folder = From the searches’ names: { $path }
# The Bookmarks pane above the collections tree (bookmarks-pane.ts): Settings.
weavero-pref-collections-bookmarks-pane =
    .label = Bookmarks pane above the collections
weavero-pref-collections-bookmarks-pane-desc = Your library bookmarks in a pane above the collections tree, a splitter between them. Click its header to fold it; its ⇕ button shows the bookmarks only, in place of the collections tree. Folders open in place, and items dropped on a collection’s bookmark go into that collection. Each window keeps its own layout, saved with its session. The Bookmarks button above the collections stays.
# The pane's header. $folded: "yes" when it is folded.
weavero-bmpane-fold-tip = { $folded ->
        [yes] Expand the bookmarks
       *[other] Collapse the bookmarks
    }
# The header's switch. $on: "yes" when the pane shows the bookmarks only.
weavero-bmpane-only-tip = { $on ->
        [yes] Show the collections tree again
       *[other] Bookmarks only: hide the collections tree
    }
# The pane's "Now showing" line (Bookmarks only): what the items list shows. $name: its name.
weavero-bmpane-now-tip = Now showing: { $name }. Click to show the collections tree with it.
weavero-bmpane-now-add = Bookmark it
# The dot on a closed folder holding a bookmark of what the items list shows.
weavero-bmpane-folder-current = This folder holds what is shown
# The funnel above the collections pane (coll-funnel.ts): Settings.
weavero-pref-collections-funnel =
    .label = Funnel above the collections pane
weavero-pref-collections-funnel-desc = A funnel button in the collections pane’s toolbar filters what the pane lists: collections, saved searches, feeds, the special rows (Duplicate Items, Unfiled Items, Trash…), each library, and Weavero’s own sections. Click a chip to show only it, Alt+click to hide it. Each window keeps its own filter, saved with its session; “Use as Default” in the funnel makes it the filter every window starts from.
weavero-pref-collfunnel-defaults-title = Shown by default
weavero-pref-collfunnel-show-collections =
    .label = Collections
weavero-pref-collfunnel-show-searches =
    .label = Saved searches
weavero-pref-collfunnel-show-feeds =
    .label = Feeds
weavero-pref-collfunnel-show-special =
    .label = Special rows
weavero-pref-collfunnel-show-bookmarks =
    .label = Bookmarks pane
weavero-pref-collfunnel-show-folders =
    .label = Saved-search folders
# The libraries the default leaves out. $mode: hidden, only or none; $names: the libraries.
weavero-pref-collfunnel-libs = { $mode ->
        [hidden] Libraries hidden by default: { $names }
        [only] Libraries shown by default: only { $names }
       *[none] Every library is shown by default.
    }
weavero-pref-collfunnel-libs-reset = Reset
# The funnel's button. $active: yes when it filters; $parts: what it filters.
weavero-cf-tb-tip = { $active ->
        [yes] Collections pane filter: { $parts }
       *[no] Filter the collections pane
    }
# The funnel's rows of chips.
weavero-cf-row-kinds = Kinds
weavero-cf-row-libs = Libraries
weavero-cf-row-secs = Weavero sections
weavero-cf-kind-collections = Collections
weavero-cf-kind-searches = Saved searches
weavero-cf-kind-feeds = Feeds
weavero-cf-kind-special = Special rows
weavero-cf-kind-special-tip = Duplicate Items, Unfiled Items, Recently Read, Retracted Items, My Publications and Trash
weavero-cf-sec-bookmarks = Bookmarks pane
weavero-cf-sec-folders = Saved-search folders
weavero-cf-hint = Click: show only. Alt+click: hide.
# What a row filters, in the button's tooltip. $mode: only or hide; $names: the chips.
weavero-cf-part = { $mode ->
        [only] only { $names }
       *[hide] hiding { $names }
    }
# The footer's line. $scope: window (this window's own filter) or default.
weavero-cf-scope = { $scope ->
        [window] This window’s own filter
       *[default] Following the default
    }
    .title = { $scope ->
        [window] This window departs from the default filter; Reset to Default follows it again.
       *[default] This window shows the default filter, which Use as Default changes.
    }
weavero-cf-use-default = Use as Default
    .title = Make this filter, as it stands, the one every window starts from
weavero-cf-reset-default = Reset to Default
    .title = Back to the default filter in this window
# Where the funnel leaves nothing in the tree.
weavero-cf-empty = Nothing matches the funnel.
weavero-cf-empty-clear = Clear
weavero-pref-collections-sticky-headers =
    .label = Keep section headers pinned at the top of the item pane while scrolling
weavero-pref-collections-sticky-headers-desc = Each section’s header stays pinned at the top of the item pane while its section scrolls past, the next header pushing it out; inside Item Links, Backlinks and the widened Tags and Related sections, the heading of the part whose rows are passing stays under it. A click on a pinned header still collapses its section. In the library’s item pane and the reader and note tabs’ context panes.
weavero-pref-collections-path-tooltip =
    .label = Show a collection’s full path when hovering it
weavero-pref-collections-indent-guides =
    .label = Indent guides in the collections pane
weavero-pref-collections-indent-guides-desc = A faint vertical line for each level, so sibling collections line up visually.

# Extras: the Plugins Manager.
weavero-pref-plugins-title = Plugins Manager
weavero-pref-plugins-extras =
    .label = Plugins Manager extras (search box, card details, normal window)
weavero-pref-plugins-extras-desc = Tools → Plugins gets a search box (Ctrl+F focuses it, × clears it), cards showing author [GitHub owner] · version · last updated, a normal window with minimize/maximize (with <em>Hide Title Bar → Plugins Manager</em> on, the main window’s title-bar layout; off, the system’s own title bar and menu bar), and Recent Updates always visible, with a menu on its heading for how far back it goes (last day to all; Zotero’s own stops at 2 days), remembered. The manager reopens on the Plugins list. On Zotero 11, whose manager hides its sidebar, the sidebar comes back with Plugins and Recent Updates (and Available Updates while updates are pending).

# Default attachment. "▶️ wv-defatt" is the tag a pick is stored as: it
# syncs, and searching for it lists the picks -- never translate it.
weavero-pref-defatt-title = Default Attachment
weavero-pref-defatt-enable =
    .label = Open a chosen attachment or note instead of Zotero’s automatic choice
weavero-pref-defatt-desc = Right-click any child of an item — attachment (PDF or not), linked URL, or note — and pick <b>▶️ Set as Default Attachment</b> to open that one instead of Zotero’s usual choice. The pick is stored as the tag <b>▶️ wv-defatt</b> on that child, so it syncs to your other devices and survives without Weavero. Search <b>wv-defatt</b> (or the ▶️ glyph) to list every marked item; the tag carries no ordinary words on purpose, so it never turns up in unrelated searches. Turning this off stops the override but keeps your picks.
weavero-pref-defatt-sort-default =
    .label = Show the default attachment first in the attachments list
weavero-pref-defatt-sort-auto =
    .label = Show Zotero’s automatic choice first when no default is set
weavero-pref-defatt-mark-auto =
    .label = Mark the automatic choice with a dimmed ▷ in the items list and the item pane
weavero-pref-defatt-sort-desc = With the two options above, whatever opens on double-click sits in the first row of an item’s attachments. The dimmed <b>▷</b> always shows Zotero’s own automatic choice — so you can see what would open if the chosen default were removed — while a chosen default keeps its solid <b>▶️</b> marker.
weavero-pref-defatt-import = Coming from <b>Default Attachment</b> by <b>PikaPei</b>? Your picks are imported automatically the first time Weavero starts, and that plugin’s own data is left untouched — see the README for how to remove it by hand once you are done with it.

# External viewer.
weavero-pref-ext-viewer-title = External Viewer
weavero-pref-ext-viewer-enable =
    .label = “Open in External Viewer” in the item / tab menus
weavero-pref-ext-viewer-desc = Launch an item’s best attachment with the OS default app (PDF, EPUB, snapshot, image, …). Default on.

# Undo: the reader toolbar's arrows.
weavero-pref-undo-title = Undo
weavero-pref-undo-buttons =
    .label = Undo / Redo arrows in the reader toolbar
weavero-pref-undo-buttons-desc = Two arrows after the annotation tools: click to undo or redo the latest step of the reader tab (outline, bookmarks, annotations), right-click for the history. Ctrl+Z, Ctrl+Y and Edit → Undo work either way. Default on.

# Link previews: the picture of the destination page the reader shows when the
# pointer rests on an internal link, such as a citation's [23].
weavero-pref-link-preview-title = Link Previews
weavero-pref-link-preview-entry =
    .label = Mark the whole reference in link previews
weavero-pref-link-preview-entry-desc = When the pointer rests on a citation, the preview of the reference list marks every line of the cited entry with a light red tint, in place of Zotero’s dark box on its first line. Off: Zotero’s preview as it is. Default on.

# Reader outline. Once prefs.js knows Zotero's current sizes it relabels the
# first two size choices with -size-zotero-px / -size-item-pane-px ($px,
# the size in pixels); -size-px labels each Fixed size.
weavero-pref-outline-title = Reader Outline
weavero-pref-outline-highlight =
    .label = Highlight the heading text when clicking an outline entry
weavero-pref-outline-highlight-desc = Flashes the actual heading text on click, in PDFs, EPUBs and snapshots, and in a note from its outline; for embedded PDF outlines Weavero finds the heading on the page. Best-effort matching — scanned pages or unusual fonts may just jump without a highlight.
weavero-pref-outline-page-numbers =
    .label = Show page numbers next to outline entries
weavero-pref-outline-page-numbers-desc = The “p. N” label at the right of each entry. Right-click the Outline tab in a reader to show or hide them for that document only.
weavero-pref-outline-size-title = Outline Text Size
weavero-pref-outline-size-desc = <strong>Zotero Outline</strong> and <strong>Zotero Item Pane</strong> follow <em>View → Font Size</em> (the sizes shown are the current ones); <strong>Fixed</strong> stays at the chosen size whatever the Font Size. Right-click the Outline tab in a reader to choose a size for that document only.
weavero-pref-outline-size-zotero =
    .label = Zotero Outline (default)
weavero-pref-outline-size-item-pane =
    .label = Zotero Item Pane
weavero-pref-outline-size-zotero-px =
    .label = Zotero Outline, { $px } px (default)
weavero-pref-outline-size-item-pane-px =
    .label = Zotero Item Pane, { $px } px
weavero-pref-outline-size-fixed =
    .label = Fixed:
weavero-pref-outline-size-px =
    .label = { $px } px

# Reader outline: the keyboard shortcuts for adding entries (the hints
# beside each box are written by prefs.js).
weavero-pref-outline-keys-title = Keyboard Shortcuts for Adding Entries
weavero-pref-outline-keys-desc = None is set out of the box. Click a box and press the keys you want — a single letter works too; combinations Zotero or the reader already use are refused. They work in reader tabs, never while you type in a text field, and show next to the matching menu items.
weavero-pref-outline-key-selection = Add selected text
weavero-pref-outline-key-remove = Remove
weavero-pref-outline-key-pin = Pin a spot
weavero-pref-outline-key-page-top = Top of page (PDF)
weavero-pref-outline-key-page-bottom = Bottom of page (PDF)

# Notes: the outline beside notes and the fold arrows.
weavero-pref-notes-title = Notes
weavero-pref-notes-outline =
    .label = Outline beside notes
weavero-pref-notes-outline-desc = A panel listing the note’s headings to the left of the note, with the section you are reading marked. Click a heading to go there; right-click it to copy a link to it. Open by default in note tabs and windows, folded away in the item pane and beside a reader — the sidebar button at the left end of the note’s toolbar shows or hides it. With Better Notes installed, this outline replaces its left pane in note tabs; uncheck this to get that pane back, with its mind and bubble maps.
weavero-pref-notes-folding =
    .label = Fold arrows on note headings and lists
weavero-pref-notes-folding-desc = An arrow in the margin before each heading hides everything under it, down to the next heading of the same or a higher level. An arrow before a list item, bulleted or numbered, hides everything under its first line: its sub-items and further paragraphs. <em>Fold All</em> and <em>Unfold All</em> at the end of the note’s right-click menu do the whole note at once. Only the view changes — the note itself is untouched, and anyone without Weavero sees the whole note. Folds are remembered per note on this computer. Both options need <em>Links &amp; Relations → Notes: Editor</em>.
# Notes: citations after Zotero links (note-cite.ts). The entries' names in
# <em> are the note editor's context-menu entries (weavero-menu-note-cite-*);
# "Links & Relations → Notes: Editor" names the switch it needs in this pane.
weavero-pref-notes-citations =
    .label = Citations after Zotero links in notes
weavero-pref-notes-citations-desc = Right-click a <code data-l10n-name="scheme">zotero://</code> link in a note for <em>Add Citation After Link</em>: the link stays, and Zotero’s own citation of the item follows it. A link to a PDF page cites the PDF’s parent item at that page (the printed page of an annotation on it, when there is one); a link to a highlight or underline adds its quote and citation, as when you drag the annotation into the note. <em>Add Citations After Links in Selection</em> and <em>Add Citations After All Links</em> do several at once; one Undo takes them all back. The citations are Zotero’s: they sync, and read the same without Weavero. Links to notes, to files without a parent item and to another library are left as they are. Needs <em>Links &amp; Relations → Notes: Editor</em>.

# Reader annotations pane: its own funnel, the selector handle and the types it lists.
weavero-pref-annpane-title = Reader Annotations Pane
weavero-pref-annpane-reader-funnel =
    .label = Funnel above the reader
weavero-pref-annpane-reader-funnel-desc = Filters the document’s annotations on the page and in the annotations pane together — by color, type, tag, comment, person or date. Off, the button is gone and its filter is set aside: every annotation shows again, except what Zotero’s own color and tag selector filters. Switched back on, an open document gets its filter back.
weavero-pref-annpane-funnel =
    .label = Funnel next to the pane’s search box
weavero-pref-annpane-funnel-desc = Unlike the funnel above the reader, which hides annotations from the page as well, this one narrows the annotations pane only — by color, type, tag, comment, person or date — and the page keeps every annotation. Same chips and gestures. Each document keeps its own filter; the types below are the starting point for all of them. With the funnel off, the pane simply follows the types below.
weavero-pref-annpane-selector-handle =
    .label = Handle on Zotero’s color and tag selector at the foot of the pane
weavero-pref-annpane-selector-handle-desc = A small pill on the selector’s top edge: one click folds the selector to that edge, the next brings it back — one state for every document, kept across restarts (shown to begin with). <em>View → Layout → Color and Tag Selector</em> hides the selector entirely, pill included, as the library’s Tag Selector item does. Open, the selector filters the pane and the document together, and an annotation dropped on a color or tag takes it (Shift to remove). A selection stays in force while folded; the pill turns blue to say so. Off, the selector is always shown, as in Zotero.
weavero-pref-annpane-types-title = Annotation Types Shown in the Pane
weavero-pref-annpane-types-desc = Uncheck a type to leave it out of the pane in every document; it stays visible on the page. The funnel can override this for one document, and its “Use as Default” writes back here.
weavero-pref-annpane-type-highlight =
    .label = Highlights
weavero-pref-annpane-type-underline =
    .label = Underlines
weavero-pref-annpane-type-note =
    .label = Notes
weavero-pref-annpane-type-image =
    .label = Images
weavero-pref-annpane-type-ink =
    .label = Ink
weavero-pref-annpane-type-text =
    .label = Text

# Debug (collapsible, at the foot of the pane).
weavero-pref-debug-title = Debug
weavero-pref-debug-enable =
    .label = Enable debug logging
weavero-pref-debug-desc = Emits detailed activity via Zotero.debug (Help → Debug Output Logging → View Output). Leave off for normal use.

# About: the links at the foot of the pane.
weavero-pref-about-title = About
weavero-pref-about-homepage = Homepage — GitHub
weavero-pref-about-bug-report = Bug report / feature request

# ---- Menus (localisation slice 2, 2026-11-11) ---------------------------
# Every menu entry Weavero adds -- to Zotero's own context menus, its tab
# menu, the menubar, and Weavero's own menus -- names one of these messages,
# spelled weavero-menu-<where>-<what>. A XUL entry takes the message through
# data-l10n-id (lib/l10n.ts wvL10n) or Zotero's MenuManager l10nID, so every
# one carries a .label; the reader's context menus take the text itself
# (wvStr). A count that changes the words for exactly one item selects on
# [1], not [one]: this file serves every UI locale Weavero does not
# translate, and plural categories differ (French's "one" also takes 0).

# "Copy As": the copy formats, in the items list's context menu and in every
# tab menu (url.ts WV_COPY_AS, pane.ts).
weavero-menu-copy-as =
    .label = Copy As
weavero-menu-copy-as-citation =
    .label = Citation
weavero-menu-copy-as-bibliography =
    .label = Bibliography
weavero-menu-copy-as-citation-key =
    .label = Citation Key
# $collection: "yes" when the link also selects the collection shown in the
# left pane (the items list's menu).
weavero-menu-copy-as-select-link =
    .label = { $collection ->
        [yes] Select Link (include Collection)
       *[no] Select Link
    }
weavero-menu-copy-as-select-links-separate =
    .label = { $collection ->
        [yes] Select Links (Separate Links per Item) (include Collection)
       *[no] Select Links (Separate Links per Item)
    }
weavero-menu-copy-as-open-links-separate =
    .label = Open Links (Separate Links per Item)
# $external: "yes" when the one item's link opens in another application.
weavero-menu-copy-as-open-link =
    .label = { $external ->
        [yes] Open Link (external app)
       *[no] Open Link
    }
weavero-menu-copy-as-online-link =
    .label = Online Library Link
# Better BibTeX's export formats, shown while that plugin is active.
weavero-menu-copy-as-bbt-bibtex =
    .label = [BBT] BibTeX
weavero-menu-copy-as-bbt-biblatex =
    .label = [BBT] BibLaTeX

# The items list's context menu (pane.ts _setupItemsMenuForWindow).
# $count: the selected items that can take a relation.
weavero-menu-items-add-related =
    .label = { $count ->
        [1] Add Related…
       *[other] Add Related…  ({ $count } items)
    }
# Opens the selection's files with the system's application; also in the tab
# menus.
weavero-menu-open-external-viewer =
    .label = Open in External Viewer
# "Open <type> in ▸": the windows and tab groups to open the selection in.
# $type: the kind of what opens -- pdf, epub, snapshot, image, video, audio,
# text, file or note -- or mixed; $count: how many items open.
weavero-menu-items-open-in =
    .label = { $type ->
        [pdf] { $count ->
            [1] Open PDF in
           *[other] Open PDFs in
        }
        [epub] { $count ->
            [1] Open EPUB in
           *[other] Open EPUBs in
        }
        [snapshot] { $count ->
            [1] Open Snapshot in
           *[other] Open Snapshots in
        }
        [image] { $count ->
            [1] Open Image in
           *[other] Open Images in
        }
        [video] { $count ->
            [1] Open Video in
           *[other] Open Videos in
        }
        [audio] Open Audio in
        [text] Open Text in
        [file] { $count ->
            [1] Open File in
           *[other] Open Files in
        }
        [note] { $count ->
            [1] Open Note in
           *[other] Open Notes in
        }
       *[mixed] Open in
    }
# The items list's Open entries for several items (open-where.ts
# _wvOpenSeveralItemsMenu): Zotero's own "Open PDFs in New Tab / New Window"
# relabelled with how many open and where, and Weavero's One New Window between
# them. $count: how many open (two or more there; one item keeps Zotero's own
# label); $kind: pdf, epub, snapshot or note when all are of that kind,
# attachment for PDFs, EPUBs and snapshots mixed, item when notes and documents
# mix; $where: tabs (new tabs in this window), window (one new main window,
# each one a tab there), windows (a new window each, as Zotero opens them).
weavero-menu-items-open-several =
    .label = Open { $count } { $kind ->
        [pdf] { $count ->
            [1] PDF
           *[other] PDFs
        }
        [epub] { $count ->
            [1] EPUB
           *[other] EPUBs
        }
        [snapshot] { $count ->
            [1] Snapshot
           *[other] Snapshots
        }
        [note] { $count ->
            [1] Note
           *[other] Notes
        }
        [attachment] { $count ->
            [1] Attachment
           *[other] Attachments
        }
       *[item] { $count ->
            [1] Item
           *[other] Items
        }
    } { $where ->
        [tabs] { $count ->
            [1] in New Tab
           *[other] in New Tabs
        }
        [window] { $count ->
            [1] in New Window
           *[other] in One New Window
        }
       *[windows] { $count ->
            [1] in New Window
           *[other] in Separate Windows
        }
    }
# A tab group's row when the group has no name (open-in and move-to menus).
weavero-menu-group-unnamed =
    .label = Group
# Opens, or moves, into a new tab group in that window.
weavero-menu-new-group =
    .label = New Group

# The collections pane's context menu (MenuManager). .acceltext: the
# gesture that does the same, shown at the entry's right.
weavero-menu-collection-open-new-window =
    .label = Open in New Window
    .acceltext = Middle-click
# A collection's or a saved search's zotero://select link.
weavero-menu-collection-copy-link =
    .label = Copy Collection Link
weavero-menu-collection-copy-search-link =
    .label = Copy Saved Search Link

# The items list's column-header menu: Weavero's Tags column is a submenu --
# Zotero's own Show Column checkbox, then this window's count of automatic
# tags beside the manual ones.
weavero-menu-colpick-show-column =
    .label = Show Column
weavero-menu-colpick-auto-tag-count =
    .label = Automatic-Tag Count

# The menubar: File's window commands (main and reader windows), Edit's
# Advanced Search in New Window (MenuManager). .acceltext: the gesture shown
# when no shortcut is assigned.
weavero-menu-file-new-tab =
    .label = New Tab…
weavero-menu-file-new-reader-window =
    .label = New Reader Window…
weavero-menu-file-new-main-window =
    .label = New Main Window
# File -> People (people.ts): the window's People tab.
weavero-menu-file-people =
    .label = Researchers
weavero-menu-edit-advanced-search-new-window =
    .label = Advanced Search in New Window
    .acceltext = Shift+Click

# The right-click menu of the items list's Advanced Search funnel. .acceltext:
# the click that does the same; $platform: mac or other.
weavero-menu-advsearch-open =
    .label = Open Advanced Search
weavero-menu-advsearch-open-new-window =
    .label = Open in New Window
    .acceltext = Shift+Click / Middle-click
weavero-menu-advsearch-open-new-tab =
    .label = Open in New Tab
    .acceltext = { $platform ->
        [mac] ⌘Click
       *[other] Ctrl+Click
    }

# Hidden collections (pane.ts): the collections pane's context menu. One row
# shows Zotero's own "Hide"; several say how many of what. $what:
# collections, searches (saved searches), collections-searches, feeds,
# groups (group libraries) or libraries; $count: 2 or more.
weavero-menu-hid-hide-several =
    .label = { $what ->
        [collections] Hide { $count } Collections
        [searches] Hide { $count } Saved Searches
        [collections-searches] Hide { $count } Collections and Saved Searches
        [feeds] Hide { $count } Feeds
        [groups] Hide { $count } Group Libraries
       *[libraries] Hide { $count } Libraries
    }
# Opens the Hidden manager window.
weavero-menu-hid-manage =
    .label = Manage Hidden…
# The submenu listing what is hidden in this window. $what names what it
# holds: collections, groups (group libraries), libraries, feeds, or
# collections-libraries.
weavero-menu-hid-show =
    .label = { $what ->
        [collections-libraries] Show Hidden Collections and Libraries
        [libraries] Show Hidden Libraries
        [groups] Show Hidden Group Libraries
        [feeds] Show Hidden Feeds
       *[collections] Show Hidden Collections
    }
weavero-menu-hid-show-all =
    .label = Show All ({ $count })
# A hidden saved search, by its name.
weavero-menu-hid-saved-search =
    .label = { $name } (saved search)
# One of Zotero's special collections (Unfiled Items, Duplicate Items...)
# hidden by Zotero's own setting, which applies to every window.
weavero-menu-hid-all-windows =
    .label = { $name } (all windows)

# The Hidden manager window's context menu (its two collection trees).
weavero-menu-hidmgr-new-subcollection =
    .label = New Subcollection…
weavero-menu-hidmgr-rename =
    .label = Rename
# Moves the selected rows to the hidden side, or back.
weavero-menu-hidmgr-hide =
    .label = { $count ->
        [0] Hide →
        [1] Hide →
       *[other] Hide { $count } →
    }
weavero-menu-hidmgr-show =
    .label = { $count ->
        [0] ← Show
        [1] ← Show
       *[other] ← Show { $count }
    }
weavero-menu-hidmgr-delete-collections =
    .label = { $count ->
        [1] Delete Collection…
       *[other] Delete Collections…
    }
weavero-menu-hidmgr-delete-searches =
    .label = { $count ->
        [1] Delete Search…
       *[other] Delete Searches…
    }
weavero-menu-hidmgr-delete-collections-items =
    .label = { $count ->
        [1] Delete Collection and Items…
       *[other] Delete Collections and Items…
    }
weavero-menu-hidmgr-export =
    .label = Export…

# The reader's annotation context menu (right-click on an annotation, or its
# sidebar ⋯ button; reader.ts _contextHandlerImpl). Zotero renders these from
# plain text. $count: the selected annotations the entry acts on.
weavero-menu-reader-ann-add-to-bookmarks =
    .label = { $count ->
        [1] Add to Bookmarks
       *[other] Add to Bookmarks  ({ $count } annotations)
    }
# $type: highlight, underline, or mixed (both kinds selected).
weavero-menu-reader-ann-copy-text =
    .label = { $type ->
        [highlight] { $count ->
            [1] Copy Highlighted Text
           *[other] Copy Highlighted Text  ({ $count } annotations)
        }
        [underline] { $count ->
            [1] Copy Underlined Text
           *[other] Copy Underlined Text  ({ $count } annotations)
        }
       *[mixed] { $count ->
            [1] Copy Annotation Text
           *[other] Copy Annotation Text  ({ $count } annotations)
        }
    }
weavero-menu-reader-ann-copy-select-link =
    .label = { $count ->
        [1] Copy Select Link
       *[other] Copy Select Links  ({ $count } annotations)
    }
weavero-menu-reader-ann-copy-open-link =
    .label = { $count ->
        [1] Copy Open Link
       *[other] Copy Open Links  ({ $count } annotations)
    }
weavero-menu-reader-ann-add-related =
    .label = { $count ->
        [1] Add Related…
       *[other] Add Related…  ({ $count } annotations)
    }

# The reader's view context menu (right-click in the document): a link to
# the place clicked (reader.ts _viewContextHandlerImpl).
weavero-menu-reader-copy-link-selection =
    .label = Copy Link to Selected Text
weavero-menu-reader-copy-link-page =
    .label = Copy Link to This Page
weavero-menu-reader-copy-link-position =
    .label = Copy Link to This Position
weavero-menu-reader-copy-link-location =
    .label = Copy Link to This Location

# The tab menu (tabs.ts): Weavero's entries, and Zotero's own entries
# Weavero relabels for a multi-selection of tabs. $count: the tabs it acts on.
weavero-menu-tab-view-online =
    .label = View Online
# $platform: mac or other.
weavero-menu-tab-show-file =
    .label = { $platform ->
        [mac] Show in Finder
       *[other] Show File
    }
# $action: pin or unpin (Unpin only when every selected tab is pinned).
weavero-menu-tab-pin =
    .label = { $action ->
        [unpin] { $count ->
            [1] Unpin Tab
           *[other] Unpin { $count } Tabs
        }
       *[pin] { $count ->
            [1] Pin Tab
           *[other] Pin { $count } Tabs
        }
    }
weavero-menu-tab-pin-name =
    .label = Show Tab Name
weavero-menu-tab-move-tabs =
    .label = Move Tabs
weavero-menu-tab-close =
    .label = { $count ->
        [1] Close Tab
       *[other] Close { $count } Tabs
    }
weavero-menu-tab-duplicate =
    .label = { $count ->
        [1] Duplicate Tab
       *[other] Duplicate { $count } Tabs
    }
# Puts the selected tabs into a new tab group.
weavero-menu-tab-group-tabs =
    .label = { $count ->
        [1] Group Tab
       *[other] Group Tabs
    }
# Reopens what Weavero closed last: a tab group, or a reader window with its
# $count tabs.
weavero-menu-tab-reopen-closed-group =
    .label = Reopen Closed Group
weavero-menu-tab-reopen-closed-window =
    .label = { $count ->
        [0] Reopen Closed Window
        [1] Reopen Closed Window
       *[other] Reopen Closed Window ({ $count } Tabs)
    }

# A window's menus (the window header in List All Tabs, the window card,
# a saved window's row; tabs.ts, sessions.ts).
weavero-menu-window-rename =
    .label = Rename Window…
# $to: main or reader, the kind of window it becomes.
weavero-menu-window-convert =
    .label = { $to ->
        [main] Convert to Main Window
       *[reader] Convert to Reader Window
    }
weavero-menu-window-save-close =
    .label = Save and Close Window
# Followed by the other tab sessions.
weavero-menu-window-move-to =
    .label = Move Window to
weavero-menu-window-reopen =
    .label = Reopen Window
weavero-menu-window-delete-saved =
    .label = Delete Saved Window
# A tab session's row when the session has no name.
weavero-menu-session-unnamed =
    .label = Session
weavero-menu-window-delete-from-session =
    .label = Delete Window from Session

# Tab sessions (List All Tabs, sessions.ts): a session row's menu, the
# current session's header, the sort menu.
weavero-menu-session-switch =
    .label = Switch to This Session
weavero-menu-session-rename =
    .label = Rename…
weavero-menu-session-delete =
    .label = Delete
weavero-menu-session-rename-current =
    .label = Rename Session…
# The saved sessions' order; also the sort button's text. $sort: created,
# name or lastUsed.
weavero-menu-session-sort =
    .label = { $sort ->
        [name] Name
        [lastUsed] Last used
       *[created] Created
    }
# Shown at the right of the default choice in a sort menu.
weavero-menu-default-hint = (default)

# Tab groups (tab-groups.ts): the move targets of Move Tab, Open in, Move
# Group to -- one row per window, then the groups in it.
# The window the menu was opened from.
weavero-menu-move-target-here =
    .label = { $name }  (here)
# A window by $name; $where: group-home (the group is already there) or
# this-window (the window the menu was opened from).
weavero-menu-group-target-window =
    .label = { $where ->
        [group-home] { $name }  (group is here)
       *[this-window] { $name }  (this window)
    }
weavero-menu-move-new-window =
    .label = New Window
# A group's right-click menu in List All Tabs. $saved: yes when the group is
# closed (it opens), no when it is open (it moves).
weavero-menu-group-rename =
    .label = Rename Group…
weavero-menu-group-move-to =
    .label = { $saved ->
        [yes] Open Group in
       *[no] Move Group to
    }
weavero-menu-group-save-close =
    .label = Save and Close Group
weavero-menu-group-delete =
    .label = Delete Group
# The tab menu: takes the selected tabs out of their tab group.
weavero-menu-tab-remove-from-group =
    .label = { $count ->
        [0] Remove from Tab Group
        [1] Remove from Tab Group
       *[other] Remove { $count } Tabs from Group
    }
# The group chip's editor panel (lower-case, as Firefox's own).
weavero-menu-groupeditor-move-to =
    .label = Move group to
weavero-menu-groupeditor-copy-links =
    .label = { $count ->
        [1] Copy { $count } link in group
       *[other] Copy { $count } links in group
    }
weavero-menu-groupeditor-save-close =
    .label = Save and close group
weavero-menu-groupeditor-ungroup =
    .label = Ungroup tabs
weavero-menu-groupeditor-delete =
    .label = Delete group

# The reader toolbar's button holding the controls a narrow toolbar has no room
# for (reader-toolbar-overflow.ts).
weavero-reader-toolbar-more =
    .label = More Tools

# Split view (tab-split.ts): the tab menu's entries, the split's own menu,
# the items list's entry. $type: pdf, epub, snapshot or note.
weavero-menu-split-add =
    .label = Add Split View
weavero-menu-split-open =
    .label = Open in Split View
weavero-menu-split-separate =
    .label = Separate Split View
weavero-menu-split-reverse =
    .label = Reverse Tabs
weavero-menu-split-separate-tabs =
    .label = Separate Tabs
# The split's own menu, in one side's corner: that side's tab only.
weavero-menu-split-close-tab =
    .label = Close Tab
weavero-menu-split-close-both =
    .label = Close Both Tabs
weavero-menu-items-open-split =
    .label = { $type ->
        [pdf] Open PDF in Split View
        [epub] Open EPUB in Split View
        [snapshot] Open Snapshot in Split View
       *[note] Open Note in Split View
    }

# Split view, a document that follows the library's selected item
# (tab-split-follow.ts): the entries of the tab menu and of the split's own
# menu, on a split of a library tab and a document.
weavero-menu-split-follow =
    .label = Follow Selected Item
weavero-menu-split-keep =
    .label = Keep Document in New Tab
# The follow side's preview: its Open button (it opens the document in Zotero's
# reader in the same place) and the line shown when a document has no preview.
weavero-split-follow-open = Open
    .title = Open in Zotero’s reader, here, to read and annotate (or double-click the preview)
weavero-split-follow-failed = No preview for this document. Click its tab to open it.

# A tab locked on one side of the window (tab-split-dock.ts): every tab's menu
# entry, Lock Tab, or Unlock Tab on the locked tab ($action: lock or unlock, as
# Pin Tab / Unpin Tab); and the locked tab's entry that takes its side off the
# screen or brings it back ($collapsed: yes while collapsed).
weavero-menu-lock-tab =
    .label = { $action ->
        [unlock] Unlock Tab
       *[lock] Lock Tab
    }
weavero-menu-lock-collapse =
    .label = { $collapsed ->
        [yes] Expand Locked Tab
       *[no] Collapse Locked Tab
    }
# The line added under the locked tab's tooltip in the tab bar: a click on the
# tab collapses its side, or expands it again ($collapsed: yes while collapsed).
weavero-dock-tab-tip = { $collapsed ->
        [yes] Locked tab, collapsed. Click to expand it.
       *[no] Locked tab. Click to collapse it.
    }

# The note editor's context menu (note-nav.ts): fold and heading links.
# $folded: yes when the right-clicked heading's section is folded.
weavero-menu-note-fold-section =
    .label = { $folded ->
        [yes] Unfold Section
       *[no] Fold Section
    }
weavero-menu-note-fold-all =
    .label = Fold All
weavero-menu-note-unfold-all =
    .label = Unfold All
# The note editor's context menu: Zotero's citation of a linked item added
# after the link (note-cite.ts). $n = how many links can take one.
weavero-menu-note-cite-link =
    .label = Add Citation After Link
weavero-menu-note-cite-sel =
    .label = Add Citations After Links in Selection ({ $n })
weavero-menu-note-cite-all =
    .label = Add Citations After All Links ({ $n })
# Why such an entry is greyed (its tooltip).
weavero-note-cite-why-readonly = This note is read-only.
weavero-note-cite-why-noitem = This link names no item.
weavero-note-cite-why-note = A note cannot be cited.
weavero-note-cite-why-nolibrary = The linked library is not in this Zotero.
weavero-note-cite-why-otherlibrary = A note cites items of its own library only, as Zotero’s Add Citation does.
weavero-note-cite-why-missing = The linked item is not in the library.
weavero-note-cite-why-noparent = A file with no parent item cannot be cited.
weavero-note-cite-why-notcitable = This item cannot be cited.
weavero-note-cite-why-cited = Already cited right after the link.
# $kind: select (selects the note in the library) or open (opens the note).
weavero-menu-note-heading-link =
    .label = { $kind ->
        [open] Copy Open Link to Heading
       *[select] Copy Select Link to Heading
    }
# The same, greyed out: a read-only note cannot take the heading's anchor.
weavero-menu-note-heading-link-readonly =
    .label = { $kind ->
        [open] Copy Open Link to Heading
       *[select] Copy Select Link to Heading
    }
    .tooltiptext = This note is read-only, and the heading has no link anchor yet.
# The note outline's context menu. $shut: yes when the entry is collapsed.
weavero-menu-outline-toggle =
    .label = { $shut ->
        [yes] Expand
       *[no] Collapse
    }
weavero-menu-outline-expand-all =
    .label = Expand All
weavero-menu-outline-collapse-all =
    .label = Collapse All

# The last line of a row's hover card (Backlinks, Item Links, Related, the
# relations popup): the gestures that open the row (open-where.ts). "Beside":
# next to the tab the row is in (the other side of a split view, or a new
# one). $platform: mac or other.
weavero-open-card-foot = Click to open · { $platform ->
        [mac] ⌘-click
       *[other] Ctrl+click
    }: beside · Shift+click: new window · Middle-click: background tab (a note: in front) · Right-click for more
# The same for a Related row, whose click selects the item in the library.
weavero-open-card-foot-library = Click: open in library · { $platform ->
        [mac] ⌘-click
       *[other] Ctrl+click
    }: beside · Shift+click: new window · Middle-click: background tab (a note: in front)

# A link's right-click menu in a note (note-editor.ts).
weavero-menu-notelink-open-split =
    .label = Open Link in Split View
weavero-menu-notelink-copy =
    .label = Copy Link
weavero-menu-notelink-edit =
    .label = Edit Link…
weavero-menu-notelink-unlink =
    .label = Unlink

# A reference's right-click menu in the Backlinks and Item Links sections
# (backlinks.ts, links.ts); "Show in Library" is Zotero's own string.
weavero-menu-ref-copy-link =
    .label = Copy Link
weavero-menu-ref-show-in-source =
    .label = Show in Source
# Relates the two items in Zotero (both directions).
weavero-menu-ref-add-related =
    .label = Add as Related

# References in your library (refs.ts): the row buttons' tooltips (Zotero's
# citation popup, the References and Cited by rows), and the reference menu's
# entry that opens the copy in another library ($library: its name). "Show in
# Library" is Zotero's own.
weavero-refs-act-tab =
    .title = Open in a new tab
weavero-refs-act-window =
    .title = Open in a new window
weavero-refs-act-split =
    .title = Open in split view
weavero-refs-act-library =
    .title = Show in library
weavero-refs-act-more =
    .title = More
# The ⋯ menu's Show in Library when the copy it shows is in another library
# than the citing paper's ($library: that library's name).
weavero-menu-refs-show-in =
    .label = Show in { $library }
# A dot -- a reference that is an item of yours -- on every surface: beside an
# entry in the PDF, on a popup row, on a References row (one tooltip, MJT
# 2026-11-20). $pdf: yes when the item has a PDF or EPUB, $file naming which
# (epub when an EPUB is what it has, else pdf); $where: here when a copy is
# in the citing paper's own library, other when every copy is in other
# libraries -- the dot then carries the badge of the library its best copy
# is in; $library: with here, that library; with other, every library
# holding a copy, as a list; $others: 0 (the list names them). A click opens
# the menu below.
weavero-refs-bibmark =
    .title = { $where ->
        [other] { $others ->
            [0] Only in { $library }
            [1] Only in { $library } and one other library
           *[other] Only in { $library } and { $others } other libraries
        }
       *[here] In your library ({ $library })
    }, { $pdf ->
        [yes] { $file ->
            [epub] with an EPUB
           *[pdf] with a PDF
        }.{ "\u000A" }Click for its details and where to open it.
       *[no] without a PDF.{ "\u000A" }Click for its details.
    }
# The reference menu's open entries, in its two columns beside Show in
# Library, worded as the items list's own entries without the file's kind: the
# PDF or EPUB icon at the entry's end names it ($where: tab, window, or split
# -- the split view, beside the paper you are reading; $from: other when the
# copy it opens is in another library than the citing paper's and several
# libraries hold one, $library naming it, else here).
weavero-menu-refs-open-short =
    .label = { $where ->
        [window] Open in New Window
        [split] Open in Split View
       *[tab] Open in New Tab
    }{ $from ->
        [other] { " (" }{ $library })
       *[here] { "" }
    }
# The reference menu's rows of the cited item's own attachments and notes, under
# Show in Library, held in this one submenu when there are more than five of
# both kinds (of one kind only, it takes that kind's caption below).
weavero-menu-refs-children =
    .label = Attachments and Notes
# The captions over those rows in the menu -- headings, not entries: one over
# the attachments, one over the notes ($count: the rows under it).
weavero-menu-refs-attachments =
    .label = { $count ->
        [1] Attachment
       *[other] Attachments
    }
weavero-menu-refs-notes =
    .label = { $count ->
        [1] Note
       *[other] Notes
    }
# The tooltip of such a row, greyed out, whose file is not on the disk: Zotero's
# own words (pane.item.attachments.fileNotFound.title).
weavero-refs-att-missing = File Not Found
# The reader's References section: its header ($state: counted once the
# paper's list is read -- $total references, counted as Zotero counts its own
# sections, "0 Tags" -- else none) and its side-navigation tooltip. How many are
# in your libraries is on the filter chips beside it.
weavero-refs-header =
    .label = { $state ->
        [counted] { $total ->
            [0] { $total } References
            [1] { $total } Reference
           *[other] { $total } References
        }
       *[none] References
    }
weavero-refs-sidenav =
    .tooltiptext = References
# Above the References list of the library's item pane when it was read from the
# PDF's full text (no structure cache yet: the PDF never opened in Zotero 11 or
# 10.0.8): the list may be rougher; opened, Zotero reads the PDF's structure and
# the section shows the precise list.
weavero-refs-sec-fulltext = From the PDF’s full text. Open the PDF for the precise list.
# The grey ring -- a reference in none of your libraries -- on every surface,
# and the globe on a row, which does the same: ONE tooltip (weavero-refs-web-tip;
# $how: link when the entry has a link of its own -- a DOI or a URL it writes,
# the PDF's link on it -- which opens as it is, $url naming it; lookup when
# Crossref is asked first, then Google Scholar searched: nothing goes online on
# a hover).
weavero-refs-web-tip =
    .title = { $how ->
        [link] Not in your libraries.{ "\u000A" }Click to open in your browser: { $url }
       *[lookup] Not in your libraries.{ "\u000A" }Click to look it up online (Crossref, else a Google Scholar search).
    }
# The item pane's Cited by section (cited-by.ts): its header ($state: counted
# when papers of your libraries cite the item -- $count of them, counted as
# Zotero counts its sections and as "20 References" -- else none)
# and its side-navigation tooltip.
weavero-citedby-header =
    .label = { $state ->
        [counted] { $count ->
            [0] { $count } Citing Papers
            [1] { $count } Citing Paper
           *[other] { $count } Citing Papers
        }
       *[none] Cited by
    }
weavero-citedby-sidenav =
    .tooltiptext = Cited by
# A row's tooltip: the citing paper's title ($title), then what a click does.
weavero-citedby-row = { $title }
    Click to open this paper at its reference to the item.
# Under the rows while the index is being built in the background: how many
# of your PDFs it has read so far ($done of $total).
weavero-citedby-building = Still reading your PDFs’ reference lists: { $done } of { $total }…
# The row under the first rows of the Cited by section when more papers cite the
# item: shows the next ones ($count of them, at most a hundred at a time).
weavero-citedby-more = Show { $count } more
# After a citing paper's title, muted: the libraries of its other copies -- the
# same paper in another library, shown once ($libraries: their names, as the
# References card lists them).
weavero-citedby-also = also in { $libraries }
weavero-citedby-also-label = Also in
# The long item-pane lists' filter (list-filter.ts, citations M4): buttons in the
# References and Cited by headers -- Zotero's own header-button slot -- each with
# its tooltip: the magnifier opens the search line; the funnel, the line of filter
# chips (hidden since lfsort.1, list-filter.ts WV_LF_FILTERS_UI).
weavero-lf-toggle =
    .tooltiptext = Search
weavero-lf-filter-toggle =
    .tooltiptext = Sort and filter
# The search line's field: what it searches ($kind: references, citedBy, or
# another list; $count: its rows).
weavero-lf-placeholder =
    .placeholder = { $kind ->
        [references] { $count ->
            [1] Search { $count } reference…
           *[other] Search { $count } references…
        }
        [citedBy] { $count ->
            [1] Search { $count } paper…
           *[other] Search { $count } papers…
        }
       *[other] Search { $count } rows…
    }
# At the search line's end (or the filter chips' line's, the search line closed)
# while a filter narrows the list: the rows it keeps ($shown) of the list's ($total).
weavero-lf-count = { $shown } of { $total }
# The same place while a long list is being filtered.
weavero-lf-busy = Filtering…
# The sort's dropdown chip in the header (lfsort.1, as the reader's annotation sort
# bar): the field the list is sorted by, short ($field: paper -- the paper's own
# order of its list; year; cited -- how many of your papers cite each one, the
# Cited by index; title; author -- the first author; added -- when it was added to
# Zotero), and its tooltip.
weavero-lf-sort-short = { $field ->
        [paper] Paper order
        [year] Year
        [cited] Times cited
        [title] Title
        [author] First author
       *[added] Date added
    }
weavero-lf-sort-button =
    .title = Sort order
# The chip's menu: its heading, then the fields ($field as above).
weavero-lf-sort-heading =
    .label = Sort by
weavero-lf-sort =
    .label = { $field ->
        [paper] Order in the paper
        [year] Year
        [cited] Times cited in your libraries
        [title] Title
        [author] First author
       *[added] Date added
    }
# The direction chip beside it (↑ or ↓): its tooltip's first line, the order shown
# ($order: newest, oldest -- by year or date added; most, least -- by times cited;
# az, za -- by title or first author); the second is
# weavero-rpanel-ann-sort-direction.
weavero-lf-sort-dir =
    .title = { $order ->
        [newest] Newest first
        [oldest] Oldest first
        [most] Most cited first
        [least] Least cited first
        [az] A to Z
       *[za] Z to A
    }
# A filter chip ($chip: since -- from $year on, a year; pdf -- with a PDF; in, out
# -- a reference in your libraries or not). The type chips use Zotero's own names.
weavero-lf-chip = { $chip ->
        [since] Since { $year }
        [pdf] Has PDF
        [in] In library
       *[out] Not in library
    }
# A chip's tooltip ($on: yes while the chip is on).
weavero-lf-chip-tip =
    .title = { $on ->
        [yes] Click to show every row again
       *[no] Click to show only these
    }
# In the list when no row matches the filter ($kind as for the field).
weavero-lf-none = { $kind ->
        [references] No references match the filter.
        [citedBy] No papers match the filter.
       *[other] Nothing matches the filter.
    }
# The References section's filter chips' tooltips (refs.ts _wvRefsSecChips): what a
# chip counts, then weavero-scope-toggle-hint's line.
weavero-refs-chip =
    .title = { $kind ->
        [pdf] In your library, with a PDF or EPUB: { $count }
        [nopdf] In your library, without a PDF: { $count }
        [away] Only in another library than this paper's: { $count }
       *[web] Not in your libraries: { $count }
    }
# Open in Browser (weavero-refs-web-tip above): the globe's tooltip while it
# looks the reference up, and the entry of the row's right-click menu.
weavero-refs-act-web-busy =
    .title = Looking up the reference online…
weavero-menu-refs-web =
    .label = Open in Browser
# The reference card at the top of a reference's menu: "et al." after the
# first three authors, the library the copy is in ($where and $library as for
# weavero-refs-mark), the abstract's toggle, and the graphical abstract's
# tooltip ($title: the image attachment's title).
weavero-refs-card-et-al = et al.
weavero-refs-card-library = { $where ->
        [other] Only in { $library }
       *[here] In { $library }
    }
# The card's library line when more than two libraries hold the reference: one named
# ($library: the citing paper's library when it holds a copy, else the copy shown) and a
# button ($others: weavero-refs-card-library-others) that drops the other libraries down.
weavero-refs-card-library-more = { $where ->
        [other] Only in { $library } and { $others }
       *[here] In { $library } and { $others }
    }
# The button in that line; $count: 2 or more.
weavero-refs-card-library-others = { $count } other libraries
# A library's name in a sentence that lists several ($name), in the quotes
# Zotero puts around a name ("remove “%S” from this computer"), so
# "My Library and Dome Over" does not read as one name.
weavero-refs-libname = “{ $name }”
# A reference that several works of your libraries fit about equally (refkeys.1,
# 2026-11-24): its mark -- the dot inside a dashed ring -- adds this line to its
# tooltip after the first one, on every surface, then one line per work
# (weavero-refs-uncertain-item). The row, its buttons and its menu take the
# first work.
weavero-refs-uncertain = Several items in your libraries could be this reference; Weavero shows the first:
# One of those works on a line of its own: $title, $type (Zotero's name of its
# item type: "Journal Article", "Preprint"), $year -- none when it has no date.
weavero-refs-uncertain-item = { $year ->
        [none] “{ $title }” ({ $type })
       *[other] “{ $title }” ({ $type }, { $year })
    }
weavero-refs-card-more = More
weavero-refs-card-less = Less
weavero-refs-card-image =
    .title = { $title }: click to open

# Opens a document, from a bookmark or from a related item's menu. $type:
# pdf, epub, snapshot, note, or attachment (another kind); $where: tab or
# window.
weavero-menu-open-type-in =
    .label = { $type ->
        [pdf] { $where ->
            [window] Open PDF in New Window
           *[tab] Open PDF in New Tab
        }
        [epub] { $where ->
            [window] Open EPUB in New Window
           *[tab] Open EPUB in New Tab
        }
        [snapshot] { $where ->
            [window] Open Snapshot in New Window
           *[tab] Open Snapshot in New Tab
        }
        [note] { $where ->
            [window] Open Note in New Window
           *[tab] Open Note in New Tab
        }
       *[attachment] { $where ->
            [window] Open Attachment in New Window
           *[tab] Open Attachment in New Tab
        }
    }
# Opens the document an annotation is in, at the annotation. $type: pdf,
# epub, snapshot, or another kind (in the reader).
weavero-menu-open-annotation-in =
    .label = { $type ->
        [pdf] { $where ->
            [window] Open in PDF in New Window
           *[tab] Open in PDF in New Tab
        }
        [epub] { $where ->
            [window] Open in EPUB in New Window
           *[tab] Open in EPUB in New Tab
        }
        [snapshot] { $where ->
            [window] Open in Snapshot in New Window
           *[tab] Open in Snapshot in New Tab
        }
        [note] { $where ->
            [window] Open in Note in New Window
           *[tab] Open in Note in New Tab
        }
       *[other] { $where ->
            [window] Open in Reader in New Window
           *[tab] Open in Reader in New Tab
        }
    }

# A related item's right-click menu (relation rows and popups; annotation.ts).
weavero-menu-related-show-file =
    .label = Show File
weavero-menu-related-copy-select-link =
    .label = Copy Select Link
# $external: yes when the link opens in another application.
weavero-menu-related-copy-open-link =
    .label = { $external ->
        [yes] Copy Open Link (external app)
       *[no] Copy Open Link
    }
weavero-menu-related-add-related =
    .label = Add Related…
# Removes the relation between this item and the one the menu came from.
weavero-menu-related-remove-relation =
    .label = Remove Relation

# Bookmarks (bookmarks.ts): the toolbar dropdown's menus, a bookmark's and a
# folder's right-click menu, the collections pane's entry.
weavero-menu-bm-pick-item =
    .label = Pick item from library…
weavero-menu-bm-add-link =
    .label = Add Link…
weavero-menu-bm-add-bookmark =
    .label = Add Bookmark
weavero-menu-bm-sort-manual =
    .label = Manual order
weavero-menu-bm-sort-name =
    .label = Name
weavero-menu-bm-sort-date =
    .label = Date added
weavero-menu-bm-sort-ascending =
    .label = Ascending
weavero-menu-bm-sort-descending =
    .label = Descending
weavero-menu-bm-edit =
    .label = Edit Bookmark…
weavero-menu-bm-reset-name =
    .label = Reset to Default Name
weavero-menu-bm-delete =
    .label = Delete Bookmark
weavero-menu-bm-new-folder =
    .label = New Folder…
weavero-menu-bm-rename-folder =
    .label = Rename Folder…
weavero-menu-bm-new-subfolder =
    .label = New Subfolder…
weavero-menu-bm-delete-folder =
    .label = Delete Folder
# $what: collection or library (the right-clicked row); $bookmarked: yes
# when it is bookmarked already.
weavero-menu-bm-collection =
    .label = { $what ->
        [library] { $bookmarked ->
            [yes] Remove Library Bookmark
           *[no] Bookmark Library
        }
       *[collection] { $bookmarked ->
            [yes] Remove Collection Bookmark
           *[no] Bookmark Collection
        }
    }

# The items list's entry on a child attachment or note (attachments.ts): the
# one a parent opens by default. $marked: yes when this child is it already;
# $glyph: the marker's emoji and a space (the same mark the items list
# shows), or nothing.
weavero-menu-items-default-attachment =
    .label = { $marked ->
        [yes] { $glyph }Clear Default Attachment
       *[no] { $glyph }Set as Default Attachment
    }

# The marks on the rows of the item pane's Attachments and Notes sections
# (attachments.ts), the items list's own: the chosen default (the tag's ▶️)
# and Zotero's automatic choice (the dimmed ▷), shown as tooltips.
weavero-defatt-mark-pick =
    .title = Default attachment: opens on double-click
weavero-defatt-mark-auto =
    .title = Automatic choice: what Zotero opens when no default is set

# An item-pane section's own right-click menu (pane-scope.ts): the section's
# filter (Tags, Related, Backlinks, Item Links) back to the Settings' choice.
weavero-menu-section-reset-filters =
    .label = Reset Filters to Default

# A reader or note window's tab menu (reader.ts): Weavero's entries; the
# rest are Zotero's own strings.
# $count: the selected tabs.
weavero-menu-tab-add-to-group =
    .label = { $count ->
        [0] Add Tab to Group
        [1] Add Tab to Group
       *[other] Add { $count } Tabs to Group
    }
# Opens the document's child notes as tabs in this window.
weavero-menu-tab-open-notes =
    .label = Open Notes
weavero-menu-tab-move-to-main-window =
    .label = Move to Main Window
# A tab group's row when the group has no name (Add Tab to Group).
weavero-menu-group-unnamed-add =
    .label = Unnamed group
# Shown at the right of a closed (saved) group's row.
weavero-menu-group-saved-hint = saved

# The reader window's Edit menu, when the main window's own entries are not
# there to copy their labels from.
weavero-menu-reader-copy-citation =
    .label = Copy Citation
weavero-menu-reader-copy-bibliography =
    .label = Copy Bibliography

# The ☰ menu of a window with Weavero's title bar (reader.ts): its first
# three entries, before the window's own menus.
weavero-menu-hamburger-new-tab =
    .label = New Tab
weavero-menu-hamburger-new-reader-window =
    .label = New Reader Window

# The reader's view context menu: adding to Weavero's outline and bookmarks
# (reader-panels.ts _wvReaderViewContextMenu). $scope: library when the
# Bookmarks pane shows the library's bookmarks, else document.
weavero-menu-reader-add-selection-outline =
    .label = Add Selected Text to Outline
weavero-menu-reader-add-selection-bookmarks =
    .label = Add Selected Text to Bookmarks
weavero-menu-reader-add-position-bookmarks =
    .label = { $scope ->
        [library] Add This Position to Library Bookmarks
       *[document] Add This Position to Bookmarks
    }
weavero-menu-reader-add-page-bookmarks =
    .label = { $scope ->
        [library] Add This Page to Library Bookmarks
       *[document] Add This Page to Bookmarks
    }
# Opens a title prompt, hence the ellipsis.
weavero-menu-reader-add-position-outline =
    .label = Add This Position to Outline…
# Where on the page the bookmark goes; $page: the page's label.
weavero-menu-reader-page-anchor =
    .label = { $anchor ->
        [bottom] Bottom of page { $page }
       *[top] Top of page { $page }
    }

# The reader sidebar's own menus (reader-panels.ts): an outline entry's and a
# bookmark's right-click menus, the panes' + and sort menus.
weavero-menu-ctx-open =
    .label = Open
weavero-menu-ctx-open-new-window =
    .label = Open in New Window
weavero-menu-ctx-rename =
    .label = Rename…
weavero-menu-ctx-delete =
    .label = Delete
# Starts a handle-drag edit of the text the entry points at.
weavero-menu-ctx-edit-region =
    .label = Edit Region…
# Adds an entry at text the user selects next, or at a spot the user clicks.
weavero-menu-ctx-select-text =
    .label = Select text…
weavero-menu-ctx-pin-spot =
    .label = Pin a spot…
weavero-menu-bm-sort-location =
    .label = Location
# An outline entry: finding its text again, the title's spacing, its kind.
weavero-menu-outline-redetect-region =
    .label = Re-detect Region from Title
weavero-menu-outline-fix-spacing =
    .label = Fix Spacing
weavero-menu-outline-spacing-correct =
    .label = Spacing is Correct
# A page entry (top or bottom of a page): opens the page and place prompt.
weavero-menu-outline-edit-position-pages =
    .label = Edit Position…
# A pinned entry: shows its pin, to drag.
weavero-menu-outline-edit-position =
    .label = Edit Position
weavero-menu-outline-reset-original =
    .label = Reset to Original Name and Region
weavero-menu-outline-not-box =
    .label = Not a Box (Section)
weavero-menu-outline-mark-box =
    .label = Mark as Box / Sidebar
weavero-menu-outline-delete-entries =
    .label = Delete { $count } Entries
# Deletes the whole outline Weavero keeps for this document.
weavero-menu-outline-delete-weavero =
    .label = Delete Edited Outline…
# The outline-extraction evaluation menu (a development tool). $verdict:
# none, good, bad or scan.
weavero-menu-oe-verdict =
    .label = { $verdict ->
        [good] Extraction Good
        [bad] Extraction Bad
        [scan] Scan (No Text Layer)
       *[none] Not Marked
    }

# A bookmark's right-click menu in the reader: the selected text bookmarks
# into the outline ($count: how many); a bookmark made in another document
# shows that document's item.
weavero-menu-bm-copy-to-outline =
    .label = { $count ->
        [0] Copy to Outline
        [1] Copy to Outline
       *[other] Copy { $count } to Outline
    }
weavero-menu-bm-show-parent =
    .label = Show Parent in Library

# Maximize across monitors (max-span.ts): the right-click menu of a window's
# maximize button, one entry per run of monitors side by side. $first,
# $second, $last: the monitors' names (weavero-maxspan-monitor); $mixed: yes
# when they use different display scales, which the tooltip then says.
weavero-menu-maxspan-pair =
    .label = Maximize to { $first } + { $second }
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
# Every monitor, three or more. $count: how many.
weavero-menu-maxspan-all =
    .label = { $count ->
        [3] Maximize to All Three
       *[other] Maximize to All { $count } Monitors
    }
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
# Three monitors or more of a longer row, from $first to $last.
weavero-menu-maxspan-range =
    .label = Maximize to { $first } through { $last }
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
# A monitor's name in those entries, by its place: two or three in a row are
# Left, Middle, Right; in a column Top, Middle, Bottom; any other layout is
# numbered from left to right (top to bottom in a column). $number: its number.
weavero-maxspan-monitor = { $position ->
        [left] Left
        [middle] Middle
        [right] Right
        [top] Top
        [bottom] Bottom
       *[number] Monitor { $number }
    }
weavero-maxspan-tip = The window fills these monitors, leaving the taskbar free. Restore, or a double-click on the title bar, puts it back.
weavero-maxspan-tip-mixed = The window fills these monitors, leaving the taskbar free. Restore, or a double-click on the title bar, puts it back. These monitors use different display scales: the window is drawn at the scale of one of them.

# ---- Shared words (all interface text into Fluent, 2026-11-19) -----------
# The few words several surfaces use with exactly the same meaning. A word
# whose sense depends on where it sits (Clear, Reset, Remove...) gets a
# message of its own surface instead.
weavero-common-cancel = Cancel
weavero-common-save = Save
weavero-common-close = Close
weavero-common-done = Done
weavero-common-loading = Loading…
# A title-less item, note or document in a list.
weavero-common-untitled = (untitled)
weavero-common-clear-search = Clear search
weavero-common-alt-click-exclude = Alt+Click to Exclude
# Modifier keys in a shortcut Weavero spells out itself ("Ctrl+Shift+F").
# macOS shows its symbols (⌘ ⇧ ⌥ ⌃), which stay as they are.
weavero-key-ctrl = Ctrl
weavero-key-shift = Shift
weavero-key-alt = Alt
weavero-key-win = Win

# =========================================================================
# Interface text moved from the code (2026-11-19): every word Weavero
# writes into a tooltip, a pane, a popup, a hover card, a prompt or a status
# line, by surface. The code reads these through lib/l10n.ts wvStr, which
# writes the text synchronously (no data-l10n-id on HTML elements: Fluent
# would replace their children and drop attributes the message lacks).
# =========================================================================

# ---- Backlinks and Item Links (backlinks.ts, links.ts) ----
# A reference is a Zotero link (a zotero:// address written in a note or an
# annotation's comment) or a note citation (a citation, or an annotation,
# that Zotero's note editor puts into a note). "Item Links" and "Backlinks"
# are the item pane sections' names (weavero-links-header,
# weavero-backlinks-header).

# The tooltip of a reference button or badge: an annotation's Item Links or
# Backlinks button (reader sidebar, annotation popup, item pane), an
# attachment row's backlinks badge. $kind: links or backlinks; $count: how
# many references.
weavero-bl-ref-title = { $kind ->
        [links] { $count ->
            [1] { $count } Item Link
           *[other] { $count } Item Links
        }
       *[backlinks] { $count ->
            [1] { $count } Backlink
           *[other] { $count } Backlinks
        }
    }
# The tooltip of the U-turn mark on a row whose link starts and ends inside
# the same item. $title: that item's title.
weavero-bl-internal-tip = Internal link: both ends are in “{ $title }”
# A page in a row, a chip or a hover card ("p. 12"). $page: the page's
# label as the document numbers it.
weavero-bl-page = p. { $page }
# Where inside a note a Better Notes link points, shown after the note: a
# line, a section by its name (written "#Name", as Better Notes shows it),
# or a heading. $at: line, section or heading; $value: the line number or
# the section's name.
weavero-bl-note-pos = { $at ->
        [line] line { $value }
        [section] #{ $value }
       *[heading] heading
    }
# An attachment's kind, where it has no title and in a chip ("→ PDF p. 5").
# PDF and EPUB are file formats. $kind: pdf, epub, snapshot, file or
# attachment (any other kind).
weavero-bl-att-kind = { $kind ->
        [pdf] PDF
        [epub] EPUB
        [snapshot] snapshot
        [file] file
       *[attachment] attachment
    }
# A row's label in a count popup: what the reference is. $ref: citation (a
# citation in a note), quote (an annotation added to a note) or link (a
# Zotero link); $paged: yes when a page follows; $page: the page's label;
# $file: the annotation's file title in parentheses, with a space before it
# (" (Full Text PDF)"), or nothing.
weavero-bl-row-label = { $ref ->
        [citation] { $paged ->
            [yes] Note citation p. { $page }
           *[no] Note citation
        }
        [quote] { $paged ->
            [yes] Note citation, annotation p. { $page }{ $file }
           *[no] Note citation, annotation{ $file }
        }
       *[link] Zotero link
    }
# The two kinds of reference, as a hover card names them before what the
# reference does ("Zotero link — Open at page 5"). $kind: cite or zotero.
# "Include Zotero Links" is Zotero's own export option, hence the name.
weavero-bl-kind = { $kind ->
        [cite] Note citation
       *[zotero] Zotero link
    }
# What a Zotero link does, in its hover card after its kind. $action:
# select (selects the item in the library), annotation (opens the document
# at an annotation), page (opens it at page $page) or open.
weavero-bl-action = { $action ->
        [select] Show in library
        [annotation] Open at annotation
        [page] Open at page { $page }
       *[open] Open
    }
# What a Zotero link to a note does. $at: line (Better Notes' line $value),
# section (Better Notes' section named $value), heading (a heading of the
# note, Weavero's own link) or none. Better Notes is another plugin.
weavero-bl-action-open-note = { $at ->
        [line] Open note at line { $value } (Better Notes)
        [section] Open note at section { $value } (Better Notes)
        [heading] Open note at heading
       *[none] Open note (Better Notes)
    }
# What a note citation of an annotation points at, in its hover card.
# $page: the annotation's page (for gone: the page the citation names);
# $cited: another page the citation after it names. $form: page-cited,
# page, cited, gone (the annotation was deleted) or plain.
weavero-bl-action-quote = { $form ->
        [page-cited] annotation p. { $page }, cited p. { $cited }
        [page] annotation p. { $page }
        [cited] annotation, cited p. { $cited }
        [gone] annotation, p. { $page }
       *[plain] annotation
    }
# A chip after a row: where inside its item the reference points ("→ PDF
# p. 5", "→ annotation p. 12", "→ note line 3"). → is an arrow. $to: here
# (a place inside the row's own item, a note: the note position), annotation
# or annotation-page, note or note-pos, attachment or attachment-page;
# $page: a page label; $file: the annotation's file title in parentheses
# with a space before it, or nothing. The note position and the attachment's
# kind are the messages above.
weavero-bl-chip = { $to ->
        [here] → { weavero-bl-note-pos }
        [annotation] → annotation{ $file }
        [annotation-page] → annotation p. { $page }{ $file }
        [note] → note
        [note-pos] → note { weavero-bl-note-pos }
        [attachment-page] → { weavero-bl-att-kind } p. { $page }
       *[attachment] → { weavero-bl-att-kind }
    }
# A reference whose target cannot be found: its row's title and the hover
# card's first line. $why: library (it names a group library that is not in
# this Zotero profile) or item.
weavero-bl-broken = { $why ->
        [library] Library not in this profile
       *[item] Item not found
    }
# The same, explained under the link's address in the hover card.
weavero-bl-broken-why = { $why ->
        [library] The link names a group library that is not in this profile.
       *[item] No item in the library has this key: it was deleted, or the link is wrong.
    }
# A hover card's annotation line begins with Zotero's own "Page" and the
# page label, as the reader's annotation header does; this word stands in
# when Zotero's is unavailable.
weavero-bl-card-page = Page
# A hover card's grey line under an annotation: its comment, cut short.
# $text: the comment.
weavero-bl-card-comment = comment: { $text }
# A hover card's line for a note that has no title.
weavero-bl-card-note = Note

# ---- Hover cards (backlinks.ts) ----
# The headers of a hover card's two columns: a reference's Source (the note
# or annotation it is written in) and Target (what it points at); for a
# Related row, the Item the relation is on and the Related item.
weavero-card-side-source = Source
weavero-card-side-target = Target
weavero-card-side-item = Item
weavero-card-side-related = Related

# ---- Annotation comments (annotation.ts) ----
# The tooltip of the icon on an annotation's comment that opens the comment
# in a popup (items list, reader sidebar, item pane).
weavero-ann-comment-popup = Comment popup

# ---- Default attachment (attachments.ts) ----
# A notice in the main window, once, when the picks of another plugin,
# "Default Attachment" by PikaPei (its name, not translated), are found. Its
# title, then its lines; $count: how many picks it holds.
weavero-defatt-legacy-title = Weavero — default attachments found
# When that plugin is installed and running.
weavero-defatt-legacy-running = { $count ->
        [1] Default Attachment (PikaPei) is running and has { $count } default attachment saved.
       *[other] Default Attachment (PikaPei) is running and has { $count } default attachments saved.
    }
weavero-defatt-legacy-running-offer = Weavero can do the same job — for any attachment, linked URL or note, not just PDFs — and stores each choice as a tag so it syncs.
# When only its saved data is left.
weavero-defatt-legacy-leftover = { $count ->
        [1] Found { $count } default attachment left over from Default Attachment (PikaPei), which is not running.
       *[other] Found { $count } default attachments left over from Default Attachment (PikaPei), which is not running.
    }
weavero-defatt-legacy-leftover-offer = Weavero can take those over and store each as a tag so it syncs, or leave them alone.
weavero-defatt-legacy-question = What would you like to do?
# The notice's buttons. The third shows only while that plugin is running.
weavero-defatt-legacy-import = Import into Weavero
weavero-defatt-legacy-skip = Don’t import
weavero-defatt-legacy-keep = Keep using Default Attachment
# The notice that follows the choice: its title, then its lines.
weavero-defatt-result-title = Weavero — default attachments
# After Import. $count: the picks imported; $tag: the tag that marks them
# (an emoji and "wv-defatt", not translated).
weavero-defatt-imported = { $count ->
        [1] Imported { $count } pick as the tag { $tag }.
       *[other] Imported { $count } picks as the tag { $tag }.
    }
weavero-defatt-imported-note = Default Attachment's own data was left untouched — the README explains removing it by hand.
# After Keep using Default Attachment.
weavero-defatt-other-off = Weavero's default-attachment feature is now off.
weavero-defatt-other-keeps = Default Attachment keeps working exactly as before; Weavero never changed any of its data.
weavero-defatt-other-back = You can turn Weavero's version back on in Settings → Weavero → Extras.
# After Don’t import.
weavero-defatt-skipped = Left Default Attachment's data alone.
weavero-defatt-skipped-hint = Set a default any time by right-clicking a child item.

# ---- Split view (tab-split.ts) ----
# The bar between the two sides, spoken by screen readers (a separator the
# user drags, or moves with the arrow keys).
weavero-split-splitter-label = Resize split view tabs
# The ⋯ button in a side's corner footer, which opens the split's menu.
weavero-split-footer-more =
    .title = Split view
    .aria-label = Split view menu
# The picker shown by Add Split View in a tab's menu (as Firefox's): its
# heading, its line, its search box's placeholder, and the line shown when
# no other tab can go beside this one.
weavero-split-picker-title = Add Split View
weavero-split-picker-desc = Choose a tab to show beside this one.
weavero-split-picker-search = Search open tabs
weavero-split-picker-empty = No other open tab.
# A tab's tooltip in the tab bar while it is one side of a split view, as
# Firefox writes it. $label: the tab's own tooltip (its title); $side: left
# or right.
weavero-split-tab-tip = { $side ->
        [left] { $label }, Split view left
       *[right] { $label }, Split view right
    }

# ---- Settings pane, written by its script (prefs/index.ts) ----
# The ▸ arrow before a section's header, spoken by screen readers.
weavero-pref-section-toggle = Collapse or expand this section
# Outline keyboard shortcuts (Extras): the box that records a shortcut. Its
# placeholder when no shortcut is set, and while it waits for the keys.
weavero-pref-outline-key-none = None
weavero-pref-outline-key-press = Press the keys…
# The status line beside the box: while it records, and after.
weavero-pref-outline-key-esc-hint = Esc to cancel
# $keys: the shortcut pressed ("Ctrl+Shift+F"); $owner: the command or
# plugin that already uses it.
weavero-pref-outline-key-taken = { $keys } is already used by { $owner }.
weavero-pref-outline-key-saved = Saved.
weavero-pref-outline-key-removed = Removed.

# ---- misc (index.ts, pane.ts) ----

# The tooltip of a notice box Weavero shows at the bottom right of the main
# window; a click on the box closes it.
weavero-misc-toast-dismiss = Click to dismiss
# The heading of that notice when a clicked zotero:// link cannot fully
# resolve. The lines under it are the weavero-misc-link-* messages below.
weavero-misc-link-toast-title = Weavero — broken link
# The link names a group library this user is not a member of. $group: the
# group's number (as in zotero.org/groups/<number>).
weavero-misc-link-group-no-access = This link points to a group library you don't have access to (group #{ $group }).
weavero-misc-link-group-unresolved = This link points to a group library that couldn't be resolved.
# $key: the 8-character Zotero key of the collection, saved search, item,
# file or note the link names (e.g. UE4GSKJF).
weavero-misc-link-collection-missing = The linked collection no longer exists (key { $key }).
weavero-misc-link-collection-trashed = The linked collection is in the Trash (key { $key }).
weavero-misc-link-search-missing = The linked saved search no longer exists (key { $key }).
# A link that selects items inside a collection or a saved search: the
# collection or search is gone, the items are selected without it.
weavero-misc-link-scope-collection-missing = The collection in this link no longer exists (key { $key }) — selecting the item(s) without it.
weavero-misc-link-scope-collection-trashed = The collection in this link is in the Trash (key { $key }) — selecting the item(s) without it.
weavero-misc-link-scope-search-missing = The saved search in this link no longer exists (key { $key }) — selecting the item(s) without it.
# A link to several items. $count: how many of them are missing (2 or more
# here); $keys: their keys, separated by commas.
weavero-misc-link-items-missing-all = None of the { $count } linked items exist anymore ({ $keys }).
# A link to one item that is gone. $key: its key.
weavero-misc-link-item-missing = The linked item no longer exists (key { $key }).
# Some of the linked items are gone, the others were selected. $count: how
# many are gone; $total: how many the link names; $keys: the missing keys.
weavero-misc-link-items-missing-some = { $count } of { $total } linked items no longer exist ({ $keys }) — selected the rest.
# $count: how many of the linked items are in the Trash (2 or more); $keys:
# their keys, separated by commas.
weavero-misc-link-items-trashed = { $count } of the linked items are in the Trash ({ $keys }).
weavero-misc-link-item-trashed = The linked item is in the Trash (key { $key }).
weavero-misc-link-file-missing = The file this link points to no longer exists (key { $key }).
weavero-misc-link-file-trashed = The linked file's attachment is in the Trash (key { $key }) — opened anyway.
weavero-misc-link-note-missing = The note this link points to no longer exists (key { $key }).
weavero-misc-link-note-trashed = The linked note is in the Trash (key { $key }) — opened anyway.
# A zotero:// link of a kind Weavero does not open from a note or a
# comment (only select, open and note links). $url: the link.
weavero-misc-link-refused-zotero = This kind of Zotero link isn't opened from a note or a comment: { $url }
# A file:// link to a file on another computer, from a note or a comment:
# never opened. $host: that computer's name.
weavero-misc-link-refused-remote-file = A link to a file on another computer ({ $host }) was not opened.
# With "Allow links to files on other computers" on, the first click on such
# a link asks first: the question's title, its text and its button (the other
# one is Cancel). $host: the computer's name; $target: the full address.
weavero-misc-open-remote-file-title = Open a file on another computer?
weavero-misc-open-remote-file-message = This link reaches another computer, “{ $host }”:

    { $target }

    Opening it connects to that computer. Open it only if you trust where the link came from. Weavero will not ask again for this link.
weavero-misc-open-remote-file-button = Open
# A file:// link to a file on this computer when the system has no
# application for file links (stock Ubuntu, 1.2.3): the first click on such a
# link asks first -- the question's title, its text and its button (the other
# one is Cancel). $target: the file's full path.
weavero-misc-open-local-file-title = Open a file on this computer?
weavero-misc-open-local-file-message = This link opens a file on this computer:

    { $target }

    It will open in the application your computer uses for this type of file. Open it only if you trust where the link came from. Weavero will not ask again for this link.
weavero-misc-open-local-file-button = Open
# Such a link not opened (Cancel, or file links switched off), its file not
# found, or the system failing to open it: the toast's text. $name: the
# file's full path.
weavero-misc-link-local-file-not-opened = “{ $name }” was not opened.
weavero-misc-link-local-file-missing = “{ $name }” was not opened: there is no such file on this computer.
weavero-misc-link-local-file-failed = “{ $name }” could not be opened.
# A link, a row or a card Weavero did not open, for safety: the toast's title.
weavero-misc-link-refused-title = Weavero — link not opened
# A link to a file the system would run (a program, a script, a shortcut,
# or a file marked as executable). $name: the file's name (an attachment) or
# its full path (a file:// link).
weavero-misc-link-refused-runnable = “{ $name }” was not opened: files of this type can run programs on your computer.
# Before a link opens a file Zotero can't show itself: the question's title,
# its text and its button (the other one is Cancel). $name: the file's name.
weavero-misc-open-external-title = Open in another application?
weavero-misc-open-external-message = Zotero can't show “{ $name }”, so it would open in the application your computer uses for this type of file. Open it only if you trust where it came from.
weavero-misc-open-external-button = Open
# A reader window (a window of document tabs) in the items list's "Open … in"
# menu, when the user has not named it. $number: its place among the reader
# windows; the first one has no number.
weavero-misc-reader-window = { $number ->
        [1] Reader window
       *[other] Reader window { $number }
    }
# A line Weavero adds to Zotero's "Check for Updates" window. $version:
# Zotero's version as its About window writes it, e.g. "7.0.15 (64-bit)".
weavero-misc-update-installed = Currently installed: Zotero { $version }
# A second line in that window, shown only while another Zotero of the same
# installation runs (another profile, or another user of the computer):
# Zotero's updater then waits for it to close before it checks for an update
# and before it installs one.
weavero-misc-update-other-instance = Another Zotero from this installation is running (another profile or another user). Zotero waits until that one is closed to check for and install updates.

# ---- count (count-popups.ts, index.ts, pane.ts) ----

# How many related items an annotation has: the tooltip of its Related
# button (items list, item pane, reader sidebar), and the title of the
# Related column's count popup. Zotero's own wording for its Related
# section ("{ $count } Related").
weavero-count-related = { $count } Related
# The title of the popup a count in the items list opens (the Tags,
# Backlinks, Item Links and External Links columns). $count: how many
# entries it lists.
weavero-count-title-tags = { $count ->
        [1] { $count } Tag
       *[other] { $count } Tags
    }
# The Tags column with its two numbers (manual | automatic): the first
# number's popup lists the manual tags only.
weavero-count-title-manual-tags = { $count ->
        [1] { $count } Manual Tag
       *[other] { $count } Manual Tags
    }
weavero-count-title-auto-tags = { $count ->
        [1] { $count } Automatic Tag
       *[other] { $count } Automatic Tags
    }
weavero-count-title-backlinks = { $count ->
        [1] { $count } Backlink
       *[other] { $count } Backlinks
    }
weavero-count-title-item-links = { $count ->
        [1] { $count } Item Link
       *[other] { $count } Item Links
    }
weavero-count-title-ext-links = { $count ->
        [1] { $count } External Link
       *[other] { $count } External Links
    }
# A group heading in those popups and in the item pane's sections: the
# entries that sit on the item itself (not on one of its files, notes or
# annotations).
weavero-count-this-item = This item
# After an annotation's heading in those popups: the page it is on. $page:
# the page label as the document prints it ("12", "iv").
weavero-count-page = p. { $page }
# Tooltip of a tag in the Tags count popup: a click filters the items list
# by that tag.
weavero-count-tag-filter-tip = Filter the list by this tag
# A count popup whose entries were all removed since the count was drawn.
weavero-count-empty = Nothing here any more.

# ---- scope (pane-scope.ts) ----

# The counts beside an item-pane section's title (Tags, Related, Item Links,
# Backlinks) are toggles; their tooltip is a line saying what is counted
# (below), then this line saying what a click does. $state: only (this
# level alone is shown), hidden (this level is hidden), off (neither).
weavero-scope-toggle-hint = { $state ->
        [only] Only these are shown · click again: show all
        [hidden] These are hidden · Alt+click again: show them
       *[off] Click: show only these · Alt+click: hide these
    }
# What a count counts. $prep names the section: on (Tags and Related: the
# tags and relations ON the item), in (Item Links: the links written IN
# it), to (Backlinks: the links pointing TO it). $count: the number shown.
weavero-scope-count-own = { $prep ->
        [in] In this item: { $count }
        [to] To this item: { $count }
       *[on] On this item: { $count }
    }
weavero-scope-count-att = { $prep ->
        [in] In its attachments: { $count }
        [to] To its attachments: { $count }
       *[on] On its attachments: { $count }
    }
weavero-scope-count-note = { $prep ->
        [in] In its notes: { $count }
        [to] To its notes: { $count }
       *[on] On its notes: { $count }
    }
weavero-scope-count-ann = { $prep ->
        [in] In its annotations: { $count }
        [to] To its annotations: { $count }
       *[on] On its annotations: { $count }
    }
# The two kinds of reference in Item Links and Backlinks: zotero:// links,
# and Zotero citations in notes.
weavero-scope-count-zotero-links = Zotero links: { $count }
weavero-scope-count-note-citations = Note citations: { $count }
# Links whose two ends are in the same item. $what: links (the Item Links
# section) or backlinks (the Backlinks section); $count: how many;
# $total: all the section's.
weavero-scope-count-internal = { $what ->
        [backlinks] Internal backlinks: { $count } of { $total } (both ends in the same item)
       *[links] Internal links: { $count } of { $total } (both ends in the same item)
    }
weavero-scope-count-broken = Broken links: { $count } (the item is gone, or its group library is not in this profile)

# ---- hid (pane.ts, hidden collections) ----

# The collections pane's context menu: Zotero's own word for Hide, used only
# when Zotero's own string cannot be read.
weavero-hid-hide = Hide
# The name of a whole section of the collections pane, when Zotero's own
# cannot be read. $section: feeds or groups.
weavero-hid-section = { $section ->
        [feeds] Feeds
       *[groups] Group Libraries
    }
# The tooltip of the blue dot on a library row with hidden entries. Its
# parts, joined by commas: how many of each kind are hidden. $count: the
# number.
weavero-hid-dot-collections = { $count ->
        [1] { $count } hidden collection or saved search
       *[other] { $count } hidden collections or saved searches
    }
weavero-hid-dot-groups = { $count ->
        [1] { $count } hidden group library
       *[other] { $count } hidden group libraries
    }
weavero-hid-dot-libraries = { $count ->
        [1] { $count } hidden library
       *[other] { $count } hidden libraries
    }
weavero-hid-dot-feeds = { $count ->
        [1] { $count } hidden feed
       *[other] { $count } hidden feeds
    }
# A whole hidden section in that list. $section: its name, Zotero's
# ("Group Libraries", "Feeds").
weavero-hid-dot-section = the { $section } section
# $list: the parts above, joined by commas.
weavero-hid-dot-here = In this window: { $list }
# Entries Zotero's own setting hides (in every window). $count: how many.
weavero-hid-dot-everywhere = { $count } hidden in every window (Zotero's setting)
# The whole tooltip. $list: the two lines above that apply, joined by "; ".
weavero-hid-dot-tip = { $list } — right-click to show
# The Hidden manager window (collections pane → Manage Hidden…): its title,
# with the main window's name when several are open ($window).
weavero-hid-mgr-title = Collections and Libraries Manager
weavero-hid-mgr-title-window = Collections and Libraries Manager — { $window }
# Its filter box's placeholder, when Zotero's own text cannot be read.
weavero-hid-mgr-filter = Filter Collections
# The captions over its two trees (shown in capitals by the style sheet).
weavero-hid-mgr-shown = Shown
weavero-hid-mgr-hidden = Hidden
# The buttons between the trees: move the selection to the hidden side, back
# to the shown side, or bring everything back. The arrows point to the side
# the rows go to.
weavero-hid-mgr-hide-button = Hide →
weavero-hid-mgr-show-button = ← Show
weavero-hid-mgr-show-all-button = ← Show All
weavero-hid-mgr-show-all-tip = Show everything hidden in this window (and what Zotero's own setting hides)
# The right tree when nothing is hidden.
weavero-hid-mgr-empty = Nothing hidden
# Tooltips of the greyed rows that cannot be moved, saying why.
weavero-hid-mgr-why-groups-section = The Group Libraries section can be hidden only while My Library is shown
weavero-hid-mgr-why-last-library = The last library shown cannot be hidden: show another library first
weavero-hid-mgr-why-heading-hide = A heading: select the libraries under it to hide them
weavero-hid-mgr-why-heading-show = A heading: select the hidden libraries under it to show them
weavero-hid-mgr-why-not-hidden = Not hidden: shown here for the hidden entries inside it
# Tooltips of hidden rows hidden through what holds them: what Show brings
# back with them.
weavero-hid-mgr-hint-groups-section = Hidden with the Group Libraries section: Show brings the section back
weavero-hid-mgr-hint-feeds-section = Hidden with the Feeds section: Show brings the section back
weavero-hid-mgr-hint-library = Hidden with its library: Show brings the library back
weavero-hid-mgr-hint-parent = Hidden with its parent collection: Show brings the parent back
# A row Zotero's own setting hides (Unfiled Items, Duplicate Items...): its
# tooltip, and the small mark after its name.
weavero-hid-mgr-global-tip = Hidden in every window by Zotero's own setting: Show brings it back everywhere
weavero-hid-mgr-all-windows = (all windows)

# ---- pane (pane.ts) ----

# The items list's "Open … in" menu: the tooltips of its two icon buttons
# that open the selection in a brand-new main window, the second inside a
# new tab group there.
weavero-pane-open-in-new-main-window = New Main Window
weavero-pane-open-in-new-group-window = A New Group in a New Main Window
# Tooltip of the toolbar button that shows or hides the collections pane.
weavero-pane-toggle-collections = Toggle Collections Pane
# Tooltip of the small handle on the line above the Tag Selector. Collapsed
# with the items list filtered by tags: $tag, the one tag's name, or
# $count, how many tags (2 or more).
weavero-pane-tags-handle-expand = Expand the Tag Selector
weavero-pane-tags-handle-expand-tag = Expand the Tag Selector (the list is filtered by the tag “{ $tag }”)
weavero-pane-tags-handle-expand-tags = Expand the Tag Selector (the list is filtered by { $count } tags)
weavero-pane-tags-handle-collapse = Collapse the Tag Selector (drag to resize)
# Tooltip of the badge after an annotation in a group library, naming who
# added it. $name: that user's name.
weavero-pane-added-by = Added by { $name }
# The menu a right-click on a link in the items list opens.
weavero-pane-url-menu-copy-link = Copy Link
weavero-pane-url-menu-open-split = Open Link in Split View
# The last line of the hover card on a row of the item pane's Related
# section: what a click and a right-click do.
weavero-pane-related-card-foot = Click: show in library · Right-click for more

# ---- col (pane.ts, items-list columns) ----

# The names of the columns Weavero adds to the items list (column picker,
# header tooltip). Use Zotero's terms.
weavero-col-annotations = Annotations
weavero-col-tags = Tags
weavero-col-related = Related
weavero-col-backlinks = Backlinks
weavero-col-item-links = Item Links
weavero-col-ext-links = External Links

# ---- pm (pane.ts, Plugins Manager) ----

# The Plugins Manager window's name in its title bar, until the window has
# its own.
weavero-pm-window-title = Plugins Manager
# Placeholder of the search box above the plugin list. $shortcut: the
# shortcut that focuses it ("Ctrl+F").
weavero-pm-search-placeholder = Search installed plugins  ({ $shortcut })
# The × button that empties that box (tooltip).
weavero-pm-search-clear = Clear
# When a plugin was last updated, on its card (weavero-pm-card-meta's
# $when). Older than two weeks, the date itself is shown. $count: how many
# minutes, hours or days.
weavero-pm-time-unknown = unknown
weavero-pm-time-just-now = just now
weavero-pm-time-minutes = { $count } min ago
weavero-pm-time-hours = { $count ->
        [1] { $count } hour ago
       *[other] { $count } hours ago
    }
weavero-pm-time-days = { $count ->
        [1] { $count } day ago
       *[other] { $count } days ago
    }
# The line under a plugin's name, after its author: $version, the plugin's
# version ("1.2.3"); $when, one of the times above, or a date.
weavero-pm-card-meta = v{ $version } · updated { $when }
# The Recent Updates view: the button that picks how far back the list
# goes (its tooltip), and its choices. $days: 0 (everything), 1, 2, 7, 30
# or 90.
weavero-pm-recent-frame-tip = How far back Recent Updates goes
weavero-pm-recent-frame = { $days ->
        [0] All
        [1] Last day
       *[other] Last { $days } days
    }
# Zotero's own choice in that menu. $frame: its name (weavero-pm-recent-frame).
weavero-pm-recent-frame-default = { $frame } (default)
# The view's heading, written when the page shows none (an empty list).
weavero-pm-recent-heading = Recent Updates

# ---- oe (outline-eval.ts, a developer tool) ----

# A note in the reader's outline pane after a developer marks how well the
# outline was extracted. $verdict: good, bad or scan (no text layer);
# $count: how many documents are marked so far.
weavero-oe-marked = { $verdict ->
        [good] Eval: marked GOOD ({ $count } cases recorded)
        [bad] Eval: marked BAD ({ $count } cases recorded)
       *[scan] Eval: marked SCAN ({ $count } cases recorded)
    }
weavero-oe-cleared = Eval: cleared mark

# ---- Items-list filter: toolbar, chip bar, rows (filter.ts) ----

# Tooltip of the funnel button next to the main window's quick-search box;
# it opens the filter popup.
weavero-filter-tb-button-tip = Filter items

# Tooltip of the small chevron on an items-list row whose children the
# filter hides. "revealed": the user clicked it and every child shows.
weavero-filter-chevron-revealed-tip = Showing all children of this container. Click to re-apply the filter.
# The children still hidden. $count: how many.
weavero-filter-chevron-hidden-tip = { $count ->
        [1] { $count } more item hidden by the filter. Click to reveal them.
       *[other] { $count } more items hidden by the filter. Click to reveal them.
    }

# Tooltip of the small name badge on an annotation row in a group library:
# who made it. $name: the group member's name.
weavero-filter-added-by-tip = Added by { $name }

# The chip bar under the items-list toolbar: one chip per active filter,
# drawn as three boxes -- the filter's name ($field, e.g. "Tag"), the
# operator ($op, e.g. "includes all") and the values ($value, e.g.
# "biology, review") -- then a ×. This message sets the ORDER of the three
# boxes only: put the three variables in the order your language reads
# them. Any other text written here is not shown. English: Tag | includes
# all | biology, review.
weavero-filter-chip-order = { $field } { $op } { $value }
# The operator box of a chip (see weavero-filter-chip-order). "is" / "is
# not": one value, or a yes/no filter (Has DOI is / is not).
weavero-filter-chip-op-is = is
weavero-filter-chip-op-is-not = is not
# Several values that must ALL be present (tags, authors); "includes"
# when only one is picked.
weavero-filter-chip-op-includes = includes
weavero-filter-chip-op-includes-all = includes all
# Several alternatives, any one is enough (publications, read statuses).
weavero-filter-chip-op-includes-any = includes any
# Excluded values: items with any of them are hidden.
weavero-filter-chip-op-excludes-any = excludes any
# Developer-only outline flags: an item must have all the flags listed, or
# none of them.
weavero-filter-chip-op-has = has
weavero-filter-chip-op-has-none-of = has none of
# The value box of the Annotation Source chip: where the annotation was made.
weavero-filter-chip-source-embedded = Embedded in PDF
weavero-filter-chip-source-zotero = Made in Zotero
# Tooltip of a chip's body, and of its × box.
weavero-filter-chip-tip = Click to edit — opens the filter popup focused on this group.
weavero-filter-chip-remove-tip = Remove filter
# Badge between two groups of chips: items matching either group show.
weavero-filter-bar-or = OR
# The buttons at the end of the chip bar, and their tooltips.
weavero-filter-bar-add = + Filter
weavero-filter-bar-add-tip = Add a filter to the current group (AND with the existing chips in this group).
weavero-filter-bar-add-group = + OR Group
weavero-filter-bar-add-group-tip = Start a new OR group — its filters are AND'd internally and the group's results are unioned with the others.
weavero-filter-bar-clear-all = Clear all
weavero-filter-bar-clear-all-tip = Remove every active filter and reset to a single empty group.

# The filters' names: the first box of a chip (weavero-filter-chip-order),
# and the spoken name of the matching icon tile in the filter popup. Use
# Zotero's own terms (Tag, Item Type, Collection, Related, Abstract...).
weavero-filter-dim-annotation-color = Annotation Color
weavero-filter-dim-annotation-type = Annotation Type
weavero-filter-dim-has-comment = Has Comment
weavero-filter-dim-annotation-source = Annotation Source
weavero-filter-dim-tag = Tag
weavero-filter-dim-author = Author
weavero-filter-dim-item-type = Item Type
weavero-filter-dim-attachment-file-type = Attachment File Type
# Developer-only filters on how a PDF's outline was obtained.
weavero-filter-dim-outline-source = Outline Source
weavero-filter-dim-outline-flags = Outline Flags
weavero-filter-dim-outline-verdict = Outline Verdict
# The group-library member who added the item.
weavero-filter-dim-added-by = Added By
weavero-filter-dim-has-related = Has Related
# A web link (https://, mailto:...) in an annotation comment or a note.
weavero-filter-dim-has-external-link = Has External Link
# A Zotero link to another item in an annotation comment or a note.
weavero-filter-dim-has-item-links = Has Item Links
weavero-filter-dim-has-bookmarks = Has Bookmarks
weavero-filter-dim-has-backlinks = Has Backlinks
weavero-filter-dim-has-tag = Has Tag
weavero-filter-dim-item-note = Item Note
weavero-filter-dim-standalone-note = Standalone Note
weavero-filter-dim-standalone-attachment = Standalone Attachment
weavero-filter-dim-has-abstract = Has Abstract
# DOI, PMID and PMCID are identifiers' names: keep them as they are.
weavero-filter-dim-has-doi = Has DOI
weavero-filter-dim-has-pmid = Has PMID
weavero-filter-dim-has-pmcid = Has PMCID
weavero-filter-dim-retracted = Retracted
weavero-filter-dim-has-url = Has URL
weavero-filter-dim-has-attachment = Has Attachment File
weavero-filter-dim-has-annotations = Has Annotations
# An outline the user edited in the reader's Outline tab (Weavero's own).
weavero-filter-dim-has-outline = Has Edited Outline
# Annotations stored inside the PDF by another program.
weavero-filter-dim-has-embedded-annotations = Has Embedded Annotations
weavero-filter-dim-publication = Publication
# The status set by the Zotero Reading List plugin.
weavero-filter-dim-read-status = Read Status
# The item also exists, as a linked copy, in another library.
weavero-filter-dim-in-other-library = In Multiple Libraries

# Annotation colors, as Zotero names them: tooltips of the color tiles and
# the values of an Annotation Color chip.
weavero-filter-color-yellow = Yellow
weavero-filter-color-red = Red
weavero-filter-color-green = Green
weavero-filter-color-blue = Blue
weavero-filter-color-purple = Purple
weavero-filter-color-magenta = Magenta
weavero-filter-color-orange = Orange
weavero-filter-color-gray = Gray
weavero-filter-color-black = Black

# Annotation types, as Zotero's reader names them: tooltips of the type
# tiles and the values of an Annotation Type chip.
weavero-filter-ann-type-highlight = Highlight
weavero-filter-ann-type-underline = Underline
weavero-filter-ann-type-note = Note
weavero-filter-ann-type-image = Image
weavero-filter-ann-type-ink = Ink
weavero-filter-ann-type-text = Text

# Attachment file kinds: tooltips of the file-type tiles and the values of
# an Attachment File Type chip. (PDF and EPUB stay as they are.)
weavero-filter-file-type-snapshot = Snapshot
weavero-filter-file-type-image = Image
weavero-filter-file-type-video = Video
weavero-filter-file-type-web-link = Web Link
# An attachment stored as a link to a file outside Zotero's storage.
weavero-filter-file-type-linked-file = Linked File
weavero-filter-file-type-other-file = Other File

# Read Status (Zotero Reading List plugin): the entry for items that have
# no status, in the filter popup and in a chip. The statuses themselves are
# the plugin's own names and are shown as the plugin stores them.
weavero-filter-read-status-none = No Status
# Tooltip of a status button. $status: the status name (or "No Status").
weavero-filter-read-status-tip = { $status } — Alt+click to exclude

# ---- Collection set (filter.ts): several collections selected ----

# The header row Zotero shows when several collections or saved searches
# are selected ("2 collections selected"), once the ∩ button narrows the
# list. $header: Zotero's own header text. $mode: all = only the items in
# every selected one; not-all = the items in some but not all of them.
weavero-filter-collset-header = { $header } — { $mode ->
        [all] in all
       *[not-all] not in all
    }
# Tooltip of the ∩ button on that header. $kind: what is selected --
# collections, saved searches, or a mix of both (sources).
# The button is on: only the items in all of them show.
weavero-filter-collset-tip-all = { $kind ->
        [collections] Showing items in ALL selected collections — click to show them all again (union)
        [searches] Showing items in ALL selected saved searches — click to show them all again (union)
       *[sources] Showing items in ALL selected sources — click to show them all again (union)
    }
# The button is on, Alt+clicked: the items in some but not all of them.
weavero-filter-collset-tip-not-all = { $kind ->
        [collections] Showing items in some but NOT all selected collections — Alt+click to show them all again (union)
        [searches] Showing items in some but NOT all selected saved searches — Alt+click to show them all again (union)
       *[sources] Showing items in some but NOT all selected sources — Alt+click to show them all again (union)
    }
# The button is off (Zotero's usual union).
weavero-filter-collset-tip-off = { $kind ->
        [collections] Show only items in ALL selected collections (intersection). Alt+click: items in some but not all.
        [searches] Show only items in ALL selected saved searches (intersection). Alt+click: items in some but not all.
       *[sources] Show only items in ALL selected sources (intersection). Alt+click: items in some but not all.
    }
# Second line of that tooltip. $all: items in every selected one; $some:
# items in some but not all of them.
weavero-filter-collset-tip-counts = In all: { $all ->
        [1] { $all } item
       *[other] { $all } items
    } · in some but not all: { $some ->
        [1] { $some } item
       *[other] { $some } items
    }

# ---- Filter popup (filter.ts) ----

# The popup's title, and the buttons at its top right.
weavero-filter-popup-title = Filter Library
weavero-filter-popup-clear = Clear
weavero-filter-popup-clear-tip = Clear all filters (keep this window open)
weavero-filter-popup-clear-aria = Clear all filters
# The × button: clears every filter and closes the popup.
weavero-filter-popup-clear-close = Clear and Close

# The four row kinds of the items list (Zotero's terms): labels of the
# Selection Target buttons and of the "Apply to" checkboxes.
weavero-filter-kind-parent = Parent
weavero-filter-kind-attachment = Attachment
weavero-filter-kind-note = Note
weavero-filter-kind-annotation = Annotation
# The three texts the Has External Link and Has Item Links filters can
# read ("Apply to" checkboxes).
weavero-filter-kind-standalone-note-text = Standalone Note Text
weavero-filter-kind-item-note-text = Item Note Text
weavero-filter-kind-annotation-comment = Annotation Comment

# Selection Target: the row of buttons at the bottom of the popup choosing
# which rows Ctrl+A selects. The label, its tooltip, each button's tooltip.
weavero-filter-seltarget-label = Selection Target:
weavero-filter-seltarget-tip = Which row kinds Ctrl+A selects (out-of-scope rows are dimmed). Leave empty for the smart default: all kinds — or just the kind(s) your active filters target (annotation filters → annotations; item-type filters → items; both → both). Click a kind to override that, Alt+click to exclude.
weavero-filter-seltarget-parent-tip = Regular items will be selectable in Ctrl+A.
weavero-filter-seltarget-attachment-tip = Attachment rows (standalone included) will be selectable in Ctrl+A.
weavero-filter-seltarget-note-tip = Notes (standalone and item notes) will be selectable in Ctrl+A.
weavero-filter-seltarget-annotation-tip = Annotation rows will be selectable in Ctrl+A.
# A button's tooltip while the active filters choose it automatically.
# $tip: the button's own tooltip (one of the four above).
weavero-filter-seltarget-auto-tip = { $tip }  •  Auto: your active filters only target this kind, so that's what Ctrl+A selects. Click any kind to set it manually.

# The two checkboxes at the bottom of the popup (text, then tooltip). The
# first mirrors Zotero's View menu entry "Hide Non-Matching Annotations":
# use Zotero's own translation of that entry inside the tooltip.
weavero-filter-show-nonmatching-annotations = Show Non-Matching Annotations
weavero-filter-show-nonmatching-annotations-tip = Mirrors Zotero's 'Hide Non-Matching Annotations' (View menu). When off, only annotations matching the current search/filter appear under matched files.
weavero-filter-show-nonmatching-attachments = Show Non-Matching Attachments
weavero-filter-show-nonmatching-attachments-tip = When off, only attachments matching the current search/filter appear under matched parents. Hidden attachments take their annotation children with them.

# The search box of the popup: the ▾ before it chooses what it searches.
weavero-filter-mode-trigger-tip = Choose what to filter
# Under the search box, when there is nothing to list: in the library, or
# for what was typed.
weavero-filter-tag-empty-all = No tags in this library
weavero-filter-tag-empty-match = No matching tags
weavero-filter-publication-empty-all = No publications in this library
weavero-filter-publication-empty-match = No matching publications
weavero-filter-author-empty-all = No annotation authors in this library
weavero-filter-author-empty-match = No matching authors
# Group libraries record which member added each item.
weavero-filter-added-by-empty-all = No tracked creators in this library
weavero-filter-added-by-empty-match = No matching users
weavero-filter-collection-empty-all = No collections in this library
weavero-filter-collection-empty-match = No matching collections
weavero-filter-saved-search-empty-all = No saved searches in this library
weavero-filter-saved-search-empty-match = No matching saved searches
# More suggestions than the list shows. $count: how many more.
weavero-filter-suggest-more = +{ $count } more
# Tooltips of the arrow before a collection that has subcollections.
weavero-filter-collection-collapse = Collapse
weavero-filter-collection-expand = Expand

# A picked value under the search box ("pill"). $kind: what it is (Tag,
# Author, Collection... -- the search box's menu entries); $value: the
# value (a tag, a name). $exclude: yes when it is excluded.
# The pill's tooltip.
weavero-filter-pill-tip = { $exclude ->
        [yes] Not { $kind }: { $value }
       *[no] { $kind }: { $value }
    }
# The small label at the start of the pill.
weavero-filter-pill-kind = { $exclude ->
        [yes] Not { $kind }:
       *[no] { $kind }:
    }
# Tooltip of the pill's ×.
weavero-filter-pill-remove = Remove
# Tooltip of the ▾ on a tag pill.
weavero-filter-tag-scope-tip = Choose which categories the Tag filter applies to — parent items, attachments, notes, annotations (shared with Has Tag).
# The label before a line of pills: every one must match.
weavero-filter-line-all-of = All of
# The label before a line of publication pills (or of group members): any
# one of them matches.
weavero-filter-line-any-publication = Any Publication
weavero-filter-line-any-added-by = Any Added By

# The Item Type control: its button (a drop-down) and tooltip.
weavero-filter-itype-trigger = Item Type
weavero-filter-itype-trigger-tip = Item Type — click to choose
# Tooltip of an excluded item type's icon. $type: the item type's name.
weavero-filter-itype-not = Not { $type }
weavero-filter-itype-empty = No item types available
# Tooltip of a recently used item type's icon. $type: its name.
weavero-filter-itype-mru-tip = { $type } — recently used. Click to filter; Alt+click to exclude.

# The ▾ button inside the toolbar's quick-search box (visible while it
# holds text): which rows the quick search may show. Tooltip, then the
# spoken name.
weavero-filter-qs-scope-tip = Restrict Quick Search to: — choose which row kinds the toolbar quick-search may surface in the results. All-on (default) means no restriction.
weavero-filter-qs-scope-aria = Restrict Quick Search to
# Heading of the small checkbox menu that the ▾ buttons open.
weavero-filter-scope-apply-to = Apply to
# Tooltip of the ▾ next to the Has Tag / Has Related / Has External Link
# / Has Item Links / Has Backlinks tiles.
weavero-filter-scope-arrow-tip = Choose which categories this filter applies to — parent items, attachments, notes, annotations

# Tooltips of the icon tiles in the filter popup (one click shows the
# items that have it, Alt+click hides them).
weavero-filter-has-tag-tip = Has Tag — items carrying at least one tag. Alt+click to exclude. ▾ to scope by row kind.
weavero-filter-has-related-tip = Has Related — items with at least one related-item link. Alt+click to exclude. ▾ to scope by row kind.
weavero-filter-has-external-link-tip = Has External Link — items whose annotation comment or note text contains a link that leaves Zotero (https://, mailto:, app links). A zotero:// link is Has Item Links'. Alt+click to exclude. ▾ to choose which text source(s) to scan.
weavero-filter-has-item-links-tip = Has Item Links — items whose notes or annotation comments link to another Zotero item (Zotero links and note citations), on the item, a note or an annotation. A web URL alone is Has External Link's. Alt+click to exclude. ▾ to choose where the link is written.
weavero-filter-has-backlinks-tip = Has Backlinks — items linked from another annotation comment or note (Zotero links and note citations), on the item, a child or an annotation. Alt+click to exclude. ▾ to choose what is linked: the item, its attachments, notes or annotations.
weavero-filter-in-other-library-tip = In Multiple Libraries — regular items that also belong to another library (a linked copy exists, e.g. dragged to or from a group). The item pane's Libraries and Collections section shows which ones. Alt+click to exclude.
weavero-filter-retracted-tip = Retracted — regular items Zotero marks as retracted (red retraction notice in the item pane), within the current collection or search. Alt+click to exclude them.
weavero-filter-has-doi-tip = Has DOI — regular items with a DOI. Alt+click to exclude.
weavero-filter-has-pmid-tip = Has PMID — regular items with a PMID (field or Extra). Alt+click to exclude.
weavero-filter-has-pmcid-tip = Has PMCID — regular items with a PMCID (field or Extra). Alt+click to exclude.
weavero-filter-has-url-tip = Has URL — regular items with a URL field. Alt+click to exclude.
weavero-filter-has-abstract-tip = Has Abstract — regular items with a non-empty abstract. Alt+click to exclude.
weavero-filter-has-attachment-tip = Has Attachment File — regular items with at least one attachment file (PDF, EPUB, snapshot, etc.). Distinct from Item Note — item notes are also attachment-level rows but have their own tile in the Attachment group. Alt+click to exclude.
weavero-filter-linked-file-tip = Linked File — attachments stored as links to external files (any content type). Alt+click to exclude.
weavero-filter-standalone-attachment-tip = Standalone Attachment — show only top-level (parentless) attachments. Alt+click to exclude.
weavero-filter-has-bookmarks-tip = Has Bookmarks — items whose attachment(s) have reader bookmarks saved. Alt+click to exclude.
weavero-filter-has-annotations-tip = Has Annotations — file attachments with at least one annotation. Alt+click to exclude.
weavero-filter-has-embedded-annotations-tip = Has Embedded Annotations — file attachments carrying at least one annotation embedded in the PDF by an outside reader. Alt+click to exclude.
weavero-filter-has-outline-tip = Has Edited Outline — attachments with an outline you edited in the reader's Outline tab (renamed entries, your own additions). NOT the document's own embedded or extracted outline: those can only be known by opening every file. Alt+click to exclude.
weavero-filter-has-comment-tip = Has Comment — annotations with non-empty comment text. Alt+click to exclude.
weavero-filter-annotation-source-tip = Annotation Source — embedded in the PDF by an outside reader (imported when Zotero first opens the file). Alt+click: made in Zotero Reader.
weavero-filter-standalone-note-tip = Standalone Note — show only top-level (parentless) notes. Together with Item Note: either kind of note (OR). Alt+click to exclude.
weavero-filter-item-note-tip = Item Note — show only notes attached to a regular item. Together with Standalone Note: either kind of note (OR). Alt+click to exclude.

# ---- Filter popup, developer outline section (filter.ts) ----
# Shown only with Weavero's developer outline-evaluation option on.

# The button that classifies every PDF's outline, while it runs ($done of
# $total files), its tooltip, and the store's counts beside it.
weavero-filter-outline-scan = Scan library
weavero-filter-outline-quick-scanning = Quick scan… { $done }/{ $total }
weavero-filter-outline-scanning = Scanning… { $done }/{ $total }
weavero-filter-outline-scan-tip = Classify every PDF's outline in this library (opens each in the background). Writes nothing to the library.
weavero-filter-outline-status = { $classified } classified · { $marked } marked
# The labels before the three rows of tiles.
weavero-filter-outline-row-source = Source
weavero-filter-outline-row-flags = Flags
weavero-filter-outline-row-verdict = Verdict
# How the outline was obtained.
weavero-filter-outline-embedded = Embedded
weavero-filter-outline-extracted = Extracted
weavero-filter-outline-zotero = Zotero
weavero-filter-outline-scanned = Scanned (no text)
weavero-filter-outline-empty = Empty
weavero-filter-outline-unknown = Unknown
# Quality problems found in an outline.
weavero-filter-outline-flag-content-empty = Content-empty
weavero-filter-outline-flag-entity-leak = Entity leak
weavero-filter-outline-flag-ws-junk = Whitespace junk
weavero-filter-outline-flag-fig-table = Fig/Table headings
weavero-filter-outline-flag-spacing = Spacing suspect
# A developer's verdict on an outline.
weavero-filter-outline-verdict-good = Good
weavero-filter-outline-verdict-bad = Bad
weavero-filter-outline-verdict-scan = Scan
weavero-filter-outline-verdict-unmarked = Unmarked
# Tooltip of a tile. $label: one of the names above; $count: how many
# files carry it.
weavero-filter-outline-tile-tip = { $count ->
        [0] { $label } — click to include, Alt+click to exclude
       *[other] { $label } ({ $count }) — click to include, Alt+click to exclude
    }

# ---- Item count breakdown in the item pane (filter.ts) ----
# With nothing (or several items) selected, the item pane's count is
# broken down per level of the items list.
# The levels.
weavero-filter-count-top-level = Top-level
weavero-filter-count-children = Children
weavero-filter-count-annotations = Annotations
# In a feed view the box counts the feed items shown: unread, read.
weavero-filter-count-unread = Unread
weavero-filter-count-read = Read
# Column headings: rows that match the search/filter, rows shown only as
# their context (a parent of a match); "Rows" when nothing narrows.
weavero-filter-count-match = Match
weavero-filter-count-context = Context
weavero-filter-count-rows = Rows
# Tooltip of the funnel in the box's corner. $sources: what narrows the
# list, several joined by " + " (weavero-filter-count-source).
weavero-filter-count-narrowed = narrowed by { $sources }
weavero-filter-count-source = { $source ->
        [filter] filter
        [quick] quick search
       *[advanced] advanced search
    }

# ---- Filter popup search box menu (filter.ts) ----
# The menu of the ▾ before the popup's search box: what the box searches.
# The same words are the box's placeholder and the kind name of a picked
# value (weavero-filter-pill-tip).
weavero-menu-filter-mode-tag =
    .label = Tag
weavero-menu-filter-mode-publication =
    .label = Publication
weavero-menu-filter-mode-author =
    .label = Author
weavero-menu-filter-mode-added-by =
    .label = Added By
weavero-menu-filter-mode-collection =
    .label = Collection
weavero-menu-filter-mode-saved-search =
    .label = Saved Search

# ---- Bookmarks, shared by the reader's Bookmarks pane and the library's Bookmarks dropdown (bookmarks.ts, reader-panels.ts) ----

# The Bookmarks button's tooltip: on the collections pane's toolbar (the
# library's bookmarks) and on the reader sidebar's Bookmarks tab.
weavero-bm-title = Bookmarks

# The magnifier button that opens a search box above the bookmark list, and
# that box's placeholder.
weavero-bm-search-tip = Search bookmarks
weavero-bm-search-placeholder = Search bookmarks…

# The funnel button that opens the bookmark filter popup.
weavero-bm-filter-tip = Filter bookmarks

# Shown in the list when a search finds nothing. $query: the text typed in
# the search box.
weavero-bm-search-no-match = No bookmarks match "{ $query }".
# Shown in the list when the filter popup's choices leave nothing.
weavero-bm-filter-no-match = No bookmarks match the current filter.

# Tooltip of the sort button above a bookmark list. $field: the sort in
# force -- manual (the stored order, no sort), location (place in the
# document), alpha (by name) or date (date added); $dir: asc or desc.
weavero-bm-sort-tip = { $field ->
        [location] { $dir ->
            [asc] Sorted by location (ascending) — click to change (manual order is preserved)
           *[desc] Sorted by location (descending) — click to change (manual order is preserved)
        }
        [alpha] { $dir ->
            [asc] Sorted by name (ascending) — click to change (manual order is preserved)
           *[desc] Sorted by name (descending) — click to change (manual order is preserved)
        }
        [date] { $dir ->
            [asc] Sorted by date added (ascending) — click to change (manual order is preserved)
           *[desc] Sorted by date added (descending) — click to change (manual order is preserved)
        }
       *[manual] Sort bookmarks
    }
# The short name shown on the sort button while a sort is in force (a
# triangle for the direction follows it). $field: location, date or alpha
# (by name).
weavero-bm-sort-short = { $field ->
        [location] Location
        [date] Date
       *[alpha] Name
    }
# Tooltip of the triangle on the sort button, which flips the direction.
weavero-bm-sort-reverse = Reverse sort order

# The bookmark filter popup: its title, and the line it shows when the list
# offers nothing to filter on.
weavero-bm-filter-title = Filter Bookmarks
weavero-bm-filter-none = No filters available for the current bookmark list.
# Tooltip of a colour chip or a person chip in the bookmark filter popup.
# $name: the colour's hex code (#ffd400) or the person's name; $count: how
# many bookmarked annotations have it.
weavero-bm-filter-chip-ann-tip = { $count ->
        [1] { $name } — { $count } annotation — Alt+click to exclude
       *[other] { $name } — { $count } annotations — Alt+click to exclude
    }
# Tooltip of a tag chip in the bookmark filter popup. $tag: the tag; $count:
# how many bookmarks carry it.
weavero-bm-filter-chip-tag-tip = { $count ->
        [1] { $tag } — { $count } bookmark — Alt+click to exclude
       *[other] { $tag } — { $count } bookmarks — Alt+click to exclude
    }
# Tooltip of an annotation-type chip in the bookmark filter popup. $type:
# highlight, underline, note, text, image or ink; $count: how many bookmarked
# annotations are of that type.
weavero-bm-filter-type-tip = { $type ->
        [highlight] Highlights
        [underline] Underlines
        [note] Notes
        [text] Text annotations
        [image] Image annotations
       *[ink] Ink annotations
    } — { $count } — Alt+click to exclude
# Tooltip of a bookmark-kind chip in the reader's bookmark filter popup.
# $kind: pin (a pinned spot), page (a whole page), text (a text selection),
# annotation, item (a library item) or link (a web, app or zotero:// link);
# $count: how many bookmarks of that kind.
weavero-bm-filter-kind-tip = { $kind ->
        [pin] Pins
        [page] Page bookmarks
        [text] Text selections
        [annotation] Annotations
        [item] Items
       *[link] Links
    } — { $count } — Alt+click to exclude

# The name a page bookmark gets by default, kept up to date with the page
# while the user has not renamed it (also the default name offered when a
# position bookmark is named). $page: the page's label as the document
# prints it; $anchor: top, or bottom for a bookmark at the bottom of the page.
weavero-bm-page-name = { $anchor ->
        [bottom] Page { $page } (bottom)
       *[top] Page { $page }
    }
# The name of a library bookmark whose library has no name. $id: the
# library's number.
weavero-bm-library-fallback = Library { $id }
# A bookmark without a name, in a list or a hover card; also the name given
# to a bookmark of a place in an EPUB or a snapshot.
weavero-bm-unnamed = Bookmark
# A bookmark folder without a name.
weavero-bm-folder-unnamed = Folder
# The name a new folder gets, pre-filled in the name prompt.
weavero-bm-folder-default-name = New Folder

# Titles of the name prompts (the prompt's own line reads
# weavero-bm-prompt-name).
weavero-bm-prompt-new-folder = New Folder
weavero-bm-prompt-new-subfolder = New Subfolder
weavero-bm-prompt-rename-folder = Rename Folder
weavero-bm-prompt-new-bookmark = New Bookmark
weavero-bm-prompt-name = Name:

# Deleting a folder that still holds bookmarks: the confirm dialog's title
# and message. $name: the folder's name; $count: the bookmarks and folders
# inside it.
weavero-bm-delete-folder-title = Delete Folder
weavero-bm-delete-folder-confirm = { $count ->
        [1] Delete “{ $name }” and its { $count } item?
       *[other] Delete “{ $name }” and its { $count } items?
    }

# Added after a bookmark's name in a list when it points at a place in a
# document (an attachment) other than the one in front, with a leading
# space. $title: that document's title.
weavero-bm-sublabel-in = {" "}— in { $title }

# The bookmark editor (a small dialog): its title, and the caption of its
# Comment field (also the field name Zotero's Edit -> Undo shows after an
# annotation's comment was edited there).
weavero-bm-edit-title = Edit Bookmark
weavero-bm-edit-comment-caption = Comment

# ---- Bookmarks, the library's dropdown (bookmarks.ts) ----

# The two icon buttons at the top of the dropdown.
weavero-bm-add-bookmarks-tip = Add Bookmarks…
weavero-bm-new-folder-tip = New Folder…
# The dropdown with no bookmark at all.
weavero-bm-empty-library = No bookmarks yet. Use ＋ Add Bookmarks…
# A folder's flyout when the folder is empty.
weavero-bm-folder-empty = (empty)
# Tooltip of a row that points at a place in a document. $label: the
# bookmark's name; $title: the document's title.
weavero-bm-row-in-tip = { $label } — in { $title }
# Tooltip of the ⚠ badge on a bookmark whose item, collection or library was
# deleted.
weavero-bm-missing-tip-library = This bookmark's target no longer exists. Right-click → Delete Bookmark to remove it.
# Added to the tooltip of such a row. $text: the row's tooltip so far (the
# name, and the comment if any).
weavero-bm-missing-suffix = { $text } — target no longer exists

# The bookmark editor's fields: the title's caption, the line above the
# default title (shown while the title differs from it) and the button that
# puts the default back.
weavero-bm-edit-title-caption = Title
weavero-bm-edit-default-title = Default title:
weavero-bm-edit-reset-default = Reset to default
# The same editor opened to add a link (a web, app or zotero:// URL).
weavero-bm-add-link-title = Add Link Bookmark

# ---- Bookmarks, the reader's Bookmarks pane (reader-panels.ts) ----

# The two scope buttons at the top of the pane: this document's bookmarks, or
# the library's. Their tooltip says how to show both at once.
weavero-bm-scope = { $scope ->
        [document] Document
       *[library] Library
    }
weavero-bm-scope-tip = Click: switch scope. Ctrl-click: merge both scopes (show together).

# The pane's section headings: bookmarks of places in this document, of
# items elsewhere in Zotero, and the library's bookmarks. $section: local,
# global or library.
weavero-bm-section = { $section ->
        [local] This Document
        [global] Elsewhere
       *[library] Global
    }
# The hint under an empty section. $section: local, global or library.
weavero-bm-empty-section = { $section ->
        [local] Right-click in the page, or drag an annotation here.
        [global] Use + to bookmark an item, collection, or link.
       *[library] Use + to bookmark an item, collection, library, or saved search — they appear here in every document.
    }
# The + and new-folder buttons on a section heading.
weavero-bm-add-tip = Add bookmark
weavero-bm-new-folder-section-tip = New folder in this section
weavero-bm-add-library-tip = Add bookmark to Library
weavero-bm-new-folder-library-tip = New folder in Library

# Tooltip of the ⚠ badge on a bookmark whose target was deleted.
weavero-bm-missing-tip-reader = This bookmark's target no longer exists. Right-click → Delete to remove it.

# Confirm dialog when several selected rows, folders among them, are
# deleted with the Delete key. $count: the selected rows.
weavero-bm-delete-selected-confirm = { $count ->
        [1] Delete { $count } selected bookmark? Folders are removed with their contents.
       *[other] Delete { $count } selected bookmarks? Folders are removed with their contents.
    }

# The dialog that adds or edits a link bookmark: the caption of its Text
# field (the bookmark's name; the URL field's caption is "URL") and its
# confirm button.
weavero-bm-link-dialog-text = Text
weavero-bm-link-dialog-apply = Apply

# The hover card of a bookmark: what kind of thing it points at. $kind:
# location (a pinned spot), text (a text selection), collection, library,
# search (a saved search), missing (an item that no longer exists) or item.
weavero-bm-hover-kind = { $kind ->
        [location] Location
        [text] Selected text
        [collection] Collection
        [library] Library
        [search] Saved search
        [missing] Item (not found)
       *[item] Item
    }
# The hover card's heading for a place in a document. $page: the page label.
weavero-bm-hover-page = Page { $page }
# The hover card's line naming the document an annotation is in. $title: the
# document's title.
weavero-bm-hover-source = in: { $title }
# The button that unfolds or folds a long hover card. $state: collapsed or
# expanded (what the card is now).
weavero-bm-hover-expand = { $state ->
        [expanded] Collapse ▴
       *[collapsed] Expand ▾
    }
# The hover card's last lines. $what: default (the name the bookmark would
# have without the user's renaming), created (when the item was added to
# Zotero) or bookmarked (when the bookmark was made); $value: the name or the
# date.
weavero-bm-hover-meta = { $what ->
        [default] Default: { $value }
        [created] Created: { $value }
       *[bookmarked] Bookmarked: { $value }
    }

# Notes shown on the pane's strip after a bookmark action. $page: the page
# label.
weavero-bm-note-pinned-page = Bookmark pinned on page { $page }. Drag the pin to adjust.
weavero-bm-note-pinned = Bookmark pinned. Drag the pin to adjust.
weavero-bm-note-added-pin = Bookmark added. Drag the pin to adjust.
weavero-bm-note-added-selection = Bookmark added from selection.
weavero-bm-note-text-not-located = The bookmarked text could not be located.
weavero-bm-note-no-text-stayed = No text there — the bookmark stayed put.
# Copy to Outline on bookmarks: none had a text region, or how many became
# outline entries ($count).
weavero-bm-note-copy-nothing = Nothing to copy — no selection region on the bookmark.
weavero-bm-note-copied-outline = { $count ->
        [1] Copied { $count } bookmark to the outline.
       *[other] Copied { $count } bookmarks to the outline.
    }

# Submenus of a bookmark's right-click menu in the reader (the reader's
# menus take the label as plain text): add a bookmark here, or to the
# library.
weavero-menu-bm-add-bookmark-more =
    .label = Add Bookmark…
weavero-menu-bm-add-library-bookmark =
    .label = Add Library Bookmark…
# The right-click menu of the reader's page thumbnails. $count: the selected
# pages.
weavero-menu-bm-thumb-add-pages =
    .label = { $count ->
        [1] Add This Page to Bookmarks
       *[other] Add These { $count } Pages to Bookmarks
    }

# ---- Reader panels, shared words (reader-panels.ts) ----

# The default name of an entry or a bookmark made from a text selection
# whose text is empty.
weavero-rpanel-selection-default = Selection
# The default name of an outline entry or a bookmark pinned to a spot of a
# web snapshot or an EPUB (no page to name it by).
weavero-rpanel-pinned-spot = Pinned spot
# Where an entry or a bookmark points within its page: a tooltip on the
# row's icon, and the choices of the Edit Position dialog. $anchor: point (a
# pinned spot), top or bottom.
weavero-rpanel-anchor = { $anchor ->
        [point] Pinned spot
        [bottom] Bottom of page
       *[top] Top of page
    }
# The page number at the right of an outline entry or a bookmark. $page: the
# page label.
weavero-rpanel-page-short = p. { $page }
# Tooltip of a pin drawn on the page that can be dragged.
weavero-rpanel-pin-drag-tip = Drag to move

# Headings and rows of the right-click menus of the Outline and Bookmarks
# tabs: the page numbers beside the entries, shown or hidden in this
# document.
weavero-rpanel-page-numbers = Page numbers
weavero-rpanel-page-numbers-show = Show
weavero-rpanel-page-numbers-hide = Hide
# A sort menu's heading (the annotations' and the bookmarks').
weavero-rpanel-sort-by = Sort by

# The header buttons of the reader's filter popups (annotations, bookmarks):
# clear every filter and keep the popup open (the button's text, tooltip and
# spoken name), or clear and close it (the red ×).
weavero-rpanel-filter-clear = Clear
    .title = Clear all filters (keep this window open)
    .aria-label = Clear all filters
weavero-rpanel-filter-clear-close = Clear and Close

# Notes shown on the pane's strip while placing a pin or picking text.
weavero-rpanel-note-select-text = Select text in the document (Esc to cancel).
weavero-rpanel-note-cancelled = Cancelled.
weavero-rpanel-note-drop-pin = Move to a spot and click to drop the pin (Esc to cancel).
weavero-rpanel-note-pin-cancelled = Pin cancelled.
weavero-rpanel-note-no-text = No text at that point.
weavero-rpanel-note-no-position = Could not read that position.
weavero-rpanel-note-rm-jump = Turn off Reading Mode to jump to this location.

# An annotation's type name, the default name of a bookmark of an
# annotation with no text or comment (and the kind shown in its hover
# card). $type: highlight, underline, note, text, image, ink, or another
# value for an unknown type.
weavero-rpanel-ann-kind = { $type ->
        [highlight] Highlight
        [underline] Underline
        [note] Note
        [text] Text annotation
        [image] Image annotation
        [ink] Ink annotation
       *[other] Annotation
    }

# The Edit Position dialog (an outline entry's page and place; a page
# bookmark's name, page, place and comment): its field captions, the button
# that puts the default name back, its OK button.
weavero-rpanel-dialog-name = Name
weavero-rpanel-dialog-reset-name = Reset
weavero-rpanel-dialog-position = Position
weavero-rpanel-dialog-ok = OK
# The page field's caption. $count: the document's page count, or 0 when
# unknown; $max: the same count as printed (no digit grouping, as the number
# box beside it).
weavero-rpanel-dialog-page = { $count ->
        [0] Page
       *[other] Page (1–{ $max })
    }
# The default name a page bookmark would take, under the Name field. $name:
# that name ("Page 12").
weavero-rpanel-dialog-default-name = Default name: { $name }

# View -> Layout, in a reader tab: the reader's own panes (a checkbox each).
# "Outline Pane" is Better Notes' pane in a note tab.
weavero-rpanel-layout-sidebar =
    .label = Sidebar
weavero-rpanel-layout-outline =
    .label = Outline Pane
weavero-rpanel-layout-context-pane =
    .label = Context Pane
weavero-rpanel-layout-selector =
    .label = Colour and Tag Selector
# The Layout submenu of a separate reader window's View menu, when no main
# window gives Zotero's own word.
weavero-rpanel-layout-menu =
    .label = Layout

# Tooltip of the pill on the colour and tag selector at the foot of the
# annotations pane. $state: open; folded; or folded-marked (folded while a
# colour or tag is selected).
weavero-rpanel-selector-handle-tip = { $state ->
        [folded-marked] Show the colour and tag selector (a selection is active: it filters the pane and the document)
        [folded] Show the colour and tag selector
       *[open] Hide the colour and tag selector
    }

# The reader's page-thumbnail menu: copies zotero:// links to the selected
# pages. $count: the selected pages.
weavero-rpanel-thumb-copy-links =
    .label = { $count ->
        [1] Copy Link to This Page
       *[other] Copy Links to { $count } Pages
    }

# ---- Annotations pane: sort and dates (reader-panels.ts) ----

# The bar above the annotations list while a sort is in force: its title,
# the dropdown's tooltip, and the arrow that flips the direction.
weavero-rpanel-ann-title = Annotations
weavero-rpanel-ann-sort-tip = Annotation sort
weavero-rpanel-ann-sort-direction = Toggle sort direction
# A sort field, on the bar and in the sort menu (right-click the Annotations
# tab). $field: position, dateAdded, dateModified or manual.
weavero-rpanel-ann-sort-field = { $field ->
        [position] Position
        [dateAdded] Date Added
        [dateModified] Date Modified
        [manual] Manual
       *[other] { $field }
    }
# The sort menu's row for the order the user dragged the cards into.
weavero-rpanel-ann-sort-manual-row = Manual (drag to reorder)
# The sort menu's heading over the dates shown on the cards.
weavero-rpanel-ann-show-on-cards = Show on cards
# The date lines at the bottom of an annotation card. $date: the date.
weavero-rpanel-ann-date-added = Added: { $date }
weavero-rpanel-ann-date-modified = Modified: { $date }
# The tooltip of the card's header and date lines. $date: the full date and
# time (and, for the modification in a group library, who made it).
weavero-rpanel-ann-date-added-full = Date Added: { $date }
weavero-rpanel-ann-date-modified-full = Date Modified: { $date }

# ---- Annotation filters: the reader's funnel and the annotations pane's (reader-panels.ts) ----

# Tooltip of the funnel on the reader's toolbar.
weavero-annfilter-toolbar-tip = Filter annotations
# The filter popup's title: the pane's own funnel (list), which filters only
# the annotations pane, or the reader toolbar's (reader), which also hides
# them on the page. Also the pane funnel's spoken name.
weavero-annfilter-popup-title = { $kind ->
        [list] Filter Annotations Pane
       *[reader] Filter Annotations
    }
# The popup with no annotation in the document.
weavero-annfilter-empty = No annotations in this document.

# Tooltip of the pane's funnel: the first line, then what the filter does in
# this document. $state: departs (this document has its own filter) or
# default (it follows the default filter); $hidden: annotations hidden from
# the pane.
weavero-annfilter-pane-tip-head = Filter Annotations Pane (the document keeps every annotation)
weavero-annfilter-pane-tip-state = { $state ->
        [departs] { $hidden ->
            [0] This document departs from the default — every annotation shown
            [1] This document departs from the default — hides { $hidden } annotation here
           *[other] This document departs from the default — hides { $hidden } annotations here
        }
       *[default] { $hidden ->
            [0] Following the default — every annotation shown
            [1] Following the default — hides { $hidden } annotation here
           *[other] Following the default — hides { $hidden } annotations here
        }
    }

# The pane popup's header buttons while a default filter exists: Clear All
# (this document shows everything, over the default), Reset (back to the
# default) and the red × (back to the default, then close).
weavero-annfilter-clear-all = Clear All
    .title = Show every annotation in this document. This document's own choice: the default stays as it is; Reset follows it again.
weavero-annfilter-reset = Reset
    .title = Back to Default
weavero-annfilter-back-close = Back to Default and Close

# The pane popup's footer: how many annotations the filter hides. $hidden:
# the hidden ones; $total: all annotations of the document.
weavero-annfilter-count = { $hidden ->
        [0] Every annotation shown
       *[other] { $hidden } of { $total } hidden from the pane
    }
    .title = The document still holds every annotation; only this pane is filtered.
# The footer's scope line. $scope: document (this document has its own
# filter) or default (the filter shown is the default of every document).
weavero-annfilter-scope = { $scope ->
        [document] This Document Only
       *[default] Default for All Documents
    }
    .title = { $scope ->
        [document] This document has its own filter; other documents follow the default.
       *[default] This filter is the default every document starts from.
    }
# The footer's note on the default filter where this document departs from
# it. $all: yes when the default shows everything; $parts: what the default
# filter sets, as a list of the short labels below; $hidden: the
# annotations the default would hide in this document.
weavero-annfilter-default-note = { $all ->
        [yes] { $hidden ->
            [0] Default: everything · hides none here
           *[other] Default: everything · hides { $hidden } here
        }
       *[no] { $hidden ->
            [0] Default: { $parts } · hides none here
           *[other] Default: { $parts } · hides { $hidden } here
        }
    }
# The note's tooltip: this line, the default's short labels one per line (or
# the next message), then the last line.
weavero-annfilter-default-note-tip = The default filter, which this document does not use:
weavero-annfilter-default-shows-everything = (shows everything)
weavero-annfilter-default-note-reset = Reset applies it here.
# The footer's buttons: make this document's filter the default, or clear
# the default.
weavero-annfilter-use-default = Use as Default
    .title =
        Make this filter, exactly as it stands, the default for every document
        Alt+click to ADD its chips to the existing default instead of replacing it
weavero-annfilter-clear-default = Clear Default
    .title = Show every annotation in every document again (clears the default, not this document)
# Added to the tooltip of a chip that belongs to the default filter.
weavero-annfilter-part-of-default = Part of the default filter

# Short labels of what a filter sets, listed in the footer's note (one per
# chip). A chip excluded with Alt+click reads "not ..."; $name: the chip's
# label.
weavero-annfilter-desc-not = not { $name }
# A person chip. $who: added or modified; $name: the person.
weavero-annfilter-desc-person = { $who ->
        [added] added by { $name }
       *[modified] modified by { $name }
    }
# A Has / No chip. $flag: comment, tag, related, link (an external link),
# itemLinks or backlinks; $has: yes (Has ...) or no (No ...).
weavero-annfilter-flag = { $flag ->
        [comment] { $has ->
            [yes] Has Comment
           *[no] No Comment
        }
        [tag] { $has ->
            [yes] Has Tag
           *[no] No Tag
        }
        [related] { $has ->
            [yes] Has Related
           *[no] No Related
        }
        [link] { $has ->
            [yes] Has External Link
           *[no] No External Link
        }
        [itemLinks] { $has ->
            [yes] Has Item Links
           *[no] No Item Links
        }
       *[backlinks] { $has ->
            [yes] Has Backlinks
           *[no] No Backlinks
        }
    }
# A time unit, abbreviated, in these short labels. $unit: m (minutes), h
# (hours), y (years) or d (days).
weavero-annfilter-unit-short = { $unit ->
        [m] min
        [h] h
        [y] y
       *[d] d
    }
# A date chip: the last N units. $field: added or modified; $neg: yes when
# excluded (outside the window); $count: N; $unit as just above.
weavero-annfilter-desc-date-last = { $field ->
        [added] { $neg ->
            [yes] Added: not last { $count } { weavero-annfilter-unit-short }
           *[no] Added: last { $count } { weavero-annfilter-unit-short }
        }
       *[modified] { $neg ->
            [yes] Modified: not last { $count } { weavero-annfilter-unit-short }
           *[no] Modified: last { $count } { weavero-annfilter-unit-short }
        }
    }
# A date chip: a custom range. $field, $neg as above; $from, $to: the dates
# (… when open).
weavero-annfilter-desc-date-range = { $field ->
        [added] { $neg ->
            [yes] Added: not { $from } to { $to }
           *[no] Added: { $from } to { $to }
        }
       *[modified] { $neg ->
            [yes] Modified: not { $from } to { $to }
           *[no] Modified: { $from } to { $to }
        }
    }

# Tooltip of a colour chip or an annotation-type chip. $name: the colour's
# or the type's name (or a hex code for a colour outside Zotero's palette).
weavero-annfilter-chip-tip = { $name } — Alt+click to exclude
# The black colour chip's name, when Zotero's palette gives none.
weavero-annfilter-color-black = Black
# Tooltip of a tag chip. $tag: the tag.
weavero-annfilter-tag-tip = Tag: { $tag } — Alt+click to exclude
# Tooltip of a Has tile. $tile: comment, tag, related, link (a link leaving
# Zotero), itemLinks or backlinks.
weavero-annfilter-tile-tip = { $tile ->
        [comment] Has Comment — annotations with non-empty comment text. Alt+click to exclude.
        [tag] Has Tag — annotations with at least one tag. Alt+click to exclude.
        [related] Has Related — annotations with at least one related-item link. Alt+click to exclude.
        [link] Has External Link — annotations whose comment contains a link that leaves Zotero (https://, mailto:, app links); a zotero:// link is Has Item Links'. Alt+click to exclude.
        [itemLinks] Has Item Links — annotations whose comment links another Zotero item. Alt+click to exclude.
       *[backlinks] Has Backlinks — annotations another comment or note links to. Alt+click to exclude.
    }
# Headings over the people rows and the date rows. $head: addedBy, modifiedBy
# or date.
weavero-annfilter-head = { $head ->
        [addedBy] Added by
        [modifiedBy] Modified by
       *[date] Date
    }
# Tooltip of a person chip. $who: added or modified; $name: the person.
weavero-annfilter-person-tip = { $who ->
        [added] Added by { $name } — Alt+click to exclude
       *[modified] Modified by { $name } — Alt+click to exclude
    }

# The date rows. A row's label. $field: added or modified.
weavero-annfilter-date-field = { $field ->
        [added] Added
       *[modified] Modified
    }
# A time unit, in full: the unit button and its menu. $unit: m, h, y or d.
weavero-annfilter-unit = { $unit ->
        [m] minutes
        [h] hours
        [y] years
       *[d] days
    }
# The rolling window: the Last chip (then a number box and the unit button)
# and its tooltip. $field: added or modified; $unit: the unit in force.
weavero-annfilter-date-last = Last
weavero-annfilter-date-last-tip = { $field ->
        [added] Added within the last N { weavero-annfilter-unit } — Alt+click to exclude
       *[modified] Modified within the last N { weavero-annfilter-unit } — Alt+click to exclude
    }
# The number box's spoken name. $field: added or modified.
weavero-annfilter-date-window-aria = { $field ->
        [added] Added window size
       *[modified] Modified window size
    }
# Tooltip of the unit button.
weavero-annfilter-unit-tip = Unit of the window
# The Custom chip (a date range) and its tooltip. $field: added or modified.
weavero-annfilter-date-custom = Custom
weavero-annfilter-date-custom-tip = { $field ->
        [added] Custom added date range — Alt+click to exclude
       *[modified] Custom modified date range — Alt+click to exclude
    }
# The range's two bounds, before each date box. $bound: from or to.
weavero-annfilter-bound = { $bound ->
        [from] from
       *[to] to
    }
# A date box's spoken name. $field: added or modified; $bound: from or to.
weavero-annfilter-range-aria = { $field ->
        [added] { $bound ->
            [from] Added range from
           *[to] Added range to
        }
       *[modified] { $bound ->
            [from] Modified range from
           *[to] Modified range to
        }
    }
# Heading of the calendar opened from a date box. $field, $bound as above.
weavero-annfilter-cal-head = { $field ->
        [added] { $bound ->
            [from] Added — from
           *[to] Added — to
        }
       *[modified] { $bound ->
            [from] Modified — from
           *[to] Modified — to
        }
    }
# A date box's tooltip: a date that contradicts the other bound is not used.
# $bound: from or to.
weavero-annfilter-bound-invalid = { $bound ->
        [from] Not applied — after the 'to' date
       *[to] Not applied — before the 'from' date
    }
# A date box's tooltip while its date filters. $bound: from or to; $date:
# the date.
weavero-annfilter-bound-applied = { $bound ->
        [from] Filtering from { $date }
       *[to] Filtering to { $date }
    }
# Tooltip of the × after a date box. $bound: from or to.
weavero-annfilter-bound-clear = { $bound ->
        [from] Clear from
       *[to] Clear to
    }
# Tooltip of a calendar day that would put the range upside down.
weavero-annfilter-cal-conflict = Would conflict with the other bound

# The checkbox at the foot of the toolbar funnel's popup, and its tooltip.
weavero-annfilter-hide-reader = Hide Annotations in the Reader
    .title = Hide the annotation marks in the document view (the sidebar list is unaffected).

# ---- Outline: the reader's Outline pane (reader-panels.ts) ----

# The pane's title.
weavero-outline-title = Outline
# Weavero's own Outline tab in the reader sidebar's tab strip, shown only while
# another plugin hides Zotero's Outline button: its tooltip and accessible name.
weavero-outline-entry-tip = Outline (Weavero)
# The header's + button.
weavero-outline-add-tip = Add a new outline entry
# The source chip at the right of the header: where the outline comes from.
# $source: embedded (the document's own), weavero (the outline the user edited:
# "Edited"), zotero (Zotero's own outline, as Zotero stores it), none,
# readingMode (made by Reading Mode) or extracted (Weavero's, detected from
# Zotero's structure data).
weavero-outline-source = { $source ->
        [embedded] Embedded
        [weavero] Edited
        [zotero] Zotero
        [none] None
        [readingMode] Reading Mode
       *[extracted] Extracted
    }
# The source chip's tooltip (outline2.5; MJT 2026-11-24: "The tooltip should
# explain what each label means"): its first line. $switch: yes when a click
# switches the source (the document has more than one), else no.
weavero-outline-source-head = { $switch ->
        [yes] The outline’s source (click to switch):
       *[no] The outline’s source:
    }
# What each source is, after its name in the chip's tooltip and on the rows
# of its menu (lower case: it follows "Name: "). $source as in
# weavero-outline-source.
weavero-outline-source-meaning = { $source ->
        [embedded] the outline saved inside the document file
        [weavero] your edited copy of this outline
        [zotero] Zotero’s own extracted outline, unchanged
        [zoteroSame] Zotero’s own extracted outline, unchanged — Weavero’s extraction is identical for this PDF
        [embeddedSame] the outline saved inside the document file — Weavero’s extraction is identical for this PDF
        [embeddedFirst] the outline saved inside the document file — shown first: Weavero’s extraction disagrees with it
        [none] no outline was found in this document
        [readingMode] the headings of Reading Mode’s text (Reading Mode only)
       *[extracted] Weavero’s outline, built from Zotero’s structure data for this PDF
    }
# One source in the chip's tooltip and on a menu row: $label is its name
# (weavero-outline-source), $meaning what it is (weavero-outline-source-
# meaning). $current: yes on the source shown (marked), else no.
# (weavero-outline-source-meaning's zoteroSame: Zotero's outline when Weavero's
# extraction came out identical to it, so no separate Extracted is offered.)
# (embeddedSame: the file's own outline when Weavero's extraction came out identical to it;
# embeddedFirst: shown first because Weavero's extraction disagrees with the file's good bookmarks.)
weavero-outline-source-line = { $current ->
        [yes] ✓ { $label }: { $meaning }
       *[no] { $label }: { $meaning }
    }
# The chip's tooltip, last line, while the edited outline is shown.
weavero-outline-source-delete-hint = Right-click to delete the edited outline.
# Weavero's extracted outline: the entry it adds at a reference list that has no title (outline2.10).
weavero-outline-references = References
# A developer tool (outline-extraction evaluation): the header button's
# tooltip. $verdict: good, bad, scan (no text layer) or none.
weavero-outline-eval-tip = { $verdict ->
        [good] Evaluate this outline’s extraction (developer tool): marked Good
        [bad] Evaluate this outline’s extraction (developer tool): marked Bad
        [scan] Evaluate this outline’s extraction (developer tool): marked Scan (no text layer)
       *[none] Evaluate this outline’s extraction (developer tool): not marked
    }

# The empty pane. $state: curated (an empty Weavero outline), extracting
# (Zotero is still looking for one) or none.
weavero-outline-empty = { $state ->
        [curated] Your outline is empty.
        [extracting] Extracting outline…
       *[none] No outline for this document.
    }
# Under an empty Weavero outline: how to add entries (names the menu entry).
weavero-outline-empty-hint = Select text in the document, then right-click → { weavero-menu-reader-add-selection-outline.label }.
# The button that starts a Weavero outline in a document without one.
weavero-outline-create-button = Create an Outline
    .title = Start an editable outline for this document
# A search in the pane that finds no entry.
weavero-outline-search-no-match = No outline entries match the search.

# Tooltips on an entry's row: its title, the icon of a "box" entry (a
# sidebar or a box in the document).
weavero-outline-row-tip = Double-click to rename, right-click for more
weavero-outline-kind-box-tip = Sidebar / box
# The name given to an entry pinned to a spot of a PDF. $page: the page
# label.
weavero-outline-pin-title = Page { $page } pin

# The Outline tab's right-click menu: headings, the shortcut hint of the
# expand/collapse rows ($key: + or −, after the double-click on the row it
# would perform), the text sizes. $size: zotero (the size of Zotero's own
# outline), itemPane (the item pane's) or fixed (a size in pixels, in a
# submenu).
weavero-outline-entries-tree = Entries Tree
weavero-outline-hint-dblclick = Double-click, { $key }
weavero-outline-text-size = Text size
weavero-outline-size = { $size ->
        [zotero] Zotero Outline
        [itemPane] Zotero Item Pane
       *[fixed] Fixed
    }
# The same sizes with their current pixel size. $px: the size in pixels.
weavero-outline-size-label = { $size ->
        [zotero] Zotero Outline, { $px } px
       *[itemPane] Zotero Item Pane, { $px } px
    }

# Tooltip of an entry's "Reset to Original Name and Region" menu row.
# $exact: yes when the original region is known exactly (else it is
# detected again from the name); $name: the original name.
weavero-outline-reset-original-tip = { $exact ->
        [yes] Name and region back to the original: “{ $name }”.
       *[no] Name back to “{ $name }”; the region is detected again from that name.
    }

# The confirm dialog of "Delete Weavero Outline…": the question, then what
# is lost and how to get it back. $what: the counts below, joined by ", ";
# $accel: the Undo shortcut, or none.
weavero-outline-revert-question = Delete the edited outline of this document?
weavero-outline-revert-detail = { $accel ->
        [none] Your edited outline ({ $what }) is deleted; Undo in this tab brings it back. The document's own outline is not changed.
       *[other] Your edited outline ({ $what }) is deleted; Undo ({ $accel }) in this tab brings it back. The document's own outline is not changed.
    }
# The counts in that message. $what: entries (all of them), renamed, or
# added (by the user); $count: how many.
weavero-outline-revert-count = { $what ->
        [renamed] { $count } renamed
        [added] { $count } added by you
       *[entries] { $count } entries
    }

# The title prompt of a new entry (the dialog's title is "Weavero").
weavero-outline-prompt-new-title = New outline entry title:
# The Edit Position dialog of a page entry: its title.
weavero-outline-edit-position-title = Edit Position

# The region editor (handles on the page around an entry's or a bookmark's
# text): its buttons, and the note shown while it is open. $what: title (an
# outline entry) or label (a bookmark), what Save Region and Text reloads.
weavero-outline-region-save-text = Save Region and Text
weavero-outline-region-save = Save Region
weavero-outline-note-region-editor = { $what ->
        [label] Drag the handles to reshape the region — { weavero-outline-region-save-text } also reloads the label; { weavero-outline-region-save } keeps it. (Enter = { weavero-outline-region-save-text }, Esc = cancel.)
       *[title] Drag the handles to reshape the region — { weavero-outline-region-save-text } also reloads the title; { weavero-outline-region-save } keeps it. (Enter = { weavero-outline-region-save-text }, Esc = cancel.)
    }

# Notes shown on the pane's strip. $title: an entry's title; $page: a page
# label; $anchor: top or bottom (of the page); $text: the start of the
# selected text.
weavero-outline-note-added-selection = Added “{ $title }” from the selection.
weavero-outline-note-added-selection-text = Added “{ $title }” from selection ({ $text }).
weavero-outline-note-added-selection-plain = Added “{ $title }” from selection.
weavero-outline-note-added-anchor = { $anchor ->
        [bottom] Added “{ $title }” → bottom of page { $page }.
       *[top] Added “{ $title }” → top of page { $page }.
    }
weavero-outline-note-position = { $anchor ->
        [bottom] Position: bottom of page { $page }.
       *[top] Position: top of page { $page }.
    }
weavero-outline-note-pinned = Pinned. Type its title (Enter to keep); drag the pin to adjust.
weavero-outline-note-target-pinned-page = Target pinned on page { $page }. Drag the pin to adjust.
weavero-outline-note-target-pinned = Target pinned. Drag the pin to adjust.
weavero-outline-note-pin-saved = Pin position saved.
weavero-outline-note-target-selection = Target set from selection.
weavero-outline-note-no-pin-rm = Pins can’t be placed in Reading Mode.
weavero-outline-note-anchor-pdf-only = Page anchors are for PDFs only.
weavero-outline-note-pin-gone = This pin's target is no longer in the document — the page rendered differently. Drag a new pin to re-anchor it.
weavero-outline-note-entry-gone = This entry's target is no longer in the document.
weavero-outline-note-rm-not-found = Couldn’t locate this entry in the Reading Mode text.
weavero-outline-note-rm-not-ready = Reading Mode view not ready.
weavero-outline-note-rm-unmapped = Couldn’t map that selection back to the document.
weavero-outline-note-text-not-found-doc = Couldn’t find that text in the document — the region is unchanged.
weavero-outline-note-text-not-found-page = Couldn’t find that text on the page — the region is unchanged.
weavero-outline-note-no-anchor = Couldn’t anchor to that text.
weavero-outline-note-open-pdf-view = Open the PDF view to edit the region.
weavero-outline-note-no-selectable-text = This page has no selectable text to snap to.
# After a rename: names the menu entry that moves the highlight.
weavero-outline-note-title-updated = Title updated. To move the highlight to match, right-click → { weavero-menu-outline-redetect-region.label }.
# Fix Spacing: how many titles it changed ($count), or none (names the menu
# entry that dismisses the offer).
weavero-outline-note-spacing-cleaned = { $count ->
        [1] Cleaned spacing on { $count } title.
       *[other] Cleaned spacing on { $count } titles.
    }
weavero-outline-note-spacing-unchanged = Nothing changed — if a title is already correct, use “{ weavero-menu-outline-spacing-correct.label }” to dismiss.

# The keyboard shortcuts for adding entries (set in Settings): an action's
# name. $action: selection, pin, anchorTop or anchorBottom.
weavero-outline-key-action = { $action ->
        [selection] Add Selected Text to Outline
        [pin] Pin a Spot to Outline
        [anchorTop] Add Top of Page to Outline
       *[anchorBottom] Add Bottom of Page to Outline
    }
# The space bar's name in a shortcut (Ctrl+Space).
weavero-outline-key-space = Space
# What already uses a combination the user records, said in Settings
# ("... is already used by <this>"). $owner names it.
weavero-outline-key-owner = { $owner ->
        [hand] the reader’s Hand tool (and Read Aloud highlight)
        [select] the reader’s Select tool
        [read-aloud] Read Aloud (underline)
        [next-page] next page
        [previous-page] previous page
        [rotate] rotate pages
        [pdf-sidebar] the PDF sidebar
        [colors] the annotation colours
        [navigation] reading and navigation in the reader
        [text-selection] text selection in the reader
        [annotation-tools] the reader’s annotation tools
        [back-forward] Back / Forward in the reader
        [redo] Redo
        [find-previous] Find Previous
        [reopen-tab] Reopen Closed Tab
        [select-all] Select All
        [undo] Undo
        [find] Find
        [find-next] Find Next
        [print] Print
        [copy] Copy
        [cut] Cut
        [paste] Paste
        [close-tab] Close Tab
        [new-main-window] New Main Window
        [zoom-in] Zoom In
        [zoom-out] Zoom Out
        [reset-zoom] Reset Zoom
        [back] Back
        [forward] Forward
        [next-tab] the next tab
        [switch-tabs] switching tabs
       *[menu] a Zotero menu shortcut
    }
# The same, for one of Zotero's configurable shortcuts. $command: its name
# as Zotero's command id spells it ("New note").
weavero-outline-key-owner-zotero = Zotero’s “{ $command }” shortcut (Settings → Advanced → Shortcuts)
# The same, for a menu entry of the main window. $label: the entry.
weavero-outline-key-owner-menu-item = the menu item “{ $label }”
# The same, for another of these outline shortcuts. $label: its action.
weavero-outline-key-owner-action = “{ $label }”

# ---- Undo: steps and the History menu (bookmarks.ts, reader-panels.ts) ----

# The name of an undo step on Weavero's outline, as the History menu, the
# Undo/Redo arrows and Edit -> Undo show it ("Undo Add Outline Entry").
# $action: add, delete, rename, move or edit; $count: the entries changed.
weavero-undo-outline-entries = { $action ->
        [add] { $count ->
            [1] Add Outline Entry
           *[other] Add { $count } Outline Entries
        }
        [delete] { $count ->
            [1] Delete Outline Entry
           *[other] Delete { $count } Outline Entries
        }
        [rename] { $count ->
            [1] Rename Outline Entry
           *[other] Rename { $count } Outline Entries
        }
        [move] { $count ->
            [1] Move Outline Entry
           *[other] Move { $count } Outline Entries
        }
       *[edit] { $count ->
            [1] Edit Outline Entry
           *[other] Edit { $count } Outline Entries
        }
    }
# A step that made several kinds of change; the steps that start and delete
# the whole Weavero outline of a document.
weavero-undo-outline-mixed = Edit Outline
weavero-undo-outline-create = Create Edited Outline
weavero-undo-outline-remove = Delete Edited Outline
# A step on bookmarks, or on bookmark folders. $action: add, delete,
# rename, move or edit; $count: how many changed.
weavero-undo-bm-bookmarks = { $action ->
        [add] { $count ->
            [1] Add Bookmark
           *[other] Add { $count } Bookmarks
        }
        [delete] { $count ->
            [1] Delete Bookmark
           *[other] Delete { $count } Bookmarks
        }
        [rename] { $count ->
            [1] Rename Bookmark
           *[other] Rename { $count } Bookmarks
        }
        [move] { $count ->
            [1] Move Bookmark
           *[other] Move { $count } Bookmarks
        }
       *[edit] { $count ->
            [1] Edit Bookmark
           *[other] Edit { $count } Bookmarks
        }
    }
weavero-undo-bm-folders = { $action ->
        [add] { $count ->
            [1] Add Folder
           *[other] Add { $count } Folders
        }
        [delete] { $count ->
            [1] Delete Folder
           *[other] Delete { $count } Folders
        }
        [rename] { $count ->
            [1] Rename Folder
           *[other] Rename { $count } Folders
        }
        [move] { $count ->
            [1] Move Folder
           *[other] Move { $count } Folders
        }
       *[edit] { $count ->
            [1] Edit Folder
           *[other] Edit { $count } Folders
        }
    }
weavero-undo-bm-mixed = Edit Bookmarks

# The reader's own steps on annotations, named by Weavero. The annotations'
# kind, used inside the messages below: $type: highlight, underline, note,
# text, image, ink, or other (several kinds, or unknown); $count: how many
# annotations.
weavero-undo-ann-kind = { $type ->
        [highlight] { $count ->
            [1] Highlight Annotation
           *[other] Highlight Annotations
        }
        [underline] { $count ->
            [1] Underline Annotation
           *[other] Underline Annotations
        }
        [note] { $count ->
            [1] Note Annotation
           *[other] Note Annotations
        }
        [text] { $count ->
            [1] Text Annotation
           *[other] Text Annotations
        }
        [image] { $count ->
            [1] Image Annotation
           *[other] Image Annotations
        }
        [ink] { $count ->
            [1] Ink Annotation
           *[other] Ink Annotations
        }
       *[other] { $count ->
            [1] Annotation
           *[other] Annotations
        }
    }
# A step: $action: add, delete, convert, merge, move (dragged), resize or
# edit; $type and $count as above.
weavero-undo-ann-step = { $action ->
        [add] { $count ->
            [1] Add { weavero-undo-ann-kind }
           *[other] Add { $count } { weavero-undo-ann-kind }
        }
        [delete] { $count ->
            [1] Delete { weavero-undo-ann-kind }
           *[other] Delete { $count } { weavero-undo-ann-kind }
        }
        [convert] { $count ->
            [1] Convert { weavero-undo-ann-kind }
           *[other] Convert { $count } { weavero-undo-ann-kind }
        }
        [merge] { $count ->
            [1] Merge { weavero-undo-ann-kind }
           *[other] Merge { $count } { weavero-undo-ann-kind }
        }
        [move] { $count ->
            [1] Move { weavero-undo-ann-kind }
           *[other] Move { $count } { weavero-undo-ann-kind }
        }
        [resize] { $count ->
            [1] Resize { weavero-undo-ann-kind }
           *[other] Resize { $count } { weavero-undo-ann-kind }
        }
       *[edit] { $count ->
            [1] Edit { weavero-undo-ann-kind }
           *[other] Edit { $count } { weavero-undo-ann-kind }
        }
    }
# A step that changed one field of the annotations. $field: comment, tags,
# text, pageNumber, fontSize or position.
weavero-undo-ann-field = { $field ->
        [comment] Comment
        [tags] Tags
        [text] Text
        [pageNumber] Page Number
        [fontSize] Font Size
       *[position] Position
    }
weavero-undo-ann-edit-field = { $count ->
        [1] Edit { weavero-undo-ann-kind } { weavero-undo-ann-field }
       *[other] Edit { weavero-undo-ann-field } of { $count } { weavero-undo-ann-kind }
    }
weavero-undo-ann-change-color = { $count ->
        [1] Change { weavero-undo-ann-kind } Color
       *[other] Change Color of { $count } { weavero-undo-ann-kind }
    }
# A reader step with no name of its own.
weavero-undo-ann-change = Annotation Change

# The plain Undo / Redo (nothing to name), and Undo / Redo with a step's
# name, where this Zotero has no words of its own for them. $dir: undo or
# redo; $label: the step's name.
weavero-undo-plain = { $dir ->
        [undo] Undo
       *[redo] Redo
    }
weavero-undo-action = { $dir ->
        [undo] Undo { $label }
       *[redo] Redo { $label }
    }
# Tooltip of the Undo / Redo arrows on the reader's toolbar. $action:
# "Undo <step>" (or the plain word); $accel: the shortcut.
weavero-undo-button-tip =
    { $action } ({ $accel })
    Right-click: history

# Notes shown on the pane's strip after an undo or a redo. $dir: undo or
# redo; $label: the step's name; $done: the steps run before one failed;
# $count: the steps run.
weavero-undo-note-done = { $dir ->
        [undo] Undone: { $label }
       *[redo] Redone: { $label }
    }
weavero-undo-note-stopped = { $dir ->
        [undo] { $done ->
            [0] Stopped: could not undo { $label }
           *[other] Stopped: could not undo { $label } ({ $done } done)
        }
       *[redo] { $done ->
            [0] Stopped: could not redo { $label }
           *[other] Stopped: could not redo { $label } ({ $done } done)
        }
    }
weavero-undo-note-steps = { $dir ->
        [undo] Undone: { $count } steps
       *[redo] Redone: { $count } steps
    }

# The History menu (right-click the arrows or a pane's header): its
# heading, and the headings of its two lists. $dir: undo or redo.
weavero-undo-history = History
weavero-undo-history-list = { $dir ->
        [undo] Undo history
       *[redo] Redo history
    }
# Which pane a step belongs to (the row's icon tooltip, first in the row's
# tooltip). $stack: reader (annotations), bookmarks-lib (the library's
# bookmarks), bookmarks-doc (this document's) or outline.
weavero-undo-stack = { $stack ->
        [reader] Annotations
        [bookmarks-lib] Bookmarks (library)
        [bookmarks-doc] Bookmarks (this document)
       *[outline] Outline
    }
# How long ago a step ran, at the right of its row. $unit: now, min, h or
# d; $count: how many.
weavero-undo-ago = { $unit ->
        [now] just now
        [min] { $count } min ago
        [h] { $count } h ago
       *[d] { $count } d ago
    }
# A row's tooltip: what a click undoes (the step, and the $count steps that
# must go with it), then how to tick it. $dir: undo or redo; $stack: the
# pane's name (weavero-undo-stack); $reach: the first message.
weavero-undo-row-reach = { $dir ->
        [undo] { $count ->
            [0] Undo this step
            [1] Undo this step and the { $count } that goes with it
           *[other] Undo this step and the { $count } that go with it
        }
       *[redo] { $count ->
            [0] Redo this step
            [1] Redo this step and the { $count } that goes with it
           *[other] Redo this step and the { $count } that go with it
        }
    }
weavero-undo-row-tip =
    { $stack } — { $reach }
    Ctrl+click or the box: tick it
weavero-undo-row-tip-plain =
    { $reach }
    Ctrl+click or the box: tick it
# Added to that tooltip: why the row cannot go alone. $kind: reader (an
# annotation step) or other; $count: the steps above it.
weavero-undo-row-dependent = { $kind ->
        [reader] { $count ->
            [1] The step above changed the same annotation
           *[other] The steps above changed the same annotations
        }
       *[other] { $count ->
            [1] The step above touched the same entries
           *[other] The steps above touched the same entries
        }
    }
# Tooltip of a row's check box. $state: auto (ticked because a ticked step
# needs it), on (ticked by the user) or off; $dir: undo or redo.
weavero-undo-tick-tip = { $state ->
        [auto] { $dir ->
            [undo] Needed by your pick: undone together
           *[redo] Needed by your pick: redone together
        }
        [on] Ticked
       *[off] { $dir ->
            [undo] Tick to undo with others
           *[redo] Tick to redo with others
        }
    }
# The row that shows older steps ($count: how many more it shows), and its
# hint ($count: how many are left).
weavero-undo-show-older = { $count ->
        [1] Show { $count } older step
       *[other] Show { $count } older steps
    }
weavero-undo-more = { $count } more
# The list's last row, which runs the ticked steps, and its tooltip. $dir:
# undo or redo; $count: the ticked steps.
weavero-undo-run-selected = { $dir ->
        [undo] Undo { $count } selected
       *[redo] Redo { $count } selected
    }
weavero-undo-run-tip = { $dir ->
        [undo] Undo every ticked step, in order
       *[redo] Redo every ticked step, in order
    }

# ---- Reader: comment popup, badges, standalone reader windows (reader.ts) ----

# The comment popup (a click on an annotation's link icon): the button beside
# each extra link that copies it, its tooltip, and the line above the links
# found in the comment's markup but not in its text.
weavero-reader-copy-url = Copy
weavero-reader-copy-url-tip = Copy URL to clipboard
weavero-reader-comment-extra-links = Additional links in comment:

# Tooltip of the link badge drawn over an annotation in an EPUB or snapshot
# page; a click opens the annotation's comment.
weavero-reader-open-comment-tip = Open comment

# A clickable line in a reader sidebar annotation with no comment yet, shown
# when the Annotation Markdown plugin has hidden Zotero's empty comment box;
# a click opens the box to type a comment.
weavero-reader-am-add-comment = Add comment…

# Tooltip of the reader toolbar button, in a standalone reader window, that
# moves the document into a tab of the main window.
weavero-reader-move-to-tab-tip = Move this reader into a tab in the main Zotero window

# The "+" button at the end of a standalone reader window's tab strip: its
# spoken name, and its tooltip. $shortcut: the keyboard shortcut, e.g. Ctrl+T.
weavero-reader-newtab = New tab
weavero-reader-newtab-tip = New tab — open a library item ({ $shortcut })

# A standalone reader window's "List all tabs" popup: tooltip of the gear
# button (display settings of the list), and of the funnel button (filter by
# the kind of document).
weavero-reader-tablist-settings = Tabs menu settings
weavero-reader-tablist-filetype-tip = Filter tabs by attachment file type. Click in the popup to filter, Alt+click to exclude.

# The window buttons at the end of the tab strip of a standalone reader or
# note window whose title bar is hidden (tooltips, also their spoken names).
# Use the words the system and Firefox use for these buttons. Restore replaces
# Maximize while the window is maximized.
weavero-reader-window-minimize = Minimize
weavero-reader-window-maximize = Maximize
weavero-reader-window-restore = Restore
weavero-reader-window-close = Close

# Tooltip (and spoken name) of the ☰ button that opens the application menu
# in a standalone reader or note window without a title bar, as Firefox's ☰
# does.
weavero-reader-app-menu = Open application menu

# Alerts when a main window cannot be turned into a reader window: it is the
# only main window left, or it has no PDF, EPUB or snapshot tab to carry over.
weavero-reader-convert-last-main-window = This is the last main window. Open another main window first, then convert this one.
weavero-reader-convert-no-documents = No document tabs to move — a reader window needs at least one open PDF, EPUB or snapshot tab.

# ---- Related items popup in the reader (reader.ts) ----

# The popup listing an annotation's related items (Zotero's Related): the "+"
# button in its header, which adds a related item (spoken name, then tooltip).
weavero-related-add-label = Add related item
weavero-related-add-tip = Add related item…
# The popup's line when the annotation has no related item.
weavero-related-empty = No related items.
# Tooltip (and spoken name) of the "−" button on a related item's row: it
# removes the relation.
weavero-related-remove = Remove
# Alert when the items chosen to relate are in another library than the
# annotation (the same message Zotero shows in its Related section).
weavero-related-different-libraries = You cannot relate items in different libraries.

# ---- Notes: note tabs in reader windows, link editor (reader.ts, note-editor.ts) ----

# The title of a note's tab in a standalone reader or note window when the
# note has no title yet.
weavero-note-tab-fallback-title = Note

# The small box that edits a link in a note: the label of the field holding
# the link's text, the label of the field holding its address, and the button
# that applies the change.
weavero-note-link-edit-text = Text
weavero-note-link-edit-url = URL
weavero-note-link-edit-apply = Apply

# ---- Note outline (note-nav.ts) ----

# The outline panel beside a note, listing its headings: its title, the
# search button's tooltip and the search box's placeholder (also their spoken
# names), and the note toolbar button that shows or hides the panel.
weavero-notenav-title = Outline
weavero-notenav-filter = Filter headings
weavero-notenav-toggle = Toggle Outline
# The panel's line when the note has no heading, and when no heading holds
# the text typed in the search box.
weavero-notenav-empty = No headings in this note.
weavero-notenav-no-match = No headings match the search.
# Warnings in the broken-link notice: a link to a heading cannot be made in a
# read-only note; a link points to a heading the note no longer has.
weavero-notenav-heading-link-readonly = This note is read-only, so its heading cannot get a link anchor.
weavero-notenav-heading-missing = The heading this link points to is no longer in the note.

# ---- List All Tabs: libraries, filters, settings (tabs.ts) ----

# A count of tabs, shown after a window's or a session's name in List All
# Tabs, and in the status lines of the Manage Window and tab group panels.
# $count: the number of tabs.
weavero-tabs-tab-count = { $count ->
        [1] { $count } tab
       *[other] { $count } tabs
    }

# Tooltip of the annotation-count badge at the end of a tab's row in List All
# Tabs. $count: the document's annotations.
weavero-tabs-annotation-count = { $count ->
        [1] { $count } annotation
       *[other] { $count } annotations
    }

# List All Tabs sorted by library: the header of the section holding tabs
# whose library is unknown.
weavero-tabs-library-other = Other
# A library header when the library has no name. $id: the library's number.
weavero-tabs-library-fallback = Library { $id }
# A library sub-header inside a window when the library has no name.
weavero-tabs-library-unnamed = Library
# Tooltip of the tick box at the right of a library header.
weavero-tabs-library-tick = Click to filter to this library, Alt+click to exclude. Click again to clear.

# The funnel button beside List All Tabs' search field: its tooltip.
weavero-tabs-filetype-button = Filter tabs by attachment file type. Click in the popup to filter, Alt+click to exclude.
# The gear button beside the search field: its tooltip.
weavero-tabs-settings-button = Tabs menu settings
# The × in the search field: its tooltip (and spoken name).
weavero-tabs-filter-clear = Clear filter

# The funnel's popup. The hint at the top left.
weavero-tabs-filter-hint = Alt+click to exclude
# The button that clears every tab filter and keeps the popup open: its text,
# its tooltip and its spoken name.
weavero-tabs-filter-clear-all = Clear
    .title = Clear all tab filters (keep this window open)
    .aria-label = Clear all tab filters
# The red × that clears every tab filter and closes the popup (tooltip).
weavero-tabs-filter-clear-close = Clear and Close
# Tooltip of a file-type tile. $type: the file type (PDF, EPUB, Snapshot...).
weavero-tabs-filetype-option = { $type } — click to include, Alt+click to exclude.
# The tile for note tabs (Zotero's Note item type).
weavero-tabs-filetype-note = Note
# Tooltip of a library's row in the popup. $name: the library's name.
weavero-tabs-library-chip = { $name } — click to show only this library, Alt+click to exclude.

# The gear's popup: two checkboxes.
weavero-tabs-settings-sort-by-library = Sort Tabs by Library
weavero-tabs-settings-annotation-count = Show Annotations Count

# ---- Windows: names, Manage Window, rename (tabs.ts, sessions.ts) ----

# A main window's name until the user renames it, in List All Tabs, the
# window's title-bar mark and the move menus. $number: its place among the
# main windows, oldest first (1, 2, 3...), or "?" when unknown.
weavero-window-default-name = Window { $number }
# A reader window's name until the user renames it: the only or first one,
# then the others with their number. $number: its place (2, 3...).
weavero-window-reader-default-name = Reader window
weavero-window-reader-default-name-numbered = Reader window { $number }
# The first (anchor) main window, named in its title-bar mark's tooltip and in
# its taskbar icon's description. $name: the window's name.
weavero-window-anchor-name = { $name } (anchor)
# A count of windows, before the tab count of a tab session ("2 windows ·
# 5 tabs"). $count: the number of windows.
weavero-window-count = { $count ->
        [1] { $count } window
       *[other] { $count } windows
    }

# The Manage Window panel (right-click on a window's title-bar mark): its
# heading, the window's kind on the status line, the word on the status line
# for an open window, the label above the name field, and the tooltip of the
# ↺ button. $name: the default name the button restores.
weavero-window-editor-title = Manage Window
weavero-window-editor-kind = { $kind ->
        [reader] Reader window
        [anchor] Main window (anchor)
       *[main] Main window
    }
weavero-window-editor-active = Active
weavero-window-editor-name = Name
weavero-window-editor-reset = Use the default name ({ $name })

# The small rename dialog (a window or a tab group, from List All Tabs): its
# heading, the default heading, and its confirm button.
weavero-window-rename-title = Rename Window
weavero-window-rename-default-title = Rename
weavero-window-rename-ok = OK

# Alerts of Save and Close Window and of Move Window to (another tab session).
weavero-window-save-no-tabs = This window has no tabs to save.
weavero-window-save-last-main = This is the last main window — open another main window first, then save this one.
weavero-window-save-no-documents = This window has no document tabs to save.
weavero-window-move-no-tabs = This window has no tabs to move.
weavero-window-move-last-main = This is the last main window — it can't be moved to another session.
weavero-window-move-no-documents = This window has no document tabs to move.

# ---- Saved windows (tabs.ts) ----

# The section of List All Tabs listing windows closed with Save and Close
# Window, its ↗ button's tooltip, and the tooltip of the × on a tab row.
weavero-savedwin-header = Saved Windows
weavero-savedwin-reopen = Reopen this saved window
weavero-savedwin-remove-tab = Remove this tab from the saved window
# A saved window's name when it had none of the user's, and the placeholder of
# the Rename Saved Window dialog. $kind: reader or main.
weavero-savedwin-default-name = { $kind ->
        [reader] Reader Window
       *[main] Window
    }
weavero-savedwin-rename-title = Rename Saved Window
# Alerts when a saved window cannot be reopened.
weavero-savedwin-reopen-gone = None of the documents of this saved window exist any more.
weavero-savedwin-reopen-notes-only = This saved window holds only notes — a reader window needs at least one document tab.

# ---- Tab sessions (sessions.ts) ----

# The name a new tab session gets. $date: the date and time it was created,
# written 2026-11-19 14:05 whatever the language.
weavero-session-default-name = Session { $date }
# A tab session with no name.
weavero-session-unnamed = Session
# The one letter in a session's round badge: the initial of "Session".
weavero-session-dot = S

# The banner at the top of List All Tabs naming the current session: its text
# when no session is active, and its tooltip's first line.
weavero-session-current = Current session
weavero-session-current-tip = Right-click to rename this session
# Lines added to a session's tooltip. $date: a date and time.
weavero-session-created = Created: { $date }
weavero-session-last-used = Last used: { $date }

# The Sessions section of List All Tabs: its header, the tooltip of the sort
# button, and the tooltip of the arrow that reverses the order.
# $order: the current order, one of weavero-session-sort-order.
weavero-session-header = Sessions
weavero-session-sort-button = Sort sessions
weavero-session-sort-direction = { $order } (click to reverse)
# The order the sessions are listed in. $order: oldest, newest (by creation
# date), az, za (by name), leastRecent, mostRecent (by last use).
weavero-session-sort-order = { $order ->
        [oldest] Oldest first
        [newest] Newest first
        [az] A to Z
        [za] Z to A
        [leastRecent] Least recent first
        [mostRecent] Most recent first
        [ascending] Ascending
       *[descending] Descending
    }
# The row that starts a new, empty session: its text and its tooltip.
weavero-session-new = New session
    .title = Open a fresh, empty workspace as a new session (the current session stays saved below)
# A session row's tooltip, first line: for the current session, then for the
# others.
weavero-session-row-current = Current session — updates automatically as you open & close tabs
weavero-session-row-switch = Switch to this session
# Tooltip of a session row's twisty. $state: expanded or collapsed.
weavero-session-twisty = { $state ->
        [expanded] Collapse
       *[collapsed] Show tabs
    }
# A session row with no name.
weavero-session-untitled = Untitled session
# The line under a session's name while the list is sorted on a date.
# $sort: created or lastUsed; $date: the date (the time alone for today).
weavero-session-date-line = { $sort ->
        [created] Created { $date }
       *[lastUsed] Last used { $date }
    }
# A tab inside a saved session whose document has no title.
weavero-session-tab-untitled = Untitled
# The marker after the automatic safety-net session's counts ("1 window ·
# 3 tabs · auto").
weavero-session-auto-tag = auto

# The Rename Session dialog: its title and the label of its text field.
weavero-session-rename-title = Rename Session
weavero-session-rename-label = Session name:
# The Delete Session dialog: its title and question. $name: the session.
weavero-session-delete-title = Delete Session
weavero-session-delete-confirm = Delete the saved session “{ $name }”?
# Confirm of Delete Window from Session (a window inside a saved session).
# $count: the window's tabs; $name: the session.
weavero-session-remove-window-confirm = { $count ->
        [1] Remove this window ({ $count } tab) from “{ $name }”?
       *[other] Remove this window ({ $count } tabs) from “{ $name }”?
    }

# ---- Tab groups (tab-groups.ts) ----

# The icon-only buttons at the end of the Move Tab menus that move the tabs
# into a brand-new window: their tooltips.
weavero-tabgroup-move-new-reader-window = Move to New Reader Window
weavero-tabgroup-move-new-group-reader-window = Move to a New Group in a New Reader Window
weavero-tabgroup-move-new-main-window = Move to New Main Window
weavero-tabgroup-move-new-group-main-window = Move to a New Group in a New Main Window
# The same buttons in a group's Move Group to menu (the group goes there).
weavero-tabgroup-new-reader-window = New Reader Window
weavero-tabgroup-new-main-window = New Main Window

# A tab group with no name: on the chip previewed while a group is dragged to
# another window, then in List All Tabs and the group's hover card.
weavero-tabgroup-unnamed-short = Group
weavero-tabgroup-unnamed = Unnamed group

# The Rename Tab Group dialog: its title and the name field's placeholder.
weavero-tabgroup-rename-title = Rename Tab Group
weavero-tabgroup-rename-placeholder = Group name
# The group chip's editor panel: the name field's placeholder.
weavero-tabgroup-name-placeholder = Example: Literature review
# The editor panel's status line: the group's state, then (after the tab
# count) the window it is open in. $state: active or saved; $name: the window.
weavero-tabgroup-status = { $state ->
        [active] Active
       *[saved] Saved
    }
weavero-tabgroup-home-window = in { $name }
# Tooltip of a colour swatch for a tab group. $color: blue, purple, cyan,
# orange, yellow, pink, green, gray or red.
weavero-tabgroup-color = { $color ->
        [purple] purple
        [cyan] cyan
        [orange] orange
        [yellow] yellow
        [pink] pink
        [green] green
        [gray] gray
        [red] red
       *[blue] blue
    }

# The section of List All Tabs listing closed (saved) tab groups, and its ↗
# button's tooltip.
weavero-tabgroup-saved-header = Saved Tab Groups
weavero-tabgroup-reopen = Reopen this saved group

## Feeds (modules/feeds.ts): the Relevance column, the Why relevant section,
## the in-library mark and chip, Settings -> Weavero -> Feeds.

# The items-list column of the feed views: a feed item's relevance, 0 to 99.
weavero-feeds-col = Relevance
# The feed views' column of the library icon (the name in the column picker; the header is the icon).
weavero-feeds-libcol = In Library
weavero-feeds-header =
    .label = Why relevant
weavero-feeds-sidenav =
    .tooltiptext = Why relevant
# The Relevance cell's mark and the section's line: one of your libraries already holds this feed item.
weavero-feeds-inlib-tip = Already in your library
weavero-feeds-inlib = Already in your library
# Tooltip of the library icon (In Library column) and of the line above: a click opens the copy's card. $library: the library's name.
weavero-feeds-card-tip = Already in { $library } — click for its card
# The section's first line ($score: 0 to 99).
weavero-feeds-score = Relevance { $score }
weavero-feeds-scoring = Not scored yet…
weavero-feeds-related = Related in your library
weavero-feeds-reason-lib = { $count ->
        [0] Close to papers in your library
        [1] Close to { $count } paper in your library
       *[other] Close to { $count } papers in your library
    }
# The reasons that point at a related paper below, which carries the matching tag ($level: strong, moderate, weak).
weavero-feeds-reason-near-row = { $level ->
        [strong] Very close to a paper in your library
        [moderate] Close to a paper in your library
       *[weak] Loosely related to a paper in your library
    }
weavero-feeds-reason-own-row = Close to one of your papers
# The tag on that related paper.
weavero-feeds-reltag-near = { $level ->
        [strong] Very close
        [moderate] Close
       *[weak] Loosely related
    }
weavero-feeds-reltag-own = Your paper
# Tooltip of the number at the end of a related paper's row.
weavero-feeds-relscore-tip = Text closeness to this feed item (0 to 99)
weavero-feeds-reason-author = Authors in your library: { $names }
weavero-feeds-reason-followed = Followed author: { $names }
weavero-feeds-reason-alert = Alert: { $queries }
weavero-feeds-reason-journal = { $count ->
        [1] A journal you read: { $journal } ({ $count } paper)
       *[other] A journal you read: { $journal } ({ $count } papers)
    }
# The Graphical Abstract section (modules/feeds-graphical.ts): the picture a feed item's
# abstract carries, alone (Zotero's Abstract section then shows the text). Named as
# Zotero names its Abstract section.
weavero-ga-header =
    .label = Graphical Abstract
weavero-ga-sidenav =
    .tooltiptext = Graphical Abstract
weavero-ga-failed = The picture could not be loaded.
# The picture's tooltip: a click shows it full size, over the window.
weavero-ga-open =
    .title = Click to see the picture full size
# The full-size view's tooltip.
weavero-ga-close =
    .title = Click or press Esc to close
# The items-list filter's chip and tile, in a feed view only.
weavero-filter-dim-feed-not-in-library = Not in your library
weavero-filter-feed-not-in-library-tip = Not in your library — feed items none of your libraries holds yet (same DOI, else same title): click to hide the ones you already have. Alt+click to show only those.
weavero-pref-nav-feeds = Feeds
weavero-pref-feeds-title = Feeds
weavero-pref-feeds-enable =
    .aria-label = Enable relevance in feeds
weavero-pref-feeds-desc = A relevance score for every item of your Zotero feeds, computed on your computer from your libraries: closeness to your own papers and to your library, authors you already have papers by, the authors you follow, your keyword alerts, the journals you read most — and, for a feed that carries its own scores, the feed’s own score and reasons. A Relevance column sorts the feeds most relevant first (the other columns sort them too), a “Why relevant” section in the item pane gives the reasons and the related papers of your library, and the items you already have are marked. A “Graphical Abstract” section shows a feed item’s picture on its own. The scores are computed without the Internet, and nothing is changed in your libraries; only a feed item’s picture is loaded from its publisher when you select the item, as Zotero’s own Abstract does.
weavero-pref-feeds-names-title = Your name as author
weavero-pref-feeds-names-desc = One name per line, as “Last, First” or “Last, F.” (initials are enough). The items of My Library with one of these names among their authors are your papers.
# The live count under the names ($count items of My Library).
weavero-pref-feeds-names-count = { $count ->
        [0] No item of My Library has one of these names as an author.
        [1] { $count } item of My Library has one of these names as an author.
       *[other] { $count } items of My Library have one of these names as an author.
    }
weavero-pref-feeds-followed-title = Followed authors
weavero-pref-feeds-followed-desc = One name per line. A feed item by one of them scores higher.
weavero-pref-feeds-alerts-title = Keyword alerts
weavero-pref-feeds-alerts-desc = One alert per line, looked for in the title and the abstract: every word must be there (“bubble” also finds “bubbles”), a phrase in quotation marks must be there as written, and a word after a minus sign (-review) must not be there.
weavero-pref-feeds-watched-title = Watched papers
weavero-pref-feeds-watched-desc = One title or DOI per line. Written to the alerts file (below), for a tool that looks for the new papers citing them.
weavero-pref-feeds-cited-title = Citation alerts for a person
weavero-pref-feeds-cited-desc = One name per line. Written to the alerts file (below), for a tool that looks for the new papers citing this person.
weavero-pref-feeds-journals =
    .label = The journals you read most count in the score
weavero-pref-feeds-journals-desc = A feed item from a journal with many papers in your libraries scores higher.
weavero-pref-feeds-export-title = Alerts file
weavero-pref-feeds-export-desc = Export Alerts File writes these lists to Weavero’s data folder (feeds/alerts.json), as a JSON file a recommendation tool can read; Export… writes them where you choose. Written over an existing alerts file, what its tool found for an entry (its OpenAlex ids) stays. Import… reads a list of Google Scholar alerts, or an alerts file, and adds its followed authors, watched papers, citation alerts and keyword alerts to these lists.
weavero-pref-feeds-export = Export Alerts File
weavero-pref-feeds-export-as = Export…
weavero-pref-feeds-import = Import…
weavero-feeds-export-as-title = Export Alerts File
weavero-feeds-import-title = Import Google Scholar alerts
weavero-pref-feeds-exported = Written: { $path }
weavero-pref-feeds-imported = { $count ->
        [0] Nothing new to add.
        [1] { $count } entry added.
       *[other] { $count } entries added.
    }
weavero-pref-feeds-failed = That did not work: { $error }

# A section locked at the bottom or at the top of the item pane (pane-lock.ts;
# MJT 2026-11-22): the padlock in a locked section's header -- a click unlocks
# it -- and the entries of a section header's own menu and of the side
# navigation's menu, beside Zotero's own Pin Section / Unpin Section, in
# Zotero's style.
weavero-panelock-button-unlock =
    .tooltiptext = Unlock
    .aria-label = Unlock
weavero-panelock-menu-lock-top =
    .label = Lock at Top
weavero-panelock-menu-lock =
    .label = Lock at Bottom
weavero-panelock-menu-unlock =
    .label = Unlock

# People (people.ts, branch people2; MJT 2026-11-22: "I want that data only in
# Weavero, in a structured way, with a special interface especially designed to
# build and check the data on other researchers"): the People tab, the author
# rows' right-click entries, Settings. Source names (ORCID, OpenAlex,
# theses.fr, IdRef, Wikidata) are proper names, written by the code.
weavero-people-tab-title = Researchers
weavero-people-menu-show =
    .label = Show Researcher
# The Researchers mark after an author's name in the item pane's Info section (people-cmark.ts): $name, the person's name as the record has it.
weavero-people-cmark-tip = { $name } is in Researchers. Click to open their page.
weavero-people-cmark-tip-maybe = Probably { $name } in Researchers (same last name, same initials). Click to open their page.
# The right-click menu of the Researchers button in the collections pane's toolbar
# (people-toolbar.ts); Settings brings the button back.
weavero-people-tb-hide =
    .label = Hide Researchers Button
weavero-people-menu-add =
    .label = Add Researcher
weavero-people-search =
    .placeholder = Search researchers
weavero-people-chip-check = To check
weavero-people-chip-followed = Followed
weavero-people-chip-all = All
weavero-people-list-empty = Nobody yet. Add a researcher from an item’s authors (right-click an author in the Info section), or build the list from the authors you follow.
weavero-people-list-none = Nobody matches.
weavero-people-build = Build from Followed Authors
weavero-people-build-tip = A record for each author you follow (Settings → Feeds, and the alerts file in Weavero’s data folder), marked To check; then each one with an OpenAlex profile is looked up online, one at a time.
weavero-people-build-file = From a File…
weavero-people-build-file-tip = The same from an alerts file you pick
weavero-people-build-file-title = Choose an alerts file
weavero-people-build-stop = Stop
# $done, $total: people looked up so far, people to look up.
weavero-people-build-progress = Looking researchers up: { $done } of { $total }…
# $added: records made; $followed: records already there, now marked followed; $queued: records being looked up.
weavero-people-build-done = New: { $added } · Now followed: { $followed } · Being looked up: { $queued }
weavero-people-build-none = No followed author to add. Add some in Settings → Feeds, or build from an alerts file.
weavero-people-select = Choose a researcher on the left.
weavero-people-refresh = Refresh
weavero-people-refresh-tip = Looks this researcher up in OpenAlex, ORCID, theses.fr, IdRef and Wikidata. Only their name and identifiers are sent; nothing of yours.
weavero-people-refreshing = Looking them up…
# $date: the day of the lookup, as YYYY-MM-DD.
weavero-people-refreshed = { $count ->
        [0] Nothing new found ({ $date }).
        [1] { $count } new value found ({ $date }).
       *[other] { $count } new values found ({ $date }).
    }
# $source: a service's name; $error: what went wrong, as the request reported it.
weavero-people-error = { $source } could not be reached: { $error }.
weavero-people-theses-none = theses.fr has no researcher of this name with this ORCID iD.
weavero-people-follow = Follow
weavero-people-followed = Followed
weavero-people-mark-checked = Mark as Checked
weavero-people-mark-check = Mark To Check
weavero-people-remove = Remove…
weavero-people-remove-title = Remove from Researchers
weavero-people-remove-confirm = Remove { $name } from Researchers? What you kept, rejected and wrote about them goes too.
weavero-people-added-from = Added from: { $title }
weavero-people-no-ids = No identifier yet. Refresh finds this researcher through the paper they were added from, or lists the profiles with their name for you to pick.
weavero-people-no-profile = No OpenAlex profile has this name.
weavero-people-pick = { $count ->
        [1] One OpenAlex profile has this name. Is it this researcher? Click it to confirm.
       *[other] { $count } OpenAlex profiles have this name. Which one is this researcher? Click it.
    }
weavero-people-cand-works = { $count ->
        [0] no works
        [1] { $count } work
       *[other] { $count } works
    }
weavero-people-sec-ids = Identifiers
weavero-people-sec-facts = Facts
weavero-people-sec-links = Links
weavero-people-sec-tree = Academic Family Tree
weavero-people-sec-works = Publications
weavero-people-sec-notes = Notes
# Researchers: dated events (MJT 2026-11-25). $where: the place; $field: date, what, where, link,
# note; $kind: seminar, visit, talk (a talk at a conference), jury; $what, $date: the event's.
weavero-people-sec-events = Events
weavero-people-event-add = Add an event
weavero-people-events-none = No event yet: a seminar they gave, a visit, a jury…
weavero-people-event-at = at { $where }
weavero-people-event-announcement = announcement
weavero-people-event-remove = Remove
weavero-people-event-cancel = Cancel
weavero-people-event-field =
    { $field ->
        [date] Date
        [what] What
        [where] Where
        [link] Link
       *[note] Note
    }
weavero-people-event-ph =
    { $field ->
        [date] 2026-11-25, or 2026-11, or 2026
        [what] Seminar, visit…
        [where] Place or institution
        [link] Address of the announcement
       *[note] Anything to remember
    }
weavero-people-event-kind =
    { $kind ->
        [seminar] Seminar
        [visit] Visit
        [talk] Conference talk
       *[jury] Jury
    }
weavero-people-event-bad-date = Write the date as 2026-11-25, 2026-11 or 2026.
weavero-people-event-need-what = Say what the event was.
weavero-people-event-bad-link = The link must be a web address.
weavero-people-event-remove-confirm = Remove the event “{ $what }” ({ $date })?
# The researchers table (the centre pane with no researcher open). $col: name, institution, country,
# papers (their items in your libraries), phd (the year of their PhD).
weavero-people-back = Back to the researchers
weavero-people-table-count =
    { $count ->
        [1] One researcher
       *[other] { $count } researchers
    }
weavero-people-table-col =
    { $col ->
        [name] Name
        [institution] Institution
        [country] Country
        [papers] Papers in your libraries
       *[phd] PhD year
    }
weavero-people-table-sort-tip = Sort by this column; click again to reverse
# Researchers: the Contact card and the custom fields (MJT 2026-11-25). $kind: email, phone, address, web;
# $label: work, home, mobile (a phone), other; $field: kind, label, value -- and for the placeholders the
# kind, or custom (the user's own label); $why: why a value is refused; $what: the line removed.
weavero-people-sec-contact = Contact
weavero-people-contact-add = Add contact info
weavero-people-contact-none = No email, phone or address yet.
weavero-people-contact-kind =
    { $kind ->
        [email] Email
        [phone] Phone
        [address] Address
       *[web] Website
    }
weavero-people-contact-label =
    { $label ->
        [work] Work
        [home] Home
        [mobile] Mobile
       *[other] Other
    }
weavero-people-contact-label-custom = Your own label…
weavero-people-contact-field =
    { $field ->
        [kind] Kind
        [label] Label
       *[value] Value
    }
weavero-people-contact-ph =
    { $field ->
        [email] name@example.org
        [phone] +33 1 23 45 67 89
        [address] Street, city, country: several lines
        [web] Address of the website
       *[custom] A label of your own
    }
weavero-people-contact-map = map
weavero-people-contact-map-tip = Search this address on OpenStreetMap (the address is sent to openstreetmap.org)
weavero-people-contact-bad =
    { $why ->
        [label] Give a label.
        [email] This is not an email address.
        [phone] A phone number has digits, with + ( ) - . / and spaces.
        [web] This is not a web address.
       *[empty] Write a value.
    }
weavero-people-sec-custom = Custom fields
weavero-people-custom-add = Add a custom field
weavero-people-custom-none = No custom field yet.
weavero-people-custom-field =
    { $field ->
        [label] Label
       *[value] Value
    }
weavero-people-custom-bad = A custom field needs a label and a value.
weavero-people-card-remove-confirm = Remove “{ $what }”?
weavero-people-row-edit =
    .label = Edit
weavero-people-row-remove =
    .label = Remove
weavero-people-row-keep =
    .label = Keep
weavero-people-row-reject =
    .label = Reject
weavero-people-row-restore =
    .label = Restore
# The researcher page's Edit pencil: on, every field shows (the empty ones with their Add).
weavero-people-page-edit = ✎ Edit
weavero-people-page-edit-tip = Show every field, the empty ones with their Add
weavero-people-sec-empty = Nothing known yet. Edit (✎) shows every field, to add a value.
weavero-people-add-researcher = Add a researcher
weavero-people-add-researcher-tip = Add a researcher by name: OpenAlex lists the profiles of that name for you to pick (the network, on this click only)
weavero-people-add-researcher-prompt = Name of the researcher (First Last, or Last, First):
# The "Suggested links" queue: every link a source suggested, for all researchers. $count: how many;
# $fact: the link kind (advisor, coadvisor, postdoc, lab, student, linked); $other: the linked researcher; $name: the researcher whose record holds the link.
weavero-people-queue-btn =
    { $count ->
        [0] Suggested links
       *[other] Suggested links ({ $count })
    }
weavero-people-queue-tip = Every link a source suggested and you have not kept or rejected yet, for all your researchers
weavero-people-queue-title = Suggested links
weavero-people-queue-count =
    { $count ->
        [1] 1 link to review
       *[other] { $count } links to review
    }
weavero-people-queue-none = No suggested link waits for you.
weavero-people-queue-q =
    { $fact ->
        [advisor] Was { $other } the PhD advisor of { $name }?
        [coadvisor] Was { $other } a co-advisor of { $name }?
        [postdoc] Did { $other } host { $name } as a postdoc?
        [lab] Did { $other } work in the same lab as { $name }?
        [student] Was { $other } a PhD student of { $name }?
       *[linked] Is { $other } linked to { $name }?
    }
# Dates that do not fit in the academic family. $kind: advisor (an advisor's PhD not before the
# student's), years (the student's PhD outside the link's years); $advisor, $student: names; $ay, $sy:
# their PhD years; $years: the link's years, as the record writes them; $text: one issue in words.
weavero-people-date-issue =
    { $kind ->
        [advisor] The PhD of { $advisor } ({ $ay }) is not before that of { $student } ({ $sy }), their PhD student.
       *[years] The PhD of { $student } ({ $sy }) falls outside the years of their link to { $advisor } ({ $years }).
    }
weavero-people-date-title =
    { $count ->
        [1] 1 date to check
       *[other] { $count } dates to check
    }
weavero-people-date-confirm-title = A date does not fit
weavero-people-date-confirm = { $text } Add this link anyway?
# Possible duplicates: two records that may be one researcher. $count: how many; $reason: id-orcid,
# id-openalex, id-idref, id-wikidata, name, form, initials, institution; $name, $keep, $drop: names.
weavero-people-dupe-btn = Possible duplicates ({ $count })
weavero-people-dupe-title =
    { $count ->
        [1] 1 possible duplicate
       *[other] { $count } possible duplicates
    }
weavero-people-dupe-items =
    { $count ->
        [0] No item in your libraries
        [1] 1 item in your libraries
       *[other] { $count } items in your libraries
    }
weavero-people-dupe-reason =
    { $reason ->
        [id-orcid] same ORCID iD
        [id-openalex] same OpenAlex profile
        [id-idref] same IdRef
        [id-wikidata] same Wikidata item
        [name] same name
        [form] one's name is the other's other form
        [initials] same initials
       *[institution] same institution
    }
weavero-people-dupe-merge = Merge into { $name }
weavero-people-dupe-notsame = Not the same person
weavero-people-dupe-confirm-title = Merge two researchers
weavero-people-dupe-confirm = Merge { $drop } into { $keep }? Everything known of { $drop } joins { $keep }, and { $drop } is removed.
# Evidence on the user's own value: an item of a library, its page, a quote. $field: link (the item), quote;
# $title: the item's title; $page: its page label, or none; $quote: the words, or none.
weavero-people-ev-act = Evidence…
weavero-people-row-evidence =
    .label = Evidence…
weavero-people-ev-field =
    { $field ->
        [link] Item
       *[quote] Quote
    }
weavero-people-ev-ph = A zotero:// link to the item, or pick one of the open PDFs below
weavero-people-ev-tab =
    { $page ->
        [none] { $title }
       *[other] { $title }, p. { $page }
    }
weavero-people-ev-tip = Evidence: { $title }{ $page ->
        [none] {""}
       *[other] , p. { $page }
    }{ $quote ->
        [none] {""}
       *[other] {" "}“{ $quote }”
    } Click to open it.
weavero-people-ev-bad = Paste a zotero:// link to an item, or pick one of the open PDFs.
weavero-people-ev-remove = Remove the evidence
weavero-people-fact-position = Position
weavero-people-fact-institution = Institution
weavero-people-fact-phd = PhD institution
weavero-people-fact-phd-year = PhD year
weavero-people-fact-phd-thesis = Thesis
weavero-people-fact-web = Web page
weavero-people-link-advisor = PhD advisor
weavero-people-link-coadvisor = Co-advisor
weavero-people-link-postdoc = Postdoc host
weavero-people-link-lab = Same lab
weavero-people-link-linked = Linked to
weavero-people-link-student = PhD student
weavero-people-source-me = you
weavero-people-keep = Keep
weavero-people-reject = Reject
weavero-people-restore = Restore
weavero-people-edit = Edit
weavero-people-add-value = Add…
weavero-people-save = Save
# $count: 2 or more sources giving the same value.
weavero-people-agree = { $count } sources agree
weavero-people-new = new
weavero-people-conflict = { $count } values: the sources disagree
weavero-people-conflict-new = A source gave a new value
weavero-people-status-chosen = kept by you
weavero-people-status-confirmed = confirmed
weavero-people-status-suggested = suggested
weavero-people-status-alternative = alternative
weavero-people-status-rejected = rejected
weavero-people-open-person = Open { $name }
weavero-people-add-person = { $name } is not in Researchers: click to add them
weavero-people-from-record = from their own record
weavero-people-links-none = No link yet.
weavero-people-link-name =
    .placeholder = Name of the researcher
weavero-people-link-add = Add Link
weavero-people-tree-empty = No advisor or student known yet.
weavero-people-tree-label = Academic family tree of { $name }
# The lineage tree's academic siblings (the other PhD students of the focus's advisors). $name: an advisor.
weavero-people-lt-sibs-of = Also PhD students of { $name }:
weavero-people-lt-sibs-tip = Academic siblings: the other PhD students of the same advisors. A name centres the tree on them.
# $inlib: their works in your libraries; $total: their works in OpenAlex.
weavero-people-works-count = { $inlib } in your libraries, of { $total }
weavero-people-works-none = Refresh lists their publications from OpenAlex.
weavero-people-works-offline = Not looked up yet. Items of your libraries with an author of this name:
weavero-people-works-more = { $count } more
weavero-people-works-search =
    .placeholder = Filter by title, author or journal
# $sort: the order of the publications.
weavero-people-works-sort =
    { $sort ->
        [old] Oldest first
        [cited] Most cited
        [title] Title
        [venue] Journal
       *[new] Newest first
    }
weavero-people-works-sort-tip = Sort the publications
# The publications' funnel: its tooltip; the name of each filter ($filter: lib, type, venue, decade).
weavero-people-works-funnel-tip = Filter the publications
# A publication's mark, as the References' marks say it ($kind: pdf, nopdf, web).
weavero-people-works-mark =
    { $kind ->
        [pdf] In your library, with its PDF
        [nopdf] In your library, without a PDF
       *[web] Not in your library
    }
weavero-people-works-filter =
    { $filter ->
        [type] Type
        [venue] Journal
       *[decade] Decade
    }
weavero-people-works-nomatch = No publication matches.
# The researcher's citation figures: $h, $i10, $cites (numbers); the tooltip says where they come
# from ($from: openalex, or works = computed from the $works works listed) and when ($date).
weavero-people-metrics = h-index { $h } · i10-index { $i10 } · { $cites } citations
weavero-people-metrics-tip =
    { $from ->
        [works] Computed from the { $works } works listed, with their OpenAlex counts ({ $date }).
       *[openalex] OpenAlex, { $date }. Other sources count differently.
    }
# A publication's times cited (OpenAlex's count at the last Refresh, $date in the tooltip).
weavero-people-work-cited =
    { $count ->
        [1] Cited once
       *[other] Cited { $count } times
    }
weavero-people-work-cited-tip = OpenAlex, { $date }
# Semantic Scholar's figures, asked for on a click: $h, $cites (numbers), $date, $url (the profile);
# why it failed: $why = nodoi, nomatch, error ($error: the error).
weavero-people-s2-figures = Semantic Scholar: h-index { $h } · { $cites } citations
weavero-people-s2-tip = Semantic Scholar, { $date }: { $url }
weavero-people-s2-ask = Ask Semantic Scholar
weavero-people-s2-again = Ask again
weavero-people-s2-busy = Asking…
weavero-people-s2-ask-tip = Look this researcher up on Semantic Scholar, through one of their papers with a DOI (the network, on this click only)
weavero-people-s2-failed =
    { $why ->
        [nodoi] None of their publications has a DOI to look them up by.
        [nomatch] Semantic Scholar has no author of this name on their papers.
       *[error] Semantic Scholar did not answer: { $error }
    }
# Google Scholar: the researcher's public profile, read on a click. $h, $i10, $cites (numbers), $date,
# $url (the profile); why reading failed: $why = refused (a refusal or a robot check), error ($error).
weavero-people-gs-add = Add Google Scholar profile
weavero-people-gs-add-tip = Give the address of their public Google Scholar profile, to read its figures on a click
weavero-people-gs-add-prompt = Paste the address of their Google Scholar profile (scholar.google.com/citations?user=…):
weavero-people-gs-bad = That is not the address of a Google Scholar profile.
weavero-people-gs-read = Read Google Scholar
weavero-people-gs-busy = Reading…
weavero-people-gs-read-tip = Read the figures of their Google Scholar profile (its first page, on this click only)
weavero-people-gs-forget = Forget profile
weavero-people-gs-forget-tip = Forget their Google Scholar profile
weavero-people-gs-figures = Google Scholar: h-index { $h } · i10-index { $i10 } · { $cites } citations
weavero-people-gs-tip = Google Scholar, { $date }: { $url }
weavero-people-gs-failed =
    { $why ->
        [refused] Google Scholar refused the page (it may ask to prove you are not a robot): open the profile in your browser.
       *[error] Google Scholar did not answer: { $error }
    }
weavero-people-notes =
    .placeholder = Your notes about this researcher
# people3 (MJT 2026-11-24): the new facts -- the current institution's country, the PhD's
# country (a country shown by its name), the birth year (Wikidata) -- and the list's sort,
# filters and More chip. $sort: last, first, added (the day the researcher was added,
# newest first), modified (newest first), items (items of your libraries they authored, most
# first), institution (A to Z), phdYear, birthYear (oldest first); a researcher whose value
# is not known comes last.
weavero-people-fact-country = Country
weavero-people-fact-phd-country = PhD country
weavero-people-fact-birth-year = Birth year
weavero-people-sort-tip = Sort order. Researchers whose value is not known yet come last.
weavero-people-sort-heading =
    .label = Sort By
weavero-people-sort =
    .label = { $sort ->
            [first] First Name
            [added] Date Added (Newest First)
            [modified] Last Modified (Newest First)
            [items] Items in Your Libraries (Most First)
            [institution] Institution (A–Z)
            [phdYear] PhD Year (Oldest First)
            [birthYear] Birth Year (Oldest First)
           *[last] Last Name
        }
# The filters, chips of the funnel beside the sort (people4) ($filter: noOrcid, noIds -- no
# identifier at all --, inLib, thesis -- by the researcher's name among the creators of your
# libraries --, advisor, student, web, conflict; then the ones with a menu of values:
# position, institution, country, phdCountry, birth -- the decade of birth --, phd -- the
# decade of the PhD). They combine: a researcher is listed when every filter that is on keeps them.
weavero-people-filter = { $filter ->
        [noOrcid] No ORCID iD
        [noIds] No identifiers
        [inLib] In your libraries
        [thesis] PhD thesis in your libraries
        [advisor] Has advisors
        [student] Has students
        [web] Has a web page
        [conflict] Sources disagree
        [position] Position
        [institution] Institution
        [country] Country
        [phdCountry] PhD country
        [birth] Birth decade
       *[phd] PhD decade
    }
weavero-people-filter-tip = { $filter ->
        [noOrcid] Only researchers without an ORCID iD.
        [noIds] Only researchers without any identifier (ORCID, OpenAlex, IdRef, Wikidata): Refresh lists the profiles with their name.
        [inLib] Only researchers who authored at least one item of your libraries (by their name).
        [thesis] Only researchers who authored a thesis item of your libraries (by their name).
        [advisor] Only researchers with a link to a PhD advisor or co-advisor.
        [student] Only researchers with a PhD student: a student link of their own, or another researcher’s advisor link to them.
        [web] Only researchers with a web page.
        [conflict] Only researchers with a fact whose sources disagree, or a new value to check.
        [position] Only researchers with this position.
        [institution] Only researchers at this institution.
        [country] Only researchers whose current institution is in this country.
        [phdCountry] Only researchers who earned their PhD in this country.
        [birth] Only researchers born in this decade (Wikidata).
       *[phd] Only researchers who earned their PhD in this decade.
    }
weavero-people-filter-unknown = Unknown
# $decade: a year ending in 0, as text ("1960").
weavero-people-decade = { $decade }s
# people4 (MJT 2026-11-24): a researcher's name edited in place, the other forms of the name,
# the sort's label, the filter funnel. The title's tooltip: a click edits the name.
weavero-people-name-edit-tip = Click to edit the name
# Tooltip of the "you" mark beside a name the user typed.
weavero-people-name-mine-tip = Name typed by you: a Refresh never changes it
# The two fields of the name being edited, as Zotero edits a creator.
weavero-people-name-last =
    .placeholder = Last name
    .aria-label = Last name
weavero-people-name-first =
    .placeholder = First name
    .aria-label = First name
weavero-people-name-empty = A researcher needs a last name: the name was not changed.
# The row of the other forms of the name (ORCID, OpenAlex, Wikidata, the user's items, the user's own).
weavero-people-fact-other-names = Other names
# A source of a form of the name: how the creators of the user's libraries write it.
weavero-people-source-items = your items
# A source of a value: the alerts file (Settings → Feeds), whose followed authors a Build reads, with their ids.
weavero-people-source-radar = alerts file
# The plain label before the sort button; the button shows the order alone ($sort as in weavero-people-sort).
weavero-people-sort-label = Sort:
weavero-people-sort-current = { $sort ->
        [first] First name
        [added] Date added
        [modified] Last modified
        [items] Items in your libraries
        [institution] Institution
        [phdYear] PhD year
        [birthYear] Birth year
       *[last] Last name
    }
# The funnel beside the sort: its tooltip and spoken name, and its popup's name.
weavero-people-funnel-tip = Filter researchers
# The funnel's popup: the hint at the top left; Clear (the popup stays open); the red × (Clear and Close).
weavero-people-filter-hint = Alt+click to exclude
weavero-people-filter-clear-all = Clear
    .title = Clear all researcher filters (keep this window open)
    .aria-label = Clear all researcher filters
weavero-people-filter-clear-close = Clear and Close
# The second line of an on/off filter's tooltip (its first line: weavero-people-filter-tip).
weavero-people-filter-gesture = Click to include, Alt+click to exclude.
# Tooltip of a value's chip. $value: the value (a position, a country, a decade, Unknown...); $count: the researchers with it.
weavero-people-filter-value-tip = { $value } ({ $count }) — click to include, Alt+click to exclude
# The Researchers tab's right pane (MJT 2026-11-26): nothing selected; several checked ($count); its Open
# (the full page); the splitter's button ($state: open -- the pane shown, the button hides it -- or closed).
weavero-people-pane-none = No researcher selected
weavero-people-pane-count =
    { $count ->
        [1] 1 researcher selected
       *[other] { $count } researchers selected
    }
weavero-people-pane-open = Open
weavero-people-pane-toggle =
    { $state ->
        [open] Hide the details pane
       *[closed] Show the details pane
    }
# The researcher page's edit mode (MJT 2026-11-26): its Done button (its Cancel: weavero-common-cancel).
weavero-people-page-done = Done
# A link's dates in the family tree (lib/people-tree.ts wvLtWhen). $type: the link's kind
# (weavero-people-lt-edge); $from, $to: its start and its end, a year or a date; $kind: range (both
# ends), end (a PhD's graduation, or both ends the same year), from (only its start known), until (only
# its end known), unknown (a year whose source does not tell which end it is).
weavero-people-lt-when =
    { $kind ->
        [range] { $type } { $from }–{ $to }
        [from] { $type } from { $from }
        [until] { $type } until { $to }
        [unknown] { $type } { $from }?
       *[end] { $type } { $to }
    }
# $date: the year of a link whose source does not tell whether the link started or ended then.
weavero-people-lt-when-tip = { $date }: the source does not say whether the link started or ended that year.
# Researchers, the Google Contacts design, step 2 (MJT 2026-11-25/26): the left pane's views and groups,
# Browse by, the active filters above the table, a row's actions under the mouse and its menu, the bar of
# the checked rows, the column menu. $view: all (every researcher), followed, check, queue (the suggested
# links), dupes (possible duplicates), conflict (sources disagree), noOrcid, import (from a file);
# $group: manage, browse.
weavero-people-nav =
    { $view ->
        [followed] Followed
        [check] To check
        [queue] Suggested links
        [dupes] Duplicates
        [conflict] Sources disagree
        [noOrcid] Without ORCID
        [import] Import from a file…
       *[all] Researchers
    }
weavero-people-nav-head =
    { $group ->
        [manage] Fix and manage
       *[browse] Browse by
    }
weavero-people-dupe-none = No possible duplicates.
# An active filter above the table: $filter its name (as weavero-people-filter), $value the value;
# $state: in (included) or out (excluded with Alt+click).
weavero-people-fchip =
    { $state ->
        [out] { $filter }: not { $value }
       *[in] { $filter }: { $value }
    }
weavero-people-fchip-toggle =
    { $state ->
        [out] Not: { $filter }
       *[in] { $filter }
    }
weavero-people-fchip-remove = Remove this filter
# The bar above the table once rows are checked. $act: all (select all), follow, unfollow, merge.
weavero-people-sel =
    { $act ->
        [follow] Follow
        [unfollow] Unfollow
        [merge] Merge
       *[all] Select all
    }
weavero-people-sel-count =
    { $count ->
        [1] 1 selected
       *[other] { $count } selected
    }
weavero-people-sel-merge-tip = Check exactly two researchers to merge them
weavero-people-sel-merge-into =
    .label = Merge into { $name }
# A row's checkbox, on its avatar. $name: the researcher.
weavero-people-sel-row = Select { $name }
# The actions at a row's right end, under the mouse. $act: follow, unfollow, edit, more.
weavero-people-row-act =
    { $act ->
        [follow] Follow
        [unfollow] Unfollow
        [edit] Edit
       *[more] More actions
    }
# A row's menu (its ⋮ and a right-click). $act: open, edit, follow, unfollow, check (mark to check),
# checked (mark as checked), refresh, remove.
weavero-people-row-menu =
    .label = { $act ->
            [open] Open
            [edit] Edit
            [follow] Follow
            [unfollow] Unfollow
            [check] Mark to check
            [checked] Mark as checked
            [refresh] Refresh
           *[remove] Remove…
        }
# The column menu (a right-click on the table's header). $col as in weavero-people-table-col.
weavero-people-table-colmenu =
    .label = { $col ->
            [name] Name
            [institution] Institution
            [country] Country
            [papers] Papers in your libraries
           *[phd] PhD year
        }
weavero-people-table-colreset =
    .label = Restore default columns
# Researchers' tags (MJT 2026-11-26, "tag authors, same as for the Zotero items"): the page's section and the
# Tags column's title; the column menu's entry; the tag selector at the bottom of the left pane (nothing to
# show, its actions button, Deselect all); a tag's context menu ($act: color -- the colour submenu --, nocolor,
# position -- the position submenu --, rename, delete); the page's field adding one; a tag chip's remove
# button ($name: the tag); the bar's Tag menu and its New tag entry; the prompts ($name: the tag; $count: how
# many researchers); the tenth colour refused.
weavero-people-tags = Tags
weavero-people-tags-col =
    .label = Tags
weavero-people-tagsel-none = No tags to display
weavero-people-tagsel-actions =
    .title = Actions
weavero-people-tagsel-deselect =
    .label = Deselect all
weavero-people-tag-menu =
    .label = { $act ->
            [color] Assign color
            [nocolor] Remove color
            [position] Position
            [rename] Rename tag…
           *[delete] Delete tag…
        }
weavero-people-tag-add =
    .placeholder = Add a tag
weavero-people-tag-remove = Remove { $name }
weavero-people-bulk-tag = Tag
weavero-people-bulk-tag-new =
    .label = New tag…
weavero-people-tag-new-prompt = Tag the selected researchers with:
weavero-people-tag-rename-prompt = Rename “{ $name }” for every researcher:
weavero-people-tag-delete-ask =
    { $count ->
        [1] Remove the tag “{ $name }” from 1 researcher?
       *[other] Remove the tag “{ $name }” from { $count } researchers?
    }
weavero-people-tag-colors-full = Nine tags at most have a color.
weavero-pref-nav-people = Researchers
weavero-pref-people-title = Researchers
weavero-pref-people-enable =
    .aria-label = Enable Researchers
weavero-pref-people-desc = A Researchers tab (File → Researchers) to build and check what you know about other researchers: their identifiers, position, institution and PhD, each fact with every source’s value side by side, so that you keep, reject or edit it; their PhD advisors and students, drawn as an academic family tree; their publications, marked in your library or not. Add a researcher with Add Researcher in an author’s right-click menu, or build the list from the authors you follow. Weavero looks them up in OpenAlex, ORCID, theses.fr, IdRef and Wikidata only when you click: the requests carry the researcher’s name and identifiers, nothing of yours. The records stay in Weavero’s data folder, never in your libraries.
# The Researchers button in the collections pane's toolbar (people-toolbar.ts, MJT 2026-11-27).
weavero-pref-people-toolbar-button =
    .label = Researchers button in the collections pane’s toolbar
weavero-pref-people-toolbar-button-desc = A button in the toolbar above your collections that opens the Researchers tab, or brings it to the front when it is already open; <strong>Ctrl/Cmd+click</strong> opens it beside the library, in a split view. Right-click the button to hide it; this box brings it back.
# How each place of the Researchers tab writes a name (people3): the list, a researcher's page
# title, the Links rows, the family tree's boxes.
weavero-pref-people-names-title = Names
weavero-pref-people-names-desc = How each part of the Researchers tab writes a researcher’s name. “Last, First” shows that the list is sorted by last name; a name without a first name is written without a comma.
weavero-pref-people-names-list = Researcher list
weavero-pref-people-names-heading = Title of a researcher’s page
weavero-pref-people-names-links = Links (PhD advisors, PhD students…)
weavero-pref-people-names-tree = Academic family tree
weavero-pref-people-names-last =
    .label = Last, First
weavero-pref-people-names-first =
    .label = First Last
# Backups of Weavero's own data (modules/backups.ts, branch backups, MJT
# 2026-11-22): the Settings section, the Restore list and its preview, the
# notices. A size reuses weavero-sdt-build-size-one.
weavero-pref-nav-backups = Backups
weavero-pref-backups-title = Backups
weavero-pref-backups-desc = Zotero’s own backups and Zotero sync do not include Weavero’s data — your bookmarks, outlines, tab groups, sessions and feeds lists — nor Weavero’s settings. Weavero keeps copies of them itself, in its data folder. A restore or an import replaces Weavero’s data and settings with those of a backup; what you have is backed up first, so you can undo it.
weavero-pref-backups-auto =
    .label = Back up automatically
weavero-pref-backups-auto-desc = Once a day, and before each Weavero update, Weavero copies its data and settings. What it can rebuild by itself, such as the Cited by index and the feed scores, is left out.
weavero-pref-backups-keep-lead = Keep the last
weavero-pref-backups-keep-unit = { $count ->
        [1] daily backup
       *[other] daily backups
    }
weavero-pref-backups-keep-desc = Of the backups made before an update, by Back Up Now, before a restore or an import, and of imported files, the last 5 of each kind are kept.
weavero-pref-backups-actions-title = Your backups
weavero-pref-backups-now = Back Up Now
weavero-pref-backups-restore = Restore…
weavero-pref-backups-export = Export…
weavero-pref-backups-import = Import…
weavero-pref-backups-open = Open Folder
weavero-pref-backups-where = Backups are kept in { $path }
weavero-pref-backups-last = Last backup: { $date } ({ $reason }). { $count ->
        [1] { $count } backup
       *[other] { $count } backups
    }, { $size } in all.
weavero-pref-backups-none = No backup yet.
weavero-pref-backups-last-error = The last backup failed ({ $date }): { $error }
weavero-pref-backups-restored = { $kind ->
        [import] Imported on { $date } from the file backed up as { $from }. To undo it, restore the backup “Before an import” of { $pre }.
       *[other] Restored on { $date } from the backup of { $from }. To undo it, restore the backup “Before a restore” of { $pre }.
    }
weavero-pref-backups-restore-failed = The restore of { $date } did not happen ({ $problem }). Your data and settings were left as they were.
weavero-pref-backups-pending = { $kind ->
        [import] An import waits for Zotero to start again.
       *[other] A restore of the backup of { $date } waits for Zotero to start again.
    } Weavero writes it before it reads its data, so nothing it still holds in memory can write over it.
weavero-pref-backups-pending-restart = Restart Zotero Now
weavero-pref-backups-pending-cancel = Cancel Restore
weavero-pref-backups-working = Backing up…
weavero-pref-backups-backed-up = Backed up: { $date }.
weavero-pref-backups-exported = Written: { $path }
weavero-pref-backups-staged = Done: Weavero restores it the next time Zotero starts.
weavero-pref-backups-failed = That did not work: { $error }
weavero-pref-backups-checking = Checking the backup…
weavero-pref-backups-pick = Pick a backup: what restoring it would change is shown below.
weavero-pref-backups-no-backups = There is no backup to restore yet.
weavero-pref-backups-from-file = From the file { $file }, made on { $date } by Weavero { $version }. What importing it would change:
weavero-pref-backups-opt-data =
    .label = Data
weavero-pref-backups-opt-settings =
    .label = Settings
weavero-pref-backups-go-restore = Restore This Backup…
weavero-pref-backups-go-import = Import This File…
weavero-pref-backups-cancel = Cancel
weavero-backups-ask-title = Restore a Weavero backup
weavero-backups-ask-restore = Restore { $what ->
        [data] Weavero’s data
        [settings] Weavero’s settings
       *[both] Weavero’s data and settings
    } from the backup of { $date }? What you have now is backed up first, so you can undo it by restoring that copy. Weavero restores the backup when Zotero starts again, before it reads its data.
weavero-backups-ask-import-title = Import Weavero data
weavero-backups-ask-import = Replace { $what ->
        [data] Weavero’s data
        [settings] Weavero’s settings
       *[both] Weavero’s data and settings
    } with those of { $file }? What you have now is backed up first, so you can undo it by restoring that copy. Weavero imports the file when Zotero starts again, before it reads its data.
weavero-backups-ask-restart = Restart Zotero Now
weavero-backups-ask-later = At the Next Start
weavero-backups-export-title = Export Weavero’s Data
weavero-backups-import-title = Import Weavero’s Data
weavero-backups-row = { $date } — { $reason } — { $size }
weavero-backups-reason-daily = daily
weavero-backups-reason-manual = Back Up Now
weavero-backups-reason-pre-restore = before a restore
weavero-backups-reason-pre-import = before an import
weavero-backups-reason-import = imported from { $file }
weavero-backups-reason-update = before the update to { $to }
weavero-backups-reason-update-from = before the update from { $from } to { $to }
weavero-backups-reason-other = automatic ({ $reason })
weavero-backups-store-bookmarks = Bookmarks
weavero-backups-store-outlines = Outlines
weavero-backups-store-ann-order = Annotation order
weavero-backups-store-note-view = Note outlines and folds
weavero-backups-store-sessions = Tab sessions
weavero-backups-store-saved-windows = Saved windows
weavero-backups-store-tab-groups-file = Tab groups (file copy)
weavero-backups-store-tab-groups-bak = Tab groups (previous copy)
weavero-backups-store-outline-eval = Outline evaluations
weavero-backups-store-feeds = Feeds lists
weavero-backups-store-feeds-export = Alerts file
weavero-backups-store-tab-groups = Tab groups
weavero-backups-store-settings = Settings
weavero-backups-diff-line = { $store }: { $changes }
weavero-backups-diff-added = { $count } added
weavero-backups-diff-removed = { $count } removed
weavero-backups-diff-changed = { $count } changed
weavero-backups-diff-file-added = added (not here now)
weavero-backups-diff-file-removed = removed (not in this backup)
weavero-backups-diff-file-changed = replaced
weavero-backups-diff-none = Nothing would change: this holds the data and settings you have now.
weavero-backups-failed-title = Weavero could not back up its data
weavero-backups-failed-kept = Your earlier backups are kept.
weavero-backups-failed-disk-full = The disk is full.
weavero-backups-failed-locked = Another program holds one of Weavero’s files. Weavero tries again at the next backup.
weavero-backups-failed-too-large = Weavero’s data is larger than a backup may be (256 MB).
weavero-backups-failed-other = Something went wrong: { $error }
weavero-backups-damaged = This backup is damaged (a file does not match its record) and was removed.
weavero-backups-import-newer = This file was made by a newer Weavero. Update Weavero, then import it.
weavero-backups-import-not-weavero = This is not a file exported by Weavero.
weavero-backups-restored-title = Weavero restored a backup
weavero-backups-restored = Weavero’s data and settings are those of the backup of { $date }. To undo it, restore the copy made just before, in Settings → Weavero → Backups.
weavero-backups-restore-failed-title = Weavero did not restore the backup
weavero-backups-restore-failed = The backup of { $date } was not restored: your data and settings are as they were.
# Researchers: the lineage tree (peoplenet, MJT 2026-11-25). $type: phd, coadvisor, postdoc, research,
# ra (undergraduate research assistant), other. $source: the Academic Family Tree's own name.
weavero-people-lt-back = Back
weavero-people-lt-forward = Forward
weavero-people-lt-home = Back to { $name }
weavero-people-lt-zoom-in = Zoom in
weavero-people-lt-zoom-out = Zoom out
weavero-people-lt-fit = Fit the whole tree
weavero-people-lt-export = Export
weavero-people-lt-export-svg =
    .label = SVG Image…
weavero-people-lt-export-png =
    .label = PNG Image…
weavero-people-lt-export-csv =
    .label = CSV Table…
weavero-people-lt-export-title = Export the Lineage Tree
weavero-people-lt-edge =
    { $type ->
        [phd] PhD
        [coadvisor] Co-advisor
        [postdoc] Postdoc
        [research] Research scientist
        [ra] Research assistant
       *[other] Other
    }
weavero-people-lt-more-up =
    { $count ->
        [1] { $count } more mentor not shown
       *[other] { $count } more mentors not shown
    }
weavero-people-lt-more-down =
    { $count ->
        [1] { $count } more trainee not shown
       *[other] { $count } more trainees not shown
    }
weavero-people-lt-fewer = Show fewer
weavero-people-lt-phd = PhD { $year }
weavero-people-lt-tree-inst = the institution the { $source } lists, which may be an earlier one
weavero-people-lt-aft-tip = This researcher’s page on the { $source } ({ $licence })
weavero-people-lt-open = Open
weavero-people-lt-open-tip = Open this researcher in Researchers
weavero-people-lt-follow-tip = Add to Researchers and follow
weavero-people-lt-card-tip = Click to center the tree on this researcher
weavero-people-lt-grants = NIH grants: { $list }
weavero-people-lt-credit = Mentors and trainees also from the { $source } ({ $licence }), export of { $version }.
# Researchers: the strip above the items list while a quick search names a researcher (peoplenet,
# MJT 2026-11-25). $here: their items in this library; $shown: of those, the ones the list shows now;
# $form: how the library writes the author ("First Last").
weavero-people-strip-label = Researchers your search names
weavero-people-strip-counts =
    { $here ->
        [1] { $here } item here
       *[other] { $here } items here
    } · { $shown } in these results
weavero-people-strip-only = Only theirs
weavero-people-strip-only-tip = Show only the items with the author { $form } (Weavero’s Authors filter)
weavero-people-strip-close = Hide for this search
weavero-people-strip-open-tip = Open in Researchers
