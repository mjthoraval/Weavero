# Weavero -- French (fr-FR).
# Machine-assisted translation (Claude), to be reviewed by a native speaker.
# Source: locale/en-US/weavero.ftl. Terms Weavero shares with Zotero follow
# Zotero's own fr-FR translation.

weavero-backlinks-header =
    .label = { $count ->
        [one] { $count } rétrolien
        [many] { $count } rétroliens
       *[other] { $count } rétroliens
    }
weavero-backlinks-sidenav =
    .tooltiptext = Rétroliens
weavero-links-header =
    .label = { $count ->
        [one] { $count } lien de document
        [many] { $count } liens de document
       *[other] { $count } liens de document
    }
weavero-links-sidenav =
    .tooltiptext = Liens de document
weavero-pref-nav-links = Liens et relations
weavero-pref-nav-filters = Tri et filtres
weavero-pref-nav-bookmarks = Marque-pages
weavero-pref-nav-tabs = Onglets et fenêtres
weavero-pref-nav-extras = Divers
weavero-pref-intro = Liens cliquables dans les commentaires et les notes, filtres dans la liste des documents et les onglets, marque-pages et colonnes de la liste des documents. La plupart des fonctionnalités sont activées par défaut ; désactivez celles que vous n’utilisez pas.
weavero-pref-links-title = Liens et relations
weavero-pref-links-enable =
    .aria-label = Activer les liens et relations
weavero-pref-links-desc = Prise en charge dans le texte des URI cliquables et du Markdown, icônes pour repérer et atteindre les documents connexes, et outils du clic droit pour copier des liens Zotero et ajouter des documents connexes.
weavero-pref-links-mode-title = Mode d’affichage
weavero-pref-links-mode-desc = Comment les liens et le Markdown apparaissent dans les commentaires et les notes — <strong>Dans le texte</strong> : rendu complet ; <strong>Icône et fenêtre contextuelle</strong> : le texte reste brut et une fenêtre contextuelle s’ouvre (plus léger).
weavero-pref-links-mode-inline =
    .label = Dans le texte
weavero-pref-links-mode-icon =
    .label = Icône et fenêtre contextuelle
weavero-pref-links-show = Afficher :
weavero-pref-links-show-urls =
    .label = URL
weavero-pref-links-show-zotero =
    .label = Liens Zotero
weavero-pref-links-show-app =
    .label = Liens d’application
weavero-pref-links-show-markdown =
    .label = Markdown
weavero-pref-links-markdown-desc = Markdown : <strong>**gras**</strong>, <em>*italique*</em>, ~~barré~~, <span data-l10n-name="mono">`code`</span>, <span data-l10n-name="mono2">[label](url)</span>. Les schémas de liens d’application se choisissent juste en dessous.
weavero-pref-links-schemes-title = Schémas de liens d’application
weavero-pref-links-schemes-desc = Les schémas que Weavero reconnaît comme liens d’application dans les commentaires. Actif seulement si <strong>Liens d’application</strong> est coché ci-dessus.
weavero-pref-links-schemes-no-confirm =
    .label = Ouvrir sans boîte de dialogue de confirmation
weavero-pref-links-schemes-no-confirm-desc = Passer la question de Firefox « Autoriser ce site à ouvrir le lien … ? » pour les schémas activés.
weavero-pref-links-scheme-magnet =
    .label = magnet:
    .tooltiptext = Liens magnet de torrents
weavero-pref-links-scheme-mailto =
    .label = mailto:
    .tooltiptext = Adresses électroniques
weavero-pref-links-scheme-skype =
    .label = skype:
    .tooltiptext = Appels / discussions Skype
weavero-pref-links-scheme-sms =
    .label = sms:
    .tooltiptext = Messages SMS
weavero-pref-links-scheme-spotify =
    .label = spotify:
    .tooltiptext = Titres / listes de lecture Spotify
weavero-pref-links-scheme-tel =
    .label = tel:
    .tooltiptext = Numéros de téléphone
weavero-pref-links-scheme-discord =
    .label = discord://
    .tooltiptext = Serveurs Discord
weavero-pref-links-scheme-evernote =
    .label = evernote://
    .tooltiptext = Notes Evernote
weavero-pref-links-scheme-figma =
    .label = figma://
    .tooltiptext = Fichiers Figma
weavero-pref-links-scheme-file =
    .label = file://
    .tooltiptext = Fichiers locaux (confirmation avant l’ouverture)
weavero-pref-links-remote-file =
    .label = Autoriser les liens vers des fichiers situés sur d’autres ordinateurs (partages réseau)
weavero-pref-links-remote-file-desc = Chaque lien demande une confirmation une fois avant de s’ouvrir ; Weavero retient les liens que vous ouvrez. Désactiver cette option les oublie.
weavero-pref-links-scheme-ftp =
    .label = ftp://
    .tooltiptext = Serveurs FTP
weavero-pref-links-scheme-msteams =
    .label = msteams://
    .tooltiptext = Microsoft Teams
weavero-pref-links-scheme-notion =
    .label = notion://
    .tooltiptext = Pages Notion
weavero-pref-links-scheme-obsidian =
    .label = obsidian://
    .tooltiptext = Notes Obsidian
weavero-pref-links-scheme-slack =
    .label = slack://
    .tooltiptext = Canaux Slack
weavero-pref-links-scheme-vscode =
    .label = vscode://
    .tooltiptext = Espaces de travail / fichiers VS Code
weavero-pref-links-scheme-zoom =
    .label = zoommtg://
    .tooltiptext = Réunions Zoom
weavero-pref-links-view-icons =
    .label = Icônes sur les annotations dans la vue du document
weavero-pref-links-view-icons-desc = Badges lien / document connexe dessinés sur la page au-dessus des annotations qui ont un lien ou des documents connexes. Décochez pour garder le document sans superpositions.
weavero-pref-links-apply-title = Appliquer à
weavero-pref-links-apply-library = Bibliothèque :
weavero-pref-links-apply-items-list =
    .label = Liste des documents
weavero-pref-links-apply-annotations-panel =
    .label = Panneau des annotations
weavero-pref-links-apply-reader = Lecteur :
weavero-pref-links-apply-reader-sidebar =
    .label = Barre latérale
weavero-pref-links-apply-document-view =
    .label = Vue du document
weavero-pref-links-apply-notes = Notes :
weavero-pref-links-apply-note-editor =
    .label = Éditeur
    .tooltiptext = Liens et Markdown dans l’éditeur de notes
weavero-pref-links-apply-notes-pane =
    .label = Panneau des notes
    .tooltiptext = Liens dans la liste des notes du panneau de contexte (Toutes les notes)
weavero-pref-links-apply-notes-list =
    .label = Liste des documents
    .tooltiptext = Liens dans les titres des notes de la liste des documents
weavero-pref-links-apply-desc = Les surfaces où Weavero affiche les liens et le Markdown des annotations.
weavero-pref-links-internal-title = Navigation par liens internes
weavero-pref-links-internal-desc = <strong>Ctrl/Cmd+clic</strong> sur un lien interne (figure, équation, citation) envoie sa cible dans une vue divisée ; <strong>Maj+clic</strong> l’envoie dans une fenêtre séparée. Quand aucune division n’est encore ouverte, créer une :
weavero-pref-links-internal-horizontal =
    .label = Division horizontale
weavero-pref-links-internal-vertical =
    .label = Division verticale
weavero-pref-uri-title = Utilitaires d’URI
weavero-pref-uri-enable =
    .aria-label = Activer les utilitaires d’URI
weavero-pref-uri-desc = Entrées du clic droit qui copient des liens profonds <span data-l10n-name="mono">zotero://</span> dans le presse-papiers.
weavero-pref-uri-copy-item =
    .label = « Copier le lien de sélection » / « Copier le lien d’ouverture » dans les menus des documents
weavero-pref-uri-copy-item-desc = Copie un lien <span data-l10n-name="mono">zotero://select/…</span> qui mène au document.
weavero-pref-uri-copy-collection =
    .label = « Copier le lien de la collection » / « Copier le lien de la recherche enregistrée »
weavero-pref-uri-copy-collection-desc = Ajoute une entrée de copie de lien au menu contextuel de l’arborescence des collections.
weavero-pref-relations-title = Relations et documents liés
weavero-pref-relations-enable =
    .aria-label = Activer les fonctionnalités de relations et de documents liés
weavero-pref-relations-desc = Fonctionnalités fondées sur les relations entre documents connexes de Zotero et sur le mécanisme des documents liés.
weavero-pref-relations-add-related =
    .label = « Ajouter un document connexe… » dans le menu de la liste des documents
weavero-pref-relations-add-related-desc = Ouvre la boîte de dialogue de sélection des documents et lie les documents choisis comme connexes (gère plusieurs annotations à la fois).
weavero-pref-relations-chain-badge =
    .label = Badge en forme de chaîne sur les lignes d’annotation ayant des documents connexes
weavero-pref-relations-chain-badge-desc = Une icône de chaîne à côté des annotations qui ont des documents connexes ; cliquez dessus pour en voir la liste.
weavero-pref-relations-backlinks =
    .label = Section « Rétroliens » dans le panneau du document
weavero-pref-relations-backlinks-desc = Ce qui pointe ici : les commentaires d’annotation et les notes qui contiennent un lien Zotero (zotero://) ou une citation de note vers le document sélectionné, regroupés par document, avec le texte autour du lien. Également dans le panneau de contexte des onglets de lecteur et de note, et dans le filtre « A des rétroliens ».
weavero-pref-relations-item-links =
    .label = Section « Liens de document » dans le panneau du document
weavero-pref-relations-item-links-desc = Ce vers quoi pointe le document sélectionné : les liens Zotero (zotero://) et les citations de note (les citations et annotations que l’éditeur de notes de Zotero ajoute à une note) écrits dans ses notes et ses commentaires d’annotation, regroupés par la note ou l’annotation qui les contient, avec le texte autour de chacun. Un lien dont le document a disparu, ou dont la bibliothèque de groupe n’est pas dans ce profil, est listé en grisé et n’est pas compté. Également dans le panneau de contexte des onglets de lecteur et de note, et dans la carte qui s’affiche quand le pointeur s’arrête sur un lien Zotero ou une citation de note dans une note, un commentaire d’annotation ou la liste des documents.
weavero-pref-relations-children-scope =
    .label = Compter et lister les marqueurs et documents connexes des enfants dans les sections Marqueurs et Connexe
weavero-pref-relations-children-scope-desc = À côté des titres des sections Marqueurs et Connexe, combien le document en a lui-même et combien en ont ses pièces jointes, notes et annotations. Cliquez sur un nombre pour n’afficher que ceux-là, Alt+clic pour les masquer ; les marqueurs ou documents connexes d’un enfant sont listés sous ceux du document, sous un titre propre à cet enfant. Désactivé, les deux sections sont dessinées comme Zotero le fait.
weavero-pref-relations-open-related =
    .label = Sous-menu « Ouvrir le document connexe » dans le lecteur
weavero-pref-relations-open-related-desc = Entrées Ouvrir dans le lecteur / Dans une nouvelle fenêtre pour chaque document connexe, dans le menu contextuel des annotations.
weavero-pref-relations-libraries-tint =
    .label = Teinter les lignes des bibliothèques liées dans le panneau du document
weavero-pref-relations-libraries-tint-desc = Met en évidence la ligne de la bibliothèque du document affiché dans la section Bibliothèques et collections.
weavero-pref-filters-title = Tri et filtres
weavero-pref-filters-enable =
    .aria-label = Activer le tri et les filtres
weavero-pref-filters-desc = Les contrôles qui ordonnent, masquent, estompent ou délimitent l’ensemble visible — le tri des annotations dans le lecteur, le panneau de filtres de la liste des documents (le bouton ▾ de la barre d’outils) et les filtres par bibliothèque / type de fichier du menu des onglets.
weavero-pref-filters-ann-sort =
    .label = Tri des annotations dans le lecteur
weavero-pref-filters-ann-sort-desc = Trier la barre latérale Annotations du lecteur par position, date d’ajout ou date de modification — faites un clic droit sur l’en-tête de l’onglet Annotations pour le menu ; une barre de tri en un clic apparaît tant qu’un tri par date est actif, et les cartes affichent alors les deux dates, celle du tri en premier.
weavero-pref-filters-card-date-added =
    .label = Afficher la date d’ajout sur les cartes d’annotation
weavero-pref-filters-card-date-modified =
    .label = Afficher la date de modification sur les cartes d’annotation
weavero-pref-filters-card-dates-desc = Les dates en bas de chaque carte de la barre latérale Annotations du lecteur, quel que soit le tri ; survolez-en une pour voir les deux dates en entier. Faites un clic droit sur l’en-tête de l’onglet Annotations d’un lecteur pour choisir pour ce document seulement. Les annotations importées d’un PDF créé dans un autre programme portent la date à laquelle Zotero les a importées.
weavero-pref-filters-items-tree =
    .label = Panneau de filtres de la liste des documents
weavero-pref-filters-items-tree-desc = Le bouton ▾ de la barre d’outils à côté du champ de recherche, plus la fenêtre de filtres (couleur/type/type de fichier, marqueurs, auteurs, collections, recherches enregistrées).
weavero-pref-filters-read-status =
    .label = Filtre Statut de lecture (Zotero Reading List)
weavero-pref-filters-read-status-desc = Ajoute une ligne Statut de lecture à la fenêtre de filtres de la liste des documents quand l’extension Zotero Reading List est installée — filtrer par ⭐ Nouveau / 📙 À lire / 📖 En cours / 📗 Lu / … (Alt+clic pour exclure).
weavero-pref-filters-item-count =
    .label = Nombre de documents détaillé
weavero-pref-filters-item-count-desc = Remplace le « N documents dans cette vue » du panneau du document par un détail — documents · pièces jointes · notes · annotations — pour qu’il soit clair ce que le nombre compte et pourquoi il change quand vous développez une ligne. Quand un filtre est actif, il indique aussi combien de lignes correspondent et combien ne sont là que pour le contexte. Désactivez pour retrouver le nombre unique de Zotero.
weavero-pref-filters-selection-target =
    .label = Cible de sélection à trois états
weavero-pref-filters-selection-target-desc = Cases à cocher Parent / Pièce jointe / Annotation qui délimitent Ctrl+A et estompent les lignes hors de cette cible.
weavero-pref-filters-collapse-advanced =
    .label = Compacter la recherche avancée en recherche rapide
weavero-pref-filters-collapse-advanced-desc = Le bouton de compactage de Zotero masque l’éditeur de la recherche avancée mais garde son filtre appliqué, en ne laissant qu’une étiquette « Recherche avancée ». Avec cette option, le compactage revient plutôt au champ de recherche rapide avec la même requête — l’inverse naturel de son développement par le bouton entonnoir — chaque fois que la recherche est exprimable en recherche rapide (des mots simples en Titre, Créateur, Année, Champs & Marqueurs ou Partout). Une recherche qui utilise autre chose, comme une condition sur le créateur ou la date, se compacte toujours comme le fait Zotero. Le bouton de fermeture ✕ efface et ferme toujours.
weavero-pref-filters-tabs-library =
    .label = Filtre par bibliothèque du menu des onglets
weavero-pref-filters-tabs-library-desc = Une case à cocher à côté de chaque en-tête de bibliothèque dans la fenêtre « Lister tous les onglets », qui masque ces onglets.
weavero-pref-filters-tabs-file-type =
    .label = Filtre par type de fichier du menu des onglets
weavero-pref-filters-tabs-file-type-desc = Le bouton entonnoir de la fenêtre « Lister tous les onglets », pour un filtre par type de pièce jointe.
weavero-pref-bookmarks-title = Marque-pages
weavero-pref-bookmarks-enable =
    .aria-label = Activer les marque-pages
weavero-pref-bookmarks-desc = Des marque-pages à deux niveaux — une liste déroulante dans la barre d’outils du panneau des collections pour les documents / collections / recherches, et un onglet dans la barre latérale du lecteur pour les emplacements dans le document.
weavero-pref-bookmarks-sync-note = Les marque-pages ne se synchronisent pas encore entre ordinateurs — ils sont stockés localement dans <span data-l10n-name="mono">&lt;Zotero data dir&gt;/weavero/bookmarks.json</span>. (Ils passeront au stockage synchronisé géré par les extensions de Zotero dès qu’il sera disponible.)
weavero-pref-bookmarks-library =
    .label = Marque-pages de la bibliothèque
weavero-pref-bookmarks-library-desc = Une liste déroulante Marque-pages dans la barre d’outils du panneau des collections pour les documents / collections / recherches enregistrées.
weavero-pref-bookmarks-library-autohide =
    .label = Masquer automatiquement le bouton des marque-pages de la bibliothèque quand il est vide
weavero-pref-bookmarks-collection-scroll-title = Où apparaît une collection mise en marque-page
weavero-pref-bookmarks-collection-scroll-desc = Quand un marque-page ouvre une collection, une bibliothèque ou une recherche enregistrée, le panneau des collections la fait défiler :
weavero-pref-bookmarks-collection-scroll-top =
    .label = Jusqu’en haut du panneau (par défaut)
weavero-pref-bookmarks-collection-scroll-native =
    .label = Comportement de Zotero : défiler seulement autant que nécessaire
weavero-pref-bookmarks-document =
    .label = Marque-pages du document
weavero-pref-bookmarks-document-desc = Un onglet Marque-pages dans la barre latérale du lecteur pour les emplacements dans le document. Déposez-y une annotation ou une sélection pour la mettre en marque-page.
weavero-pref-bookmarks-document-autohide =
    .label = Masquer automatiquement l’onglet des marque-pages du document quand il est vide
weavero-pref-bookmarks-library-in-reader =
    .label = Afficher l’onglet des marque-pages de la bibliothèque dans le lecteur
weavero-pref-bookmarks-library-in-reader-desc = Parcourir les marque-pages de la bibliothèque à côté de ceux du document (Ctrl+clic pour fusionner les deux vues).
weavero-pref-bookmarks-page-numbers =
    .label = Afficher les numéros de page à côté des marque-pages du document
weavero-pref-bookmarks-page-numbers-desc = L’étiquette « p. N » à droite de chaque marque-page. Faites un clic droit sur l’onglet Marque-pages d’un lecteur pour les afficher ou les masquer pour ce document seulement. La carte de survol affiche toujours la page.
weavero-pref-tabs-title = Onglets et fenêtres
weavero-pref-tabs-enable =
    .aria-label = Activer les fonctionnalités d’onglets et de fenêtres
weavero-pref-tabs-desc = Groupes d’onglets, habillage de fenêtre façon navigateur, plusieurs fenêtres principales et un panneau du document dans les fenêtres de lecteur séparées.
weavero-pref-tabs-desc-native = Groupes d’onglets, habillage de fenêtre façon navigateur et outils pour travailler dans plusieurs fenêtres.
weavero-pref-tabs-groups =
    .label = Groupes d’onglets dans la barre d’onglets
weavero-pref-tabs-groups-desc = Groupez les onglets comme dans Firefox : clic droit sur un onglet → « Ajouter à un groupe d’onglets… » pour un groupe nommé et coloré. Cliquez sur la pastille du groupe pour le réduire ou le développer ; clic droit sur la pastille pour renommer, changer la couleur, dissocier ou fermer le groupe. Les groupes sont conservés après un redémarrage.
weavero-pref-tabs-split-view =
    .label = Vue scindée
weavero-pref-tabs-split-view-desc = Afficher deux onglets côte à côte, comme dans Firefox : clic droit sur un onglet → « Ajouter une vue scindée », ou sélectionnez deux onglets et choisissez « Ouvrir en vue scindée ». Dans la liste des documents, « Ouvrir le PDF en vue scindée » l’ouvre à côté de la bibliothèque ; les liens dans les notes et les commentaires proposent « Ouvrir le lien en vue scindée ». Faites glisser la barre entre les deux pour redimensionner. Les vues scindées sont conservées après un redémarrage.
weavero-pref-tabs-split-dock-desc = Pour garder un onglet en vue, faites un clic droit dessus → « Verrouiller l’onglet » : il passe sur le côté gauche de la fenêtre, et le côté droit affiche l’onglet que vous sélectionnez (verrouillez la bibliothèque, et un document que vous ouvrez depuis celle-ci s’ouvre à côté). L’onglet verrouillé est encadré en doré, avec un cadenas sur son icône ; quand vous êtes dessus, l’onglet affiché à côté est ombré. Cliquez sur l’onglet verrouillé pour réduire son côté et laisser la fenêtre à l’onglet où vous êtes ; cliquez de nouveau pour le faire revenir. Pour le déverrouiller, faites un clic droit dessus → « Déverrouiller l’onglet ».
weavero-pref-tabs-split-footer =
    .label = Afficher une étiquette sur chaque côté dont le panneau du document est fermé
weavero-pref-tabs-split-footer-desc = Dans une vue scindée, un côté dont le panneau du document est fermé affiche l’icône et le titre de son onglet dans son coin inférieur, avec un menu pour la vue scindée (séparer les onglets, les inverser, fermer les deux). Ouvrir le panneau du document de ce côté masque l’étiquette : l’en-tête du panneau nomme le document.
weavero-pref-tabs-library-pin-name =
    .label = Afficher le nom de l’onglet de la bibliothèque quand il est épinglé
weavero-pref-tabs-library-pin-name-desc = Un onglet Ma bibliothèque (ou d’une bibliothèque de groupe) épinglé affiche son icône et son nom, aussi large que le nom le demande, au lieu de l’icône seule. Cette option est le réglage par défaut de chaque onglet de bibliothèque ; « Afficher le nom de l’onglet », dans le menu contextuel d’un onglet épinglé, affiche ou masque le nom de cet onglet seul, et le choix propre de l’onglet l’emporte sur cette option.
weavero-pref-tabs-sessions =
    .label = Sessions d’onglets
weavero-pref-tabs-sessions-desc = Enregistrez des ensembles d’onglets nommés et passez de l’un à l’autre depuis la fenêtre « Lister tous les onglets ». Vos onglets actuels forment toujours la session courante ; « + Nouvelle session » ouvre un espace de travail vierge, et changer de session se fait en un clic. Désactivez cette option pour masquer l’interface des sessions et figer vos sessions enregistrées — elles restent en sommeil (jamais écrasées) et réapparaissent quand vous la réactivez.
weavero-pref-tabs-window-icons =
    .label = Icônes de barre des tâches par fenêtre (Windows)
weavero-pref-tabs-window-icons-desc = Donne à chaque fenêtre supplémentaire sa propre icône — l’icône de Zotero avec un badge carré coloré pour les fenêtres principales et un badge rond coloré pour les fenêtres de lecteur (la fenêtre primaire garde l’icône simple) — pour que les aperçus de la barre des tâches, la vue des tâches et Alt+Tab distinguent les fenêtres d’un coup d’œil, comme Chrome le fait pour les fenêtres de ses profils. Windows uniquement.
weavero-pref-tabs-window-icons-desc-native = Donne à chaque fenêtre supplémentaire sa propre icône — l’icône de Zotero avec un badge carré coloré (la fenêtre primaire garde l’icône simple) — pour que les aperçus de la barre des tâches, la vue des tâches et Alt+Tab distinguent les fenêtres d’un coup d’œil, comme Chrome le fait pour les fenêtres de ses profils. Windows uniquement.
weavero-pref-tabs-windows-only = Windows uniquement — sans effet sur ce système.
weavero-pref-tabs-taskbar-buttons =
    .label = Bouton de barre des tâches distinct pour chaque fenêtre (Windows)
weavero-pref-tabs-taskbar-buttons-desc = Donne à chaque fenêtre supplémentaire (principale et de lecteur) son propre bouton dans la barre des tâches avec son icône à badge, affiché sur l’écran où se trouve la fenêtre — au lieu de regrouper toutes les fenêtres derrière un seul bouton Zotero. Remarque : les fenêtres ainsi séparées quittent l’aperçu partagé. Désactivé par défaut.
weavero-pref-tabs-taskbar-buttons-desc-native = Donne à chaque fenêtre supplémentaire son propre bouton dans la barre des tâches avec son icône à badge, affiché sur l’écran où se trouve la fenêtre — au lieu de regrouper toutes les fenêtres derrière un seul bouton Zotero. Remarque : les fenêtres ainsi séparées quittent l’aperçu partagé. Désactivé par défaut.
weavero-pref-tabs-progress-window =
    .label = Boutons Réduire et Agrandir sur la fenêtre « Trouver le texte intégral »
weavero-pref-tabs-progress-window-desc = La fenêtre de progression de « Trouver le texte intégral » et de « Récupérer les métadonnées » reçoit les boutons Réduire et Agrandir dans sa barre de titre, et son bouton « Minimiser » la réduit au lieu de la fermer. Le travail continue dans les deux cas. Activé par défaut.
weavero-pref-tabs-title-glyphs =
    .label = Symbole du type de fenêtre dans les titres de fenêtre
weavero-pref-tabs-title-glyphs-desc = Alternative pour les systèmes autres que Windows (désactivée par défaut) : préfixe le titre de chaque fenêtre d’un petit symbole de type — ⚓ pour la fenêtre primaire, des carrés (■ □ ▣) pour les autres fenêtres principales, des cercles (● ○ ◉) pour les fenêtres de lecteur. Prend effet quand les titres se mettent à jour, par exemple au prochain changement d’onglet.
weavero-pref-tabs-title-glyphs-desc-native = Alternative pour les systèmes autres que Windows (désactivée par défaut) : préfixe le titre de chaque fenêtre d’un petit symbole de type — ⚓ pour la fenêtre primaire, des carrés (■ □ ▣) pour les autres fenêtres. Prend effet quand les titres se mettent à jour, par exemple au prochain changement d’onglet.
weavero-pref-tabs-window-name-title = Nom de la fenêtre dans son titre
weavero-pref-tabs-window-name-desc = Afficher le nom d’une fenêtre renommée dans son titre système — aperçus de la barre des tâches, Alt+Tab et vue des tâches — comme « Nommer la fenêtre » de Chrome. <strong>Avant le titre</strong> garde le contexte de la page (« Principale — Azam et al. ») ; <strong>Remplacer le titre</strong> n’affiche que le nom. Les fenêtres sans nom personnalisé gardent toujours le titre normal.
weavero-pref-tabs-window-name-off =
    .label = Désactivé
weavero-pref-tabs-window-name-prefix =
    .label = Avant le titre
weavero-pref-tabs-window-name-replace =
    .label = Remplacer le titre
weavero-pref-titlebar-title = Masquer la barre de titre
weavero-pref-titlebar-enable =
    .aria-label = Masquer la barre de titre (comme Firefox)
weavero-pref-titlebar-desc = Remplace la barre de titre par une barre façon navigateur — les menus s’effacent (appuyez sur Alt) et les boutons de la fenêtre passent dans la barre d’onglets. Windows / Linux uniquement.
weavero-pref-titlebar-apply = Appliquer à :
weavero-pref-titlebar-main =
    .label = Fenêtre principale
weavero-pref-titlebar-reader =
    .label = Fenêtre de lecteur
weavero-pref-titlebar-note =
    .label = Fenêtre de note
weavero-pref-titlebar-plugins-manager =
    .label = Gestionnaire d’extensions
weavero-pref-titlebar-note-deck =
    .label = Ouvrir les notes dans une fenêtre à onglets
weavero-pref-titlebar-note-deck-desc = Ouvrir une note dans une nouvelle fenêtre utilise une fenêtre de type lecteur qui accepte qu’on y glisse des onglets de PDF / de note. Nécessite que la barre de titre de la fenêtre de lecteur soit remplacée ci-dessus. Une note indépendante (sans parent) affiche brièvement un document temporaire à l’ouverture de la fenêtre.
weavero-pref-mainwin-title = Plusieurs fenêtres principales
weavero-pref-mainwin-native-note = Cette version de Zotero a ses propres fenêtres et onglets de bibliothèque : elle les ouvre, les déplace et les restaure elle-même, et les options propres aux fenêtres supplémentaires de Weavero sont désactivées ici. Les fenêtres enregistrées, les sessions d’onglets et la fenêtre de recherche avancée fonctionnent comme avant.
weavero-pref-mainwin-enable =
    .label = Ouvrir de nouvelles fenêtres principales
weavero-pref-mainwin-enable-desc = Une seconde fenêtre principale indépendante avec ses propres onglets, colonnes, filtres et largeurs de panneaux : Ctrl+N / ⌘N, <em>Fichier → Nouvelle fenêtre principale</em>, les entrées <em>Nouvelle fenêtre</em> des menus des onglets et des documents, et la recherche avancée dans une nouvelle fenêtre. Désactivé, aucune de ces commandes n’en ouvre.
weavero-pref-mainwin-restore =
    .label = Restaurer les fenêtres supplémentaires au redémarrage
weavero-pref-mainwin-restore-desc = Rouvrir les fenêtres supplémentaires qui étaient ouvertes quand Zotero redémarre.
weavero-pref-mainwin-adv-shortcut =
    .label = Ctrl+Maj+F / ⇧⌘F ouvre la recherche avancée dans une nouvelle fenêtre
weavero-pref-mainwin-adv-shortcut-desc = Le raccourci de recherche avancée de Zotero ouvre la recherche dans cette fenêtre. Avec cette option, il ouvre plutôt une nouvelle fenêtre sur la collection courante — comme Maj+clic sur l’entonnoir ou <em>Édition → Recherche avancée dans une nouvelle fenêtre</em>. Zotero 10.
weavero-pref-mainwin-adv-hide-panes =
    .label = Masquer les panneaux latéraux dans la fenêtre de recherche avancée
weavero-pref-mainwin-adv-hide-panes-desc = La fenêtre s’ouvre avec la recherche et ses résultats seulement — sans panneau des collections ni panneau du document — comme la fenêtre de recherche avancée séparée de Zotero 9. <em>Affichage → Mise en page</em> rétablit un panneau dans cette fenêtre.
weavero-pref-reader-pane-title = Panneau du document dans les fenêtres de lecteur séparées
weavero-pref-reader-pane-enable =
    .label = Afficher un panneau du document à côté du lecteur dans les fenêtres séparées
weavero-pref-reader-pane-desc = Ajoute le panneau d’informations / de contexte du document (sections, navigation latérale) aux fenêtres de lecteur indépendantes, comme le panneau droit de la fenêtre principale.
weavero-pref-extras-title = Divers
weavero-pref-extras-enable =
    .aria-label = Activer les compléments visuels
weavero-pref-extras-desc = De petits affichages informatifs ajoutés à l’interface existante de Zotero — badges dans la liste des documents, colonnes de la liste des documents et symboles dans la barre d’onglets.
weavero-pref-columns-title = Colonnes de la liste des documents
weavero-pref-columns-desc = Des colonnes supplémentaires, masquées tant que vous ne les activez pas dans le sélecteur de colonnes (clic droit sur l’en-tête de la liste des documents).
weavero-pref-columns-annotations =
    .label = Colonne « Annotations »
weavero-pref-columns-annotations-desc = Nombre d’annotations des pièces jointes (additionné sur l’ensemble des pièces jointes pour les documents ordinaires).
weavero-pref-columns-tags-auto =
    .label = Colonne « Marqueurs » — ajouter le nombre de marqueurs automatiques
weavero-pref-columns-tags-auto-desc = Affiche les marqueurs manuels (en bleu) et les marqueurs automatiques. Décochez pour n’afficher que le nombre de marqueurs manuels. C’est le réglage par défaut de chaque fenêtre : une fenêtre peut choisir pour elle-même dans le menu contextuel de l’en-tête de colonne (Marqueurs › Nombre de marqueurs automatiques).
weavero-pref-columns-related =
    .label = Colonne « Connexe »
weavero-pref-columns-related-desc = Nombre de documents connexes par ligne.
weavero-pref-columns-backlinks =
    .label = Colonne « Rétroliens »
weavero-pref-columns-backlinks-desc = Nombre de commentaires d’annotation et de notes ailleurs qui pointent vers le document, ses pièces jointes, notes ou annotations.
weavero-pref-columns-item-links =
    .label = Colonne « Liens de document »
weavero-pref-columns-item-links-desc = Nombre de documents Zotero vers lesquels pointent les notes et les commentaires d’annotation de la ligne par des liens Zotero ou des citations de note (un lien rompu est listé, pas compté).
weavero-pref-columns-ext-links =
    .label = Colonne « Liens externes »
weavero-pref-columns-ext-links-desc = Nombre de liens web et d’application écrits dans les notes et les commentaires d’annotation de la ligne (chaque lien une fois ; un lien zotero:// relève des Liens de document). Cliquez sur le nombre pour la liste.
weavero-pref-itemslist-title = Liste des documents et onglets
weavero-pref-itemslist-title-lines = Titres dans la liste des documents
weavero-pref-itemslist-title-lines-off =
    .label = Une ligne
weavero-pref-itemslist-title-lines-fixed =
    .label = Hauteur fixe
weavero-pref-itemslist-title-lines-adaptive =
    .label = Adapter à chaque titre
weavero-pref-itemslist-title-lines-lead = { $mode ->
        [fixed] Hauteur de
       *[other] Jusqu’à
    }
weavero-pref-itemslist-title-lines-unit = { $count ->
        [one] ligne
        [many] lignes
       *[other] lignes
    }
weavero-pref-itemslist-title-lines-desc = Hauteur fixe donne à chaque ligne la hauteur de ce nombre de lignes de texte. Adapter à chaque titre donne à chaque ligne la hauteur dont son titre a besoin, jusqu’à ce nombre de lignes. Les autres colonnes de texte passent à la ligne dans cette hauteur, et tout s’aligne en haut de la ligne. Un texte plus long se termine par des points de suspension, et les lignes enfants restent sur une seule ligne.
weavero-pref-itemslist-added-by =
    .label = Afficher Ajouté par pour les annotations
weavero-pref-itemslist-added-by-desc = Dans les bibliothèques de groupe, un badge avec l’auteur de l’annotation à côté de sa ligne.
weavero-pref-itemslist-added-by-colors =
    .label = Utiliser une couleur différente par utilisateur dans Ajouté par
weavero-pref-itemslist-added-by-colors-desc = Teinte le texte et le badge Ajouté par d’une couleur propre à chaque utilisateur. Décochez pour la couleur de texte par défaut.
weavero-pref-itemslist-group-glyph =
    .label = Symbole de bibliothèque de groupe + infobulle sur les onglets
weavero-pref-itemslist-group-glyph-desc = Un symbole de groupe sur l’icône de type de fichier des onglets dont le document est dans une bibliothèque de groupe, plus une infobulle plus détaillée.
weavero-pref-itemslist-tab-ring =
    .label = Onglets façon Firefox : arrondis, avec un contour sur l’onglet sélectionné
weavero-pref-itemslist-tab-ring-desc = Des onglets en forme de pastille, et un fin contour du violet à l’orange autour de l’onglet sélectionné, comme le nouveau design des onglets de Firefox. Décochez pour les onglets de Zotero : coins carrés et onglet sélectionné en relief.
weavero-pref-itemslist-layout-menu =
    .label = Affichage → Mise en page suit l’onglet
weavero-pref-itemslist-layout-menu-desc = Les entrées <em>Affichage → Mise en page</em> de Zotero basculent les panneaux de la bibliothèque quel que soit l’onglet au premier plan. Dans un onglet de lecteur, le sous-menu affiche plutôt les panneaux du lecteur — <em>Barre latérale</em>, <em>Panneau de contexte</em> et le <em>Sélecteur de couleurs et de marqueurs</em> au pied du panneau des annotations — avec leur état réel en coches ; un onglet de note affiche <em>Panneau de contexte</em> (et <em>Panneau du plan</em> avec Better Notes) ; l’onglet de la bibliothèque garde les entrées de Zotero. Une fenêtre de lecteur séparée a son propre sous-menu Mise en page. Désactivé, le menu est celui de Zotero tel quel.
weavero-pref-itemslist-layout-menu-desc-native = Les entrées <em>Affichage → Mise en page</em> de Zotero basculent les panneaux de la bibliothèque quel que soit l’onglet au premier plan. Dans un onglet de lecteur, le sous-menu affiche plutôt les panneaux du lecteur — <em>Barre latérale</em>, <em>Panneau de contexte</em> et le <em>Sélecteur de couleurs et de marqueurs</em> au pied du panneau des annotations — avec leur état réel en coches ; un onglet de note affiche <em>Panneau de contexte</em> (et <em>Panneau du plan</em> avec Better Notes) ; l’onglet de la bibliothèque garde les entrées de Zotero. Désactivé, le menu est celui de Zotero tel quel.
weavero-pref-collections-title = Panneau des collections
weavero-pref-collections-pane-toggle =
    .label = Bouton réduire / développer pour le panneau des collections
weavero-pref-collections-pane-toggle-desc = Un bouton à l’extrémité gauche de la barre d’outils, comme ceux du panneau du document et du lecteur. <em>Affichage → Mise en page</em> continue de fonctionner à côté.
weavero-pref-collections-tag-selector-handle =
    .label = Poignée sur le sélecteur de marqueurs : cliquez pour le réduire ou le développer
weavero-pref-collections-tag-selector-handle-desc = Une petite pastille sur le bord supérieur du sélecteur de marqueurs. Un clic replie le sélecteur contre ce bord, le suivant le fait revenir ; faire glisser le bord le redimensionne toujours. Un marqueur sélectionné continue de filtrer la liste pendant que le sélecteur est replié, et la pastille devient bleue pour le signaler. <em>Affichage → Mise en page → Sélecteur de marqueurs</em> montre le même état.
weavero-pref-collections-no-collapse =
    .label = Le redimensionnement d’un panneau latéral s’arrête à sa largeur minimale
weavero-pref-collections-no-collapse-desc = Faire glisser le bord d’un panneau latéral s’arrête à sa largeur la plus étroite au lieu de le fermer d’un coup : le panneau des collections, le panneau du document, le panneau de contexte des onglets de lecteur et le panneau du document des fenêtres de lecteur. Réduisez-les avec leurs boutons ou <em>Affichage → Mise en page</em>. Désactivé, ils se ferment tous d’un coup comme dans Zotero.
weavero-pref-collections-no-collapse-desc-native = Faire glisser le bord d’un panneau latéral s’arrête à sa largeur la plus étroite au lieu de le fermer d’un coup : le panneau des collections, le panneau du document et le panneau de contexte des onglets de lecteur. Réduisez-les avec leurs boutons ou <em>Affichage → Mise en page</em>. Désactivé, ils se ferment tous d’un coup comme dans Zotero.
weavero-pref-collections-sticky-parents =
    .label = Garder les collections parentes épinglées en haut pendant le défilement
weavero-pref-collections-sticky-lead = Jusqu’à
weavero-pref-collections-sticky-unit = { $count ->
        [one] niveau
        [many] niveaux
       *[other] niveaux
    }
weavero-pref-collections-sticky-parents-desc = Les parents des collections en haut du panneau restent épinglés au-dessus d’elles, comme dans l’arborescence de fichiers de VS Code. Cliquez sur un parent épinglé pour y aller ; sa flèche le réduit. Les deux arborescences du gestionnaire des collections et bibliothèques s’épinglent de la même façon.
weavero-pref-collections-search-folders =
    .label = Dossiers pour les recherches enregistrées
weavero-pref-collections-search-folders-names =
    .label = Lire aussi les dossiers dans le nom des recherches (Personnes/Étudiants/…)
weavero-pref-collections-search-folders-desc = Les recherches enregistrées peuvent être rangées dans des dossiers sous leur bibliothèque : faites glisser une recherche sur un dossier, ou faites un clic droit dessus : Déplacer dans le dossier. Weavero garde ces dossiers sur cet ordinateur ; rien ne change dans votre bibliothèque. Les dossiers ouverts sont enregistrés avec chaque session. Avec la seconde option, une recherche nommée « A/B/C » s’affiche comme « C » dans le dossier A › B, comme avec le module Saved Search Folders.
weavero-sf-move-to =
    .label = Déplacer dans le dossier
weavero-sf-unfiled =
    .label = Hors dossier
weavero-sf-new-folder =
    .label = Nouveau dossier…
weavero-sf-new-subfolder =
    .label = Nouveau sous-dossier…
weavero-sf-new-search-folder =
    .label = Nouveau dossier de recherches…
weavero-sf-rename-folder =
    .label = Renommer le dossier…
weavero-sf-move-folder =
    .label = Déplacer le dossier vers
weavero-sf-top-level =
    .label = Premier niveau
weavero-sf-delete-folder =
    .label = Supprimer le dossier
weavero-sf-folder-name-title = Dossier de recherches enregistrées
weavero-sf-folder-name-prompt = Nom du dossier :
weavero-sf-delete-confirm = Supprimer le dossier « { $name } » et { $count ->
        [one] son sous-dossier
       *[other] ses { $count } sous-dossiers
    } ? Les recherches enregistrées qu’ils contiennent restent dans votre bibliothèque, hors de tout dossier.
weavero-sf-name-folder = D’après le nom des recherches : { $path }
weavero-pref-collections-bookmarks-pane =
    .label = Panneau des marque-pages au-dessus des collections
weavero-pref-collections-bookmarks-pane-desc = Les marque-pages de votre bibliothèque dans un panneau au-dessus de l’arborescence des collections, un séparateur entre les deux. Cliquez sur son en-tête pour le replier ; son bouton ⇕ n’affiche que les marque-pages, à la place de l’arborescence des collections. Les dossiers s’ouvrent sur place, et les documents déposés sur le marque-page d’une collection vont dans cette collection. Chaque fenêtre garde sa propre disposition, enregistrée avec sa session. Le bouton Marque-pages au-dessus des collections reste.
weavero-bmpane-fold-tip = { $folded ->
        [yes] Déplier les marque-pages
       *[other] Replier les marque-pages
    }
weavero-bmpane-only-tip = { $on ->
        [yes] Afficher de nouveau l’arborescence des collections
       *[other] Marque-pages seuls : masquer l’arborescence des collections
    }
weavero-bmpane-now-tip = Affiché : { $name }. Cliquez pour montrer l’arborescence des collections avec cet élément.
weavero-bmpane-now-add = Ajouter un marque-page
weavero-bmpane-folder-current = Ce dossier contient ce qui est affiché
# The funnel above the collections pane (coll-funnel.ts): Settings.
weavero-pref-collections-funnel =
    .label = Entonnoir au-dessus du volet des collections
weavero-pref-collections-funnel-desc = Un bouton entonnoir dans la barre d’outils du volet des collections filtre ce que le volet affiche : collections, recherches enregistrées, flux, lignes spéciales (Doublons, Non classés, Corbeille…), chaque bibliothèque et les sections propres à Weavero. Cliquez sur une pastille pour n’afficher qu’elle, Alt+clic pour la masquer. Chaque fenêtre garde son propre filtre, enregistré avec sa session ; « Utiliser par défaut » dans l’entonnoir en fait le filtre de départ de chaque fenêtre.
weavero-pref-collfunnel-defaults-title = Affiché par défaut
weavero-pref-collfunnel-show-collections =
    .label = Collections
weavero-pref-collfunnel-show-searches =
    .label = Recherches enregistrées
weavero-pref-collfunnel-show-feeds =
    .label = Flux
weavero-pref-collfunnel-show-special =
    .label = Lignes spéciales
weavero-pref-collfunnel-show-bookmarks =
    .label = Volet des marque-pages
weavero-pref-collfunnel-show-folders =
    .label = Dossiers de recherches enregistrées
# The libraries the default leaves out. $mode: hidden, only or none; $names: the libraries.
weavero-pref-collfunnel-libs = { $mode ->
        [hidden] Bibliothèques masquées par défaut : { $names }
        [only] Bibliothèques affichées par défaut : uniquement { $names }
       *[none] Toutes les bibliothèques sont affichées par défaut.
    }
weavero-pref-collfunnel-libs-reset = Réinitialiser
# The funnel's button. $active: yes when it filters; $parts: what it filters.
weavero-cf-tb-tip = { $active ->
        [yes] Filtre du volet des collections : { $parts }
       *[no] Filtrer le volet des collections
    }
# The funnel's rows of chips.
weavero-cf-row-kinds = Types
weavero-cf-row-libs = Bibliothèques
weavero-cf-row-secs = Sections de Weavero
weavero-cf-kind-collections = Collections
weavero-cf-kind-searches = Recherches enregistrées
weavero-cf-kind-feeds = Flux
weavero-cf-kind-special = Lignes spéciales
weavero-cf-kind-special-tip = Doublons, Non classés, Lectures récentes, Documents rétractés, Mes publications et Corbeille
weavero-cf-sec-bookmarks = Volet des marque-pages
weavero-cf-sec-folders = Dossiers de recherches enregistrées
weavero-cf-hint = Clic : n’afficher que cela. Alt+clic : masquer.
# What a row filters, in the button's tooltip. $mode: only or hide; $names: the chips.
weavero-cf-part = { $mode ->
        [only] uniquement { $names }
       *[hide] sans { $names }
    }
# The footer's line. $scope: window (this window's own filter) or default.
weavero-cf-scope = { $scope ->
        [window] Filtre propre à cette fenêtre
       *[default] Suit le filtre par défaut
    }
    .title = { $scope ->
        [window] Cette fenêtre s’écarte du filtre par défaut ; « Revenir au défaut » le suit de nouveau.
       *[default] Cette fenêtre affiche le filtre par défaut, que « Utiliser par défaut » modifie.
    }
weavero-cf-use-default = Utiliser par défaut
    .title = Faire de ce filtre, tel quel, le filtre de départ de chaque fenêtre
weavero-cf-reset-default = Revenir au défaut
    .title = Revenir au filtre par défaut dans cette fenêtre
# Where the funnel leaves nothing in the tree.
weavero-cf-empty = Rien ne correspond à l’entonnoir.
weavero-cf-empty-clear = Effacer
weavero-pref-collections-sticky-headers =
    .label = Garder les en-têtes de section épinglés en haut du panneau du document pendant le défilement
weavero-pref-collections-sticky-headers-desc = L’en-tête de chaque section reste épinglé en haut du panneau du document pendant que sa section défile, l’en-tête suivant le poussant dehors ; dans Liens de document, Rétroliens et les sections Marqueurs et Connexe élargies, le titre de la partie dont les lignes défilent reste sous lui. Un clic sur un en-tête épinglé réduit toujours sa section. Dans le panneau du document de la bibliothèque et dans les panneaux de contexte des onglets de lecteur et de note.
weavero-pref-collections-path-tooltip =
    .label = Afficher le chemin complet d’une collection au survol
weavero-pref-collections-indent-guides =
    .label = Repères d’indentation dans le panneau des collections
weavero-pref-collections-indent-guides-desc = Une fine ligne verticale pour chaque niveau, pour que les collections sœurs s’alignent visuellement.
weavero-pref-plugins-title = Gestionnaire d’extensions
weavero-pref-plugins-extras =
    .label = Compléments du gestionnaire d’extensions (champ de recherche, détails des cartes, fenêtre normale)
weavero-pref-plugins-extras-desc = Outils → Extensions reçoit un champ de recherche (Ctrl+F le sélectionne, × l’efface), des cartes indiquant auteur [propriétaire GitHub] · version · dernière mise à jour, une fenêtre normale avec réduire/agrandir (avec <em>Masquer la barre de titre → Gestionnaire d’extensions</em> activé, la disposition de barre de titre de la fenêtre principale ; désactivé, la barre de titre et la barre de menus du système), et Mises à jour récentes toujours visible, avec un menu sur son titre pour la période couverte (du dernier jour à tout ; celle de Zotero s’arrête à 2 jours), mémorisée. Le gestionnaire se rouvre sur la liste des extensions. Sur Zotero 11, dont le gestionnaire masque sa barre latérale, la barre latérale revient avec Extensions et Mises à jour récentes (et Mises à jour disponibles tant que des mises à jour sont en attente).
weavero-pref-defatt-title = Pièce jointe par défaut
weavero-pref-defatt-enable =
    .label = Ouvrir une pièce jointe ou une note choisie au lieu du choix automatique de Zotero
weavero-pref-defatt-desc = Faites un clic droit sur n’importe quel enfant d’un document — pièce jointe (PDF ou non), lien URL ou note — et choisissez <b>▶️ Définir comme pièce jointe par défaut</b> pour ouvrir celui-ci au lieu du choix habituel de Zotero. Le choix est stocké sous forme du marqueur <b>▶️ wv-defatt</b> sur cet enfant : il se synchronise avec vos autres appareils et subsiste sans Weavero. Recherchez <b>wv-defatt</b> (ou le symbole ▶️) pour lister tous les éléments marqués ; le marqueur ne contient volontairement aucun mot ordinaire, pour ne jamais apparaître dans des recherches sans rapport. Désactiver cette option arrête le remplacement mais conserve vos choix.
weavero-pref-defatt-sort-default =
    .label = Afficher la pièce jointe par défaut en premier dans la liste des pièces jointes
weavero-pref-defatt-sort-auto =
    .label = Afficher le choix automatique de Zotero en premier quand aucune pièce jointe par défaut n’est définie
weavero-pref-defatt-mark-auto =
    .label = Marquer le choix automatique d’un ▷ estompé dans la liste des documents
weavero-pref-defatt-sort-desc = Avec les deux options ci-dessus, ce qui s’ouvre au double-clic se trouve à la première ligne des pièces jointes d’un document. Le <b>▷</b> estompé indique toujours le choix automatique de Zotero — pour voir ce qui s’ouvrirait si la pièce jointe par défaut choisie était retirée — tandis qu’une pièce jointe par défaut choisie garde son marqueur plein <b>▶️</b>.
weavero-pref-defatt-import = Vous venez de <b>Default Attachment</b> de <b>PikaPei</b> ? Vos choix sont importés automatiquement au premier démarrage de Weavero, et les données de cette extension restent intactes — voir le README pour les supprimer à la main quand vous n’en avez plus besoin.
weavero-pref-ext-viewer-title = Visionneuse externe
weavero-pref-ext-viewer-enable =
    .label = « Ouvrir dans une visionneuse externe » dans les menus des documents / onglets
weavero-pref-ext-viewer-desc = Lance la meilleure pièce jointe d’un document avec l’application par défaut du système (PDF, EPUB, capture, image, …). Activé par défaut.
weavero-pref-undo-title = Annulation
weavero-pref-undo-buttons =
    .label = Flèches Annuler / Répéter dans la barre d’outils du lecteur
weavero-pref-undo-buttons-desc = Deux flèches après les outils d’annotation : cliquez pour annuler ou répéter la dernière étape de l’onglet de lecteur (table des matières, marque-pages, annotations), clic droit pour l’historique. Ctrl+Z, Ctrl+Y et Édition → Annuler fonctionnent dans tous les cas. Activé par défaut.
weavero-pref-link-preview-title = Aperçus de liens
weavero-pref-link-preview-entry =
    .label = Marquer toute la référence dans les aperçus de liens
weavero-pref-link-preview-entry-desc = Quand le pointeur s’arrête sur une citation, l’aperçu de la liste de références marque chaque ligne de l’entrée citée d’une légère teinte rouge, au lieu du cadre sombre de Zotero sur sa première ligne. Désactivé : l’aperçu de Zotero tel quel. Activé par défaut.
weavero-pref-outline-title = Table des matières du lecteur
weavero-pref-outline-highlight =
    .label = Surligner le texte du titre au clic sur une entrée de la table des matières
weavero-pref-outline-highlight-desc = Fait clignoter le texte réel du titre au clic, dans les PDF, EPUB et captures, et dans une note depuis son plan ; pour les tables des matières intégrées aux PDF, Weavero trouve le titre sur la page. Correspondance au mieux — les pages numérisées ou les polices inhabituelles peuvent simplement sauter à la page sans surlignage.
weavero-pref-outline-page-numbers =
    .label = Afficher les numéros de page à côté des entrées de la table des matières
weavero-pref-outline-page-numbers-desc = L’étiquette « p. N » à droite de chaque entrée. Faites un clic droit sur l’onglet Table des matières d’un lecteur pour les afficher ou les masquer pour ce document seulement.
weavero-pref-outline-size-title = Taille du texte de la table des matières
weavero-pref-outline-size-desc = <strong>Table des matières Zotero</strong> et <strong>Panneau du document Zotero</strong> suivent <em>Affichage → Taille des caractères</em> (les tailles indiquées sont les tailles actuelles) ; <strong>Fixe</strong> reste à la taille choisie quelle que soit la taille des caractères. Faites un clic droit sur l’onglet Table des matières d’un lecteur pour choisir une taille pour ce document seulement.
weavero-pref-outline-size-zotero =
    .label = Table des matières Zotero (par défaut)
weavero-pref-outline-size-item-pane =
    .label = Panneau du document Zotero
weavero-pref-outline-size-zotero-px =
    .label = Table des matières Zotero, { $px } px (par défaut)
weavero-pref-outline-size-item-pane-px =
    .label = Panneau du document Zotero, { $px } px
weavero-pref-outline-size-fixed =
    .label = Fixe :
weavero-pref-outline-size-px =
    .label = { $px } px
weavero-pref-outline-keys-title = Raccourcis clavier pour ajouter des entrées
weavero-pref-outline-keys-desc = Aucun n’est défini d’origine. Cliquez dans un champ et appuyez sur les touches voulues — une seule lettre fonctionne aussi ; les combinaisons déjà utilisées par Zotero ou le lecteur sont refusées. Ils fonctionnent dans les onglets de lecteur, jamais pendant la saisie dans un champ de texte, et s’affichent à côté des entrées de menu correspondantes.
weavero-pref-outline-key-selection = Ajouter le texte sélectionné
weavero-pref-outline-key-remove = Supprimer
weavero-pref-outline-key-pin = Épingler un endroit
weavero-pref-outline-key-page-top = Haut de page (PDF)
weavero-pref-outline-key-page-bottom = Bas de page (PDF)
weavero-pref-notes-title = Notes
weavero-pref-notes-outline =
    .label = Plan à côté des notes
weavero-pref-notes-outline-desc = Un panneau listant les titres de la note à gauche de celle-ci, avec la section que vous lisez marquée. Cliquez sur un titre pour y aller ; faites un clic droit pour copier un lien vers lui. Ouvert par défaut dans les onglets et fenêtres de note, replié dans le panneau du document et à côté d’un lecteur — le bouton de barre latérale à l’extrémité gauche de la barre d’outils de la note l’affiche ou le masque. Avec Better Notes installé, ce plan remplace son panneau gauche dans les onglets de note ; décochez cette option pour retrouver ce panneau, avec ses cartes mentales et en bulles.
weavero-pref-notes-folding =
    .label = Flèches de repli sur les titres et les listes des notes
weavero-pref-notes-folding-desc = Une flèche dans la marge avant chaque titre masque tout ce qui se trouve en dessous, jusqu’au titre suivant de niveau égal ou supérieur. Une flèche avant un élément de liste, à puces ou numérotée, masque tout ce qui suit sa première ligne : ses sous-éléments et ses paragraphes suivants. <em>Tout replier</em> et <em>Tout déplier</em> à la fin du menu contextuel de la note agissent sur toute la note d’un coup. Seul l’affichage change — la note elle-même n’est pas modifiée, et quiconque n’a pas Weavero voit la note entière. Les replis sont mémorisés par note sur cet ordinateur. Les deux options nécessitent <em>Liens et relations → Notes : Éditeur</em>.
weavero-pref-annpane-title = Panneau des annotations du lecteur
weavero-pref-annpane-reader-funnel =
    .label = Entonnoir au-dessus du lecteur
weavero-pref-annpane-reader-funnel-desc = Filtre les annotations du document à la fois sur la page et dans le panneau des annotations — par couleur, type, marqueur, commentaire, personne ou date. Désactivé, le bouton disparaît et son filtre est mis de côté : toutes les annotations réapparaissent, sauf celles que filtre le sélecteur de couleurs et de marqueurs de Zotero. Réactivé, un document ouvert retrouve son filtre.
weavero-pref-annpane-funnel =
    .label = Entonnoir à côté du champ de recherche du panneau
weavero-pref-annpane-funnel-desc = Contrairement à l’entonnoir au-dessus du lecteur, qui masque aussi les annotations sur la page, celui-ci restreint seulement le panneau des annotations — par couleur, type, marqueur, commentaire, personne ou date — et la page garde toutes les annotations. Mêmes pastilles et mêmes gestes. Chaque document garde son propre filtre ; les types ci-dessous sont le point de départ de tous. Entonnoir désactivé, le panneau suit simplement les types ci-dessous.
weavero-pref-annpane-selector-handle =
    .label = Poignée sur le sélecteur de couleurs et de marqueurs de Zotero au pied du panneau
weavero-pref-annpane-selector-handle-desc = Une petite pastille sur le bord supérieur du sélecteur : un clic replie le sélecteur contre ce bord, le suivant le fait revenir — un seul état pour tous les documents, conservé après un redémarrage (affiché au départ). <em>Affichage → Mise en page → Sélecteur de couleurs et de marqueurs</em> masque entièrement le sélecteur, pastille comprise, comme le fait l’entrée Sélecteur de marqueurs de la bibliothèque. Ouvert, le sélecteur filtre le panneau et le document ensemble, et une annotation déposée sur une couleur ou un marqueur le reçoit (Maj pour le retirer). Une sélection reste active pendant le repli ; la pastille devient bleue pour le signaler. Désactivé, le sélecteur est toujours affiché, comme dans Zotero.
weavero-pref-annpane-types-title = Types d’annotation affichés dans le panneau
weavero-pref-annpane-types-desc = Décochez un type pour l’exclure du panneau dans tous les documents ; il reste visible sur la page. L’entonnoir peut passer outre pour un document, et son « Utiliser par défaut » écrit ici.
weavero-pref-annpane-type-highlight =
    .label = Surlignages
weavero-pref-annpane-type-underline =
    .label = Soulignements
weavero-pref-annpane-type-note =
    .label = Notes
weavero-pref-annpane-type-image =
    .label = Images
weavero-pref-annpane-type-ink =
    .label = Annotations manuscrites
weavero-pref-annpane-type-text =
    .label = Texte
weavero-pref-debug-title = Débogage
weavero-pref-debug-enable =
    .label = Activer la journalisation de débogage
weavero-pref-debug-desc = Émet une activité détaillée via Zotero.debug (Aide → Journal de débogage → Voir le journal). À laisser désactivé en usage normal.
weavero-pref-about-title = À propos
weavero-pref-about-homepage = Page d’accueil — GitHub
weavero-pref-about-bug-report = Signaler un bug / demander une fonctionnalité

# ---- Menus (localisation slice 2, 2026-11-11) ---------------------------
weavero-menu-copy-as =
    .label = Copier en tant que
weavero-menu-copy-as-citation =
    .label = Citation
weavero-menu-copy-as-bibliography =
    .label = Bibliographie
weavero-menu-copy-as-citation-key =
    .label = Clé de citation
weavero-menu-copy-as-select-link =
    .label = { $collection ->
        [yes] Lien de sélection (avec la collection)
       *[no] Lien de sélection
    }
weavero-menu-copy-as-select-links-separate =
    .label = { $collection ->
        [yes] Liens de sélection (un lien par document) (avec la collection)
       *[no] Liens de sélection (un lien par document)
    }
weavero-menu-copy-as-open-links-separate =
    .label = Liens d’ouverture (un lien par document)
weavero-menu-copy-as-open-link =
    .label = { $external ->
        [yes] Lien d’ouverture (application externe)
       *[no] Lien d’ouverture
    }
weavero-menu-copy-as-online-link =
    .label = Lien vers la bibliothèque en ligne
weavero-menu-copy-as-bbt-bibtex =
    .label = [BBT] BibTeX
weavero-menu-copy-as-bbt-biblatex =
    .label = [BBT] BibLaTeX
weavero-menu-items-add-related =
    .label = { $count ->
        [one] Ajouter un document connexe…
        [many] Ajouter des documents connexes…  ({ $count } documents)
       *[other] Ajouter des documents connexes…  ({ $count } documents)
    }
weavero-menu-open-external-viewer =
    .label = Ouvrir dans une visionneuse externe
weavero-menu-items-open-in =
    .label = { $type ->
        [pdf] { $count ->
            [one] Ouvrir le PDF dans
            [many] Ouvrir les PDF dans
           *[other] Ouvrir les PDF dans
        }
        [epub] { $count ->
            [one] Ouvrir l’EPUB dans
            [many] Ouvrir les EPUB dans
           *[other] Ouvrir les EPUB dans
        }
        [snapshot] { $count ->
            [one] Ouvrir la capture dans
            [many] Ouvrir les captures dans
           *[other] Ouvrir les captures dans
        }
        [image] { $count ->
            [one] Ouvrir l’image dans
            [many] Ouvrir les images dans
           *[other] Ouvrir les images dans
        }
        [video] { $count ->
            [one] Ouvrir la vidéo dans
            [many] Ouvrir les vidéos dans
           *[other] Ouvrir les vidéos dans
        }
        [audio] Ouvrir l’audio dans
        [text] Ouvrir le texte dans
        [file] { $count ->
            [one] Ouvrir le fichier dans
            [many] Ouvrir les fichiers dans
           *[other] Ouvrir les fichiers dans
        }
        [note] { $count ->
            [one] Ouvrir la note dans
            [many] Ouvrir les notes dans
           *[other] Ouvrir les notes dans
        }
       *[mixed] Ouvrir dans
    }
weavero-menu-items-open-several =
    .label = Ouvrir { $count } { $kind ->
        [pdf] { $count ->
            [one] PDF
           *[other] PDFs
        }
        [epub] { $count ->
            [one] EPUB
           *[other] EPUBs
        }
        [snapshot] { $count ->
            [one] capture
           *[other] captures
        }
        [note] { $count ->
            [one] note
           *[other] notes
        }
        [attachment] { $count ->
            [one] pièce jointe
           *[other] pièces jointes
        }
       *[item] { $count ->
            [one] document
           *[other] documents
        }
    } { $where ->
        [tabs] { $count ->
            [one] dans un nouvel onglet
           *[other] dans de nouveaux onglets
        }
        [window] { $count ->
            [one] dans une nouvelle fenêtre
           *[other] dans une seule nouvelle fenêtre
        }
       *[windows] { $count ->
            [one] dans une nouvelle fenêtre
           *[other] dans des fenêtres séparées
        }
    }
weavero-menu-group-unnamed =
    .label = Groupe
weavero-menu-new-group =
    .label = Nouveau groupe
weavero-menu-collection-open-new-window =
    .label = Ouvrir dans une nouvelle fenêtre
    .acceltext = Clic du milieu
weavero-menu-collection-copy-link =
    .label = Copier le lien de la collection
weavero-menu-collection-copy-search-link =
    .label = Copier le lien de la recherche enregistrée
weavero-menu-colpick-show-column =
    .label = Afficher la colonne
weavero-menu-colpick-auto-tag-count =
    .label = Nombre de marqueurs automatiques
weavero-menu-file-new-tab =
    .label = Nouvel onglet…
weavero-menu-file-new-reader-window =
    .label = Nouvelle fenêtre de lecteur…
weavero-menu-file-new-main-window =
    .label = Nouvelle fenêtre principale
weavero-menu-file-people =
    .label = Chercheurs
weavero-menu-edit-advanced-search-new-window =
    .label = Recherche avancée dans une nouvelle fenêtre
    .acceltext = Maj+clic
weavero-menu-advsearch-open =
    .label = Ouvrir la recherche avancée
weavero-menu-advsearch-open-new-window =
    .label = Ouvrir dans une nouvelle fenêtre
    .acceltext = Maj+clic / clic du milieu
weavero-menu-advsearch-open-new-tab =
    .label = Ouvrir dans un nouvel onglet
    .acceltext = { $platform ->
        [mac] ⌘clic
       *[other] Ctrl+clic
    }
weavero-menu-hid-hide-several =
    .label = { $what ->
        [collections] Masquer { $count } collections
        [searches] Masquer { $count } recherches enregistrées
        [collections-searches] Masquer { $count } collections et recherches enregistrées
        [feeds] Masquer { $count } flux
        [groups] Masquer { $count } bibliothèques de groupe
       *[libraries] Masquer { $count } bibliothèques
    }
weavero-menu-hid-manage =
    .label = Gérer les éléments masqués…
weavero-menu-hid-show =
    .label = { $what ->
        [collections-libraries] Afficher les collections et bibliothèques masquées
        [libraries] Afficher les bibliothèques masquées
        [groups] Afficher les bibliothèques de groupe masquées
        [feeds] Afficher les flux masqués
       *[collections] Afficher les collections masquées
    }
weavero-menu-hid-show-all =
    .label = Tout afficher ({ $count })
weavero-menu-hid-saved-search =
    .label = { $name } (recherche enregistrée)
weavero-menu-hid-all-windows =
    .label = { $name } (toutes les fenêtres)
weavero-menu-hidmgr-new-subcollection =
    .label = Nouvelle sous-collection…
weavero-menu-hidmgr-rename =
    .label = Renommer
weavero-menu-hidmgr-hide =
    .label = { $count ->
        [one] Masquer →
        [many] Masquer { $count } →
       *[other] Masquer { $count } →
    }
weavero-menu-hidmgr-show =
    .label = { $count ->
        [one] ← Afficher
        [many] ← Afficher { $count }
       *[other] ← Afficher { $count }
    }
weavero-menu-hidmgr-delete-collections =
    .label = { $count ->
        [one] Supprimer la collection…
        [many] Supprimer les collections…
       *[other] Supprimer les collections…
    }
weavero-menu-hidmgr-delete-searches =
    .label = { $count ->
        [one] Supprimer la recherche…
        [many] Supprimer les recherches…
       *[other] Supprimer les recherches…
    }
weavero-menu-hidmgr-delete-collections-items =
    .label = { $count ->
        [one] Supprimer la collection et ses documents…
        [many] Supprimer les collections et leurs documents…
       *[other] Supprimer les collections et leurs documents…
    }
weavero-menu-hidmgr-export =
    .label = Exporter…
weavero-menu-reader-ann-add-to-bookmarks =
    .label = { $count ->
        [one] Ajouter aux marque-pages
        [many] Ajouter aux marque-pages  ({ $count } annotations)
       *[other] Ajouter aux marque-pages  ({ $count } annotations)
    }
weavero-menu-reader-ann-copy-text =
    .label = { $type ->
        [highlight] { $count ->
            [one] Copier le texte surligné
            [many] Copier le texte surligné  ({ $count } annotations)
           *[other] Copier le texte surligné  ({ $count } annotations)
        }
        [underline] { $count ->
            [one] Copier le texte souligné
            [many] Copier le texte souligné  ({ $count } annotations)
           *[other] Copier le texte souligné  ({ $count } annotations)
        }
       *[mixed] { $count ->
            [one] Copier le texte de l’annotation
            [many] Copier le texte des annotations  ({ $count } annotations)
           *[other] Copier le texte des annotations  ({ $count } annotations)
        }
    }
weavero-menu-reader-ann-copy-select-link =
    .label = { $count ->
        [one] Copier le lien de sélection
        [many] Copier les liens de sélection  ({ $count } annotations)
       *[other] Copier les liens de sélection  ({ $count } annotations)
    }
weavero-menu-reader-ann-copy-open-link =
    .label = { $count ->
        [one] Copier le lien d’ouverture
        [many] Copier les liens d’ouverture  ({ $count } annotations)
       *[other] Copier les liens d’ouverture  ({ $count } annotations)
    }
weavero-menu-reader-ann-add-related =
    .label = { $count ->
        [one] Ajouter un document connexe…
        [many] Ajouter des documents connexes…  ({ $count } annotations)
       *[other] Ajouter des documents connexes…  ({ $count } annotations)
    }
weavero-menu-reader-copy-link-selection =
    .label = Copier le lien vers le texte sélectionné
weavero-menu-reader-copy-link-page =
    .label = Copier le lien vers cette page
weavero-menu-reader-copy-link-position =
    .label = Copier le lien vers cette position
weavero-menu-reader-copy-link-location =
    .label = Copier le lien vers cet emplacement
weavero-menu-tab-view-online =
    .label = Afficher en ligne
weavero-menu-tab-show-file =
    .label = { $platform ->
        [mac] Afficher dans Finder
       *[other] Localiser le fichier
    }
weavero-menu-tab-pin =
    .label = { $action ->
        [unpin] { $count ->
            [one] Désépingler l’onglet
            [many] Désépingler { $count } onglets
           *[other] Désépingler { $count } onglets
        }
       *[pin] { $count ->
            [one] Épingler l’onglet
            [many] Épingler { $count } onglets
           *[other] Épingler { $count } onglets
        }
    }
weavero-menu-tab-pin-name =
    .label = Afficher le nom de l’onglet
weavero-menu-tab-move-tabs =
    .label = Déplacer les onglets
weavero-menu-tab-close =
    .label = { $count ->
        [one] Fermer l’onglet
        [many] Fermer { $count } onglets
       *[other] Fermer { $count } onglets
    }
weavero-menu-tab-duplicate =
    .label = { $count ->
        [one] Dupliquer l’onglet
        [many] Dupliquer { $count } onglets
       *[other] Dupliquer { $count } onglets
    }
weavero-menu-tab-group-tabs =
    .label = { $count ->
        [one] Grouper l’onglet
        [many] Grouper les onglets
       *[other] Grouper les onglets
    }
weavero-menu-tab-reopen-closed-group =
    .label = Rouvrir le groupe fermé
weavero-menu-tab-reopen-closed-window =
    .label = { $count ->
        [one] Rouvrir la fenêtre fermée
        [many] Rouvrir la fenêtre fermée ({ $count } onglets)
       *[other] Rouvrir la fenêtre fermée ({ $count } onglets)
    }
weavero-menu-window-rename =
    .label = Renommer la fenêtre…
weavero-menu-window-convert =
    .label = { $to ->
        [main] Convertir en fenêtre principale
       *[reader] Convertir en fenêtre de lecteur
    }
weavero-menu-window-save-close =
    .label = Enregistrer et fermer la fenêtre
weavero-menu-window-move-to =
    .label = Déplacer la fenêtre vers
weavero-menu-window-reopen =
    .label = Rouvrir la fenêtre
weavero-menu-window-delete-saved =
    .label = Supprimer la fenêtre enregistrée
weavero-menu-session-unnamed =
    .label = Session
weavero-menu-window-delete-from-session =
    .label = Supprimer la fenêtre de la session
weavero-menu-session-switch =
    .label = Passer à cette session
weavero-menu-session-rename =
    .label = Renommer…
weavero-menu-session-delete =
    .label = Supprimer
weavero-menu-session-rename-current =
    .label = Renommer la session…
weavero-menu-session-sort =
    .label = { $sort ->
        [name] Nom
        [lastUsed] Dernière utilisation
       *[created] Date de création
    }
weavero-menu-default-hint = (par défaut)
weavero-menu-move-target-here =
    .label = { $name }  (ici)
weavero-menu-group-target-window =
    .label = { $where ->
        [group-home] { $name }  (le groupe est ici)
       *[this-window] { $name }  (cette fenêtre)
    }
weavero-menu-move-new-window =
    .label = Nouvelle fenêtre
weavero-menu-group-rename =
    .label = Renommer le groupe…
weavero-menu-group-move-to =
    .label = { $saved ->
        [yes] Ouvrir le groupe dans
       *[no] Déplacer le groupe vers
    }
weavero-menu-group-save-close =
    .label = Enregistrer et fermer le groupe
weavero-menu-group-delete =
    .label = Supprimer le groupe
weavero-menu-tab-remove-from-group =
    .label = { $count ->
        [one] Retirer du groupe d’onglets
        [many] Retirer { $count } onglets du groupe
       *[other] Retirer { $count } onglets du groupe
    }
weavero-menu-groupeditor-move-to =
    .label = Déplacer le groupe vers
weavero-menu-groupeditor-copy-links =
    .label = { $count ->
        [one] Copier { $count } lien du groupe
        [many] Copier les { $count } liens du groupe
       *[other] Copier les { $count } liens du groupe
    }
weavero-menu-groupeditor-save-close =
    .label = Enregistrer et fermer le groupe
weavero-menu-groupeditor-ungroup =
    .label = Dissocier les onglets
weavero-menu-groupeditor-delete =
    .label = Supprimer le groupe
weavero-reader-toolbar-more =
    .label = Plus d’outils
weavero-menu-split-add =
    .label = Ajouter une vue scindée
weavero-menu-split-open =
    .label = Ouvrir en vue scindée
weavero-menu-split-separate =
    .label = Séparer la vue scindée
weavero-menu-split-reverse =
    .label = Inverser les onglets
weavero-menu-split-separate-tabs =
    .label = Séparer les onglets
weavero-menu-split-close-both =
    .label = Fermer les deux onglets
weavero-menu-items-open-split =
    .label = { $type ->
        [pdf] Ouvrir le PDF en vue scindée
        [epub] Ouvrir l’EPUB en vue scindée
        [snapshot] Ouvrir la capture en vue scindée
       *[note] Ouvrir la note en vue scindée
    }
weavero-menu-split-follow =
    .label = Suivre le document sélectionné
weavero-menu-split-keep =
    .label = Garder le document dans un nouvel onglet
weavero-split-follow-open = Ouvrir
    .title = Ouvrir dans le lecteur de Zotero, ici, pour lire et annoter (ou double-cliquez sur l’aperçu)
weavero-split-follow-failed = Aucun aperçu pour ce document. Cliquez sur son onglet pour l’ouvrir.
weavero-menu-lock-tab =
    .label = { $action ->
        [unlock] Déverrouiller l’onglet
       *[lock] Verrouiller l’onglet
    }
weavero-menu-lock-collapse =
    .label = { $collapsed ->
        [yes] Développer l’onglet verrouillé
       *[no] Réduire l’onglet verrouillé
    }
weavero-dock-tab-tip = { $collapsed ->
        [yes] Onglet verrouillé, réduit. Cliquez pour le développer.
       *[no] Onglet verrouillé. Cliquez pour le réduire.
    }
weavero-menu-note-fold-section =
    .label = { $folded ->
        [yes] Déplier la section
       *[no] Replier la section
    }
weavero-menu-note-fold-all =
    .label = Tout replier
weavero-menu-note-unfold-all =
    .label = Tout déplier
weavero-menu-note-heading-link =
    .label = { $kind ->
        [open] Copier le lien d’ouverture vers le titre
       *[select] Copier le lien de sélection vers le titre
    }
weavero-menu-note-heading-link-readonly =
    .label = { $kind ->
        [open] Copier le lien d’ouverture vers le titre
       *[select] Copier le lien de sélection vers le titre
    }
    .tooltiptext = Cette note est en lecture seule, et le titre n’a pas encore d’ancre de lien.
weavero-menu-outline-toggle =
    .label = { $shut ->
        [yes] Développer
       *[no] Réduire
    }
weavero-menu-outline-expand-all =
    .label = Tout développer
weavero-menu-outline-collapse-all =
    .label = Tout réduire
weavero-open-card-foot = Clic pour ouvrir · { $platform ->
        [mac] ⌘clic
       *[other] Ctrl+clic
    } : à côté · Maj+clic : nouvelle fenêtre · Clic du milieu : onglet en arrière-plan (une note : au premier plan) · Clic droit pour plus d’options
weavero-open-card-foot-library = Clic : ouvrir dans la bibliothèque · { $platform ->
        [mac] ⌘clic
       *[other] Ctrl+clic
    } : à côté · Maj+clic : nouvelle fenêtre · Clic du milieu : onglet en arrière-plan (une note : au premier plan)
weavero-menu-notelink-open-split =
    .label = Ouvrir le lien en vue scindée
weavero-menu-notelink-copy =
    .label = Copier le lien
weavero-menu-notelink-edit =
    .label = Modifier le lien…
weavero-menu-notelink-unlink =
    .label = Délier
weavero-menu-ref-copy-link =
    .label = Copier le lien
weavero-menu-ref-show-in-source =
    .label = Afficher dans la source
weavero-menu-ref-add-related =
    .label = Ajouter comme document connexe
weavero-menu-open-type-in =
    .label = { $type ->
        [pdf] { $where ->
            [window] Ouvrir le PDF dans une nouvelle fenêtre
           *[tab] Ouvrir le PDF dans un nouvel onglet
        }
        [epub] { $where ->
            [window] Ouvrir l’EPUB dans une nouvelle fenêtre
           *[tab] Ouvrir l’EPUB dans un nouvel onglet
        }
        [snapshot] { $where ->
            [window] Ouvrir la capture dans une nouvelle fenêtre
           *[tab] Ouvrir la capture dans un nouvel onglet
        }
        [note] { $where ->
            [window] Ouvrir la note dans une nouvelle fenêtre
           *[tab] Ouvrir la note dans un nouvel onglet
        }
       *[attachment] { $where ->
            [window] Ouvrir la pièce jointe dans une nouvelle fenêtre
           *[tab] Ouvrir la pièce jointe dans un nouvel onglet
        }
    }
weavero-menu-open-annotation-in =
    .label = { $type ->
        [pdf] { $where ->
            [window] Ouvrir dans le PDF, dans une nouvelle fenêtre
           *[tab] Ouvrir dans le PDF, dans un nouvel onglet
        }
        [epub] { $where ->
            [window] Ouvrir dans l’EPUB, dans une nouvelle fenêtre
           *[tab] Ouvrir dans l’EPUB, dans un nouvel onglet
        }
        [snapshot] { $where ->
            [window] Ouvrir dans la capture, dans une nouvelle fenêtre
           *[tab] Ouvrir dans la capture, dans un nouvel onglet
        }
        [note] { $where ->
            [window] Ouvrir dans la note, dans une nouvelle fenêtre
           *[tab] Ouvrir dans la note, dans un nouvel onglet
        }
       *[other] { $where ->
            [window] Ouvrir dans le lecteur, dans une nouvelle fenêtre
           *[tab] Ouvrir dans le lecteur, dans un nouvel onglet
        }
    }
weavero-menu-related-show-file =
    .label = Localiser le fichier
weavero-menu-related-copy-select-link =
    .label = Copier le lien de sélection
weavero-menu-related-copy-open-link =
    .label = { $external ->
        [yes] Copier le lien d’ouverture (application externe)
       *[no] Copier le lien d’ouverture
    }
weavero-menu-related-add-related =
    .label = Ajouter un document connexe…
weavero-menu-related-remove-relation =
    .label = Supprimer la relation
weavero-menu-bm-pick-item =
    .label = Choisir un document dans la bibliothèque…
weavero-menu-bm-add-link =
    .label = Ajouter un lien…
weavero-menu-bm-add-bookmark =
    .label = Ajouter un marque-page
weavero-menu-bm-sort-manual =
    .label = Ordre manuel
weavero-menu-bm-sort-name =
    .label = Nom
weavero-menu-bm-sort-date =
    .label = Date d’ajout
weavero-menu-bm-sort-ascending =
    .label = Croissant
weavero-menu-bm-sort-descending =
    .label = Décroissant
weavero-menu-bm-edit =
    .label = Modifier le marque-page…
weavero-menu-bm-reset-name =
    .label = Rétablir le nom par défaut
weavero-menu-bm-delete =
    .label = Supprimer le marque-page
weavero-menu-bm-new-folder =
    .label = Nouveau dossier…
weavero-menu-bm-rename-folder =
    .label = Renommer le dossier…
weavero-menu-bm-new-subfolder =
    .label = Nouveau sous-dossier…
weavero-menu-bm-delete-folder =
    .label = Supprimer le dossier
weavero-menu-bm-collection =
    .label = { $what ->
        [library] { $bookmarked ->
            [yes] Retirer le marque-page de la bibliothèque
           *[no] Ajouter la bibliothèque aux marque-pages
        }
       *[collection] { $bookmarked ->
            [yes] Retirer le marque-page de la collection
           *[no] Ajouter la collection aux marque-pages
        }
    }
weavero-menu-items-default-attachment =
    .label = { $marked ->
        [yes] { $glyph }Retirer la pièce jointe par défaut
       *[no] { $glyph }Définir comme pièce jointe par défaut
    }
weavero-menu-section-reset-filters =
    .label = Rétablir les filtres par défaut
weavero-menu-tab-add-to-group =
    .label = { $count ->
        [one] Ajouter l’onglet au groupe
        [many] Ajouter { $count } onglets au groupe
       *[other] Ajouter { $count } onglets au groupe
    }
weavero-menu-tab-open-notes =
    .label = Ouvrir les notes
weavero-menu-tab-move-to-main-window =
    .label = Déplacer vers la fenêtre principale
weavero-menu-group-unnamed-add =
    .label = Groupe sans nom
weavero-menu-group-saved-hint = enregistré
weavero-menu-reader-copy-citation =
    .label = Copier la citation
weavero-menu-reader-copy-bibliography =
    .label = Copier la bibliographie
weavero-menu-hamburger-new-tab =
    .label = Nouvel onglet
weavero-menu-hamburger-new-reader-window =
    .label = Nouvelle fenêtre de lecteur
weavero-menu-reader-add-selection-outline =
    .label = Ajouter le texte sélectionné à la table des matières
weavero-menu-reader-add-selection-bookmarks =
    .label = Ajouter le texte sélectionné aux marque-pages
weavero-menu-reader-add-position-bookmarks =
    .label = { $scope ->
        [library] Ajouter cette position aux marque-pages de la bibliothèque
       *[document] Ajouter cette position aux marque-pages
    }
weavero-menu-reader-add-page-bookmarks =
    .label = { $scope ->
        [library] Ajouter cette page aux marque-pages de la bibliothèque
       *[document] Ajouter cette page aux marque-pages
    }
weavero-menu-reader-add-position-outline =
    .label = Ajouter cette position à la table des matières…
weavero-menu-reader-page-anchor =
    .label = { $anchor ->
        [bottom] Bas de la page { $page }
       *[top] Haut de la page { $page }
    }
weavero-menu-ctx-open =
    .label = Ouvrir
weavero-menu-ctx-open-new-window =
    .label = Ouvrir dans une nouvelle fenêtre
weavero-menu-ctx-rename =
    .label = Renommer…
weavero-menu-ctx-delete =
    .label = Supprimer
weavero-menu-ctx-edit-region =
    .label = Modifier la zone…
weavero-menu-ctx-select-text =
    .label = Sélectionner du texte…
weavero-menu-ctx-pin-spot =
    .label = Épingler un endroit…
weavero-menu-bm-sort-location =
    .label = Emplacement
weavero-menu-outline-redetect-region =
    .label = Redétecter la zone à partir du titre
weavero-menu-outline-fix-spacing =
    .label = Corriger l’espacement
weavero-menu-outline-spacing-correct =
    .label = L’espacement est correct
weavero-menu-outline-edit-position-pages =
    .label = Modifier la position…
weavero-menu-outline-edit-position =
    .label = Modifier la position
weavero-menu-outline-reset-original =
    .label = Rétablir le nom et la zone d’origine
weavero-menu-outline-not-box =
    .label = Pas un encadré (section)
weavero-menu-outline-mark-box =
    .label = Marquer comme encadré / encart
weavero-menu-outline-delete-entries =
    .label = Supprimer { $count } entrées
weavero-menu-outline-delete-weavero =
    .label = Supprimer la table des matières modifiée…
weavero-menu-oe-verdict =
    .label = { $verdict ->
        [good] Extraction bonne
        [bad] Extraction mauvaise
        [scan] Numérisation (pas de couche texte)
       *[none] Non évalué
    }
weavero-menu-bm-copy-to-outline =
    .label = { $count ->
        [one] Copier dans la table des matières
        [many] Copier { $count } marque-pages dans la table des matières
       *[other] Copier { $count } marque-pages dans la table des matières
    }
weavero-menu-bm-show-parent =
    .label = Afficher le parent dans la bibliothèque
weavero-menu-maxspan-pair =
    .label = Agrandir sur { $first } + { $second }
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
weavero-menu-maxspan-all =
    .label = { $count ->
        [3] Agrandir sur les trois écrans
       *[other] Agrandir sur les { $count } écrans
    }
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
weavero-menu-maxspan-range =
    .label = Agrandir de { $first } à { $last }
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
weavero-maxspan-monitor = { $position ->
        [left] gauche
        [middle] milieu
        [right] droite
        [top] haut
        [bottom] bas
       *[number] écran { $number }
    }
weavero-maxspan-tip = La fenêtre remplit ces écrans en laissant la barre des tâches libre. Restaurer, ou un double-clic sur la barre de titre, la remet en place.
weavero-maxspan-tip-mixed = La fenêtre remplit ces écrans en laissant la barre des tâches libre. Restaurer, ou un double-clic sur la barre de titre, la remet en place. Ces écrans utilisent des échelles d’affichage différentes : la fenêtre est dessinée à l’échelle de l’un d’eux.

# ---- Shared words (all interface text into Fluent, 2026-11-19) -----------
weavero-common-cancel = Annuler
weavero-common-save = Enregistrer
weavero-common-close = Fermer
weavero-common-done = Terminé
weavero-common-loading = Chargement…
weavero-common-untitled = (sans titre)
weavero-common-clear-search = Effacer la recherche
weavero-common-alt-click-exclude = Alt+clic pour exclure
weavero-key-ctrl = Ctrl
weavero-key-shift = Maj
weavero-key-alt = Alt
weavero-key-win = Win

# ---- Backlinks and Item Links (backlinks.ts, links.ts) ----
weavero-bl-ref-title = { $kind ->
        [links] { $count ->
            [one] { $count } lien de document
            [many] { $count } liens de document
           *[other] { $count } liens de document
        }
       *[backlinks] { $count ->
            [one] { $count } rétrolien
            [many] { $count } rétroliens
           *[other] { $count } rétroliens
        }
    }
weavero-bl-internal-tip = Lien interne : les deux extrémités sont dans « { $title } »
weavero-bl-page = p. { $page }
weavero-bl-note-pos = { $at ->
        [line] ligne { $value }
        [section] #{ $value }
       *[heading] titre
    }
weavero-bl-att-kind = { $kind ->
        [pdf] PDF
        [epub] EPUB
        [snapshot] capture
        [file] fichier
       *[attachment] pièce jointe
    }
weavero-bl-row-label = { $ref ->
        [citation] { $paged ->
            [yes] Citation de note p. { $page }
           *[no] Citation de note
        }
        [quote] { $paged ->
            [yes] Citation de note, annotation p. { $page }{ $file }
           *[no] Citation de note, annotation{ $file }
        }
       *[link] Lien Zotero
    }
weavero-bl-kind = { $kind ->
        [cite] Citation de note
       *[zotero] Lien Zotero
    }
weavero-bl-action = { $action ->
        [select] Afficher dans la bibliothèque
        [annotation] Ouvrir à l’annotation
        [page] Ouvrir à la page { $page }
       *[open] Ouvrir
    }
weavero-bl-action-open-note = { $at ->
        [line] Ouvrir la note à la ligne { $value } (Better Notes)
        [section] Ouvrir la note à la section { $value } (Better Notes)
        [heading] Ouvrir la note au titre
       *[none] Ouvrir la note (Better Notes)
    }
weavero-bl-action-quote = { $form ->
        [page-cited] annotation p. { $page }, citée p. { $cited }
        [page] annotation p. { $page }
        [cited] annotation, citée p. { $cited }
        [gone] annotation, p. { $page }
       *[plain] annotation
    }
weavero-bl-chip = { $to ->
        [here] → { weavero-bl-note-pos }
        [annotation] → annotation{ $file }
        [annotation-page] → annotation p. { $page }{ $file }
        [note] → note
        [note-pos] → note { weavero-bl-note-pos }
        [attachment-page] → { weavero-bl-att-kind } p. { $page }
       *[attachment] → { weavero-bl-att-kind }
    }
weavero-bl-broken = { $why ->
        [library] Bibliothèque absente de ce profil
       *[item] Document introuvable
    }
weavero-bl-broken-why = { $why ->
        [library] Le lien désigne une bibliothèque de groupe qui n’est pas dans ce profil.
       *[item] Aucun document de la bibliothèque n’a cette clé : il a été supprimé, ou le lien est erroné.
    }
weavero-bl-card-page = Page
weavero-bl-card-comment = commentaire : { $text }
weavero-bl-card-note = Note

# ---- Hover cards (backlinks.ts) ----
weavero-card-side-source = Source
weavero-card-side-target = Cible
weavero-card-side-item = Document
weavero-card-side-related = Connexe

# ---- Annotation comments (annotation.ts) ----
weavero-ann-comment-popup = Fenêtre contextuelle du commentaire

# ---- Default attachment (attachments.ts) ----
weavero-defatt-legacy-title = Weavero — pièces jointes par défaut trouvées
weavero-defatt-legacy-running = { $count ->
        [one] Default Attachment (PikaPei) est actif et a { $count } pièce jointe par défaut enregistrée.
        [many] Default Attachment (PikaPei) est actif et a { $count } pièces jointes par défaut enregistrées.
       *[other] Default Attachment (PikaPei) est actif et a { $count } pièces jointes par défaut enregistrées.
    }
weavero-defatt-legacy-running-offer = Weavero peut faire la même chose — pour toute pièce jointe, tout lien URL ou toute note, pas seulement les PDF — et stocke chaque choix sous forme de marqueur, pour qu’il se synchronise.
weavero-defatt-legacy-leftover = { $count ->
        [one] { $count } pièce jointe par défaut trouvée, laissée par Default Attachment (PikaPei), qui n’est pas actif.
        [many] { $count } pièces jointes par défaut trouvées, laissées par Default Attachment (PikaPei), qui n’est pas actif.
       *[other] { $count } pièces jointes par défaut trouvées, laissées par Default Attachment (PikaPei), qui n’est pas actif.
    }
weavero-defatt-legacy-leftover-offer = Weavero peut les reprendre et stocker chacune sous forme de marqueur, pour qu’elle se synchronise, ou les laisser telles quelles.
weavero-defatt-legacy-question = Que voulez-vous faire ?
weavero-defatt-legacy-import = Importer dans Weavero
weavero-defatt-legacy-skip = Ne pas importer
weavero-defatt-legacy-keep = Continuer à utiliser Default Attachment
weavero-defatt-result-title = Weavero — pièces jointes par défaut
weavero-defatt-imported = { $count ->
        [one] { $count } choix importé sous forme du marqueur { $tag }.
        [many] { $count } choix importés sous forme du marqueur { $tag }.
       *[other] { $count } choix importés sous forme du marqueur { $tag }.
    }
weavero-defatt-imported-note = Les données de Default Attachment n’ont pas été modifiées — le README explique comment les supprimer à la main.
weavero-defatt-other-off = La fonctionnalité de pièce jointe par défaut de Weavero est maintenant désactivée.
weavero-defatt-other-keeps = Default Attachment continue de fonctionner exactement comme avant ; Weavero n’a modifié aucune de ses données.
weavero-defatt-other-back = Vous pouvez réactiver la version de Weavero dans Paramètres → Weavero → Divers.
weavero-defatt-skipped = Les données de Default Attachment ont été laissées telles quelles.
weavero-defatt-skipped-hint = Définissez une pièce jointe par défaut à tout moment par un clic droit sur un élément enfant.

# ---- Split view (tab-split.ts) ----
weavero-split-splitter-label = Redimensionner les onglets de la vue scindée
weavero-split-footer-more =
    .title = Vue scindée
    .aria-label = Menu de la vue scindée
weavero-split-picker-title = Ajouter une vue scindée
weavero-split-picker-desc = Choisissez un onglet à afficher à côté de celui-ci.
weavero-split-picker-search = Rechercher dans les onglets ouverts
weavero-split-picker-empty = Aucun autre onglet ouvert.
weavero-split-tab-tip = { $side ->
        [left] { $label }, vue scindée à gauche
       *[right] { $label }, vue scindée à droite
    }

# ---- Settings pane, written by its script (prefs/index.ts) ----
weavero-pref-section-toggle = Réduire ou développer cette section
weavero-pref-outline-key-none = Aucun
weavero-pref-outline-key-press = Appuyez sur les touches…
weavero-pref-outline-key-esc-hint = Échap pour annuler
weavero-pref-outline-key-taken = { $keys } est déjà utilisé par { $owner }.
weavero-pref-outline-key-saved = Enregistré.
weavero-pref-outline-key-removed = Supprimé.

# ---- misc (index.ts, pane.ts) ----
weavero-misc-toast-dismiss = Cliquez pour fermer
weavero-misc-link-toast-title = Weavero — lien rompu
weavero-misc-link-group-no-access = Ce lien pointe vers une bibliothèque de groupe à laquelle vous n’avez pas accès (groupe n° { $group }).
weavero-misc-link-group-unresolved = Ce lien pointe vers une bibliothèque de groupe qui n’a pas pu être résolue.
weavero-misc-link-collection-missing = La collection liée n’existe plus (clé { $key }).
weavero-misc-link-collection-trashed = La collection liée est dans la corbeille (clé { $key }).
weavero-misc-link-search-missing = La recherche enregistrée liée n’existe plus (clé { $key }).
weavero-misc-link-scope-collection-missing = La collection de ce lien n’existe plus (clé { $key }) — sélection du ou des documents sans elle.
weavero-misc-link-scope-collection-trashed = La collection de ce lien est dans la corbeille (clé { $key }) — sélection du ou des documents sans elle.
weavero-misc-link-scope-search-missing = La recherche enregistrée de ce lien n’existe plus (clé { $key }) — sélection du ou des documents sans elle.
weavero-misc-link-items-missing-all = Aucun des { $count } documents liés n’existe plus ({ $keys }).
weavero-misc-link-item-missing = Le document lié n’existe plus (clé { $key }).
weavero-misc-link-items-missing-some = { $count } des { $total } documents liés n’existent plus ({ $keys }) — les autres ont été sélectionnés.
weavero-misc-link-items-trashed = { $count } des documents liés sont dans la corbeille ({ $keys }).
weavero-misc-link-item-trashed = Le document lié est dans la corbeille (clé { $key }).
weavero-misc-link-file-missing = Le fichier vers lequel pointe ce lien n’existe plus (clé { $key }).
weavero-misc-link-file-trashed = La pièce jointe du fichier lié est dans la corbeille (clé { $key }) — ouverte quand même.
weavero-misc-link-note-missing = La note vers laquelle pointe ce lien n’existe plus (clé { $key }).
weavero-misc-link-note-trashed = La note liée est dans la corbeille (clé { $key }) — ouverte quand même.
weavero-misc-link-refused-zotero = Ce type de lien Zotero ne s’ouvre pas depuis une note ou un commentaire : { $url }
weavero-misc-link-refused-remote-file = Un lien vers un fichier situé sur un autre ordinateur ({ $host }) n’a pas été ouvert.
weavero-misc-open-remote-file-title = Ouvrir un fichier situé sur un autre ordinateur ?
weavero-misc-open-remote-file-message = Ce lien mène à un autre ordinateur, « { $host } » :

    { $target }

    L’ouvrir établit une connexion avec cet ordinateur. Ne l’ouvrez que si vous êtes sûr de la provenance du lien. Weavero ne redemandera pas pour ce lien.
weavero-misc-open-remote-file-button = Ouvrir
weavero-misc-open-local-file-title = Ouvrir un fichier situé sur cet ordinateur ?
weavero-misc-open-local-file-message = Ce lien ouvre un fichier situé sur cet ordinateur :

    { $target }

    Il s’ouvrira dans l’application que votre ordinateur utilise pour ce type de fichier. Ne l’ouvrez que si vous êtes sûr de la provenance du lien. Weavero ne redemandera pas pour ce lien.
weavero-misc-open-local-file-button = Ouvrir
weavero-misc-link-local-file-not-opened = « { $name } » n’a pas été ouvert.
weavero-misc-link-local-file-missing = « { $name } » n’a pas été ouvert : ce fichier n’existe pas sur cet ordinateur.
weavero-misc-link-local-file-failed = « { $name } » n’a pas pu être ouvert.
weavero-misc-link-refused-title = Weavero — lien non ouvert
weavero-misc-link-refused-runnable = « { $name } » n’a pas été ouvert : les fichiers de ce type peuvent exécuter des programmes sur votre ordinateur.
weavero-misc-open-external-title = Ouvrir dans une autre application ?
weavero-misc-open-external-message = Zotero ne peut pas afficher « { $name } » : il s’ouvrirait dans l’application que votre ordinateur utilise pour ce type de fichier. Ne l’ouvrez que si vous êtes sûr de sa provenance.
weavero-misc-open-external-button = Ouvrir
weavero-misc-reader-window = { $number ->
        [1] Fenêtre de lecteur
       *[other] Fenêtre de lecteur { $number }
    }
weavero-misc-update-installed = Actuellement installé : Zotero { $version }
weavero-misc-update-other-instance = Un autre Zotero de cette installation est ouvert (un autre profil ou un autre utilisateur). Zotero attend sa fermeture pour rechercher et installer les mises à jour.

# ---- count (count-popups.ts, index.ts, pane.ts) ----
weavero-count-related = { $count } connexes
weavero-count-title-tags = { $count ->
        [one] { $count } marqueur
        [many] { $count } marqueurs
       *[other] { $count } marqueurs
    }
weavero-count-title-manual-tags = { $count ->
        [one] { $count } marqueur manuel
        [many] { $count } marqueurs manuels
       *[other] { $count } marqueurs manuels
    }
weavero-count-title-auto-tags = { $count ->
        [one] { $count } marqueur automatique
        [many] { $count } marqueurs automatiques
       *[other] { $count } marqueurs automatiques
    }
weavero-count-title-backlinks = { $count ->
        [one] { $count } rétrolien
        [many] { $count } rétroliens
       *[other] { $count } rétroliens
    }
weavero-count-title-item-links = { $count ->
        [one] { $count } lien de document
        [many] { $count } liens de document
       *[other] { $count } liens de document
    }
weavero-count-title-ext-links = { $count ->
        [one] { $count } lien externe
        [many] { $count } liens externes
       *[other] { $count } liens externes
    }
weavero-count-this-item = Ce document
weavero-count-page = p. { $page }
weavero-count-tag-filter-tip = Filtrer la liste par ce marqueur
weavero-count-empty = Plus rien ici.

# ---- scope (pane-scope.ts) ----
weavero-scope-toggle-hint = { $state ->
        [only] Seuls ceux-ci sont affichés · cliquer à nouveau : tout afficher
        [hidden] Ceux-ci sont masqués · Alt+clic à nouveau : les afficher
       *[off] Clic : n’afficher que ceux-ci · Alt+clic : masquer ceux-ci
    }
weavero-scope-count-own = { $prep ->
        [in] Dans ce document : { $count }
        [to] Vers ce document : { $count }
       *[on] Sur ce document : { $count }
    }
weavero-scope-count-att = { $prep ->
        [in] Dans ses pièces jointes : { $count }
        [to] Vers ses pièces jointes : { $count }
       *[on] Sur ses pièces jointes : { $count }
    }
weavero-scope-count-note = { $prep ->
        [in] Dans ses notes : { $count }
        [to] Vers ses notes : { $count }
       *[on] Sur ses notes : { $count }
    }
weavero-scope-count-ann = { $prep ->
        [in] Dans ses annotations : { $count }
        [to] Vers ses annotations : { $count }
       *[on] Sur ses annotations : { $count }
    }
weavero-scope-count-zotero-links = Liens Zotero : { $count }
weavero-scope-count-note-citations = Citations de note : { $count }
weavero-scope-count-internal = { $what ->
        [backlinks] Rétroliens internes : { $count } sur { $total } (les deux extrémités dans le même document)
       *[links] Liens internes : { $count } sur { $total } (les deux extrémités dans le même document)
    }
weavero-scope-count-broken = Liens rompus : { $count } (le document a disparu, ou sa bibliothèque de groupe n’est pas dans ce profil)

# ---- hid (pane.ts, hidden collections) ----
weavero-hid-hide = Masquer
weavero-hid-section = { $section ->
        [feeds] Flux
       *[groups] Bibliothèques de groupe
    }
weavero-hid-dot-collections = { $count ->
        [one] { $count } collection ou recherche enregistrée masquée
        [many] { $count } collections ou recherches enregistrées masquées
       *[other] { $count } collections ou recherches enregistrées masquées
    }
weavero-hid-dot-groups = { $count ->
        [one] { $count } bibliothèque de groupe masquée
        [many] { $count } bibliothèques de groupe masquées
       *[other] { $count } bibliothèques de groupe masquées
    }
weavero-hid-dot-libraries = { $count ->
        [one] { $count } bibliothèque masquée
        [many] { $count } bibliothèques masquées
       *[other] { $count } bibliothèques masquées
    }
weavero-hid-dot-feeds = { $count ->
        [one] { $count } flux masqué
        [many] { $count } flux masqués
       *[other] { $count } flux masqués
    }
weavero-hid-dot-section = la section { $section }
weavero-hid-dot-here = Dans cette fenêtre : { $list }
weavero-hid-dot-everywhere = Masqués dans toutes les fenêtres (réglage de Zotero) : { $count }
weavero-hid-dot-tip = { $list } — clic droit pour afficher
weavero-hid-mgr-title = Gestionnaire des collections et bibliothèques
weavero-hid-mgr-title-window = Gestionnaire des collections et bibliothèques — { $window }
weavero-hid-mgr-filter = Filtrer les collections
weavero-hid-mgr-shown = Affichés
weavero-hid-mgr-hidden = Masqués
weavero-hid-mgr-hide-button = Masquer →
weavero-hid-mgr-show-button = ← Afficher
weavero-hid-mgr-show-all-button = ← Tout afficher
weavero-hid-mgr-show-all-tip = Afficher tout ce qui est masqué dans cette fenêtre (et ce que masque le réglage propre de Zotero)
weavero-hid-mgr-empty = Rien de masqué
weavero-hid-mgr-why-groups-section = La section Bibliothèques de groupe ne peut être masquée que si Ma bibliothèque est affichée
weavero-hid-mgr-why-last-library = La dernière bibliothèque affichée ne peut pas être masquée : affichez d’abord une autre bibliothèque
weavero-hid-mgr-why-heading-hide = Un titre : sélectionnez les bibliothèques en dessous pour les masquer
weavero-hid-mgr-why-heading-show = Un titre : sélectionnez les bibliothèques masquées en dessous pour les afficher
weavero-hid-mgr-why-not-hidden = Non masqué : affiché ici pour les entrées masquées qu’il contient
weavero-hid-mgr-hint-groups-section = Masqué avec la section Bibliothèques de groupe : Afficher rétablit la section
weavero-hid-mgr-hint-feeds-section = Masqué avec la section Flux : Afficher rétablit la section
weavero-hid-mgr-hint-library = Masqué avec sa bibliothèque : Afficher rétablit la bibliothèque
weavero-hid-mgr-hint-parent = Masqué avec sa collection parente : Afficher rétablit le parent
weavero-hid-mgr-global-tip = Masqué dans toutes les fenêtres par le réglage propre de Zotero : Afficher le rétablit partout
weavero-hid-mgr-all-windows = (toutes les fenêtres)

# ---- pane (pane.ts) ----
weavero-pane-open-in-new-main-window = Nouvelle fenêtre principale
weavero-pane-open-in-new-group-window = Un nouveau groupe dans une nouvelle fenêtre principale
weavero-pane-toggle-collections = Masquer/afficher le panneau des collections
weavero-pane-tags-handle-expand = Développer le sélecteur de marqueurs
weavero-pane-tags-handle-expand-tag = Développer le sélecteur de marqueurs (la liste est filtrée par le marqueur « { $tag } »)
weavero-pane-tags-handle-expand-tags = Développer le sélecteur de marqueurs (la liste est filtrée par { $count } marqueurs)
weavero-pane-tags-handle-collapse = Réduire le sélecteur de marqueurs (faire glisser pour redimensionner)
weavero-pane-added-by = Ajouté par { $name }
weavero-pane-url-menu-copy-link = Copier le lien
weavero-pane-url-menu-open-split = Ouvrir le lien en vue scindée
weavero-pane-related-card-foot = Clic : afficher dans la bibliothèque · Clic droit pour plus d’options

# ---- col (pane.ts, items-list columns) ----
weavero-col-annotations = Annotations
weavero-col-tags = Marqueurs
weavero-col-related = Connexe
weavero-col-backlinks = Rétroliens
weavero-col-item-links = Liens de document
weavero-col-ext-links = Liens externes

# ---- pm (pane.ts, Plugins Manager) ----
weavero-pm-window-title = Gestionnaire d’extensions
weavero-pm-search-placeholder = Rechercher dans les extensions installées  ({ $shortcut })
weavero-pm-search-clear = Effacer
weavero-pm-time-unknown = inconnue
weavero-pm-time-just-now = à l’instant
weavero-pm-time-minutes = il y a { $count } min
weavero-pm-time-hours = { $count ->
        [one] il y a { $count } heure
        [many] il y a { $count } heures
       *[other] il y a { $count } heures
    }
weavero-pm-time-days = { $count ->
        [one] il y a { $count } jour
        [many] il y a { $count } jours
       *[other] il y a { $count } jours
    }
weavero-pm-card-meta = v{ $version } · mise à jour : { $when }
weavero-pm-recent-frame-tip = Période couverte par Mises à jour récentes
weavero-pm-recent-frame = { $days ->
        [0] Tout
        [one] Dernier jour
        [many] { $days } derniers jours
       *[other] { $days } derniers jours
    }
weavero-pm-recent-frame-default = { $frame } (par défaut)
weavero-pm-recent-heading = Mises à jour récentes

# ---- oe (outline-eval.ts, a developer tool) ----
weavero-oe-marked = { $verdict ->
        [good] Éval. : marqué BON ({ $count } cas enregistrés)
        [bad] Éval. : marqué MAUVAIS ({ $count } cas enregistrés)
       *[scan] Éval. : marqué NUMÉRISATION ({ $count } cas enregistrés)
    }
weavero-oe-cleared = Éval. : marque effacée

# ---- Items-list filter: toolbar, chip bar, rows (filter.ts) ----
weavero-filter-tb-button-tip = Filtrer les documents
weavero-filter-chevron-revealed-tip = Tous les enfants de ce conteneur sont affichés. Cliquez pour réappliquer le filtre.
weavero-filter-chevron-hidden-tip = { $count ->
        [one] { $count } autre élément masqué par le filtre. Cliquez pour l’afficher.
        [many] { $count } autres éléments masqués par le filtre. Cliquez pour les afficher.
       *[other] { $count } autres éléments masqués par le filtre. Cliquez pour les afficher.
    }
weavero-filter-added-by-tip = Ajouté par { $name }
weavero-filter-chip-order = { $field } { $op } { $value }
weavero-filter-chip-op-is = est
weavero-filter-chip-op-is-not = n’est pas
weavero-filter-chip-op-includes = inclut
weavero-filter-chip-op-includes-all = inclut tous
weavero-filter-chip-op-includes-any = inclut l’un de
weavero-filter-chip-op-excludes-any = exclut
weavero-filter-chip-op-has = a
weavero-filter-chip-op-has-none-of = n’a aucun de
weavero-filter-chip-source-embedded = Intégrée au PDF
weavero-filter-chip-source-zotero = Créée dans Zotero
weavero-filter-chip-tip = Cliquez pour modifier — ouvre la fenêtre de filtres sur ce groupe.
weavero-filter-chip-remove-tip = Retirer le filtre
weavero-filter-bar-or = OU
weavero-filter-bar-add = + Filtre
weavero-filter-bar-add-tip = Ajouter un filtre au groupe courant (ET avec les pastilles existantes de ce groupe).
weavero-filter-bar-add-group = + Groupe OU
weavero-filter-bar-add-group-tip = Commencer un nouveau groupe OU — ses filtres sont combinés par ET, et les résultats du groupe s’ajoutent à ceux des autres (union).
weavero-filter-bar-clear-all = Tout effacer
weavero-filter-bar-clear-all-tip = Retirer tous les filtres actifs et revenir à un seul groupe vide.
weavero-filter-dim-annotation-color = Couleur d’annotation
weavero-filter-dim-annotation-type = Type d’annotation
weavero-filter-dim-has-comment = A un commentaire
weavero-filter-dim-annotation-source = Source de l’annotation
weavero-filter-dim-tag = Marqueur
weavero-filter-dim-author = Auteur
weavero-filter-dim-item-type = Type de document
weavero-filter-dim-attachment-file-type = Type de fichier joint
weavero-filter-dim-outline-source = Source de la table des matières
weavero-filter-dim-outline-flags = Indicateurs de la table des matières
weavero-filter-dim-outline-verdict = Verdict sur la table des matières
weavero-filter-dim-added-by = Ajouté par
weavero-filter-dim-has-related = A des documents connexes
weavero-filter-dim-has-external-link = A un lien externe
weavero-filter-dim-has-item-links = A des liens de document
weavero-filter-dim-has-bookmarks = A des marque-pages
weavero-filter-dim-has-backlinks = A des rétroliens
weavero-filter-dim-has-tag = A un marqueur
weavero-filter-dim-item-note = Note de document
weavero-filter-dim-standalone-note = Note indépendante
weavero-filter-dim-standalone-attachment = Pièce jointe indépendante
weavero-filter-dim-has-abstract = A un résumé
weavero-filter-dim-has-doi = A un DOI
weavero-filter-dim-has-pmid = A un PMID
weavero-filter-dim-has-pmcid = A un PMCID
weavero-filter-dim-retracted = Rétracté
weavero-filter-dim-has-url = A une URL
weavero-filter-dim-has-attachment = A un fichier joint
weavero-filter-dim-has-annotations = A des annotations
weavero-filter-dim-has-outline = A une table des matières modifiée
weavero-filter-dim-has-embedded-annotations = A des annotations intégrées
weavero-filter-dim-publication = Publication
weavero-filter-dim-read-status = Statut de lecture
weavero-filter-dim-in-other-library = Dans plusieurs bibliothèques
weavero-filter-color-yellow = Jaune
weavero-filter-color-red = Rouge
weavero-filter-color-green = Vert
weavero-filter-color-blue = Bleu
weavero-filter-color-purple = Violet
weavero-filter-color-magenta = Magenta
weavero-filter-color-orange = Orange
weavero-filter-color-gray = Gris
weavero-filter-color-black = Noir
weavero-filter-ann-type-highlight = Surlignage
weavero-filter-ann-type-underline = Soulignement
weavero-filter-ann-type-note = Note
weavero-filter-ann-type-image = Image
weavero-filter-ann-type-ink = Annotation manuscrite
weavero-filter-ann-type-text = Texte
weavero-filter-file-type-snapshot = Capture
weavero-filter-file-type-image = Image
weavero-filter-file-type-video = Vidéo
weavero-filter-file-type-web-link = Lien Web
weavero-filter-file-type-linked-file = Fichier lié
weavero-filter-file-type-other-file = Autre fichier
weavero-filter-read-status-none = Sans statut
weavero-filter-read-status-tip = { $status } — Alt+clic pour exclure

# ---- Collection set (filter.ts): several collections selected ----
weavero-filter-collset-header = { $header } — { $mode ->
        [all] dans toutes
       *[not-all] pas dans toutes
    }
weavero-filter-collset-tip-all = { $kind ->
        [collections] Documents présents dans TOUTES les collections sélectionnées — cliquez pour tout afficher à nouveau (union)
        [searches] Documents présents dans TOUTES les recherches enregistrées sélectionnées — cliquez pour tout afficher à nouveau (union)
       *[sources] Documents présents dans TOUTES les sources sélectionnées — cliquez pour tout afficher à nouveau (union)
    }
weavero-filter-collset-tip-not-all = { $kind ->
        [collections] Documents présents dans certaines collections sélectionnées mais PAS dans toutes — Alt+clic pour tout afficher à nouveau (union)
        [searches] Documents présents dans certaines recherches enregistrées sélectionnées mais PAS dans toutes — Alt+clic pour tout afficher à nouveau (union)
       *[sources] Documents présents dans certaines sources sélectionnées mais PAS dans toutes — Alt+clic pour tout afficher à nouveau (union)
    }
weavero-filter-collset-tip-off = { $kind ->
        [collections] N’afficher que les documents présents dans TOUTES les collections sélectionnées (intersection). Alt+clic : documents présents dans certaines mais pas toutes.
        [searches] N’afficher que les documents présents dans TOUTES les recherches enregistrées sélectionnées (intersection). Alt+clic : documents présents dans certaines mais pas toutes.
       *[sources] N’afficher que les documents présents dans TOUTES les sources sélectionnées (intersection). Alt+clic : documents présents dans certaines mais pas toutes.
    }
weavero-filter-collset-tip-counts = Dans toutes : { $all ->
        [one] { $all } document
        [many] { $all } documents
       *[other] { $all } documents
    } · dans certaines mais pas toutes : { $some ->
        [one] { $some } document
        [many] { $some } documents
       *[other] { $some } documents
    }

# ---- Filter popup (filter.ts) ----
weavero-filter-popup-title = Filtrer la bibliothèque
weavero-filter-popup-clear = Effacer
weavero-filter-popup-clear-tip = Effacer tous les filtres (garder cette fenêtre ouverte)
weavero-filter-popup-clear-aria = Effacer tous les filtres
weavero-filter-popup-clear-close = Effacer et fermer
weavero-filter-kind-parent = Parent
weavero-filter-kind-attachment = Pièce jointe
weavero-filter-kind-note = Note
weavero-filter-kind-annotation = Annotation
weavero-filter-kind-standalone-note-text = Texte des notes indépendantes
weavero-filter-kind-item-note-text = Texte des notes de document
weavero-filter-kind-annotation-comment = Commentaire d’annotation
weavero-filter-seltarget-label = Cible de sélection :
weavero-filter-seltarget-tip = Les types de lignes que Ctrl+A sélectionne (les lignes hors cible sont estompées). Laissez vide pour le choix automatique : tous les types — ou seulement celui ou ceux que visent vos filtres actifs (filtres d’annotation → annotations ; filtres de type de document → documents ; les deux → les deux). Cliquez sur un type pour imposer votre choix, Alt+clic pour l’exclure.
weavero-filter-seltarget-parent-tip = Les documents ordinaires seront sélectionnables avec Ctrl+A.
weavero-filter-seltarget-attachment-tip = Les lignes de pièces jointes (indépendantes comprises) seront sélectionnables avec Ctrl+A.
weavero-filter-seltarget-note-tip = Les notes (indépendantes et notes de document) seront sélectionnables avec Ctrl+A.
weavero-filter-seltarget-annotation-tip = Les lignes d’annotation seront sélectionnables avec Ctrl+A.
weavero-filter-seltarget-auto-tip = { $tip }  •  Auto : vos filtres actifs ne visent que ce type, c’est donc lui que Ctrl+A sélectionne. Cliquez sur un type pour le choisir vous-même.
weavero-filter-show-nonmatching-annotations = Afficher les annotations qui ne correspondent pas
weavero-filter-show-nonmatching-annotations-tip = Reflète « Masquer les annotations qui ne correspondent pas » de Zotero (menu Affichage). Désactivé, seules les annotations qui correspondent à la recherche ou au filtre courant apparaissent sous les fichiers trouvés.
weavero-filter-show-nonmatching-attachments = Afficher les pièces jointes qui ne correspondent pas
weavero-filter-show-nonmatching-attachments-tip = Désactivé, seules les pièces jointes qui correspondent à la recherche ou au filtre courant apparaissent sous les parents trouvés. Les pièces jointes masquées emportent leurs annotations avec elles.
weavero-filter-mode-trigger-tip = Choisir ce qu’il faut filtrer
weavero-filter-tag-empty-all = Aucun marqueur dans cette bibliothèque
weavero-filter-tag-empty-match = Aucun marqueur correspondant
weavero-filter-publication-empty-all = Aucune publication dans cette bibliothèque
weavero-filter-publication-empty-match = Aucune publication correspondante
weavero-filter-author-empty-all = Aucun auteur d’annotation dans cette bibliothèque
weavero-filter-author-empty-match = Aucun auteur correspondant
weavero-filter-added-by-empty-all = Aucun créateur enregistré dans cette bibliothèque
weavero-filter-added-by-empty-match = Aucun utilisateur correspondant
weavero-filter-collection-empty-all = Aucune collection dans cette bibliothèque
weavero-filter-collection-empty-match = Aucune collection correspondante
weavero-filter-saved-search-empty-all = Aucune recherche enregistrée dans cette bibliothèque
weavero-filter-saved-search-empty-match = Aucune recherche enregistrée correspondante
weavero-filter-suggest-more = +{ $count } autres
weavero-filter-collection-collapse = Réduire
weavero-filter-collection-expand = Développer
weavero-filter-pill-tip = { $exclude ->
        [yes] Sauf { $kind } : { $value }
       *[no] { $kind } : { $value }
    }
weavero-filter-pill-kind = { $exclude ->
        [yes] Sauf { $kind } :
       *[no] { $kind } :
    }
weavero-filter-pill-remove = Retirer
weavero-filter-tag-scope-tip = Choisir à quelles catégories le filtre Marqueur s’applique — documents parents, pièces jointes, notes, annotations (commun avec A un marqueur).
weavero-filter-line-all-of = Tous
weavero-filter-line-any-publication = Une publication parmi
weavero-filter-line-any-added-by = Ajouté par l’un de
weavero-filter-itype-trigger = Type de document
weavero-filter-itype-trigger-tip = Type de document — cliquez pour choisir
weavero-filter-itype-not = Sauf { $type }
weavero-filter-itype-empty = Aucun type de document disponible
weavero-filter-itype-mru-tip = { $type } — utilisé récemment. Cliquez pour filtrer ; Alt+clic pour exclure.
weavero-filter-qs-scope-tip = Restreindre la recherche rapide à : — choisissez quels types de lignes la recherche rapide de la barre d’outils peut faire apparaître dans les résultats. Tout coché (par défaut) signifie aucune restriction.
weavero-filter-qs-scope-aria = Restreindre la recherche rapide à
weavero-filter-scope-apply-to = Appliquer à
weavero-filter-scope-arrow-tip = Choisir à quelles catégories ce filtre s’applique — documents parents, pièces jointes, notes, annotations
weavero-filter-has-tag-tip = A un marqueur — documents portant au moins un marqueur. Alt+clic pour exclure. ▾ pour restreindre par type de ligne.
weavero-filter-has-related-tip = A des documents connexes — documents avec au moins une relation vers un document connexe. Alt+clic pour exclure. ▾ pour restreindre par type de ligne.
weavero-filter-has-external-link-tip = A un lien externe — documents dont le commentaire d’annotation ou le texte de note contient un lien qui sort de Zotero (https://, mailto:, liens d’application). Un lien zotero:// relève de A des liens de document. Alt+clic pour exclure. ▾ pour choisir le ou les textes à analyser.
weavero-filter-has-item-links-tip = A des liens de document — documents dont les notes ou les commentaires d’annotation pointent vers un autre document Zotero (liens Zotero et citations de note), sur le document, une note ou une annotation. Une simple URL web relève de A un lien externe. Alt+clic pour exclure. ▾ pour choisir où le lien est écrit.
weavero-filter-has-backlinks-tip = A des rétroliens — documents vers lesquels pointe un autre commentaire d’annotation ou une autre note (liens Zotero et citations de note), sur le document, un enfant ou une annotation. Alt+clic pour exclure. ▾ pour choisir ce qui est lié : le document, ses pièces jointes, ses notes ou ses annotations.
weavero-filter-in-other-library-tip = Dans plusieurs bibliothèques — documents ordinaires qui appartiennent aussi à une autre bibliothèque (une copie liée existe, par exemple glissée vers ou depuis un groupe). La section Bibliothèques et collections du panneau du document indique lesquelles. Alt+clic pour exclure.
weavero-filter-retracted-tip = Rétracté — documents ordinaires que Zotero marque comme rétractés (avis de rétractation rouge dans le panneau du document), dans la collection ou la recherche courante. Alt+clic pour les exclure.
weavero-filter-has-doi-tip = A un DOI — documents ordinaires ayant un DOI. Alt+clic pour exclure.
weavero-filter-has-pmid-tip = A un PMID — documents ordinaires ayant un PMID (champ ou Extra). Alt+clic pour exclure.
weavero-filter-has-pmcid-tip = A un PMCID — documents ordinaires ayant un PMCID (champ ou Extra). Alt+clic pour exclure.
weavero-filter-has-url-tip = A une URL — documents ordinaires ayant un champ URL. Alt+clic pour exclure.
weavero-filter-has-abstract-tip = A un résumé — documents ordinaires ayant un résumé non vide. Alt+clic pour exclure.
weavero-filter-has-attachment-tip = A un fichier joint — documents ordinaires ayant au moins un fichier joint (PDF, EPUB, capture, etc.). À distinguer de Note de document — les notes de document sont aussi des lignes de niveau pièce jointe mais ont leur propre vignette dans le groupe Pièce jointe. Alt+clic pour exclure.
weavero-filter-linked-file-tip = Fichier lié — pièces jointes stockées sous forme de liens vers des fichiers externes (tout type de contenu). Alt+clic pour exclure.
weavero-filter-standalone-attachment-tip = Pièce jointe indépendante — n’afficher que les pièces jointes de premier niveau (sans parent). Alt+clic pour exclure.
weavero-filter-has-bookmarks-tip = A des marque-pages — documents dont la ou les pièces jointes ont des marque-pages de lecteur enregistrés. Alt+clic pour exclure.
weavero-filter-has-annotations-tip = A des annotations — pièces jointes de fichier ayant au moins une annotation. Alt+clic pour exclure.
weavero-filter-has-embedded-annotations-tip = A des annotations intégrées — pièces jointes de fichier portant au moins une annotation intégrée au PDF par un lecteur externe. Alt+clic pour exclure.
weavero-filter-has-outline-tip = A une table des matières modifiée — pièces jointes avec une table des matières que vous avez modifiée dans l’onglet Table des matières du lecteur (entrées renommées, vos propres ajouts). PAS la table des matières intégrée ou extraite du document : celle-ci ne peut être connue qu’en ouvrant chaque fichier. Alt+clic pour exclure.
weavero-filter-has-comment-tip = A un commentaire — annotations dont le commentaire n’est pas vide. Alt+clic pour exclure.
weavero-filter-annotation-source-tip = Source de l’annotation — intégrée au PDF par un lecteur externe (importée à la première ouverture du fichier par Zotero). Alt+clic : créée dans le lecteur de Zotero.
weavero-filter-standalone-note-tip = Note indépendante — n’afficher que les notes de premier niveau (sans parent). Avec Note de document : l’un ou l’autre type de note (OU). Alt+clic pour exclure.
weavero-filter-item-note-tip = Note de document — n’afficher que les notes rattachées à un document ordinaire. Avec Note indépendante : l’un ou l’autre type de note (OU). Alt+clic pour exclure.

# ---- Filter popup, developer outline section (filter.ts) ----
weavero-filter-outline-scan = Analyser la bibliothèque
weavero-filter-outline-quick-scanning = Analyse rapide… { $done }/{ $total }
weavero-filter-outline-scanning = Analyse… { $done }/{ $total }
weavero-filter-outline-scan-tip = Classer la table des matières de chaque PDF de cette bibliothèque (ouvre chacun en arrière-plan). N’écrit rien dans la bibliothèque.
weavero-filter-outline-status = { $classified } classés · { $marked } marqués
weavero-filter-outline-row-source = Source
weavero-filter-outline-row-flags = Indicateurs
weavero-filter-outline-row-verdict = Verdict
weavero-filter-outline-embedded = Intégrée
weavero-filter-outline-extracted = Extraite
weavero-filter-outline-zotero = Zotero
weavero-filter-outline-scanned = Numérisée (sans texte)
weavero-filter-outline-empty = Vide
weavero-filter-outline-unknown = Inconnue
weavero-filter-outline-flag-content-empty = Contenu vide
weavero-filter-outline-flag-entity-leak = Fuite d’entités
weavero-filter-outline-flag-ws-junk = Espaces parasites
weavero-filter-outline-flag-fig-table = Titres de figures/tableaux
weavero-filter-outline-flag-spacing = Espacement suspect
weavero-filter-outline-verdict-good = Bonne
weavero-filter-outline-verdict-bad = Mauvaise
weavero-filter-outline-verdict-scan = Numérisation
weavero-filter-outline-verdict-unmarked = Non évaluée
weavero-filter-outline-tile-tip = { $count ->
        [0] { $label } — cliquez pour inclure, Alt+clic pour exclure
       *[other] { $label } ({ $count }) — cliquez pour inclure, Alt+clic pour exclure
    }

# ---- Item count breakdown in the item pane (filter.ts) ----
weavero-filter-count-top-level = Premier niveau
weavero-filter-count-children = Enfants
weavero-filter-count-annotations = Annotations
weavero-filter-count-unread = Non lus
weavero-filter-count-read = Lus
weavero-filter-count-match = Correspondances
weavero-filter-count-context = Contexte
weavero-filter-count-rows = Lignes
weavero-filter-count-narrowed = restreint par { $sources }
weavero-filter-count-source = { $source ->
        [filter] filtre
        [quick] recherche rapide
       *[advanced] recherche avancée
    }

# ---- Filter popup search box menu (filter.ts) ----
weavero-menu-filter-mode-tag =
    .label = Marqueur
weavero-menu-filter-mode-publication =
    .label = Publication
weavero-menu-filter-mode-author =
    .label = Auteur
weavero-menu-filter-mode-added-by =
    .label = Ajouté par
weavero-menu-filter-mode-collection =
    .label = Collection
weavero-menu-filter-mode-saved-search =
    .label = Recherche enregistrée

# ---- Bookmarks, shared by the reader's Bookmarks pane and the library's Bookmarks dropdown (bookmarks.ts, reader-panels.ts) ----
weavero-bm-title = Marque-pages
weavero-bm-search-tip = Rechercher dans les marque-pages
weavero-bm-search-placeholder = Rechercher dans les marque-pages…
weavero-bm-filter-tip = Filtrer les marque-pages
weavero-bm-search-no-match = Aucun marque-page ne correspond à « { $query } ».
weavero-bm-filter-no-match = Aucun marque-page ne correspond au filtre actuel.
weavero-bm-sort-tip = { $field ->
        [location] { $dir ->
            [asc] Trié par emplacement (croissant) — cliquez pour changer (l’ordre manuel est conservé)
           *[desc] Trié par emplacement (décroissant) — cliquez pour changer (l’ordre manuel est conservé)
        }
        [alpha] { $dir ->
            [asc] Trié par nom (croissant) — cliquez pour changer (l’ordre manuel est conservé)
           *[desc] Trié par nom (décroissant) — cliquez pour changer (l’ordre manuel est conservé)
        }
        [date] { $dir ->
            [asc] Trié par date d’ajout (croissant) — cliquez pour changer (l’ordre manuel est conservé)
           *[desc] Trié par date d’ajout (décroissant) — cliquez pour changer (l’ordre manuel est conservé)
        }
       *[manual] Trier les marque-pages
    }
weavero-bm-sort-short = { $field ->
        [location] Emplacement
        [date] Date
       *[alpha] Nom
    }
weavero-bm-sort-reverse = Inverser l’ordre de tri
weavero-bm-filter-title = Filtrer les marque-pages
weavero-bm-filter-none = Aucun filtre disponible pour la liste de marque-pages actuelle.
weavero-bm-filter-chip-ann-tip = { $count ->
        [one] { $name } — { $count } annotation — Alt+clic pour exclure
        [many] { $name } — { $count } annotations — Alt+clic pour exclure
       *[other] { $name } — { $count } annotations — Alt+clic pour exclure
    }
weavero-bm-filter-chip-tag-tip = { $count ->
        [one] { $tag } — { $count } marque-page — Alt+clic pour exclure
        [many] { $tag } — { $count } marque-pages — Alt+clic pour exclure
       *[other] { $tag } — { $count } marque-pages — Alt+clic pour exclure
    }
weavero-bm-filter-type-tip = { $type ->
        [highlight] Surlignages
        [underline] Soulignements
        [note] Notes
        [text] Annotations de type texte
        [image] Annotations de type image
       *[ink] Annotations manuscrites
    } — { $count } — Alt+clic pour exclure
weavero-bm-filter-kind-tip = { $kind ->
        [pin] Épingles
        [page] Marque-pages de page
        [text] Sélections de texte
        [annotation] Annotations
        [item] Documents
       *[link] Liens
    } — { $count } — Alt+clic pour exclure
weavero-bm-page-name = { $anchor ->
        [bottom] Page { $page } (bas)
       *[top] Page { $page }
    }
weavero-bm-library-fallback = Bibliothèque { $id }
weavero-bm-unnamed = Marque-page
weavero-bm-folder-unnamed = Dossier
weavero-bm-folder-default-name = Nouveau dossier
weavero-bm-prompt-new-folder = Nouveau dossier
weavero-bm-prompt-new-subfolder = Nouveau sous-dossier
weavero-bm-prompt-rename-folder = Renommer le dossier
weavero-bm-prompt-new-bookmark = Nouveau marque-page
weavero-bm-prompt-name = Nom :
weavero-bm-delete-folder-title = Supprimer le dossier
weavero-bm-delete-folder-confirm = { $count ->
        [one] Supprimer « { $name } » et son contenu ({ $count } élément) ?
        [many] Supprimer « { $name } » et son contenu ({ $count } éléments) ?
       *[other] Supprimer « { $name } » et son contenu ({ $count } éléments) ?
    }
weavero-bm-sublabel-in = {" "}— dans { $title }
weavero-bm-edit-title = Modifier le marque-page
weavero-bm-edit-comment-caption = Commentaire

# ---- Bookmarks, the library's dropdown (bookmarks.ts) ----
weavero-bm-add-bookmarks-tip = Ajouter des marque-pages…
weavero-bm-new-folder-tip = Nouveau dossier…
weavero-bm-empty-library = Aucun marque-page pour l’instant. Utilisez ＋ Ajouter des marque-pages…
weavero-bm-folder-empty = (vide)
weavero-bm-row-in-tip = { $label } — dans { $title }
weavero-bm-missing-tip-library = La cible de ce marque-page n’existe plus. Clic droit → Supprimer le marque-page pour le retirer.
weavero-bm-missing-suffix = { $text } — la cible n’existe plus
weavero-bm-edit-title-caption = Titre
weavero-bm-edit-default-title = Titre par défaut :
weavero-bm-edit-reset-default = Rétablir la valeur par défaut
weavero-bm-add-link-title = Ajouter un marque-page de lien

# ---- Bookmarks, the reader's Bookmarks pane (reader-panels.ts) ----
weavero-bm-scope = { $scope ->
        [document] Document
       *[library] Bibliothèque
    }
weavero-bm-scope-tip = Clic : changer de portée. Ctrl+clic : fusionner les deux portées (les afficher ensemble).
weavero-bm-section = { $section ->
        [local] Ce document
        [global] Ailleurs
       *[library] Globaux
    }
weavero-bm-empty-section = { $section ->
        [local] Faites un clic droit dans la page, ou glissez une annotation ici.
        [global] Utilisez + pour mettre en marque-page un document, une collection ou un lien.
       *[library] Utilisez + pour mettre en marque-page un document, une collection, une bibliothèque ou une recherche enregistrée — ils apparaissent ici dans chaque document.
    }
weavero-bm-add-tip = Ajouter un marque-page
weavero-bm-new-folder-section-tip = Nouveau dossier dans cette section
weavero-bm-add-library-tip = Ajouter un marque-page à la bibliothèque
weavero-bm-new-folder-library-tip = Nouveau dossier dans la bibliothèque
weavero-bm-missing-tip-reader = La cible de ce marque-page n’existe plus. Clic droit → Supprimer pour le retirer.
weavero-bm-delete-selected-confirm = { $count ->
        [one] Supprimer { $count } marque-page sélectionné ? Les dossiers sont supprimés avec leur contenu.
        [many] Supprimer { $count } marque-pages sélectionnés ? Les dossiers sont supprimés avec leur contenu.
       *[other] Supprimer { $count } marque-pages sélectionnés ? Les dossiers sont supprimés avec leur contenu.
    }
weavero-bm-link-dialog-text = Texte
weavero-bm-link-dialog-apply = Appliquer
weavero-bm-hover-kind = { $kind ->
        [location] Emplacement
        [text] Texte sélectionné
        [collection] Collection
        [library] Bibliothèque
        [search] Recherche enregistrée
        [missing] Document (introuvable)
       *[item] Document
    }
weavero-bm-hover-page = Page { $page }
weavero-bm-hover-source = dans : { $title }
weavero-bm-hover-expand = { $state ->
        [expanded] Réduire ▴
       *[collapsed] Développer ▾
    }
weavero-bm-hover-meta = { $what ->
        [default] Par défaut : { $value }
        [created] Créé : { $value }
       *[bookmarked] Mis en marque-page : { $value }
    }
weavero-bm-note-pinned-page = Marque-page épinglé à la page { $page }. Faites glisser l’épingle pour ajuster.
weavero-bm-note-pinned = Marque-page épinglé. Faites glisser l’épingle pour ajuster.
weavero-bm-note-added-pin = Marque-page ajouté. Faites glisser l’épingle pour ajuster.
weavero-bm-note-added-selection = Marque-page ajouté depuis la sélection.
weavero-bm-note-text-not-located = Le texte mis en marque-page est introuvable.
weavero-bm-note-no-text-stayed = Pas de texte à cet endroit — le marque-page n’a pas bougé.
weavero-bm-note-copy-nothing = Rien à copier — aucune zone de sélection sur le marque-page.
weavero-bm-note-copied-outline = { $count ->
        [one] { $count } marque-page copié dans la table des matières.
        [many] { $count } marque-pages copiés dans la table des matières.
       *[other] { $count } marque-pages copiés dans la table des matières.
    }
weavero-menu-bm-add-bookmark-more =
    .label = Ajouter un marque-page…
weavero-menu-bm-add-library-bookmark =
    .label = Ajouter un marque-page de bibliothèque…
weavero-menu-bm-thumb-add-pages =
    .label = { $count ->
        [one] Ajouter cette page aux marque-pages
        [many] Ajouter ces { $count } pages aux marque-pages
       *[other] Ajouter ces { $count } pages aux marque-pages
    }

# ---- Reader panels, shared words (reader-panels.ts) ----
weavero-rpanel-selection-default = Sélection
weavero-rpanel-pinned-spot = Endroit épinglé
weavero-rpanel-anchor = { $anchor ->
        [point] Endroit épinglé
        [bottom] Bas de page
       *[top] Haut de page
    }
weavero-rpanel-page-short = p. { $page }
weavero-rpanel-pin-drag-tip = Faire glisser pour déplacer
weavero-rpanel-page-numbers = Numéros de page
weavero-rpanel-page-numbers-show = Afficher
weavero-rpanel-page-numbers-hide = Masquer
weavero-rpanel-sort-by = Trier par
weavero-rpanel-filter-clear = Effacer
    .title = Effacer tous les filtres (garder cette fenêtre ouverte)
    .aria-label = Effacer tous les filtres
weavero-rpanel-filter-clear-close = Effacer et fermer
weavero-rpanel-note-select-text = Sélectionnez du texte dans le document (Échap pour annuler).
weavero-rpanel-note-cancelled = Annulé.
weavero-rpanel-note-drop-pin = Placez-vous sur un endroit et cliquez pour déposer l’épingle (Échap pour annuler).
weavero-rpanel-note-pin-cancelled = Épingle annulée.
weavero-rpanel-note-no-text = Pas de texte à cet endroit.
weavero-rpanel-note-no-position = Impossible de lire cette position.
weavero-rpanel-note-rm-jump = Désactivez le mode lecture pour aller à cet emplacement.
weavero-rpanel-ann-kind = { $type ->
        [highlight] Surlignage
        [underline] Soulignement
        [note] Note
        [text] Annotation de type texte
        [image] Annotation de type image
        [ink] Annotation manuscrite
       *[other] Annotation
    }
weavero-rpanel-dialog-name = Nom
weavero-rpanel-dialog-reset-name = Rétablir
weavero-rpanel-dialog-position = Position
weavero-rpanel-dialog-ok = OK
weavero-rpanel-dialog-page = { $count ->
        [0] Page
       *[other] Page (1–{ $max })
    }
weavero-rpanel-dialog-default-name = Nom par défaut : { $name }
weavero-rpanel-layout-sidebar =
    .label = Barre latérale
weavero-rpanel-layout-outline =
    .label = Panneau du plan
weavero-rpanel-layout-context-pane =
    .label = Panneau de contexte
weavero-rpanel-layout-selector =
    .label = Sélecteur de couleurs et de marqueurs
weavero-rpanel-layout-menu =
    .label = Mise en page
weavero-rpanel-selector-handle-tip = { $state ->
        [folded-marked] Afficher le sélecteur de couleurs et de marqueurs (une sélection est active : elle filtre le panneau et le document)
        [folded] Afficher le sélecteur de couleurs et de marqueurs
       *[open] Masquer le sélecteur de couleurs et de marqueurs
    }
weavero-rpanel-thumb-copy-links =
    .label = { $count ->
        [one] Copier le lien vers cette page
        [many] Copier les liens vers { $count } pages
       *[other] Copier les liens vers { $count } pages
    }

# ---- Annotations pane: sort and dates (reader-panels.ts) ----
weavero-rpanel-ann-title = Annotations
weavero-rpanel-ann-sort-tip = Tri des annotations
weavero-rpanel-ann-sort-direction = Inverser le sens du tri
weavero-rpanel-ann-sort-field = { $field ->
        [position] Position
        [dateAdded] Date d’ajout
        [dateModified] Date de modification
        [manual] Manuel
       *[other] { $field }
    }
weavero-rpanel-ann-sort-manual-row = Manuel (faire glisser pour réordonner)
weavero-rpanel-ann-show-on-cards = Afficher sur les cartes
weavero-rpanel-ann-date-added = Ajoutée : { $date }
weavero-rpanel-ann-date-modified = Modifiée : { $date }
weavero-rpanel-ann-date-added-full = Date d’ajout : { $date }
weavero-rpanel-ann-date-modified-full = Date de modification : { $date }

# ---- Annotation filters: the reader's funnel and the annotations pane's (reader-panels.ts) ----
weavero-annfilter-toolbar-tip = Filtrer les annotations
weavero-annfilter-popup-title = { $kind ->
        [list] Filtrer le panneau des annotations
       *[reader] Filtrer les annotations
    }
weavero-annfilter-empty = Aucune annotation dans ce document.
weavero-annfilter-pane-tip-head = Filtrer le panneau des annotations (le document garde toutes les annotations)
weavero-annfilter-pane-tip-state = { $state ->
        [departs] { $hidden ->
            [0] Ce document s’écarte du filtre par défaut — toutes les annotations sont affichées
            [one] Ce document s’écarte du filtre par défaut — masque { $hidden } annotation ici
            [many] Ce document s’écarte du filtre par défaut — masque { $hidden } annotations ici
           *[other] Ce document s’écarte du filtre par défaut — masque { $hidden } annotations ici
        }
       *[default] { $hidden ->
            [0] Suit le filtre par défaut — toutes les annotations sont affichées
            [one] Suit le filtre par défaut — masque { $hidden } annotation ici
            [many] Suit le filtre par défaut — masque { $hidden } annotations ici
           *[other] Suit le filtre par défaut — masque { $hidden } annotations ici
        }
    }
weavero-annfilter-clear-all = Tout effacer
    .title = Afficher toutes les annotations de ce document. Choix propre à ce document : le filtre par défaut reste tel quel ; Rétablir le suit de nouveau.
weavero-annfilter-reset = Rétablir
    .title = Revenir au filtre par défaut
weavero-annfilter-back-close = Revenir au filtre par défaut et fermer
weavero-annfilter-count = { $hidden ->
        [0] Toutes les annotations sont affichées
        [one] { $hidden } sur { $total } masquée dans le panneau
        [many] { $hidden } sur { $total } masquées dans le panneau
       *[other] { $hidden } sur { $total } masquées dans le panneau
    }
    .title = Le document contient toujours toutes les annotations ; seul ce panneau est filtré.
weavero-annfilter-scope = { $scope ->
        [document] Ce document seulement
       *[default] Par défaut pour tous les documents
    }
    .title = { $scope ->
        [document] Ce document a son propre filtre ; les autres documents suivent le filtre par défaut.
       *[default] Ce filtre est le filtre par défaut dont part chaque document.
    }
weavero-annfilter-default-note = { $all ->
        [yes] { $hidden ->
            [0] Par défaut : tout · n’en masque aucune ici
           *[other] Par défaut : tout · en masque { $hidden } ici
        }
       *[no] { $hidden ->
            [0] Par défaut : { $parts } · n’en masque aucune ici
           *[other] Par défaut : { $parts } · en masque { $hidden } ici
        }
    }
weavero-annfilter-default-note-tip = Le filtre par défaut, que ce document n’utilise pas :
weavero-annfilter-default-shows-everything = (affiche tout)
weavero-annfilter-default-note-reset = Rétablir l’applique ici.
weavero-annfilter-use-default = Utiliser par défaut
    .title =
        Faire de ce filtre, exactement tel qu’il est, le filtre par défaut de chaque document
        Alt+clic pour AJOUTER ses pastilles au filtre par défaut existant au lieu de le remplacer
weavero-annfilter-clear-default = Effacer le filtre par défaut
    .title = Afficher de nouveau toutes les annotations dans tous les documents (efface le filtre par défaut, pas celui de ce document)
weavero-annfilter-part-of-default = Fait partie du filtre par défaut
weavero-annfilter-desc-not = sauf { $name }
weavero-annfilter-desc-person = { $who ->
        [added] ajoutée par { $name }
       *[modified] modifiée par { $name }
    }
weavero-annfilter-flag = { $flag ->
        [comment] { $has ->
            [yes] A un commentaire
           *[no] Sans commentaire
        }
        [tag] { $has ->
            [yes] A un marqueur
           *[no] Sans marqueur
        }
        [related] { $has ->
            [yes] A des documents connexes
           *[no] Sans document connexe
        }
        [link] { $has ->
            [yes] A un lien externe
           *[no] Sans lien externe
        }
        [itemLinks] { $has ->
            [yes] A des liens de document
           *[no] Sans lien de document
        }
       *[backlinks] { $has ->
            [yes] A des rétroliens
           *[no] Sans rétrolien
        }
    }
weavero-annfilter-unit-short = { $unit ->
        [m] min
        [h] h
        [y] a
       *[d] j
    }
weavero-annfilter-desc-date-last = { $field ->
        [added] { $neg ->
            [yes] Ajoutée : il y a plus de { $count } { weavero-annfilter-unit-short }
           *[no] Ajoutée : il y a moins de { $count } { weavero-annfilter-unit-short }
        }
       *[modified] { $neg ->
            [yes] Modifiée : il y a plus de { $count } { weavero-annfilter-unit-short }
           *[no] Modifiée : il y a moins de { $count } { weavero-annfilter-unit-short }
        }
    }
weavero-annfilter-desc-date-range = { $field ->
        [added] { $neg ->
            [yes] Ajoutée : hors période du { $from } au { $to }
           *[no] Ajoutée : du { $from } au { $to }
        }
       *[modified] { $neg ->
            [yes] Modifiée : hors période du { $from } au { $to }
           *[no] Modifiée : du { $from } au { $to }
        }
    }
weavero-annfilter-chip-tip = { $name } — Alt+clic pour exclure
weavero-annfilter-color-black = Noir
weavero-annfilter-tag-tip = Marqueur : { $tag } — Alt+clic pour exclure
weavero-annfilter-tile-tip = { $tile ->
        [comment] A un commentaire — annotations dont le commentaire n’est pas vide. Alt+clic pour exclure.
        [tag] A un marqueur — annotations ayant au moins un marqueur. Alt+clic pour exclure.
        [related] A des documents connexes — annotations ayant au moins une relation vers un document connexe. Alt+clic pour exclure.
        [link] A un lien externe — annotations dont le commentaire contient un lien qui sort de Zotero (https://, mailto:, liens d’application) ; un lien zotero:// relève de A des liens de document. Alt+clic pour exclure.
        [itemLinks] A des liens de document — annotations dont le commentaire pointe vers un autre document Zotero. Alt+clic pour exclure.
       *[backlinks] A des rétroliens — annotations vers lesquelles pointe un autre commentaire ou une note. Alt+clic pour exclure.
    }
weavero-annfilter-head = { $head ->
        [addedBy] Ajouté par
        [modifiedBy] Modifié par
       *[date] Date
    }
weavero-annfilter-person-tip = { $who ->
        [added] Ajoutée par { $name } — Alt+clic pour exclure
       *[modified] Modifiée par { $name } — Alt+clic pour exclure
    }
weavero-annfilter-date-field = { $field ->
        [added] Ajoutée
       *[modified] Modifiée
    }
weavero-annfilter-unit = { $unit ->
        [m] minutes
        [h] heures
        [y] ans
       *[d] jours
    }
weavero-annfilter-date-last = Depuis
weavero-annfilter-date-last-tip = { $field ->
        [added] Ajoutée il y a moins de N { weavero-annfilter-unit } — Alt+clic pour exclure
       *[modified] Modifiée il y a moins de N { weavero-annfilter-unit } — Alt+clic pour exclure
    }
weavero-annfilter-date-window-aria = { $field ->
        [added] Durée de la fenêtre d’ajout
       *[modified] Durée de la fenêtre de modification
    }
weavero-annfilter-unit-tip = Unité de la fenêtre
weavero-annfilter-date-custom = Personnalisé
weavero-annfilter-date-custom-tip = { $field ->
        [added] Plage personnalisée de dates d’ajout — Alt+clic pour exclure
       *[modified] Plage personnalisée de dates de modification — Alt+clic pour exclure
    }
weavero-annfilter-bound = { $bound ->
        [from] du
       *[to] au
    }
weavero-annfilter-range-aria = { $field ->
        [added] { $bound ->
            [from] Plage d’ajout, début
           *[to] Plage d’ajout, fin
        }
       *[modified] { $bound ->
            [from] Plage de modification, début
           *[to] Plage de modification, fin
        }
    }
weavero-annfilter-cal-head = { $field ->
        [added] { $bound ->
            [from] Ajoutée — du
           *[to] Ajoutée — au
        }
       *[modified] { $bound ->
            [from] Modifiée — du
           *[to] Modifiée — au
        }
    }
weavero-annfilter-bound-invalid = { $bound ->
        [from] Non appliquée — postérieure à la date de fin
       *[to] Non appliquée — antérieure à la date de début
    }
weavero-annfilter-bound-applied = { $bound ->
        [from] Filtre à partir du { $date }
       *[to] Filtre jusqu’au { $date }
    }
weavero-annfilter-bound-clear = { $bound ->
        [from] Effacer le début
       *[to] Effacer la fin
    }
weavero-annfilter-cal-conflict = Entrerait en conflit avec l’autre borne
weavero-annfilter-hide-reader = Masquer les annotations dans le lecteur
    .title = Masquer les marques d’annotation dans la vue du document (la liste de la barre latérale n’est pas affectée).

# ---- Outline: the reader's Outline pane (reader-panels.ts) ----
weavero-outline-title = Table des matières
weavero-outline-entry-tip = Table des matières (Weavero)
weavero-outline-add-tip = Ajouter une entrée à la table des matières
weavero-outline-source = { $source ->
        [embedded] Intégrée
        [weavero] Modifiée
        [zotero] Zotero
        [none] Aucune
        [readingMode] Mode lecture
       *[extracted] Extraite
    }
weavero-outline-source-head = { $switch ->
        [yes] Source de la table des matières (cliquez pour en changer) :
       *[no] Source de la table des matières :
    }
weavero-outline-source-meaning = { $source ->
        [embedded] la table des matières enregistrée dans le fichier du document
        [weavero] votre copie modifiée de cette table des matières
        [zotero] la table des matières extraite par Zotero lui-même, telle quelle
        [zoteroSame] la table des matières extraite par Zotero lui-même, telle quelle — l’extraction de Weavero est identique pour ce PDF
        [embeddedSame] la table des matières enregistrée dans le fichier du document — l’extraction de Weavero est identique pour ce PDF
        [embeddedFirst] la table des matières enregistrée dans le fichier du document — affichée en premier : l’extraction de Weavero ne lui correspond pas
        [none] aucune table des matières n’a été trouvée dans ce document
        [readingMode] les titres du texte du mode lecture (mode lecture seulement)
       *[extracted] la table des matières de Weavero, construite à partir des données de structure de Zotero pour ce PDF
    }
weavero-outline-source-line = { $current ->
        [yes] ✓ { $label } : { $meaning }
       *[no] { $label } : { $meaning }
    }
weavero-outline-source-delete-hint = Clic droit pour supprimer la table des matières modifiée.
weavero-outline-references = Références
weavero-outline-eval-tip = { $verdict ->
        [good] Évaluer l’extraction de cette table des matières (outil de développement) : marquée bonne
        [bad] Évaluer l’extraction de cette table des matières (outil de développement) : marquée mauvaise
        [scan] Évaluer l’extraction de cette table des matières (outil de développement) : marquée numérisation (pas de couche texte)
       *[none] Évaluer l’extraction de cette table des matières (outil de développement) : non évaluée
    }
weavero-outline-empty = { $state ->
        [curated] Votre table des matières est vide.
        [extracting] Extraction de la table des matières…
       *[none] Aucune table des matières pour ce document.
    }
weavero-outline-empty-hint = Sélectionnez du texte dans le document, puis clic droit → { weavero-menu-reader-add-selection-outline.label }.
weavero-outline-create-button = Créer une table des matières
    .title = Commencer une table des matières modifiable pour ce document
weavero-outline-search-no-match = Aucune entrée de la table des matières ne correspond à la recherche.
weavero-outline-row-tip = Double-cliquez pour renommer, clic droit pour plus d’options
weavero-outline-kind-box-tip = Encart / encadré
weavero-outline-pin-title = Épingle page { $page }
weavero-outline-entries-tree = Arborescence des entrées
weavero-outline-hint-dblclick = Double-clic, { $key }
weavero-outline-text-size = Taille du texte
weavero-outline-size = { $size ->
        [zotero] Table des matières Zotero
        [itemPane] Panneau du document Zotero
       *[fixed] Fixe
    }
weavero-outline-size-label = { $size ->
        [zotero] Table des matières Zotero, { $px } px
       *[itemPane] Panneau du document Zotero, { $px } px
    }
weavero-outline-reset-original-tip = { $exact ->
        [yes] Nom et zone rétablis à l’original : « { $name } ».
       *[no] Nom rétabli en « { $name } » ; la zone est de nouveau détectée à partir de ce nom.
    }
weavero-outline-revert-question = Supprimer la table des matières modifiée de ce document ?
weavero-outline-revert-detail = { $accel ->
        [none] Votre table des matières modifiée ({ $what }) est supprimée ; Annuler dans cet onglet la rétablit. La table des matières propre au document n’est pas modifiée.
       *[other] Votre table des matières modifiée ({ $what }) est supprimée ; Annuler ({ $accel }) dans cet onglet la rétablit. La table des matières propre au document n’est pas modifiée.
    }
weavero-outline-revert-count = { $what ->
        [renamed] { $count ->
            [one] { $count } renommée
            [many] { $count } renommées
           *[other] { $count } renommées
        }
        [added] { $count ->
            [one] { $count } ajoutée par vous
            [many] { $count } ajoutées par vous
           *[other] { $count } ajoutées par vous
        }
       *[entries] { $count ->
            [one] { $count } entrée
            [many] { $count } entrées
           *[other] { $count } entrées
        }
    }
weavero-outline-prompt-new-title = Titre de la nouvelle entrée de la table des matières :
weavero-outline-edit-position-title = Modifier la position
weavero-outline-region-save-text = Enregistrer la zone et le texte
weavero-outline-region-save = Enregistrer la zone
weavero-outline-note-region-editor = { $what ->
        [label] Faites glisser les poignées pour remodeler la zone — { weavero-outline-region-save-text } recharge aussi l’étiquette ; { weavero-outline-region-save } la conserve. (Entrée = { weavero-outline-region-save-text }, Échap = annuler.)
       *[title] Faites glisser les poignées pour remodeler la zone — { weavero-outline-region-save-text } recharge aussi le titre ; { weavero-outline-region-save } le conserve. (Entrée = { weavero-outline-region-save-text }, Échap = annuler.)
    }
weavero-outline-note-added-selection = « { $title } » ajouté depuis la sélection.
weavero-outline-note-added-selection-text = « { $title } » ajouté depuis la sélection ({ $text }).
weavero-outline-note-added-selection-plain = « { $title } » ajouté depuis la sélection.
weavero-outline-note-added-anchor = { $anchor ->
        [bottom] « { $title } » ajouté → bas de la page { $page }.
       *[top] « { $title } » ajouté → haut de la page { $page }.
    }
weavero-outline-note-position = { $anchor ->
        [bottom] Position : bas de la page { $page }.
       *[top] Position : haut de la page { $page }.
    }
weavero-outline-note-pinned = Épinglé. Tapez son titre (Entrée pour le garder) ; faites glisser l’épingle pour ajuster.
weavero-outline-note-target-pinned-page = Cible épinglée à la page { $page }. Faites glisser l’épingle pour ajuster.
weavero-outline-note-target-pinned = Cible épinglée. Faites glisser l’épingle pour ajuster.
weavero-outline-note-pin-saved = Position de l’épingle enregistrée.
weavero-outline-note-target-selection = Cible définie depuis la sélection.
weavero-outline-note-no-pin-rm = Impossible de placer des épingles en mode lecture.
weavero-outline-note-anchor-pdf-only = Les ancres de page sont réservées aux PDF.
weavero-outline-note-pin-gone = La cible de cette épingle n’est plus dans le document — la page s’est affichée différemment. Faites glisser une nouvelle épingle pour la réancrer.
weavero-outline-note-entry-gone = La cible de cette entrée n’est plus dans le document.
weavero-outline-note-rm-not-found = Impossible de trouver cette entrée dans le texte du mode lecture.
weavero-outline-note-rm-not-ready = La vue du mode lecture n’est pas prête.
weavero-outline-note-rm-unmapped = Impossible de faire correspondre cette sélection au document.
weavero-outline-note-text-not-found-doc = Impossible de trouver ce texte dans le document — la zone n’a pas changé.
weavero-outline-note-text-not-found-page = Impossible de trouver ce texte sur la page — la zone n’a pas changé.
weavero-outline-note-no-anchor = Impossible de s’ancrer à ce texte.
weavero-outline-note-open-pdf-view = Ouvrez la vue PDF pour modifier la zone.
weavero-outline-note-no-selectable-text = Cette page n’a pas de texte sélectionnable sur lequel s’aligner.
weavero-outline-note-title-updated = Titre mis à jour. Pour déplacer le surlignage en conséquence, clic droit → { weavero-menu-outline-redetect-region.label }.
weavero-outline-note-spacing-cleaned = { $count ->
        [one] Espacement corrigé sur { $count } titre.
        [many] Espacement corrigé sur { $count } titres.
       *[other] Espacement corrigé sur { $count } titres.
    }
weavero-outline-note-spacing-unchanged = Rien n’a changé — si un titre est déjà correct, utilisez « { weavero-menu-outline-spacing-correct.label } » pour masquer la proposition.
weavero-outline-key-action = { $action ->
        [selection] Ajouter le texte sélectionné à la table des matières
        [pin] Épingler un endroit dans la table des matières
        [anchorTop] Ajouter le haut de la page à la table des matières
       *[anchorBottom] Ajouter le bas de la page à la table des matières
    }
weavero-outline-key-space = Espace
weavero-outline-key-owner = { $owner ->
        [hand] l’outil Main du lecteur (et le surlignage de la lecture à haute voix)
        [select] l’outil Sélection du lecteur
        [read-aloud] Lire à haute voix (soulignement)
        [next-page] page suivante
        [previous-page] page précédente
        [rotate] faire pivoter les pages
        [pdf-sidebar] la barre latérale du PDF
        [colors] les couleurs d’annotation
        [navigation] la lecture et la navigation dans le lecteur
        [text-selection] la sélection de texte dans le lecteur
        [annotation-tools] les outils d’annotation du lecteur
        [back-forward] Précédent / Suivant dans le lecteur
        [redo] Répéter
        [find-previous] Rechercher le précédent
        [reopen-tab] Rouvrir l’onglet fermé
        [select-all] Tout sélectionner
        [undo] Annuler
        [find] Rechercher
        [find-next] Rechercher le suivant
        [print] Imprimer
        [copy] Copier
        [cut] Couper
        [paste] Coller
        [close-tab] Fermer l’onglet
        [new-main-window] Nouvelle fenêtre principale
        [zoom-in] Zoomer
        [zoom-out] Dézoomer
        [reset-zoom] Réinitialiser le zoom
        [back] Précédent
        [forward] Suivant
        [next-tab] l’onglet suivant
        [switch-tabs] le changement d’onglet
       *[menu] un raccourci de menu de Zotero
    }
weavero-outline-key-owner-zotero = le raccourci « { $command } » de Zotero (Paramètres → Avancé → Raccourcis clavier)
weavero-outline-key-owner-menu-item = l’entrée de menu « { $label } »
weavero-outline-key-owner-action = « { $label } »

# ---- Undo: steps and the History menu (bookmarks.ts, reader-panels.ts) ----
weavero-undo-outline-entries = { $action ->
        [add] { $count ->
            [one] Ajouter une entrée de la table des matières
            [many] Ajouter { $count } entrées de la table des matières
           *[other] Ajouter { $count } entrées de la table des matières
        }
        [delete] { $count ->
            [one] Supprimer une entrée de la table des matières
            [many] Supprimer { $count } entrées de la table des matières
           *[other] Supprimer { $count } entrées de la table des matières
        }
        [rename] { $count ->
            [one] Renommer une entrée de la table des matières
            [many] Renommer { $count } entrées de la table des matières
           *[other] Renommer { $count } entrées de la table des matières
        }
        [move] { $count ->
            [one] Déplacer une entrée de la table des matières
            [many] Déplacer { $count } entrées de la table des matières
           *[other] Déplacer { $count } entrées de la table des matières
        }
       *[edit] { $count ->
            [one] Modifier une entrée de la table des matières
            [many] Modifier { $count } entrées de la table des matières
           *[other] Modifier { $count } entrées de la table des matières
        }
    }
weavero-undo-outline-mixed = Modifier la table des matières
weavero-undo-outline-create = Créer une table des matières modifiée
weavero-undo-outline-remove = Supprimer la table des matières modifiée
weavero-undo-bm-bookmarks = { $action ->
        [add] { $count ->
            [one] Ajouter un marque-page
            [many] Ajouter { $count } marque-pages
           *[other] Ajouter { $count } marque-pages
        }
        [delete] { $count ->
            [one] Supprimer un marque-page
            [many] Supprimer { $count } marque-pages
           *[other] Supprimer { $count } marque-pages
        }
        [rename] { $count ->
            [one] Renommer un marque-page
            [many] Renommer { $count } marque-pages
           *[other] Renommer { $count } marque-pages
        }
        [move] { $count ->
            [one] Déplacer un marque-page
            [many] Déplacer { $count } marque-pages
           *[other] Déplacer { $count } marque-pages
        }
       *[edit] { $count ->
            [one] Modifier un marque-page
            [many] Modifier { $count } marque-pages
           *[other] Modifier { $count } marque-pages
        }
    }
weavero-undo-bm-folders = { $action ->
        [add] { $count ->
            [one] Ajouter un dossier
            [many] Ajouter { $count } dossiers
           *[other] Ajouter { $count } dossiers
        }
        [delete] { $count ->
            [one] Supprimer un dossier
            [many] Supprimer { $count } dossiers
           *[other] Supprimer { $count } dossiers
        }
        [rename] { $count ->
            [one] Renommer un dossier
            [many] Renommer { $count } dossiers
           *[other] Renommer { $count } dossiers
        }
        [move] { $count ->
            [one] Déplacer un dossier
            [many] Déplacer { $count } dossiers
           *[other] Déplacer { $count } dossiers
        }
       *[edit] { $count ->
            [one] Modifier un dossier
            [many] Modifier { $count } dossiers
           *[other] Modifier { $count } dossiers
        }
    }
weavero-undo-bm-mixed = Modifier les marque-pages
weavero-undo-ann-kind = { $type ->
        [highlight] { $count ->
            [one] annotation de surlignage
            [many] annotations de surlignage
           *[other] annotations de surlignage
        }
        [underline] { $count ->
            [one] annotation de soulignement
            [many] annotations de soulignement
           *[other] annotations de soulignement
        }
        [note] { $count ->
            [one] annotation de type note
            [many] annotations de type note
           *[other] annotations de type note
        }
        [text] { $count ->
            [one] annotation de type texte
            [many] annotations de type texte
           *[other] annotations de type texte
        }
        [image] { $count ->
            [one] annotation de type image
            [many] annotations de type image
           *[other] annotations de type image
        }
        [ink] { $count ->
            [one] annotation manuscrite
            [many] annotations manuscrites
           *[other] annotations manuscrites
        }
       *[other] { $count ->
            [one] annotation
            [many] annotations
           *[other] annotations
        }
    }
weavero-undo-ann-step = { $action ->
        [add] { $count ->
            [one] Ajouter une { weavero-undo-ann-kind }
            [many] Ajouter { $count } { weavero-undo-ann-kind }
           *[other] Ajouter { $count } { weavero-undo-ann-kind }
        }
        [delete] { $count ->
            [one] Supprimer une { weavero-undo-ann-kind }
            [many] Supprimer { $count } { weavero-undo-ann-kind }
           *[other] Supprimer { $count } { weavero-undo-ann-kind }
        }
        [convert] { $count ->
            [one] Convertir une { weavero-undo-ann-kind }
            [many] Convertir { $count } { weavero-undo-ann-kind }
           *[other] Convertir { $count } { weavero-undo-ann-kind }
        }
        [merge] { $count ->
            [one] Fusionner une { weavero-undo-ann-kind }
            [many] Fusionner { $count } { weavero-undo-ann-kind }
           *[other] Fusionner { $count } { weavero-undo-ann-kind }
        }
        [move] { $count ->
            [one] Déplacer une { weavero-undo-ann-kind }
            [many] Déplacer { $count } { weavero-undo-ann-kind }
           *[other] Déplacer { $count } { weavero-undo-ann-kind }
        }
        [resize] { $count ->
            [one] Redimensionner une { weavero-undo-ann-kind }
            [many] Redimensionner { $count } { weavero-undo-ann-kind }
           *[other] Redimensionner { $count } { weavero-undo-ann-kind }
        }
       *[edit] { $count ->
            [one] Modifier une { weavero-undo-ann-kind }
            [many] Modifier { $count } { weavero-undo-ann-kind }
           *[other] Modifier { $count } { weavero-undo-ann-kind }
        }
    }
weavero-undo-ann-field = { $field ->
        [comment] le commentaire
        [tags] les marqueurs
        [text] le texte
        [pageNumber] le numéro de page
        [fontSize] la taille de police
       *[position] la position
    }
weavero-undo-ann-edit-field = { $count ->
        [one] Modifier { weavero-undo-ann-field } d’une { weavero-undo-ann-kind }
        [many] Modifier { weavero-undo-ann-field } de { $count } { weavero-undo-ann-kind }
       *[other] Modifier { weavero-undo-ann-field } de { $count } { weavero-undo-ann-kind }
    }
weavero-undo-ann-change-color = { $count ->
        [one] Changer la couleur d’une { weavero-undo-ann-kind }
        [many] Changer la couleur de { $count } { weavero-undo-ann-kind }
       *[other] Changer la couleur de { $count } { weavero-undo-ann-kind }
    }
weavero-undo-ann-change = Modification d’annotation
weavero-undo-plain = { $dir ->
        [undo] Annuler
       *[redo] Répéter
    }
weavero-undo-action = { $dir ->
        [undo] Annuler { $label }
       *[redo] Répéter { $label }
    }
weavero-undo-button-tip =
    { $action } ({ $accel })
    Clic droit : historique
weavero-undo-note-done = { $dir ->
        [undo] Annulé : { $label }
       *[redo] Répété : { $label }
    }
weavero-undo-note-stopped = { $dir ->
        [undo] { $done ->
            [0] Arrêt : impossible d’annuler { $label }
            [one] Arrêt : impossible d’annuler { $label } ({ $done } effectuée)
            [many] Arrêt : impossible d’annuler { $label } ({ $done } effectuées)
           *[other] Arrêt : impossible d’annuler { $label } ({ $done } effectuées)
        }
       *[redo] { $done ->
            [0] Arrêt : impossible de répéter { $label }
            [one] Arrêt : impossible de répéter { $label } ({ $done } effectuée)
            [many] Arrêt : impossible de répéter { $label } ({ $done } effectuées)
           *[other] Arrêt : impossible de répéter { $label } ({ $done } effectuées)
        }
    }
weavero-undo-note-steps = { $dir ->
        [undo] Annulé : { $count } étapes
       *[redo] Répété : { $count } étapes
    }
weavero-undo-history = Historique
weavero-undo-history-list = { $dir ->
        [undo] Historique des annulations
       *[redo] Historique des répétitions
    }
weavero-undo-stack = { $stack ->
        [reader] Annotations
        [bookmarks-lib] Marque-pages (bibliothèque)
        [bookmarks-doc] Marque-pages (ce document)
       *[outline] Table des matières
    }
weavero-undo-ago = { $unit ->
        [now] à l’instant
        [min] il y a { $count } min
        [h] il y a { $count } h
       *[d] il y a { $count } j
    }
weavero-undo-row-reach = { $dir ->
        [undo] { $count ->
            [0] Annuler cette étape
            [one] Annuler cette étape et { $count } étape liée
            [many] Annuler cette étape et les { $count } étapes liées
           *[other] Annuler cette étape et les { $count } étapes liées
        }
       *[redo] { $count ->
            [0] Répéter cette étape
            [one] Répéter cette étape et { $count } étape liée
            [many] Répéter cette étape et les { $count } étapes liées
           *[other] Répéter cette étape et les { $count } étapes liées
        }
    }
weavero-undo-row-tip =
    { $stack } — { $reach }
    Ctrl+clic ou la case : la cocher
weavero-undo-row-tip-plain =
    { $reach }
    Ctrl+clic ou la case : la cocher
weavero-undo-row-dependent = { $kind ->
        [reader] { $count ->
            [one] L’étape au-dessus a modifié la même annotation
            [many] Les étapes au-dessus ont modifié les mêmes annotations
           *[other] Les étapes au-dessus ont modifié les mêmes annotations
        }
       *[other] { $count ->
            [one] L’étape au-dessus a touché les mêmes entrées
            [many] Les étapes au-dessus ont touché les mêmes entrées
           *[other] Les étapes au-dessus ont touché les mêmes entrées
        }
    }
weavero-undo-tick-tip = { $state ->
        [auto] { $dir ->
            [undo] Nécessaire à votre choix : annulée avec lui
           *[redo] Nécessaire à votre choix : répétée avec lui
        }
        [on] Cochée
       *[off] { $dir ->
            [undo] Cocher pour annuler avec les autres
           *[redo] Cocher pour répéter avec les autres
        }
    }
weavero-undo-show-older = { $count ->
        [one] Afficher { $count } étape plus ancienne
        [many] Afficher { $count } étapes plus anciennes
       *[other] Afficher { $count } étapes plus anciennes
    }
weavero-undo-more = { $count } autres
weavero-undo-run-selected = { $dir ->
        [undo] Annuler la sélection ({ $count })
       *[redo] Répéter la sélection ({ $count })
    }
weavero-undo-run-tip = { $dir ->
        [undo] Annuler toutes les étapes cochées, dans l’ordre
       *[redo] Répéter toutes les étapes cochées, dans l’ordre
    }

# ---- Reader: comment popup, badges, standalone reader windows (reader.ts) ----
weavero-reader-copy-url = Copier
weavero-reader-copy-url-tip = Copier l’URL dans le presse-papiers
weavero-reader-comment-extra-links = Liens supplémentaires dans le commentaire :
weavero-reader-open-comment-tip = Ouvrir le commentaire
weavero-reader-am-add-comment = Ajouter un commentaire…
weavero-reader-move-to-tab-tip = Déplacer ce lecteur dans un onglet de la fenêtre principale de Zotero
weavero-reader-newtab = Nouvel onglet
weavero-reader-newtab-tip = Nouvel onglet — ouvrir un document de la bibliothèque ({ $shortcut })
weavero-reader-tablist-settings = Paramètres du menu des onglets
weavero-reader-tablist-filetype-tip = Filtrer les onglets par type de fichier joint. Cliquez dans la fenêtre pour filtrer, Alt+clic pour exclure.
weavero-reader-window-minimize = Réduire
weavero-reader-window-maximize = Agrandir
weavero-reader-window-restore = Restaurer
weavero-reader-window-close = Fermer
weavero-reader-app-menu = Ouvrir le menu de l’application
weavero-reader-convert-last-main-window = C’est la dernière fenêtre principale. Ouvrez d’abord une autre fenêtre principale, puis convertissez celle-ci.
weavero-reader-convert-no-documents = Aucun onglet de document à déplacer — une fenêtre de lecteur a besoin d’au moins un onglet PDF, EPUB ou capture ouvert.

# ---- Related items popup in the reader (reader.ts) ----
weavero-related-add-label = Ajouter un document connexe
weavero-related-add-tip = Ajouter un document connexe…
weavero-related-empty = Aucun document connexe.
weavero-related-remove = Retirer
weavero-related-different-libraries = Vous ne pouvez pas associer des documents de bibliothèques différentes.

# ---- Notes: note tabs in reader windows, link editor (reader.ts, note-editor.ts) ----
weavero-note-tab-fallback-title = Note
weavero-note-link-edit-text = Texte
weavero-note-link-edit-url = URL
weavero-note-link-edit-apply = Appliquer

# ---- Note outline (note-nav.ts) ----
weavero-notenav-title = Plan
weavero-notenav-filter = Filtrer les titres
weavero-notenav-toggle = Afficher/masquer le plan
weavero-notenav-empty = Aucun titre dans cette note.
weavero-notenav-no-match = Aucun titre ne correspond à la recherche.
weavero-notenav-heading-link-readonly = Cette note est en lecture seule : son titre ne peut pas recevoir d’ancre de lien.
weavero-notenav-heading-missing = Le titre vers lequel pointe ce lien n’est plus dans la note.

# ---- List All Tabs: libraries, filters, settings (tabs.ts) ----
weavero-tabs-tab-count = { $count ->
        [one] { $count } onglet
        [many] { $count } onglets
       *[other] { $count } onglets
    }
weavero-tabs-annotation-count = { $count ->
        [one] { $count } annotation
        [many] { $count } annotations
       *[other] { $count } annotations
    }
weavero-tabs-library-other = Autre
weavero-tabs-library-fallback = Bibliothèque { $id }
weavero-tabs-library-unnamed = Bibliothèque
weavero-tabs-library-tick = Cliquez pour filtrer sur cette bibliothèque, Alt+clic pour l’exclure. Cliquez à nouveau pour effacer.
weavero-tabs-filetype-button = Filtrer les onglets par type de fichier joint. Cliquez dans la fenêtre pour filtrer, Alt+clic pour exclure.
weavero-tabs-settings-button = Paramètres du menu des onglets
weavero-tabs-filter-clear = Effacer le filtre
weavero-tabs-filter-hint = Alt+clic pour exclure
weavero-tabs-filter-clear-all = Effacer
    .title = Effacer tous les filtres d’onglets (garder cette fenêtre ouverte)
    .aria-label = Effacer tous les filtres d’onglets
weavero-tabs-filter-clear-close = Effacer et fermer
weavero-tabs-filetype-option = { $type } — cliquez pour inclure, Alt+clic pour exclure.
weavero-tabs-filetype-note = Note
weavero-tabs-library-chip = { $name } — cliquez pour n’afficher que cette bibliothèque, Alt+clic pour l’exclure.
weavero-tabs-settings-sort-by-library = Trier les onglets par bibliothèque
weavero-tabs-settings-annotation-count = Afficher le nombre d’annotations

# ---- Windows: names, Manage Window, rename (tabs.ts, sessions.ts) ----
weavero-window-default-name = Fenêtre { $number }
weavero-window-reader-default-name = Fenêtre de lecteur
weavero-window-reader-default-name-numbered = Fenêtre de lecteur { $number }
weavero-window-anchor-name = { $name } (ancre)
weavero-window-count = { $count ->
        [one] { $count } fenêtre
        [many] { $count } fenêtres
       *[other] { $count } fenêtres
    }
weavero-window-editor-title = Gérer la fenêtre
weavero-window-editor-kind = { $kind ->
        [reader] Fenêtre de lecteur
        [anchor] Fenêtre principale (ancre)
       *[main] Fenêtre principale
    }
weavero-window-editor-active = Active
weavero-window-editor-name = Nom
weavero-window-editor-reset = Utiliser le nom par défaut ({ $name })
weavero-window-rename-title = Renommer la fenêtre
weavero-window-rename-default-title = Renommer
weavero-window-rename-ok = OK
weavero-window-save-no-tabs = Cette fenêtre n’a aucun onglet à enregistrer.
weavero-window-save-last-main = C’est la dernière fenêtre principale — ouvrez d’abord une autre fenêtre principale, puis enregistrez celle-ci.
weavero-window-save-no-documents = Cette fenêtre n’a aucun onglet de document à enregistrer.
weavero-window-move-no-tabs = Cette fenêtre n’a aucun onglet à déplacer.
weavero-window-move-last-main = C’est la dernière fenêtre principale — elle ne peut pas être déplacée vers une autre session.
weavero-window-move-no-documents = Cette fenêtre n’a aucun onglet de document à déplacer.

# ---- Saved windows (tabs.ts) ----
weavero-savedwin-header = Fenêtres enregistrées
weavero-savedwin-reopen = Rouvrir cette fenêtre enregistrée
weavero-savedwin-remove-tab = Retirer cet onglet de la fenêtre enregistrée
weavero-savedwin-default-name = { $kind ->
        [reader] Fenêtre de lecteur
       *[main] Fenêtre
    }
weavero-savedwin-rename-title = Renommer la fenêtre enregistrée
weavero-savedwin-reopen-gone = Aucun des documents de cette fenêtre enregistrée n’existe plus.
weavero-savedwin-reopen-notes-only = Cette fenêtre enregistrée ne contient que des notes — une fenêtre de lecteur a besoin d’au moins un onglet de document.

# ---- Tab sessions (sessions.ts) ----
weavero-session-default-name = Session { $date }
weavero-session-unnamed = Session
weavero-session-dot = S
weavero-session-current = Session actuelle
weavero-session-current-tip = Clic droit pour renommer cette session
weavero-session-created = Créée : { $date }
weavero-session-last-used = Dernière utilisation : { $date }
weavero-session-header = Sessions
weavero-session-sort-button = Trier les sessions
weavero-session-sort-direction = { $order } (cliquez pour inverser)
weavero-session-sort-order = { $order ->
        [oldest] Les plus anciennes d’abord
        [newest] Les plus récentes d’abord
        [az] De A à Z
        [za] De Z à A
        [leastRecent] Les moins récemment utilisées d’abord
        [mostRecent] Les plus récemment utilisées d’abord
        [ascending] Croissant
       *[descending] Décroissant
    }
weavero-session-new = Nouvelle session
    .title = Ouvrir un espace de travail vierge comme nouvelle session (la session actuelle reste enregistrée ci-dessous)
weavero-session-row-current = Session actuelle — se met à jour automatiquement quand vous ouvrez et fermez des onglets
weavero-session-row-switch = Passer à cette session
weavero-session-twisty = { $state ->
        [expanded] Réduire
       *[collapsed] Afficher les onglets
    }
weavero-session-untitled = Session sans titre
weavero-session-date-line = { $sort ->
        [created] Créée : { $date }
       *[lastUsed] Dernière utilisation : { $date }
    }
weavero-session-tab-untitled = Sans titre
weavero-session-auto-tag = auto
weavero-session-rename-title = Renommer la session
weavero-session-rename-label = Nom de la session :
weavero-session-delete-title = Supprimer la session
weavero-session-delete-confirm = Supprimer la session enregistrée « { $name } » ?
weavero-session-remove-window-confirm = { $count ->
        [one] Retirer cette fenêtre ({ $count } onglet) de « { $name } » ?
        [many] Retirer cette fenêtre ({ $count } onglets) de « { $name } » ?
       *[other] Retirer cette fenêtre ({ $count } onglets) de « { $name } » ?
    }

# ---- Tab groups (tab-groups.ts) ----
weavero-tabgroup-move-new-reader-window = Déplacer vers une nouvelle fenêtre de lecteur
weavero-tabgroup-move-new-group-reader-window = Déplacer vers un nouveau groupe dans une nouvelle fenêtre de lecteur
weavero-tabgroup-move-new-main-window = Déplacer vers une nouvelle fenêtre principale
weavero-tabgroup-move-new-group-main-window = Déplacer vers un nouveau groupe dans une nouvelle fenêtre principale
weavero-tabgroup-new-reader-window = Nouvelle fenêtre de lecteur
weavero-tabgroup-new-main-window = Nouvelle fenêtre principale
weavero-tabgroup-unnamed-short = Groupe
weavero-tabgroup-unnamed = Groupe sans nom
weavero-tabgroup-rename-title = Renommer le groupe d’onglets
weavero-tabgroup-rename-placeholder = Nom du groupe
weavero-tabgroup-name-placeholder = Exemple : revue de littérature
weavero-tabgroup-status = { $state ->
        [active] Actif
       *[saved] Enregistré
    }
weavero-tabgroup-home-window = dans { $name }
weavero-tabgroup-color = { $color ->
        [purple] violet
        [cyan] cyan
        [orange] orange
        [yellow] jaune
        [pink] rose
        [green] vert
        [gray] gris
        [red] rouge
       *[blue] bleu
    }
weavero-tabgroup-saved-header = Groupes d’onglets enregistrés
weavero-tabgroup-reopen = Rouvrir ce groupe enregistré

## ---- Added at the merge of refs, l10n and notecite into main (2026-11-20):
## references in your library, the split corner's Close Tab, the default
## attachment's marks, citations after Zotero links in notes.

weavero-pref-relations-references =
    .label = Marquer les références que vous avez dans les fenêtres de citation d’un PDF
weavero-pref-relations-references-desc = Quand vous survolez une citation dans le texte, Zotero liste les références vers lesquelles elle renvoie. Chaque référence qui est un document de l’une de vos bibliothèques reçoit une marque — ● avec un PDF, ○ sans — et des boutons pour ouvrir son PDF dans un nouvel onglet, dans une nouvelle fenêtre ou à côté de l’article que vous lisez (vue scindée : cet article est verrouillé de son côté). ⋯ l’affiche dans la bibliothèque, ouvre sa copie dans une autre bibliothèque ou copie son lien. Les références sont trouvées par DOI, par titre ou par volume et première page, dans les bibliothèques de cet ordinateur seulement : rien ne passe par Internet et rien n’est modifié dans vos bibliothèques.
weavero-pref-relations-references-marks =
    .label = Marquer les entrées de la liste de références
weavero-pref-relations-references-marks-desc = Une petite marque dans la marge à côté de chaque entrée de la liste de références de l’article que vous avez ; cliquez dessus pour ouvrir la référence, l’afficher dans la bibliothèque ou copier son lien. Non affichée en mode lecture.
weavero-pref-relations-references-section =
    .label = Section « Références » dans le panneau du document du lecteur
weavero-pref-relations-references-section-desc = La liste de références de l’article, dans l’ordre du document, avec les mêmes marques et boutons, et le nombre de ses références que vous avez ; affichez-la entière ou seulement ce que vous avez. Cliquez sur une référence pour la voir dans le PDF.
weavero-pref-relations-references-citedby =
    .label = Section « Cité par » dans le panneau du document
weavero-pref-relations-references-citedby-desc = Les articles de vos bibliothèques dont la liste de références cite le document, avec leur nombre. Weavero lit les listes de références de vos PDF en arrière-plan, dans ce que Zotero garde à côté de chaque PDF (son index du texte intégral, et la structure des PDF que vous avez ouverts dans le lecteur de Zotero). Cliquez sur un article pour l’ouvrir à sa référence au document. Rien ne passe par Internet et rien n’est modifié dans vos bibliothèques.
# Build Zotero's structure data for all PDFs (modules/sdt-build.ts, citations M5).
weavero-pref-relations-references-sdt-build =
    .label = Construire les données de structure de Zotero pour tous les PDF
weavero-pref-relations-references-sdt-build-desc = Zotero construit les données de structure d’un PDF, sa liste de références comprise, quand vous ouvrez le PDF dans son lecteur. Cette option les fait construire par Zotero pour chaque PDF de vos bibliothèques, en arrière-plan, un à la fois, les plus récemment ajoutés d’abord, afin que Références et Cité par lisent les listes précises. Le travail ne se fait que lorsque vous n’utilisez pas l’ordinateur, et ce que vous ouvrez ne l’attend jamais. Désactivée par défaut : sur une grande bibliothèque, cela demande des heures de travail, réparties sur les moments où vous n’êtes pas là, et de l’espace disque, que vous voyez avant le début.
weavero-sdt-build-warn-title = Construire les données de structure de tous vos PDF ?
weavero-sdt-build-warn-intro =
    { $count ->
        [0] Chaque PDF de vos bibliothèques a déjà ses données de structure. Zotero les construira pour les PDF que vous ajouterez, un à la fois.
        [one] Zotero va construire les données de structure de { $count } PDF qui n’en a pas encore, comme si vous l’ouvriez une fois dans le lecteur de Zotero.
       *[other] Zotero va construire les données de structure des { $count } PDF qui n’en ont pas encore, comme si vous ouvriez chacun d’eux une fois dans le lecteur de Zotero : un à la fois, les plus récemment ajoutés d’abord.
    }
weavero-sdt-build-warn-time = Durée : environ { $time } de travail en arrière-plan. Il ne se fait que lorsque vous n’utilisez pas l’ordinateur (ni clavier ni souris pendant une minute), et se répartit donc sur ces moments ; un cœur du processeur est occupé pendant qu’il tourne. Ce que vous ouvrez dans Zotero ne l’attend jamais. Il reprend après un redémarrage.
weavero-sdt-build-warn-disk = Disque : environ { $disk } de plus, dans un fichier à côté de chaque PDF.
weavero-sdt-build-warn-sync = Rien n’est synchronisé ni envoyé : chaque ordinateur construit les siennes.
weavero-sdt-build-warn-cache = C’est le cache de Zotero lui-même (.zotero-sdt-cache), le même que si vous ouvriez chaque PDF une fois. Les fichiers peuvent être supprimés à tout moment ; Zotero en reconstruit un quand il ouvre ce PDF.
weavero-sdt-build-warn-ok = Construire
weavero-sdt-build-dur =
    { $unit ->
        [minutes] { $lo } à { $hi } minutes
        [days] { $lo } à { $hi } jours
       *[hours] { $lo } à { $hi } heures
    }
weavero-sdt-build-dur-one =
    { $unit ->
        [minutes] { $n ->
            [0] { $n } minutes
            [one] { $n } minute
           *[other] { $n } minutes
        }
        [days] { $n ->
            [0] { $n } jours
            [one] { $n } jour
           *[other] { $n } jours
        }
       *[hours] { $n ->
            [0] { $n } heures
            [one] { $n } heure
           *[other] { $n } heures
        }
    }
weavero-sdt-build-size =
    { $lo } à { $hi } { $unit ->
        [GB] Go
       *[MB] Mo
    }
weavero-sdt-build-size-one =
    { $n } { $unit ->
        [GB] Go
       *[MB] Mo
    }
weavero-sdt-build-status-counting = Décompte de vos PDF : { $done } sur { $total }…
weavero-sdt-build-status-run =
    { $wait ->
        [reader] En attente pendant l’ouverture d’un PDF : { $done } PDF sur { $total }, reste environ { $left }.
        [busy] En attente pendant que Zotero lit un autre PDF : { $done } PDF sur { $total }, reste environ { $left }.
        [memory] En attente tant que la mémoire est faible : { $done } PDF sur { $total }, reste environ { $left }.
        [active] En attente tant que vous utilisez l’ordinateur : { $done } PDF sur { $total }, reste environ { $left }.
       *[none] Construction : { $done } PDF sur { $total }, reste environ { $left }.
    }
weavero-sdt-build-status-start = En attente de démarrage.
weavero-sdt-build-status-paused = En pause.
weavero-sdt-build-status-done =
    { $failed ->
        [0] Terminé : chaque PDF a ses données de structure.
       *[other] Terminé : chaque PDF a ses données de structure, sauf { $failed } que Zotero n’a pas pu lire.
    }
weavero-sdt-build-status-zotero = Zotero construit lui-même les données de structure de vos PDF.
weavero-sdt-build-pause = Mettre en pause
weavero-sdt-build-resume = Reprendre
weavero-sdt-build-stop = Arrêter
# Remove Built Data (modules/sdt-build.ts): see en-US.
weavero-pref-relations-references-sdt-clean-desc = Les données de structure que Zotero garde à côté de vos documents et les caches que Weavero construit à partir de vos bibliothèques, dont l’index « Cité par », occupent de l’espace disque. Les supprimer ne fait rien perdre : ils sont reconstruits au besoin. Vos propres données restent telles quelles.
weavero-sdt-clean-measuring = Mesure des données construites…
weavero-sdt-clean-size =
    { $index ->
        [yes] { $count ->
            [0] Données construites : { $size }, l’index « Cité par ».
            [1] Données construites : { $size }, les données de structure de { $count } document et l’index « Cité par ».
           *[other] Données construites : { $size }, les données de structure de { $count } documents et l’index « Cité par ».
        }
       *[no] { $count ->
            [0] Données construites : { $size }.
            [1] Données construites : { $size }, les données de structure de { $count } document.
           *[other] Données construites : { $size }, les données de structure de { $count } documents.
        }
    }
weavero-sdt-clean-button = Supprimer les données construites…
weavero-sdt-clean-running = Suppression des données construites : { $done } documents sur { $total }…
weavero-sdt-clean-done =
    { $count ->
        [0] Données construites supprimées : { $size }.
        [1] Données construites supprimées : { $size }, dont les données de structure de { $count } document.
       *[other] Données construites supprimées : { $size }, dont les données de structure de { $count } documents.
    }
weavero-sdt-clean-done-failed =
    { $failed ->
        [1] Données construites supprimées : { $size }. { $failed } fichier n’a pas pu être supprimé : un autre programme l’utilise peut-être. Réessayez plus tard.
       *[other] Données construites supprimées : { $size }. { $failed } fichiers n’ont pas pu être supprimés : un autre programme les utilise peut-être. Réessayez plus tard.
    }
weavero-sdt-clean-warn-title = Supprimer les données construites ?
weavero-sdt-clean-warn-intro =
    { $count ->
        [0] Weavero va supprimer { $size } de données construites à partir de vos bibliothèques : ses caches, dont l’index « Cité par ».
        [1] Weavero va supprimer { $size } de données construites à partir de vos bibliothèques : les données de structure de { $count } document (le fichier .zotero-sdt-cache de Zotero lui-même) et les caches que Weavero en a construits, dont l’index « Cité par ».
       *[other] Weavero va supprimer { $size } de données construites à partir de vos bibliothèques : les données de structure de { $count } documents (les fichiers .zotero-sdt-cache de Zotero lui-même) et les caches que Weavero en a construits, dont l’index « Cité par ».
    }
weavero-sdt-clean-warn-back = Rien n’est perdu : Zotero reconstruit les données de structure d’un document quand vous l’ouvrez dans son lecteur, ou pour chaque PDF avec « Construire les données de structure de Zotero pour tous les PDF », et « Cité par » reconstruit son index en arrière-plan.
weavero-sdt-clean-warn-off = « Construire les données de structure de Zotero pour tous les PDF » est désactivé.
weavero-sdt-clean-warn-kept = Vos propres données restent telles quelles : les plans que vous avez modifiés, les signets, les groupes d’onglets et les sessions, les Chercheurs et les paramètres des Flux.
weavero-sdt-clean-warn-ok = Supprimer
weavero-menu-split-close-tab =
    .label = Fermer l’onglet
weavero-refs-act-tab =
    .title = Ouvrir dans un nouvel onglet
weavero-refs-act-window =
    .title = Ouvrir dans une nouvelle fenêtre
weavero-refs-act-split =
    .title = Ouvrir en vue scindée
weavero-refs-act-library =
    .title = Afficher dans la bibliothèque
weavero-refs-act-more =
    .title = Plus
weavero-menu-refs-show-in =
    .label = Afficher dans { $library }
weavero-refs-bibmark =
    .title = { $where ->
        [other] { $others ->
            [0] Seulement dans { $library }
            [1] Seulement dans { $library } et une autre bibliothèque
           *[other] Seulement dans { $library } et { $others } autres bibliothèques
        }
       *[here] Dans votre bibliothèque ({ $library })
    }, { $pdf ->
        [yes] { $file ->
            [epub] avec un EPUB
           *[pdf] avec un PDF
        }.{ "\u000A" }Cliquez pour ses détails et où l’ouvrir.
       *[no] sans PDF.{ "\u000A" }Cliquez pour ses détails.
    }
weavero-menu-refs-open-short =
    .label = { $where ->
        [window] Ouvrir dans une nouvelle fenêtre
        [split] Ouvrir en vue scindée
       *[tab] Ouvrir dans un nouvel onglet
    }{ $from ->
        [other] { " (" }{ $library })
       *[here] { "" }
    }
weavero-menu-refs-children =
    .label = Pièces jointes et notes
weavero-menu-refs-attachments =
    .label = { $count ->
        [one] Pièce jointe
       *[other] Pièces jointes
    }
weavero-menu-refs-notes =
    .label = { $count ->
        [one] Note
       *[other] Notes
    }
weavero-refs-att-missing = Fichier introuvable
weavero-refs-header =
    .label = { $state ->
        [counted] { $total ->
            [one] { $total } référence
           *[other] { $total } références
        }
       *[none] Références
    }
weavero-refs-sidenav =
    .tooltiptext = Références
weavero-refs-sec-fulltext = D’après le texte intégral du PDF. Ouvrez le PDF pour la liste exacte.
weavero-refs-web-tip =
    .title = { $how ->
        [link] Absente de vos bibliothèques.{ "\u000A" }Cliquez pour l’ouvrir dans votre navigateur : { $url }
       *[lookup] Absente de vos bibliothèques.{ "\u000A" }Cliquez pour la chercher en ligne (Crossref, sinon une recherche Google Scholar).
    }
weavero-citedby-header =
    .label = { $state ->
        [counted] { $count ->
            [one] { $count } article citant
           *[other] { $count } articles citants
        }
       *[none] Cité par
    }
weavero-citedby-sidenav =
    .tooltiptext = Cité par
weavero-citedby-row = { $title }
    Cliquez pour ouvrir cet article à sa référence au document.
weavero-citedby-building = Lecture des listes de références de vos PDF en cours : { $done } sur { $total }…
weavero-citedby-more = Afficher { $count } de plus
weavero-citedby-also = aussi dans { $libraries }
weavero-citedby-also-label = Aussi dans
weavero-lf-toggle =
    .tooltiptext = Rechercher
weavero-lf-filter-toggle =
    .tooltiptext = Trier et filtrer
weavero-lf-placeholder =
    .placeholder = { $kind ->
        [references] { $count ->
            [one] Rechercher dans { $count } référence…
           *[other] Rechercher dans les { $count } références…
        }
        [citedBy] { $count ->
            [one] Rechercher dans { $count } article…
           *[other] Rechercher dans les { $count } articles…
        }
       *[other] Rechercher dans les { $count } lignes…
    }
weavero-lf-count = { $shown } sur { $total }
weavero-lf-busy = Filtrage en cours…
weavero-lf-sort-short = { $field ->
        [paper] Ordre de l’article
        [year] Année
        [cited] Citations
        [title] Titre
        [author] Premier auteur
       *[added] Date d’ajout
    }
weavero-lf-sort-button =
    .title = Ordre de tri
weavero-lf-sort-heading =
    .label = Trier par
weavero-lf-sort =
    .label = { $field ->
        [paper] Ordre dans l’article
        [year] Année
        [cited] Citations dans vos bibliothèques
        [title] Titre
        [author] Premier auteur
       *[added] Date d’ajout
    }
weavero-lf-sort-dir =
    .title = { $order ->
        [newest] Plus récents d’abord
        [oldest] Plus anciens d’abord
        [most] Plus cités d’abord
        [least] Moins cités d’abord
        [az] De A à Z
       *[za] De Z à A
    }
weavero-lf-chip = { $chip ->
        [since] Depuis { $year }
        [pdf] Avec PDF
        [in] Dans la bibliothèque
       *[out] Hors bibliothèque
    }
weavero-lf-chip-tip =
    .title = { $on ->
        [yes] Cliquer pour tout afficher à nouveau
       *[no] Cliquer pour n’afficher que ceux-ci
    }
weavero-lf-none = { $kind ->
        [references] Aucune référence ne correspond au filtre.
        [citedBy] Aucun article ne correspond au filtre.
       *[other] Rien ne correspond au filtre.
    }
weavero-refs-chip =
    .title = { $kind ->
        [pdf] Dans votre bibliothèque, avec un PDF ou un EPUB : { $count }
        [nopdf] Dans votre bibliothèque, sans PDF : { $count }
        [away] Seulement dans une autre bibliothèque que celle de cet article : { $count }
       *[web] Absentes de vos bibliothèques : { $count }
    }
weavero-refs-act-web-busy =
    .title = Recherche de la référence en ligne…
weavero-menu-refs-web =
    .label = Ouvrir dans le navigateur
weavero-refs-card-et-al = et al.
weavero-refs-card-library = { $where ->
        [other] Seulement dans { $library }
       *[here] Dans { $library }
    }
weavero-refs-card-library-more = { $where ->
        [other] Seulement dans { $library } et { $others }
       *[here] Dans { $library } et { $others }
    }
weavero-refs-card-library-others = { $count } autres bibliothèques
weavero-refs-libname = « { $name } »
weavero-refs-uncertain = Plusieurs documents de vos bibliothèques pourraient correspondre à cette référence ; Weavero affiche le premier :
weavero-refs-uncertain-item = { $year ->
        [none] « { $title } » ({ $type })
       *[other] « { $title } » ({ $type }, { $year })
    }
weavero-refs-card-more = Plus
weavero-refs-card-less = Moins
weavero-refs-card-image =
    .title = { $title } : cliquez pour ouvrir
weavero-defatt-mark-pick =
    .title = Pièce jointe par défaut : s’ouvre au double-clic
weavero-defatt-mark-auto =
    .title = Choix automatique : ce que Zotero ouvre quand aucune pièce jointe par défaut n’est définie
weavero-pref-notes-citations =
    .label = Citations après les liens Zotero dans les notes
weavero-pref-notes-citations-desc = Faites un clic droit sur un lien <code data-l10n-name="scheme">zotero://</code> dans une note et choisissez <em>Ajouter une citation après le lien</em> : le lien reste, et la citation du document par Zotero lui-même le suit. Un lien vers une page de PDF cite le document parent du PDF à cette page (la page imprimée d’une annotation qui s’y trouve, s’il y en a une) ; un lien vers un surlignement ou un soulignement ajoute son extrait et sa citation, comme lorsque vous faites glisser l’annotation dans la note. <em>Ajouter des citations après les liens de la sélection</em> et <em>Ajouter des citations après tous les liens</em> en traitent plusieurs à la fois ; une seule annulation les retire toutes. Les citations sont celles de Zotero : elles se synchronisent et se lisent de la même façon sans Weavero. Les liens vers des notes, vers des fichiers sans document parent et vers une autre bibliothèque restent tels quels. Nécessite <em>Liens et relations → Notes : Éditeur</em>.
weavero-menu-note-cite-link =
    .label = Ajouter une citation après le lien
weavero-menu-note-cite-sel =
    .label = Ajouter des citations après les liens de la sélection ({ $n })
weavero-menu-note-cite-all =
    .label = Ajouter des citations après tous les liens ({ $n })
weavero-note-cite-why-readonly = Cette note est en lecture seule.
weavero-note-cite-why-noitem = Ce lien ne désigne aucun document.
weavero-note-cite-why-note = Une note ne peut pas être citée.
weavero-note-cite-why-nolibrary = La bibliothèque liée n’est pas dans ce Zotero.
weavero-note-cite-why-otherlibrary = Une note ne cite que des documents de sa propre bibliothèque, comme « Ajouter une citation » de Zotero.
weavero-note-cite-why-missing = Le document lié n’est pas dans la bibliothèque.
weavero-note-cite-why-noparent = Un fichier sans document parent ne peut pas être cité.
weavero-note-cite-why-notcitable = Ce document ne peut pas être cité.
weavero-note-cite-why-cited = Déjà cité juste après le lien.

## Flux (modules/feeds.ts) : colonne Pertinence, section « Pourquoi pertinent »,
## marque et filtre « dans votre bibliothèque », Paramètres -> Weavero -> Flux.

weavero-feeds-col = Pertinence
weavero-feeds-libcol = Dans la bibliothèque
weavero-feeds-header =
    .label = Pourquoi pertinent
weavero-feeds-sidenav =
    .tooltiptext = Pourquoi pertinent
weavero-feeds-inlib-tip = Déjà dans votre bibliothèque
weavero-feeds-inlib = Déjà dans votre bibliothèque
weavero-feeds-card-tip = Déjà dans { $library } — cliquez pour sa fiche
weavero-feeds-score = Pertinence { $score }
weavero-feeds-scoring = Pas encore évalué…
weavero-feeds-related = En lien, dans votre bibliothèque
weavero-feeds-reason-lib = { $count ->
        [0] Proche d’articles de votre bibliothèque
        [one] Proche de { $count } article de votre bibliothèque
       *[other] Proche de { $count } articles de votre bibliothèque
    }
weavero-feeds-reason-near-row = { $level ->
        [strong] Très proche d’un article de votre bibliothèque
        [moderate] Proche d’un article de votre bibliothèque
       *[weak] Vaguement lié à un article de votre bibliothèque
    }
weavero-feeds-reason-own-row = Proche de l’un de vos articles
weavero-feeds-reltag-near = { $level ->
        [strong] Très proche
        [moderate] Proche
       *[weak] Vaguement lié
    }
weavero-feeds-reltag-own = Votre article
weavero-feeds-relscore-tip = Proximité du texte avec cet élément du flux (0 à 99)
weavero-feeds-reason-author = Auteurs présents dans votre bibliothèque : { $names }
weavero-feeds-reason-followed = Auteur suivi : { $names }
weavero-feeds-reason-alert = Alerte : { $queries }
weavero-feeds-reason-journal = { $count ->
        [one] Une revue que vous lisez : { $journal } ({ $count } article)
       *[other] Une revue que vous lisez : { $journal } ({ $count } articles)
    }
weavero-ga-header =
    .label = Résumé graphique
weavero-ga-sidenav =
    .tooltiptext = Résumé graphique
weavero-ga-failed = L’image n’a pas pu être chargée.
weavero-ga-open =
    .title = Cliquer pour voir l’image en taille réelle
weavero-ga-close =
    .title = Cliquer ou appuyer sur Échap pour fermer
weavero-filter-dim-feed-not-in-library = Pas dans votre bibliothèque
weavero-filter-feed-not-in-library-tip = Pas dans votre bibliothèque — les éléments de flux qu’aucune de vos bibliothèques ne contient encore (même DOI, sinon même titre) : cliquez pour masquer ceux que vous avez déjà. Alt+clic pour n’afficher qu’eux.
weavero-pref-nav-feeds = Flux
weavero-pref-feeds-title = Flux
weavero-pref-feeds-enable =
    .aria-label = Activer la pertinence dans les flux
weavero-pref-feeds-desc = Une note de pertinence pour chaque élément de vos flux Zotero, calculée sur votre ordinateur à partir de vos bibliothèques : proximité avec vos propres articles et avec votre bibliothèque, auteurs dont vous avez déjà des articles, auteurs suivis, alertes par mots-clés, revues les plus lues — et, pour un flux qui porte ses propres notes, la note et les raisons du flux lui-même. Une colonne Pertinence trie les flux du plus pertinent au moins pertinent (les autres colonnes les trient aussi), une section « Pourquoi pertinent » du volet de l’élément en donne les raisons et les articles liés de votre bibliothèque, et les éléments que vous avez déjà sont marqués. Une section « Résumé graphique » montre seule l’image d’un élément du flux. Les scores sont calculés sans Internet et rien n’est modifié dans vos bibliothèques ; seule l’image d’un élément du flux est chargée depuis son éditeur quand vous sélectionnez l’élément, comme le fait le Résumé de Zotero.
weavero-pref-feeds-names-title = Votre nom d’auteur
weavero-pref-feeds-names-desc = Un nom par ligne, sous la forme « Nom, Prénom » ou « Nom, P. » (les initiales suffisent). Les éléments de Ma bibliothèque qui ont l’un de ces noms parmi leurs auteurs sont vos articles.
weavero-pref-feeds-names-count = { $count ->
        [0] Aucun élément de Ma bibliothèque n’a l’un de ces noms comme auteur.
        [one] { $count } élément de Ma bibliothèque a l’un de ces noms comme auteur.
       *[other] { $count } éléments de Ma bibliothèque ont l’un de ces noms comme auteur.
    }
weavero-pref-feeds-followed-title = Auteurs suivis
weavero-pref-feeds-followed-desc = Un nom par ligne. Un élément de flux de l’un d’eux reçoit une note plus élevée.
weavero-pref-feeds-alerts-title = Alertes par mots-clés
weavero-pref-feeds-alerts-desc = Une alerte par ligne, cherchée dans le titre et le résumé : chaque mot doit y être (« bubble » trouve aussi « bubbles »), une expression entre guillemets doit y être telle quelle, et un mot précédé d’un signe moins (-review) ne doit pas y être.
weavero-pref-feeds-watched-title = Articles surveillés
weavero-pref-feeds-watched-desc = Un titre ou un DOI par ligne. Écrits dans le fichier d’alertes (ci-dessous), pour un outil qui cherche les nouveaux articles qui les citent.
weavero-pref-feeds-cited-title = Alertes de citation d’une personne
weavero-pref-feeds-cited-desc = Un nom par ligne. Écrits dans le fichier d’alertes (ci-dessous), pour un outil qui cherche les nouveaux articles qui citent cette personne.
weavero-pref-feeds-journals =
    .label = Les revues que vous lisez le plus comptent dans la note
weavero-pref-feeds-journals-desc = Un élément de flux d’une revue bien représentée dans vos bibliothèques reçoit une note plus élevée.
weavero-pref-feeds-export-title = Fichier d’alertes
weavero-pref-feeds-export-desc = « Exporter le fichier d’alertes » écrit ces listes dans le dossier de données de Weavero (feeds/alerts.json), sous la forme d’un fichier JSON qu’un outil de recommandation peut lire ; « Exporter… » les écrit où vous voulez. Écrites sur un fichier d’alertes existant, ce que son outil a trouvé pour une entrée (ses identifiants OpenAlex) est conservé. « Importer… » lit une liste d’alertes Google Scholar, ou un fichier d’alertes, et ajoute à ces listes ses auteurs suivis, articles surveillés, alertes de citation et alertes par mots-clés.
weavero-pref-feeds-export = Exporter le fichier d’alertes
weavero-pref-feeds-export-as = Exporter…
weavero-pref-feeds-import = Importer…
weavero-feeds-export-as-title = Exporter le fichier d’alertes
weavero-feeds-import-title = Importer des alertes Google Scholar
weavero-pref-feeds-exported = Écrit : { $path }
weavero-pref-feeds-imported = { $count ->
        [0] Rien de nouveau à ajouter.
        [one] { $count } entrée ajoutée.
       *[other] { $count } entrées ajoutées.
    }
weavero-pref-feeds-failed = Échec : { $error }

weavero-panelock-button-unlock =
    .tooltiptext = Déverrouiller
    .aria-label = Déverrouiller
weavero-panelock-menu-lock-top =
    .label = Verrouiller en haut
weavero-panelock-menu-lock =
    .label = Verrouiller en bas
weavero-panelock-menu-unlock =
    .label = Déverrouiller

weavero-people-tab-title = Chercheurs
weavero-people-menu-show =
    .label = Afficher le chercheur
weavero-people-cmark-tip = { $name } est dans Chercheurs. Cliquez pour ouvrir sa page.
weavero-people-cmark-tip-maybe = Probablement { $name }, dans Chercheurs (même nom, mêmes initiales). Cliquez pour ouvrir sa page.
weavero-people-tb-hide =
    .label = Masquer le bouton Chercheurs
weavero-people-menu-add =
    .label = Ajouter comme chercheur
weavero-people-search =
    .placeholder = Rechercher
weavero-people-chip-check = À vérifier
weavero-people-chip-followed = Suivies
weavero-people-chip-all = Toutes
weavero-people-list-empty = Personne pour l’instant. Ajoutez un chercheur depuis les auteurs d’un élément (clic droit sur un auteur dans la section Info), ou construisez la liste à partir des auteurs que vous suivez.
weavero-people-list-none = Aucune personne ne correspond.
weavero-people-build = Construire depuis les auteurs suivis
weavero-people-build-tip = Une fiche pour chaque auteur que vous suivez (Paramètres → Flux, et le fichier d’alertes du dossier de données de Weavero), marquée À vérifier ; puis chacun avec un profil OpenAlex est recherché en ligne, un à la fois.
weavero-people-build-file = Depuis un fichier…
weavero-people-build-file-tip = La même chose depuis un fichier d’alertes que vous choisissez
weavero-people-build-file-title = Choisir un fichier d’alertes
weavero-people-build-stop = Arrêter
weavero-people-build-progress = Recherche des chercheurs : { $done } sur { $total }…
weavero-people-build-done = Nouvelles : { $added } · Désormais suivies : { $followed } · En cours de recherche : { $queued }
weavero-people-build-none = Aucun auteur suivi à ajouter. Ajoutez-en dans Paramètres → Flux, ou construisez depuis un fichier d’alertes.
weavero-people-select = Choisissez un chercheur à gauche.
weavero-people-refresh = Actualiser
weavero-people-refresh-tip = Recherche ce chercheur dans OpenAlex, ORCID, theses.fr, IdRef et Wikidata. Seuls son nom et ses identifiants sont envoyés ; rien de vous.
weavero-people-refreshing = Recherche en cours…
weavero-people-refreshed = { $count ->
        [0] Rien de nouveau ({ $date }).
        [one] { $count } nouvelle valeur trouvée ({ $date }).
       *[other] { $count } nouvelles valeurs trouvées ({ $date }).
    }
weavero-people-error = { $source } n’a pas pu être joint : { $error }.
weavero-people-theses-none = theses.fr n’a aucun chercheur de ce nom avec cet identifiant ORCID.
weavero-people-follow = Suivre
weavero-people-followed = Suivie
weavero-people-mark-checked = Marquer comme vérifiée
weavero-people-mark-check = Marquer à vérifier
weavero-people-remove = Retirer…
weavero-people-remove-title = Retirer des Chercheurs
weavero-people-remove-confirm = Retirer { $name } des Chercheurs ? Ce que vous avez gardé, rejeté et écrit à son sujet disparaît aussi.
weavero-people-added-from = Ajoutée depuis : { $title }
weavero-people-no-ids = Aucun identifiant pour l’instant. Actualiser trouve ce chercheur grâce à l’article depuis lequel il a été ajouté, ou liste les profils portant son nom pour que vous choisissiez.
weavero-people-no-profile = Aucun profil OpenAlex ne porte ce nom.
weavero-people-pick = { $count ->
        [one] Un profil OpenAlex porte ce nom. Est-ce ce chercheur ? Cliquez dessus pour confirmer.
       *[other] { $count } profils OpenAlex portent ce nom. Lequel est ce chercheur ? Cliquez dessus.
    }
weavero-people-cand-works = { $count ->
        [0] aucun travail
        [one] { $count } travail
       *[other] { $count } travaux
    }
weavero-people-sec-ids = Identifiants
weavero-people-sec-facts = Informations
weavero-people-sec-links = Liens
weavero-people-sec-tree = Arbre généalogique académique
weavero-people-sec-works = Publications
weavero-people-sec-notes = Notes
# Researchers: dated events (MJT 2026-11-25). $where: the place; $field: date, what, where, link,
# note; $kind: seminar, visit, talk (a talk at a conference), jury; $what, $date: the event's.
weavero-people-sec-events = Événements
weavero-people-event-add = Ajouter un événement
weavero-people-events-none = Aucun événement : un séminaire donné, une visite, un jury…
weavero-people-event-at = à { $where }
weavero-people-event-announcement = annonce
weavero-people-event-remove = Supprimer
weavero-people-event-cancel = Annuler
weavero-people-event-field =
    { $field ->
        [date] Date
        [what] Quoi
        [where] Où
        [link] Lien
       *[note] Note
    }
weavero-people-event-ph =
    { $field ->
        [date] 2026-11-25, ou 2026-11, ou 2026
        [what] Séminaire, visite…
        [where] Lieu ou établissement
        [link] Adresse de l’annonce
       *[note] Ce qu’il faut retenir
    }
weavero-people-event-kind =
    { $kind ->
        [seminar] Séminaire
        [visit] Visite
        [talk] Exposé en conférence
       *[jury] Jury
    }
weavero-people-event-bad-date = Écrivez la date sous la forme 2026-11-25, 2026-11 ou 2026.
weavero-people-event-need-what = Indiquez ce qu’était l’événement.
weavero-people-event-bad-link = Le lien doit être une adresse web.
weavero-people-event-remove-confirm = Supprimer l’événement « { $what } » ({ $date }) ?
# The researchers table (the centre pane with no researcher open). $col: name, institution, country,
# papers (their items in your libraries), phd (the year of their PhD).
weavero-people-back = Retour aux chercheurs
weavero-people-table-count =
    { $count ->
        [one] Un chercheur
       *[other] { $count } chercheurs
    }
weavero-people-table-col =
    { $col ->
        [name] Nom
        [institution] Établissement
        [country] Pays
        [papers] Articles dans vos bibliothèques
       *[phd] Thèse
    }
weavero-people-table-sort-tip = Trier par cette colonne ; cliquer à nouveau pour inverser
# Researchers: the Contact card and the custom fields (MJT 2026-11-25). $kind: email, phone, address, web;
# $label: work, home, mobile (a phone), other; $field: kind, label, value -- and for the placeholders the
# kind, or custom (the user's own label); $why: why a value is refused; $what: the line removed.
weavero-people-sec-contact = Coordonnées
weavero-people-contact-add = Ajouter des coordonnées
weavero-people-contact-none = Aucun e-mail, téléphone ni adresse pour l’instant.
weavero-people-contact-kind =
    { $kind ->
        [email] E-mail
        [phone] Téléphone
        [address] Adresse
       *[web] Site web
    }
weavero-people-contact-label =
    { $label ->
        [work] Travail
        [home] Domicile
        [mobile] Mobile
       *[other] Autre
    }
weavero-people-contact-label-custom = Votre propre libellé…
weavero-people-contact-field =
    { $field ->
        [kind] Type
        [label] Libellé
       *[value] Valeur
    }
weavero-people-contact-ph =
    { $field ->
        [email] nom@exemple.org
        [phone] +33 1 23 45 67 89
        [address] Rue, ville, pays : sur plusieurs lignes
        [web] Adresse du site web
       *[custom] Un libellé à vous
    }
weavero-people-contact-map = carte
weavero-people-contact-map-tip = Chercher cette adresse sur OpenStreetMap (l’adresse est envoyée à openstreetmap.org)
weavero-people-contact-bad =
    { $why ->
        [label] Indiquez un libellé.
        [email] Ce n’est pas une adresse e-mail.
        [phone] Un numéro de téléphone contient des chiffres, avec + ( ) - . / et des espaces.
        [web] Ce n’est pas une adresse web.
       *[empty] Saisissez une valeur.
    }
weavero-people-sec-custom = Champs personnalisés
weavero-people-custom-add = Ajouter un champ personnalisé
weavero-people-custom-none = Aucun champ personnalisé pour l’instant.
weavero-people-custom-field =
    { $field ->
        [label] Libellé
       *[value] Valeur
    }
weavero-people-custom-bad = Un champ personnalisé demande un libellé et une valeur.
weavero-people-card-remove-confirm = Supprimer « { $what } » ?
weavero-people-row-edit =
    .label = Modifier
weavero-people-row-remove =
    .label = Supprimer
weavero-people-row-keep =
    .label = Garder
weavero-people-row-reject =
    .label = Rejeter
weavero-people-row-restore =
    .label = Rétablir
# The researcher page's Edit pencil: on, every field shows (the empty ones with their Add).
weavero-people-page-edit = ✎ Modifier
weavero-people-page-edit-tip = Afficher tous les champs, les vides avec leur Ajouter
weavero-people-sec-empty = Rien de connu pour l’instant. Modifier (✎) affiche tous les champs, pour ajouter une valeur.
weavero-people-add-researcher = Ajouter un chercheur
weavero-people-add-researcher-tip = Ajouter un chercheur par son nom : OpenAlex liste les profils de ce nom, à vous de choisir (le réseau, à ce clic seulement)
weavero-people-add-researcher-prompt = Nom du chercheur (Prénom Nom, ou Nom, Prénom) :
# The "Suggested links" queue: every link a source suggested, for all researchers. $count: how many;
# $fact: the link kind (advisor, coadvisor, postdoc, lab, student, linked); $other: the linked researcher; $name: the researcher whose record holds the link.
weavero-people-queue-btn =
    { $count ->
        [0] Liens suggérés
       *[other] Liens suggérés ({ $count })
    }
weavero-people-queue-tip = Chaque lien qu’une source a suggéré et que vous n’avez encore ni gardé ni rejeté, pour tous vos chercheurs
weavero-people-queue-title = Liens suggérés
weavero-people-queue-count =
    { $count ->
        [1] 1 lien à examiner
       *[other] { $count } liens à examiner
    }
weavero-people-queue-none = Aucun lien suggéré ne vous attend.
weavero-people-queue-q =
    { $fact ->
        [advisor] { $other } a-t-il dirigé la thèse de { $name } ?
        [coadvisor] { $other } a-t-il codirigé la thèse de { $name } ?
        [postdoc] { $other } a-t-il accueilli { $name } en postdoc ?
        [lab] { $other } a-t-il travaillé dans le même laboratoire que { $name } ?
        [student] { $other } a-t-il fait sa thèse avec { $name } ?
       *[linked] { $other } est-il lié à { $name } ?
    }
# Dates that do not fit in the academic family. $kind: advisor (an advisor's PhD not before the
# student's), years (the student's PhD outside the link's years); $advisor, $student: names; $ay, $sy:
# their PhD years; $years: the link's years, as the record writes them; $text: one issue in words.
weavero-people-date-issue =
    { $kind ->
        [advisor] La thèse de { $advisor } ({ $ay }) n’est pas antérieure à celle de { $student } ({ $sy }), qu’il ou elle a dirigée.
       *[years] La thèse de { $student } ({ $sy }) tombe hors des années de son lien avec { $advisor } ({ $years }).
    }
weavero-people-date-title =
    { $count ->
        [1] 1 date à vérifier
       *[other] { $count } dates à vérifier
    }
weavero-people-date-confirm-title = Une date ne concorde pas
weavero-people-date-confirm = { $text } Ajouter ce lien quand même ?
# Possible duplicates: two records that may be one researcher. $count: how many; $reason: id-orcid,
# id-openalex, id-idref, id-wikidata, name, form, initials, institution; $name, $keep, $drop: names.
weavero-people-dupe-btn = Doublons possibles ({ $count })
weavero-people-dupe-title =
    { $count ->
        [1] 1 doublon possible
       *[other] { $count } doublons possibles
    }
weavero-people-dupe-items =
    { $count ->
        [0] Aucun document dans vos bibliothèques
        [1] 1 document dans vos bibliothèques
       *[other] { $count } documents dans vos bibliothèques
    }
weavero-people-dupe-reason =
    { $reason ->
        [id-orcid] même ORCID iD
        [id-openalex] même profil OpenAlex
        [id-idref] même IdRef
        [id-wikidata] même élément Wikidata
        [name] même nom
        [form] le nom de l’un est une autre forme de l’autre
        [initials] mêmes initiales
       *[institution] même établissement
    }
weavero-people-dupe-merge = Fusionner dans { $name }
weavero-people-dupe-notsame = Pas la même personne
weavero-people-dupe-confirm-title = Fusionner deux chercheurs
weavero-people-dupe-confirm = Fusionner { $drop } dans { $keep } ? Tout ce qui est connu de { $drop } rejoint { $keep }, et { $drop } est supprimé.
# Evidence on the user's own value: an item of a library, its page, a quote. $field: link (the item), quote;
# $title: the item's title; $page: its page label, or none; $quote: the words, or none.
weavero-people-ev-act = Source…
weavero-people-row-evidence =
    .label = Source…
weavero-people-ev-field =
    { $field ->
        [link] Document
       *[quote] Citation
    }
weavero-people-ev-ph = Un lien zotero:// vers le document, ou choisissez un des PDF ouverts ci-dessous
weavero-people-ev-tab =
    { $page ->
        [none] { $title }
       *[other] { $title }, p. { $page }
    }
weavero-people-ev-tip = Source: { $title }{ $page ->
        [none] {""}
       *[other] , p. { $page }
    }{ $quote ->
        [none] {""}
       *[other] {" "}“{ $quote }”
    } Cliquez pour l’ouvrir.
weavero-people-ev-bad = Collez un lien zotero:// vers un document, ou choisissez un des PDF ouverts.
weavero-people-ev-remove = Retirer la source
weavero-people-fact-position = Poste
weavero-people-fact-institution = Établissement
weavero-people-fact-phd = Établissement du doctorat
weavero-people-fact-phd-year = Année du doctorat
weavero-people-fact-phd-thesis = Thèse
weavero-people-fact-web = Page web
weavero-people-link-advisor = Directeur de thèse
weavero-people-link-coadvisor = Codirecteur
weavero-people-link-postdoc = Accueil postdoctoral
weavero-people-link-lab = Même laboratoire
weavero-people-link-linked = Lié à
weavero-people-link-student = Doctorant
weavero-people-source-me = vous
weavero-people-keep = Garder
weavero-people-reject = Rejeter
weavero-people-restore = Rétablir
weavero-people-edit = Modifier
weavero-people-add-value = Ajouter…
weavero-people-save = Enregistrer
weavero-people-agree = { $count } sources concordent
weavero-people-new = nouveau
weavero-people-conflict = { $count } valeurs : les sources divergent
weavero-people-conflict-new = Une source a donné une nouvelle valeur
weavero-people-status-chosen = gardée par vous
weavero-people-status-confirmed = confirmée
weavero-people-status-suggested = suggérée
weavero-people-status-alternative = autre valeur
weavero-people-status-rejected = rejetée
weavero-people-open-person = Ouvrir { $name }
weavero-people-add-person = { $name } n’est pas dans Chercheurs : cliquez pour l’ajouter
weavero-people-from-record = d’après sa propre fiche
weavero-people-links-none = Aucun lien pour l’instant.
weavero-people-link-name =
    .placeholder = Nom du chercheur
weavero-people-link-add = Ajouter le lien
weavero-people-tree-empty = Aucun directeur ni doctorant connu pour l’instant.
weavero-people-tree-label = Arbre généalogique académique de { $name }
# The lineage tree's academic siblings (the other PhD students of the focus's advisors). $name: an advisor.
weavero-people-lt-sibs-of = Autres doctorants de { $name } :
weavero-people-lt-sibs-tip = Frères et sœurs académiques : les autres doctorants des mêmes directeurs. Un nom recentre l’arbre sur cette personne.
weavero-people-works-count = { $inlib } dans vos bibliothèques, sur { $total }
weavero-people-works-none = Actualiser liste ses publications depuis OpenAlex.
weavero-people-works-offline = Pas encore recherché. Éléments de vos bibliothèques avec un auteur de ce nom :
weavero-people-works-more = { $count } de plus
weavero-people-works-search =
    .placeholder = Filtrer par titre, auteur ou revue
weavero-people-works-sort =
    { $sort ->
        [old] Les plus anciennes d’abord
        [cited] Les plus cités
        [title] Titre
        [venue] Revue
       *[new] Les plus récentes d’abord
    }
weavero-people-works-sort-tip = Trier les publications
weavero-people-works-funnel-tip = Filtrer les publications
weavero-people-works-mark =
    { $kind ->
        [pdf] Dans votre bibliothèque, avec son PDF
        [nopdf] Dans votre bibliothèque, sans PDF
       *[web] Pas dans votre bibliothèque
    }
weavero-people-works-filter =
    { $filter ->
        [type] Type de document
        [venue] Revue
       *[decade] Décennie
    }
weavero-people-works-nomatch = Aucune publication ne correspond.
# The researcher's citation figures: $h, $i10, $cites (numbers); the tooltip says where they come
# from ($from: openalex, or works = computed from the $works works listed) and when ($date).
weavero-people-metrics = indice h { $h } · indice i10 { $i10 } · { $cites } citations
weavero-people-metrics-tip =
    { $from ->
        [works] Calculé à partir des { $works } publications listées, avec leurs comptes OpenAlex ({ $date }).
       *[openalex] OpenAlex, { $date }. Les autres sources comptent autrement.
    }
# A publication's times cited (OpenAlex's count at the last Refresh, $date in the tooltip).
weavero-people-work-cited =
    { $count ->
        [one] Cité { $count } fois
       *[other] Cité { $count } fois
    }
weavero-people-work-cited-tip = OpenAlex, { $date }
# Semantic Scholar's figures, asked for on a click: $h, $cites (numbers), $date, $url (the profile);
# why it failed: $why = nodoi, nomatch, error ($error: the error).
weavero-people-s2-figures = Semantic Scholar : indice h { $h } · { $cites } citations
weavero-people-s2-tip = Semantic Scholar, { $date } : { $url }
weavero-people-s2-ask = Demander à Semantic Scholar
weavero-people-s2-again = Redemander
weavero-people-s2-busy = Demande en cours…
weavero-people-s2-ask-tip = Chercher ce chercheur sur Semantic Scholar, par l’un de ses articles ayant un DOI (le réseau, à ce clic seulement)
weavero-people-s2-failed =
    { $why ->
        [nodoi] Aucune de ses publications n’a de DOI pour le chercher.
        [nomatch] Semantic Scholar n’a pas d’auteur de ce nom sur ses articles.
       *[error] Semantic Scholar n’a pas répondu : { $error }
    }
# Google Scholar: the researcher's public profile, read on a click. $h, $i10, $cites (numbers), $date,
# $url (the profile); why reading failed: $why = refused (a refusal or a robot check), error ($error).
weavero-people-gs-add = Ajouter le profil Google Scholar
weavero-people-gs-add-tip = Donner l’adresse de son profil Google Scholar public, pour en lire les chiffres d’un clic
weavero-people-gs-add-prompt = Collez l’adresse de son profil Google Scholar (scholar.google.com/citations?user=…) :
weavero-people-gs-bad = Ce n’est pas l’adresse d’un profil Google Scholar.
weavero-people-gs-read = Lire Google Scholar
weavero-people-gs-busy = Lecture…
weavero-people-gs-read-tip = Lire les chiffres de son profil Google Scholar (sa première page, à ce clic seulement)
weavero-people-gs-forget = Oublier le profil
weavero-people-gs-forget-tip = Oublier son profil Google Scholar
weavero-people-gs-figures = Google Scholar : indice h { $h } · indice i10 { $i10 } · { $cites } citations
weavero-people-gs-tip = Google Scholar, { $date } : { $url }
weavero-people-gs-failed =
    { $why ->
        [refused] Google Scholar a refusé la page (il peut demander de prouver que vous n’êtes pas un robot) : ouvrez le profil dans votre navigateur.
       *[error] Google Scholar n’a pas répondu : { $error }
    }
weavero-people-notes =
    .placeholder = Vos notes sur ce chercheur
weavero-people-fact-country = Pays
weavero-people-fact-phd-country = Pays du doctorat
weavero-people-fact-birth-year = Année de naissance
weavero-people-sort-tip = Ordre de tri. Les chercheurs dont la valeur n’est pas encore connue viennent en dernier.
weavero-people-sort-heading =
    .label = Trier par
weavero-people-sort =
    .label = { $sort ->
            [first] Prénom
            [added] Date d’ajout (plus récents d’abord)
            [modified] Dernière modification (plus récentes d’abord)
            [items] Documents dans vos bibliothèques (les plus nombreux d’abord)
            [institution] Établissement (A–Z)
            [phdYear] Année du doctorat (plus anciennes d’abord)
            [birthYear] Année de naissance (plus anciennes d’abord)
           *[last] Nom
        }
weavero-people-filter = { $filter ->
        [noOrcid] Sans ORCID iD
        [noIds] Sans identifiant
        [inLib] Dans vos bibliothèques
        [thesis] Thèse dans vos bibliothèques
        [advisor] A des directeurs de thèse
        [student] A des doctorants
        [web] A une page web
        [conflict] Sources en désaccord
        [position] Poste
        [institution] Établissement
        [country] Pays
        [phdCountry] Pays du doctorat
        [birth] Décennie de naissance
       *[phd] Décennie du doctorat
    }
weavero-people-filter-tip = { $filter ->
        [noOrcid] Seulement les chercheurs sans ORCID iD.
        [noIds] Seulement les chercheurs sans aucun identifiant (ORCID, OpenAlex, IdRef, Wikidata) : Actualiser liste les profils portant leur nom.
        [inLib] Seulement les chercheurs auteurs d’au moins un document de vos bibliothèques (d’après leur nom).
        [thesis] Seulement les chercheurs auteurs d’une thèse de vos bibliothèques (d’après leur nom).
        [advisor] Seulement les chercheurs ayant un lien vers un directeur ou un codirecteur de thèse.
        [student] Seulement les chercheurs ayant un doctorant : un lien de doctorant dans leur fiche, ou le lien de directeur de thèse d’un autre chercheur vers eux.
        [web] Seulement les chercheurs ayant une page web.
        [conflict] Seulement les chercheurs dont une information a des sources en désaccord, ou une nouvelle valeur à vérifier.
        [position] Seulement les chercheurs ayant ce poste.
        [institution] Seulement les chercheurs de cet établissement.
        [country] Seulement les chercheurs dont l’établissement actuel est dans ce pays.
        [phdCountry] Seulement les chercheurs ayant obtenu leur doctorat dans ce pays.
        [birth] Seulement les chercheurs nés dans cette décennie (Wikidata).
       *[phd] Seulement les chercheurs ayant obtenu leur doctorat dans cette décennie.
    }
weavero-people-filter-unknown = Inconnu
weavero-people-decade = Années { $decade }
# people4 (MJT 2026-11-24): a researcher's name edited in place, the other forms of the name,
# the sort's label, the filter funnel. The title's tooltip: a click edits the name.
weavero-people-name-edit-tip = Cliquez pour modifier le nom
# Tooltip of the "you" mark beside a name the user typed.
weavero-people-name-mine-tip = Nom saisi par vous : une actualisation ne le change jamais
# The two fields of the name being edited, as Zotero edits a creator.
weavero-people-name-last =
    .placeholder = Nom
    .aria-label = Nom
weavero-people-name-first =
    .placeholder = Prénom
    .aria-label = Prénom
weavero-people-name-empty = Un chercheur doit avoir un nom de famille : le nom n’a pas été modifié.
# The row of the other forms of the name (ORCID, OpenAlex, Wikidata, the user's items, the user's own).
weavero-people-fact-other-names = Autres noms
# A source of a form of the name: how the creators of the user's libraries write it.
weavero-people-source-items = vos documents
# A source of a value: the alerts file (Settings → Feeds), whose followed authors a Build reads, with their ids.
weavero-people-source-radar = fichier d’alertes
# The plain label before the sort button; the button shows the order alone ($sort as in weavero-people-sort).
weavero-people-sort-label = Tri :
weavero-people-sort-current = { $sort ->
        [first] Prénom
        [added] Date d’ajout
        [modified] Dernière modification
        [items] Documents dans vos bibliothèques
        [institution] Établissement
        [phdYear] Année du doctorat
        [birthYear] Année de naissance
       *[last] Nom
    }
# The funnel beside the sort: its tooltip and spoken name, and its popup's name.
weavero-people-funnel-tip = Filtrer les chercheurs
# The funnel's popup: the hint at the top left; Clear (the popup stays open); the red × (Clear and Close).
weavero-people-filter-hint = Alt+clic pour exclure
weavero-people-filter-clear-all = Effacer
    .title = Effacer tous les filtres de chercheurs (garder cette fenêtre ouverte)
    .aria-label = Effacer tous les filtres de chercheurs
weavero-people-filter-clear-close = Effacer et fermer
# The second line of an on/off filter's tooltip (its first line: weavero-people-filter-tip).
weavero-people-filter-gesture = Cliquez pour inclure, Alt+clic pour exclure.
# Tooltip of a value's chip. $value: the value (a position, a country, a decade, Unknown...); $count: the researchers with it.
weavero-people-filter-value-tip = { $value } ({ $count }) — cliquez pour inclure, Alt+clic pour exclure
# Researchers, the right pane (see en-US).
weavero-people-pane-none = Aucun chercheur sélectionné
weavero-people-pane-count =
    { $count ->
        [one] { $count } chercheur sélectionné
       *[other] { $count } chercheurs sélectionnés
    }
weavero-people-pane-open = Ouvrir
weavero-people-pane-toggle =
    { $state ->
        [open] Masquer le volet des détails
       *[closed] Afficher le volet des détails
    }
# Researchers, page modes and family-tree dates (see en-US).
weavero-people-page-done = Terminé
weavero-people-lt-when =
    { $kind ->
        [range] { $type } { $from }–{ $to }
        [from] { $type } à partir de { $from }
        [until] { $type } jusqu’en { $to }
        [unknown] { $type } { $from } ?
       *[end] { $type } { $to }
    }
weavero-people-lt-when-tip = { $date } : la source ne dit pas si le lien a commencé ou s’est terminé cette année-là.
# Researchers, the Google Contacts design, step 2 (see en-US).
weavero-people-nav =
    { $view ->
        [followed] Suivies
        [check] À vérifier
        [queue] Liens suggérés
        [dupes] Doublons
        [conflict] Sources en désaccord
        [noOrcid] Sans ORCID
        [import] Importer depuis un fichier…
       *[all] Chercheurs
    }
weavero-people-nav-head =
    { $group ->
        [manage] Corriger et gérer
       *[browse] Parcourir par
    }
weavero-people-dupe-none = Aucun doublon possible.
weavero-people-fchip =
    { $state ->
        [out] { $filter } : pas { $value }
       *[in] { $filter } : { $value }
    }
weavero-people-fchip-toggle =
    { $state ->
        [out] Pas : { $filter }
       *[in] { $filter }
    }
weavero-people-fchip-remove = Retirer ce filtre
weavero-people-sel =
    { $act ->
        [follow] Suivre
        [unfollow] Ne plus suivre
        [merge] Fusionner
       *[all] Tout sélectionner
    }
weavero-people-sel-count =
    { $count ->
        [one] { $count } sélectionné
       *[other] { $count } sélectionnés
    }
weavero-people-sel-merge-tip = Cochez exactement deux chercheurs pour les fusionner
weavero-people-sel-merge-into =
    .label = Fusionner dans { $name }
weavero-people-sel-row = Sélectionner { $name }
weavero-people-row-act =
    { $act ->
        [follow] Suivre
        [unfollow] Ne plus suivre
        [edit] Modifier
       *[more] Plus d’actions
    }
weavero-people-row-menu =
    .label = { $act ->
            [open] Ouvrir
            [edit] Modifier
            [follow] Suivre
            [unfollow] Ne plus suivre
            [check] Marquer à vérifier
            [checked] Marquer comme vérifiée
            [refresh] Actualiser
           *[remove] Retirer…
        }
weavero-people-table-colmenu =
    .label = { $col ->
            [name] Nom
            [institution] Établissement
            [country] Pays
            [papers] Articles dans vos bibliothèques
           *[phd] Année de thèse
        }
weavero-people-table-colreset =
    .label = Rétablir les colonnes par défaut
# Researchers' tags (see en-US).
weavero-people-tags = Marqueurs
weavero-people-tags-col =
    .label = Marqueurs
weavero-people-tagsel-none = Aucun marqueur à afficher
weavero-people-tagsel-actions =
    .title = Actions sur les marqueurs
weavero-people-tagsel-deselect =
    .label = Tout désélectionner
weavero-people-tag-menu =
    .label = { $act ->
            [color] Attribuer une couleur
            [nocolor] Retirer la couleur
            [position] Position
            [rename] Renommer le marqueur…
           *[delete] Supprimer le marqueur…
        }
weavero-people-tag-add =
    .placeholder = Ajouter un marqueur
weavero-people-tag-remove = Retirer { $name }
weavero-people-bulk-tag = Marqueur
weavero-people-bulk-tag-new =
    .label = Nouveau marqueur…
weavero-people-tag-new-prompt = Ajouter aux chercheurs sélectionnés le marqueur :
weavero-people-tag-rename-prompt = Renommer « { $name } » pour tous les chercheurs :
weavero-people-tag-delete-ask =
    { $count ->
        [one] Retirer le marqueur « { $name } » de { $count } chercheur ?
       *[other] Retirer le marqueur « { $name } » de { $count } chercheurs ?
    }
weavero-people-tag-colors-full = Neuf marqueurs au plus ont une couleur.
weavero-pref-nav-people = Chercheurs
weavero-pref-people-title = Chercheurs
weavero-pref-people-enable =
    .aria-label = Activer Chercheurs
weavero-pref-people-desc = Un onglet Chercheurs (Fichier → Chercheurs) pour construire et vérifier ce que vous savez d’autres chercheurs : leurs identifiants, poste, établissement et doctorat, chaque information avec la valeur de chaque source côte à côte, pour que vous la gardiez, la rejetiez ou la modifiiez ; leurs directeurs de thèse et doctorants, dessinés en arbre généalogique académique ; leurs publications, marquées présentes ou non dans votre bibliothèque. Ajoutez un chercheur avec « Ajouter comme chercheur » dans le menu contextuel d’un auteur, ou construisez la liste à partir des auteurs que vous suivez. Weavero les recherche dans OpenAlex, ORCID, theses.fr, IdRef et Wikidata seulement quand vous cliquez : les requêtes portent le nom et les identifiants du chercheur, rien de vous. Les fiches restent dans le dossier de données de Weavero, jamais dans vos bibliothèques.
weavero-pref-people-toolbar-button =
    .label = Bouton Chercheurs dans la barre d’outils du panneau des collections
weavero-pref-people-toolbar-button-desc = Un bouton dans la barre d’outils au-dessus de vos collections, qui ouvre l’onglet Chercheurs, ou l’affiche s’il est déjà ouvert ; <strong>Ctrl/Cmd+clic</strong> l’ouvre à côté de la bibliothèque, dans une vue scindée. Un clic droit sur le bouton le masque ; cette case le fait revenir.
weavero-pref-people-names-title = Noms
weavero-pref-people-names-desc = Comment chaque partie de l’onglet Chercheurs écrit le nom d’un chercheur. « Nom, Prénom » montre que la liste est triée par nom de famille ; un nom sans prénom s’écrit sans virgule.
weavero-pref-people-names-list = Liste des chercheurs
weavero-pref-people-names-heading = Titre de la page d’un chercheur
weavero-pref-people-names-links = Liens (directeurs de thèse, doctorants…)
weavero-pref-people-names-tree = Arbre généalogique académique
weavero-pref-people-names-last =
    .label = Nom, Prénom
weavero-pref-people-names-first =
    .label = Prénom Nom
# Sauvegardes des données de Weavero (modules/backups.ts).
weavero-pref-nav-backups = Sauvegardes
weavero-pref-backups-title = Sauvegardes
weavero-pref-backups-desc = Les sauvegardes de Zotero et la synchronisation de Zotero ne comprennent pas les données de Weavero — vos signets, plans, groupes d’onglets, sessions et listes des flux — ni ses paramètres. Weavero en garde lui-même des copies, dans son dossier de données. Une restauration ou une importation remplace les données et les paramètres de Weavero par ceux d’une sauvegarde ; ce que vous avez est sauvegardé d’abord, pour que vous puissiez l’annuler.
weavero-pref-backups-auto =
    .label = Sauvegarder automatiquement
weavero-pref-backups-auto-desc = Une fois par jour, et avant chaque mise à jour de Weavero, Weavero copie ses données et ses paramètres. Ce qu’il peut reconstruire lui-même, comme l’index « Cité par » et les scores des flux, est laissé de côté.
weavero-pref-backups-keep-lead = Garder les
weavero-pref-backups-keep-unit = { $count ->
        [one] dernière sauvegarde quotidienne
       *[other] dernières sauvegardes quotidiennes
    }
weavero-pref-backups-keep-desc = Des sauvegardes faites avant une mise à jour, par « Sauvegarder maintenant », avant une restauration ou une importation, et des fichiers importés, les 5 dernières de chaque sorte sont gardées.
weavero-pref-backups-actions-title = Vos sauvegardes
weavero-pref-backups-now = Sauvegarder maintenant
weavero-pref-backups-restore = Restaurer…
weavero-pref-backups-export = Exporter…
weavero-pref-backups-import = Importer…
weavero-pref-backups-open = Ouvrir le dossier
weavero-pref-backups-where = Les sauvegardes sont gardées dans { $path }
weavero-pref-backups-last = Dernière sauvegarde : { $date } ({ $reason }). { $count ->
        [one] { $count } sauvegarde
       *[other] { $count } sauvegardes
    }, { $size } en tout.
weavero-pref-backups-none = Aucune sauvegarde pour l’instant.
weavero-pref-backups-last-error = La dernière sauvegarde a échoué ({ $date }) : { $error }
weavero-pref-backups-restored = { $kind ->
        [import] Importé le { $date } depuis le fichier sauvegardé sous { $from }. Pour l’annuler, restaurez la sauvegarde « Avant une importation » du { $pre }.
       *[other] Restauré le { $date } depuis la sauvegarde du { $from }. Pour l’annuler, restaurez la sauvegarde « Avant une restauration » du { $pre }.
    }
weavero-pref-backups-restore-failed = La restauration du { $date } n’a pas eu lieu ({ $problem }). Vos données et vos paramètres sont restés tels quels.
weavero-pref-backups-pending = { $kind ->
        [import] Une importation attend que Zotero redémarre.
       *[other] Une restauration de la sauvegarde du { $date } attend que Zotero redémarre.
    } Weavero l’écrit avant de lire ses données, si bien que rien de ce qu’il garde encore en mémoire ne peut l’écraser.
weavero-pref-backups-pending-restart = Redémarrer Zotero maintenant
weavero-pref-backups-pending-cancel = Annuler la restauration
weavero-pref-backups-working = Sauvegarde en cours…
weavero-pref-backups-backed-up = Sauvegardé : { $date }.
weavero-pref-backups-exported = Écrit : { $path }
weavero-pref-backups-staged = C’est fait : Weavero la restaure au prochain démarrage de Zotero.
weavero-pref-backups-failed = Cela n’a pas fonctionné : { $error }
weavero-pref-backups-checking = Vérification de la sauvegarde…
weavero-pref-backups-pick = Choisissez une sauvegarde : ce que sa restauration changerait s’affiche en dessous.
weavero-pref-backups-no-backups = Il n’y a encore aucune sauvegarde à restaurer.
weavero-pref-backups-from-file = Depuis le fichier { $file }, créé le { $date } par Weavero { $version }. Ce que son importation changerait :
weavero-pref-backups-opt-data =
    .label = Données
weavero-pref-backups-opt-settings =
    .label = Paramètres
weavero-pref-backups-go-restore = Restaurer cette sauvegarde…
weavero-pref-backups-go-import = Importer ce fichier…
weavero-pref-backups-cancel = Annuler
weavero-backups-ask-title = Restaurer une sauvegarde de Weavero
weavero-backups-ask-restore = Restaurer { $what ->
        [data] les données de Weavero
        [settings] les paramètres de Weavero
       *[both] les données et les paramètres de Weavero
    } depuis la sauvegarde du { $date } ? Ce que vous avez maintenant est sauvegardé d’abord, pour que vous puissiez l’annuler en restaurant cette copie. Weavero restaure la sauvegarde au redémarrage de Zotero, avant de lire ses données.
weavero-backups-ask-import-title = Importer des données de Weavero
weavero-backups-ask-import = Remplacer { $what ->
        [data] les données de Weavero
        [settings] les paramètres de Weavero
       *[both] les données et les paramètres de Weavero
    } par ceux de { $file } ? Ce que vous avez maintenant est sauvegardé d’abord, pour que vous puissiez l’annuler en restaurant cette copie. Weavero importe le fichier au redémarrage de Zotero, avant de lire ses données.
weavero-backups-ask-restart = Redémarrer Zotero maintenant
weavero-backups-ask-later = Au prochain démarrage
weavero-backups-export-title = Exporter les données de Weavero
weavero-backups-import-title = Importer des données de Weavero
weavero-backups-row = { $date } — { $reason } — { $size }
weavero-backups-reason-daily = quotidienne
weavero-backups-reason-manual = Sauvegarder maintenant
weavero-backups-reason-pre-restore = avant une restauration
weavero-backups-reason-pre-import = avant une importation
weavero-backups-reason-import = importée depuis { $file }
weavero-backups-reason-update = avant la mise à jour vers { $to }
weavero-backups-reason-update-from = avant la mise à jour de { $from } vers { $to }
weavero-backups-reason-other = automatique ({ $reason })
weavero-backups-store-bookmarks = Signets
weavero-backups-store-outlines = Plans
weavero-backups-store-ann-order = Ordre des annotations
weavero-backups-store-note-view = Plans et replis des notes
weavero-backups-store-sessions = Sessions d’onglets
weavero-backups-store-saved-windows = Fenêtres enregistrées
weavero-backups-store-tab-groups-file = Groupes d’onglets (copie fichier)
weavero-backups-store-tab-groups-bak = Groupes d’onglets (copie précédente)
weavero-backups-store-outline-eval = Évaluations des plans
weavero-backups-store-feeds = Listes des flux
weavero-backups-store-feeds-export = Fichier d’alertes
weavero-backups-store-tab-groups = Groupes d’onglets
weavero-backups-store-settings = Paramètres
weavero-backups-diff-line = { $store } : { $changes }
weavero-backups-diff-added = { $count ->
        [one] { $count } ajouté
       *[other] { $count } ajoutés
    }
weavero-backups-diff-removed = { $count ->
        [one] { $count } supprimé
       *[other] { $count } supprimés
    }
weavero-backups-diff-changed = { $count ->
        [one] { $count } modifié
       *[other] { $count } modifiés
    }
weavero-backups-diff-file-added = ajouté (absent aujourd’hui)
weavero-backups-diff-file-removed = supprimé (absent de cette sauvegarde)
weavero-backups-diff-file-changed = remplacé
weavero-backups-diff-none = Rien ne changerait : ceci contient les données et les paramètres que vous avez maintenant.
weavero-backups-failed-title = Weavero n’a pas pu sauvegarder ses données
weavero-backups-failed-kept = Vos sauvegardes précédentes sont gardées.
weavero-backups-failed-disk-full = Le disque est plein.
weavero-backups-failed-locked = Un autre programme bloque l’un des fichiers de Weavero. Weavero réessaie à la prochaine sauvegarde.
weavero-backups-failed-too-large = Les données de Weavero dépassent la taille permise pour une sauvegarde (256 Mo).
weavero-backups-failed-other = Un problème est survenu : { $error }
weavero-backups-damaged = Cette sauvegarde est endommagée (un fichier ne correspond pas à son relevé) et a été supprimée.
weavero-backups-import-newer = Ce fichier a été créé par une version plus récente de Weavero. Mettez Weavero à jour, puis importez-le.
weavero-backups-import-not-weavero = Ce n’est pas un fichier exporté par Weavero.
weavero-backups-restored-title = Weavero a restauré une sauvegarde
weavero-backups-restored = Les données et les paramètres de Weavero sont ceux de la sauvegarde du { $date }. Pour l’annuler, restaurez la copie faite juste avant, dans Paramètres → Weavero → Sauvegardes.
weavero-backups-restore-failed-title = Weavero n’a pas restauré la sauvegarde
weavero-backups-restore-failed = La sauvegarde du { $date } n’a pas été restaurée : vos données et vos paramètres sont tels qu’ils étaient.
# Researchers: the lineage tree (peoplenet, 2026-11-25).
weavero-people-lt-back = Précédent
weavero-people-lt-forward = Suivant
weavero-people-lt-home = Revenir à { $name }
weavero-people-lt-zoom-in = Zoom avant
weavero-people-lt-zoom-out = Zoom arrière
weavero-people-lt-fit = Afficher tout l’arbre
weavero-people-lt-export = Exporter
weavero-people-lt-export-svg =
    .label = Image SVG…
weavero-people-lt-export-png =
    .label = Image PNG…
weavero-people-lt-export-csv =
    .label = Tableau CSV…
weavero-people-lt-export-title = Exporter l’arbre de filiation
weavero-people-lt-edge =
    { $type ->
        [phd] Doctorat
        [coadvisor] Codirection
        [postdoc] Postdoc
        [research] Chercheur
        [ra] Assistant de recherche
       *[other] Autre
    }
weavero-people-lt-more-up =
    { $count ->
        [one] { $count } encadrant de plus, non affiché
        [many] { $count } encadrants de plus, non affichés
       *[other] { $count } encadrants de plus, non affichés
    }
weavero-people-lt-more-down =
    { $count ->
        [one] { $count } élève de plus, non affiché
        [many] { $count } élèves de plus, non affichés
       *[other] { $count } élèves de plus, non affichés
    }
weavero-people-lt-fewer = Afficher moins
weavero-people-lt-phd = Doctorat { $year }
weavero-people-lt-tree-inst = l’établissement qu’indique l’{ $source }, peut-être un ancien
weavero-people-lt-aft-tip = La page de ce chercheur sur l’{ $source } ({ $licence })
weavero-people-lt-open = Ouvrir
weavero-people-lt-open-tip = Ouvrir ce chercheur dans Chercheurs
weavero-people-lt-follow-tip = Ajouter aux Chercheurs et suivre
weavero-people-lt-card-tip = Cliquer pour centrer l’arbre sur ce chercheur
weavero-people-lt-grants = Subventions NIH : { $list }
weavero-people-lt-credit = Encadrants et élèves aussi tirés de l’{ $source } ({ $licence }), export de { $version }.
# Researchers: the strip above the items list (peoplenet, 2026-11-25).
weavero-people-strip-label = Chercheurs que nomme votre recherche
weavero-people-strip-counts =
    { $here ->
        [one] { $here } document ici
        [many] { $here } documents ici
       *[other] { $here } documents ici
    } · { $shown } dans ces résultats
weavero-people-strip-only = Seulement les siens
weavero-people-strip-only-tip = Afficher seulement les documents de l’auteur { $form } (filtre Auteurs de Weavero)
weavero-people-strip-close = Masquer pour cette recherche
weavero-people-strip-open-tip = Ouvrir dans Chercheurs
