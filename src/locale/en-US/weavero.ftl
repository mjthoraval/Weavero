# Weavero's Fluent strings. Zotero registers every `locale/<locale>/*.ftl`
# of a plugin at startup (xpcom/plugins.js registerLocales). A main window
# links the file with MozXULElement.insertFTLIfNeeded("weavero.ftl") (the
# wiring table's `backlinks-ftl` entry); the Settings pane links it from its
# own markup. First file: the item-pane Backlinks section (issue #60), whose
# ItemPaneManager registration takes l10n ids only; then the Settings pane
# (localisation slice 1, 2026-11-11).

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
    .tooltiptext = Local files
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
weavero-pref-tabs-groups =
    .label = Tab groups in the tab bar
weavero-pref-tabs-groups-desc = Group tabs Firefox-style: right-click a tab → “Add to Tab Group…” for a named, colored group. Click the group’s chip to collapse or expand it; right-click the chip to rename, recolor, ungroup or close the group. Groups persist across restarts.
weavero-pref-tabs-split-view =
    .label = Split view
weavero-pref-tabs-split-view-desc = Show two tabs side by side, Firefox-style: right-click a tab → “Add Split View”, or select two tabs and choose “Open in Split View”. In the items list, “Open PDF in Split View” opens it beside the library; links in notes and comments offer “Open Link in Split View”. Drag the bar between the two to resize. Splits persist across restarts.
weavero-pref-tabs-split-footer =
    .label = Show a label on each side whose item pane is closed
weavero-pref-tabs-split-footer-desc = In a split view, a side with its item pane closed shows its tab’s icon and title in its bottom corner, with a menu for the split (separate the tabs, reverse them, close both). Opening that side’s item pane hides the label: the pane’s header names the item.
weavero-pref-tabs-sessions =
    .label = Tab sessions
weavero-pref-tabs-sessions-desc = Save and switch between named sets of tabs from the “List all tabs” popup. Your current tabs are always the current session; “+ New session” opens a fresh workspace, and switching is one click. Turn this off to hide the Sessions UI and freeze your saved sessions — they stay dormant (never overwritten) and reappear when you re-enable it.
weavero-pref-tabs-window-icons =
    .label = Per-window taskbar icons (Windows)
weavero-pref-tabs-window-icons-desc = Give each extra window its own icon — Zotero’s icon with a colored square badge for main windows and a colored round badge for reader windows (the primary window keeps the plain icon) — so taskbar previews, Task View and Alt+Tab tell the windows apart at a glance, the same way Chrome badges its profile windows. Windows only.
weavero-pref-tabs-windows-only = Windows only — has no effect on this system.
weavero-pref-tabs-taskbar-buttons =
    .label = Separate taskbar button per window (Windows)
weavero-pref-tabs-taskbar-buttons-desc = Give every extra window (main and reader) its own taskbar button with its badge icon, shown on the monitor where the window is — instead of grouping all windows behind one Zotero button. Note: split windows leave the shared preview flyout. Off by default.
weavero-pref-tabs-title-glyphs =
    .label = Window-type glyph in window titles
weavero-pref-tabs-title-glyphs-desc = Alternative for non-Windows platforms (off by default): prefix each window’s title with a small type mark — ⚓ for the primary window, squares (■ □ ▣) for other main windows, circles (● ○ ◉) for reader windows. Takes effect as titles refresh, e.g. on the next tab switch.
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
weavero-pref-collections-sticky-parents =
    .label = Keep parent collections pinned at the top while scrolling
weavero-pref-collections-sticky-lead = Up to
weavero-pref-collections-sticky-unit = { $count ->
        [0] levels
        [one] level
       *[other] levels
    }
weavero-pref-collections-sticky-parents-desc = The parents of the collections at the top of the pane stay pinned above them, as in VS Code’s file tree. Click a pinned parent to go to it; its arrow collapses it. The two trees of the Collections and Libraries Manager pin the same way.
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
    .label = Mark the automatic choice with a dimmed ▷ in the items list
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

# Reader annotations pane: its own funnel, the selector handle and the types it lists.
weavero-pref-annpane-title = Reader Annotations Pane
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
# [1], not [one]: this file serves every UI locale until it is translated,
# and plural categories differ (French's "one" also takes 0).

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
weavero-menu-split-close-both =
    .label = Close Both Tabs
weavero-menu-items-open-split =
    .label = { $type ->
        [pdf] Open PDF in Split View
        [epub] Open EPUB in Split View
        [snapshot] Open Snapshot in Split View
       *[note] Open Note in Split View
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
    .label = Delete Weavero Outline…
# The outline-extraction evaluation menu (a development tool). $verdict:
# none, good, bad or scan.
weavero-menu-oe-verdict =
    .label = { $verdict ->
        [good] Eval: extraction Good
        [bad] Eval: extraction Bad
        [scan] Eval: Scan (no text layer)
       *[none] Eval: Not marked
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
