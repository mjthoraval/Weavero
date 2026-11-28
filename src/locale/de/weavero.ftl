# Weavero -- German (de).
# Machine-assisted translation (Claude), to be reviewed by a native speaker.
# Source: locale/en-US/weavero.ftl. Terms Weavero shares with Zotero follow
# Zotero's own de translation.

weavero-backlinks-header =
    .label = { $count ->
        [one] { $count } Rückverweis
       *[other] { $count } Rückverweise
    }
weavero-backlinks-sidenav =
    .tooltiptext = Rückverweise
weavero-links-header =
    .label = { $count ->
        [one] { $count } Eintragslink
       *[other] { $count } Eintragslinks
    }
weavero-links-sidenav =
    .tooltiptext = Eintragslinks
weavero-pref-nav-links = Links & Beziehungen
weavero-pref-nav-filters = Sortierung & Filter
weavero-pref-nav-bookmarks = Lesezeichen
weavero-pref-nav-tabs = Tabs & Fenster
weavero-pref-nav-extras = Extras
weavero-pref-intro = Klickbare Links in Kommentaren und Notizen, Filter in der Eintragsliste und in den Tabs, Lesezeichen und zusätzliche Spalten in der Eintragsliste. Die meisten Funktionen sind standardmäßig aktiviert; deaktivieren Sie, was Sie nicht benötigen.
weavero-pref-links-title = Links & Beziehungen
weavero-pref-links-enable =
    .aria-label = Links und Beziehungen aktivieren
weavero-pref-links-desc = Klickbare URIs und Markdown direkt im Text, Symbole, um verwandte Einträge zu erkennen und zu erreichen, sowie Rechtsklick-Werkzeuge, um Zotero-Links zu kopieren und verwandte Einträge hinzuzufügen.
weavero-pref-links-mode-title = Anzeigemodus
weavero-pref-links-mode-desc = Wie Links und Markdown in Kommentaren und Notizen erscheinen – <strong>Im Text</strong> stellt alles vollständig dar; <strong>Symbol &amp; Popup</strong> lässt den Text unformatiert und öffnet ein Popup (ressourcenschonender).
weavero-pref-links-mode-inline =
    .label = Im Text
weavero-pref-links-mode-icon =
    .label = Symbol & Popup
weavero-pref-links-show = Anzeigen:
weavero-pref-links-show-urls =
    .label = URLs
weavero-pref-links-show-zotero =
    .label = Zotero-Links
weavero-pref-links-show-app =
    .label = App-Links
weavero-pref-links-show-markdown =
    .label = Markdown
weavero-pref-links-markdown-desc = Markdown: <strong>**fett**</strong>, <em>*kursiv*</em>, ~~durchgestrichen~~, <span data-l10n-name="mono">`code`</span>, <span data-l10n-name="mono2">[label](url)</span>. Die App-Link-Schemata werden direkt darunter ausgewählt.
weavero-pref-links-schemes-title = App-Link-Schemata
weavero-pref-links-schemes-desc = Welche Schemata Weavero in Kommentaren als App-Links erkennt. Nur wirksam, wenn oben <strong>App-Links</strong> aktiviert ist.
weavero-pref-links-schemes-no-confirm =
    .label = Ohne Bestätigungsdialog öffnen
weavero-pref-links-schemes-no-confirm-desc = Überspringt für die aktivierten Schemata die Firefox-Abfrage „Dieser Website erlauben, den …-Link zu öffnen?“.
weavero-pref-links-scheme-magnet =
    .label = magnet:
    .tooltiptext = Torrent-Magnet-Links
weavero-pref-links-scheme-mailto =
    .label = mailto:
    .tooltiptext = E-Mail-Adressen
weavero-pref-links-scheme-skype =
    .label = skype:
    .tooltiptext = Skype-Anrufe / -Chats
weavero-pref-links-scheme-sms =
    .label = sms:
    .tooltiptext = SMS-Nachrichten
weavero-pref-links-scheme-spotify =
    .label = spotify:
    .tooltiptext = Spotify-Titel / -Playlists
weavero-pref-links-scheme-tel =
    .label = tel:
    .tooltiptext = Telefonnummern
weavero-pref-links-scheme-discord =
    .label = discord://
    .tooltiptext = Discord-Server
weavero-pref-links-scheme-evernote =
    .label = evernote://
    .tooltiptext = Evernote-Notizen
weavero-pref-links-scheme-figma =
    .label = figma://
    .tooltiptext = Figma-Dateien
weavero-pref-links-scheme-file =
    .label = file://
    .tooltiptext = Lokale Dateien (fragt vor dem Öffnen)
weavero-pref-links-remote-file =
    .label = Links auf Dateien auf anderen Computern erlauben (Netzwerkfreigaben)
weavero-pref-links-remote-file-desc = Jeder Link fragt einmal, bevor er geöffnet wird; Weavero merkt sich die Links, die Sie öffnen. Beim Ausschalten werden sie vergessen.
weavero-pref-links-scheme-ftp =
    .label = ftp://
    .tooltiptext = FTP-Server
weavero-pref-links-scheme-msteams =
    .label = msteams://
    .tooltiptext = Microsoft Teams
weavero-pref-links-scheme-notion =
    .label = notion://
    .tooltiptext = Notion-Seiten
weavero-pref-links-scheme-obsidian =
    .label = obsidian://
    .tooltiptext = Obsidian-Notizen
weavero-pref-links-scheme-slack =
    .label = slack://
    .tooltiptext = Slack-Kanäle
weavero-pref-links-scheme-vscode =
    .label = vscode://
    .tooltiptext = VS-Code-Arbeitsbereiche / -Dateien
weavero-pref-links-scheme-zoom =
    .label = zoommtg://
    .tooltiptext = Zoom-Meetings
weavero-pref-links-view-icons =
    .label = Symbole über Anmerkungen in der Dokumentansicht
weavero-pref-links-view-icons-desc = Link- und Verwandt-Symbole, die auf der Seite über Anmerkungen gezeichnet werden, die einen Link oder verwandte Einträge haben. Deaktivieren Sie die Option, um das Dokument frei von Einblendungen zu halten.
weavero-pref-links-apply-title = Anwenden auf
weavero-pref-links-apply-library = Bibliothek:
weavero-pref-links-apply-items-list =
    .label = Eintragsliste
weavero-pref-links-apply-annotations-panel =
    .label = Anmerkungsbereich
weavero-pref-links-apply-reader = Reader:
weavero-pref-links-apply-reader-sidebar =
    .label = Seitenleiste
weavero-pref-links-apply-document-view =
    .label = Dokumentansicht
weavero-pref-links-apply-notes = Notizen:
weavero-pref-links-apply-note-editor =
    .label = Editor
    .tooltiptext = Links & Markdown im Notizeditor
weavero-pref-links-apply-notes-pane =
    .label = Notizbereich
    .tooltiptext = Links in der Notizliste des Kontextbereichs (Alle Notizen)
weavero-pref-links-apply-notes-list =
    .label = Eintragsliste
    .tooltiptext = Links in den Titeln von Notizeinträgen in der Eintragsliste
weavero-pref-links-apply-desc = Bereiche, in denen Weavero Links & Markdown in Anmerkungen darstellt.
weavero-pref-links-internal-title = Navigation über interne Links
weavero-pref-links-internal-desc = <strong>Strg/Cmd+Klick</strong> auf einen internen Link (Abbildung, Gleichung, Zitation) schickt sein Ziel in eine geteilte Ansicht; <strong>Umschalt+Klick</strong> schickt es in ein separates Fenster. Ist noch keine geteilte Ansicht geöffnet, wird sie so erstellt:
weavero-pref-links-internal-horizontal =
    .label = Horizontal geteilt
weavero-pref-links-internal-vertical =
    .label = Vertikal geteilt
weavero-pref-uri-title = URI-Werkzeuge
weavero-pref-uri-enable =
    .aria-label = URI-Werkzeuge aktivieren
weavero-pref-uri-desc = Rechtsklick-Einträge, die direkte <span data-l10n-name="mono">zotero://</span>-Links in die Zwischenablage kopieren.
weavero-pref-uri-copy-item =
    .label = „Auswahl-Link kopieren“ / „Öffnen-Link kopieren“ in den Eintragsmenüs
weavero-pref-uri-copy-item-desc = Kopiert einen <span data-l10n-name="mono">zotero://select/…</span>-Link, der zum Eintrag navigiert.
weavero-pref-uri-copy-collection =
    .label = „Sammlungslink kopieren“ / „Link zur gespeicherten Suche kopieren“
weavero-pref-uri-copy-collection-desc = Fügt dem Rechtsklickmenü der Sammlungsliste einen Eintrag zum Kopieren des Links hinzu.
weavero-pref-relations-title = Beziehungen & verknüpfte Einträge
weavero-pref-relations-enable =
    .aria-label = Funktionen für Beziehungen und verknüpfte Einträge aktivieren
weavero-pref-relations-desc = Funktionen, die auf Zoteros Beziehungen zwischen verwandten Einträgen und auf dem Mechanismus verknüpfter Einträge aufbauen.
weavero-pref-relations-add-related =
    .label = „Verwandte hinzufügen…“ im Menü der Eintragsliste
weavero-pref-relations-add-related-desc = Öffnet den Dialog zur Auswahl von Einträgen und verknüpft die gewählten Einträge als verwandte Einträge (funktioniert auch mit mehreren Anmerkungen).
weavero-pref-relations-chain-badge =
    .label = Kettensymbol auf Anmerkungszeilen mit verwandten Einträgen
weavero-pref-relations-chain-badge-desc = Ein Kettensymbol neben Anmerkungen, die verwandte Einträge haben; ein Klick darauf zeigt die Liste.
weavero-pref-relations-backlinks =
    .label = Abschnitt „Rückverweise“ im Eintragsbereich
weavero-pref-relations-backlinks-desc = Was hierher verlinkt: die Anmerkungskommentare und Notizen, die einen Zotero-Link (zotero://) oder eine Notiz-Zitation des ausgewählten Eintrags enthalten, gruppiert nach ihrem Eintrag, mit dem Text rund um den Link. Auch im Kontextbereich der Reader- und Notiz-Tabs sowie als Filter „Hat Rückverweise“.
weavero-pref-relations-item-links =
    .label = Abschnitt „Eintragslinks“ im Eintragsbereich
weavero-pref-relations-item-links-desc = Wohin der ausgewählte Eintrag verlinkt: die Zotero-Links (zotero://) und Notiz-Zitationen (die Zitationen und Anmerkungen, die Zoteros Notizeditor in eine Notiz einfügt) in seinen Notizen und Anmerkungskommentaren, gruppiert nach der Notiz oder Anmerkung, die sie enthält, jeweils mit dem umgebenden Text. Ein Link, dessen Eintrag nicht mehr existiert oder dessen Gruppen-Bibliothek nicht in diesem Profil vorhanden ist, wird ausgegraut aufgeführt und nicht gezählt. Auch im Kontextbereich der Reader- und Notiz-Tabs sowie in der Karte, die erscheint, wenn der Mauszeiger auf einem Zotero-Link oder einer Notiz-Zitation in einer Notiz, einem Anmerkungskommentar oder der Eintragsliste ruht.
weavero-pref-relations-children-scope =
    .label = Tags und verwandte Einträge der untergeordneten Einträge in den Abschnitten „Tags“ und „Zugehörig“ zählen und auflisten
weavero-pref-relations-children-scope-desc = Neben den Titeln der Abschnitte „Tags“ und „Zugehörig“ steht, wie viele der Eintrag selbst hat und wie viele seine Anhänge, Notizen und Anmerkungen haben. Klicken Sie auf eine Zahl, um nur diese anzuzeigen, Alt+Klick blendet sie aus; die Tags oder verwandten Einträge eines untergeordneten Eintrags werden unter denen des Eintrags aufgeführt, unter einer Überschrift für diesen untergeordneten Eintrag. Ist die Option deaktiviert, zeigt Zotero die beiden Abschnitte wie gewohnt.
weavero-pref-relations-open-related =
    .label = Untermenü „Verwandten Eintrag öffnen“ im Reader
weavero-pref-relations-open-related-desc = Einträge „Im Reader öffnen“ / „In neuem Fenster“ für jeden verwandten Eintrag im Kontextmenü der Anmerkung.
weavero-pref-relations-libraries-tint =
    .label = Zeilen verknüpfter Bibliotheken im Eintragsbereich einfärben
weavero-pref-relations-libraries-tint-desc = Hebt die Bibliothekszeile des angezeigten Eintrags im Abschnitt „Bibliotheken und Sammlungen“ hervor.
weavero-pref-filters-title = Sortierung & Filter
weavero-pref-filters-enable =
    .aria-label = Sortierung und Filter aktivieren
weavero-pref-filters-desc = Steuerelemente, die die sichtbare Menge ordnen, ausblenden, abblenden oder eingrenzen – die Sortierung der Anmerkungen im Reader, der Filterbereich der Eintragsliste (die ▾-Schaltfläche in der Symbolleiste) und die Filter nach Bibliothek / Dateityp im Tab-Menü.
weavero-pref-filters-ann-sort =
    .label = Sortierung der Anmerkungen im Reader
weavero-pref-filters-ann-sort-desc = Sortiert die Anmerkungs-Seitenleiste des Readers nach Position, „Hinzugefügt am“ oder „Geändert am“ – ein Rechtsklick auf den Tab-Kopf „Anmerkungen“ öffnet das Menü; während eine Sortierung nach Datum aktiv ist, erscheint eine Sortierleiste zum Umsortieren mit einem Klick, und die Karten zeigen dann beide Daten, das sortierte zuerst.
weavero-pref-filters-card-date-added =
    .label = „Hinzugefügt am“ auf Anmerkungskarten anzeigen
weavero-pref-filters-card-date-modified =
    .label = „Geändert am“ auf Anmerkungskarten anzeigen
weavero-pref-filters-card-dates-desc = Daten am unteren Rand jeder Karte in der Anmerkungs-Seitenleiste des Readers, unabhängig von der Sortierung; fahren Sie mit der Maus über ein Datum, um beide Daten vollständig zu sehen. Mit einem Rechtsklick auf den Tab-Kopf „Anmerkungen“ in einem Reader wählen Sie nur für dieses Dokument. Anmerkungen, die aus einem in einem anderen Programm erstellten PDF importiert wurden, tragen das Datum, an dem Zotero sie importiert hat.
weavero-pref-filters-items-tree =
    .label = Filterbereich der Eintragsliste
weavero-pref-filters-items-tree-desc = Die ▾-Schaltfläche in der Symbolleiste neben dem Suchfeld sowie das Filter-Popup (Farbe/Art/Dateityp, Tags, Autoren, Sammlungen, gespeicherte Suchen).
weavero-pref-filters-read-status =
    .label = Filter „Lesestatus“ (Zotero Reading List)
weavero-pref-filters-read-status-desc = Fügt dem Filter-Popup der Eintragsliste eine Zeile zum Umschalten des Lesestatus hinzu, wenn das Plugin Zotero Reading List installiert ist – filtern nach ⭐ Neu / 📙 Zu lesen / 📖 In Arbeit / 📗 Gelesen / … (Alt+Klick zum Ausschließen).
weavero-pref-filters-item-count =
    .label = Detaillierte Eintragsanzahl
weavero-pref-filters-item-count-desc = Ersetzt „N Einträge in dieser Ansicht“ im Eintragsbereich durch eine Aufschlüsselung – Einträge · Anhänge · Notizen · Anmerkungen –, damit klar ist, was die Zahl zählt und warum sie sich ändert, wenn Sie eine Zeile ausklappen. Während ein Filter aktiv ist, zeigt sie auch, wie viele Zeilen Treffer sind und wie viele nur als Kontext angezeigt werden. Deaktivieren Sie die Option für Zoteros einfache Zahl.
weavero-pref-filters-selection-target =
    .label = Dreistufiges Auswahlziel
weavero-pref-filters-selection-target-desc = Kontrollkästchen „Übergeordnet“ / „Anhang“ / „Anmerkung“, die Strg+A eingrenzen und Zeilen außerhalb des Bereichs abblenden.
weavero-pref-filters-collapse-advanced =
    .label = Erweiterte Suche zur Schnellsuche zurück einklappen
weavero-pref-filters-collapse-advanced-desc = Zoteros Einklapp-Schaltfläche blendet den Editor der erweiterten Suche aus, lässt aber ihren Filter aktiv, sodass nur noch eine Beschriftung „Erweiterte Suche“ übrig bleibt. Mit dieser Option kehrt das Einklappen stattdessen zum Feld der Schnellsuche mit derselben Abfrage zurück – die natürliche Umkehrung des Ausklappens mit der Trichter-Schaltfläche –, sofern die Schnellsuche die Suche ausdrücken kann (einfache Wörter in „Titel, Verfasser, Jahr“, „Alle Felder und Tags“ oder „Alles“). Eine Suche, die etwas anderes verwendet, etwa eine Bedingung zu Ersteller oder Datum, wird weiterhin wie in Zotero eingeklappt. Das Schließen-✕ leert und schließt immer.
weavero-pref-filters-tabs-library =
    .label = Filter nach Bibliothek im Tab-Menü
weavero-pref-filters-tabs-library-desc = Ein Kontrollkästchen neben jeder Bibliothekskopfzeile im Popup „Alle Tabs auflisten“, das diese Tabs ausblendet.
weavero-pref-filters-tabs-file-type =
    .label = Filter nach Dateityp im Tab-Menü
weavero-pref-filters-tabs-file-type-desc = Die Trichter-Schaltfläche im Popup „Alle Tabs auflisten“ für einen Filter nach Anhangsart.
weavero-pref-bookmarks-title = Lesezeichen
weavero-pref-bookmarks-enable =
    .aria-label = Lesezeichen aktivieren
weavero-pref-bookmarks-desc = Lesezeichen auf zwei Ebenen – ein Ausklappmenü in der Symbolleiste des Sammlungsbereichs für Einträge / Sammlungen / Suchen und ein Tab in der Reader-Seitenleiste für Stellen im Dokument.
weavero-pref-bookmarks-sync-note = Lesezeichen werden noch nicht zwischen Computern synchronisiert – sie werden lokal in <span data-l10n-name="mono">&lt;Zotero data dir&gt;/weavero/bookmarks.json</span> gespeichert. (Sobald Zoteros synchronisierter Speicher für Plugins verfügbar ist, wird darauf umgestellt.)
weavero-pref-bookmarks-library =
    .label = Bibliothekslesezeichen
weavero-pref-bookmarks-library-desc = Ein Lesezeichen-Ausklappmenü in der Symbolleiste des Sammlungsbereichs für Einträge / Sammlungen / gespeicherte Suchen.
weavero-pref-bookmarks-library-autohide =
    .label = Schaltfläche für Bibliothekslesezeichen automatisch ausblenden, wenn leer
weavero-pref-bookmarks-collection-scroll-title = Wo eine Sammlung aus einem Lesezeichen erscheint
weavero-pref-bookmarks-collection-scroll-desc = Wenn ein Lesezeichen eine Sammlung, Bibliothek oder gespeicherte Suche öffnet, scrollt der Sammlungsbereich sie hierhin:
weavero-pref-bookmarks-collection-scroll-top =
    .label = An den oberen Rand des Bereichs (Standard)
weavero-pref-bookmarks-collection-scroll-native =
    .label = Zoteros eigenes Verhalten: nur so weit wie nötig scrollen
weavero-pref-bookmarks-document =
    .label = Dokumentlesezeichen
weavero-pref-bookmarks-document-desc = Ein Tab „Lesezeichen“ in der Reader-Seitenleiste für Stellen im Dokument. Ziehen Sie eine Anmerkung oder eine Auswahl darauf, um ein Lesezeichen zu setzen.
weavero-pref-bookmarks-document-autohide =
    .label = Tab für Dokumentlesezeichen automatisch ausblenden, wenn leer
weavero-pref-bookmarks-library-in-reader =
    .label = Tab für Bibliothekslesezeichen im Reader anzeigen
weavero-pref-bookmarks-library-in-reader-desc = Bibliothekslesezeichen neben denen im Dokument durchsuchen (Strg+Klick führt beide Ansichten zusammen).
weavero-pref-bookmarks-page-numbers =
    .label = Seitenzahlen neben Dokumentlesezeichen anzeigen
weavero-pref-bookmarks-page-numbers-desc = Die Angabe „S. N“ rechts neben jedem Lesezeichen. Mit einem Rechtsklick auf den Tab „Lesezeichen“ in einem Reader blenden Sie sie nur für dieses Dokument ein oder aus. Die Vorschaukarte zeigt die Seite weiterhin.
weavero-pref-tabs-title = Tabs & Fenster
weavero-pref-tabs-enable =
    .aria-label = Funktionen für Tabs und Fenster aktivieren
weavero-pref-tabs-desc = Tab-Gruppen, Fensterrahmen im Browser-Stil, mehrere Hauptfenster und ein Eintragsbereich in separaten Reader-Fenstern.
weavero-pref-tabs-desc-native = Tab-Gruppen, Fensterrahmen im Browser-Stil und Werkzeuge für die Arbeit in mehreren Fenstern.
weavero-pref-tabs-groups =
    .label = Tab-Gruppen in der Tableiste
weavero-pref-tabs-groups-desc = Gruppieren Sie Tabs wie in Firefox: Rechtsklick auf einen Tab → „Zu Tab-Gruppe hinzufügen…“ für eine benannte, farbige Gruppe. Klicken Sie auf den Chip der Gruppe, um sie ein- oder auszuklappen; mit einem Rechtsklick auf den Chip benennen Sie die Gruppe um, ändern ihre Farbe, heben die Gruppierung auf oder schließen die Gruppe. Gruppen bleiben über Neustarts hinweg erhalten.
weavero-pref-tabs-split-view =
    .label = Geteilte Ansicht
weavero-pref-tabs-split-view-desc = Zeigt zwei Tabs nebeneinander wie in Firefox: Rechtsklick auf einen Tab → „Geteilte Ansicht hinzufügen“, oder wählen Sie zwei Tabs aus und dann „In geteilter Ansicht öffnen“. In der Eintragsliste öffnet „PDF in geteilter Ansicht öffnen“ es neben der Bibliothek; Links in Notizen und Kommentaren bieten „Link in geteilter Ansicht öffnen“ an. Ziehen Sie die Leiste zwischen beiden, um die Größe zu ändern. Geteilte Ansichten bleiben über Neustarts hinweg erhalten.
weavero-pref-tabs-split-dock-desc = Um einen Tab im Blick zu behalten, Rechtsklick darauf → „Tab sperren“: Er wandert auf die linke Seite des Fensters, und die rechte Seite zeigt den Tab, den Sie gerade auswählen (sperren Sie die Bibliothek, öffnet sich ein Eintrag, den Sie daraus öffnen, daneben). Der gesperrte Tab ist golden umrandet und trägt ein Vorhängeschloss auf seinem Symbol; solange Sie sich auf ihm befinden, ist der daneben gezeigte Tab schattiert. Klicken Sie auf den gesperrten Tab, um seine Seite einzuklappen und das Fenster dem aktuellen Tab zu überlassen; ein weiterer Klick holt sie zurück. Zum Entsperren Rechtsklick darauf → „Tab entsperren“.
weavero-pref-tabs-split-footer =
    .label = Auf jeder Seite mit geschlossenem Eintragsbereich eine Beschriftung anzeigen
weavero-pref-tabs-split-footer-desc = In einer geteilten Ansicht zeigt eine Seite mit geschlossenem Eintragsbereich das Symbol und den Titel ihres Tabs in ihrer unteren Ecke, mit einem Menü für die geteilte Ansicht (Tabs trennen, vertauschen, beide schließen). Das Öffnen des Eintragsbereichs dieser Seite blendet die Beschriftung aus: Die Kopfzeile des Bereichs nennt den Eintrag.
weavero-pref-tabs-library-pin-name =
    .label = Den Namen des Bibliotheks-Tabs anzeigen, wenn er angeheftet ist
weavero-pref-tabs-library-pin-name-desc = Ein angehefteter Tab „Meine Bibliothek“ (oder einer Gruppenbibliothek) zeigt sein Symbol und seinen Namen, so breit wie der Name es braucht, statt nur des Symbols. Diese Option ist die Voreinstellung für jeden Bibliotheks-Tab; „Tab-Namen anzeigen“ im Kontextmenü eines angehefteten Tabs zeigt oder verbirgt nur den Namen dieses Tabs, und die eigene Wahl des Tabs hat Vorrang vor dieser Option.
weavero-pref-tabs-sessions =
    .label = Tab-Sitzungen
weavero-pref-tabs-sessions-desc = Speichern Sie benannte Tab-Sätze im Popup „Alle Tabs auflisten“ und wechseln Sie zwischen ihnen. Ihre aktuellen Tabs sind immer die aktuelle Sitzung; „+ Neue Sitzung“ öffnet einen neuen Arbeitsbereich, und der Wechsel braucht nur einen Klick. Deaktivieren Sie diese Option, um die Sitzungsoberfläche auszublenden und Ihre gespeicherten Sitzungen einzufrieren – sie ruhen (werden nie überschrieben) und erscheinen wieder, wenn Sie die Option erneut aktivieren.
weavero-pref-tabs-window-icons =
    .label = Taskleistensymbole pro Fenster (Windows)
weavero-pref-tabs-window-icons-desc = Gibt jedem zusätzlichen Fenster ein eigenes Symbol – Zoteros Symbol mit einem farbigen quadratischen Abzeichen für Hauptfenster und einem farbigen runden Abzeichen für Reader-Fenster (das primäre Fenster behält das schlichte Symbol) –, sodass Taskleistenvorschauen, Taskansicht und Alt+Tab die Fenster auf einen Blick unterscheiden, so wie Chrome seine Profilfenster kennzeichnet. Nur Windows.
weavero-pref-tabs-window-icons-desc-native = Gibt jedem zusätzlichen Fenster ein eigenes Symbol – Zoteros Symbol mit einem farbigen quadratischen Abzeichen (das primäre Fenster behält das schlichte Symbol) –, sodass Taskleistenvorschauen, Taskansicht und Alt+Tab die Fenster auf einen Blick unterscheiden, so wie Chrome seine Profilfenster kennzeichnet. Nur Windows.
weavero-pref-tabs-windows-only = Nur Windows – hat auf diesem System keine Wirkung.
weavero-pref-tabs-taskbar-buttons =
    .label = Eigene Taskleistenschaltfläche pro Fenster (Windows)
weavero-pref-tabs-taskbar-buttons-desc = Gibt jedem zusätzlichen Fenster (Haupt- und Reader-Fenster) eine eigene Taskleistenschaltfläche mit seinem Abzeichen-Symbol, angezeigt auf dem Monitor, auf dem sich das Fenster befindet – statt alle Fenster hinter einer einzigen Zotero-Schaltfläche zu gruppieren. Hinweis: Getrennte Fenster verlassen die gemeinsame Vorschauleiste. Standardmäßig deaktiviert.
weavero-pref-tabs-taskbar-buttons-desc-native = Gibt jedem zusätzlichen Fenster eine eigene Taskleistenschaltfläche mit seinem Abzeichen-Symbol, angezeigt auf dem Monitor, auf dem sich das Fenster befindet – statt alle Fenster hinter einer einzigen Zotero-Schaltfläche zu gruppieren. Hinweis: Getrennte Fenster verlassen die gemeinsame Vorschauleiste. Standardmäßig deaktiviert.
weavero-pref-tabs-progress-window =
    .label = Schaltflächen zum Minimieren und Maximieren im Fenster „Volltext finden“
weavero-pref-tabs-progress-window-desc = Das Fortschrittsfenster von „Volltext finden“ und „Metadaten abrufen“ erhält in seiner Titelleiste Schaltflächen zum Minimieren und Maximieren, und seine Schaltfläche „Minimieren“ minimiert es, statt es zu schließen. Die Arbeit läuft in beiden Fällen weiter. Standardmäßig aktiviert.
weavero-pref-tabs-title-glyphs =
    .label = Fenstertyp-Zeichen im Fenstertitel
weavero-pref-tabs-title-glyphs-desc = Alternative für andere Plattformen als Windows (standardmäßig deaktiviert): Stellt dem Titel jedes Fensters ein kleines Typzeichen voran – ⚓ für das primäre Fenster, Quadrate (■ □ ▣) für weitere Hauptfenster, Kreise (● ○ ◉) für Reader-Fenster. Wirkt, sobald Titel aktualisiert werden, z. B. beim nächsten Tab-Wechsel.
weavero-pref-tabs-title-glyphs-desc-native = Alternative für andere Plattformen als Windows (standardmäßig deaktiviert): Stellt dem Titel jedes Fensters ein kleines Typzeichen voran – ⚓ für das primäre Fenster, Quadrate (■ □ ▣) für die weiteren Fenster. Wirkt, sobald Titel aktualisiert werden, z. B. beim nächsten Tab-Wechsel.
weavero-pref-tabs-window-name-title = Fenstername im Fenstertitel
weavero-pref-tabs-window-name-desc = Zeigt den Namen eines umbenannten Fensters in seinem Systemtitel – Taskleistenvorschauen, Alt+Tab und Taskansicht – wie „Fenster benennen“ in Chrome. <strong>Vor dem Titel</strong> behält den Seitenkontext („Haupt — Azam et al.“); <strong>Titel ersetzen</strong> zeigt nur den Namen. Fenster ohne eigenen Namen behalten immer den normalen Titel.
weavero-pref-tabs-window-name-off =
    .label = Aus
weavero-pref-tabs-window-name-prefix =
    .label = Vor dem Titel
weavero-pref-tabs-window-name-replace =
    .label = Titel ersetzen
weavero-pref-titlebar-title = Titelleiste ausblenden
weavero-pref-titlebar-enable =
    .aria-label = Titelleiste ausblenden (wie in Firefox)
weavero-pref-titlebar-desc = Ersetzt die Titelleiste durch eine Leiste im Browser-Stil – die Menüs treten in den Hintergrund (Alt drücken) und die Fensterschaltflächen wandern in die Tableiste. Nur Windows / Linux.
weavero-pref-titlebar-apply = Anwenden auf:
weavero-pref-titlebar-main =
    .label = Hauptfenster
weavero-pref-titlebar-reader =
    .label = Reader-Fenster
weavero-pref-titlebar-note =
    .label = Notizfenster
weavero-pref-titlebar-plugins-manager =
    .label = Plugin-Verwaltung
weavero-pref-titlebar-note-deck =
    .label = Notizen in einem Fenster öffnen, das Tabs aufnehmen kann
weavero-pref-titlebar-note-deck-desc = Beim Öffnen einer Notiz in einem neuen Fenster wird ein Fenster im Reader-Stil verwendet, in das PDF- / Notiz-Tabs gezogen werden können. Dafür muss oben die Titelleiste des Reader-Fensters ersetzt sein. Eine eigenständige Notiz (ohne übergeordneten Eintrag) zeigt beim Öffnen des Fensters kurz ein Platzhalterdokument.
weavero-pref-mainwin-title = Mehrere Hauptfenster
weavero-pref-mainwin-native-note = Diese Zotero-Version hat eigene Fenster und Bibliothekstabs; sie öffnet, verschiebt und stellt sie selbst wieder her, und die Optionen, die zu Weaveros eigenen zusätzlichen Fenstern gehören, sind hier deaktiviert. Gespeicherte Fenster, Tab-Sitzungen und das Fenster der erweiterten Suche funktionieren wie bisher.
weavero-pref-mainwin-enable =
    .label = Neue Hauptfenster öffnen
weavero-pref-mainwin-enable-desc = Ein unabhängiges zweites Hauptfenster mit eigenen Tabs, Spalten, Filtern und Bereichsbreiten: Strg+N / ⌘N, <em>Datei → Neues Hauptfenster</em>, die Einträge <em>Neues Fenster</em> der Tab- und Eintragsmenüs und die erweiterte Suche in einem neuen Fenster. Ist die Option deaktiviert, öffnet keiner dieser Wege ein solches Fenster.
weavero-pref-mainwin-restore =
    .label = Zusätzliche Fenster beim Neustart wiederherstellen
weavero-pref-mainwin-restore-desc = Öffnet die zusätzlichen Fenster wieder, die beim Neustart von Zotero geöffnet waren.
weavero-pref-mainwin-adv-shortcut =
    .label = Strg+Umschalt+F / ⇧⌘F öffnet die erweiterte Suche in einem neuen Fenster
weavero-pref-mainwin-adv-shortcut-desc = Zoteros Tastenkombination für die erweiterte Suche öffnet die Suche in diesem Fenster. Mit dieser Option öffnet sie stattdessen ein neues Fenster mit der aktuellen Sammlung – wie Umschalt+Klick auf den Trichter oder <em>Bearbeiten → Erweiterte Suche in neuem Fenster</em>. Zotero 10.
weavero-pref-mainwin-adv-hide-panes =
    .label = Seitenbereiche im Fenster der erweiterten Suche ausblenden
weavero-pref-mainwin-adv-hide-panes-desc = Das Fenster öffnet sich nur mit der Suche und ihren Ergebnissen – ohne Sammlungsbereich, ohne Eintragsbereich – wie das separate Fenster der erweiterten Suche in Zotero 9. <em>Ansicht → Layout</em> holt einen Bereich in diesem Fenster zurück.
weavero-pref-reader-pane-title = Eintragsbereich in separaten Reader-Fenstern
weavero-pref-reader-pane-enable =
    .label = In separaten Fenstern einen Eintragsbereich neben dem Reader anzeigen
weavero-pref-reader-pane-desc = Fügt eigenständigen Reader-Fenstern den Bereich mit Eintragsinfos / Kontext (Abschnitte, Seitennavigation) hinzu, wie den rechten Bereich des Hauptfensters.
weavero-pref-extras-title = Extras
weavero-pref-extras-enable =
    .aria-label = Visuelle Extras aktivieren
weavero-pref-extras-desc = Kleinere informative Anzeigen in der bestehenden Zotero-Oberfläche – Abzeichen in der Eintragsliste, Spalten der Eintragsliste und Zeichen in der Tableiste.
weavero-pref-columns-title = Spalten der Eintragsliste
weavero-pref-columns-desc = Zusätzliche Spalten, ausgeblendet, bis Sie sie in der Spaltenauswahl aktivieren (Rechtsklick auf die Kopfzeile der Eintragsliste).
weavero-pref-columns-annotations =
    .label = Spalte „Anmerkungen“
weavero-pref-columns-annotations-desc = Anzahl der Anmerkungen auf Anhängen (bei regulären Einträgen über alle Anhänge summiert).
weavero-pref-columns-tags-auto =
    .label = Spalte „Tags“ – Anzahl automatischer Tags hinzufügen
weavero-pref-columns-tags-auto-desc = Zeigt manuelle Tags (blau) und automatische Tags. Deaktivieren Sie die Option, um nur die Anzahl manueller Tags zu zeigen. Dies ist die Voreinstellung für jedes Fenster: Ein Fenster kann im Rechtsklickmenü der Spaltenüberschrift selbst wählen (Tags › Anzahl automatischer Tags).
weavero-pref-columns-related =
    .label = Spalte „Zugehörig“
weavero-pref-columns-related-desc = Anzahl verwandter Einträge pro Zeile.
weavero-pref-columns-backlinks =
    .label = Spalte „Rückverweise“
weavero-pref-columns-backlinks-desc = Anzahl der Anmerkungskommentare und Notizen an anderer Stelle, die auf den Eintrag, seine Anhänge, Notizen oder Anmerkungen verlinken.
weavero-pref-columns-item-links =
    .label = Spalte „Eintragslinks“
weavero-pref-columns-item-links-desc = Anzahl der Zotero-Einträge, auf die die Notizen und Anmerkungskommentare der Zeile über Zotero-Links oder Notiz-Zitationen verlinken (ein defekter Link wird aufgeführt, aber nicht gezählt).
weavero-pref-columns-ext-links =
    .label = Spalte „Externe Links“
weavero-pref-columns-ext-links-desc = Anzahl der Web- und App-Links in den Notizen und Anmerkungskommentaren der Zeile (jeder Link einmal; ein zotero://-Link zählt zu den Eintragslinks). Klicken Sie auf die Zahl, um die Liste zu sehen.
weavero-pref-itemslist-title = Eintragsliste & Tabs
weavero-pref-itemslist-title-lines = Titel in der Eintragsliste
weavero-pref-itemslist-title-lines-off =
    .label = Eine Zeile
weavero-pref-itemslist-title-lines-fixed =
    .label = Feste Höhe
weavero-pref-itemslist-title-lines-adaptive =
    .label = An jeden Titel anpassen
weavero-pref-itemslist-title-lines-lead = { $mode ->
        [fixed] Höhe von
       *[other] Bis zu
    }
weavero-pref-itemslist-title-lines-unit = { $count ->
        [one] Zeile
       *[other] Zeilen
    }
weavero-pref-itemslist-title-lines-desc = „Feste Höhe“ macht jede Zeile der Liste so hoch wie diese Anzahl Textzeilen. „An jeden Titel anpassen“ macht jede Zeile so hoch, wie ihr Titel es braucht, bis zu dieser Anzahl Textzeilen. Die anderen Textspalten werden innerhalb dieser Höhe umbrochen, und alles steht oben in der Zeile. Längerer Text endet mit Auslassungspunkten, und untergeordnete Zeilen bleiben einzeilig.
weavero-pref-itemslist-added-by =
    .label = „Hinzugefügt durch“ für Anmerkungen anzeigen
weavero-pref-itemslist-added-by-desc = In Gruppen-Bibliotheken ein Abzeichen mit dem Ersteller der Anmerkung neben ihrer Zeile.
weavero-pref-itemslist-added-by-colors =
    .label = Bei „Hinzugefügt durch“ für jeden Benutzer eine eigene Farbe verwenden
weavero-pref-itemslist-added-by-colors-desc = Färbt den Text und das Abzeichen von „Hinzugefügt durch“ in einer Farbe pro Benutzer. Deaktivieren Sie die Option für die Standard-Textfarbe.
weavero-pref-itemslist-group-glyph =
    .label = Gruppen-Bibliothek-Zeichen + Tooltip auf Tabs
weavero-pref-itemslist-group-glyph-desc = Ein Gruppenzeichen auf dem Dateitypsymbol von Tabs, deren Eintrag in einer Gruppen-Bibliothek liegt, sowie ein ausführlicherer Tooltip.
weavero-pref-itemslist-tab-ring =
    .label = Tabs im Firefox-Stil: abgerundet, mit einer Kontur um den ausgewählten Tab
weavero-pref-itemslist-tab-ring-desc = Pillenförmige Tabs und eine dünne violett-orange Kontur um den ausgewählten Tab, wie im neuen Tab-Design von Firefox. Deaktivieren Sie die Option für Zoteros eigene Tabs: eckige Ecken und ein hervorgehobener ausgewählter Tab.
weavero-pref-itemslist-layout-menu =
    .label = Ansicht → Layout folgt dem Tab
weavero-pref-itemslist-layout-menu-desc = Zoteros Menüeinträge unter <em>Ansicht → Layout</em> schalten die Bereiche der Bibliothek um, egal welcher Tab vorne ist. In einem Reader-Tab zeigt das Untermenü stattdessen die Bereiche des Readers – <em>Seitenleiste</em>, <em>Kontextbereich</em> und die <em>Farb- und Tag-Auswahl</em> am Fuß des Anmerkungsbereichs – mit ihrem tatsächlichen Zustand als Häkchen; ein Notiz-Tab zeigt <em>Kontextbereich</em> (und mit Better Notes <em>Gliederungsbereich</em>); der Bibliothekstab behält Zoteros Menüeinträge. Ein separates Reader-Fenster erhält ein eigenes Untermenü „Layout“. Ist die Option deaktiviert, bleibt das Menü so, wie Zotero es zeigt.
weavero-pref-itemslist-layout-menu-desc-native = Zoteros Menüeinträge unter <em>Ansicht → Layout</em> schalten die Bereiche der Bibliothek um, egal welcher Tab vorne ist. In einem Reader-Tab zeigt das Untermenü stattdessen die Bereiche des Readers – <em>Seitenleiste</em>, <em>Kontextbereich</em> und die <em>Farb- und Tag-Auswahl</em> am Fuß des Anmerkungsbereichs – mit ihrem tatsächlichen Zustand als Häkchen; ein Notiz-Tab zeigt <em>Kontextbereich</em> (und mit Better Notes <em>Gliederungsbereich</em>); der Bibliothekstab behält Zoteros Menüeinträge. Ist die Option deaktiviert, bleibt das Menü so, wie Zotero es zeigt.
weavero-pref-collections-title = Sammlungsbereich
weavero-pref-collections-pane-toggle =
    .label = Schaltfläche zum Ein-/Ausklappen des Sammlungsbereichs
weavero-pref-collections-pane-toggle-desc = Eine Schaltfläche am linken Ende der Symbolleiste, wie die des Eintragsbereichs und des Readers. <em>Ansicht → Layout</em> funktioniert daneben weiterhin.
weavero-pref-collections-tag-selector-handle =
    .label = Griff an der Tag-Auswahl: Klicken zum Ein- oder Ausklappen
weavero-pref-collections-tag-selector-handle-desc = Ein kleiner Griff am oberen Rand der Tag-Auswahl. Ein Klick klappt die Auswahl an diesen Rand, der nächste holt sie zurück; Ziehen am Rand ändert weiterhin die Größe. Ein ausgewähltes Tag filtert die Liste weiter, während die Auswahl eingeklappt ist, und der Griff wird blau, um das anzuzeigen. <em>Ansicht → Layout → Tag-Auswahl</em> zeigt denselben Zustand.
weavero-pref-collections-no-collapse =
    .label = Größenänderung eines Seitenbereichs stoppt bei seiner Mindestbreite
weavero-pref-collections-no-collapse-desc = Das Ziehen am Rand eines Seitenbereichs stoppt bei seiner schmalsten Breite, statt ihn zuschnappen zu lassen: der Sammlungsbereich, der Eintragsbereich, der Kontextbereich von Reader-Tabs und der Eintragsbereich von Reader-Fenstern. Klappen Sie sie mit ihren Schaltflächen oder über <em>Ansicht → Layout</em> ein. Ist die Option deaktiviert, schnappen alle wie in Zotero zu.
weavero-pref-collections-no-collapse-desc-native = Das Ziehen am Rand eines Seitenbereichs stoppt bei seiner schmalsten Breite, statt ihn zuschnappen zu lassen: der Sammlungsbereich, der Eintragsbereich und der Kontextbereich von Reader-Tabs. Klappen Sie sie mit ihren Schaltflächen oder über <em>Ansicht → Layout</em> ein. Ist die Option deaktiviert, schnappen alle wie in Zotero zu.
weavero-pref-collections-sticky-parents =
    .label = Übergeordnete Sammlungen beim Scrollen oben angeheftet lassen
weavero-pref-collections-sticky-lead = Bis zu
weavero-pref-collections-sticky-unit = { $count ->
        [one] Ebene
       *[other] Ebenen
    }
weavero-pref-collections-sticky-parents-desc = Die übergeordneten Sammlungen der Sammlungen oben im Bereich bleiben über ihnen angeheftet, wie im Dateibaum von VS Code. Klicken Sie auf eine angeheftete übergeordnete Sammlung, um zu ihr zu gehen; ihr Pfeil klappt sie ein. Die beiden Bäume der Verwaltung für Sammlungen und Bibliotheken heften auf dieselbe Weise an.
weavero-pref-collections-search-folders =
    .label = Ordner für gespeicherte Suchen
weavero-pref-collections-search-folders-names =
    .label = Ordner auch aus Suchnamen lesen (Personen/Studierende/…)
weavero-pref-collections-search-folders-desc = Gespeicherte Suchen lassen sich unter ihrer Bibliothek in Ordner einordnen: Ziehen Sie eine Suche auf einen Ordner oder klicken Sie sie mit der rechten Maustaste an: In Ordner verschieben. Weavero speichert die Ordner auf diesem Computer; an Ihrer Bibliothek ändert sich nichts. Welche Ordner geöffnet sind, wird mit jeder Sitzung gespeichert. Mit der zweiten Option erscheint eine Suche namens „A/B/C“ als „C“ im Ordner A › B, wie beim Plugin Saved Search Folders.
weavero-sf-move-to =
    .label = In Ordner verschieben
weavero-sf-unfiled =
    .label = In keinem Ordner
weavero-sf-new-folder =
    .label = Neuer Ordner…
weavero-sf-new-subfolder =
    .label = Neuer Unterordner…
weavero-sf-new-search-folder =
    .label = Neuer Suchordner…
weavero-sf-rename-folder =
    .label = Ordner umbenennen…
weavero-sf-move-folder =
    .label = Ordner verschieben nach
weavero-sf-top-level =
    .label = Oberste Ebene
weavero-sf-delete-folder =
    .label = Ordner löschen
weavero-sf-folder-name-title = Ordner für gespeicherte Suchen
weavero-sf-folder-name-prompt = Name des Ordners:
weavero-sf-delete-confirm = Den Ordner „{ $name }“ und { $count ->
        [one] seinen Unterordner
       *[other] seine { $count } Unterordner
    } löschen? Die gespeicherten Suchen darin bleiben in Ihrer Bibliothek, außerhalb jedes Ordners.
weavero-sf-name-folder = Aus den Namen der Suchen: { $path }
weavero-pref-collections-bookmarks-pane =
    .label = Lesezeichenbereich über den Sammlungen
weavero-pref-collections-bookmarks-pane-desc = Ihre Bibliotheks-Lesezeichen in einem Bereich über dem Sammlungsbaum, mit einer Trennleiste dazwischen. Klicken Sie auf seine Kopfzeile, um ihn einzuklappen; seine Schaltfläche ⇕ zeigt nur die Lesezeichen, anstelle des Sammlungsbaums. Ordner öffnen sich an Ort und Stelle, und Einträge, die auf das Lesezeichen einer Sammlung gezogen werden, kommen in diese Sammlung. Jedes Fenster behält sein eigenes Layout, gespeichert mit seiner Sitzung. Die Lesezeichen-Schaltfläche über den Sammlungen bleibt.
weavero-bmpane-fold-tip = { $folded ->
        [yes] Lesezeichen ausklappen
       *[other] Lesezeichen einklappen
    }
weavero-bmpane-only-tip = { $on ->
        [yes] Sammlungsbaum wieder anzeigen
       *[other] Nur Lesezeichen: Sammlungsbaum ausblenden
    }
weavero-bmpane-now-tip = Angezeigt: { $name }. Klicken, um den Sammlungsbaum damit anzuzeigen.
weavero-bmpane-now-add = Als Lesezeichen speichern
weavero-bmpane-folder-current = Dieser Ordner enthält das Angezeigte
# The funnel above the collections pane (coll-funnel.ts): Settings.
weavero-pref-collections-funnel =
    .label = Trichter über dem Sammlungsbereich
weavero-pref-collections-funnel-desc = Eine Trichter-Schaltfläche in der Symbolleiste des Sammlungsbereichs filtert, was der Bereich anzeigt: Sammlungen, gespeicherte Suchen, Feeds, die besonderen Zeilen (Eintragsdubletten, Einträge ohne Sammlung, Papierkorb …), jede Bibliothek und Weaveros eigene Bereiche. Klicken Sie auf einen Chip, um nur ihn anzuzeigen, Alt+Klick blendet ihn aus. Jedes Fenster behält seinen eigenen Filter, gespeichert mit seiner Sitzung; „Als Standard verwenden“ im Trichter macht ihn zum Filter, mit dem jedes Fenster beginnt.
weavero-pref-collfunnel-defaults-title = Standardmäßig angezeigt
weavero-pref-collfunnel-show-collections =
    .label = Sammlungen
weavero-pref-collfunnel-show-searches =
    .label = Gespeicherte Suchen
weavero-pref-collfunnel-show-feeds =
    .label = Feeds
weavero-pref-collfunnel-show-special =
    .label = Besondere Zeilen
weavero-pref-collfunnel-show-bookmarks =
    .label = Lesezeichenbereich
weavero-pref-collfunnel-show-folders =
    .label = Ordner für gespeicherte Suchen
# The libraries the default leaves out. $mode: hidden, only or none; $names: the libraries.
weavero-pref-collfunnel-libs = { $mode ->
        [hidden] Standardmäßig ausgeblendete Bibliotheken: { $names }
        [only] Standardmäßig angezeigte Bibliotheken: nur { $names }
       *[none] Alle Bibliotheken werden standardmäßig angezeigt.
    }
weavero-pref-collfunnel-libs-reset = Zurücksetzen
# The funnel's button. $active: yes when it filters; $parts: what it filters.
weavero-cf-tb-tip = { $active ->
        [yes] Filter des Sammlungsbereichs: { $parts }
       *[no] Den Sammlungsbereich filtern
    }
# The funnel's rows of chips.
weavero-cf-row-kinds = Arten
weavero-cf-row-libs = Bibliotheken
weavero-cf-row-secs = Bereiche von Weavero
weavero-cf-kind-collections = Sammlungen
weavero-cf-kind-searches = Gespeicherte Suchen
weavero-cf-kind-feeds = Feeds
weavero-cf-kind-special = Besondere Zeilen
weavero-cf-kind-special-tip = Eintragsdubletten, Einträge ohne Sammlung, Kürzlich Gelesene, Zurückgezogene Einträge, Meine Publikationen und Papierkorb
weavero-cf-sec-bookmarks = Lesezeichenbereich
weavero-cf-sec-folders = Ordner für gespeicherte Suchen
weavero-cf-hint = Klick: nur dies anzeigen. Alt+Klick: ausblenden.
# What a row filters, in the button's tooltip. $mode: only or hide; $names: the chips.
weavero-cf-part = { $mode ->
        [only] nur { $names }
       *[hide] ohne { $names }
    }
# The footer's line. $scope: window (this window's own filter) or default.
weavero-cf-scope = { $scope ->
        [window] Eigener Filter dieses Fensters
       *[default] Folgt dem Standard
    }
    .title = { $scope ->
        [window] Dieses Fenster weicht vom Standardfilter ab; „Auf Standard zurücksetzen“ folgt ihm wieder.
       *[default] Dieses Fenster zeigt den Standardfilter, den „Als Standard verwenden“ ändert.
    }
weavero-cf-use-default = Als Standard verwenden
    .title = Diesen Filter, so wie er ist, zum Filter machen, mit dem jedes Fenster beginnt
weavero-cf-reset-default = Auf Standard zurücksetzen
    .title = In diesem Fenster zum Standardfilter zurückkehren
# Where the funnel leaves nothing in the tree.
weavero-cf-empty = Nichts entspricht dem Trichter.
weavero-cf-empty-clear = Zurücksetzen
weavero-pref-collections-sticky-headers =
    .label = Abschnittsüberschriften beim Scrollen oben im Eintragsbereich angeheftet lassen
weavero-pref-collections-sticky-headers-desc = Die Kopfzeile jedes Abschnitts bleibt oben im Eintragsbereich angeheftet, während ihr Abschnitt vorbeiscrollt, bis die nächste Kopfzeile sie verdrängt; in den Abschnitten „Eintragslinks“ und „Rückverweise“ sowie in den erweiterten Abschnitten „Tags“ und „Zugehörig“ bleibt die Überschrift des Teils, dessen Zeilen gerade vorbeiziehen, darunter stehen. Ein Klick auf eine angeheftete Kopfzeile klappt ihren Abschnitt weiterhin ein. Im Eintragsbereich der Bibliothek und in den Kontextbereichen der Reader- und Notiz-Tabs.
weavero-pref-collections-path-tooltip =
    .label = Beim Überfahren mit der Maus den vollständigen Pfad einer Sammlung anzeigen
weavero-pref-collections-indent-guides =
    .label = Einrückungslinien im Sammlungsbereich
weavero-pref-collections-indent-guides-desc = Eine schwache senkrechte Linie für jede Ebene, sodass Sammlungen derselben Ebene optisch untereinander stehen.
weavero-pref-plugins-title = Plugin-Verwaltung
weavero-pref-plugins-extras =
    .label = Extras für die Plugin-Verwaltung (Suchfeld, Kartendetails, normales Fenster)
weavero-pref-plugins-extras-desc = Werkzeuge → Plugins erhält ein Suchfeld (Strg+F fokussiert es, × leert es), Karten mit Autor [GitHub-Besitzer] · Version · zuletzt aktualisiert, ein normales Fenster mit Minimieren/Maximieren (mit aktiviertem <em>Titelleiste ausblenden → Plugin-Verwaltung</em> das Titelleisten-Layout des Hauptfensters; deaktiviert die eigene Titelleiste und Menüleiste des Systems) und „Neueste Updates“ immer sichtbar, mit einem Menü an der Überschrift für den Zeitraum (letzter Tag bis alle; Zoteros eigene Liste endet bei 2 Tagen), der gespeichert wird. Die Verwaltung öffnet sich wieder mit der Plugin-Liste. Unter Zotero 11, dessen Verwaltung ihre Seitenleiste ausblendet, kehrt die Seitenleiste mit „Plugins“ und „Neueste Updates“ zurück (und „Verfügbare Updates“, solange Updates anstehen).
weavero-pref-defatt-title = Standardanhang
weavero-pref-defatt-enable =
    .label = Einen gewählten Anhang oder eine Notiz statt Zoteros automatischer Wahl öffnen
weavero-pref-defatt-desc = Klicken Sie mit der rechten Maustaste auf ein beliebiges untergeordnetes Element eines Eintrags – Anhang (PDF oder nicht), verlinkte URL oder Notiz – und wählen Sie <b>▶️ Als Standardanhang festlegen</b>, um genau dieses statt Zoteros üblicher Wahl zu öffnen. Die Wahl wird als Tag <b>▶️ wv-defatt</b> an diesem Element gespeichert, sodass sie mit Ihren anderen Geräten synchronisiert wird und auch ohne Weavero erhalten bleibt. Suchen Sie nach <b>wv-defatt</b> (oder dem Zeichen ▶️), um alle markierten Einträge aufzulisten; das Tag enthält absichtlich keine gewöhnlichen Wörter, damit es nie in fremden Suchen auftaucht. Das Deaktivieren dieser Option beendet die Übersteuerung, behält aber Ihre Auswahl.
weavero-pref-defatt-sort-default =
    .label = Den Standardanhang in der Anhangsliste zuerst anzeigen
weavero-pref-defatt-sort-auto =
    .label = Zoteros automatische Wahl zuerst anzeigen, wenn kein Standard festgelegt ist
weavero-pref-defatt-mark-auto =
    .label = Die automatische Wahl in der Eintragsliste mit einem abgeblendeten ▷ kennzeichnen
weavero-pref-defatt-sort-desc = Mit den beiden obigen Optionen steht das, was sich per Doppelklick öffnet, in der ersten Zeile der Anhänge eines Eintrags. Das abgeblendete <b>▷</b> zeigt immer Zoteros eigene automatische Wahl – so sehen Sie, was sich öffnen würde, wenn der gewählte Standard entfernt würde –, während ein gewählter Standard sein volles Zeichen <b>▶️</b> behält.
weavero-pref-defatt-import = Kommen Sie von <b>Default Attachment</b> von <b>PikaPei</b>? Ihre Auswahl wird beim ersten Start von Weavero automatisch importiert, und die Daten dieses Plugins bleiben unverändert – in der README steht, wie Sie sie von Hand entfernen, wenn Sie sie nicht mehr brauchen.
weavero-pref-ext-viewer-title = Externer Betrachter
weavero-pref-ext-viewer-enable =
    .label = „In externem Betrachter öffnen“ in den Eintrags- / Tab-Menüs
weavero-pref-ext-viewer-desc = Öffnet den besten Anhang eines Eintrags mit der Standardanwendung des Systems (PDF, EPUB, Snapshot, Bild, …). Standardmäßig aktiviert.
weavero-pref-undo-title = Rückgängig
weavero-pref-undo-buttons =
    .label = Pfeile für Rückgängig / Wiederholen in der Reader-Symbolleiste
weavero-pref-undo-buttons-desc = Zwei Pfeile nach den Anmerkungswerkzeugen: Klicken Sie, um den letzten Schritt des Reader-Tabs (Gliederung, Lesezeichen, Anmerkungen) rückgängig zu machen oder zu wiederholen; ein Rechtsklick zeigt den Verlauf. Strg+Z, Strg+Y und Bearbeiten → Rückgängig funktionieren in jedem Fall. Standardmäßig aktiviert.
weavero-pref-link-preview-title = Link-Vorschauen
weavero-pref-link-preview-entry =
    .label = Die ganze Literaturangabe in Link-Vorschauen hervorheben
weavero-pref-link-preview-entry-desc = Wenn der Mauszeiger auf einer Zitation ruht, hebt die Vorschau des Literaturverzeichnisses jede Zeile der zitierten Literaturangabe mit einem hellroten Farbton hervor, anstelle von Zoteros dunklem Rahmen um die erste Zeile. Deaktiviert: Zoteros Vorschau unverändert. Standardmäßig aktiviert.
weavero-pref-outline-title = Reader-Gliederung
weavero-pref-outline-highlight =
    .label = Beim Klick auf einen Gliederungseintrag den Text der Überschrift hervorheben
weavero-pref-outline-highlight-desc = Lässt beim Klick den tatsächlichen Überschriftentext aufblinken, in PDFs, EPUBs und Snapshots sowie in einer Notiz über ihre Gliederung; bei eingebetteten PDF-Gliederungen findet Weavero die Überschrift auf der Seite. Bestmögliche Zuordnung – bei gescannten Seiten oder ungewöhnlichen Schriften wird eventuell nur ohne Hervorhebung gesprungen.
weavero-pref-outline-page-numbers =
    .label = Seitenzahlen neben Gliederungseinträgen anzeigen
weavero-pref-outline-page-numbers-desc = Die Angabe „S. N“ rechts neben jedem Eintrag. Mit einem Rechtsklick auf den Tab „Gliederung“ in einem Reader blenden Sie sie nur für dieses Dokument ein oder aus.
weavero-pref-outline-size-title = Textgröße der Gliederung
weavero-pref-outline-size-desc = <strong>Zotero-Gliederung</strong> und <strong>Zotero-Eintragsbereich</strong> folgen <em>Ansicht → Schriftgröße</em> (die angezeigten Größen sind die aktuellen); <strong>Fest</strong> bleibt unabhängig von der Schriftgröße bei der gewählten Größe. Mit einem Rechtsklick auf den Tab „Gliederung“ in einem Reader wählen Sie eine Größe nur für dieses Dokument.
weavero-pref-outline-size-zotero =
    .label = Zotero-Gliederung (Standard)
weavero-pref-outline-size-item-pane =
    .label = Zotero-Eintragsbereich
weavero-pref-outline-size-zotero-px =
    .label = Zotero-Gliederung, { $px } px (Standard)
weavero-pref-outline-size-item-pane-px =
    .label = Zotero-Eintragsbereich, { $px } px
weavero-pref-outline-size-fixed =
    .label = Fest:
weavero-pref-outline-size-px =
    .label = { $px } px
weavero-pref-outline-keys-title = Tastenkombinationen zum Hinzufügen von Einträgen
weavero-pref-outline-keys-desc = Ab Werk ist keine festgelegt. Klicken Sie in ein Feld und drücken Sie die gewünschten Tasten – auch ein einzelner Buchstabe funktioniert; Kombinationen, die Zotero oder der Reader bereits verwenden, werden abgelehnt. Sie funktionieren in Reader-Tabs, nie während Sie in einem Textfeld tippen, und werden neben den entsprechenden Menüeinträgen angezeigt.
weavero-pref-outline-key-selection = Ausgewählten Text hinzufügen
weavero-pref-outline-key-remove = Entfernen
weavero-pref-outline-key-pin = Stelle anheften
weavero-pref-outline-key-page-top = Seitenanfang (PDF)
weavero-pref-outline-key-page-bottom = Seitenende (PDF)
weavero-pref-notes-title = Notizen
weavero-pref-notes-outline =
    .label = Gliederung neben Notizen
weavero-pref-notes-outline-desc = Ein Bereich links neben der Notiz, der ihre Überschriften auflistet und den Abschnitt markiert, den Sie gerade lesen. Klicken Sie auf eine Überschrift, um dorthin zu gehen; mit einem Rechtsklick kopieren Sie einen Link darauf. In Notiz-Tabs und -Fenstern standardmäßig geöffnet, im Eintragsbereich und neben einem Reader eingeklappt – die Seitenleisten-Schaltfläche am linken Ende der Notiz-Symbolleiste blendet sie ein oder aus. Ist Better Notes installiert, ersetzt diese Gliederung dessen linken Bereich in Notiz-Tabs; deaktivieren Sie diese Option, um diesen Bereich mit seinen Mind- und Bubble-Maps zurückzubekommen.
weavero-pref-notes-folding =
    .label = Einklapp-Pfeile an Überschriften und Listen in Notizen
weavero-pref-notes-folding-desc = Ein Pfeil am Rand vor jeder Überschrift blendet alles darunter aus, bis zur nächsten Überschrift derselben oder einer höheren Ebene. Ein Pfeil vor einem Listenpunkt, mit Aufzählungszeichen oder nummeriert, blendet alles unter seiner ersten Zeile aus: seine Unterpunkte und weitere Absätze. <em>Alle einklappen</em> und <em>Alle ausklappen</em> am Ende des Rechtsklickmenüs der Notiz wirken auf die ganze Notiz auf einmal. Nur die Ansicht ändert sich – die Notiz selbst bleibt unberührt, und wer Weavero nicht hat, sieht die ganze Notiz. Eingeklappte Stellen werden pro Notiz auf diesem Computer gespeichert. Beide Optionen benötigen <em>Links &amp; Beziehungen → Notizen: Editor</em>.
weavero-pref-annpane-title = Anmerkungsbereich des Readers
weavero-pref-annpane-reader-funnel =
    .label = Trichter über dem Reader
weavero-pref-annpane-reader-funnel-desc = Filtert die Anmerkungen des Dokuments auf der Seite und im Anmerkungsbereich zugleich – nach Farbe, Art, Tag, Kommentar, Person oder Datum. Ist er deaktiviert, verschwindet die Schaltfläche und ihr Filter ruht: Alle Anmerkungen werden wieder angezeigt, außer denen, die Zoteros eigene Farb- und Tag-Auswahl filtert. Wieder aktiviert, erhält ein geöffnetes Dokument seinen Filter zurück.
weavero-pref-annpane-funnel =
    .label = Trichter neben dem Suchfeld des Bereichs
weavero-pref-annpane-funnel-desc = Anders als der Trichter über dem Reader, der Anmerkungen auch auf der Seite ausblendet, grenzt dieser nur den Anmerkungsbereich ein – nach Farbe, Art, Tag, Kommentar, Person oder Datum –, und die Seite behält alle Anmerkungen. Gleiche Chips und Gesten. Jedes Dokument behält seinen eigenen Filter; die Arten unten sind der Ausgangspunkt für alle. Ist der Trichter deaktiviert, folgt der Bereich einfach den Arten unten.
weavero-pref-annpane-selector-handle =
    .label = Griff an Zoteros Farb- und Tag-Auswahl am Fuß des Bereichs
weavero-pref-annpane-selector-handle-desc = Ein kleiner Griff am oberen Rand der Auswahl: Ein Klick klappt die Auswahl an diesen Rand, der nächste holt sie zurück – ein Zustand für alle Dokumente, über Neustarts hinweg gespeichert (anfangs angezeigt). <em>Ansicht → Layout → Farb- und Tag-Auswahl</em> blendet die Auswahl samt Griff ganz aus, wie es der Menüeintrag „Tag-Auswahl“ der Bibliothek tut. Geöffnet filtert die Auswahl den Bereich und das Dokument gemeinsam, und eine auf eine Farbe oder ein Tag gezogene Anmerkung übernimmt diese (Umschalt zum Entfernen). Eine Auswahl bleibt wirksam, solange die Auswahl eingeklappt ist; der Griff wird blau, um das anzuzeigen. Ist die Option deaktiviert, wird die Auswahl wie in Zotero immer angezeigt.
weavero-pref-annpane-types-title = Im Bereich angezeigte Anmerkungsarten
weavero-pref-annpane-types-desc = Deaktivieren Sie eine Art, um sie in jedem Dokument aus dem Bereich herauszulassen; auf der Seite bleibt sie sichtbar. Der Trichter kann dies für ein Dokument übersteuern, und sein „Als Standard verwenden“ schreibt hierher zurück.
weavero-pref-annpane-type-highlight =
    .label = Markierungen
weavero-pref-annpane-type-underline =
    .label = Unterstreichungen
weavero-pref-annpane-type-note =
    .label = Notizen
weavero-pref-annpane-type-image =
    .label = Bilder
weavero-pref-annpane-type-ink =
    .label = Freihand
weavero-pref-annpane-type-text =
    .label = Text
weavero-pref-debug-title = Fehlersuche
weavero-pref-debug-enable =
    .label = Debug-Protokollierung aktivieren
weavero-pref-debug-desc = Gibt detaillierte Aktivitäten über Zotero.debug aus (Hilfe → Logging des Debug-Outputs → Ausgabe anzeigen). Für die normale Nutzung deaktiviert lassen.
weavero-pref-about-title = Über
weavero-pref-about-homepage = Website – GitHub
weavero-pref-about-bug-report = Fehlerbericht / Funktionswunsch

# ---- Menus (localisation slice 2, 2026-11-11) ---------------------------
weavero-menu-copy-as =
    .label = Kopieren als
weavero-menu-copy-as-citation =
    .label = Zitation
weavero-menu-copy-as-bibliography =
    .label = Literaturverzeichnis
weavero-menu-copy-as-citation-key =
    .label = Zitierschlüssel
weavero-menu-copy-as-select-link =
    .label = { $collection ->
        [yes] Auswahl-Link (mit Sammlung)
       *[no] Auswahl-Link
    }
weavero-menu-copy-as-select-links-separate =
    .label = { $collection ->
        [yes] Auswahl-Links (ein Link pro Eintrag) (mit Sammlung)
       *[no] Auswahl-Links (ein Link pro Eintrag)
    }
weavero-menu-copy-as-open-links-separate =
    .label = Öffnen-Links (ein Link pro Eintrag)
weavero-menu-copy-as-open-link =
    .label = { $external ->
        [yes] Öffnen-Link (externe App)
       *[no] Öffnen-Link
    }
weavero-menu-copy-as-online-link =
    .label = Link zur Online-Bibliothek
weavero-menu-copy-as-bbt-bibtex =
    .label = [BBT] BibTeX
weavero-menu-copy-as-bbt-biblatex =
    .label = [BBT] BibLaTeX
weavero-menu-items-add-related =
    .label = { $count ->
        [one] Verwandte hinzufügen…
       *[other] Verwandte hinzufügen…  ({ $count } Einträge)
    }
weavero-menu-open-external-viewer =
    .label = In externem Betrachter öffnen
weavero-menu-items-open-in =
    .label = { $type ->
        [pdf] { $count ->
            [one] PDF öffnen in
           *[other] PDFs öffnen in
        }
        [epub] { $count ->
            [one] EPUB öffnen in
           *[other] EPUBs öffnen in
        }
        [snapshot] { $count ->
            [one] Snapshot öffnen in
           *[other] Snapshots öffnen in
        }
        [image] { $count ->
            [one] Bild öffnen in
           *[other] Bilder öffnen in
        }
        [video] { $count ->
            [one] Video öffnen in
           *[other] Videos öffnen in
        }
        [audio] Audio öffnen in
        [text] Text öffnen in
        [file] { $count ->
            [one] Datei öffnen in
           *[other] Dateien öffnen in
        }
        [note] { $count ->
            [one] Notiz öffnen in
           *[other] Notizen öffnen in
        }
       *[mixed] Öffnen in
    }
weavero-menu-items-open-several =
    .label = { $count } { $kind ->
        [pdf] { $count ->
            [one] PDF
           *[other] PDFs
        }
        [epub] { $count ->
            [one] EPUB
           *[other] EPUBs
        }
        [snapshot] { $count ->
            [one] Snapshot
           *[other] Snapshots
        }
        [note] { $count ->
            [one] Notiz
           *[other] Notizen
        }
        [attachment] { $count ->
            [one] Anhang
           *[other] Anhänge
        }
       *[item] { $count ->
            [one] Eintrag
           *[other] Einträge
        }
    } { $where ->
        [tabs] { $count ->
            [one] in neuem Tab
           *[other] in neuen Tabs
        }
        [window] { $count ->
            [one] in neuem Fenster
           *[other] in einem neuen Fenster
        }
       *[windows] { $count ->
            [one] in neuem Fenster
           *[other] in separaten Fenstern
        }
    } öffnen
weavero-menu-group-unnamed =
    .label = Gruppe
weavero-menu-new-group =
    .label = Neue Gruppe
weavero-menu-collection-open-new-window =
    .label = In neuem Fenster öffnen
    .acceltext = Mittelklick
weavero-menu-collection-copy-link =
    .label = Sammlungslink kopieren
weavero-menu-collection-copy-search-link =
    .label = Link zur gespeicherten Suche kopieren
weavero-menu-colpick-show-column =
    .label = Spalte anzeigen
weavero-menu-colpick-auto-tag-count =
    .label = Anzahl automatischer Tags
weavero-menu-file-new-tab =
    .label = Neuer Tab…
weavero-menu-file-new-reader-window =
    .label = Neues Reader-Fenster…
weavero-menu-file-new-main-window =
    .label = Neues Hauptfenster
weavero-menu-file-people =
    .label = Forschende
weavero-menu-edit-advanced-search-new-window =
    .label = Erweiterte Suche in neuem Fenster
    .acceltext = Umschalt+Klick
weavero-menu-advsearch-open =
    .label = Erweiterte Suche öffnen
weavero-menu-advsearch-open-new-window =
    .label = In neuem Fenster öffnen
    .acceltext = Umschalt+Klick / Mittelklick
weavero-menu-advsearch-open-new-tab =
    .label = In neuem Tab öffnen
    .acceltext = { $platform ->
        [mac] ⌘-Klick
       *[other] Strg+Klick
    }
weavero-menu-hid-hide-several =
    .label = { $what ->
        [collections] { $count } Sammlungen ausblenden
        [searches] { $count } gespeicherte Suchen ausblenden
        [collections-searches] { $count } Sammlungen und gespeicherte Suchen ausblenden
        [feeds] { $count } Feeds ausblenden
        [groups] { $count } Gruppen-Bibliotheken ausblenden
       *[libraries] { $count } Bibliotheken ausblenden
    }
weavero-menu-hid-manage =
    .label = Ausgeblendete verwalten…
weavero-menu-hid-show =
    .label = { $what ->
        [collections-libraries] Ausgeblendete Sammlungen und Bibliotheken anzeigen
        [libraries] Ausgeblendete Bibliotheken anzeigen
        [groups] Ausgeblendete Gruppen-Bibliotheken anzeigen
        [feeds] Ausgeblendete Feeds anzeigen
       *[collections] Ausgeblendete Sammlungen anzeigen
    }
weavero-menu-hid-show-all =
    .label = Alle anzeigen ({ $count })
weavero-menu-hid-saved-search =
    .label = { $name } (gespeicherte Suche)
weavero-menu-hid-all-windows =
    .label = { $name } (alle Fenster)
weavero-menu-hidmgr-new-subcollection =
    .label = Neue Untersammlung…
weavero-menu-hidmgr-rename =
    .label = Umbenennen
weavero-menu-hidmgr-hide =
    .label = { $count ->
        [0] Ausblenden →
        [one] Ausblenden →
       *[other] { $count } ausblenden →
    }
weavero-menu-hidmgr-show =
    .label = { $count ->
        [0] ← Anzeigen
        [one] ← Anzeigen
       *[other] ← { $count } anzeigen
    }
weavero-menu-hidmgr-delete-collections =
    .label = { $count ->
        [one] Sammlung löschen…
       *[other] Sammlungen löschen…
    }
weavero-menu-hidmgr-delete-searches =
    .label = { $count ->
        [one] Suche löschen…
       *[other] Suchen löschen…
    }
weavero-menu-hidmgr-delete-collections-items =
    .label = { $count ->
        [one] Sammlung und Einträge löschen…
       *[other] Sammlungen und Einträge löschen…
    }
weavero-menu-hidmgr-export =
    .label = Exportieren…
weavero-menu-reader-ann-add-to-bookmarks =
    .label = { $count ->
        [one] Zu Lesezeichen hinzufügen
       *[other] Zu Lesezeichen hinzufügen  ({ $count } Anmerkungen)
    }
weavero-menu-reader-ann-copy-text =
    .label = { $type ->
        [highlight] { $count ->
            [one] Markierten Text kopieren
           *[other] Markierten Text kopieren  ({ $count } Anmerkungen)
        }
        [underline] { $count ->
            [one] Unterstrichenen Text kopieren
           *[other] Unterstrichenen Text kopieren  ({ $count } Anmerkungen)
        }
       *[mixed] { $count ->
            [one] Anmerkungstext kopieren
           *[other] Anmerkungstext kopieren  ({ $count } Anmerkungen)
        }
    }
weavero-menu-reader-ann-copy-select-link =
    .label = { $count ->
        [one] Auswahl-Link kopieren
       *[other] Auswahl-Links kopieren  ({ $count } Anmerkungen)
    }
weavero-menu-reader-ann-copy-open-link =
    .label = { $count ->
        [one] Öffnen-Link kopieren
       *[other] Öffnen-Links kopieren  ({ $count } Anmerkungen)
    }
weavero-menu-reader-ann-add-related =
    .label = { $count ->
        [one] Verwandte hinzufügen…
       *[other] Verwandte hinzufügen…  ({ $count } Anmerkungen)
    }
weavero-menu-reader-copy-link-selection =
    .label = Link zum ausgewählten Text kopieren
weavero-menu-reader-copy-link-page =
    .label = Link zu dieser Seite kopieren
weavero-menu-reader-copy-link-position =
    .label = Link zu dieser Position kopieren
weavero-menu-reader-copy-link-location =
    .label = Link zu dieser Stelle kopieren
weavero-menu-tab-view-online =
    .label = Online anzeigen
weavero-menu-tab-show-file =
    .label = { $platform ->
        [mac] In Finder anzeigen
       *[other] Datei anzeigen
    }
weavero-menu-tab-pin =
    .label = { $action ->
        [unpin] { $count ->
            [one] Tab ablösen
           *[other] { $count } Tabs ablösen
        }
       *[pin] { $count ->
            [one] Tab anheften
           *[other] { $count } Tabs anheften
        }
    }
weavero-menu-tab-pin-name =
    .label = Tab-Namen anzeigen
weavero-menu-tab-move-tabs =
    .label = Tabs verschieben
weavero-menu-tab-close =
    .label = { $count ->
        [one] Tab schließen
       *[other] { $count } Tabs schließen
    }
weavero-menu-tab-duplicate =
    .label = { $count ->
        [one] Tab duplizieren
       *[other] { $count } Tabs duplizieren
    }
weavero-menu-tab-group-tabs =
    .label = { $count ->
        [one] Tab gruppieren
       *[other] Tabs gruppieren
    }
weavero-menu-tab-reopen-closed-group =
    .label = Geschlossene Gruppe wieder öffnen
weavero-menu-tab-reopen-closed-window =
    .label = { $count ->
        [0] Geschlossenes Fenster wieder öffnen
        [one] Geschlossenes Fenster wieder öffnen
       *[other] Geschlossenes Fenster wieder öffnen ({ $count } Tabs)
    }
weavero-menu-window-rename =
    .label = Fenster umbenennen…
weavero-menu-window-convert =
    .label = { $to ->
        [main] In Hauptfenster umwandeln
       *[reader] In Reader-Fenster umwandeln
    }
weavero-menu-window-save-close =
    .label = Fenster speichern und schließen
weavero-menu-window-move-to =
    .label = Fenster verschieben nach
weavero-menu-window-reopen =
    .label = Fenster wieder öffnen
weavero-menu-window-delete-saved =
    .label = Gespeichertes Fenster löschen
weavero-menu-session-unnamed =
    .label = Sitzung
weavero-menu-window-delete-from-session =
    .label = Fenster aus Sitzung löschen
weavero-menu-session-switch =
    .label = Zu dieser Sitzung wechseln
weavero-menu-session-rename =
    .label = Umbenennen…
weavero-menu-session-delete =
    .label = Löschen
weavero-menu-session-rename-current =
    .label = Sitzung umbenennen…
weavero-menu-session-sort =
    .label = { $sort ->
        [name] Name
        [lastUsed] Zuletzt verwendet
       *[created] Erstellt
    }
weavero-menu-default-hint = (Standard)
weavero-menu-move-target-here =
    .label = { $name }  (hier)
weavero-menu-group-target-window =
    .label = { $where ->
        [group-home] { $name }  (Gruppe ist hier)
       *[this-window] { $name }  (dieses Fenster)
    }
weavero-menu-move-new-window =
    .label = Neues Fenster
weavero-menu-group-rename =
    .label = Gruppe umbenennen…
weavero-menu-group-move-to =
    .label = { $saved ->
        [yes] Gruppe öffnen in
       *[no] Gruppe verschieben nach
    }
weavero-menu-group-save-close =
    .label = Gruppe speichern und schließen
weavero-menu-group-delete =
    .label = Gruppe löschen
weavero-menu-tab-remove-from-group =
    .label = { $count ->
        [0] Aus Tab-Gruppe entfernen
        [one] Aus Tab-Gruppe entfernen
       *[other] { $count } Tabs aus Gruppe entfernen
    }
weavero-menu-groupeditor-move-to =
    .label = Gruppe verschieben nach
weavero-menu-groupeditor-copy-links =
    .label = { $count ->
        [one] { $count } Link in Gruppe kopieren
       *[other] { $count } Links in Gruppe kopieren
    }
weavero-menu-groupeditor-save-close =
    .label = Gruppe speichern und schließen
weavero-menu-groupeditor-ungroup =
    .label = Gruppierung aufheben
weavero-menu-groupeditor-delete =
    .label = Gruppe löschen
weavero-reader-toolbar-more =
    .label = Weitere Werkzeuge
weavero-menu-split-add =
    .label = Geteilte Ansicht hinzufügen
weavero-menu-split-open =
    .label = In geteilter Ansicht öffnen
weavero-menu-split-separate =
    .label = Geteilte Ansicht aufheben
weavero-menu-split-reverse =
    .label = Tabs vertauschen
weavero-menu-split-separate-tabs =
    .label = Tabs trennen
weavero-menu-split-close-both =
    .label = Beide Tabs schließen
weavero-menu-items-open-split =
    .label = { $type ->
        [pdf] PDF in geteilter Ansicht öffnen
        [epub] EPUB in geteilter Ansicht öffnen
        [snapshot] Snapshot in geteilter Ansicht öffnen
       *[note] Notiz in geteilter Ansicht öffnen
    }
weavero-menu-split-follow =
    .label = Ausgewähltem Eintrag folgen
weavero-menu-split-keep =
    .label = Dokument in neuem Tab behalten
weavero-split-follow-open = Öffnen
    .title = Hier im Zotero-Reader öffnen, um zu lesen und Anmerkungen zu erstellen (oder auf die Vorschau doppelklicken)
weavero-split-follow-failed = Keine Vorschau für dieses Dokument. Klicken Sie auf seinen Tab, um es zu öffnen.
weavero-menu-lock-tab =
    .label = { $action ->
        [unlock] Tab entsperren
       *[lock] Tab sperren
    }
weavero-menu-lock-collapse =
    .label = { $collapsed ->
        [yes] Gesperrten Tab ausklappen
       *[no] Gesperrten Tab einklappen
    }
weavero-dock-tab-tip = { $collapsed ->
        [yes] Gesperrter Tab, eingeklappt. Klicken, um ihn auszuklappen.
       *[no] Gesperrter Tab. Klicken, um ihn einzuklappen.
    }
weavero-menu-note-fold-section =
    .label = { $folded ->
        [yes] Abschnitt ausklappen
       *[no] Abschnitt einklappen
    }
weavero-menu-note-fold-all =
    .label = Alle einklappen
weavero-menu-note-unfold-all =
    .label = Alle ausklappen
weavero-menu-note-heading-link =
    .label = { $kind ->
        [open] Öffnen-Link zur Überschrift kopieren
       *[select] Auswahl-Link zur Überschrift kopieren
    }
weavero-menu-note-heading-link-readonly =
    .label = { $kind ->
        [open] Öffnen-Link zur Überschrift kopieren
       *[select] Auswahl-Link zur Überschrift kopieren
    }
    .tooltiptext = Diese Notiz ist schreibgeschützt, und die Überschrift hat noch keinen Linkanker.
weavero-menu-outline-toggle =
    .label = { $shut ->
        [yes] Ausklappen
       *[no] Einklappen
    }
weavero-menu-outline-expand-all =
    .label = Alle ausklappen
weavero-menu-outline-collapse-all =
    .label = Alle einklappen
weavero-open-card-foot = Klicken zum Öffnen · { $platform ->
        [mac] ⌘-Klick
       *[other] Strg+Klick
    }: daneben · Umschalt+Klick: neues Fenster · Mittelklick: Hintergrund-Tab (Notiz: im Vordergrund) · Rechtsklick für mehr
weavero-open-card-foot-library = Klick: in Bibliothek öffnen · { $platform ->
        [mac] ⌘-Klick
       *[other] Strg+Klick
    }: daneben · Umschalt+Klick: neues Fenster · Mittelklick: Hintergrund-Tab (Notiz: im Vordergrund)
weavero-menu-notelink-open-split =
    .label = Link in geteilter Ansicht öffnen
weavero-menu-notelink-copy =
    .label = Link kopieren
weavero-menu-notelink-edit =
    .label = Link bearbeiten…
weavero-menu-notelink-unlink =
    .label = Trennen
weavero-menu-ref-copy-link =
    .label = Link kopieren
weavero-menu-ref-show-in-source =
    .label = In Quelle anzeigen
weavero-menu-ref-add-related =
    .label = Als verwandt hinzufügen
weavero-menu-open-type-in =
    .label = { $type ->
        [pdf] { $where ->
            [window] PDF in neuem Fenster öffnen
           *[tab] PDF in neuem Tab öffnen
        }
        [epub] { $where ->
            [window] EPUB in neuem Fenster öffnen
           *[tab] EPUB in neuem Tab öffnen
        }
        [snapshot] { $where ->
            [window] Snapshot in neuem Fenster öffnen
           *[tab] Snapshot in neuem Tab öffnen
        }
        [note] { $where ->
            [window] Notiz in neuem Fenster öffnen
           *[tab] Notiz in neuem Tab öffnen
        }
       *[attachment] { $where ->
            [window] Anhang in neuem Fenster öffnen
           *[tab] Anhang in neuem Tab öffnen
        }
    }
weavero-menu-open-annotation-in =
    .label = { $type ->
        [pdf] { $where ->
            [window] Im PDF in neuem Fenster öffnen
           *[tab] Im PDF in neuem Tab öffnen
        }
        [epub] { $where ->
            [window] Im EPUB in neuem Fenster öffnen
           *[tab] Im EPUB in neuem Tab öffnen
        }
        [snapshot] { $where ->
            [window] Im Snapshot in neuem Fenster öffnen
           *[tab] Im Snapshot in neuem Tab öffnen
        }
        [note] { $where ->
            [window] In der Notiz in neuem Fenster öffnen
           *[tab] In der Notiz in neuem Tab öffnen
        }
       *[other] { $where ->
            [window] Im Reader in neuem Fenster öffnen
           *[tab] Im Reader in neuem Tab öffnen
        }
    }
weavero-menu-related-show-file =
    .label = Datei anzeigen
weavero-menu-related-copy-select-link =
    .label = Auswahl-Link kopieren
weavero-menu-related-copy-open-link =
    .label = { $external ->
        [yes] Öffnen-Link kopieren (externe App)
       *[no] Öffnen-Link kopieren
    }
weavero-menu-related-add-related =
    .label = Verwandte hinzufügen…
weavero-menu-related-remove-relation =
    .label = Beziehung entfernen
weavero-menu-bm-pick-item =
    .label = Eintrag aus der Bibliothek auswählen…
weavero-menu-bm-add-link =
    .label = Link hinzufügen…
weavero-menu-bm-add-bookmark =
    .label = Lesezeichen hinzufügen
weavero-menu-bm-sort-manual =
    .label = Manuelle Reihenfolge
weavero-menu-bm-sort-name =
    .label = Name
weavero-menu-bm-sort-date =
    .label = Hinzugefügt am
weavero-menu-bm-sort-ascending =
    .label = Aufsteigend
weavero-menu-bm-sort-descending =
    .label = Absteigend
weavero-menu-bm-edit =
    .label = Lesezeichen bearbeiten…
weavero-menu-bm-reset-name =
    .label = Auf Standardnamen zurücksetzen
weavero-menu-bm-delete =
    .label = Lesezeichen löschen
weavero-menu-bm-new-folder =
    .label = Neuer Ordner…
weavero-menu-bm-rename-folder =
    .label = Ordner umbenennen…
weavero-menu-bm-new-subfolder =
    .label = Neuer Unterordner…
weavero-menu-bm-delete-folder =
    .label = Ordner löschen
weavero-menu-bm-collection =
    .label = { $what ->
        [library] { $bookmarked ->
            [yes] Bibliothekslesezeichen entfernen
           *[no] Lesezeichen für Bibliothek setzen
        }
       *[collection] { $bookmarked ->
            [yes] Sammlungslesezeichen entfernen
           *[no] Lesezeichen für Sammlung setzen
        }
    }
weavero-menu-items-default-attachment =
    .label = { $marked ->
        [yes] { $glyph }Standardanhang aufheben
       *[no] { $glyph }Als Standardanhang festlegen
    }
weavero-menu-section-reset-filters =
    .label = Filter auf Standard zurücksetzen
weavero-menu-tab-add-to-group =
    .label = { $count ->
        [0] Tab zu Gruppe hinzufügen
        [one] Tab zu Gruppe hinzufügen
       *[other] { $count } Tabs zu Gruppe hinzufügen
    }
weavero-menu-tab-open-notes =
    .label = Notizen öffnen
weavero-menu-tab-move-to-main-window =
    .label = In Hauptfenster verschieben
weavero-menu-group-unnamed-add =
    .label = Unbenannte Gruppe
weavero-menu-group-saved-hint = gespeichert
weavero-menu-reader-copy-citation =
    .label = Zitation kopieren
weavero-menu-reader-copy-bibliography =
    .label = Literaturverzeichnis kopieren
weavero-menu-hamburger-new-tab =
    .label = Neuer Tab
weavero-menu-hamburger-new-reader-window =
    .label = Neues Reader-Fenster
weavero-menu-reader-add-selection-outline =
    .label = Ausgewählten Text zur Gliederung hinzufügen
weavero-menu-reader-add-selection-bookmarks =
    .label = Ausgewählten Text zu Lesezeichen hinzufügen
weavero-menu-reader-add-position-bookmarks =
    .label = { $scope ->
        [library] Diese Position zu Bibliothekslesezeichen hinzufügen
       *[document] Diese Position zu Lesezeichen hinzufügen
    }
weavero-menu-reader-add-page-bookmarks =
    .label = { $scope ->
        [library] Diese Seite zu Bibliothekslesezeichen hinzufügen
       *[document] Diese Seite zu Lesezeichen hinzufügen
    }
weavero-menu-reader-add-position-outline =
    .label = Diese Position zur Gliederung hinzufügen…
weavero-menu-reader-page-anchor =
    .label = { $anchor ->
        [bottom] Ende von Seite { $page }
       *[top] Anfang von Seite { $page }
    }
weavero-menu-ctx-open =
    .label = Öffnen
weavero-menu-ctx-open-new-window =
    .label = In neuem Fenster öffnen
weavero-menu-ctx-rename =
    .label = Umbenennen…
weavero-menu-ctx-delete =
    .label = Löschen
weavero-menu-ctx-edit-region =
    .label = Bereich bearbeiten…
weavero-menu-ctx-select-text =
    .label = Text auswählen…
weavero-menu-ctx-pin-spot =
    .label = Stelle anheften…
weavero-menu-bm-sort-location =
    .label = Position
weavero-menu-outline-redetect-region =
    .label = Bereich anhand des Titels neu erkennen
weavero-menu-outline-fix-spacing =
    .label = Abstände korrigieren
weavero-menu-outline-spacing-correct =
    .label = Abstände sind korrekt
weavero-menu-outline-edit-position-pages =
    .label = Position bearbeiten…
weavero-menu-outline-edit-position =
    .label = Position bearbeiten
weavero-menu-outline-reset-original =
    .label = Auf ursprünglichen Namen und Bereich zurücksetzen
weavero-menu-outline-not-box =
    .label = Kein Kasten (Abschnitt)
weavero-menu-outline-mark-box =
    .label = Als Kasten / Infokasten markieren
weavero-menu-outline-delete-entries =
    .label = { $count } Einträge löschen
weavero-menu-outline-delete-weavero =
    .label = Bearbeitete Gliederung löschen…
weavero-menu-oe-verdict =
    .label = { $verdict ->
        [good] Extraktion gut
        [bad] Extraktion schlecht
        [scan] Scan (keine Textebene)
       *[none] Nicht bewertet
    }
weavero-menu-bm-copy-to-outline =
    .label = { $count ->
        [0] In Gliederung kopieren
        [one] In Gliederung kopieren
       *[other] { $count } in Gliederung kopieren
    }
weavero-menu-bm-show-parent =
    .label = Übergeordneten Eintrag in Bibliothek anzeigen
weavero-menu-maxspan-pair =
    .label = Auf { $first } + { $second } maximieren
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
weavero-menu-maxspan-all =
    .label = { $count ->
        [3] Auf alle drei maximieren
       *[other] Auf alle { $count } Monitore maximieren
    }
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
weavero-menu-maxspan-range =
    .label = Auf { $first } bis { $last } maximieren
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
weavero-maxspan-monitor = { $position ->
        [left] Links
        [middle] Mitte
        [right] Rechts
        [top] Oben
        [bottom] Unten
       *[number] Monitor { $number }
    }
weavero-maxspan-tip = Das Fenster füllt diese Monitore und lässt die Taskleiste frei. „Wiederherstellen“ oder ein Doppelklick auf die Titelleiste stellt den vorherigen Zustand wieder her.
weavero-maxspan-tip-mixed = Das Fenster füllt diese Monitore und lässt die Taskleiste frei. „Wiederherstellen“ oder ein Doppelklick auf die Titelleiste stellt den vorherigen Zustand wieder her. Diese Monitore verwenden unterschiedliche Anzeigeskalierungen: Das Fenster wird in der Skalierung eines von ihnen dargestellt.

# ---- Shared words (all interface text into Fluent, 2026-11-19) -----------
weavero-common-cancel = Abbrechen
weavero-common-save = Speichern
weavero-common-close = Schließen
weavero-common-done = Erledigt
weavero-common-loading = Lädt…
weavero-common-untitled = (ohne Titel)
weavero-common-clear-search = Suche leeren
weavero-common-alt-click-exclude = Alt+Klick zum Ausschließen
weavero-key-ctrl = Strg
weavero-key-shift = Umschalt
weavero-key-alt = Alt
weavero-key-win = Win

# ---- Backlinks and Item Links (backlinks.ts, links.ts) ----
weavero-bl-ref-title = { $kind ->
        [links] { $count ->
            [one] { $count } Eintragslink
           *[other] { $count } Eintragslinks
        }
       *[backlinks] { $count ->
            [one] { $count } Rückverweis
           *[other] { $count } Rückverweise
        }
    }
weavero-bl-internal-tip = Interner Link: Beide Enden liegen in „{ $title }“
weavero-bl-page = S. { $page }
weavero-bl-note-pos = { $at ->
        [line] Zeile { $value }
        [section] #{ $value }
       *[heading] Überschrift
    }
weavero-bl-att-kind = { $kind ->
        [pdf] PDF
        [epub] EPUB
        [snapshot] Snapshot
        [file] Datei
       *[attachment] Anhang
    }
weavero-bl-row-label = { $ref ->
        [citation] { $paged ->
            [yes] Notiz-Zitation S. { $page }
           *[no] Notiz-Zitation
        }
        [quote] { $paged ->
            [yes] Notiz-Zitation, Anmerkung S. { $page }{ $file }
           *[no] Notiz-Zitation, Anmerkung{ $file }
        }
       *[link] Zotero-Link
    }
weavero-bl-kind = { $kind ->
        [cite] Notiz-Zitation
       *[zotero] Zotero-Link
    }
weavero-bl-action = { $action ->
        [select] In Bibliothek anzeigen
        [annotation] Bei der Anmerkung öffnen
        [page] Auf Seite { $page } öffnen
       *[open] Öffnen
    }
weavero-bl-action-open-note = { $at ->
        [line] Notiz bei Zeile { $value } öffnen (Better Notes)
        [section] Notiz bei Abschnitt { $value } öffnen (Better Notes)
        [heading] Notiz bei der Überschrift öffnen
       *[none] Notiz öffnen (Better Notes)
    }
weavero-bl-action-quote = { $form ->
        [page-cited] Anmerkung S. { $page }, zitiert S. { $cited }
        [page] Anmerkung S. { $page }
        [cited] Anmerkung, zitiert S. { $cited }
        [gone] Anmerkung, S. { $page }
       *[plain] Anmerkung
    }
weavero-bl-chip = { $to ->
        [here] → { weavero-bl-note-pos }
        [annotation] → Anmerkung{ $file }
        [annotation-page] → Anmerkung S. { $page }{ $file }
        [note] → Notiz
        [note-pos] → Notiz { weavero-bl-note-pos }
        [attachment-page] → { weavero-bl-att-kind } S. { $page }
       *[attachment] → { weavero-bl-att-kind }
    }
weavero-bl-broken = { $why ->
        [library] Bibliothek nicht in diesem Profil
       *[item] Eintrag nicht gefunden
    }
weavero-bl-broken-why = { $why ->
        [library] Der Link nennt eine Gruppen-Bibliothek, die in diesem Profil nicht vorhanden ist.
       *[item] Kein Eintrag in der Bibliothek hat diesen Schlüssel: Er wurde gelöscht, oder der Link ist fehlerhaft.
    }
weavero-bl-card-page = Seite
weavero-bl-card-comment = Kommentar: { $text }
weavero-bl-card-note = Notiz

# ---- Hover cards (backlinks.ts) ----
weavero-card-side-source = Quelle
weavero-card-side-target = Ziel
weavero-card-side-item = Eintrag
weavero-card-side-related = Zugehörig

# ---- Annotation comments (annotation.ts) ----
weavero-ann-comment-popup = Kommentar-Popup

# ---- Default attachment (attachments.ts) ----
weavero-defatt-legacy-title = Weavero – Standardanhänge gefunden
weavero-defatt-legacy-running = { $count ->
        [one] Default Attachment (PikaPei) läuft und hat { $count } Standardanhang gespeichert.
       *[other] Default Attachment (PikaPei) läuft und hat { $count } Standardanhänge gespeichert.
    }
weavero-defatt-legacy-running-offer = Weavero kann dieselbe Aufgabe übernehmen – für jeden Anhang, jede verlinkte URL und jede Notiz, nicht nur für PDFs – und speichert jede Wahl als Tag, sodass sie synchronisiert wird.
weavero-defatt-legacy-leftover = { $count ->
        [one] { $count } übrig gebliebener Standardanhang von Default Attachment (PikaPei) gefunden; das Plugin läuft nicht.
       *[other] { $count } übrig gebliebene Standardanhänge von Default Attachment (PikaPei) gefunden; das Plugin läuft nicht.
    }
weavero-defatt-legacy-leftover-offer = Weavero kann sie übernehmen und jeden als Tag speichern, sodass er synchronisiert wird, oder sie unverändert lassen.
weavero-defatt-legacy-question = Was möchten Sie tun?
weavero-defatt-legacy-import = In Weavero importieren
weavero-defatt-legacy-skip = Nicht importieren
weavero-defatt-legacy-keep = Default Attachment weiter verwenden
weavero-defatt-result-title = Weavero – Standardanhänge
weavero-defatt-imported = { $count ->
        [one] { $count } Festlegung als Tag { $tag } importiert.
       *[other] { $count } Festlegungen als Tag { $tag } importiert.
    }
weavero-defatt-imported-note = Die eigenen Daten von Default Attachment bleiben unverändert – die README erklärt, wie Sie sie von Hand entfernen.
weavero-defatt-other-off = Weaveros Standardanhang-Funktion ist jetzt deaktiviert.
weavero-defatt-other-keeps = Default Attachment funktioniert genau wie bisher weiter; Weavero hat keine seiner Daten verändert.
weavero-defatt-other-back = Sie können Weaveros Version unter Einstellungen → Weavero → Extras wieder aktivieren.
weavero-defatt-skipped = Die Daten von Default Attachment wurden nicht angetastet.
weavero-defatt-skipped-hint = Legen Sie jederzeit einen Standard fest, indem Sie mit der rechten Maustaste auf einen untergeordneten Eintrag klicken.

# ---- Split view (tab-split.ts) ----
weavero-split-splitter-label = Größe der Tabs in der geteilten Ansicht ändern
weavero-split-footer-more =
    .title = Geteilte Ansicht
    .aria-label = Menü der geteilten Ansicht
weavero-split-picker-title = Geteilte Ansicht hinzufügen
weavero-split-picker-desc = Wählen Sie einen Tab, der neben diesem angezeigt werden soll.
weavero-split-picker-search = Offene Tabs durchsuchen
weavero-split-picker-empty = Kein anderer offener Tab.
weavero-split-tab-tip = { $side ->
        [left] { $label }, geteilte Ansicht links
       *[right] { $label }, geteilte Ansicht rechts
    }

# ---- Settings pane, written by its script (prefs/index.ts) ----
weavero-pref-section-toggle = Diesen Abschnitt ein- oder ausklappen
weavero-pref-outline-key-none = Keine
weavero-pref-outline-key-press = Tasten drücken…
weavero-pref-outline-key-esc-hint = Esc zum Abbrechen
weavero-pref-outline-key-taken = { $keys } ist bereits belegt: { $owner }.
weavero-pref-outline-key-saved = Gespeichert.
weavero-pref-outline-key-removed = Entfernt.

# ---- misc (index.ts, pane.ts) ----
weavero-misc-toast-dismiss = Klicken zum Schließen
weavero-misc-link-toast-title = Weavero – defekter Link
weavero-misc-link-group-no-access = Dieser Link verweist auf eine Gruppen-Bibliothek, auf die Sie keinen Zugriff haben (Gruppe #{ $group }).
weavero-misc-link-group-unresolved = Dieser Link verweist auf eine Gruppen-Bibliothek, die nicht aufgelöst werden konnte.
weavero-misc-link-collection-missing = Die verlinkte Sammlung existiert nicht mehr (Schlüssel { $key }).
weavero-misc-link-collection-trashed = Die verlinkte Sammlung liegt im Papierkorb (Schlüssel { $key }).
weavero-misc-link-search-missing = Die verlinkte gespeicherte Suche existiert nicht mehr (Schlüssel { $key }).
weavero-misc-link-scope-collection-missing = Die Sammlung in diesem Link existiert nicht mehr (Schlüssel { $key }) – der Eintrag bzw. die Einträge werden ohne sie ausgewählt.
weavero-misc-link-scope-collection-trashed = Die Sammlung in diesem Link liegt im Papierkorb (Schlüssel { $key }) – der Eintrag bzw. die Einträge werden ohne sie ausgewählt.
weavero-misc-link-scope-search-missing = Die gespeicherte Suche in diesem Link existiert nicht mehr (Schlüssel { $key }) – der Eintrag bzw. die Einträge werden ohne sie ausgewählt.
weavero-misc-link-items-missing-all = Keiner der { $count } verlinkten Einträge existiert mehr ({ $keys }).
weavero-misc-link-item-missing = Der verlinkte Eintrag existiert nicht mehr (Schlüssel { $key }).
weavero-misc-link-items-missing-some = { $count ->
        [one] { $count } von { $total } verlinkten Einträgen existiert nicht mehr ({ $keys }) – die übrigen wurden ausgewählt.
       *[other] { $count } von { $total } verlinkten Einträgen existieren nicht mehr ({ $keys }) – die übrigen wurden ausgewählt.
    }
weavero-misc-link-items-trashed = { $count } der verlinkten Einträge liegen im Papierkorb ({ $keys }).
weavero-misc-link-item-trashed = Der verlinkte Eintrag liegt im Papierkorb (Schlüssel { $key }).
weavero-misc-link-file-missing = Die Datei, auf die dieser Link verweist, existiert nicht mehr (Schlüssel { $key }).
weavero-misc-link-file-trashed = Der Anhang der verlinkten Datei liegt im Papierkorb (Schlüssel { $key }) – trotzdem geöffnet.
weavero-misc-link-note-missing = Die Notiz, auf die dieser Link verweist, existiert nicht mehr (Schlüssel { $key }).
weavero-misc-link-note-trashed = Die verlinkte Notiz liegt im Papierkorb (Schlüssel { $key }) – trotzdem geöffnet.
weavero-misc-link-refused-zotero = Diese Art von Zotero-Link wird aus einer Notiz oder einem Kommentar nicht geöffnet: { $url }
weavero-misc-link-refused-remote-file = Ein Link auf eine Datei auf einem anderen Computer ({ $host }) wurde nicht geöffnet.
weavero-misc-open-remote-file-title = Eine Datei auf einem anderen Computer öffnen?
weavero-misc-open-remote-file-message = Dieser Link führt zu einem anderen Computer, „{ $host }“:

    { $target }

    Beim Öffnen wird eine Verbindung zu diesem Computer hergestellt. Öffnen Sie ihn nur, wenn Sie der Herkunft des Links vertrauen. Weavero fragt für diesen Link nicht erneut.
weavero-misc-open-remote-file-button = Öffnen
weavero-misc-open-local-file-title = Eine Datei auf diesem Computer öffnen?
weavero-misc-open-local-file-message = Dieser Link öffnet eine Datei auf diesem Computer:

    { $target }

    Sie wird in der Anwendung geöffnet, die Ihr Computer für diesen Dateityp verwendet. Öffnen Sie sie nur, wenn Sie der Herkunft des Links vertrauen. Weavero fragt für diesen Link nicht erneut.
weavero-misc-open-local-file-button = Öffnen
weavero-misc-link-local-file-not-opened = „{ $name }“ wurde nicht geöffnet.
weavero-misc-link-local-file-missing = „{ $name }“ wurde nicht geöffnet: Diese Datei gibt es auf diesem Computer nicht.
weavero-misc-link-local-file-failed = „{ $name }“ konnte nicht geöffnet werden.
weavero-misc-link-refused-title = Weavero – Link nicht geöffnet
weavero-misc-link-refused-runnable = „{ $name }“ wurde nicht geöffnet: Dateien dieses Typs können Programme auf Ihrem Computer ausführen.
weavero-misc-open-external-title = In einer anderen Anwendung öffnen?
weavero-misc-open-external-message = Zotero kann „{ $name }“ nicht anzeigen; die Datei würde in der Anwendung geöffnet, die Ihr Computer für diesen Dateityp verwendet. Öffnen Sie sie nur, wenn Sie ihrer Herkunft vertrauen.
weavero-misc-open-external-button = Öffnen
weavero-misc-reader-window = { $number ->
        [1] Reader-Fenster
       *[other] Reader-Fenster { $number }
    }
weavero-misc-update-installed = Derzeit installiert: Zotero { $version }
weavero-misc-update-other-instance = Ein anderes Zotero dieser Installation läuft (ein anderes Profil oder ein anderer Benutzer). Zotero wartet, bis das andere geschlossen ist, um nach Updates zu suchen und sie zu installieren.

# ---- count (count-popups.ts, index.ts, pane.ts) ----
weavero-count-related = { $count } verwandt
weavero-count-title-tags = { $count ->
        [one] { $count } Tag
       *[other] { $count } Tags
    }
weavero-count-title-manual-tags = { $count ->
        [one] { $count } manuelles Tag
       *[other] { $count } manuelle Tags
    }
weavero-count-title-auto-tags = { $count ->
        [one] { $count } automatisches Tag
       *[other] { $count } automatische Tags
    }
weavero-count-title-backlinks = { $count ->
        [one] { $count } Rückverweis
       *[other] { $count } Rückverweise
    }
weavero-count-title-item-links = { $count ->
        [one] { $count } Eintragslink
       *[other] { $count } Eintragslinks
    }
weavero-count-title-ext-links = { $count ->
        [one] { $count } externer Link
       *[other] { $count } externe Links
    }
weavero-count-this-item = Dieser Eintrag
weavero-count-page = S. { $page }
weavero-count-tag-filter-tip = Liste nach diesem Tag filtern
weavero-count-empty = Hier ist nichts mehr.

# ---- scope (pane-scope.ts) ----
weavero-scope-toggle-hint = { $state ->
        [only] Nur diese werden angezeigt · erneut klicken: alle anzeigen
        [hidden] Diese sind ausgeblendet · erneut Alt+Klick: sie anzeigen
       *[off] Klick: nur diese anzeigen · Alt+Klick: diese ausblenden
    }
weavero-scope-count-own = { $prep ->
        [in] In diesem Eintrag: { $count }
        [to] Auf diesen Eintrag: { $count }
       *[on] An diesem Eintrag: { $count }
    }
weavero-scope-count-att = { $prep ->
        [in] In seinen Anhängen: { $count }
        [to] Auf seine Anhänge: { $count }
       *[on] An seinen Anhängen: { $count }
    }
weavero-scope-count-note = { $prep ->
        [in] In seinen Notizen: { $count }
        [to] Auf seine Notizen: { $count }
       *[on] An seinen Notizen: { $count }
    }
weavero-scope-count-ann = { $prep ->
        [in] In seinen Anmerkungen: { $count }
        [to] Auf seine Anmerkungen: { $count }
       *[on] An seinen Anmerkungen: { $count }
    }
weavero-scope-count-zotero-links = Zotero-Links: { $count }
weavero-scope-count-note-citations = Notiz-Zitationen: { $count }
weavero-scope-count-internal = { $what ->
        [backlinks] Interne Rückverweise: { $count } von { $total } (beide Enden im selben Eintrag)
       *[links] Interne Links: { $count } von { $total } (beide Enden im selben Eintrag)
    }
weavero-scope-count-broken = Defekte Links: { $count } (der Eintrag existiert nicht mehr, oder seine Gruppen-Bibliothek ist in diesem Profil nicht vorhanden)

# ---- hid (pane.ts, hidden collections) ----
weavero-hid-hide = Ausblenden
weavero-hid-section = { $section ->
        [feeds] Feeds
       *[groups] Gruppen-Bibliotheken
    }
weavero-hid-dot-collections = { $count ->
        [one] { $count } ausgeblendete Sammlung oder gespeicherte Suche
       *[other] { $count } ausgeblendete Sammlungen oder gespeicherte Suchen
    }
weavero-hid-dot-groups = { $count ->
        [one] { $count } ausgeblendete Gruppen-Bibliothek
       *[other] { $count } ausgeblendete Gruppen-Bibliotheken
    }
weavero-hid-dot-libraries = { $count ->
        [one] { $count } ausgeblendete Bibliothek
       *[other] { $count } ausgeblendete Bibliotheken
    }
weavero-hid-dot-feeds = { $count ->
        [one] { $count } ausgeblendeter Feed
       *[other] { $count } ausgeblendete Feeds
    }
weavero-hid-dot-section = der Abschnitt „{ $section }“
weavero-hid-dot-here = In diesem Fenster: { $list }
weavero-hid-dot-everywhere = { $count } in allen Fenstern ausgeblendet (Zotero-Einstellung)
weavero-hid-dot-tip = { $list } – Rechtsklick zum Anzeigen
weavero-hid-mgr-title = Verwaltung für Sammlungen und Bibliotheken
weavero-hid-mgr-title-window = Verwaltung für Sammlungen und Bibliotheken – { $window }
weavero-hid-mgr-filter = Sammlungen filtern
weavero-hid-mgr-shown = Angezeigt
weavero-hid-mgr-hidden = Ausgeblendet
weavero-hid-mgr-hide-button = Ausblenden →
weavero-hid-mgr-show-button = ← Anzeigen
weavero-hid-mgr-show-all-button = ← Alle anzeigen
weavero-hid-mgr-show-all-tip = Alles anzeigen, was in diesem Fenster ausgeblendet ist (und was Zoteros eigene Einstellung ausblendet)
weavero-hid-mgr-empty = Nichts ausgeblendet
weavero-hid-mgr-why-groups-section = Der Abschnitt „Gruppen-Bibliotheken“ kann nur ausgeblendet werden, solange „Meine Bibliothek“ angezeigt wird
weavero-hid-mgr-why-last-library = Die letzte angezeigte Bibliothek kann nicht ausgeblendet werden: Zeigen Sie zuerst eine andere Bibliothek an
weavero-hid-mgr-why-heading-hide = Eine Überschrift: Wählen Sie die Bibliotheken darunter aus, um sie auszublenden
weavero-hid-mgr-why-heading-show = Eine Überschrift: Wählen Sie die ausgeblendeten Bibliotheken darunter aus, um sie anzuzeigen
weavero-hid-mgr-why-not-hidden = Nicht ausgeblendet: wird hier wegen der ausgeblendeten Einträge darin angezeigt
weavero-hid-mgr-hint-groups-section = Mit dem Abschnitt „Gruppen-Bibliotheken“ ausgeblendet: „Anzeigen“ holt den Abschnitt zurück
weavero-hid-mgr-hint-feeds-section = Mit dem Abschnitt „Feeds“ ausgeblendet: „Anzeigen“ holt den Abschnitt zurück
weavero-hid-mgr-hint-library = Mit seiner Bibliothek ausgeblendet: „Anzeigen“ holt die Bibliothek zurück
weavero-hid-mgr-hint-parent = Mit seiner übergeordneten Sammlung ausgeblendet: „Anzeigen“ holt die übergeordnete Sammlung zurück
weavero-hid-mgr-global-tip = In allen Fenstern durch Zoteros eigene Einstellung ausgeblendet: „Anzeigen“ holt es überall zurück
weavero-hid-mgr-all-windows = (alle Fenster)

# ---- pane (pane.ts) ----
weavero-pane-open-in-new-main-window = Neues Hauptfenster
weavero-pane-open-in-new-group-window = Eine neue Gruppe in einem neuen Hauptfenster
weavero-pane-toggle-collections = Sammlungsbereich umschalten
weavero-pane-tags-handle-expand = Tag-Auswahl ausklappen
weavero-pane-tags-handle-expand-tag = Tag-Auswahl ausklappen (die Liste ist nach dem Tag „{ $tag }“ gefiltert)
weavero-pane-tags-handle-expand-tags = Tag-Auswahl ausklappen (die Liste ist nach { $count } Tags gefiltert)
weavero-pane-tags-handle-collapse = Tag-Auswahl einklappen (ziehen, um die Größe zu ändern)
weavero-pane-added-by = Hinzugefügt von { $name }
weavero-pane-url-menu-copy-link = Link kopieren
weavero-pane-url-menu-open-split = Link in geteilter Ansicht öffnen
weavero-pane-related-card-foot = Klick: in Bibliothek anzeigen · Rechtsklick für mehr

# ---- col (pane.ts, items-list columns) ----
weavero-col-annotations = Anmerkungen
weavero-col-tags = Tags
weavero-col-related = Zugehörig
weavero-col-backlinks = Rückverweise
weavero-col-item-links = Eintragslinks
weavero-col-ext-links = Externe Links

# ---- pm (pane.ts, Plugins Manager) ----
weavero-pm-window-title = Plugin-Verwaltung
weavero-pm-search-placeholder = Installierte Plugins durchsuchen  ({ $shortcut })
weavero-pm-search-clear = Leeren
weavero-pm-time-unknown = unbekannt
weavero-pm-time-just-now = gerade eben
weavero-pm-time-minutes = vor { $count } Min.
weavero-pm-time-hours = { $count ->
        [one] vor { $count } Stunde
       *[other] vor { $count } Stunden
    }
weavero-pm-time-days = { $count ->
        [one] vor { $count } Tag
       *[other] vor { $count } Tagen
    }
weavero-pm-card-meta = v{ $version } · aktualisiert { $when }
weavero-pm-recent-frame-tip = Wie weit „Neueste Updates“ zurückreicht
weavero-pm-recent-frame = { $days ->
        [0] Alle
        [one] Letzter Tag
       *[other] Letzte { $days } Tage
    }
weavero-pm-recent-frame-default = { $frame } (Standard)
weavero-pm-recent-heading = Neueste Updates

# ---- oe (outline-eval.ts, a developer tool) ----
weavero-oe-marked = { $verdict ->
        [good] Eval: als GUT markiert ({ $count } Fälle erfasst)
        [bad] Eval: als SCHLECHT markiert ({ $count } Fälle erfasst)
       *[scan] Eval: als SCAN markiert ({ $count } Fälle erfasst)
    }
weavero-oe-cleared = Eval: Markierung entfernt

# ---- Items-list filter: toolbar, chip bar, rows (filter.ts) ----
weavero-filter-tb-button-tip = Einträge filtern
weavero-filter-chevron-revealed-tip = Alle untergeordneten Einträge dieses Containers werden angezeigt. Klicken, um den Filter erneut anzuwenden.
weavero-filter-chevron-hidden-tip = { $count ->
        [one] { $count } weiterer Eintrag vom Filter ausgeblendet. Klicken, um ihn anzuzeigen.
       *[other] { $count } weitere Einträge vom Filter ausgeblendet. Klicken, um sie anzuzeigen.
    }
weavero-filter-added-by-tip = Hinzugefügt von { $name }
weavero-filter-chip-order = { $field } { $op } { $value }
weavero-filter-chip-op-is = ist
weavero-filter-chip-op-is-not = ist nicht
weavero-filter-chip-op-includes = enthält
weavero-filter-chip-op-includes-all = enthält alle
weavero-filter-chip-op-includes-any = enthält eines von
weavero-filter-chip-op-excludes-any = enthält keines von
weavero-filter-chip-op-has = hat
weavero-filter-chip-op-has-none-of = hat keines von
weavero-filter-chip-source-embedded = Im PDF eingebettet
weavero-filter-chip-source-zotero = In Zotero erstellt
weavero-filter-chip-tip = Klicken zum Bearbeiten – öffnet das Filter-Popup mit Fokus auf dieser Gruppe.
weavero-filter-chip-remove-tip = Filter entfernen
weavero-filter-bar-or = ODER
weavero-filter-bar-add = + Filter
weavero-filter-bar-add-tip = Einen Filter zur aktuellen Gruppe hinzufügen (UND-verknüpft mit den vorhandenen Chips dieser Gruppe).
weavero-filter-bar-add-group = + ODER-Gruppe
weavero-filter-bar-add-group-tip = Eine neue ODER-Gruppe beginnen – ihre Filter werden intern UND-verknüpft, und die Ergebnisse der Gruppe werden mit denen der anderen vereinigt.
weavero-filter-bar-clear-all = Alle entfernen
weavero-filter-bar-clear-all-tip = Alle aktiven Filter entfernen und auf eine einzige leere Gruppe zurücksetzen.
weavero-filter-dim-annotation-color = Anmerkungsfarbe
weavero-filter-dim-annotation-type = Anmerkungsart
weavero-filter-dim-has-comment = Hat Kommentar
weavero-filter-dim-annotation-source = Anmerkungsquelle
weavero-filter-dim-tag = Tag
weavero-filter-dim-author = Autor
weavero-filter-dim-item-type = Eintragsart
weavero-filter-dim-attachment-file-type = Dateityp des Anhangs
weavero-filter-dim-outline-source = Gliederungsquelle
weavero-filter-dim-outline-flags = Gliederungs-Flags
weavero-filter-dim-outline-verdict = Gliederungsbewertung
weavero-filter-dim-added-by = Hinzugefügt durch
weavero-filter-dim-has-related = Hat verwandte Einträge
weavero-filter-dim-has-external-link = Hat externen Link
weavero-filter-dim-has-item-links = Hat Eintragslinks
weavero-filter-dim-has-bookmarks = Hat Lesezeichen
weavero-filter-dim-has-backlinks = Hat Rückverweise
weavero-filter-dim-has-tag = Hat Tag
weavero-filter-dim-item-note = Eintragsnotiz
weavero-filter-dim-standalone-note = Eigenständige Notiz
weavero-filter-dim-standalone-attachment = Eigenständiger Anhang
weavero-filter-dim-has-abstract = Hat Zusammenfassung
weavero-filter-dim-has-doi = Hat DOI
weavero-filter-dim-has-pmid = Hat PMID
weavero-filter-dim-has-pmcid = Hat PMCID
weavero-filter-dim-retracted = Zurückgezogen
weavero-filter-dim-has-url = Hat URL
weavero-filter-dim-has-attachment = Hat Anhangsdatei
weavero-filter-dim-has-annotations = Hat Anmerkungen
weavero-filter-dim-has-outline = Hat bearbeitete Gliederung
weavero-filter-dim-has-embedded-annotations = Hat eingebettete Anmerkungen
weavero-filter-dim-publication = Publikation
weavero-filter-dim-read-status = Lesestatus
weavero-filter-dim-in-other-library = In mehreren Bibliotheken
weavero-filter-color-yellow = Gelb
weavero-filter-color-red = Rot
weavero-filter-color-green = Grün
weavero-filter-color-blue = Blau
weavero-filter-color-purple = Lila
weavero-filter-color-magenta = Magenta
weavero-filter-color-orange = Orange
weavero-filter-color-gray = Grau
weavero-filter-color-black = Schwarz
weavero-filter-ann-type-highlight = Markierung
weavero-filter-ann-type-underline = Unterstreichung
weavero-filter-ann-type-note = Notiz
weavero-filter-ann-type-image = Bild
weavero-filter-ann-type-ink = Freihand
weavero-filter-ann-type-text = Text
weavero-filter-file-type-snapshot = Snapshot
weavero-filter-file-type-image = Bild
weavero-filter-file-type-video = Video
weavero-filter-file-type-web-link = Weblink
weavero-filter-file-type-linked-file = Verlinkte Datei
weavero-filter-file-type-other-file = Andere Datei
weavero-filter-read-status-none = Kein Status
weavero-filter-read-status-tip = { $status } – Alt+Klick zum Ausschließen

# ---- Collection set (filter.ts): several collections selected ----
weavero-filter-collset-header = { $header } – { $mode ->
        [all] in allen
       *[not-all] nicht in allen
    }
weavero-filter-collset-tip-all = { $kind ->
        [collections] Zeigt Einträge, die in ALLEN ausgewählten Sammlungen sind – klicken, um wieder alle anzuzeigen (Vereinigung)
        [searches] Zeigt Einträge, die in ALLEN ausgewählten gespeicherten Suchen sind – klicken, um wieder alle anzuzeigen (Vereinigung)
       *[sources] Zeigt Einträge, die in ALLEN ausgewählten Quellen sind – klicken, um wieder alle anzuzeigen (Vereinigung)
    }
weavero-filter-collset-tip-not-all = { $kind ->
        [collections] Zeigt Einträge, die in einigen, aber NICHT allen ausgewählten Sammlungen sind – Alt+Klick, um wieder alle anzuzeigen (Vereinigung)
        [searches] Zeigt Einträge, die in einigen, aber NICHT allen ausgewählten gespeicherten Suchen sind – Alt+Klick, um wieder alle anzuzeigen (Vereinigung)
       *[sources] Zeigt Einträge, die in einigen, aber NICHT allen ausgewählten Quellen sind – Alt+Klick, um wieder alle anzuzeigen (Vereinigung)
    }
weavero-filter-collset-tip-off = { $kind ->
        [collections] Nur Einträge anzeigen, die in ALLEN ausgewählten Sammlungen sind (Schnittmenge). Alt+Klick: Einträge in einigen, aber nicht allen.
        [searches] Nur Einträge anzeigen, die in ALLEN ausgewählten gespeicherten Suchen sind (Schnittmenge). Alt+Klick: Einträge in einigen, aber nicht allen.
       *[sources] Nur Einträge anzeigen, die in ALLEN ausgewählten Quellen sind (Schnittmenge). Alt+Klick: Einträge in einigen, aber nicht allen.
    }
weavero-filter-collset-tip-counts = In allen: { $all ->
        [one] { $all } Eintrag
       *[other] { $all } Einträge
    } · in einigen, aber nicht allen: { $some ->
        [one] { $some } Eintrag
       *[other] { $some } Einträge
    }

# ---- Filter popup (filter.ts) ----
weavero-filter-popup-title = Bibliothek filtern
weavero-filter-popup-clear = Zurücksetzen
weavero-filter-popup-clear-tip = Alle Filter zurücksetzen (dieses Fenster bleibt geöffnet)
weavero-filter-popup-clear-aria = Alle Filter zurücksetzen
weavero-filter-popup-clear-close = Zurücksetzen und schließen
weavero-filter-kind-parent = Übergeordnet
weavero-filter-kind-attachment = Anhang
weavero-filter-kind-note = Notiz
weavero-filter-kind-annotation = Anmerkung
weavero-filter-kind-standalone-note-text = Text eigenständiger Notizen
weavero-filter-kind-item-note-text = Text von Eintragsnotizen
weavero-filter-kind-annotation-comment = Anmerkungskommentar
weavero-filter-seltarget-label = Auswahlziel:
weavero-filter-seltarget-tip = Welche Zeilenarten Strg+A auswählt (Zeilen außerhalb werden abgeblendet). Leer lassen für die intelligente Voreinstellung: alle Arten – oder nur die Art(en), auf die Ihre aktiven Filter zielen (Anmerkungsfilter → Anmerkungen; Filter nach Eintragsart → Einträge; beides → beides). Klicken Sie auf eine Art, um das zu übersteuern, Alt+Klick zum Ausschließen.
weavero-filter-seltarget-parent-tip = Reguläre Einträge werden mit Strg+A auswählbar.
weavero-filter-seltarget-attachment-tip = Anhangszeilen (auch eigenständige) werden mit Strg+A auswählbar.
weavero-filter-seltarget-note-tip = Notizen (eigenständige und Eintragsnotizen) werden mit Strg+A auswählbar.
weavero-filter-seltarget-annotation-tip = Anmerkungszeilen werden mit Strg+A auswählbar.
weavero-filter-seltarget-auto-tip = { $tip }  •  Automatisch: Ihre aktiven Filter zielen nur auf diese Art, daher wählt Strg+A sie aus. Klicken Sie auf eine beliebige Art, um sie manuell festzulegen.
weavero-filter-show-nonmatching-annotations = Nicht passende Anmerkungen anzeigen
weavero-filter-show-nonmatching-annotations-tip = Entspricht Zoteros „Nicht passende Anmerkungen ausblenden“ (Menü „Ansicht“). Ist die Option deaktiviert, erscheinen unter passenden Dateien nur Anmerkungen, die der aktuellen Suche bzw. dem aktuellen Filter entsprechen.
weavero-filter-show-nonmatching-attachments = Nicht passende Anhänge anzeigen
weavero-filter-show-nonmatching-attachments-tip = Ist die Option deaktiviert, erscheinen unter passenden übergeordneten Einträgen nur Anhänge, die der aktuellen Suche bzw. dem aktuellen Filter entsprechen. Ausgeblendete Anhänge nehmen ihre untergeordneten Anmerkungen mit.
weavero-filter-mode-trigger-tip = Auswählen, was gefiltert wird
weavero-filter-tag-empty-all = Keine Tags in dieser Bibliothek
weavero-filter-tag-empty-match = Keine passenden Tags
weavero-filter-publication-empty-all = Keine Publikationen in dieser Bibliothek
weavero-filter-publication-empty-match = Keine passenden Publikationen
weavero-filter-author-empty-all = Keine Anmerkungsautoren in dieser Bibliothek
weavero-filter-author-empty-match = Keine passenden Autoren
weavero-filter-added-by-empty-all = Keine erfassten Ersteller in dieser Bibliothek
weavero-filter-added-by-empty-match = Keine passenden Benutzer
weavero-filter-collection-empty-all = Keine Sammlungen in dieser Bibliothek
weavero-filter-collection-empty-match = Keine passenden Sammlungen
weavero-filter-saved-search-empty-all = Keine gespeicherten Suchen in dieser Bibliothek
weavero-filter-saved-search-empty-match = Keine passenden gespeicherten Suchen
weavero-filter-suggest-more = +{ $count } weitere
weavero-filter-collection-collapse = Einklappen
weavero-filter-collection-expand = Ausklappen
weavero-filter-pill-tip = { $exclude ->
        [yes] Nicht { $kind }: { $value }
       *[no] { $kind }: { $value }
    }
weavero-filter-pill-kind = { $exclude ->
        [yes] Nicht { $kind }:
       *[no] { $kind }:
    }
weavero-filter-pill-remove = Entfernen
weavero-filter-tag-scope-tip = Auswählen, für welche Kategorien der Tag-Filter gilt – übergeordnete Einträge, Anhänge, Notizen, Anmerkungen (gemeinsam mit „Hat Tag“).
weavero-filter-line-all-of = Alle folgenden
weavero-filter-line-any-publication = Beliebige Publikation
weavero-filter-line-any-added-by = Hinzugefügt durch (beliebig)
weavero-filter-itype-trigger = Eintragsart
weavero-filter-itype-trigger-tip = Eintragsart – klicken zum Auswählen
weavero-filter-itype-not = Nicht { $type }
weavero-filter-itype-empty = Keine Eintragsarten verfügbar
weavero-filter-itype-mru-tip = { $type } – kürzlich verwendet. Klicken zum Filtern; Alt+Klick zum Ausschließen.
weavero-filter-qs-scope-tip = Schnellsuche beschränken auf: – wählen Sie, welche Zeilenarten die Schnellsuche der Symbolleiste in den Ergebnissen zeigen darf. Alle aktiviert (Standard) bedeutet keine Beschränkung.
weavero-filter-qs-scope-aria = Schnellsuche beschränken auf
weavero-filter-scope-apply-to = Anwenden auf
weavero-filter-scope-arrow-tip = Auswählen, für welche Kategorien dieser Filter gilt – übergeordnete Einträge, Anhänge, Notizen, Anmerkungen
weavero-filter-has-tag-tip = Hat Tag – Einträge mit mindestens einem Tag. Alt+Klick zum Ausschließen. ▾ zum Eingrenzen nach Zeilenart.
weavero-filter-has-related-tip = Hat verwandte Einträge – Einträge mit mindestens einer Verknüpfung zu einem verwandten Eintrag. Alt+Klick zum Ausschließen. ▾ zum Eingrenzen nach Zeilenart.
weavero-filter-has-external-link-tip = Hat externen Link – Einträge, deren Anmerkungskommentar oder Notiztext einen Link enthält, der aus Zotero hinausführt (https://, mailto:, App-Links). Ein zotero://-Link gehört zu „Hat Eintragslinks“. Alt+Klick zum Ausschließen. ▾ zum Auswählen der zu durchsuchenden Textquelle(n).
weavero-filter-has-item-links-tip = Hat Eintragslinks – Einträge, deren Notizen oder Anmerkungskommentare auf einen anderen Zotero-Eintrag verlinken (Zotero-Links und Notiz-Zitationen), am Eintrag, an einer Notiz oder an einer Anmerkung. Eine reine Web-URL gehört zu „Hat externen Link“. Alt+Klick zum Ausschließen. ▾ zum Auswählen, wo der Link steht.
weavero-filter-has-backlinks-tip = Hat Rückverweise – Einträge, auf die aus einem anderen Anmerkungskommentar oder einer anderen Notiz verlinkt wird (Zotero-Links und Notiz-Zitationen), am Eintrag, an einem untergeordneten Element oder an einer Anmerkung. Alt+Klick zum Ausschließen. ▾ zum Auswählen, was verlinkt ist: der Eintrag, seine Anhänge, Notizen oder Anmerkungen.
weavero-filter-in-other-library-tip = In mehreren Bibliotheken – reguläre Einträge, die auch zu einer anderen Bibliothek gehören (es gibt eine verknüpfte Kopie, z. B. in eine Gruppe oder aus einer Gruppe gezogen). Der Abschnitt „Bibliotheken und Sammlungen“ im Eintragsbereich zeigt, welche. Alt+Klick zum Ausschließen.
weavero-filter-retracted-tip = Zurückgezogen – reguläre Einträge, die Zotero als zurückgezogen markiert (roter Hinweis zur Zurückziehung im Eintragsbereich), innerhalb der aktuellen Sammlung oder Suche. Alt+Klick, um sie auszuschließen.
weavero-filter-has-doi-tip = Hat DOI – reguläre Einträge mit einer DOI. Alt+Klick zum Ausschließen.
weavero-filter-has-pmid-tip = Hat PMID – reguläre Einträge mit einer PMID (Feld oder Extra). Alt+Klick zum Ausschließen.
weavero-filter-has-pmcid-tip = Hat PMCID – reguläre Einträge mit einer PMCID (Feld oder Extra). Alt+Klick zum Ausschließen.
weavero-filter-has-url-tip = Hat URL – reguläre Einträge mit einem URL-Feld. Alt+Klick zum Ausschließen.
weavero-filter-has-abstract-tip = Hat Zusammenfassung – reguläre Einträge mit nicht leerer Zusammenfassung. Alt+Klick zum Ausschließen.
weavero-filter-has-attachment-tip = Hat Anhangsdatei – reguläre Einträge mit mindestens einer Anhangsdatei (PDF, EPUB, Snapshot usw.). Nicht zu verwechseln mit „Eintragsnotiz“ – Eintragsnotizen sind ebenfalls Zeilen auf Anhangsebene, haben aber ihre eigene Kachel in der Gruppe „Anhang“. Alt+Klick zum Ausschließen.
weavero-filter-linked-file-tip = Verlinkte Datei – Anhänge, die als Links auf externe Dateien gespeichert sind (beliebiger Inhaltstyp). Alt+Klick zum Ausschließen.
weavero-filter-standalone-attachment-tip = Eigenständiger Anhang – nur Anhänge auf oberster Ebene (ohne übergeordneten Eintrag) anzeigen. Alt+Klick zum Ausschließen.
weavero-filter-has-bookmarks-tip = Hat Lesezeichen – Einträge, deren Anhang bzw. Anhänge gespeicherte Reader-Lesezeichen haben. Alt+Klick zum Ausschließen.
weavero-filter-has-annotations-tip = Hat Anmerkungen – Dateianhänge mit mindestens einer Anmerkung. Alt+Klick zum Ausschließen.
weavero-filter-has-embedded-annotations-tip = Hat eingebettete Anmerkungen – Dateianhänge mit mindestens einer Anmerkung, die ein externer Reader in das PDF eingebettet hat. Alt+Klick zum Ausschließen.
weavero-filter-has-outline-tip = Hat bearbeitete Gliederung – Anhänge mit einer Gliederung, die Sie im Tab „Gliederung“ des Readers bearbeitet haben (umbenannte Einträge, eigene Ergänzungen). NICHT die eingebettete oder extrahierte Gliederung des Dokuments selbst: Diese ließe sich nur durch Öffnen jeder Datei ermitteln. Alt+Klick zum Ausschließen.
weavero-filter-has-comment-tip = Hat Kommentar – Anmerkungen mit nicht leerem Kommentartext. Alt+Klick zum Ausschließen.
weavero-filter-annotation-source-tip = Anmerkungsquelle – von einem externen Reader in das PDF eingebettet (importiert, wenn Zotero die Datei zum ersten Mal öffnet). Alt+Klick: im Zotero-Reader erstellt.
weavero-filter-standalone-note-tip = Eigenständige Notiz – nur Notizen auf oberster Ebene (ohne übergeordneten Eintrag) anzeigen. Zusammen mit „Eintragsnotiz“: beide Notizarten (ODER). Alt+Klick zum Ausschließen.
weavero-filter-item-note-tip = Eintragsnotiz – nur Notizen anzeigen, die an einem regulären Eintrag hängen. Zusammen mit „Eigenständige Notiz“: beide Notizarten (ODER). Alt+Klick zum Ausschließen.

# ---- Filter popup, developer outline section (filter.ts) ----
weavero-filter-outline-scan = Bibliothek scannen
weavero-filter-outline-quick-scanning = Schnellscan… { $done }/{ $total }
weavero-filter-outline-scanning = Wird gescannt… { $done }/{ $total }
weavero-filter-outline-scan-tip = Die Gliederung jedes PDFs in dieser Bibliothek klassifizieren (öffnet jedes im Hintergrund). Schreibt nichts in die Bibliothek.
weavero-filter-outline-status = { $classified } klassifiziert · { $marked } markiert
weavero-filter-outline-row-source = Quelle
weavero-filter-outline-row-flags = Flags
weavero-filter-outline-row-verdict = Bewertung
weavero-filter-outline-embedded = Eingebettet
weavero-filter-outline-extracted = Extrahiert
weavero-filter-outline-zotero = Zotero
weavero-filter-outline-scanned = Gescannt (kein Text)
weavero-filter-outline-empty = Leer
weavero-filter-outline-unknown = Unbekannt
weavero-filter-outline-flag-content-empty = Inhalt leer
weavero-filter-outline-flag-entity-leak = Entity-Leck
weavero-filter-outline-flag-ws-junk = Leerzeichen-Müll
weavero-filter-outline-flag-fig-table = Abb.-/Tabellen-Überschriften
weavero-filter-outline-flag-spacing = Abstände verdächtig
weavero-filter-outline-verdict-good = Gut
weavero-filter-outline-verdict-bad = Schlecht
weavero-filter-outline-verdict-scan = Scan
weavero-filter-outline-verdict-unmarked = Nicht bewertet
weavero-filter-outline-tile-tip = { $count ->
        [0] { $label } – klicken zum Einschließen, Alt+Klick zum Ausschließen
       *[other] { $label } ({ $count }) – klicken zum Einschließen, Alt+Klick zum Ausschließen
    }

# ---- Item count breakdown in the item pane (filter.ts) ----
weavero-filter-count-top-level = Oberste Ebene
weavero-filter-count-children = Untergeordnete
weavero-filter-count-annotations = Anmerkungen
weavero-filter-count-unread = Ungelesen
weavero-filter-count-read = Gelesen
weavero-filter-count-match = Treffer
weavero-filter-count-context = Kontext
weavero-filter-count-rows = Zeilen
weavero-filter-count-narrowed = eingegrenzt durch { $sources }
weavero-filter-count-source = { $source ->
        [filter] Filter
        [quick] Schnellsuche
       *[advanced] erweiterte Suche
    }

# ---- Filter popup search box menu (filter.ts) ----
weavero-menu-filter-mode-tag =
    .label = Tag
weavero-menu-filter-mode-publication =
    .label = Publikation
weavero-menu-filter-mode-author =
    .label = Autor
weavero-menu-filter-mode-added-by =
    .label = Hinzugefügt durch
weavero-menu-filter-mode-collection =
    .label = Sammlung
weavero-menu-filter-mode-saved-search =
    .label = Gespeicherte Suche

# ---- Bookmarks, shared by the reader's Bookmarks pane and the library's Bookmarks dropdown (bookmarks.ts, reader-panels.ts) ----
weavero-bm-title = Lesezeichen
weavero-bm-search-tip = Lesezeichen durchsuchen
weavero-bm-search-placeholder = Lesezeichen durchsuchen…
weavero-bm-filter-tip = Lesezeichen filtern
weavero-bm-search-no-match = Keine Lesezeichen passen zu „{ $query }“.
weavero-bm-filter-no-match = Keine Lesezeichen passen zum aktuellen Filter.
weavero-bm-sort-tip = { $field ->
        [location] { $dir ->
            [asc] Nach Position sortiert (aufsteigend) – klicken zum Ändern (die manuelle Reihenfolge bleibt erhalten)
           *[desc] Nach Position sortiert (absteigend) – klicken zum Ändern (die manuelle Reihenfolge bleibt erhalten)
        }
        [alpha] { $dir ->
            [asc] Nach Name sortiert (aufsteigend) – klicken zum Ändern (die manuelle Reihenfolge bleibt erhalten)
           *[desc] Nach Name sortiert (absteigend) – klicken zum Ändern (die manuelle Reihenfolge bleibt erhalten)
        }
        [date] { $dir ->
            [asc] Nach „Hinzugefügt am“ sortiert (aufsteigend) – klicken zum Ändern (die manuelle Reihenfolge bleibt erhalten)
           *[desc] Nach „Hinzugefügt am“ sortiert (absteigend) – klicken zum Ändern (die manuelle Reihenfolge bleibt erhalten)
        }
       *[manual] Lesezeichen sortieren
    }
weavero-bm-sort-short = { $field ->
        [location] Position
        [date] Datum
       *[alpha] Name
    }
weavero-bm-sort-reverse = Sortierreihenfolge umkehren
weavero-bm-filter-title = Lesezeichen filtern
weavero-bm-filter-none = Für die aktuelle Lesezeichenliste sind keine Filter verfügbar.
weavero-bm-filter-chip-ann-tip = { $count ->
        [one] { $name } – { $count } Anmerkung – Alt+Klick zum Ausschließen
       *[other] { $name } – { $count } Anmerkungen – Alt+Klick zum Ausschließen
    }
weavero-bm-filter-chip-tag-tip = { $count ->
        [one] { $tag } – { $count } Lesezeichen – Alt+Klick zum Ausschließen
       *[other] { $tag } – { $count } Lesezeichen – Alt+Klick zum Ausschließen
    }
weavero-bm-filter-type-tip = { $type ->
        [highlight] Markierungen
        [underline] Unterstreichungen
        [note] Notizen
        [text] Textanmerkungen
        [image] Bildanmerkungen
       *[ink] Freihandanmerkungen
    } – { $count } – Alt+Klick zum Ausschließen
weavero-bm-filter-kind-tip = { $kind ->
        [pin] Angeheftete Stellen
        [page] Seitenlesezeichen
        [text] Textauswahlen
        [annotation] Anmerkungen
        [item] Einträge
       *[link] Links
    } – { $count } – Alt+Klick zum Ausschließen
weavero-bm-page-name = { $anchor ->
        [bottom] Seite { $page } (unten)
       *[top] Seite { $page }
    }
weavero-bm-library-fallback = Bibliothek { $id }
weavero-bm-unnamed = Lesezeichen
weavero-bm-folder-unnamed = Ordner
weavero-bm-folder-default-name = Neuer Ordner
weavero-bm-prompt-new-folder = Neuer Ordner
weavero-bm-prompt-new-subfolder = Neuer Unterordner
weavero-bm-prompt-rename-folder = Ordner umbenennen
weavero-bm-prompt-new-bookmark = Neues Lesezeichen
weavero-bm-prompt-name = Name:
weavero-bm-delete-folder-title = Ordner löschen
weavero-bm-delete-folder-confirm = { $count ->
        [one] „{ $name }“ samt { $count } enthaltenem Element löschen?
       *[other] „{ $name }“ samt { $count } enthaltenen Elementen löschen?
    }
weavero-bm-sublabel-in = {" "}– in { $title }
weavero-bm-edit-title = Lesezeichen bearbeiten
weavero-bm-edit-comment-caption = Kommentar

# ---- Bookmarks, the library's dropdown (bookmarks.ts) ----
weavero-bm-add-bookmarks-tip = Lesezeichen hinzufügen…
weavero-bm-new-folder-tip = Neuer Ordner…
weavero-bm-empty-library = Noch keine Lesezeichen. Verwenden Sie ＋ Lesezeichen hinzufügen…
weavero-bm-folder-empty = (leer)
weavero-bm-row-in-tip = { $label } – in { $title }
weavero-bm-missing-tip-library = Das Ziel dieses Lesezeichens existiert nicht mehr. Rechtsklick → „Lesezeichen löschen“, um es zu entfernen.
weavero-bm-missing-suffix = { $text } – Ziel existiert nicht mehr
weavero-bm-edit-title-caption = Titel
weavero-bm-edit-default-title = Standardtitel:
weavero-bm-edit-reset-default = Auf Standard zurücksetzen
weavero-bm-add-link-title = Link-Lesezeichen hinzufügen

# ---- Bookmarks, the reader's Bookmarks pane (reader-panels.ts) ----
weavero-bm-scope = { $scope ->
        [document] Dokument
       *[library] Bibliothek
    }
weavero-bm-scope-tip = Klick: Ebene wechseln. Strg+Klick: beide Ebenen zusammenführen (gemeinsam anzeigen).
weavero-bm-section = { $section ->
        [local] Dieses Dokument
        [global] Anderswo
       *[library] Global
    }
weavero-bm-empty-section = { $section ->
        [local] Klicken Sie mit der rechten Maustaste auf die Seite oder ziehen Sie eine Anmerkung hierher.
        [global] Mit + setzen Sie ein Lesezeichen für einen Eintrag, eine Sammlung oder einen Link.
       *[library] Mit + setzen Sie ein Lesezeichen für einen Eintrag, eine Sammlung, eine Bibliothek oder eine gespeicherte Suche – sie erscheinen hier in jedem Dokument.
    }
weavero-bm-add-tip = Lesezeichen hinzufügen
weavero-bm-new-folder-section-tip = Neuer Ordner in diesem Abschnitt
weavero-bm-add-library-tip = Lesezeichen zur Bibliothek hinzufügen
weavero-bm-new-folder-library-tip = Neuer Ordner in der Bibliothek
weavero-bm-missing-tip-reader = Das Ziel dieses Lesezeichens existiert nicht mehr. Rechtsklick → „Löschen“, um es zu entfernen.
weavero-bm-delete-selected-confirm = { $count ->
        [one] { $count } ausgewähltes Lesezeichen löschen? Ordner werden mit ihrem Inhalt entfernt.
       *[other] { $count } ausgewählte Lesezeichen löschen? Ordner werden mit ihrem Inhalt entfernt.
    }
weavero-bm-link-dialog-text = Text
weavero-bm-link-dialog-apply = Anwenden
weavero-bm-hover-kind = { $kind ->
        [location] Stelle
        [text] Ausgewählter Text
        [collection] Sammlung
        [library] Bibliothek
        [search] Gespeicherte Suche
        [missing] Eintrag (nicht gefunden)
       *[item] Eintrag
    }
weavero-bm-hover-page = Seite { $page }
weavero-bm-hover-source = in: { $title }
weavero-bm-hover-expand = { $state ->
        [expanded] Einklappen ▴
       *[collapsed] Ausklappen ▾
    }
weavero-bm-hover-meta = { $what ->
        [default] Standard: { $value }
        [created] Erstellt: { $value }
       *[bookmarked] Lesezeichen gesetzt: { $value }
    }
weavero-bm-note-pinned-page = Lesezeichen auf Seite { $page } angeheftet. Ziehen Sie die Nadel, um es anzupassen.
weavero-bm-note-pinned = Lesezeichen angeheftet. Ziehen Sie die Nadel, um es anzupassen.
weavero-bm-note-added-pin = Lesezeichen hinzugefügt. Ziehen Sie die Nadel, um es anzupassen.
weavero-bm-note-added-selection = Lesezeichen aus der Auswahl hinzugefügt.
weavero-bm-note-text-not-located = Der Text des Lesezeichens konnte nicht gefunden werden.
weavero-bm-note-no-text-stayed = Dort ist kein Text – das Lesezeichen bleibt, wo es war.
weavero-bm-note-copy-nothing = Nichts zu kopieren – das Lesezeichen hat keinen Auswahlbereich.
weavero-bm-note-copied-outline = { $count ->
        [one] { $count } Lesezeichen in die Gliederung kopiert.
       *[other] { $count } Lesezeichen in die Gliederung kopiert.
    }
weavero-menu-bm-add-bookmark-more =
    .label = Lesezeichen hinzufügen…
weavero-menu-bm-add-library-bookmark =
    .label = Bibliothekslesezeichen hinzufügen…
weavero-menu-bm-thumb-add-pages =
    .label = { $count ->
        [one] Diese Seite zu Lesezeichen hinzufügen
       *[other] Diese { $count } Seiten zu Lesezeichen hinzufügen
    }

# ---- Reader panels, shared words (reader-panels.ts) ----
weavero-rpanel-selection-default = Auswahl
weavero-rpanel-pinned-spot = Angeheftete Stelle
weavero-rpanel-anchor = { $anchor ->
        [point] Angeheftete Stelle
        [bottom] Seitenende
       *[top] Seitenanfang
    }
weavero-rpanel-page-short = S. { $page }
weavero-rpanel-pin-drag-tip = Ziehen zum Verschieben
weavero-rpanel-page-numbers = Seitenzahlen
weavero-rpanel-page-numbers-show = Anzeigen
weavero-rpanel-page-numbers-hide = Ausblenden
weavero-rpanel-sort-by = Sortieren nach
weavero-rpanel-filter-clear = Zurücksetzen
    .title = Alle Filter zurücksetzen (dieses Fenster bleibt geöffnet)
    .aria-label = Alle Filter zurücksetzen
weavero-rpanel-filter-clear-close = Zurücksetzen und schließen
weavero-rpanel-note-select-text = Wählen Sie Text im Dokument aus (Esc zum Abbrechen).
weavero-rpanel-note-cancelled = Abgebrochen.
weavero-rpanel-note-drop-pin = Bewegen Sie den Mauszeiger an eine Stelle und klicken Sie, um die Nadel zu setzen (Esc zum Abbrechen).
weavero-rpanel-note-pin-cancelled = Nadel abgebrochen.
weavero-rpanel-note-no-text = An dieser Stelle ist kein Text.
weavero-rpanel-note-no-position = Diese Position konnte nicht gelesen werden.
weavero-rpanel-note-rm-jump = Deaktivieren Sie die Leseansicht, um zu dieser Stelle zu springen.
weavero-rpanel-ann-kind = { $type ->
        [highlight] Markierung
        [underline] Unterstreichung
        [note] Notiz
        [text] Textanmerkung
        [image] Bildanmerkung
        [ink] Freihandanmerkung
       *[other] Anmerkung
    }
weavero-rpanel-dialog-name = Name
weavero-rpanel-dialog-reset-name = Zurücksetzen
weavero-rpanel-dialog-position = Position
weavero-rpanel-dialog-ok = OK
weavero-rpanel-dialog-page = { $count ->
        [0] Seite
       *[other] Seite (1–{ $max })
    }
weavero-rpanel-dialog-default-name = Standardname: { $name }
weavero-rpanel-layout-sidebar =
    .label = Seitenleiste
weavero-rpanel-layout-outline =
    .label = Gliederungsbereich
weavero-rpanel-layout-context-pane =
    .label = Kontextbereich
weavero-rpanel-layout-selector =
    .label = Farb- und Tag-Auswahl
weavero-rpanel-layout-menu =
    .label = Layout
weavero-rpanel-selector-handle-tip = { $state ->
        [folded-marked] Farb- und Tag-Auswahl anzeigen (eine Auswahl ist aktiv: Sie filtert den Bereich und das Dokument)
        [folded] Farb- und Tag-Auswahl anzeigen
       *[open] Farb- und Tag-Auswahl ausblenden
    }
weavero-rpanel-thumb-copy-links =
    .label = { $count ->
        [one] Link zu dieser Seite kopieren
       *[other] Links zu { $count } Seiten kopieren
    }

# ---- Annotations pane: sort and dates (reader-panels.ts) ----
weavero-rpanel-ann-title = Anmerkungen
weavero-rpanel-ann-sort-tip = Sortierung der Anmerkungen
weavero-rpanel-ann-sort-direction = Sortierrichtung umkehren
weavero-rpanel-ann-sort-field = { $field ->
        [position] Position
        [dateAdded] Hinzugefügt am
        [dateModified] Geändert am
        [manual] Manuell
       *[other] { $field }
    }
weavero-rpanel-ann-sort-manual-row = Manuell (zum Umsortieren ziehen)
weavero-rpanel-ann-show-on-cards = Auf Karten anzeigen
weavero-rpanel-ann-date-added = Hinzugefügt: { $date }
weavero-rpanel-ann-date-modified = Geändert: { $date }
weavero-rpanel-ann-date-added-full = Hinzugefügt am: { $date }
weavero-rpanel-ann-date-modified-full = Geändert am: { $date }

# ---- Annotation filters: the reader's funnel and the annotations pane's (reader-panels.ts) ----
weavero-annfilter-toolbar-tip = Anmerkungen filtern
weavero-annfilter-popup-title = { $kind ->
        [list] Anmerkungsbereich filtern
       *[reader] Anmerkungen filtern
    }
weavero-annfilter-empty = Keine Anmerkungen in diesem Dokument.
weavero-annfilter-pane-tip-head = Anmerkungsbereich filtern (das Dokument behält alle Anmerkungen)
weavero-annfilter-pane-tip-state = { $state ->
        [departs] { $hidden ->
            [0] Dieses Dokument weicht vom Standard ab – alle Anmerkungen werden angezeigt
            [one] Dieses Dokument weicht vom Standard ab – blendet hier { $hidden } Anmerkung aus
           *[other] Dieses Dokument weicht vom Standard ab – blendet hier { $hidden } Anmerkungen aus
        }
       *[default] { $hidden ->
            [0] Folgt dem Standard – alle Anmerkungen werden angezeigt
            [one] Folgt dem Standard – blendet hier { $hidden } Anmerkung aus
           *[other] Folgt dem Standard – blendet hier { $hidden } Anmerkungen aus
        }
    }
weavero-annfilter-clear-all = Alle entfernen
    .title = Alle Anmerkungen in diesem Dokument anzeigen. Gilt nur für dieses Dokument: Der Standard bleibt, wie er ist; „Zurücksetzen“ folgt ihm wieder.
weavero-annfilter-reset = Zurücksetzen
    .title = Zurück zum Standard
weavero-annfilter-back-close = Zurück zum Standard und schließen
weavero-annfilter-count = { $hidden ->
        [0] Alle Anmerkungen werden angezeigt
       *[other] { $hidden } von { $total } im Bereich ausgeblendet
    }
    .title = Das Dokument enthält weiterhin alle Anmerkungen; nur dieser Bereich wird gefiltert.
weavero-annfilter-scope = { $scope ->
        [document] Nur dieses Dokument
       *[default] Standard für alle Dokumente
    }
    .title = { $scope ->
        [document] Dieses Dokument hat seinen eigenen Filter; andere Dokumente folgen dem Standard.
       *[default] Dieser Filter ist der Standard, mit dem jedes Dokument beginnt.
    }
weavero-annfilter-default-note = { $all ->
        [yes] { $hidden ->
            [0] Standard: alles · blendet hier nichts aus
           *[other] Standard: alles · blendet hier { $hidden } aus
        }
       *[no] { $hidden ->
            [0] Standard: { $parts } · blendet hier nichts aus
           *[other] Standard: { $parts } · blendet hier { $hidden } aus
        }
    }
weavero-annfilter-default-note-tip = Der Standardfilter, den dieses Dokument nicht verwendet:
weavero-annfilter-default-shows-everything = (zeigt alles)
weavero-annfilter-default-note-reset = „Zurücksetzen“ wendet ihn hier an.
weavero-annfilter-use-default = Als Standard verwenden
    .title =
        Diesen Filter genau so, wie er ist, zum Standard für jedes Dokument machen
        Alt+Klick, um seine Chips zum bestehenden Standard HINZUZUFÜGEN, statt ihn zu ersetzen
weavero-annfilter-clear-default = Standard entfernen
    .title = Wieder alle Anmerkungen in jedem Dokument anzeigen (entfernt den Standard, nicht den Filter dieses Dokuments)
weavero-annfilter-part-of-default = Teil des Standardfilters
weavero-annfilter-desc-not = nicht { $name }
weavero-annfilter-desc-person = { $who ->
        [added] hinzugefügt von { $name }
       *[modified] geändert von { $name }
    }
weavero-annfilter-flag = { $flag ->
        [comment] { $has ->
            [yes] Hat Kommentar
           *[no] Kein Kommentar
        }
        [tag] { $has ->
            [yes] Hat Tag
           *[no] Kein Tag
        }
        [related] { $has ->
            [yes] Hat verwandte Einträge
           *[no] Keine verwandten Einträge
        }
        [link] { $has ->
            [yes] Hat externen Link
           *[no] Kein externer Link
        }
        [itemLinks] { $has ->
            [yes] Hat Eintragslinks
           *[no] Keine Eintragslinks
        }
       *[backlinks] { $has ->
            [yes] Hat Rückverweise
           *[no] Keine Rückverweise
        }
    }
weavero-annfilter-unit-short = { $unit ->
        [m] Min.
        [h] Std.
        [y] J.
       *[d] T.
    }
weavero-annfilter-desc-date-last = { $field ->
        [added] { $neg ->
            [yes] Hinzugefügt: nicht letzte { $count } { weavero-annfilter-unit-short }
           *[no] Hinzugefügt: letzte { $count } { weavero-annfilter-unit-short }
        }
       *[modified] { $neg ->
            [yes] Geändert: nicht letzte { $count } { weavero-annfilter-unit-short }
           *[no] Geändert: letzte { $count } { weavero-annfilter-unit-short }
        }
    }
weavero-annfilter-desc-date-range = { $field ->
        [added] { $neg ->
            [yes] Hinzugefügt: nicht { $from } bis { $to }
           *[no] Hinzugefügt: { $from } bis { $to }
        }
       *[modified] { $neg ->
            [yes] Geändert: nicht { $from } bis { $to }
           *[no] Geändert: { $from } bis { $to }
        }
    }
weavero-annfilter-chip-tip = { $name } – Alt+Klick zum Ausschließen
weavero-annfilter-color-black = Schwarz
weavero-annfilter-tag-tip = Tag: { $tag } – Alt+Klick zum Ausschließen
weavero-annfilter-tile-tip = { $tile ->
        [comment] Hat Kommentar – Anmerkungen mit nicht leerem Kommentartext. Alt+Klick zum Ausschließen.
        [tag] Hat Tag – Anmerkungen mit mindestens einem Tag. Alt+Klick zum Ausschließen.
        [related] Hat verwandte Einträge – Anmerkungen mit mindestens einer Verknüpfung zu einem verwandten Eintrag. Alt+Klick zum Ausschließen.
        [link] Hat externen Link – Anmerkungen, deren Kommentar einen Link enthält, der aus Zotero hinausführt (https://, mailto:, App-Links); ein zotero://-Link gehört zu „Hat Eintragslinks“. Alt+Klick zum Ausschließen.
        [itemLinks] Hat Eintragslinks – Anmerkungen, deren Kommentar auf einen anderen Zotero-Eintrag verlinkt. Alt+Klick zum Ausschließen.
       *[backlinks] Hat Rückverweise – Anmerkungen, auf die ein anderer Kommentar oder eine Notiz verlinkt. Alt+Klick zum Ausschließen.
    }
weavero-annfilter-head = { $head ->
        [addedBy] Hinzugefügt von
        [modifiedBy] Geändert von
       *[date] Datum
    }
weavero-annfilter-person-tip = { $who ->
        [added] Hinzugefügt von { $name } – Alt+Klick zum Ausschließen
       *[modified] Geändert von { $name } – Alt+Klick zum Ausschließen
    }
weavero-annfilter-date-field = { $field ->
        [added] Hinzugefügt
       *[modified] Geändert
    }
weavero-annfilter-unit = { $unit ->
        [m] Minuten
        [h] Stunden
        [y] Jahre
       *[d] Tage
    }
weavero-annfilter-date-last = Letzte
weavero-annfilter-date-last-tip = { $field ->
        [added] Innerhalb der letzten N { weavero-annfilter-unit } hinzugefügt – Alt+Klick zum Ausschließen
       *[modified] Innerhalb der letzten N { weavero-annfilter-unit } geändert – Alt+Klick zum Ausschließen
    }
weavero-annfilter-date-window-aria = { $field ->
        [added] Zeitfenster für „Hinzugefügt“
       *[modified] Zeitfenster für „Geändert“
    }
weavero-annfilter-unit-tip = Einheit des Zeitfensters
weavero-annfilter-date-custom = Benutzerdefiniert
weavero-annfilter-date-custom-tip = { $field ->
        [added] Benutzerdefinierter Zeitraum für „Hinzugefügt“ – Alt+Klick zum Ausschließen
       *[modified] Benutzerdefinierter Zeitraum für „Geändert“ – Alt+Klick zum Ausschließen
    }
weavero-annfilter-bound = { $bound ->
        [from] von
       *[to] bis
    }
weavero-annfilter-range-aria = { $field ->
        [added] { $bound ->
            [from] Hinzugefügt, Zeitraum von
           *[to] Hinzugefügt, Zeitraum bis
        }
       *[modified] { $bound ->
            [from] Geändert, Zeitraum von
           *[to] Geändert, Zeitraum bis
        }
    }
weavero-annfilter-cal-head = { $field ->
        [added] { $bound ->
            [from] Hinzugefügt – von
           *[to] Hinzugefügt – bis
        }
       *[modified] { $bound ->
            [from] Geändert – von
           *[to] Geändert – bis
        }
    }
weavero-annfilter-bound-invalid = { $bound ->
        [from] Nicht angewendet – liegt nach dem Bis-Datum
       *[to] Nicht angewendet – liegt vor dem Von-Datum
    }
weavero-annfilter-bound-applied = { $bound ->
        [from] Filtert ab { $date }
       *[to] Filtert bis { $date }
    }
weavero-annfilter-bound-clear = { $bound ->
        [from] Von-Datum leeren
       *[to] Bis-Datum leeren
    }
weavero-annfilter-cal-conflict = Würde der anderen Grenze widersprechen
weavero-annfilter-hide-reader = Anmerkungen im Reader ausblenden
    .title = Die Anmerkungsmarkierungen in der Dokumentansicht ausblenden (die Liste in der Seitenleiste bleibt unverändert).

# ---- Outline: the reader's Outline pane (reader-panels.ts) ----
weavero-outline-title = Gliederung
weavero-outline-entry-tip = Gliederung (Weavero)
weavero-outline-add-tip = Neuen Gliederungseintrag hinzufügen
weavero-outline-source = { $source ->
        [embedded] Eingebettet
        [weavero] Bearbeitet
        [zotero] Zotero
        [none] Keine
        [readingMode] Leseansicht
       *[extracted] Extrahiert
    }
weavero-outline-source-head = { $switch ->
        [yes] Quelle der Gliederung (klicken zum Wechseln):
       *[no] Quelle der Gliederung:
    }
weavero-outline-source-meaning = { $source ->
        [embedded] die in der Dokumentdatei gespeicherte Gliederung
        [weavero] Ihre bearbeitete Kopie dieser Gliederung
        [zotero] Zoteros eigene extrahierte Gliederung, unverändert
        [zoteroSame] Zoteros eigene extrahierte Gliederung, unverändert – Weaveros Extraktion ist für dieses PDF identisch
        [embeddedSame] die in der Dokumentdatei gespeicherte Gliederung – Weaveros Extraktion ist für dieses PDF identisch
        [embeddedFirst] die in der Dokumentdatei gespeicherte Gliederung – zuerst angezeigt: Weaveros Extraktion weicht davon ab
        [none] in diesem Dokument wurde keine Gliederung gefunden
        [readingMode] die Überschriften des Texts der Leseansicht (nur in der Leseansicht)
       *[extracted] Weaveros Gliederung, aus Zoteros Strukturdaten für dieses PDF erstellt
    }
weavero-outline-source-line = { $current ->
        [yes] ✓ { $label }: { $meaning }
       *[no] { $label }: { $meaning }
    }
weavero-outline-source-delete-hint = Rechtsklick, um die bearbeitete Gliederung zu löschen.
weavero-outline-references = Literatur
weavero-outline-eval-tip = { $verdict ->
        [good] Die Extraktion dieser Gliederung bewerten (Entwicklerwerkzeug): als gut markiert
        [bad] Die Extraktion dieser Gliederung bewerten (Entwicklerwerkzeug): als schlecht markiert
        [scan] Die Extraktion dieser Gliederung bewerten (Entwicklerwerkzeug): als Scan markiert (keine Textebene)
       *[none] Die Extraktion dieser Gliederung bewerten (Entwicklerwerkzeug): nicht markiert
    }
weavero-outline-empty = { $state ->
        [curated] Ihre Gliederung ist leer.
        [extracting] Gliederung wird extrahiert…
       *[none] Keine Gliederung für dieses Dokument.
    }
weavero-outline-empty-hint = Wählen Sie Text im Dokument aus, dann Rechtsklick → { weavero-menu-reader-add-selection-outline.label }.
weavero-outline-create-button = Gliederung erstellen
    .title = Eine bearbeitbare Gliederung für dieses Dokument beginnen
weavero-outline-search-no-match = Keine Gliederungseinträge passen zur Suche.
weavero-outline-row-tip = Doppelklick zum Umbenennen, Rechtsklick für mehr
weavero-outline-kind-box-tip = Infokasten / Kasten
weavero-outline-pin-title = Nadel auf Seite { $page }
weavero-outline-entries-tree = Gliederungsbaum
weavero-outline-hint-dblclick = Doppelklick, { $key }
weavero-outline-text-size = Textgröße
weavero-outline-size = { $size ->
        [zotero] Zotero-Gliederung
        [itemPane] Zotero-Eintragsbereich
       *[fixed] Fest
    }
weavero-outline-size-label = { $size ->
        [zotero] Zotero-Gliederung, { $px } px
       *[itemPane] Zotero-Eintragsbereich, { $px } px
    }
weavero-outline-reset-original-tip = { $exact ->
        [yes] Name und Bereich zurück auf das Original: „{ $name }“.
       *[no] Name zurück auf „{ $name }“; der Bereich wird anhand dieses Namens neu erkannt.
    }
weavero-outline-revert-question = Die bearbeitete Gliederung dieses Dokuments löschen?
weavero-outline-revert-detail = { $accel ->
        [none] Ihre bearbeitete Gliederung ({ $what }) wird gelöscht; „Rückgängig“ in diesem Tab holt sie zurück. Die eigene Gliederung des Dokuments wird nicht verändert.
       *[other] Ihre bearbeitete Gliederung ({ $what }) wird gelöscht; „Rückgängig“ ({ $accel }) in diesem Tab holt sie zurück. Die eigene Gliederung des Dokuments wird nicht verändert.
    }
weavero-outline-revert-count = { $what ->
        [renamed] { $count } umbenannt
        [added] { $count } von Ihnen hinzugefügt
       *[entries] { $count } Einträge
    }
weavero-outline-prompt-new-title = Titel des neuen Gliederungseintrags:
weavero-outline-edit-position-title = Position bearbeiten
weavero-outline-region-save-text = Bereich und Text speichern
weavero-outline-region-save = Bereich speichern
weavero-outline-note-region-editor = { $what ->
        [label] Ziehen Sie die Griffe, um den Bereich anzupassen – „{ weavero-outline-region-save-text }“ lädt auch die Beschriftung neu; „{ weavero-outline-region-save }“ behält sie. (Enter = { weavero-outline-region-save-text }, Esc = abbrechen.)
       *[title] Ziehen Sie die Griffe, um den Bereich anzupassen – „{ weavero-outline-region-save-text }“ lädt auch den Titel neu; „{ weavero-outline-region-save }“ behält ihn. (Enter = { weavero-outline-region-save-text }, Esc = abbrechen.)
    }
weavero-outline-note-added-selection = „{ $title }“ aus der Auswahl hinzugefügt.
weavero-outline-note-added-selection-text = „{ $title }“ aus der Auswahl hinzugefügt ({ $text }).
weavero-outline-note-added-selection-plain = „{ $title }“ aus der Auswahl hinzugefügt.
weavero-outline-note-added-anchor = { $anchor ->
        [bottom] „{ $title }“ hinzugefügt → Ende von Seite { $page }.
       *[top] „{ $title }“ hinzugefügt → Anfang von Seite { $page }.
    }
weavero-outline-note-position = { $anchor ->
        [bottom] Position: Ende von Seite { $page }.
       *[top] Position: Anfang von Seite { $page }.
    }
weavero-outline-note-pinned = Angeheftet. Geben Sie den Titel ein (Enter zum Beibehalten); ziehen Sie die Nadel, um sie anzupassen.
weavero-outline-note-target-pinned-page = Ziel auf Seite { $page } angeheftet. Ziehen Sie die Nadel, um es anzupassen.
weavero-outline-note-target-pinned = Ziel angeheftet. Ziehen Sie die Nadel, um es anzupassen.
weavero-outline-note-pin-saved = Position der Nadel gespeichert.
weavero-outline-note-target-selection = Ziel aus der Auswahl festgelegt.
weavero-outline-note-no-pin-rm = In der Leseansicht können keine Nadeln gesetzt werden.
weavero-outline-note-anchor-pdf-only = Seitenanker gibt es nur für PDFs.
weavero-outline-note-pin-gone = Das Ziel dieser Nadel ist nicht mehr im Dokument – die Seite wurde anders dargestellt. Ziehen Sie eine neue Nadel, um es neu zu verankern.
weavero-outline-note-entry-gone = Das Ziel dieses Eintrags ist nicht mehr im Dokument.
weavero-outline-note-rm-not-found = Dieser Eintrag wurde im Text der Leseansicht nicht gefunden.
weavero-outline-note-rm-not-ready = Die Leseansicht ist noch nicht bereit.
weavero-outline-note-rm-unmapped = Diese Auswahl konnte keiner Stelle im Dokument zugeordnet werden.
weavero-outline-note-text-not-found-doc = Dieser Text wurde im Dokument nicht gefunden – der Bereich bleibt unverändert.
weavero-outline-note-text-not-found-page = Dieser Text wurde auf der Seite nicht gefunden – der Bereich bleibt unverändert.
weavero-outline-note-no-anchor = An diesem Text konnte nicht verankert werden.
weavero-outline-note-open-pdf-view = Öffnen Sie die PDF-Ansicht, um den Bereich zu bearbeiten.
weavero-outline-note-no-selectable-text = Diese Seite hat keinen auswählbaren Text zum Einrasten.
weavero-outline-note-title-updated = Titel aktualisiert. Um die Hervorhebung anzupassen, Rechtsklick → { weavero-menu-outline-redetect-region.label }.
weavero-outline-note-spacing-cleaned = { $count ->
        [one] Abstände in { $count } Titel bereinigt.
       *[other] Abstände in { $count } Titeln bereinigt.
    }
weavero-outline-note-spacing-unchanged = Nichts geändert – wenn ein Titel bereits korrekt ist, verwenden Sie „{ weavero-menu-outline-spacing-correct.label }“, um den Hinweis zu verwerfen.
weavero-outline-key-action = { $action ->
        [selection] Ausgewählten Text zur Gliederung hinzufügen
        [pin] Stelle in der Gliederung anheften
        [anchorTop] Seitenanfang zur Gliederung hinzufügen
       *[anchorBottom] Seitenende zur Gliederung hinzufügen
    }
weavero-outline-key-space = Leertaste
weavero-outline-key-owner = { $owner ->
        [hand] das Hand-Werkzeug des Readers (und die Vorlese-Hervorhebung)
        [select] das Auswahlwerkzeug des Readers
        [read-aloud] Vorlesen (Unterstreichung)
        [next-page] Nächste Seite
        [previous-page] Vorherige Seite
        [rotate] Seiten drehen
        [pdf-sidebar] die PDF-Seitenleiste
        [colors] die Anmerkungsfarben
        [navigation] Lesen und Navigation im Reader
        [text-selection] Textauswahl im Reader
        [annotation-tools] die Anmerkungswerkzeuge des Readers
        [back-forward] Zurück / Vorwärts im Reader
        [redo] Wiederholen
        [find-previous] Vorheriges suchen
        [reopen-tab] Geschlossenen Tab wieder öffnen
        [select-all] Alles auswählen
        [undo] Rückgängig
        [find] Suchen
        [find-next] Weitersuchen
        [print] Drucken
        [copy] Kopieren
        [cut] Ausschneiden
        [paste] Einfügen
        [close-tab] Tab schließen
        [new-main-window] Neues Hauptfenster
        [zoom-in] Vergrößern
        [zoom-out] Verkleinern
        [reset-zoom] Zoom zurücksetzen
        [back] Zurück
        [forward] Vorwärts
        [next-tab] der nächste Tab
        [switch-tabs] der Tab-Wechsel
       *[menu] eine Tastenkombination eines Zotero-Menüs
    }
weavero-outline-key-owner-zotero = Zoteros Tastenkombination „{ $command }“ (Einstellungen → Erweitert → Tastenkombinationen)
weavero-outline-key-owner-menu-item = der Menüeintrag „{ $label }“
weavero-outline-key-owner-action = „{ $label }“

# ---- Undo: steps and the History menu (bookmarks.ts, reader-panels.ts) ----
weavero-undo-outline-entries = { $action ->
        [add] { $count ->
            [one] Gliederungseintrag hinzufügen
           *[other] { $count } Gliederungseinträge hinzufügen
        }
        [delete] { $count ->
            [one] Gliederungseintrag löschen
           *[other] { $count } Gliederungseinträge löschen
        }
        [rename] { $count ->
            [one] Gliederungseintrag umbenennen
           *[other] { $count } Gliederungseinträge umbenennen
        }
        [move] { $count ->
            [one] Gliederungseintrag verschieben
           *[other] { $count } Gliederungseinträge verschieben
        }
       *[edit] { $count ->
            [one] Gliederungseintrag bearbeiten
           *[other] { $count } Gliederungseinträge bearbeiten
        }
    }
weavero-undo-outline-mixed = Gliederung bearbeiten
weavero-undo-outline-create = Bearbeitete Gliederung erstellen
weavero-undo-outline-remove = Bearbeitete Gliederung löschen
weavero-undo-bm-bookmarks = { $action ->
        [add] { $count ->
            [one] Lesezeichen hinzufügen
           *[other] { $count } Lesezeichen hinzufügen
        }
        [delete] { $count ->
            [one] Lesezeichen löschen
           *[other] { $count } Lesezeichen löschen
        }
        [rename] { $count ->
            [one] Lesezeichen umbenennen
           *[other] { $count } Lesezeichen umbenennen
        }
        [move] { $count ->
            [one] Lesezeichen verschieben
           *[other] { $count } Lesezeichen verschieben
        }
       *[edit] { $count ->
            [one] Lesezeichen bearbeiten
           *[other] { $count } Lesezeichen bearbeiten
        }
    }
weavero-undo-bm-folders = { $action ->
        [add] { $count ->
            [one] Ordner hinzufügen
           *[other] { $count } Ordner hinzufügen
        }
        [delete] { $count ->
            [one] Ordner löschen
           *[other] { $count } Ordner löschen
        }
        [rename] { $count ->
            [one] Ordner umbenennen
           *[other] { $count } Ordner umbenennen
        }
        [move] { $count ->
            [one] Ordner verschieben
           *[other] { $count } Ordner verschieben
        }
       *[edit] { $count ->
            [one] Ordner bearbeiten
           *[other] { $count } Ordner bearbeiten
        }
    }
weavero-undo-bm-mixed = Lesezeichen bearbeiten
weavero-undo-ann-kind = { $type ->
        [highlight] { $count ->
            [one] Markierungsanmerkung
           *[other] Markierungsanmerkungen
        }
        [underline] { $count ->
            [one] Unterstreichungsanmerkung
           *[other] Unterstreichungsanmerkungen
        }
        [note] { $count ->
            [one] Notizanmerkung
           *[other] Notizanmerkungen
        }
        [text] { $count ->
            [one] Textanmerkung
           *[other] Textanmerkungen
        }
        [image] { $count ->
            [one] Bildanmerkung
           *[other] Bildanmerkungen
        }
        [ink] { $count ->
            [one] Freihandanmerkung
           *[other] Freihandanmerkungen
        }
       *[other] { $count ->
            [one] Anmerkung
           *[other] Anmerkungen
        }
    }
weavero-undo-ann-step = { $action ->
        [add] { $count ->
            [one] { weavero-undo-ann-kind } hinzufügen
           *[other] { $count } { weavero-undo-ann-kind } hinzufügen
        }
        [delete] { $count ->
            [one] { weavero-undo-ann-kind } löschen
           *[other] { $count } { weavero-undo-ann-kind } löschen
        }
        [convert] { $count ->
            [one] { weavero-undo-ann-kind } umwandeln
           *[other] { $count } { weavero-undo-ann-kind } umwandeln
        }
        [merge] { $count ->
            [one] { weavero-undo-ann-kind } zusammenführen
           *[other] { $count } { weavero-undo-ann-kind } zusammenführen
        }
        [move] { $count ->
            [one] { weavero-undo-ann-kind } verschieben
           *[other] { $count } { weavero-undo-ann-kind } verschieben
        }
        [resize] { $count ->
            [one] Größe der { weavero-undo-ann-kind } ändern
           *[other] Größe von { $count } { weavero-undo-ann-kind } ändern
        }
       *[edit] { $count ->
            [one] { weavero-undo-ann-kind } bearbeiten
           *[other] { $count } { weavero-undo-ann-kind } bearbeiten
        }
    }
weavero-undo-ann-field = { $field ->
        [comment] Kommentar
        [tags] Tags
        [text] Text
        [pageNumber] Seitenzahl
        [fontSize] Schriftgröße
       *[position] Position
    }
weavero-undo-ann-edit-field = { $count ->
        [one] { weavero-undo-ann-field } der { weavero-undo-ann-kind } bearbeiten
       *[other] { weavero-undo-ann-field } von { $count } { weavero-undo-ann-kind } bearbeiten
    }
weavero-undo-ann-change-color = { $count ->
        [one] Farbe der { weavero-undo-ann-kind } ändern
       *[other] Farbe von { $count } { weavero-undo-ann-kind } ändern
    }
weavero-undo-ann-change = Anmerkungsänderung
weavero-undo-plain = { $dir ->
        [undo] Rückgängig
       *[redo] Wiederholen
    }
weavero-undo-action = { $dir ->
        [undo] { $label } rückgängig machen
       *[redo] { $label } wiederholen
    }
weavero-undo-button-tip =
    { $action } ({ $accel })
    Rechtsklick: Verlauf
weavero-undo-note-done = { $dir ->
        [undo] Rückgängig gemacht: { $label }
       *[redo] Wiederholt: { $label }
    }
weavero-undo-note-stopped = { $dir ->
        [undo] { $done ->
            [0] Angehalten: { $label } konnte nicht rückgängig gemacht werden
           *[other] Angehalten: { $label } konnte nicht rückgängig gemacht werden ({ $done } erledigt)
        }
       *[redo] { $done ->
            [0] Angehalten: { $label } konnte nicht wiederholt werden
           *[other] Angehalten: { $label } konnte nicht wiederholt werden ({ $done } erledigt)
        }
    }
weavero-undo-note-steps = { $dir ->
        [undo] Rückgängig gemacht: { $count } Schritte
       *[redo] Wiederholt: { $count } Schritte
    }
weavero-undo-history = Verlauf
weavero-undo-history-list = { $dir ->
        [undo] Rückgängig-Verlauf
       *[redo] Wiederholen-Verlauf
    }
weavero-undo-stack = { $stack ->
        [reader] Anmerkungen
        [bookmarks-lib] Lesezeichen (Bibliothek)
        [bookmarks-doc] Lesezeichen (dieses Dokument)
       *[outline] Gliederung
    }
weavero-undo-ago = { $unit ->
        [now] gerade eben
        [min] vor { $count } Min.
        [h] vor { $count } Std.
       *[d] vor { $count } T.
    }
weavero-undo-row-reach = { $dir ->
        [undo] { $count ->
            [0] Diesen Schritt rückgängig machen
            [one] Diesen Schritt und { $count } zugehörigen Schritt rückgängig machen
           *[other] Diesen Schritt und { $count } zugehörige Schritte rückgängig machen
        }
       *[redo] { $count ->
            [0] Diesen Schritt wiederholen
            [one] Diesen Schritt und { $count } zugehörigen Schritt wiederholen
           *[other] Diesen Schritt und { $count } zugehörige Schritte wiederholen
        }
    }
weavero-undo-row-tip =
    { $stack } – { $reach }
    Strg+Klick oder das Kästchen: abhaken
weavero-undo-row-tip-plain =
    { $reach }
    Strg+Klick oder das Kästchen: abhaken
weavero-undo-row-dependent = { $kind ->
        [reader] { $count ->
            [one] Der Schritt darüber hat dieselbe Anmerkung geändert
           *[other] Die Schritte darüber haben dieselben Anmerkungen geändert
        }
       *[other] { $count ->
            [one] Der Schritt darüber betraf dieselben Einträge
           *[other] Die Schritte darüber betrafen dieselben Einträge
        }
    }
weavero-undo-tick-tip = { $state ->
        [auto] { $dir ->
            [undo] Von Ihrer Auswahl benötigt: wird mit rückgängig gemacht
           *[redo] Von Ihrer Auswahl benötigt: wird mit wiederholt
        }
        [on] Abgehakt
       *[off] { $dir ->
            [undo] Abhaken, um mit anderen rückgängig zu machen
           *[redo] Abhaken, um mit anderen zu wiederholen
        }
    }
weavero-undo-show-older = { $count ->
        [one] { $count } älteren Schritt anzeigen
       *[other] { $count } ältere Schritte anzeigen
    }
weavero-undo-more = { $count } weitere
weavero-undo-run-selected = { $dir ->
        [undo] { $count } ausgewählte rückgängig machen
       *[redo] { $count } ausgewählte wiederholen
    }
weavero-undo-run-tip = { $dir ->
        [undo] Alle abgehakten Schritte der Reihe nach rückgängig machen
       *[redo] Alle abgehakten Schritte der Reihe nach wiederholen
    }

# ---- Reader: comment popup, badges, standalone reader windows (reader.ts) ----
weavero-reader-copy-url = Kopieren
weavero-reader-copy-url-tip = URL in die Zwischenablage kopieren
weavero-reader-comment-extra-links = Weitere Links im Kommentar:
weavero-reader-open-comment-tip = Kommentar öffnen
weavero-reader-am-add-comment = Kommentar hinzufügen…
weavero-reader-move-to-tab-tip = Diesen Reader in einen Tab des Zotero-Hauptfensters verschieben
weavero-reader-newtab = Neuer Tab
weavero-reader-newtab-tip = Neuer Tab – einen Bibliothekseintrag öffnen ({ $shortcut })
weavero-reader-tablist-settings = Einstellungen des Tab-Menüs
weavero-reader-tablist-filetype-tip = Tabs nach Dateityp des Anhangs filtern. Im Popup klicken zum Filtern, Alt+Klick zum Ausschließen.
weavero-reader-window-minimize = Minimieren
weavero-reader-window-maximize = Maximieren
weavero-reader-window-restore = Wiederherstellen
weavero-reader-window-close = Schließen
weavero-reader-app-menu = Anwendungsmenü öffnen
weavero-reader-convert-last-main-window = Dies ist das letzte Hauptfenster. Öffnen Sie zuerst ein weiteres Hauptfenster und wandeln Sie dann dieses um.
weavero-reader-convert-no-documents = Keine Dokument-Tabs zum Verschieben – ein Reader-Fenster benötigt mindestens einen geöffneten PDF-, EPUB- oder Snapshot-Tab.

# ---- Related items popup in the reader (reader.ts) ----
weavero-related-add-label = Verwandten Eintrag hinzufügen
weavero-related-add-tip = Verwandten Eintrag hinzufügen…
weavero-related-empty = Keine verwandten Einträge.
weavero-related-remove = Entfernen
weavero-related-different-libraries = Einträge aus verschiedenen Bibliotheken können nicht miteinander verknüpft werden.

# ---- Notes: note tabs in reader windows, link editor (reader.ts, note-editor.ts) ----
weavero-note-tab-fallback-title = Notiz
weavero-note-link-edit-text = Text
weavero-note-link-edit-url = URL
weavero-note-link-edit-apply = Anwenden

# ---- Note outline (note-nav.ts) ----
weavero-notenav-title = Gliederung
weavero-notenav-filter = Überschriften filtern
weavero-notenav-toggle = Gliederung umschalten
weavero-notenav-empty = Keine Überschriften in dieser Notiz.
weavero-notenav-no-match = Keine Überschriften passen zur Suche.
weavero-notenav-heading-link-readonly = Diese Notiz ist schreibgeschützt, daher kann ihre Überschrift keinen Linkanker erhalten.
weavero-notenav-heading-missing = Die Überschrift, auf die dieser Link verweist, ist nicht mehr in der Notiz.

# ---- List All Tabs: libraries, filters, settings (tabs.ts) ----
weavero-tabs-tab-count = { $count ->
        [one] { $count } Tab
       *[other] { $count } Tabs
    }
weavero-tabs-annotation-count = { $count ->
        [one] { $count } Anmerkung
       *[other] { $count } Anmerkungen
    }
weavero-tabs-library-other = Sonstige
weavero-tabs-library-fallback = Bibliothek { $id }
weavero-tabs-library-unnamed = Bibliothek
weavero-tabs-library-tick = Klicken, um auf diese Bibliothek zu filtern, Alt+Klick zum Ausschließen. Erneut klicken zum Zurücksetzen.
weavero-tabs-filetype-button = Tabs nach Dateityp des Anhangs filtern. Im Popup klicken zum Filtern, Alt+Klick zum Ausschließen.
weavero-tabs-settings-button = Einstellungen des Tab-Menüs
weavero-tabs-filter-clear = Filter leeren
weavero-tabs-filter-hint = Alt+Klick zum Ausschließen
weavero-tabs-filter-clear-all = Zurücksetzen
    .title = Alle Tab-Filter zurücksetzen (dieses Fenster bleibt geöffnet)
    .aria-label = Alle Tab-Filter zurücksetzen
weavero-tabs-filter-clear-close = Zurücksetzen und schließen
weavero-tabs-filetype-option = { $type } – klicken zum Einschließen, Alt+Klick zum Ausschließen.
weavero-tabs-filetype-note = Notiz
weavero-tabs-library-chip = { $name } – klicken, um nur diese Bibliothek anzuzeigen, Alt+Klick zum Ausschließen.
weavero-tabs-settings-sort-by-library = Tabs nach Bibliothek sortieren
weavero-tabs-settings-annotation-count = Anzahl der Anmerkungen anzeigen

# ---- Windows: names, Manage Window, rename (tabs.ts, sessions.ts) ----
weavero-window-default-name = Fenster { $number }
weavero-window-reader-default-name = Reader-Fenster
weavero-window-reader-default-name-numbered = Reader-Fenster { $number }
weavero-window-anchor-name = { $name } (Anker)
weavero-window-count = { $count ->
        [one] { $count } Fenster
       *[other] { $count } Fenster
    }
weavero-window-editor-title = Fenster verwalten
weavero-window-editor-kind = { $kind ->
        [reader] Reader-Fenster
        [anchor] Hauptfenster (Anker)
       *[main] Hauptfenster
    }
weavero-window-editor-active = Aktiv
weavero-window-editor-name = Name
weavero-window-editor-reset = Standardnamen verwenden ({ $name })
weavero-window-rename-title = Fenster umbenennen
weavero-window-rename-default-title = Umbenennen
weavero-window-rename-ok = OK
weavero-window-save-no-tabs = Dieses Fenster hat keine Tabs zum Speichern.
weavero-window-save-last-main = Dies ist das letzte Hauptfenster – öffnen Sie zuerst ein weiteres Hauptfenster und speichern Sie dann dieses.
weavero-window-save-no-documents = Dieses Fenster hat keine Dokument-Tabs zum Speichern.
weavero-window-move-no-tabs = Dieses Fenster hat keine Tabs zum Verschieben.
weavero-window-move-last-main = Dies ist das letzte Hauptfenster – es kann nicht in eine andere Sitzung verschoben werden.
weavero-window-move-no-documents = Dieses Fenster hat keine Dokument-Tabs zum Verschieben.

# ---- Saved windows (tabs.ts) ----
weavero-savedwin-header = Gespeicherte Fenster
weavero-savedwin-reopen = Dieses gespeicherte Fenster wieder öffnen
weavero-savedwin-remove-tab = Diesen Tab aus dem gespeicherten Fenster entfernen
weavero-savedwin-default-name = { $kind ->
        [reader] Reader-Fenster
       *[main] Fenster
    }
weavero-savedwin-rename-title = Gespeichertes Fenster umbenennen
weavero-savedwin-reopen-gone = Keines der Dokumente dieses gespeicherten Fensters existiert mehr.
weavero-savedwin-reopen-notes-only = Dieses gespeicherte Fenster enthält nur Notizen – ein Reader-Fenster benötigt mindestens einen Dokument-Tab.

# ---- Tab sessions (sessions.ts) ----
weavero-session-default-name = Sitzung { $date }
weavero-session-unnamed = Sitzung
weavero-session-dot = S
weavero-session-current = Aktuelle Sitzung
weavero-session-current-tip = Rechtsklick, um diese Sitzung umzubenennen
weavero-session-created = Erstellt: { $date }
weavero-session-last-used = Zuletzt verwendet: { $date }
weavero-session-header = Sitzungen
weavero-session-sort-button = Sitzungen sortieren
weavero-session-sort-direction = { $order } (klicken zum Umkehren)
weavero-session-sort-order = { $order ->
        [oldest] Älteste zuerst
        [newest] Neueste zuerst
        [az] A bis Z
        [za] Z bis A
        [leastRecent] Am längsten unbenutzte zuerst
        [mostRecent] Zuletzt verwendete zuerst
        [ascending] Aufsteigend
       *[descending] Absteigend
    }
weavero-session-new = Neue Sitzung
    .title = Einen frischen, leeren Arbeitsbereich als neue Sitzung öffnen (die aktuelle Sitzung bleibt unten gespeichert)
weavero-session-row-current = Aktuelle Sitzung – wird automatisch aktualisiert, wenn Sie Tabs öffnen und schließen
weavero-session-row-switch = Zu dieser Sitzung wechseln
weavero-session-twisty = { $state ->
        [expanded] Einklappen
       *[collapsed] Tabs anzeigen
    }
weavero-session-untitled = Unbenannte Sitzung
weavero-session-date-line = { $sort ->
        [created] Erstellt { $date }
       *[lastUsed] Zuletzt verwendet { $date }
    }
weavero-session-tab-untitled = Ohne Titel
weavero-session-auto-tag = automatisch
weavero-session-rename-title = Sitzung umbenennen
weavero-session-rename-label = Sitzungsname:
weavero-session-delete-title = Sitzung löschen
weavero-session-delete-confirm = Die gespeicherte Sitzung „{ $name }“ löschen?
weavero-session-remove-window-confirm = { $count ->
        [one] Dieses Fenster ({ $count } Tab) aus „{ $name }“ entfernen?
       *[other] Dieses Fenster ({ $count } Tabs) aus „{ $name }“ entfernen?
    }

# ---- Tab groups (tab-groups.ts) ----
weavero-tabgroup-move-new-reader-window = In neues Reader-Fenster verschieben
weavero-tabgroup-move-new-group-reader-window = In eine neue Gruppe in einem neuen Reader-Fenster verschieben
weavero-tabgroup-move-new-main-window = In neues Hauptfenster verschieben
weavero-tabgroup-move-new-group-main-window = In eine neue Gruppe in einem neuen Hauptfenster verschieben
weavero-tabgroup-new-reader-window = Neues Reader-Fenster
weavero-tabgroup-new-main-window = Neues Hauptfenster
weavero-tabgroup-unnamed-short = Gruppe
weavero-tabgroup-unnamed = Unbenannte Gruppe
weavero-tabgroup-rename-title = Tab-Gruppe umbenennen
weavero-tabgroup-rename-placeholder = Gruppenname
weavero-tabgroup-name-placeholder = Beispiel: Literaturrecherche
weavero-tabgroup-status = { $state ->
        [active] Aktiv
       *[saved] Gespeichert
    }
weavero-tabgroup-home-window = in { $name }
weavero-tabgroup-color = { $color ->
        [purple] Lila
        [cyan] Cyan
        [orange] Orange
        [yellow] Gelb
        [pink] Pink
        [green] Grün
        [gray] Grau
        [red] Rot
       *[blue] Blau
    }
weavero-tabgroup-saved-header = Gespeicherte Tab-Gruppen
weavero-tabgroup-reopen = Diese gespeicherte Gruppe wieder öffnen

## ---- Added at the merge of refs, l10n and notecite into main (2026-11-20):
## references in your library, the split corner's Close Tab, the default
## attachment's marks, citations after Zotero links in notes.

weavero-pref-relations-references =
    .label = In den Zitations-Popups eines PDFs die Referenzen markieren, die Sie haben
weavero-pref-relations-references-desc = Wenn Sie mit dem Mauszeiger über eine Zitation im Text fahren, listet Zotero die Referenzen auf, auf die sie verweist. Jede Referenz, die ein Eintrag in einer Ihrer Bibliotheken ist, erhält eine Markierung – ● mit PDF, ○ ohne – und Schaltflächen, um ihr PDF in einem neuen Tab, in einem neuen Fenster oder neben dem Artikel zu öffnen, den Sie gerade lesen (geteilte Ansicht: dieser Artikel ist auf seiner Seite gesperrt). ⋯ zeigt sie in der Bibliothek an, öffnet ihre Kopie in einer anderen Bibliothek oder kopiert ihren Link. Referenzen werden über DOI, Titel oder Band und erste Seite gefunden, nur in den Bibliotheken dieses Computers: Nichts geht online, und nichts wird in Ihren Bibliotheken geändert.
weavero-pref-relations-references-marks =
    .label = Die Einträge des Literaturverzeichnisses markieren
weavero-pref-relations-references-marks-desc = Eine kleine Markierung am Rand neben jedem Eintrag des Literaturverzeichnisses, den Sie haben; klicken Sie darauf, um die Referenz zu öffnen, sie in der Bibliothek anzuzeigen oder ihren Link zu kopieren. In der Leseansicht nicht angezeigt.
weavero-pref-relations-references-section =
    .label = Abschnitt „Referenzen“ im Eintragsbereich des Readers
weavero-pref-relations-references-section-desc = Das Literaturverzeichnis des Artikels in der Reihenfolge des Dokuments, mit denselben Markierungen und Schaltflächen und der Angabe, wie viele seiner Referenzen Sie haben; zeigen Sie alles oder nur das an, was Sie haben. Klicken Sie auf eine Referenz, um sie im PDF zu sehen.
weavero-pref-relations-references-citedby =
    .label = Abschnitt „Zitiert von“ im Eintragsbereich
weavero-pref-relations-references-citedby-desc = Die Artikel Ihrer Bibliotheken, deren Literaturverzeichnis den Eintrag zitiert, mit ihrer Anzahl. Weavero liest die Literaturverzeichnisse Ihrer PDFs im Hintergrund, aus dem, was Zotero neben jeder PDF speichert (dem Volltextindex und der Struktur der PDFs, die Sie im Reader von Zotero geöffnet haben). Klicken Sie auf einen Artikel, um ihn an seiner Referenz auf den Eintrag zu öffnen. Nichts geht über das Internet, und in Ihren Bibliotheken wird nichts geändert.
# Build Zotero's structure data for all PDFs (modules/sdt-build.ts, citations M5).
weavero-pref-relations-references-sdt-build =
    .label = Zoteros Strukturdaten für alle PDFs erstellen
weavero-pref-relations-references-sdt-build-desc = Zotero erstellt die Strukturdaten eines PDFs, einschließlich seines Literaturverzeichnisses, wenn Sie das PDF in seinem Reader öffnen. Diese Option lässt Zotero sie für jedes PDF Ihrer Bibliotheken im Hintergrund erstellen, eines nach dem anderen, die zuletzt hinzugefügten zuerst, damit Literatur und Zitiert von die genauen Listen lesen. Das geschieht nur, während Sie den Computer nicht benutzen, und was Sie öffnen, wartet nie darauf. Standardmäßig aus: In einer großen Bibliothek kostet es Stunden an Arbeit, verteilt auf die Zeiten, in denen Sie nicht da sind, und etwas Speicherplatz, was Sie vor dem Start sehen.
weavero-sdt-build-warn-title = Die Strukturdaten aller Ihrer PDFs erstellen?
weavero-sdt-build-warn-intro =
    { $count ->
        [0] Jedes PDF Ihrer Bibliotheken hat bereits seine Strukturdaten. Zotero erstellt sie für die PDFs, die Sie hinzufügen, eines nach dem anderen.
        [one] Zotero erstellt die Strukturdaten von { $count } PDF, das noch keine hat, als ob Sie es einmal in Zoteros Reader öffneten.
       *[other] Zotero erstellt die Strukturdaten der { $count } PDFs, die noch keine haben, als ob Sie jedes davon einmal in Zoteros Reader öffneten: eines nach dem anderen, die zuletzt hinzugefügten zuerst.
    }
weavero-sdt-build-warn-time = Zeit: etwa { $time } Arbeit im Hintergrund. Sie läuft nur, während Sie den Computer nicht benutzen (eine Minute ohne Tastatur und Maus), und verteilt sich daher auf diese Zeiten; während sie läuft, ist ein Prozessorkern ausgelastet. Was Sie in Zotero öffnen, wartet nie darauf. Nach einem Neustart geht sie weiter.
weavero-sdt-build-warn-disk = Speicher: etwa { $disk } mehr, in einer Datei neben jedem PDF.
weavero-sdt-build-warn-sync = Nichts wird synchronisiert oder hochgeladen: Jeder Computer erstellt seine eigenen.
weavero-sdt-build-warn-cache = Es ist Zoteros eigener Cache (.zotero-sdt-cache), derselbe, als ob Sie jedes PDF einmal öffneten. Die Dateien können jederzeit gelöscht werden; Zotero erstellt eine neu, wenn es dieses PDF öffnet.
weavero-sdt-build-warn-ok = Erstellen
weavero-sdt-build-dur =
    { $unit ->
        [minutes] { $lo }–{ $hi } Minuten
        [days] { $lo }–{ $hi } Tage
       *[hours] { $lo }–{ $hi } Stunden
    }
weavero-sdt-build-dur-one =
    { $unit ->
        [minutes] { $n ->
            [0] { $n } Minuten
            [one] { $n } Minute
           *[other] { $n } Minuten
        }
        [days] { $n ->
            [0] { $n } Tage
            [one] { $n } Tag
           *[other] { $n } Tage
        }
       *[hours] { $n ->
            [0] { $n } Stunden
            [one] { $n } Stunde
           *[other] { $n } Stunden
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
weavero-sdt-build-status-counting = Ihre PDFs werden gezählt: { $done } von { $total }…
weavero-sdt-build-status-run =
    { $wait ->
        [reader] Wartet, während ein PDF geöffnet wird: { $done } von { $total } PDFs, noch etwa { $left }.
        [busy] Wartet, während Zotero ein anderes PDF liest: { $done } von { $total } PDFs, noch etwa { $left }.
        [memory] Wartet bei wenig Arbeitsspeicher: { $done } von { $total } PDFs, noch etwa { $left }.
        [active] Wartet, während Sie den Computer benutzen: { $done } von { $total } PDFs, noch etwa { $left }.
       *[none] Wird erstellt: { $done } von { $total } PDFs, noch etwa { $left }.
    }
weavero-sdt-build-status-start = Wartet auf den Start.
weavero-sdt-build-status-paused = Pausiert.
weavero-sdt-build-status-done =
    { $failed ->
        [0] Fertig: Jedes PDF hat seine Strukturdaten.
       *[other] Fertig: Jedes PDF hat seine Strukturdaten, bis auf { $failed }, die Zotero nicht lesen konnte.
    }
weavero-sdt-build-status-zotero = Zotero erstellt die Strukturdaten Ihrer PDFs selbst.
weavero-sdt-build-pause = Pausieren
weavero-sdt-build-resume = Fortsetzen
weavero-sdt-build-stop = Beenden
# Remove Built Data (modules/sdt-build.ts): see en-US.
weavero-pref-relations-references-sdt-clean-desc = Die Strukturdaten, die Zotero neben Ihren Dokumenten aufbewahrt, und die Caches, die Weavero aus Ihren Bibliotheken erstellt, darunter der „Zitiert von“-Index, belegen Speicherplatz. Beim Entfernen geht nichts verloren: Sie werden bei Bedarf neu erstellt. Ihre eigenen Daten bleiben unverändert.
weavero-sdt-clean-measuring = Die erstellten Daten werden gemessen…
weavero-sdt-clean-size =
    { $index ->
        [yes] { $count ->
            [0] Erstellte Daten: { $size }, der „Zitiert von“-Index.
            [1] Erstellte Daten: { $size }, die Strukturdaten von { $count } Dokument und der „Zitiert von“-Index.
           *[other] Erstellte Daten: { $size }, die Strukturdaten von { $count } Dokumenten und der „Zitiert von“-Index.
        }
       *[no] { $count ->
            [0] Erstellte Daten: { $size }.
            [1] Erstellte Daten: { $size }, die Strukturdaten von { $count } Dokument.
           *[other] Erstellte Daten: { $size }, die Strukturdaten von { $count } Dokumenten.
        }
    }
weavero-sdt-clean-button = Erstellte Daten entfernen…
weavero-sdt-clean-running = Die erstellten Daten werden entfernt: { $done } von { $total } Dokumenten…
weavero-sdt-clean-done =
    { $count ->
        [0] Erstellte Daten entfernt: { $size }.
        [1] Erstellte Daten entfernt: { $size }, darunter die Strukturdaten von { $count } Dokument.
       *[other] Erstellte Daten entfernt: { $size }, darunter die Strukturdaten von { $count } Dokumenten.
    }
weavero-sdt-clean-done-failed =
    { $failed ->
        [1] Erstellte Daten entfernt: { $size }. { $failed } Datei konnte nicht entfernt werden: Vielleicht verwendet sie ein anderes Programm. Versuchen Sie es später erneut.
       *[other] Erstellte Daten entfernt: { $size }. { $failed } Dateien konnten nicht entfernt werden: Vielleicht verwendet sie ein anderes Programm. Versuchen Sie es später erneut.
    }
weavero-sdt-clean-warn-title = Die erstellten Daten entfernen?
weavero-sdt-clean-warn-intro =
    { $count ->
        [0] { $size } an Daten, die aus Ihren Bibliotheken erstellt wurden, werden entfernt: die Caches von Weavero, darunter der „Zitiert von“-Index.
        [1] { $size } an Daten, die aus Ihren Bibliotheken erstellt wurden, werden entfernt: die Strukturdaten von { $count } Dokument (Zoteros eigene Datei .zotero-sdt-cache) und die daraus erstellten Caches von Weavero, darunter der „Zitiert von“-Index.
       *[other] { $size } an Daten, die aus Ihren Bibliotheken erstellt wurden, werden entfernt: die Strukturdaten von { $count } Dokumenten (Zoteros eigene Dateien .zotero-sdt-cache) und die daraus erstellten Caches von Weavero, darunter der „Zitiert von“-Index.
    }
weavero-sdt-clean-warn-back = Nichts geht verloren: Zotero erstellt die Strukturdaten eines Dokuments neu, wenn Sie es in seinem Reader öffnen, oder für jedes PDF mit „Zoteros Strukturdaten für alle PDFs erstellen“, und „Zitiert von“ erstellt seinen Index im Hintergrund neu.
weavero-sdt-clean-warn-off = „Zoteros Strukturdaten für alle PDFs erstellen“ wird ausgeschaltet.
weavero-sdt-clean-warn-kept = Ihre eigenen Daten bleiben unverändert: die von Ihnen bearbeiteten Gliederungen, Lesezeichen, Tab-Gruppen und Sitzungen, Forschende und die Feed-Einstellungen.
weavero-sdt-clean-warn-ok = Entfernen
weavero-menu-split-close-tab =
    .label = Tab schließen
weavero-refs-act-tab =
    .title = In neuem Tab öffnen
weavero-refs-act-window =
    .title = In neuem Fenster öffnen
weavero-refs-act-split =
    .title = In geteilter Ansicht öffnen
weavero-refs-act-library =
    .title = In Bibliothek anzeigen
weavero-refs-act-more =
    .title = Mehr
weavero-menu-refs-show-in =
    .label = In { $library } anzeigen
weavero-refs-bibmark =
    .title = { $where ->
        [other] { $others ->
            [0] Nur in { $library }
            [1] Nur in { $library } und einer anderen Bibliothek
           *[other] Nur in { $library } und { $others } anderen Bibliotheken
        }
       *[here] In Ihrer Bibliothek ({ $library })
    }, { $pdf ->
        [yes] { $file ->
            [epub] mit EPUB
           *[pdf] mit PDF
        }.{ "\u000A" }Klicken für Details und wo es geöffnet wird.
       *[no] ohne PDF.{ "\u000A" }Klicken für Details.
    }
weavero-menu-refs-open-short =
    .label = { $where ->
        [window] In neuem Fenster öffnen
        [split] In geteilter Ansicht öffnen
       *[tab] In neuem Tab öffnen
    }{ $from ->
        [other] { " (" }{ $library })
       *[here] { "" }
    }
weavero-menu-refs-children =
    .label = Anhänge und Notizen
weavero-menu-refs-attachments =
    .label = { $count ->
        [one] Anhang
       *[other] Anhänge
    }
weavero-menu-refs-notes =
    .label = { $count ->
        [one] Notiz
       *[other] Notizen
    }
weavero-refs-att-missing = Datei nicht gefunden
weavero-refs-header =
    .label = { $state ->
        [counted] { $total ->
            [one] { $total } Referenz
           *[other] { $total } Referenzen
        }
       *[none] Referenzen
    }
weavero-refs-sidenav =
    .tooltiptext = Referenzen
weavero-refs-sec-fulltext = Aus dem Volltext des PDFs. Öffnen Sie das PDF für die genaue Liste.
weavero-refs-web-tip =
    .title = { $how ->
        [link] Nicht in Ihren Bibliotheken.{ "\u000A" }Klicken, um sie im Browser zu öffnen: { $url }
       *[lookup] Nicht in Ihren Bibliotheken.{ "\u000A" }Klicken, um sie online nachzuschlagen (Crossref, sonst eine Suche in Google Scholar).
    }
weavero-citedby-header =
    .label = { $state ->
        [counted] { $count ->
            [one] { $count } zitierende Arbeit
           *[other] { $count } zitierende Arbeiten
        }
       *[none] Zitiert von
    }
weavero-citedby-sidenav =
    .tooltiptext = Zitiert von
weavero-citedby-row = { $title }
    Klicken, um diesen Artikel an seiner Referenz auf den Eintrag zu öffnen.
weavero-citedby-building = Die Literaturverzeichnisse Ihrer PDFs werden noch gelesen: { $done } von { $total }…
weavero-citedby-more = { $count } weitere anzeigen
weavero-citedby-also = auch in { $libraries }
weavero-citedby-also-label = Auch in
weavero-lf-toggle =
    .tooltiptext = Suchen
weavero-lf-filter-toggle =
    .tooltiptext = Sortieren und filtern
weavero-lf-placeholder =
    .placeholder = { $kind ->
        [references] { $count ->
            [one] { $count } Referenz durchsuchen…
           *[other] { $count } Referenzen durchsuchen…
        }
        [citedBy] { $count ->
            [one] { $count } Arbeit durchsuchen…
           *[other] { $count } Arbeiten durchsuchen…
        }
       *[other] { $count } Zeilen durchsuchen…
    }
weavero-lf-count = { $shown } von { $total }
weavero-lf-busy = Wird gefiltert…
weavero-lf-sort-short = { $field ->
        [paper] Reihenfolge im Artikel
        [year] Jahr
        [cited] Zitierungen
        [title] Titel
        [author] Erstautor
       *[added] Hinzugefügt am
    }
weavero-lf-sort-button =
    .title = Sortierung
weavero-lf-sort-heading =
    .label = Sortieren nach
weavero-lf-sort =
    .label = { $field ->
        [paper] Reihenfolge im Artikel
        [year] Jahr
        [cited] Zitierungen in Ihren Bibliotheken
        [title] Titel
        [author] Erstautor
       *[added] Hinzugefügt am
    }
weavero-lf-sort-dir =
    .title = { $order ->
        [newest] Neueste zuerst
        [oldest] Älteste zuerst
        [most] Meistzitierte zuerst
        [least] Am wenigsten zitierte zuerst
        [az] A bis Z
       *[za] Z bis A
    }
weavero-lf-chip = { $chip ->
        [since] Seit { $year }
        [pdf] Mit PDF
        [in] In der Bibliothek
       *[out] Nicht in der Bibliothek
    }
weavero-lf-chip-tip =
    .title = { $on ->
        [yes] Klicken, um wieder alle anzuzeigen
       *[no] Klicken, um nur diese anzuzeigen
    }
weavero-lf-none = { $kind ->
        [references] Keine Referenz entspricht dem Filter.
        [citedBy] Keine Arbeit entspricht dem Filter.
       *[other] Nichts entspricht dem Filter.
    }
weavero-refs-chip =
    .title = { $kind ->
        [pdf] In Ihrer Bibliothek, mit PDF oder EPUB: { $count }
        [nopdf] In Ihrer Bibliothek, ohne PDF: { $count }
        [away] Nur in einer anderen Bibliothek als der dieses Artikels: { $count }
       *[web] Nicht in Ihren Bibliotheken: { $count }
    }
weavero-refs-act-web-busy =
    .title = Referenz wird online gesucht…
weavero-menu-refs-web =
    .label = Im Browser öffnen
weavero-refs-card-et-al = et al.
weavero-refs-card-library = { $where ->
        [other] Nur in { $library }
       *[here] In { $library }
    }
weavero-refs-card-library-more = { $where ->
        [other] Nur in { $library } und { $others }
       *[here] In { $library } und { $others }
    }
weavero-refs-card-library-others = { $count } anderen Bibliotheken
weavero-refs-libname = “{ $name }”
weavero-refs-uncertain = Mehrere Einträge in Ihren Bibliotheken könnten diese Referenz sein; Weavero zeigt den ersten:
weavero-refs-uncertain-item = { $year ->
        [none] “{ $title }” ({ $type })
       *[other] “{ $title }” ({ $type }, { $year })
    }
weavero-refs-card-more = Mehr
weavero-refs-card-less = Weniger
weavero-refs-card-image =
    .title = { $title }: zum Öffnen klicken
weavero-defatt-mark-pick =
    .title = Standardanhang: öffnet sich per Doppelklick
weavero-defatt-mark-auto =
    .title = Automatische Wahl: was Zotero öffnet, wenn kein Standard festgelegt ist
weavero-pref-notes-citations =
    .label = Zitationen nach Zotero-Links in Notizen
weavero-pref-notes-citations-desc = Klicken Sie mit der rechten Maustaste auf einen <code data-l10n-name="scheme">zotero://</code>-Link in einer Notiz und wählen Sie <em>Zitation nach Link hinzufügen</em>: Der Link bleibt, und Zoteros eigene Zitation des Eintrags folgt ihm. Ein Link auf eine PDF-Seite zitiert den übergeordneten Eintrag des PDFs auf dieser Seite (die gedruckte Seite einer Anmerkung darauf, falls vorhanden); ein Link auf eine Hervorhebung oder Unterstreichung fügt ihren Text und ihre Zitation hinzu, so wie wenn Sie die Anmerkung in die Notiz ziehen. <em>Zitationen nach Links in der Auswahl hinzufügen</em> und <em>Zitationen nach allen Links hinzufügen</em> erledigen mehrere auf einmal; ein einziges Rückgängig nimmt sie alle zurück. Die Zitationen sind die von Zotero: Sie werden synchronisiert und lesen sich ohne Weavero genauso. Links auf Notizen, auf Dateien ohne übergeordneten Eintrag und auf eine andere Bibliothek bleiben, wie sie sind. Benötigt <em>Links &amp; Beziehungen → Notizen: Editor</em>.
weavero-menu-note-cite-link =
    .label = Zitation nach Link hinzufügen
weavero-menu-note-cite-sel =
    .label = Zitationen nach Links in der Auswahl hinzufügen ({ $n })
weavero-menu-note-cite-all =
    .label = Zitationen nach allen Links hinzufügen ({ $n })
weavero-note-cite-why-readonly = Diese Notiz ist schreibgeschützt.
weavero-note-cite-why-noitem = Dieser Link verweist auf keinen Eintrag.
weavero-note-cite-why-note = Eine Notiz kann nicht zitiert werden.
weavero-note-cite-why-nolibrary = Die verlinkte Bibliothek ist nicht in diesem Zotero.
weavero-note-cite-why-otherlibrary = Eine Notiz zitiert nur Einträge ihrer eigenen Bibliothek, wie Zoteros „Zitation hinzufügen“.
weavero-note-cite-why-missing = Der verlinkte Eintrag ist nicht in der Bibliothek.
weavero-note-cite-why-noparent = Eine Datei ohne übergeordneten Eintrag kann nicht zitiert werden.
weavero-note-cite-why-notcitable = Dieser Eintrag kann nicht zitiert werden.
weavero-note-cite-why-cited = Bereits direkt nach dem Link zitiert.

## Feeds (modules/feeds.ts): Spalte Relevanz, Abschnitt „Warum relevant“,
## Markierung und Filter „in Ihrer Bibliothek“, Einstellungen -> Weavero -> Feeds.

weavero-feeds-col = Relevanz
weavero-feeds-libcol = In der Bibliothek
weavero-feeds-header =
    .label = Warum relevant
weavero-feeds-sidenav =
    .tooltiptext = Warum relevant
weavero-feeds-inlib-tip = Bereits in Ihrer Bibliothek
weavero-feeds-inlib = Bereits in Ihrer Bibliothek
weavero-feeds-card-tip = Bereits in { $library } — klicken für die Karte
weavero-feeds-score = Relevanz { $score }
weavero-feeds-scoring = Noch nicht bewertet…
weavero-feeds-related = Verwandt, in Ihrer Bibliothek
weavero-feeds-reason-lib = { $count ->
        [0] Nahe an Artikeln Ihrer Bibliothek
        [one] Nahe an { $count } Artikel Ihrer Bibliothek
       *[other] Nahe an { $count } Artikeln Ihrer Bibliothek
    }
weavero-feeds-reason-near-row = { $level ->
        [strong] Sehr nahe an einem Artikel Ihrer Bibliothek
        [moderate] Nahe an einem Artikel Ihrer Bibliothek
       *[weak] Entfernt verwandt mit einem Artikel Ihrer Bibliothek
    }
weavero-feeds-reason-own-row = Nahe an einem Ihrer Artikel
weavero-feeds-reltag-near = { $level ->
        [strong] Sehr nahe
        [moderate] Nahe
       *[weak] Entfernt verwandt
    }
weavero-feeds-reltag-own = Ihr Artikel
weavero-feeds-relscore-tip = Textnähe zu diesem Feed-Eintrag (0 bis 99)
weavero-feeds-reason-author = Autoren in Ihrer Bibliothek: { $names }
weavero-feeds-reason-followed = Gefolgter Autor: { $names }
weavero-feeds-reason-alert = Alarm: { $queries }
weavero-feeds-reason-journal = { $count ->
        [one] Eine Zeitschrift, die Sie lesen: { $journal } ({ $count } Artikel)
       *[other] Eine Zeitschrift, die Sie lesen: { $journal } ({ $count } Artikel)
    }
weavero-ga-header =
    .label = Grafische Zusammenfassung
weavero-ga-sidenav =
    .tooltiptext = Grafische Zusammenfassung
weavero-ga-failed = Das Bild konnte nicht geladen werden.
weavero-ga-open =
    .title = Klicken, um das Bild in voller Größe zu sehen
weavero-ga-close =
    .title = Zum Schließen klicken oder Esc drücken
weavero-filter-dim-feed-not-in-library = Nicht in Ihrer Bibliothek
weavero-filter-feed-not-in-library-tip = Nicht in Ihrer Bibliothek – Feed-Einträge, die noch keine Ihrer Bibliotheken enthält (gleiche DOI, sonst gleicher Titel): Klicken, um die bereits vorhandenen auszublenden. Alt+Klick, um nur diese anzuzeigen.
weavero-pref-nav-feeds = Feeds
weavero-pref-feeds-title = Feeds
weavero-pref-feeds-enable =
    .aria-label = Relevanz in Feeds aktivieren
weavero-pref-feeds-desc = Eine Relevanzbewertung für jeden Eintrag Ihrer Zotero-Feeds, auf Ihrem Computer aus Ihren Bibliotheken berechnet: Nähe zu Ihren eigenen Artikeln und zu Ihrer Bibliothek, Autoren, von denen Sie bereits Artikel haben, die Autoren, denen Sie folgen, Ihre Stichwort-Alarme, die Zeitschriften, die Sie am meisten lesen – und bei einem Feed mit eigenen Bewertungen dessen eigene Bewertung und Gründe. Eine Spalte Relevanz sortiert die Feeds nach Relevanz (die anderen Spalten sortieren sie auch), ein Abschnitt „Warum relevant“ im Eintragsbereich nennt die Gründe und die verwandten Artikel Ihrer Bibliothek, und bereits vorhandene Einträge werden markiert. Ein Abschnitt „Grafische Zusammenfassung“ zeigt das Bild eines Feed-Eintrags für sich. Die Bewertungen werden ohne Internet berechnet, und in Ihren Bibliotheken wird nichts geändert; nur das Bild eines Feed-Eintrags wird beim Auswählen des Eintrags von seinem Verlag geladen, wie es Zoteros eigene Zusammenfassung tut.
weavero-pref-feeds-names-title = Ihr Name als Autor
weavero-pref-feeds-names-desc = Ein Name pro Zeile, als „Nachname, Vorname“ oder „Nachname, V.“ (Initialen genügen). Die Einträge von Meine Bibliothek mit einem dieser Namen unter ihren Autoren sind Ihre Artikel.
weavero-pref-feeds-names-count = { $count ->
        [0] Kein Eintrag von Meine Bibliothek hat einen dieser Namen als Autor.
        [one] { $count } Eintrag von Meine Bibliothek hat einen dieser Namen als Autor.
       *[other] { $count } Einträge von Meine Bibliothek haben einen dieser Namen als Autor.
    }
weavero-pref-feeds-followed-title = Gefolgte Autoren
weavero-pref-feeds-followed-desc = Ein Name pro Zeile. Ein Feed-Eintrag von einem von ihnen wird höher bewertet.
weavero-pref-feeds-alerts-title = Stichwort-Alarme
weavero-pref-feeds-alerts-desc = Ein Alarm pro Zeile, gesucht in Titel und Zusammenfassung: Jedes Wort muss vorkommen („bubble“ findet auch „bubbles“), ein Ausdruck in Anführungszeichen muss so vorkommen, wie er geschrieben ist, und ein Wort nach einem Minuszeichen (-review) darf nicht vorkommen.
weavero-pref-feeds-watched-title = Beobachtete Artikel
weavero-pref-feeds-watched-desc = Ein Titel oder eine DOI pro Zeile. Werden in die Alarmdatei (unten) geschrieben, für ein Programm, das nach neuen Artikeln sucht, die sie zitieren.
weavero-pref-feeds-cited-title = Zitationsalarme für eine Person
weavero-pref-feeds-cited-desc = Ein Name pro Zeile. Werden in die Alarmdatei (unten) geschrieben, für ein Programm, das nach neuen Artikeln sucht, die diese Person zitieren.
weavero-pref-feeds-journals =
    .label = Die Zeitschriften, die Sie am meisten lesen, zählen in der Bewertung
weavero-pref-feeds-journals-desc = Ein Feed-Eintrag aus einer Zeitschrift mit vielen Artikeln in Ihren Bibliotheken wird höher bewertet.
weavero-pref-feeds-export-title = Alarmdatei
weavero-pref-feeds-export-desc = „Alarmdatei exportieren“ schreibt diese Listen in den Datenordner von Weavero (feeds/alerts.json), als JSON-Datei, die ein Empfehlungsprogramm lesen kann; „Exportieren…“ schreibt sie an einen Ort Ihrer Wahl. Über eine vorhandene Alarmdatei geschrieben, bleibt erhalten, was ihr Programm zu einem Eintrag gefunden hat (seine OpenAlex-IDs). „Importieren…“ liest eine Liste von Google-Scholar-Alarmen oder eine Alarmdatei und fügt deren gefolgte Autoren, beobachtete Artikel, Zitationsalarme und Stichwort-Alarme diesen Listen hinzu.
weavero-pref-feeds-export = Alarmdatei exportieren
weavero-pref-feeds-export-as = Exportieren…
weavero-pref-feeds-import = Importieren…
weavero-feeds-export-as-title = Alarmdatei exportieren
weavero-feeds-import-title = Google-Scholar-Alarme importieren
weavero-pref-feeds-exported = Geschrieben: { $path }
weavero-pref-feeds-imported = { $count ->
        [0] Nichts Neues hinzuzufügen.
        [one] { $count } Eintrag hinzugefügt.
       *[other] { $count } Einträge hinzugefügt.
    }
weavero-pref-feeds-failed = Das hat nicht geklappt: { $error }

weavero-panelock-button-unlock =
    .tooltiptext = Fixierung lösen
    .aria-label = Fixierung lösen
weavero-panelock-menu-lock-top =
    .label = Oben fixieren
weavero-panelock-menu-lock =
    .label = Unten fixieren
weavero-panelock-menu-unlock =
    .label = Fixierung lösen

weavero-people-tab-title = Forschende
weavero-people-menu-show =
    .label = Bei Forschenden anzeigen
weavero-people-cmark-tip = { $name } ist unter Forschende. Klicken Sie, um die Seite zu öffnen.
weavero-people-cmark-tip-maybe = Wahrscheinlich { $name } unter Forschende (gleicher Nachname, gleiche Initialen). Klicken Sie, um die Seite zu öffnen.
weavero-people-tb-hide =
    .label = Schaltfläche „Forschende“ ausblenden
weavero-people-menu-add =
    .label = Zu Forschenden hinzufügen
weavero-people-search =
    .placeholder = Forschende suchen
weavero-people-chip-check = Zu prüfen
weavero-people-chip-followed = Gefolgt
weavero-people-chip-all = Alle
weavero-people-list-empty = Noch niemand. Fügen Sie eine Forscherin oder einen Forscher aus den Autoren eines Eintrags hinzu (Rechtsklick auf einen Autor im Abschnitt Info), oder erstellen Sie die Liste aus den Autoren, denen Sie folgen.
weavero-people-list-none = Niemand passt.
weavero-people-build = Aus gefolgten Autoren erstellen
weavero-people-build-tip = Ein Datensatz für jeden Autor, dem Sie folgen (Einstellungen → Feeds, und die Alarmdatei im Datenordner von Weavero), als „Zu prüfen“ markiert; danach wird jeder mit einem OpenAlex-Profil online nachgeschlagen, einer nach dem anderen.
weavero-people-build-file = Aus einer Datei…
weavero-people-build-file-tip = Dasselbe aus einer Alarmdatei, die Sie auswählen
weavero-people-build-file-title = Alarmdatei auswählen
weavero-people-build-stop = Anhalten
weavero-people-build-progress = Forschende werden nachgeschlagen: { $done } von { $total }…
weavero-people-build-done = Neu: { $added } · Jetzt gefolgt: { $followed } · Werden nachgeschlagen: { $queued }
weavero-people-build-none = Kein gefolgter Autor hinzuzufügen. Fügen Sie welche unter Einstellungen → Feeds hinzu, oder erstellen Sie die Liste aus einer Alarmdatei.
weavero-people-select = Wählen Sie links einen Eintrag aus.
weavero-people-refresh = Aktualisieren
weavero-people-refresh-tip = Schlägt diese Person in OpenAlex, ORCID, theses.fr, IdRef und Wikidata nach. Nur ihr Name und ihre Kennungen werden gesendet; nichts von Ihnen.
weavero-people-refreshing = Wird nachgeschlagen…
weavero-people-refreshed = { $count ->
        [0] Nichts Neues gefunden ({ $date }).
        [one] { $count } neuer Wert gefunden ({ $date }).
       *[other] { $count } neue Werte gefunden ({ $date }).
    }
weavero-people-error = { $source } war nicht erreichbar: { $error }.
weavero-people-theses-none = theses.fr hat keine Person dieses Namens mit dieser ORCID-iD.
weavero-people-follow = Folgen
weavero-people-followed = Gefolgt
weavero-people-mark-checked = Als geprüft markieren
weavero-people-mark-check = Als „Zu prüfen“ markieren
weavero-people-remove = Entfernen…
weavero-people-remove-title = Aus Forschenden entfernen
weavero-people-remove-confirm = { $name } aus Forschenden entfernen? Was Sie über die Person behalten, verworfen und geschrieben haben, geht mit.
weavero-people-added-from = Hinzugefügt aus: { $title }
weavero-people-no-ids = Noch keine Kennung. Aktualisieren findet diese Person über den Artikel, aus dem sie hinzugefügt wurde, oder listet die Profile mit ihrem Namen zur Auswahl auf.
weavero-people-no-profile = Kein OpenAlex-Profil trägt diesen Namen.
weavero-people-pick = { $count ->
        [one] Ein OpenAlex-Profil trägt diesen Namen. Ist es diese Person? Klicken Sie darauf, um es zu bestätigen.
       *[other] { $count } OpenAlex-Profile tragen diesen Namen. Welches ist diese Person? Klicken Sie darauf.
    }
weavero-people-cand-works = { $count ->
        [0] keine Werke
        [one] { $count } Werk
       *[other] { $count } Werke
    }
weavero-people-sec-ids = Kennungen
weavero-people-sec-facts = Angaben
weavero-people-sec-links = Verbindungen
weavero-people-sec-tree = Akademischer Stammbaum
weavero-people-sec-works = Veröffentlichungen
weavero-people-sec-notes = Notizen
# Researchers: dated events (MJT 2026-11-25). $where: the place; $field: date, what, where, link,
# note; $kind: seminar, visit, talk (a talk at a conference), jury; $what, $date: the event's.
weavero-people-sec-events = Ereignisse
weavero-people-event-add = Ereignis hinzufügen
weavero-people-events-none = Noch kein Ereignis: ein Seminar, ein Besuch, eine Prüfungskommission …
weavero-people-event-at = in { $where }
weavero-people-event-announcement = Ankündigung
weavero-people-event-remove = Entfernen
weavero-people-event-cancel = Abbrechen
weavero-people-event-field =
    { $field ->
        [date] Datum
        [what] Was
        [where] Wo
        [link] Link
       *[note] Notiz
    }
weavero-people-event-ph =
    { $field ->
        [date] 2026-11-25, 2026-11 oder 2026
        [what] Seminar, Besuch …
        [where] Ort oder Einrichtung
        [link] Adresse der Ankündigung
       *[note] Was festzuhalten ist
    }
weavero-people-event-kind =
    { $kind ->
        [seminar] Seminar
        [visit] Besuch
        [talk] Konferenzvortrag
       *[jury] Prüfungskommission
    }
weavero-people-event-bad-date = Geben Sie das Datum als 2026-11-25, 2026-11 oder 2026 an.
weavero-people-event-need-what = Geben Sie an, was das Ereignis war.
weavero-people-event-bad-link = Der Link muss eine Webadresse sein.
weavero-people-event-remove-confirm = Das Ereignis „{ $what }“ ({ $date }) entfernen?
# The researchers table (the centre pane with no researcher open). $col: name, institution, country,
# papers (their items in your libraries), phd (the year of their PhD).
weavero-people-back = Zurück zu den Forschenden
weavero-people-table-count =
    { $count ->
        [one] Eine forschende Person
       *[other] { $count } Forschende
    }
weavero-people-table-col =
    { $col ->
        [name] Name
        [institution] Einrichtung
        [country] Land
        [papers] Artikel in Ihren Bibliotheken
       *[phd] Promotion
    }
weavero-people-table-sort-tip = Nach dieser Spalte sortieren; erneut klicken zum Umkehren
# Researchers: the Contact card and the custom fields (MJT 2026-11-25). $kind: email, phone, address, web;
# $label: work, home, mobile (a phone), other; $field: kind, label, value -- and for the placeholders the
# kind, or custom (the user's own label); $why: why a value is refused; $what: the line removed.
weavero-people-sec-contact = Kontakt
weavero-people-contact-add = Kontaktdaten hinzufügen
weavero-people-contact-none = Noch keine E-Mail, Telefonnummer oder Adresse.
weavero-people-contact-kind =
    { $kind ->
        [email] E-Mail
        [phone] Telefon
        [address] Adresse
       *[web] Website
    }
weavero-people-contact-label =
    { $label ->
        [work] Arbeit
        [home] Privat
        [mobile] Mobil
       *[other] Sonstige
    }
weavero-people-contact-label-custom = Eigene Bezeichnung …
weavero-people-contact-field =
    { $field ->
        [kind] Art
        [label] Bezeichnung
       *[value] Wert
    }
weavero-people-contact-ph =
    { $field ->
        [email] name@beispiel.org
        [phone] +49 30 12345678
        [address] Straße, Ort, Land: mehrere Zeilen
        [web] Adresse der Website
       *[custom] Eine eigene Bezeichnung
    }
weavero-people-contact-map = Karte
weavero-people-contact-map-tip = Diese Adresse auf OpenStreetMap suchen (die Adresse wird an openstreetmap.org gesendet)
weavero-people-contact-bad =
    { $why ->
        [label] Geben Sie eine Bezeichnung an.
        [email] Das ist keine E-Mail-Adresse.
        [phone] Eine Telefonnummer besteht aus Ziffern, mit + ( ) - . / und Leerzeichen.
        [web] Das ist keine Webadresse.
       *[empty] Geben Sie einen Wert ein.
    }
weavero-people-sec-custom = Eigene Felder
weavero-people-custom-add = Eigenes Feld hinzufügen
weavero-people-custom-none = Noch kein eigenes Feld.
weavero-people-custom-field =
    { $field ->
        [label] Bezeichnung
       *[value] Wert
    }
weavero-people-custom-bad = Ein eigenes Feld braucht eine Bezeichnung und einen Wert.
weavero-people-card-remove-confirm = „{ $what }“ entfernen?
weavero-people-row-edit =
    .label = Bearbeiten
weavero-people-row-remove =
    .label = Entfernen
weavero-people-row-keep =
    .label = Behalten
weavero-people-row-reject =
    .label = Verwerfen
weavero-people-row-restore =
    .label = Wiederherstellen
# The researcher page's Edit pencil: on, every field shows (the empty ones with their Add).
weavero-people-page-edit = ✎ Bearbeiten
weavero-people-page-edit-tip = Alle Felder zeigen, die leeren mit ihrem Hinzufügen
weavero-people-sec-empty = Noch nichts bekannt. Bearbeiten (✎) zeigt alle Felder, um einen Wert hinzuzufügen.
weavero-people-add-researcher = Forschende hinzufügen
weavero-people-add-researcher-tip = Eine Person nach Namen hinzufügen: OpenAlex listet die Profile dieses Namens zur Auswahl (Netzwerk nur bei diesem Klick)
weavero-people-add-researcher-prompt = Name der Person (Vorname Nachname oder Nachname, Vorname):
# The "Suggested links" queue: every link a source suggested, for all researchers. $count: how many;
# $fact: the link kind (advisor, coadvisor, postdoc, lab, student, linked); $other: the linked researcher; $name: the researcher whose record holds the link.
weavero-people-queue-btn =
    { $count ->
        [0] Vorgeschlagene Verbindungen
       *[other] Vorgeschlagene Verbindungen ({ $count })
    }
weavero-people-queue-tip = Jede Verbindung, die eine Quelle vorgeschlagen hat und die Sie weder behalten noch verworfen haben, für alle Ihre Forschenden
weavero-people-queue-title = Vorgeschlagene Verbindungen
weavero-people-queue-count =
    { $count ->
        [1] 1 Verbindung zu prüfen
       *[other] { $count } Verbindungen zu prüfen
    }
weavero-people-queue-none = Keine vorgeschlagene Verbindung wartet auf Sie.
weavero-people-queue-q =
    { $fact ->
        [advisor] War { $other } Doktorvater oder Doktormutter von { $name }?
        [coadvisor] Hat { $other } die Promotion von { $name } mitbetreut?
        [postdoc] Hat { $other } { $name } als Postdoc aufgenommen?
        [lab] Hat { $other } im selben Labor wie { $name } gearbeitet?
        [student] Hat { $other } bei { $name } promoviert?
       *[linked] Ist { $other } mit { $name } verbunden?
    }
# Dates that do not fit in the academic family. $kind: advisor (an advisor's PhD not before the
# student's), years (the student's PhD outside the link's years); $advisor, $student: names; $ay, $sy:
# their PhD years; $years: the link's years, as the record writes them; $text: one issue in words.
weavero-people-date-issue =
    { $kind ->
        [advisor] Die Promotion von { $advisor } ({ $ay }) liegt nicht vor der von { $student } ({ $sy }), die sie oder er betreut hat.
       *[years] Die Promotion von { $student } ({ $sy }) liegt außerhalb der Jahre der Verbindung zu { $advisor } ({ $years }).
    }
weavero-people-date-title =
    { $count ->
        [1] 1 Datum zu prüfen
       *[other] { $count } Daten zu prüfen
    }
weavero-people-date-confirm-title = Ein Datum passt nicht
weavero-people-date-confirm = { $text } Diese Verbindung trotzdem hinzufügen?
# Possible duplicates: two records that may be one researcher. $count: how many; $reason: id-orcid,
# id-openalex, id-idref, id-wikidata, name, form, initials, institution; $name, $keep, $drop: names.
weavero-people-dupe-btn = Mögliche Duplikate ({ $count })
weavero-people-dupe-title =
    { $count ->
        [1] 1 mögliches Duplikat
       *[other] { $count } mögliche Duplikate
    }
weavero-people-dupe-items =
    { $count ->
        [0] Kein Eintrag in Ihren Bibliotheken
        [1] 1 Eintrag in Ihren Bibliotheken
       *[other] { $count } Einträge in Ihren Bibliotheken
    }
weavero-people-dupe-reason =
    { $reason ->
        [id-orcid] gleiche ORCID iD
        [id-openalex] gleiches OpenAlex-Profil
        [id-idref] gleiche IdRef
        [id-wikidata] gleiches Wikidata-Objekt
        [name] gleicher Name
        [form] der Name des einen ist eine andere Form des anderen
        [initials] gleiche Initialen
       *[institution] gleiche Einrichtung
    }
weavero-people-dupe-merge = In { $name } zusammenführen
weavero-people-dupe-notsame = Nicht dieselbe Person
weavero-people-dupe-confirm-title = Zwei Forschende zusammenführen
weavero-people-dupe-confirm = { $drop } in { $keep } zusammenführen? Alles über { $drop } geht zu { $keep }, und { $drop } wird entfernt.
# Evidence on the user's own value: an item of a library, its page, a quote. $field: link (the item), quote;
# $title: the item's title; $page: its page label, or none; $quote: the words, or none.
weavero-people-ev-act = Beleg …
weavero-people-row-evidence =
    .label = Beleg …
weavero-people-ev-field =
    { $field ->
        [link] Eintrag
       *[quote] Zitat
    }
weavero-people-ev-ph = Ein zotero://-Link zum Eintrag, oder wählen Sie unten eines der geöffneten PDFs
weavero-people-ev-tab =
    { $page ->
        [none] { $title }
       *[other] { $title }, S. { $page }
    }
weavero-people-ev-tip = Beleg: { $title }{ $page ->
        [none] {""}
       *[other] , S. { $page }
    }{ $quote ->
        [none] {""}
       *[other] {" "}“{ $quote }”
    } Zum Öffnen klicken.
weavero-people-ev-bad = Fügen Sie einen zotero://-Link zu einem Eintrag ein, oder wählen Sie eines der geöffneten PDFs.
weavero-people-ev-remove = Beleg entfernen
weavero-people-fact-position = Stelle
weavero-people-fact-institution = Einrichtung
weavero-people-fact-phd = Einrichtung der Promotion
weavero-people-fact-phd-year = Jahr der Promotion
weavero-people-fact-phd-thesis = Dissertation
weavero-people-fact-web = Webseite
weavero-people-link-advisor = Doktorvater/-mutter
weavero-people-link-coadvisor = Zweitbetreuung
weavero-people-link-postdoc = Postdoc-Gastgeber
weavero-people-link-lab = Gleiches Labor
weavero-people-link-linked = Verbunden mit
weavero-people-link-student = Doktorand/in
weavero-people-source-me = Sie
weavero-people-keep = Behalten
weavero-people-reject = Verwerfen
weavero-people-restore = Wiederherstellen
weavero-people-edit = Bearbeiten
weavero-people-add-value = Hinzufügen…
weavero-people-save = Speichern
weavero-people-agree = { $count } Quellen stimmen überein
weavero-people-new = neu
weavero-people-conflict = { $count } Werte: Die Quellen widersprechen sich
weavero-people-conflict-new = Eine Quelle hat einen neuen Wert geliefert
weavero-people-status-chosen = von Ihnen behalten
weavero-people-status-confirmed = bestätigt
weavero-people-status-suggested = vorgeschlagen
weavero-people-status-alternative = anderer Wert
weavero-people-status-rejected = verworfen
weavero-people-open-person = { $name } öffnen
weavero-people-add-person = { $name } ist noch nicht unter den Forschenden: Klicken, um die Person hinzuzufügen
weavero-people-from-record = aus dem eigenen Datensatz
weavero-people-links-none = Noch keine Verbindung.
weavero-people-link-name =
    .placeholder = Name der Person
weavero-people-link-add = Verbindung hinzufügen
weavero-people-tree-empty = Noch keine Betreuer und keine Doktoranden bekannt.
weavero-people-tree-label = Akademischer Stammbaum von { $name }
# The lineage tree's academic siblings (the other PhD students of the focus's advisors). $name: an advisor.
weavero-people-lt-sibs-of = Weitere Promovierende von { $name }:
weavero-people-lt-sibs-tip = Akademische Geschwister: die anderen Promovierenden derselben Betreuenden. Ein Name zentriert den Baum auf diese Person.
weavero-people-works-count = { $inlib } in Ihren Bibliotheken, von { $total }
weavero-people-works-none = Aktualisieren listet die Veröffentlichungen aus OpenAlex auf.
weavero-people-works-offline = Noch nicht nachgeschlagen. Einträge Ihrer Bibliotheken mit einem Autor dieses Namens:
weavero-people-works-more = { $count } weitere
weavero-people-works-search =
    .placeholder = Nach Titel, Autor oder Zeitschrift filtern
weavero-people-works-sort =
    { $sort ->
        [old] Älteste zuerst
        [cited] Am häufigsten zitiert
        [title] Titel
        [venue] Zeitschrift
       *[new] Neueste zuerst
    }
weavero-people-works-sort-tip = Publikationen sortieren
weavero-people-works-funnel-tip = Publikationen filtern
weavero-people-works-mark =
    { $kind ->
        [pdf] In Ihrer Bibliothek, mit PDF
        [nopdf] In Ihrer Bibliothek, ohne PDF
       *[web] Nicht in Ihrer Bibliothek
    }
weavero-people-works-filter =
    { $filter ->
        [type] Typ
        [venue] Zeitschrift
       *[decade] Jahrzehnt
    }
weavero-people-works-nomatch = Keine Publikation passt.
# The researcher's citation figures: $h, $i10, $cites (numbers); the tooltip says where they come
# from ($from: openalex, or works = computed from the $works works listed) and when ($date).
weavero-people-metrics = h-Index { $h } · i10-Index { $i10 } · { $cites } Zitationen
weavero-people-metrics-tip =
    { $from ->
        [works] Berechnet aus den { $works } aufgeführten Werken, mit ihren OpenAlex-Zählungen ({ $date }).
       *[openalex] OpenAlex, { $date }. Andere Quellen zählen anders.
    }
# A publication's times cited (OpenAlex's count at the last Refresh, $date in the tooltip).
weavero-people-work-cited =
    { $count ->
        [one] Einmal zitiert
       *[other] { $count }-mal zitiert
    }
weavero-people-work-cited-tip = OpenAlex, { $date }
# Semantic Scholar's figures, asked for on a click: $h, $cites (numbers), $date, $url (the profile);
# why it failed: $why = nodoi, nomatch, error ($error: the error).
weavero-people-s2-figures = Semantic Scholar: h-Index { $h } · { $cites } Zitationen
weavero-people-s2-tip = Semantic Scholar, { $date }: { $url }
weavero-people-s2-ask = Semantic Scholar fragen
weavero-people-s2-again = Erneut fragen
weavero-people-s2-busy = Wird gefragt …
weavero-people-s2-ask-tip = Diese Person auf Semantic Scholar suchen, über eine ihrer Publikationen mit DOI (Netzwerk nur bei diesem Klick)
weavero-people-s2-failed =
    { $why ->
        [nodoi] Keine ihrer Publikationen hat eine DOI, um sie zu suchen.
        [nomatch] Semantic Scholar hat bei ihren Publikationen keine Person dieses Namens.
       *[error] Semantic Scholar hat nicht geantwortet: { $error }
    }
# Google Scholar: the researcher's public profile, read on a click. $h, $i10, $cites (numbers), $date,
# $url (the profile); why reading failed: $why = refused (a refusal or a robot check), error ($error).
weavero-people-gs-add = Google-Scholar-Profil hinzufügen
weavero-people-gs-add-tip = Die Adresse ihres öffentlichen Google-Scholar-Profils angeben, um seine Zahlen per Klick zu lesen
weavero-people-gs-add-prompt = Fügen Sie die Adresse ihres Google-Scholar-Profils ein (scholar.google.com/citations?user=…):
weavero-people-gs-bad = Das ist nicht die Adresse eines Google-Scholar-Profils.
weavero-people-gs-read = Google Scholar lesen
weavero-people-gs-busy = Wird gelesen …
weavero-people-gs-read-tip = Die Zahlen ihres Google-Scholar-Profils lesen (seine erste Seite, nur bei diesem Klick)
weavero-people-gs-forget = Profil vergessen
weavero-people-gs-forget-tip = Ihr Google-Scholar-Profil vergessen
weavero-people-gs-figures = Google Scholar: h-Index { $h } · i10-Index { $i10 } · { $cites } Zitationen
weavero-people-gs-tip = Google Scholar, { $date } – { $url }
weavero-people-gs-failed =
    { $why ->
        [refused] Google Scholar hat die Seite verweigert (es verlangt eventuell einen Nachweis, dass Sie kein Roboter sind): Öffnen Sie das Profil im Browser.
       *[error] Google Scholar hat nicht geantwortet: { $error }
    }
weavero-people-notes =
    .placeholder = Ihre Notizen zu dieser Person
weavero-people-fact-country = Land
weavero-people-fact-phd-country = Land der Promotion
weavero-people-fact-birth-year = Geburtsjahr
weavero-people-sort-tip = Sortierreihenfolge. Forschende, deren Wert noch nicht bekannt ist, stehen am Ende.
weavero-people-sort-heading =
    .label = Sortieren nach
weavero-people-sort =
    .label = { $sort ->
            [first] Vorname
            [added] Hinzugefügt am (neueste zuerst)
            [modified] Zuletzt geändert (neueste zuerst)
            [items] Einträge in Ihren Bibliotheken (meiste zuerst)
            [institution] Einrichtung (A–Z)
            [phdYear] Jahr der Promotion (älteste zuerst)
            [birthYear] Geburtsjahr (älteste zuerst)
           *[last] Nachname
        }
weavero-people-filter = { $filter ->
        [noOrcid] Ohne ORCID iD
        [noIds] Ohne Kennungen
        [inLib] In Ihren Bibliotheken
        [thesis] Dissertation in Ihren Bibliotheken
        [advisor] Mit Doktoreltern
        [student] Mit Doktoranden
        [web] Mit Webseite
        [conflict] Quellen uneinig
        [position] Stelle
        [institution] Einrichtung
        [country] Land
        [phdCountry] Land der Promotion
        [birth] Geburtsjahrzehnt
       *[phd] Promotionsjahrzehnt
    }
weavero-people-filter-tip = { $filter ->
        [noOrcid] Nur Forschende ohne ORCID iD.
        [noIds] Nur Forschende ohne jede Kennung (ORCID, OpenAlex, IdRef, Wikidata): Aktualisieren listet die Profile mit ihrem Namen auf.
        [inLib] Nur Forschende, die mindestens einen Eintrag Ihrer Bibliotheken verfasst haben (nach ihrem Namen).
        [thesis] Nur Forschende, die eine Dissertation Ihrer Bibliotheken verfasst haben (nach ihrem Namen).
        [advisor] Nur Forschende mit einer Verbindung zu Doktorvater, Doktormutter oder Zweitbetreuung.
        [student] Nur Forschende mit Doktoranden: eine eigene Doktoranden-Verbindung oder die Doktoreltern-Verbindung einer anderen Person zu ihnen.
        [web] Nur Forschende mit einer Webseite.
        [conflict] Nur Forschende mit einer Angabe, bei der die Quellen uneinig sind, oder einem neuen Wert zum Prüfen.
        [position] Nur Forschende mit dieser Stelle.
        [institution] Nur Forschende an dieser Einrichtung.
        [country] Nur Forschende, deren aktuelle Einrichtung in diesem Land liegt.
        [phdCountry] Nur Forschende, die in diesem Land promoviert haben.
        [birth] Nur Forschende, die in diesem Jahrzehnt geboren sind (Wikidata).
       *[phd] Nur Forschende, die in diesem Jahrzehnt promoviert haben.
    }
weavero-people-filter-unknown = Unbekannt
weavero-people-decade = { $decade }er
# people4 (MJT 2026-11-24): a researcher's name edited in place, the other forms of the name,
# the sort's label, the filter funnel. The title's tooltip: a click edits the name.
weavero-people-name-edit-tip = Klicken, um den Namen zu bearbeiten
# Tooltip of the "you" mark beside a name the user typed.
weavero-people-name-mine-tip = Von Ihnen eingegebener Name: Eine Aktualisierung ändert ihn nie
# The two fields of the name being edited, as Zotero edits a creator.
weavero-people-name-last =
    .placeholder = Nachname
    .aria-label = Nachname
weavero-people-name-first =
    .placeholder = Vorname
    .aria-label = Vorname
weavero-people-name-empty = Forschende brauchen einen Nachnamen: Der Name wurde nicht geändert.
# The row of the other forms of the name (ORCID, OpenAlex, Wikidata, the user's items, the user's own).
weavero-people-fact-other-names = Weitere Namen
# A source of a form of the name: how the creators of the user's libraries write it.
weavero-people-source-items = Ihre Einträge
# A source of a value: the alerts file (Settings → Feeds), whose followed authors a Build reads, with their ids.
weavero-people-source-radar = Alarmdatei
# The plain label before the sort button; the button shows the order alone ($sort as in weavero-people-sort).
weavero-people-sort-label = Sortierung:
weavero-people-sort-current = { $sort ->
        [first] Vorname
        [added] Hinzugefügt am
        [modified] Zuletzt geändert
        [items] Einträge in Ihren Bibliotheken
        [institution] Einrichtung
        [phdYear] Jahr der Promotion
        [birthYear] Geburtsjahr
       *[last] Nachname
    }
# The funnel beside the sort: its tooltip and spoken name, and its popup's name.
weavero-people-funnel-tip = Forschende filtern
# The funnel's popup: the hint at the top left; Clear (the popup stays open); the red × (Clear and Close).
weavero-people-filter-hint = Alt+Klick zum Ausschließen
weavero-people-filter-clear-all = Zurücksetzen
    .title = Alle Filter der Forschenden zurücksetzen (dieses Fenster bleibt geöffnet)
    .aria-label = Alle Filter der Forschenden zurücksetzen
weavero-people-filter-clear-close = Zurücksetzen und schließen
# The second line of an on/off filter's tooltip (its first line: weavero-people-filter-tip).
weavero-people-filter-gesture = Klicken zum Einschließen, Alt+Klick zum Ausschließen.
# Tooltip of a value's chip. $value: the value (a position, a country, a decade, Unknown...); $count: the researchers with it.
weavero-people-filter-value-tip = { $value } ({ $count }) – klicken zum Einschließen, Alt+Klick zum Ausschließen
# Researchers, the right pane (see en-US).
weavero-people-pane-none = Keine forschende Person ausgewählt
weavero-people-pane-count =
    { $count ->
        [one] { $count } forschende Person ausgewählt
       *[other] { $count } Forschende ausgewählt
    }
weavero-people-pane-open = Öffnen
weavero-people-pane-toggle =
    { $state ->
        [open] Detailbereich ausblenden
       *[closed] Detailbereich einblenden
    }
# Researchers, page modes and family-tree dates (see en-US).
weavero-people-page-done = Fertig
weavero-people-lt-when =
    { $kind ->
        [range] { $type } { $from }–{ $to }
        [from] { $type } ab { $from }
        [until] { $type } bis { $to }
        [unknown] { $type } { $from }?
       *[end] { $type } { $to }
    }
weavero-people-lt-when-tip = { $date }: Die Quelle sagt nicht, ob die Verbindung in diesem Jahr begann oder endete.
# Researchers, the Google Contacts design, step 2 (see en-US).
weavero-people-nav =
    { $view ->
        [followed] Gefolgt
        [check] Zu prüfen
        [queue] Vorgeschlagene Verbindungen
        [dupes] Duplikate
        [conflict] Quellen uneinig
        [noOrcid] Ohne ORCID
        [import] Aus einer Datei importieren…
       *[all] Forschende
    }
weavero-people-nav-head =
    { $group ->
        [manage] Korrigieren und verwalten
       *[browse] Durchsuchen nach
    }
weavero-people-dupe-none = Keine möglichen Duplikate.
weavero-people-fchip =
    { $state ->
        [out] { $filter }: nicht { $value }
       *[in] { $filter }: { $value }
    }
weavero-people-fchip-toggle =
    { $state ->
        [out] Nicht: { $filter }
       *[in] { $filter }
    }
weavero-people-fchip-remove = Diesen Filter entfernen
weavero-people-sel =
    { $act ->
        [follow] Folgen
        [unfollow] Nicht mehr folgen
        [merge] Zusammenführen
       *[all] Alle auswählen
    }
weavero-people-sel-count = { $count } ausgewählt
weavero-people-sel-merge-tip = Genau zwei Forschende markieren, um sie zusammenzuführen
weavero-people-sel-merge-into =
    .label = In { $name } zusammenführen
weavero-people-sel-row = { $name } auswählen
weavero-people-row-act =
    { $act ->
        [follow] Folgen
        [unfollow] Nicht mehr folgen
        [edit] Bearbeiten
       *[more] Weitere Aktionen
    }
weavero-people-row-menu =
    .label = { $act ->
            [open] Öffnen
            [edit] Bearbeiten
            [follow] Folgen
            [unfollow] Nicht mehr folgen
            [check] Als „Zu prüfen“ markieren
            [checked] Als geprüft markieren
            [refresh] Aktualisieren
           *[remove] Entfernen…
        }
weavero-people-table-colmenu =
    .label = { $col ->
            [name] Name
            [institution] Einrichtung
            [country] Land
            [papers] Artikel in Ihren Bibliotheken
           *[phd] Promotionsjahr
        }
weavero-people-table-colreset =
    .label = Standardspalten wiederherstellen
# Researchers' tags (see en-US).
weavero-people-tags = Tags
weavero-people-tags-col =
    .label = Tags
weavero-people-tagsel-none = Keine Tags vorhanden
weavero-people-tagsel-actions =
    .title = Aktionen
weavero-people-tagsel-deselect =
    .label = Alle abwählen
weavero-people-tag-menu =
    .label = { $act ->
            [color] Farbe zuweisen
            [nocolor] Farbe entfernen
            [position] Position
            [rename] Tag umbenennen…
           *[delete] Tag löschen…
        }
weavero-people-tag-add =
    .placeholder = Tag hinzufügen
weavero-people-tag-remove = { $name } entfernen
weavero-people-bulk-tag = Tag
weavero-people-bulk-tag-new =
    .label = Neues Tag…
weavero-people-tag-new-prompt = Den ausgewählten Forschenden dieses Tag geben:
weavero-people-tag-rename-prompt = „{ $name }“ bei allen Forschenden umbenennen:
weavero-people-tag-delete-ask =
    { $count ->
        [one] Das Tag „{ $name }“ von { $count } Person entfernen?
       *[other] Das Tag „{ $name }“ von { $count } Personen entfernen?
    }
weavero-people-tag-colors-full = Höchstens neun Tags haben eine Farbe.
weavero-pref-nav-people = Forschende
weavero-pref-people-title = Forschende
weavero-pref-people-enable =
    .aria-label = Forschende aktivieren
weavero-pref-people-desc = Ein Tab „Forschende“ (Datei → Forschende), um aufzubauen und zu prüfen, was Sie über andere Forschende wissen: ihre Kennungen, Stelle, Einrichtung und Promotion, jede Angabe mit dem Wert jeder Quelle nebeneinander, damit Sie sie behalten, verwerfen oder bearbeiten; ihre Doktoreltern und Doktoranden, als akademischer Stammbaum gezeichnet; ihre Veröffentlichungen, markiert, ob sie in Ihrer Bibliothek sind. Fügen Sie eine Person mit „Zu Forschenden hinzufügen“ im Kontextmenü eines Autors hinzu, oder erstellen Sie die Liste aus den Autoren, denen Sie folgen. Weavero schlägt sie in OpenAlex, ORCID, theses.fr, IdRef und Wikidata nur nach, wenn Sie klicken: Die Anfragen enthalten Namen und Kennungen der Person, nichts von Ihnen. Die Datensätze bleiben im Datenordner von Weavero, nie in Ihren Bibliotheken.
weavero-pref-people-toolbar-button =
    .label = Schaltfläche „Forschende“ in der Symbolleiste des Sammlungsbereichs
weavero-pref-people-toolbar-button-desc = Eine Schaltfläche in der Symbolleiste über Ihren Sammlungen, die den Tab „Forschende“ öffnet oder ihn nach vorne holt, wenn er schon geöffnet ist; <strong>Strg/Cmd+Klick</strong> öffnet ihn neben der Bibliothek, in einer geteilten Ansicht. Ein Rechtsklick auf die Schaltfläche blendet sie aus; dieses Kästchen holt sie zurück.
weavero-pref-people-names-title = Namen
weavero-pref-people-names-desc = Wie jeder Teil des Tabs „Forschende“ den Namen einer Person schreibt. „Nachname, Vorname“ zeigt, dass die Liste nach Nachnamen sortiert ist; ein Name ohne Vornamen steht ohne Komma.
weavero-pref-people-names-list = Liste der Forschenden
weavero-pref-people-names-heading = Titel der Seite einer Person
weavero-pref-people-names-links = Verbindungen (Doktoreltern, Doktoranden…)
weavero-pref-people-names-tree = Akademischer Stammbaum
weavero-pref-people-names-last =
    .label = Nachname, Vorname
weavero-pref-people-names-first =
    .label = Vorname Nachname
# Sicherungen der Daten von Weavero (modules/backups.ts).
weavero-pref-nav-backups = Sicherungen
weavero-pref-backups-title = Sicherungen
weavero-pref-backups-desc = Zoteros eigene Sicherungen und die Zotero-Synchronisierung enthalten weder die Daten von Weavero — Ihre Lesezeichen, Gliederungen, Tab-Gruppen, Sitzungen und Feed-Listen — noch seine Einstellungen. Weavero bewahrt selbst Kopien davon in seinem Datenordner auf. Eine Wiederherstellung oder ein Import ersetzt die Daten und Einstellungen von Weavero durch die einer Sicherung; Ihr aktueller Stand wird zuerst gesichert, sodass Sie es rückgängig machen können.
weavero-pref-backups-auto =
    .label = Automatisch sichern
weavero-pref-backups-auto-desc = Einmal am Tag und vor jedem Update von Weavero kopiert Weavero seine Daten und Einstellungen. Was es selbst neu aufbauen kann, etwa den „Zitiert von“-Index und die Feed-Bewertungen, wird ausgelassen.
weavero-pref-backups-keep-lead = Die letzten
weavero-pref-backups-keep-unit = { $count ->
        [one] tägliche Sicherung behalten
       *[other] täglichen Sicherungen behalten
    }
weavero-pref-backups-keep-desc = Von den Sicherungen vor einem Update, durch „Jetzt sichern“, vor einer Wiederherstellung oder einem Import und von importierten Dateien werden jeweils die letzten 5 behalten.
weavero-pref-backups-actions-title = Ihre Sicherungen
weavero-pref-backups-now = Jetzt sichern
weavero-pref-backups-restore = Wiederherstellen…
weavero-pref-backups-export = Exportieren…
weavero-pref-backups-import = Importieren…
weavero-pref-backups-open = Ordner öffnen
weavero-pref-backups-where = Die Sicherungen liegen in { $path }
weavero-pref-backups-last = Letzte Sicherung: { $date } ({ $reason }). { $count ->
        [one] { $count } Sicherung
       *[other] { $count } Sicherungen
    }, insgesamt { $size }.
weavero-pref-backups-none = Noch keine Sicherung.
weavero-pref-backups-last-error = Die letzte Sicherung ist fehlgeschlagen ({ $date }): { $error }
weavero-pref-backups-restored = { $kind ->
        [import] Am { $date } aus der als { $from } gesicherten Datei importiert. Um es rückgängig zu machen, stellen Sie die Sicherung „Vor einem Import“ vom { $pre } wieder her.
       *[other] Am { $date } aus der Sicherung vom { $from } wiederhergestellt. Um es rückgängig zu machen, stellen Sie die Sicherung „Vor einer Wiederherstellung“ vom { $pre } wieder her.
    }
weavero-pref-backups-restore-failed = Die Wiederherstellung vom { $date } hat nicht stattgefunden ({ $problem }). Ihre Daten und Einstellungen sind unverändert.
weavero-pref-backups-pending = { $kind ->
        [import] Ein Import wartet auf den nächsten Start von Zotero.
       *[other] Eine Wiederherstellung der Sicherung vom { $date } wartet auf den nächsten Start von Zotero.
    } Weavero schreibt sie, bevor es seine Daten liest, sodass nichts, was es noch im Speicher hält, sie überschreiben kann.
weavero-pref-backups-pending-restart = Zotero jetzt neu starten
weavero-pref-backups-pending-cancel = Wiederherstellung abbrechen
weavero-pref-backups-working = Wird gesichert…
weavero-pref-backups-backed-up = Gesichert: { $date }.
weavero-pref-backups-exported = Geschrieben: { $path }
weavero-pref-backups-staged = Erledigt: Weavero stellt sie beim nächsten Start von Zotero wieder her.
weavero-pref-backups-failed = Das hat nicht funktioniert: { $error }
weavero-pref-backups-checking = Die Sicherung wird geprüft…
weavero-pref-backups-pick = Wählen Sie eine Sicherung: darunter steht, was ihre Wiederherstellung ändern würde.
weavero-pref-backups-no-backups = Es gibt noch keine Sicherung zum Wiederherstellen.
weavero-pref-backups-from-file = Aus der Datei { $file }, erstellt am { $date } von Weavero { $version }. Was ihr Import ändern würde:
weavero-pref-backups-opt-data =
    .label = Daten
weavero-pref-backups-opt-settings =
    .label = Einstellungen
weavero-pref-backups-go-restore = Diese Sicherung wiederherstellen…
weavero-pref-backups-go-import = Diese Datei importieren…
weavero-pref-backups-cancel = Abbrechen
weavero-backups-ask-title = Eine Sicherung von Weavero wiederherstellen
weavero-backups-ask-restore = { $what ->
        [data] Die Daten von Weavero
        [settings] Die Einstellungen von Weavero
       *[both] Die Daten und Einstellungen von Weavero
    } aus der Sicherung vom { $date } wiederherstellen? Ihr aktueller Stand wird zuerst gesichert, sodass Sie es rückgängig machen können, indem Sie diese Kopie wiederherstellen. Weavero stellt die Sicherung beim nächsten Start von Zotero wieder her, bevor es seine Daten liest.
weavero-backups-ask-import-title = Daten von Weavero importieren
weavero-backups-ask-import = { $what ->
        [data] Die Daten von Weavero
        [settings] Die Einstellungen von Weavero
       *[both] Die Daten und Einstellungen von Weavero
    } durch die aus { $file } ersetzen? Ihr aktueller Stand wird zuerst gesichert, sodass Sie es rückgängig machen können, indem Sie diese Kopie wiederherstellen. Weavero importiert die Datei beim nächsten Start von Zotero, bevor es seine Daten liest.
weavero-backups-ask-restart = Zotero jetzt neu starten
weavero-backups-ask-later = Beim nächsten Start
weavero-backups-export-title = Daten von Weavero exportieren
weavero-backups-import-title = Daten von Weavero importieren
weavero-backups-row = { $date } — { $reason } — { $size }
weavero-backups-reason-daily = täglich
weavero-backups-reason-manual = Jetzt sichern
weavero-backups-reason-pre-restore = vor einer Wiederherstellung
weavero-backups-reason-pre-import = vor einem Import
weavero-backups-reason-import = importiert aus { $file }
weavero-backups-reason-update = vor dem Update auf { $to }
weavero-backups-reason-update-from = vor dem Update von { $from } auf { $to }
weavero-backups-reason-other = automatisch ({ $reason })
weavero-backups-store-bookmarks = Lesezeichen
weavero-backups-store-outlines = Gliederungen
weavero-backups-store-ann-order = Reihenfolge der Anmerkungen
weavero-backups-store-note-view = Gliederungen und Faltungen der Notizen
weavero-backups-store-sessions = Tab-Sitzungen
weavero-backups-store-saved-windows = Gespeicherte Fenster
weavero-backups-store-tab-groups-file = Tab-Gruppen (Dateikopie)
weavero-backups-store-tab-groups-bak = Tab-Gruppen (vorherige Kopie)
weavero-backups-store-outline-eval = Bewertungen der Gliederungen
weavero-backups-store-feeds = Feed-Listen
weavero-backups-store-feeds-export = Alarmdatei
weavero-backups-store-tab-groups = Tab-Gruppen
weavero-backups-store-settings = Einstellungen
weavero-backups-diff-line = { $store }: { $changes }
weavero-backups-diff-added = { $count } hinzugefügt
weavero-backups-diff-removed = { $count } entfernt
weavero-backups-diff-changed = { $count } geändert
weavero-backups-diff-file-added = hinzugefügt (jetzt nicht vorhanden)
weavero-backups-diff-file-removed = entfernt (nicht in dieser Sicherung)
weavero-backups-diff-file-changed = ersetzt
weavero-backups-diff-none = Nichts würde sich ändern: dies enthält die Daten und Einstellungen, die Sie jetzt haben.
weavero-backups-failed-title = Weavero konnte seine Daten nicht sichern
weavero-backups-failed-kept = Ihre früheren Sicherungen bleiben erhalten.
weavero-backups-failed-disk-full = Der Datenträger ist voll.
weavero-backups-failed-locked = Ein anderes Programm hält eine der Dateien von Weavero fest. Weavero versucht es bei der nächsten Sicherung erneut.
weavero-backups-failed-too-large = Die Daten von Weavero sind größer, als eine Sicherung sein darf (256 MB).
weavero-backups-failed-other = Etwas ist schiefgegangen: { $error }
weavero-backups-damaged = Diese Sicherung ist beschädigt (eine Datei entspricht nicht ihrem Eintrag) und wurde entfernt.
weavero-backups-import-newer = Diese Datei wurde von einem neueren Weavero erstellt. Aktualisieren Sie Weavero und importieren Sie sie dann.
weavero-backups-import-not-weavero = Dies ist keine von Weavero exportierte Datei.
weavero-backups-restored-title = Weavero hat eine Sicherung wiederhergestellt
weavero-backups-restored = Die Daten und Einstellungen von Weavero sind die der Sicherung vom { $date }. Um es rückgängig zu machen, stellen Sie die kurz davor erstellte Kopie wieder her, unter Einstellungen → Weavero → Sicherungen.
weavero-backups-restore-failed-title = Weavero hat die Sicherung nicht wiederhergestellt
weavero-backups-restore-failed = Die Sicherung vom { $date } wurde nicht wiederhergestellt: Ihre Daten und Einstellungen sind unverändert.
# Researchers: the lineage tree (peoplenet, 2026-11-25).
weavero-people-lt-back = Zurück
weavero-people-lt-forward = Vor
weavero-people-lt-home = Zurück zu { $name }
weavero-people-lt-zoom-in = Vergrößern
weavero-people-lt-zoom-out = Verkleinern
weavero-people-lt-fit = Ganzen Baum einpassen
weavero-people-lt-export = Exportieren
weavero-people-lt-export-svg =
    .label = SVG-Bild…
weavero-people-lt-export-png =
    .label = PNG-Bild…
weavero-people-lt-export-csv =
    .label = CSV-Tabelle…
weavero-people-lt-export-title = Abstammungsbaum exportieren
weavero-people-lt-edge =
    { $type ->
        [phd] Promotion
        [coadvisor] Zweitbetreuung
        [postdoc] Postdoc
        [research] Wissenschaftliche Mitarbeit
        [ra] Hilfskraft
       *[other] Sonstige
    }
weavero-people-lt-more-up =
    { $count ->
        [one] { $count } weitere betreuende Person nicht angezeigt
       *[other] { $count } weitere betreuende Personen nicht angezeigt
    }
weavero-people-lt-more-down =
    { $count ->
        [one] { $count } weitere betreute Person nicht angezeigt
       *[other] { $count } weitere betreute Personen nicht angezeigt
    }
weavero-people-lt-fewer = Weniger anzeigen
weavero-people-lt-phd = Promotion { $year }
weavero-people-lt-tree-inst = die Einrichtung laut { $source }, möglicherweise eine frühere
weavero-people-lt-aft-tip = Die Seite dieser Person im { $source } ({ $licence })
weavero-people-lt-open = Öffnen
weavero-people-lt-open-tip = Diese Person in Forschende öffnen
weavero-people-lt-follow-tip = Zu Forschende hinzufügen und folgen
weavero-people-lt-card-tip = Klicken, um den Baum auf diese Person zu zentrieren
weavero-people-lt-grants = NIH-Förderungen: { $list }
weavero-people-lt-credit = Betreuende und Betreute auch aus dem { $source } ({ $licence }), Export vom { $version }.
# Researchers: the strip above the items list (peoplenet, 2026-11-25).
weavero-people-strip-label = Forschende, die Ihre Suche nennt
weavero-people-strip-counts =
    { $here ->
        [one] { $here } Eintrag hier
       *[other] { $here } Einträge hier
    } · { $shown } in diesen Ergebnissen
weavero-people-strip-only = Nur von dieser Person
weavero-people-strip-only-tip = Nur die Einträge mit dem Autor { $form } zeigen (Weaveros Autoren-Filter)
weavero-people-strip-close = Für diese Suche ausblenden
weavero-people-strip-open-tip = In Forschende öffnen
