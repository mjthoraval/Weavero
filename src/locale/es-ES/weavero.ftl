# Weavero -- Spanish (es-ES).
# Machine-assisted translation (Claude), to be reviewed by a native speaker.
# Source: locale/en-US/weavero.ftl. Terms Weavero shares with Zotero follow
# Zotero's own es-ES translation.

weavero-backlinks-header =
    .label = { $count ->
        [one] { $count } Retroenlace
        [many] { $count } Retroenlaces
       *[other] { $count } Retroenlaces
    }
weavero-backlinks-sidenav =
    .tooltiptext = Retroenlaces
weavero-links-header =
    .label = { $count ->
        [one] { $count } Enlace a elemento
        [many] { $count } Enlaces a elementos
       *[other] { $count } Enlaces a elementos
    }
weavero-links-sidenav =
    .tooltiptext = Enlaces a elementos

weavero-pref-nav-links = Enlaces y relaciones
weavero-pref-nav-filters = Orden y filtros
weavero-pref-nav-bookmarks = Marcadores
weavero-pref-nav-tabs = Pestañas y ventanas
weavero-pref-nav-extras = Extras
weavero-pref-intro = Enlaces activos en comentarios y notas, filtros en la lista de elementos y en las pestañas, marcadores y columnas del árbol de elementos. La mayoría de las funciones están activadas de forma predeterminada; desactive las que no utilice.

weavero-pref-links-title = Enlaces y relaciones
weavero-pref-links-enable =
    .aria-label = Activar enlaces y relaciones
weavero-pref-links-desc = Reconocimiento en el propio texto de URI activas y de markdown, iconos para identificar y abrir los elementos relacionados, y utilidades del menú contextual para copiar enlaces de Zotero y añadir elementos relacionados.

weavero-pref-links-mode-title = Modo de visualización
weavero-pref-links-mode-desc = Cómo aparecen los enlaces y el markdown en comentarios y notas: <strong>En línea</strong> los representa por completo; <strong>Icono y ventana emergente</strong> deja el texto sin formato y abre una ventana emergente (más ligero).
weavero-pref-links-mode-inline =
    .label = En línea
weavero-pref-links-mode-icon =
    .label = Icono y ventana emergente
weavero-pref-links-show = Mostrar:
weavero-pref-links-show-urls =
    .label = URL
weavero-pref-links-show-zotero =
    .label = Enlaces de Zotero
weavero-pref-links-show-app =
    .label = Enlaces de aplicaciones
weavero-pref-links-show-markdown =
    .label = Markdown
weavero-pref-links-markdown-desc = Markdown: <strong>**negrita**</strong>, <em>*cursiva*</em>, ~~tachado~~, <span data-l10n-name="mono">`code`</span>, <span data-l10n-name="mono2">[label](url)</span>. Los esquemas de enlaces de aplicaciones se eligen justo debajo.

weavero-pref-links-schemes-title = Esquemas de enlaces de aplicaciones
weavero-pref-links-schemes-desc = Esquemas que Weavero reconoce como enlaces de aplicaciones en los comentarios. Solo se aplica cuando <strong>Enlaces de aplicaciones</strong> está activado más arriba.
weavero-pref-links-schemes-no-confirm =
    .label = Abrir sin diálogo de confirmación
weavero-pref-links-schemes-no-confirm-desc = Omitir la pregunta de Firefox «¿Permitir que este sitio abra el enlace …?» para los esquemas activados.
weavero-pref-links-scheme-magnet =
    .label = magnet:
    .tooltiptext = Enlaces magnet de torrent
weavero-pref-links-scheme-mailto =
    .label = mailto:
    .tooltiptext = Direcciones de correo electrónico
weavero-pref-links-scheme-skype =
    .label = skype:
    .tooltiptext = Llamadas / chats de Skype
weavero-pref-links-scheme-sms =
    .label = sms:
    .tooltiptext = Mensajes SMS
weavero-pref-links-scheme-spotify =
    .label = spotify:
    .tooltiptext = Pistas / listas de reproducción de Spotify
weavero-pref-links-scheme-tel =
    .label = tel:
    .tooltiptext = Números de teléfono
weavero-pref-links-scheme-discord =
    .label = discord://
    .tooltiptext = Servidores de Discord
weavero-pref-links-scheme-evernote =
    .label = evernote://
    .tooltiptext = Notas de Evernote
weavero-pref-links-scheme-figma =
    .label = figma://
    .tooltiptext = Archivos de Figma
weavero-pref-links-scheme-file =
    .label = file://
    .tooltiptext = Archivos locales (pide confirmación antes de abrir)
weavero-pref-links-remote-file =
    .label = Permitir enlaces a archivos de otros ordenadores (recursos compartidos de red)
weavero-pref-links-remote-file-desc = Cada enlace pide confirmación una vez antes de abrirse; Weavero recuerda los enlaces que abre. Al desactivar esta opción, se olvidan.
weavero-pref-links-scheme-ftp =
    .label = ftp://
    .tooltiptext = Servidores FTP
weavero-pref-links-scheme-msteams =
    .label = msteams://
    .tooltiptext = Reuniones de Microsoft Teams
weavero-pref-links-scheme-notion =
    .label = notion://
    .tooltiptext = Páginas de Notion
weavero-pref-links-scheme-obsidian =
    .label = obsidian://
    .tooltiptext = Notas de Obsidian
weavero-pref-links-scheme-slack =
    .label = slack://
    .tooltiptext = Canales de Slack
weavero-pref-links-scheme-vscode =
    .label = vscode://
    .tooltiptext = Espacios de trabajo / archivos de VS Code
weavero-pref-links-scheme-zoom =
    .label = zoommtg://
    .tooltiptext = Reuniones de Zoom

weavero-pref-links-view-icons =
    .label = Iconos sobre las anotaciones en la vista del documento
weavero-pref-links-view-icons-desc = Distintivos de enlace / elemento relacionado dibujados en la página sobre las anotaciones que tienen un enlace o elementos relacionados. Desmarque esta opción para mantener el documento libre de superposiciones.
weavero-pref-links-apply-title = Aplicar a
weavero-pref-links-apply-library = Biblioteca:
weavero-pref-links-apply-items-list =
    .label = Lista de elementos
weavero-pref-links-apply-annotations-panel =
    .label = Panel de anotaciones
weavero-pref-links-apply-reader = Lector:
weavero-pref-links-apply-reader-sidebar =
    .label = Barra lateral
weavero-pref-links-apply-document-view =
    .label = Vista del documento
weavero-pref-links-apply-notes = Notas:
weavero-pref-links-apply-note-editor =
    .label = Editor de notas
    .tooltiptext = Enlaces y markdown en el editor de notas
weavero-pref-links-apply-notes-pane =
    .label = Panel de notas
    .tooltiptext = Enlaces en la lista de notas del panel contextual (Todas las notas)
weavero-pref-links-apply-notes-list =
    .label = Lista de elementos
    .tooltiptext = Enlaces en los títulos de las notas en la lista de elementos
weavero-pref-links-apply-desc = Lugares donde Weavero muestra los enlaces y el markdown de las anotaciones.
weavero-pref-links-internal-title = Navegación por enlaces internos
weavero-pref-links-internal-desc = <strong>Ctrl/Cmd+clic</strong> en un enlace interno (figura, ecuación, cita) envía su destino a un panel dividido; <strong>Mayús+clic</strong> lo envía a una ventana aparte. Si aún no hay ninguna división abierta, crear una:
weavero-pref-links-internal-horizontal =
    .label = División horizontal
weavero-pref-links-internal-vertical =
    .label = División vertical

weavero-pref-uri-title = Utilidades de URI
weavero-pref-uri-enable =
    .aria-label = Activar las utilidades de URI
weavero-pref-uri-desc = Entradas del menú contextual que copian enlaces directos <span data-l10n-name="mono">zotero://</span> al portapapeles.
weavero-pref-uri-copy-item =
    .label = «Copiar enlace de selección» / «Copiar enlace de apertura» en los menús de elementos
weavero-pref-uri-copy-item-desc = Copia un enlace <span data-l10n-name="mono">zotero://select/…</span> que lleva al elemento.
weavero-pref-uri-copy-collection =
    .label = «Copiar enlace de la colección» / «Copiar enlace de la búsqueda guardada»
weavero-pref-uri-copy-collection-desc = Añade una entrada para copiar el enlace al menú contextual del árbol de colecciones.

weavero-pref-relations-title = Relaciones y elementos vinculados
weavero-pref-relations-enable =
    .aria-label = Activar las funciones de relaciones y elementos vinculados
weavero-pref-relations-desc = Funciones basadas en las relaciones entre elementos relacionados de Zotero y en el mecanismo de elementos vinculados.
weavero-pref-relations-add-related =
    .label = «Añadir relacionado…» en el menú de la lista de elementos
weavero-pref-relations-add-related-desc = Abre el diálogo de selección de elementos y vincula los elementos elegidos como relacionados entre sí (admite varias anotaciones).
weavero-pref-relations-chain-badge =
    .label = Distintivo de cadena en las filas de anotaciones con elementos relacionados
weavero-pref-relations-chain-badge-desc = Un icono de cadena junto a las anotaciones que tienen elementos relacionados; haga clic en él para ver la lista.
weavero-pref-relations-backlinks =
    .label = Sección «Retroenlaces» en el panel de elementos
weavero-pref-relations-backlinks-desc = Qué enlaza aquí: los comentarios de anotación y las notas que contienen un enlace de Zotero (zotero://) o una cita en nota del elemento seleccionado, agrupados por su elemento, con el texto que rodea al enlace. También en el panel contextual de las pestañas del lector y de nota, y en el filtro «Tiene retroenlaces».
weavero-pref-relations-item-links =
    .label = Sección «Enlaces a elementos» en el panel de elementos
weavero-pref-relations-item-links-desc = Adónde enlaza el elemento seleccionado: los enlaces de Zotero (zotero://) y las citas en notas (las citas y anotaciones que el editor de notas de Zotero añade a una nota) escritos en sus notas y comentarios de anotación, agrupados por la nota o anotación que los contiene, con el texto que rodea a cada uno. Un enlace cuyo elemento ya no existe, o cuya biblioteca de grupo no está en este perfil, aparece en gris y no se cuenta. También en el panel contextual de las pestañas del lector y de nota, y en la tarjeta que aparece cuando el puntero se detiene sobre un enlace de Zotero o una cita en nota en una nota, un comentario de anotación o la lista de elementos.
weavero-pref-relations-children-scope =
    .label = Contar y listar las etiquetas y los elementos relacionados de los subordinados en las secciones Etiquetas y Relacionado
weavero-pref-relations-children-scope-desc = Junto a los títulos de las secciones Etiquetas y Relacionado, cuántos tiene el propio elemento y cuántos tienen sus adjuntos, notas y anotaciones. Haga clic en un recuento para mostrar solo esos, y Alt+clic para ocultarlos; las etiquetas o elementos relacionados de un subordinado se listan debajo de los del propio elemento, bajo un encabezado para ese subordinado. Si está desactivado, las dos secciones se muestran como las dibuja Zotero.
weavero-pref-relations-open-related =
    .label = Submenú «Abrir elemento relacionado» en el lector
weavero-pref-relations-open-related-desc = Entradas Abrir en el lector / En una nueva ventana para cada elemento relacionado, en el menú contextual de la anotación.
weavero-pref-relations-libraries-tint =
    .label = Colorear las filas de bibliotecas vinculadas en el panel de elementos
weavero-pref-relations-libraries-tint-desc = Resalta la fila de la biblioteca del elemento mostrado en la sección Bibliotecas y colecciones.

weavero-pref-filters-title = Orden y filtros
weavero-pref-filters-enable =
    .aria-label = Activar orden y filtros
weavero-pref-filters-desc = Controles que ordenan, ocultan, atenúan o acotan el conjunto visible: la ordenación de anotaciones en el lector, el panel de filtros del árbol de elementos (el botón ▾ de la barra de herramientas) y los filtros por biblioteca / tipo de archivo en el menú de pestañas.
weavero-pref-filters-ann-sort =
    .label = Ordenación de anotaciones en el lector
weavero-pref-filters-ann-sort-desc = Ordena la barra lateral Anotaciones del lector por posición, fecha de adición o fecha de modificación: haga clic derecho en el encabezado de la pestaña Anotaciones para ver el menú; mientras haya una ordenación por fecha activa aparece una barra de ordenación de un clic, y las tarjetas muestran entonces ambas fechas, primero la que se usa para ordenar.
weavero-pref-filters-card-date-added =
    .label = Mostrar la fecha de adición en las tarjetas de anotación
weavero-pref-filters-card-date-modified =
    .label = Mostrar la fecha de modificación en las tarjetas de anotación
weavero-pref-filters-card-dates-desc = Fechas al pie de cada tarjeta de la barra lateral Anotaciones del lector, sea cual sea el orden; pase el puntero sobre una para ver ambas fechas completas. Haga clic derecho en el encabezado de la pestaña Anotaciones de un lector para elegir solo para ese documento. Las anotaciones importadas de un PDF creado en otro programa llevan la fecha en que Zotero las importó.
weavero-pref-filters-items-tree =
    .label = Panel de filtros del árbol de elementos
weavero-pref-filters-items-tree-desc = El botón ▾ de la barra de herramientas junto al cuadro de búsqueda, más la ventana emergente de filtros (color/tipo/tipo de archivo, etiquetas, autores, colecciones, búsquedas guardadas).
weavero-pref-filters-read-status =
    .label = Filtro de estado de lectura (Zotero Reading List)
weavero-pref-filters-read-status-desc = Añade una fila de estado de lectura a la ventana emergente de filtros del árbol de elementos cuando la extensión Zotero Reading List está instalada: filtre por ⭐ New / 📙 To Read / 📖 In Progress / 📗 Read / … (Alt+clic para excluir).
weavero-pref-filters-item-count =
    .label = Recuento detallado de elementos
weavero-pref-filters-item-count-desc = Sustituye el «N elementos en esta vista» del panel de elementos por un desglose (elementos · adjuntos · notas · anotaciones) para que quede claro qué cuenta el número y por qué cambia al expandir una fila. Mientras hay un filtro activo, también muestra cuántas filas coinciden y cuántas solo están ahí como contexto. Desactívelo para ver el número único de Zotero.
weavero-pref-filters-selection-target =
    .label = Destino de la selección en tres estados
weavero-pref-filters-selection-target-desc = Casillas Principal / Adjunto / Anotación que acotan Ctrl+A y atenúan las filas fuera de ese ámbito.
weavero-pref-filters-collapse-advanced =
    .label = Al contraer la búsqueda avanzada, volver a la búsqueda rápida
weavero-pref-filters-collapse-advanced-desc = El botón de contraer de Zotero oculta el editor de la búsqueda avanzada pero mantiene su filtro aplicado, y deja solo un rótulo «Búsqueda avanzada». Con esta opción, al contraer se vuelve al cuadro de búsqueda rápida con la misma consulta (lo inverso natural de expandirla con el botón del embudo) siempre que la búsqueda rápida pueda expresar esa búsqueda (palabras simples en «Título, Creador, Año», «Todos los campos y etiquetas» o «Todo»). Una búsqueda que use cualquier otra cosa, como una condición de creador o de fecha, se sigue contrayendo como lo hace Zotero. El ✕ de cerrar siempre borra y cierra.
weavero-pref-filters-tabs-library =
    .label = Filtro por biblioteca en el menú de pestañas
weavero-pref-filters-tabs-library-desc = Una casilla junto a cada encabezado de biblioteca en la ventana emergente «Listar todas las pestañas», que oculta esas pestañas.
weavero-pref-filters-tabs-file-type =
    .label = Filtro por tipo de archivo en el menú de pestañas
weavero-pref-filters-tabs-file-type-desc = El botón del embudo en la ventana emergente «Listar todas las pestañas», para filtrar por tipo de adjunto.

weavero-pref-bookmarks-title = Marcadores
weavero-pref-bookmarks-enable =
    .aria-label = Activar los marcadores
weavero-pref-bookmarks-desc = Marcadores en dos ámbitos: un menú desplegable en la barra de herramientas del panel de colecciones para elementos / colecciones / búsquedas, y una pestaña en la barra lateral del lector para ubicaciones dentro del documento.
weavero-pref-bookmarks-sync-note = Los marcadores aún no se sincronizan entre equipos: se guardan localmente en <span data-l10n-name="mono">&lt;Zotero data dir&gt;/weavero/bookmarks.json</span>. (Pasarán al almacenamiento sincronizado que Zotero gestionará para las extensiones en cuanto esté disponible).
weavero-pref-bookmarks-library =
    .label = Marcadores de la biblioteca
weavero-pref-bookmarks-library-desc = Un menú desplegable Marcadores en la barra de herramientas del panel de colecciones para elementos / colecciones / búsquedas guardadas.
weavero-pref-bookmarks-library-autohide =
    .label = Ocultar automáticamente el botón de marcadores de la biblioteca cuando esté vacío
weavero-pref-bookmarks-collection-scroll-title = Dónde aparece una colección marcada
weavero-pref-bookmarks-collection-scroll-desc = Cuando un marcador abre una colección, una biblioteca o una búsqueda guardada, el panel de colecciones la desplaza hasta:
weavero-pref-bookmarks-collection-scroll-top =
    .label = La parte superior del panel (predeterminado)
weavero-pref-bookmarks-collection-scroll-native =
    .label = El comportamiento propio de Zotero: desplazar solo lo necesario
weavero-pref-bookmarks-document =
    .label = Marcadores del documento
weavero-pref-bookmarks-document-desc = Una pestaña Marcadores en la barra lateral del lector para ubicaciones dentro del documento. Suelte una anotación o una selección sobre ella para añadir un marcador.
weavero-pref-bookmarks-document-autohide =
    .label = Ocultar automáticamente la pestaña de marcadores del documento cuando esté vacía
weavero-pref-bookmarks-library-in-reader =
    .label = Mostrar la pestaña de marcadores de la biblioteca en el lector
weavero-pref-bookmarks-library-in-reader-desc = Explore los marcadores de la biblioteca junto a los del documento (Ctrl+clic para combinar ambas vistas).
weavero-pref-bookmarks-page-numbers =
    .label = Mostrar los números de página junto a los marcadores del documento
weavero-pref-bookmarks-page-numbers-desc = El rótulo «p. N» a la derecha de cada marcador. Haga clic derecho en la pestaña Marcadores de un lector para mostrarlos u ocultarlos solo para ese documento. La tarjeta flotante sigue mostrando la página.

weavero-pref-tabs-title = Pestañas y ventanas
weavero-pref-tabs-enable =
    .aria-label = Activar las funciones de pestañas y ventanas
weavero-pref-tabs-desc = Grupos de pestañas, marco de ventana al estilo de un navegador, varias ventanas principales y un panel de elementos en las ventanas independientes del lector.
weavero-pref-tabs-desc-native = Grupos de pestañas, marco de ventana al estilo de un navegador y herramientas para trabajar en varias ventanas.
weavero-pref-tabs-groups =
    .label = Grupos de pestañas en la barra de pestañas
weavero-pref-tabs-groups-desc = Agrupe las pestañas al estilo de Firefox: clic derecho en una pestaña → «Añadir a grupo de pestañas…» para un grupo con nombre y color. Haga clic en el chip del grupo para contraerlo o expandirlo; haga clic derecho en el chip para renombrar, cambiar el color, desagrupar o cerrar el grupo. Los grupos se conservan entre reinicios.
weavero-pref-tabs-split-view =
    .label = Vista dividida
weavero-pref-tabs-split-view-desc = Muestre dos pestañas una al lado de la otra, al estilo de Firefox: clic derecho en una pestaña → «Añadir vista dividida», o seleccione dos pestañas y elija «Abrir en vista dividida». En la lista de elementos, «Abrir PDF en vista dividida» lo abre junto a la biblioteca; los enlaces de notas y comentarios ofrecen «Abrir enlace en vista dividida». Arrastre la barra entre ambas para cambiar el tamaño. Las vistas divididas se conservan entre reinicios.
weavero-pref-tabs-split-dock-desc = Para mantener una pestaña a la vista, haga clic derecho en ella → «Bloquear pestaña»: pasa al lado izquierdo de la ventana y el lado derecho muestra la pestaña que seleccione (bloquee la biblioteca, y el elemento que abra desde ella se abrirá a su lado). La pestaña bloqueada tiene un marco dorado y un candado en su icono; mientras esté en ella, la pestaña mostrada a su lado aparece sombreada. Haga clic en la pestaña bloqueada para contraer su lado y dejar la ventana a la pestaña en la que está; vuelva a hacer clic para recuperarlo. Para desbloquearla, haga clic derecho en ella → «Desbloquear pestaña».
weavero-pref-tabs-split-footer =
    .label = Mostrar un rótulo en cada lado cuyo panel de elementos esté cerrado
weavero-pref-tabs-split-footer-desc = En una vista dividida, un lado con su panel de elementos cerrado muestra el icono y el título de su pestaña en la esquina inferior, con un menú para la vista dividida (separar las pestañas, invertirlas, cerrar ambas). Al abrir el panel de elementos de ese lado se oculta el rótulo: el encabezado del panel ya nombra el elemento.
weavero-pref-tabs-library-pin-name =
    .label = Mostrar el nombre de la pestaña de la biblioteca cuando esté fijada
weavero-pref-tabs-library-pin-name-desc = Una pestaña Mi biblioteca (o de una biblioteca de grupo) fijada muestra su icono y su nombre, con el ancho que pida el nombre, en lugar de solo el icono. Esta opción es el valor predeterminado de cada pestaña de biblioteca; «Mostrar el nombre de la pestaña», en el menú contextual de una pestaña fijada, muestra u oculta solo el nombre de esa pestaña, y la elección propia de la pestaña prevalece sobre esta opción.
weavero-pref-tabs-sessions =
    .label = Sesiones de pestañas
weavero-pref-tabs-sessions-desc = Guarde conjuntos de pestañas con nombre y cambie entre ellos desde la ventana emergente «Listar todas las pestañas». Sus pestañas actuales son siempre la sesión actual; «+ Nueva sesión» abre un espacio de trabajo vacío, y cambiar de sesión es un solo clic. Desactive esta opción para ocultar la interfaz de sesiones y congelar sus sesiones guardadas: quedan en reposo (nunca se sobrescriben) y reaparecen cuando la vuelve a activar.
weavero-pref-tabs-window-icons =
    .label = Iconos de la barra de tareas por ventana (Windows)
weavero-pref-tabs-window-icons-desc = Da a cada ventana adicional su propio icono (el icono de Zotero con un distintivo cuadrado de color para las ventanas principales y un distintivo redondo de color para las ventanas del lector; la ventana primaria conserva el icono normal) para que las vistas previas de la barra de tareas, la Vista de tareas y Alt+Tab distingan las ventanas de un vistazo, igual que Chrome marca las ventanas de sus perfiles. Solo Windows.
weavero-pref-tabs-window-icons-desc-native = Da a cada ventana adicional su propio icono (el icono de Zotero con un distintivo cuadrado de color; la ventana primaria conserva el icono normal) para que las vistas previas de la barra de tareas, la Vista de tareas y Alt+Tab distingan las ventanas de un vistazo, igual que Chrome marca las ventanas de sus perfiles. Solo Windows.
weavero-pref-tabs-windows-only = Solo Windows: no tiene efecto en este sistema.
weavero-pref-tabs-taskbar-buttons =
    .label = Un botón de la barra de tareas por ventana (Windows)
weavero-pref-tabs-taskbar-buttons-desc = Da a cada ventana adicional (principal y del lector) su propio botón en la barra de tareas con su icono con distintivo, mostrado en el monitor donde está la ventana, en lugar de agrupar todas las ventanas tras un único botón de Zotero. Nota: las ventanas separadas dejan de aparecer en la vista previa compartida. Desactivado de forma predeterminada.
weavero-pref-tabs-taskbar-buttons-desc-native = Da a cada ventana adicional su propio botón en la barra de tareas con su icono con distintivo, mostrado en el monitor donde está la ventana, en lugar de agrupar todas las ventanas tras un único botón de Zotero. Nota: las ventanas separadas dejan de aparecer en la vista previa compartida. Desactivado de forma predeterminada.
weavero-pref-tabs-progress-window =
    .label = Botones de minimizar y maximizar en la ventana «Buscar texto completo»
weavero-pref-tabs-progress-window-desc = La ventana de progreso de «Buscar texto completo» y «Recuperar metadatos» recibe botones de minimizar y maximizar en su barra de título, y su botón «Minimizar» la minimiza en lugar de cerrarla. El trabajo continúa en ambos casos. Activado de forma predeterminada.
weavero-pref-tabs-title-glyphs =
    .label = Glifo del tipo de ventana en los títulos de las ventanas
weavero-pref-tabs-title-glyphs-desc = Alternativa para plataformas distintas de Windows (desactivada de forma predeterminada): antepone al título de cada ventana una pequeña marca de tipo: ⚓ para la ventana primaria, cuadrados (■ □ ▣) para las demás ventanas principales, círculos (● ○ ◉) para las ventanas del lector. Se aplica a medida que se actualizan los títulos, p. ej., en el siguiente cambio de pestaña.
weavero-pref-tabs-title-glyphs-desc-native = Alternativa para plataformas distintas de Windows (desactivada de forma predeterminada): antepone al título de cada ventana una pequeña marca de tipo: ⚓ para la ventana primaria, cuadrados (■ □ ▣) para las demás ventanas. Se aplica a medida que se actualizan los títulos, p. ej., en el siguiente cambio de pestaña.
weavero-pref-tabs-window-name-title = Nombre de la ventana en su título
weavero-pref-tabs-window-name-desc = Muestra el nombre de una ventana renombrada en su título del sistema (vistas previas de la barra de tareas, Alt+Tab y Vista de tareas), como «Asignar nombre a la ventana» de Chrome. <strong>Antes del título</strong> conserva el contexto de la página («Principal — Azam et al.»); <strong>Reemplazar el título</strong> muestra solo el nombre. Las ventanas sin nombre personalizado conservan siempre el título normal.
weavero-pref-tabs-window-name-off =
    .label = Desactivado
weavero-pref-tabs-window-name-prefix =
    .label = Antes del título
weavero-pref-tabs-window-name-replace =
    .label = Reemplazar el título

weavero-pref-titlebar-title = Ocultar la barra de título
weavero-pref-titlebar-enable =
    .aria-label = Ocultar la barra de título (al estilo de Firefox)
weavero-pref-titlebar-desc = Sustituye la barra de título por una barra al estilo de un navegador: los menús se apartan (pulse Alt) y los botones de la ventana pasan a la barra de pestañas. Solo Windows / Linux.
weavero-pref-titlebar-apply = Aplicar a:
weavero-pref-titlebar-main =
    .label = Ventana principal
weavero-pref-titlebar-reader =
    .label = Ventana del lector
weavero-pref-titlebar-note =
    .label = Ventana de nota
weavero-pref-titlebar-plugins-manager =
    .label = Administrador de extensiones
weavero-pref-titlebar-note-deck =
    .label = Abrir las notas en una ventana que admite pestañas
weavero-pref-titlebar-note-deck-desc = Al abrir una nota en una ventana nueva se usa una ventana como la del lector, que acepta pestañas de PDF / nota arrastradas a ella. Requiere que la barra de título de la ventana del lector esté sustituida (opción anterior). Una nota independiente (sin elemento principal) muestra brevemente un documento provisional mientras se abre la ventana.

weavero-pref-mainwin-title = Varias ventanas principales
weavero-pref-mainwin-native-note = Esta versión de Zotero tiene sus propias ventanas y pestañas de biblioteca, así que las abre, las mueve y las restaura ella misma, y las opciones propias de las ventanas adicionales de Weavero están desactivadas aquí. Las ventanas guardadas, las sesiones de pestañas y la ventana de búsqueda avanzada funcionan como siempre.
weavero-pref-mainwin-enable =
    .label = Abrir nuevas ventanas principales
weavero-pref-mainwin-enable-desc = Una segunda ventana principal independiente con sus propias pestañas, columnas, filtros y anchos de panel: Ctrl+N / ⌘N, <em>Archivo → Nueva ventana principal</em>, las entradas <em>Nueva ventana</em> de los menús de pestaña y de elemento, y la búsqueda avanzada en una nueva ventana. Si está desactivado, ninguna de ellas abre una.
weavero-pref-mainwin-restore =
    .label = Restaurar las ventanas adicionales al reiniciar
weavero-pref-mainwin-restore-desc = Vuelve a abrir las ventanas adicionales que tenía abiertas cuando Zotero se reinicia.
weavero-pref-mainwin-adv-shortcut =
    .label = Ctrl+Mayús+F / ⇧⌘F abre la búsqueda avanzada en una nueva ventana
weavero-pref-mainwin-adv-shortcut-desc = El atajo de la búsqueda avanzada de Zotero abre la búsqueda en esta ventana. Con esta opción activada, abre en su lugar una nueva ventana sobre la colección actual, igual que Mayús+clic en el embudo o <em>Editar → Búsqueda avanzada en una nueva ventana</em>. Zotero 10.
weavero-pref-mainwin-adv-hide-panes =
    .label = Ocultar los paneles laterales en la ventana de búsqueda avanzada
weavero-pref-mainwin-adv-hide-panes-desc = La ventana se abre solo con la búsqueda y sus resultados (sin panel de colecciones ni panel de elementos), como la ventana de búsqueda avanzada independiente de Zotero 9. <em>Ver → Composición</em> devuelve un panel a esa ventana.

weavero-pref-reader-pane-title = Panel de elementos en las ventanas independientes del lector
weavero-pref-reader-pane-enable =
    .label = Mostrar un panel de elementos junto al lector en las ventanas independientes
weavero-pref-reader-pane-desc = Añade el panel de información del elemento / panel contextual (secciones, navegación lateral) a las ventanas independientes del lector, como el panel derecho de la ventana principal.

weavero-pref-extras-title = Extras
weavero-pref-extras-enable =
    .aria-label = Activar los extras visuales
weavero-pref-extras-desc = Pequeñas indicaciones informativas añadidas a la interfaz existente de Zotero: distintivos en la lista de elementos, columnas del árbol de elementos y glifos en la barra de pestañas.

weavero-pref-columns-title = Columnas del árbol de elementos
weavero-pref-columns-desc = Columnas adicionales, ocultas hasta que las active desde el selector de columnas (clic derecho en el encabezado del árbol de elementos).
weavero-pref-columns-annotations =
    .label = Columna «Anotaciones»
weavero-pref-columns-annotations-desc = Número de anotaciones en los adjuntos (sumadas para todos los adjuntos en los elementos normales).
weavero-pref-columns-tags-auto =
    .label = Columna «Etiquetas»: añadir el recuento de etiquetas automáticas
weavero-pref-columns-tags-auto-desc = Muestra las etiquetas manuales (en azul) y las automáticas. Desmarque esta opción para mostrar solo el recuento manual. Es el valor predeterminado para todas las ventanas: cada ventana puede elegir por sí misma desde el menú contextual del encabezado de columna (Etiquetas › Recuento de etiquetas automáticas).
weavero-pref-columns-related =
    .label = Columna «Relacionado»
weavero-pref-columns-related-desc = Número de elementos relacionados por fila.
weavero-pref-columns-backlinks =
    .label = Columna «Retroenlaces»
weavero-pref-columns-backlinks-desc = Número de comentarios de anotación y notas de otros lugares que enlazan al elemento, a sus adjuntos, notas o anotaciones.
weavero-pref-columns-item-links =
    .label = Columna «Enlaces a elementos»
weavero-pref-columns-item-links-desc = Número de elementos de Zotero a los que enlazan las notas y los comentarios de anotación de la fila mediante enlaces de Zotero o citas en notas (un enlace roto se lista, pero no se cuenta).
weavero-pref-columns-ext-links =
    .label = Columna «Enlaces externos»
weavero-pref-columns-ext-links-desc = Número de enlaces web y de aplicaciones escritos en las notas y los comentarios de anotación de la fila (cada enlace una vez; un enlace zotero:// pertenece a Enlaces a elementos). Haga clic en el número para ver la lista.

weavero-pref-itemslist-title = Lista de elementos y pestañas
weavero-pref-itemslist-title-lines = Títulos en la lista de elementos
weavero-pref-itemslist-title-lines-off =
    .label = Una línea
weavero-pref-itemslist-title-lines-fixed =
    .label = Altura fija
weavero-pref-itemslist-title-lines-adaptive =
    .label = Ajustar a cada título
weavero-pref-itemslist-title-lines-lead = { $mode ->
        [fixed] Altura de
       *[other] Hasta
    }
weavero-pref-itemslist-title-lines-unit = { $count ->
        [one] línea
        [many] líneas
       *[other] líneas
    }
weavero-pref-itemslist-title-lines-desc = Altura fija hace que todas las filas tengan la altura de ese número de líneas de texto. Ajustar a cada título hace que cada fila sea tan alta como necesite su título, hasta ese número de líneas. Las demás columnas de texto se ajustan dentro de esa altura, y todo se alinea en la parte superior de la fila. El texto más largo termina en puntos suspensivos, y las filas subordinadas se quedan en una sola línea.
weavero-pref-itemslist-added-by =
    .label = Mostrar «Añadido por» en las anotaciones
weavero-pref-itemslist-added-by-desc = En las bibliotecas de grupo, un distintivo con el creador de la anotación junto a su fila.
weavero-pref-itemslist-added-by-colors =
    .label = Usar un color distinto por usuario en «Añadido por»
weavero-pref-itemslist-added-by-colors-desc = Colorea el texto y el distintivo de «Añadido por» con un color por usuario. Desmarque esta opción para usar el color de texto predeterminado.
weavero-pref-itemslist-group-glyph =
    .label = Glifo de biblioteca de grupo + descripción emergente en las pestañas
weavero-pref-itemslist-group-glyph-desc = Un glifo de grupo sobre el icono de tipo de archivo de las pestañas cuyo elemento está en una biblioteca de grupo, más una descripción emergente más completa.
weavero-pref-itemslist-tab-ring =
    .label = Pestañas al estilo de Firefox: redondeadas, con un contorno en la pestaña seleccionada
weavero-pref-itemslist-tab-ring-desc = Pestañas en forma de píldora y un fino contorno de violeta a naranja alrededor de la pestaña seleccionada, como el nuevo diseño de pestañas de Firefox. Desmarque esta opción para usar las pestañas propias de Zotero: esquinas rectas y pestaña seleccionada en relieve.
weavero-pref-itemslist-layout-menu =
    .label = Ver → Composición sigue a la pestaña
weavero-pref-itemslist-layout-menu-desc = Las entradas de <em>Ver → Composición</em> de Zotero alternan los paneles de la biblioteca sea cual sea la pestaña que esté delante. En una pestaña del lector, el submenú muestra en su lugar los paneles propios del lector (<em>Barra lateral</em>, <em>Panel contextual</em> y el <em>Selector de colores y etiquetas</em> al pie del panel de anotaciones) con su estado real como marcas de verificación; una pestaña de nota muestra <em>Panel contextual</em> (y <em>Panel de esquema</em> con Better Notes); la pestaña de la biblioteca conserva las entradas de Zotero. Una ventana independiente del lector tiene su propio submenú Composición. Si está desactivado, el menú es el de Zotero tal cual.
weavero-pref-itemslist-layout-menu-desc-native = Las entradas de <em>Ver → Composición</em> de Zotero alternan los paneles de la biblioteca sea cual sea la pestaña que esté delante. En una pestaña del lector, el submenú muestra en su lugar los paneles propios del lector (<em>Barra lateral</em>, <em>Panel contextual</em> y el <em>Selector de colores y etiquetas</em> al pie del panel de anotaciones) con su estado real como marcas de verificación; una pestaña de nota muestra <em>Panel contextual</em> (y <em>Panel de esquema</em> con Better Notes); la pestaña de la biblioteca conserva las entradas de Zotero. Si está desactivado, el menú es el de Zotero tal cual.

weavero-pref-collections-title = Panel de colecciones
weavero-pref-collections-pane-toggle =
    .label = Botón para contraer / expandir el panel de colecciones
weavero-pref-collections-pane-toggle-desc = Un botón en el extremo izquierdo de la barra de herramientas, como los del panel de elementos y del lector. <em>Ver → Composición</em> sigue funcionando junto a él.
weavero-pref-collections-tag-selector-handle =
    .label = Asa en el selector de etiquetas: haga clic para contraerlo o expandirlo
weavero-pref-collections-tag-selector-handle-desc = Una pequeña píldora en el borde superior del selector de etiquetas. Un clic pliega el selector hasta ese borde y el siguiente lo recupera; arrastrar el borde sigue cambiando su tamaño. Una etiqueta seleccionada sigue filtrando la lista mientras el selector está plegado, y la píldora se vuelve azul para indicarlo. <em>Ver → Composición → Selector de etiquetas</em> muestra el mismo estado.
weavero-pref-collections-no-collapse =
    .label = Al redimensionar un panel lateral, detenerse en su ancho mínimo
weavero-pref-collections-no-collapse-desc = Al arrastrar el borde de un panel lateral, este se detiene en su ancho mínimo en lugar de cerrarse de golpe: el panel de colecciones, el panel de elementos, el panel contextual de las pestañas del lector y el panel de elementos de las ventanas del lector. Contráigalos con sus botones o con <em>Ver → Composición</em>. Si está desactivado, todos se cierran de golpe como en Zotero.
weavero-pref-collections-no-collapse-desc-native = Al arrastrar el borde de un panel lateral, este se detiene en su ancho mínimo en lugar de cerrarse de golpe: el panel de colecciones, el panel de elementos y el panel contextual de las pestañas del lector. Contráigalos con sus botones o con <em>Ver → Composición</em>. Si está desactivado, todos se cierran de golpe como en Zotero.
weavero-pref-collections-sticky-parents =
    .label = Mantener las colecciones superiores fijadas arriba al desplazarse
weavero-pref-collections-sticky-lead = Hasta
weavero-pref-collections-sticky-unit = { $count ->
        [one] nivel
        [many] niveles
       *[other] niveles
    }
weavero-pref-collections-sticky-parents-desc = Las colecciones superiores de las que están en la parte de arriba del panel quedan fijadas encima de ellas, como en el árbol de archivos de VS Code. Haga clic en una colección superior fijada para ir a ella; su flecha la contrae. Los dos árboles del Administrador de colecciones y bibliotecas se fijan del mismo modo.
weavero-pref-collections-search-folders =
    .label = Carpetas para las búsquedas guardadas
weavero-pref-collections-search-folders-names =
    .label = Leer también carpetas en los nombres de las búsquedas (Personas/Estudiantes/…)
weavero-pref-collections-search-folders-desc = Las búsquedas guardadas pueden ordenarse en carpetas bajo su biblioteca: arrastre una búsqueda a una carpeta, o haga clic derecho en ella: Mover a carpeta. Weavero guarda las carpetas en este ordenador; nada cambia en su biblioteca. Las carpetas abiertas se guardan con cada sesión. Con la segunda opción, una búsqueda llamada «A/B/C» aparece como «C» en la carpeta A › B, como con el complemento Saved Search Folders.
weavero-sf-move-to =
    .label = Mover a carpeta
weavero-sf-unfiled =
    .label = Fuera de carpeta
weavero-sf-new-folder =
    .label = Nueva carpeta…
weavero-sf-new-subfolder =
    .label = Nueva subcarpeta…
weavero-sf-new-search-folder =
    .label = Nueva carpeta de búsquedas…
weavero-sf-rename-folder =
    .label = Renombrar carpeta…
weavero-sf-move-folder =
    .label = Mover carpeta a
weavero-sf-top-level =
    .label = Nivel superior
weavero-sf-delete-folder =
    .label = Eliminar carpeta
weavero-sf-folder-name-title = Carpeta de búsquedas guardadas
weavero-sf-folder-name-prompt = Nombre de la carpeta:
weavero-sf-delete-confirm = ¿Eliminar la carpeta «{ $name }» y { $count ->
        [one] su subcarpeta
       *[other] sus { $count } subcarpetas
    }? Las búsquedas guardadas que contienen permanecen en su biblioteca, fuera de toda carpeta.
weavero-sf-name-folder = Según los nombres de las búsquedas: { $path }
weavero-pref-collections-bookmarks-pane =
    .label = Panel de marcadores encima de las colecciones
weavero-pref-collections-bookmarks-pane-desc = Los marcadores de su biblioteca en un panel encima del árbol de colecciones, con un separador entre ambos. Haga clic en su encabezado para plegarlo; su botón ⇕ muestra solo los marcadores, en lugar del árbol de colecciones. Las carpetas se abren en el sitio, y los elementos soltados sobre el marcador de una colección van a esa colección. Cada ventana conserva su propia disposición, guardada con su sesión. El botón Marcadores encima de las colecciones se mantiene.
weavero-bmpane-fold-tip = { $folded ->
        [yes] Desplegar los marcadores
       *[other] Plegar los marcadores
    }
weavero-bmpane-only-tip = { $on ->
        [yes] Mostrar de nuevo el árbol de colecciones
       *[other] Solo marcadores: ocultar el árbol de colecciones
    }
weavero-bmpane-now-tip = Mostrando: { $name }. Haga clic para mostrar el árbol de colecciones con ello.
weavero-bmpane-now-add = Añadir a marcadores
weavero-bmpane-folder-current = Esta carpeta contiene lo que se muestra
# The funnel above the collections pane (coll-funnel.ts): Settings.
weavero-pref-collections-funnel =
    .label = Embudo sobre el panel de colecciones
weavero-pref-collections-funnel-desc = Un botón de embudo en la barra de herramientas del panel de colecciones filtra lo que el panel muestra: colecciones, búsquedas guardadas, canales, las filas especiales (Elementos duplicados, Elementos sin archivar, Papelera…), cada biblioteca y las secciones propias de Weavero. Haga clic en una ficha para mostrar solo esa, Alt+clic para ocultarla. Cada ventana conserva su propio filtro, guardado con su sesión; «Usar como predeterminado» en el embudo lo convierte en el filtro con el que empieza cada ventana.
weavero-pref-collfunnel-defaults-title = Mostrado por defecto
weavero-pref-collfunnel-show-collections =
    .label = Colecciones
weavero-pref-collfunnel-show-searches =
    .label = Búsquedas guardadas
weavero-pref-collfunnel-show-feeds =
    .label = Canales
weavero-pref-collfunnel-show-special =
    .label = Filas especiales
weavero-pref-collfunnel-show-bookmarks =
    .label = Panel de marcadores
weavero-pref-collfunnel-show-folders =
    .label = Carpetas de búsquedas guardadas
# The libraries the default leaves out. $mode: hidden, only or none; $names: the libraries.
weavero-pref-collfunnel-libs = { $mode ->
        [hidden] Bibliotecas ocultas por defecto: { $names }
        [only] Bibliotecas mostradas por defecto: solo { $names }
       *[none] Todas las bibliotecas se muestran por defecto.
    }
weavero-pref-collfunnel-libs-reset = Restablecer
# The funnel's button. $active: yes when it filters; $parts: what it filters.
weavero-cf-tb-tip = { $active ->
        [yes] Filtro del panel de colecciones: { $parts }
       *[no] Filtrar el panel de colecciones
    }
# The funnel's rows of chips.
weavero-cf-row-kinds = Tipos
weavero-cf-row-libs = Bibliotecas
weavero-cf-row-secs = Secciones de Weavero
weavero-cf-kind-collections = Colecciones
weavero-cf-kind-searches = Búsquedas guardadas
weavero-cf-kind-feeds = Canales
weavero-cf-kind-special = Filas especiales
weavero-cf-kind-special-tip = Elementos duplicados, Elementos sin archivar, Leído recientemente, Elementos retirados, Mis publicaciones y Papelera
weavero-cf-sec-bookmarks = Panel de marcadores
weavero-cf-sec-folders = Carpetas de búsquedas guardadas
weavero-cf-hint = Clic: mostrar solo esto. Alt+clic: ocultar.
# What a row filters, in the button's tooltip. $mode: only or hide; $names: the chips.
weavero-cf-part = { $mode ->
        [only] solo { $names }
       *[hide] sin { $names }
    }
# The footer's line. $scope: window (this window's own filter) or default.
weavero-cf-scope = { $scope ->
        [window] Filtro propio de esta ventana
       *[default] Sigue el predeterminado
    }
    .title = { $scope ->
        [window] Esta ventana se aparta del filtro predeterminado; «Volver al predeterminado» lo sigue de nuevo.
       *[default] Esta ventana muestra el filtro predeterminado, que «Usar como predeterminado» cambia.
    }
weavero-cf-use-default = Usar como predeterminado
    .title = Hacer de este filtro, tal como está, el filtro con el que empieza cada ventana
weavero-cf-reset-default = Volver al predeterminado
    .title = Volver al filtro predeterminado en esta ventana
# Where the funnel leaves nothing in the tree.
weavero-cf-empty = Nada coincide con el embudo.
weavero-cf-empty-clear = Limpiar
weavero-pref-collections-sticky-headers =
    .label = Mantener los encabezados de sección fijados arriba en el panel de elementos al desplazarse
weavero-pref-collections-sticky-headers-desc = El encabezado de cada sección queda fijado en la parte superior del panel de elementos mientras su sección pasa por debajo, y el siguiente encabezado lo empuja fuera; dentro de Enlaces a elementos, Retroenlaces y las secciones ampliadas Etiquetas y Relacionado, el encabezado de la parte cuyas filas están pasando se queda debajo de él. Un clic en un encabezado fijado sigue contrayendo su sección. En el panel de elementos de la biblioteca y en los paneles contextuales de las pestañas del lector y de nota.
weavero-pref-collections-path-tooltip =
    .label = Mostrar la ruta completa de una colección al pasar el puntero por encima
weavero-pref-collections-indent-guides =
    .label = Guías de sangría en el panel de colecciones
weavero-pref-collections-indent-guides-desc = Una tenue línea vertical por cada nivel, para que las colecciones del mismo nivel queden alineadas visualmente.

weavero-pref-plugins-title = Administrador de extensiones
weavero-pref-plugins-extras =
    .label = Extras del administrador de extensiones (cuadro de búsqueda, detalles en las tarjetas, ventana normal)
weavero-pref-plugins-extras-desc = Herramientas → Extensiones obtiene un cuadro de búsqueda (Ctrl+F lo enfoca, × lo borra), tarjetas que muestran autor [propietario en GitHub] · versión · última actualización, una ventana normal con minimizar/maximizar (con <em>Ocultar la barra de título → Administrador de extensiones</em> activado, la disposición de barra de título de la ventana principal; desactivado, la barra de título y la barra de menús propias del sistema), y Actualizaciones recientes siempre visible, con un menú en su encabezado para elegir hasta cuándo se remonta (del último día a todo; la de Zotero se detiene en 2 días), que se recuerda. El administrador se vuelve a abrir en la lista de extensiones. En Zotero 11, cuyo administrador oculta su barra lateral, la barra lateral vuelve con Extensiones y Actualizaciones recientes (y Actualizaciones disponibles mientras haya actualizaciones pendientes).

weavero-pref-defatt-title = Adjunto predeterminado
weavero-pref-defatt-enable =
    .label = Abrir el adjunto o la nota elegidos en lugar de la elección automática de Zotero
weavero-pref-defatt-desc = Haga clic derecho en cualquier subordinado de un elemento (adjunto, PDF o no, URL enlazada o nota) y elija <b>▶️ Establecer como adjunto predeterminado</b> para abrir ese en lugar de la elección habitual de Zotero. La elección se guarda como la etiqueta <b>▶️ wv-defatt</b> en ese subordinado, de modo que se sincroniza con sus otros dispositivos y se conserva sin Weavero. Busque <b>wv-defatt</b> (o el glifo ▶️) para listar todos los elementos marcados; la etiqueta no contiene palabras corrientes a propósito, para que nunca aparezca en búsquedas no relacionadas. Desactivar esta opción detiene la sustitución, pero conserva sus elecciones.
weavero-pref-defatt-sort-default =
    .label = Mostrar primero el adjunto predeterminado en la lista de adjuntos
weavero-pref-defatt-sort-auto =
    .label = Mostrar primero la elección automática de Zotero cuando no hay ninguno predeterminado
weavero-pref-defatt-mark-auto =
    .label = Marcar la elección automática con un ▷ atenuado en la lista de elementos
weavero-pref-defatt-sort-desc = Con las dos opciones anteriores, lo que se abre con doble clic ocupa la primera fila de los adjuntos de un elemento. El <b>▷</b> atenuado siempre señala la elección automática propia de Zotero (así puede ver qué se abriría si se quitara el predeterminado elegido), mientras que un predeterminado elegido conserva su marcador <b>▶️</b> sólido.
weavero-pref-defatt-import = ¿Viene de <b>Default Attachment</b> de <b>PikaPei</b>? Sus elecciones se importan automáticamente la primera vez que se inicia Weavero, y los datos propios de esa extensión no se tocan: consulte el README para saber cómo eliminarlos a mano cuando ya no los necesite.

weavero-pref-ext-viewer-title = Visor externo
weavero-pref-ext-viewer-enable =
    .label = «Abrir en un visor externo» en los menús de elemento / pestaña
weavero-pref-ext-viewer-desc = Abre el mejor adjunto de un elemento con la aplicación predeterminada del sistema (PDF, EPUB, instantánea, imagen, …). Activado de forma predeterminada.

weavero-pref-undo-title = Deshacer
weavero-pref-undo-buttons =
    .label = Flechas Deshacer / Rehacer en la barra de herramientas del lector
weavero-pref-undo-buttons-desc = Dos flechas después de las herramientas de anotación: haga clic para deshacer o rehacer el último paso de la pestaña del lector (esquema, marcadores, anotaciones), o clic derecho para ver el historial. Ctrl+Z, Ctrl+Y y Editar → Deshacer funcionan igualmente. Activado de forma predeterminada.

weavero-pref-link-preview-title = Vistas previas de enlaces
weavero-pref-link-preview-entry =
    .label = Marcar la referencia completa en las vistas previas de enlaces
weavero-pref-link-preview-entry-desc = Cuando el puntero se detiene sobre una cita, la vista previa de la lista de referencias marca cada línea de la entrada citada con un ligero tono rojo, en lugar del recuadro oscuro de Zotero en su primera línea. Desactivado: la vista previa de Zotero tal cual. Activado de forma predeterminada.

weavero-pref-outline-title = Esquema del lector
weavero-pref-outline-highlight =
    .label = Resaltar el texto del encabezado al hacer clic en una entrada del esquema
weavero-pref-outline-highlight-desc = Hace destellar el texto real del encabezado al hacer clic, en PDF, EPUB e instantáneas, y en una nota desde su esquema; para los esquemas incrustados en el PDF, Weavero busca el encabezado en la página. Coincidencia aproximada: en páginas escaneadas o con fuentes poco habituales puede que solo salte sin resaltar.
weavero-pref-outline-page-numbers =
    .label = Mostrar los números de página junto a las entradas del esquema
weavero-pref-outline-page-numbers-desc = El rótulo «p. N» a la derecha de cada entrada. Haga clic derecho en la pestaña Esquema de un lector para mostrarlos u ocultarlos solo para ese documento.
weavero-pref-outline-size-title = Tamaño del texto del esquema
weavero-pref-outline-size-desc = <strong>Esquema de Zotero</strong> y <strong>Panel de elementos de Zotero</strong> siguen <em>Ver → Tamaño de fuente</em> (los tamaños mostrados son los actuales); <strong>Fijo</strong> se mantiene en el tamaño elegido sea cual sea el tamaño de fuente. Haga clic derecho en la pestaña Esquema de un lector para elegir un tamaño solo para ese documento.
weavero-pref-outline-size-zotero =
    .label = Esquema de Zotero (predeterminado)
weavero-pref-outline-size-item-pane =
    .label = Panel de elementos de Zotero
weavero-pref-outline-size-zotero-px =
    .label = Esquema de Zotero, { $px } px (predeterminado)
weavero-pref-outline-size-item-pane-px =
    .label = Panel de elementos de Zotero, { $px } px
weavero-pref-outline-size-fixed =
    .label = Fijo:
weavero-pref-outline-size-px =
    .label = { $px } px

weavero-pref-outline-keys-title = Atajos de teclado para añadir entradas
weavero-pref-outline-keys-desc = No hay ninguno definido de serie. Haga clic en un cuadro y pulse las teclas que quiera (también sirve una sola letra); se rechazan las combinaciones que Zotero o el lector ya usan. Funcionan en las pestañas del lector, nunca mientras escribe en un campo de texto, y se muestran junto a las entradas de menú correspondientes.
weavero-pref-outline-key-selection = Añadir el texto seleccionado
weavero-pref-outline-key-remove = Quitar
weavero-pref-outline-key-pin = Fijar un punto
weavero-pref-outline-key-page-top = Parte superior de la página (PDF)
weavero-pref-outline-key-page-bottom = Parte inferior de la página (PDF)

weavero-pref-notes-title = Notas
weavero-pref-notes-outline =
    .label = Esquema junto a las notas
weavero-pref-notes-outline-desc = Un panel que lista los encabezados de la nota a la izquierda de esta, con la sección que está leyendo marcada. Haga clic en un encabezado para ir a él; clic derecho para copiar un enlace a él. Abierto de forma predeterminada en las pestañas y ventanas de nota, plegado en el panel de elementos y junto a un lector: el botón de barra lateral del extremo izquierdo de la barra de herramientas de la nota lo muestra u oculta. Con Better Notes instalado, este esquema sustituye a su panel izquierdo en las pestañas de nota; desmarque esta opción para recuperar ese panel, con sus mapas mentales y de burbujas.
weavero-pref-notes-folding =
    .label = Flechas de plegado en los encabezados y listas de las notas
weavero-pref-notes-folding-desc = Una flecha en el margen antes de cada encabezado oculta todo lo que hay debajo, hasta el siguiente encabezado del mismo nivel o superior. Una flecha antes de una entrada de lista, con viñetas o numerada, oculta todo lo que hay bajo su primera línea: sus subentradas y los párrafos siguientes. <em>Plegar todo</em> y <em>Desplegar todo</em>, al final del menú contextual de la nota, actúan sobre toda la nota a la vez. Solo cambia la vista: la nota en sí no se modifica, y quien no tenga Weavero ve la nota completa. Los plegados se recuerdan por nota en este equipo. Ambas opciones requieren <em>Enlaces y relaciones → Notas: Editor de notas</em>.

weavero-pref-annpane-title = Panel de anotaciones del lector
weavero-pref-annpane-reader-funnel =
    .label = Embudo encima del lector
weavero-pref-annpane-reader-funnel-desc = Filtra las anotaciones del documento a la vez en la página y en el panel de anotaciones (por color, tipo, etiqueta, comentario, persona o fecha). Desactivado, el botón desaparece y su filtro queda en suspenso: vuelven a verse todas las anotaciones, salvo las que filtre el propio selector de colores y etiquetas de Zotero. Al reactivarlo, un documento abierto recupera su filtro.
weavero-pref-annpane-funnel =
    .label = Embudo junto al cuadro de búsqueda del panel
weavero-pref-annpane-funnel-desc = A diferencia del embudo situado encima del lector, que también oculta anotaciones en la página, este solo acota el panel de anotaciones (por color, tipo, etiqueta, comentario, persona o fecha) y la página conserva todas las anotaciones. Mismos chips y gestos. Cada documento conserva su propio filtro; los tipos de abajo son el punto de partida para todos ellos. Con el embudo desactivado, el panel simplemente sigue los tipos de abajo.
weavero-pref-annpane-selector-handle =
    .label = Asa en el selector de colores y etiquetas de Zotero al pie del panel
weavero-pref-annpane-selector-handle-desc = Una pequeña píldora en el borde superior del selector: un clic pliega el selector hasta ese borde y el siguiente lo recupera; un único estado para todos los documentos, que se conserva entre reinicios (visible al principio). <em>Ver → Composición → Selector de colores y etiquetas</em> oculta el selector por completo, píldora incluida, como hace la entrada Selector de etiquetas de la biblioteca. Abierto, el selector filtra a la vez el panel y el documento, y una anotación soltada sobre un color o una etiqueta lo adopta (Mayús para quitarlo). Una selección sigue vigente mientras está plegado; la píldora se vuelve azul para indicarlo. Si está desactivado, el selector se muestra siempre, como en Zotero.
weavero-pref-annpane-types-title = Tipos de anotación mostrados en el panel
weavero-pref-annpane-types-desc = Desmarque un tipo para excluirlo del panel en todos los documentos; sigue visible en la página. El embudo puede cambiar esto para un documento, y su «Usar como predeterminado» lo guarda aquí.
weavero-pref-annpane-type-highlight =
    .label = Resaltados
weavero-pref-annpane-type-underline =
    .label = Subrayados
weavero-pref-annpane-type-note =
    .label = Notas
weavero-pref-annpane-type-image =
    .label = Imágenes
weavero-pref-annpane-type-ink =
    .label = Tinta
weavero-pref-annpane-type-text =
    .label = Texto

weavero-pref-debug-title = Depuración
weavero-pref-debug-enable =
    .label = Activar el registro de depuración
weavero-pref-debug-desc = Emite actividad detallada mediante Zotero.debug (Ayuda → Registro de salida de depuración → Ver resultados). Déjelo desactivado para el uso normal.

weavero-pref-about-title = Acerca de
weavero-pref-about-homepage = Página principal — GitHub
weavero-pref-about-bug-report = Informar de un error / solicitar una función

# ---- Menus (localisation slice 2, 2026-11-11) ---------------------------

weavero-menu-copy-as =
    .label = Copiar como
weavero-menu-copy-as-citation =
    .label = Cita
weavero-menu-copy-as-bibliography =
    .label = Bibliografía
weavero-menu-copy-as-citation-key =
    .label = Clave de cita
weavero-menu-copy-as-select-link =
    .label = { $collection ->
        [yes] Enlace de selección (incluir la colección)
       *[no] Enlace de selección
    }
weavero-menu-copy-as-select-links-separate =
    .label = { $collection ->
        [yes] Enlaces de selección (un enlace por elemento) (incluir la colección)
       *[no] Enlaces de selección (un enlace por elemento)
    }
weavero-menu-copy-as-open-links-separate =
    .label = Enlaces de apertura (un enlace por elemento)
weavero-menu-copy-as-open-link =
    .label = { $external ->
        [yes] Enlace de apertura (aplicación externa)
       *[no] Enlace de apertura
    }
weavero-menu-copy-as-online-link =
    .label = Enlace a la biblioteca en línea
weavero-menu-copy-as-bbt-bibtex =
    .label = [BBT] BibTeX
weavero-menu-copy-as-bbt-biblatex =
    .label = [BBT] BibLaTeX

weavero-menu-items-add-related =
    .label = { $count ->
        [one] Añadir relacionado…
        [many] Añadir relacionado…  ({ $count } elementos)
       *[other] Añadir relacionado…  ({ $count } elementos)
    }
weavero-menu-open-external-viewer =
    .label = Abrir en un visor externo
weavero-menu-items-open-in =
    .label = { $type ->
        [pdf] { $count ->
            [one] Abrir PDF en
           *[other] Abrir PDFs en
        }
        [epub] { $count ->
            [one] Abrir EPUB en
           *[other] Abrir EPUBs en
        }
        [snapshot] { $count ->
            [one] Abrir instantánea en
           *[other] Abrir instantáneas en
        }
        [image] { $count ->
            [one] Abrir imagen en
           *[other] Abrir imágenes en
        }
        [video] { $count ->
            [one] Abrir vídeo en
           *[other] Abrir vídeos en
        }
        [audio] Abrir audio en
        [text] Abrir texto en
        [file] { $count ->
            [one] Abrir archivo en
           *[other] Abrir archivos en
        }
        [note] { $count ->
            [one] Abrir nota en
           *[other] Abrir notas en
        }
       *[mixed] Abrir en
    }
weavero-menu-items-open-several =
    .label = Abrir { $count } { $kind ->
        [pdf] { $count ->
            [one] PDF
           *[other] PDFs
        }
        [epub] { $count ->
            [one] EPUB
           *[other] EPUBs
        }
        [snapshot] { $count ->
            [one] captura
           *[other] capturas
        }
        [note] { $count ->
            [one] nota
           *[other] notas
        }
        [attachment] { $count ->
            [one] adjunto
           *[other] adjuntos
        }
       *[item] { $count ->
            [one] elemento
           *[other] elementos
        }
    } { $where ->
        [tabs] { $count ->
            [one] en una nueva pestaña
           *[other] en nuevas pestañas
        }
        [window] { $count ->
            [one] en una nueva ventana
           *[other] en una sola ventana nueva
        }
       *[windows] { $count ->
            [one] en una nueva ventana
           *[other] en ventanas separadas
        }
    }
weavero-menu-group-unnamed =
    .label = Grupo
weavero-menu-new-group =
    .label = Nuevo grupo

weavero-menu-collection-open-new-window =
    .label = Abrir en una nueva ventana
    .acceltext = Clic central
weavero-menu-collection-copy-link =
    .label = Copiar enlace de la colección
weavero-menu-collection-copy-search-link =
    .label = Copiar enlace de la búsqueda guardada

weavero-menu-colpick-show-column =
    .label = Mostrar columna
weavero-menu-colpick-auto-tag-count =
    .label = Recuento de etiquetas automáticas

weavero-menu-file-new-tab =
    .label = Nueva pestaña…
weavero-menu-file-new-reader-window =
    .label = Nueva ventana del lector…
weavero-menu-file-new-main-window =
    .label = Nueva ventana principal
weavero-menu-file-people =
    .label = Investigadores
weavero-menu-edit-advanced-search-new-window =
    .label = Búsqueda avanzada en una nueva ventana
    .acceltext = Mayús+clic

weavero-menu-advsearch-open =
    .label = Abrir la búsqueda avanzada
weavero-menu-advsearch-open-new-window =
    .label = Abrir en una nueva ventana
    .acceltext = Mayús+clic / clic central
weavero-menu-advsearch-open-new-tab =
    .label = Abrir en una nueva pestaña
    .acceltext = { $platform ->
        [mac] ⌘clic
       *[other] Ctrl+clic
    }

weavero-menu-hid-hide-several =
    .label = { $what ->
        [collections] Ocultar { $count } colecciones
        [searches] Ocultar { $count } búsquedas guardadas
        [collections-searches] Ocultar { $count } colecciones y búsquedas guardadas
        [feeds] Ocultar { $count } canales
        [groups] Ocultar { $count } bibliotecas de grupo
       *[libraries] Ocultar { $count } bibliotecas
    }
weavero-menu-hid-manage =
    .label = Gestionar ocultos…
weavero-menu-hid-show =
    .label = { $what ->
        [collections-libraries] Mostrar colecciones y bibliotecas ocultas
        [libraries] Mostrar bibliotecas ocultas
        [groups] Mostrar bibliotecas de grupo ocultas
        [feeds] Mostrar canales ocultos
       *[collections] Mostrar colecciones ocultas
    }
weavero-menu-hid-show-all =
    .label = Mostrar todo ({ $count })
weavero-menu-hid-saved-search =
    .label = { $name } (búsqueda guardada)
weavero-menu-hid-all-windows =
    .label = { $name } (todas las ventanas)

weavero-menu-hidmgr-new-subcollection =
    .label = Nueva subcolección…
weavero-menu-hidmgr-rename =
    .label = Renombrar
weavero-menu-hidmgr-hide =
    .label = { $count ->
        [0] Ocultar →
        [one] Ocultar →
        [many] Ocultar { $count } →
       *[other] Ocultar { $count } →
    }
weavero-menu-hidmgr-show =
    .label = { $count ->
        [0] ← Mostrar
        [one] ← Mostrar
        [many] ← Mostrar { $count }
       *[other] ← Mostrar { $count }
    }
weavero-menu-hidmgr-delete-collections =
    .label = { $count ->
        [one] Eliminar colección…
       *[other] Eliminar colecciones…
    }
weavero-menu-hidmgr-delete-searches =
    .label = { $count ->
        [one] Eliminar búsqueda…
       *[other] Eliminar búsquedas…
    }
weavero-menu-hidmgr-delete-collections-items =
    .label = { $count ->
        [one] Eliminar colección y elementos…
       *[other] Eliminar colecciones y elementos…
    }
weavero-menu-hidmgr-export =
    .label = Exportar…

weavero-menu-reader-ann-add-to-bookmarks =
    .label = { $count ->
        [one] Añadir a marcadores
        [many] Añadir a marcadores  ({ $count } anotaciones)
       *[other] Añadir a marcadores  ({ $count } anotaciones)
    }
weavero-menu-reader-ann-copy-text =
    .label = { $type ->
        [highlight] { $count ->
            [one] Copiar texto resaltado
           *[other] Copiar texto resaltado  ({ $count } anotaciones)
        }
        [underline] { $count ->
            [one] Copiar texto subrayado
           *[other] Copiar texto subrayado  ({ $count } anotaciones)
        }
       *[mixed] { $count ->
            [one] Copiar texto de la anotación
           *[other] Copiar texto de las anotaciones  ({ $count } anotaciones)
        }
    }
weavero-menu-reader-ann-copy-select-link =
    .label = { $count ->
        [one] Copiar enlace de selección
        [many] Copiar enlaces de selección  ({ $count } anotaciones)
       *[other] Copiar enlaces de selección  ({ $count } anotaciones)
    }
weavero-menu-reader-ann-copy-open-link =
    .label = { $count ->
        [one] Copiar enlace de apertura
        [many] Copiar enlaces de apertura  ({ $count } anotaciones)
       *[other] Copiar enlaces de apertura  ({ $count } anotaciones)
    }
weavero-menu-reader-ann-add-related =
    .label = { $count ->
        [one] Añadir relacionado…
        [many] Añadir relacionado…  ({ $count } anotaciones)
       *[other] Añadir relacionado…  ({ $count } anotaciones)
    }

weavero-menu-reader-copy-link-selection =
    .label = Copiar enlace al texto seleccionado
weavero-menu-reader-copy-link-page =
    .label = Copiar enlace a esta página
weavero-menu-reader-copy-link-position =
    .label = Copiar enlace a esta posición
weavero-menu-reader-copy-link-location =
    .label = Copiar enlace a esta ubicación

weavero-menu-tab-view-online =
    .label = Ver en línea
weavero-menu-tab-show-file =
    .label = { $platform ->
        [mac] Mostrar en el buscador
       *[other] Mostrar archivo
    }
weavero-menu-tab-pin =
    .label = { $action ->
        [unpin] { $count ->
            [one] Desfijar pestaña
           *[other] Desfijar { $count } pestañas
        }
       *[pin] { $count ->
            [one] Fijar pestaña
           *[other] Fijar { $count } pestañas
        }
    }
weavero-menu-tab-pin-name =
    .label = Mostrar el nombre de la pestaña
weavero-menu-tab-move-tabs =
    .label = Mover pestañas
weavero-menu-tab-close =
    .label = { $count ->
        [one] Cerrar pestaña
        [many] Cerrar { $count } pestañas
       *[other] Cerrar { $count } pestañas
    }
weavero-menu-tab-duplicate =
    .label = { $count ->
        [one] Duplicar pestaña
        [many] Duplicar { $count } pestañas
       *[other] Duplicar { $count } pestañas
    }
weavero-menu-tab-group-tabs =
    .label = { $count ->
        [one] Agrupar pestaña
       *[other] Agrupar pestañas
    }
weavero-menu-tab-reopen-closed-group =
    .label = Reabrir grupo cerrado
weavero-menu-tab-reopen-closed-window =
    .label = { $count ->
        [0] Reabrir ventana cerrada
        [one] Reabrir ventana cerrada
        [many] Reabrir ventana cerrada ({ $count } pestañas)
       *[other] Reabrir ventana cerrada ({ $count } pestañas)
    }

weavero-menu-window-rename =
    .label = Renombrar ventana…
weavero-menu-window-convert =
    .label = { $to ->
        [main] Convertir en ventana principal
       *[reader] Convertir en ventana del lector
    }
weavero-menu-window-save-close =
    .label = Guardar y cerrar ventana
weavero-menu-window-move-to =
    .label = Mover ventana a
weavero-menu-window-reopen =
    .label = Reabrir ventana
weavero-menu-window-delete-saved =
    .label = Eliminar ventana guardada
weavero-menu-session-unnamed =
    .label = Sesión
weavero-menu-window-delete-from-session =
    .label = Eliminar ventana de la sesión

weavero-menu-session-switch =
    .label = Cambiar a esta sesión
weavero-menu-session-rename =
    .label = Renombrar…
weavero-menu-session-delete =
    .label = Eliminar
weavero-menu-session-rename-current =
    .label = Renombrar sesión…
weavero-menu-session-sort =
    .label = { $sort ->
        [name] Nombre
        [lastUsed] Último uso
       *[created] Creación
    }
weavero-menu-default-hint = (predeterminado)

weavero-menu-move-target-here =
    .label = { $name }  (aquí)
weavero-menu-group-target-window =
    .label = { $where ->
        [group-home] { $name }  (el grupo está aquí)
       *[this-window] { $name }  (esta ventana)
    }
weavero-menu-move-new-window =
    .label = Nueva ventana
weavero-menu-group-rename =
    .label = Renombrar grupo…
weavero-menu-group-move-to =
    .label = { $saved ->
        [yes] Abrir grupo en
       *[no] Mover grupo a
    }
weavero-menu-group-save-close =
    .label = Guardar y cerrar grupo
weavero-menu-group-delete =
    .label = Eliminar grupo
weavero-menu-tab-remove-from-group =
    .label = { $count ->
        [0] Quitar del grupo de pestañas
        [one] Quitar del grupo de pestañas
        [many] Quitar { $count } pestañas del grupo
       *[other] Quitar { $count } pestañas del grupo
    }
weavero-menu-groupeditor-move-to =
    .label = Mover grupo a
weavero-menu-groupeditor-copy-links =
    .label = { $count ->
        [one] Copiar { $count } enlace del grupo
        [many] Copiar { $count } enlaces del grupo
       *[other] Copiar { $count } enlaces del grupo
    }
weavero-menu-groupeditor-save-close =
    .label = Guardar y cerrar grupo
weavero-menu-groupeditor-ungroup =
    .label = Desagrupar pestañas
weavero-menu-groupeditor-delete =
    .label = Eliminar grupo

weavero-reader-toolbar-more =
    .label = Más herramientas

weavero-menu-split-add =
    .label = Añadir vista dividida
weavero-menu-split-open =
    .label = Abrir en vista dividida
weavero-menu-split-separate =
    .label = Separar vista dividida
weavero-menu-split-reverse =
    .label = Invertir pestañas
weavero-menu-split-separate-tabs =
    .label = Separar pestañas
weavero-menu-split-close-both =
    .label = Cerrar ambas pestañas
weavero-menu-items-open-split =
    .label = { $type ->
        [pdf] Abrir PDF en vista dividida
        [epub] Abrir EPUB en vista dividida
        [snapshot] Abrir instantánea en vista dividida
       *[note] Abrir nota en vista dividida
    }

weavero-menu-split-follow =
    .label = Seguir el elemento seleccionado
weavero-menu-split-keep =
    .label = Mantener el documento en una nueva pestaña
weavero-split-follow-open = Abrir
    .title = Abrir en el lector de Zotero, aquí, para leer y anotar (o haga doble clic en la vista previa)
weavero-split-follow-failed = No hay vista previa para este documento. Haga clic en su pestaña para abrirlo.

weavero-menu-lock-tab =
    .label = { $action ->
        [unlock] Desbloquear pestaña
       *[lock] Bloquear pestaña
    }
weavero-menu-lock-collapse =
    .label = { $collapsed ->
        [yes] Expandir pestaña bloqueada
       *[no] Contraer pestaña bloqueada
    }
weavero-dock-tab-tip = { $collapsed ->
        [yes] Pestaña bloqueada, contraída. Haga clic para expandirla.
       *[no] Pestaña bloqueada. Haga clic para contraerla.
    }

weavero-menu-note-fold-section =
    .label = { $folded ->
        [yes] Desplegar sección
       *[no] Plegar sección
    }
weavero-menu-note-fold-all =
    .label = Plegar todo
weavero-menu-note-unfold-all =
    .label = Desplegar todo
weavero-menu-note-heading-link =
    .label = { $kind ->
        [open] Copiar enlace de apertura al encabezado
       *[select] Copiar enlace de selección al encabezado
    }
weavero-menu-note-heading-link-readonly =
    .label = { $kind ->
        [open] Copiar enlace de apertura al encabezado
       *[select] Copiar enlace de selección al encabezado
    }
    .tooltiptext = Esta nota es de solo lectura y el encabezado aún no tiene un ancla de enlace.
weavero-menu-outline-toggle =
    .label = { $shut ->
        [yes] Expandir
       *[no] Contraer
    }
weavero-menu-outline-expand-all =
    .label = Expandir todo
weavero-menu-outline-collapse-all =
    .label = Contraer todo

weavero-open-card-foot = Clic para abrir · { $platform ->
        [mac] ⌘clic
       *[other] Ctrl+clic
    }: al lado · Mayús+clic: nueva ventana · Clic central: pestaña en segundo plano (una nota: en primer plano) · Clic derecho para más opciones
weavero-open-card-foot-library = Clic: abrir en la biblioteca · { $platform ->
        [mac] ⌘clic
       *[other] Ctrl+clic
    }: al lado · Mayús+clic: nueva ventana · Clic central: pestaña en segundo plano (una nota: en primer plano)

weavero-menu-notelink-open-split =
    .label = Abrir enlace en vista dividida
weavero-menu-notelink-copy =
    .label = Copiar enlace
weavero-menu-notelink-edit =
    .label = Editar enlace…
weavero-menu-notelink-unlink =
    .label = Desvincular

weavero-menu-ref-copy-link =
    .label = Copiar enlace
weavero-menu-ref-show-in-source =
    .label = Mostrar en el origen
weavero-menu-ref-add-related =
    .label = Añadir como relacionado

weavero-menu-open-type-in =
    .label = { $type ->
        [pdf] { $where ->
            [window] Abrir PDF en una nueva ventana
           *[tab] Abrir PDF en una nueva pestaña
        }
        [epub] { $where ->
            [window] Abrir EPUB en una nueva ventana
           *[tab] Abrir EPUB en una nueva pestaña
        }
        [snapshot] { $where ->
            [window] Abrir instantánea en una nueva ventana
           *[tab] Abrir instantánea en una nueva pestaña
        }
        [note] { $where ->
            [window] Abrir nota en una nueva ventana
           *[tab] Abrir nota en una nueva pestaña
        }
       *[attachment] { $where ->
            [window] Abrir adjunto en una nueva ventana
           *[tab] Abrir adjunto en una nueva pestaña
        }
    }
weavero-menu-open-annotation-in =
    .label = { $type ->
        [pdf] { $where ->
            [window] Abrir en el PDF, en una nueva ventana
           *[tab] Abrir en el PDF, en una nueva pestaña
        }
        [epub] { $where ->
            [window] Abrir en el EPUB, en una nueva ventana
           *[tab] Abrir en el EPUB, en una nueva pestaña
        }
        [snapshot] { $where ->
            [window] Abrir en la instantánea, en una nueva ventana
           *[tab] Abrir en la instantánea, en una nueva pestaña
        }
        [note] { $where ->
            [window] Abrir en la nota, en una nueva ventana
           *[tab] Abrir en la nota, en una nueva pestaña
        }
       *[other] { $where ->
            [window] Abrir en el lector, en una nueva ventana
           *[tab] Abrir en el lector, en una nueva pestaña
        }
    }

weavero-menu-related-show-file =
    .label = Mostrar archivo
weavero-menu-related-copy-select-link =
    .label = Copiar enlace de selección
weavero-menu-related-copy-open-link =
    .label = { $external ->
        [yes] Copiar enlace de apertura (aplicación externa)
       *[no] Copiar enlace de apertura
    }
weavero-menu-related-add-related =
    .label = Añadir relacionado…
weavero-menu-related-remove-relation =
    .label = Quitar relación

weavero-menu-bm-pick-item =
    .label = Elegir un elemento de la biblioteca…
weavero-menu-bm-add-link =
    .label = Añadir enlace…
weavero-menu-bm-add-bookmark =
    .label = Añadir marcador
weavero-menu-bm-sort-manual =
    .label = Orden manual
weavero-menu-bm-sort-name =
    .label = Nombre
weavero-menu-bm-sort-date =
    .label = Fecha de adición
weavero-menu-bm-sort-ascending =
    .label = Ascendente
weavero-menu-bm-sort-descending =
    .label = Descendente
weavero-menu-bm-edit =
    .label = Editar marcador…
weavero-menu-bm-reset-name =
    .label = Restablecer el nombre predeterminado
weavero-menu-bm-delete =
    .label = Eliminar marcador
weavero-menu-bm-new-folder =
    .label = Nueva carpeta…
weavero-menu-bm-rename-folder =
    .label = Renombrar carpeta…
weavero-menu-bm-new-subfolder =
    .label = Nueva subcarpeta…
weavero-menu-bm-delete-folder =
    .label = Eliminar carpeta
weavero-menu-bm-collection =
    .label = { $what ->
        [library] { $bookmarked ->
            [yes] Quitar el marcador de la biblioteca
           *[no] Añadir la biblioteca a marcadores
        }
       *[collection] { $bookmarked ->
            [yes] Quitar el marcador de la colección
           *[no] Añadir la colección a marcadores
        }
    }

weavero-menu-items-default-attachment =
    .label = { $marked ->
        [yes] { $glyph }Quitar adjunto predeterminado
       *[no] { $glyph }Establecer como adjunto predeterminado
    }

weavero-menu-section-reset-filters =
    .label = Restablecer los filtros predeterminados

weavero-menu-tab-add-to-group =
    .label = { $count ->
        [0] Añadir pestaña a un grupo
        [one] Añadir pestaña a un grupo
        [many] Añadir { $count } pestañas a un grupo
       *[other] Añadir { $count } pestañas a un grupo
    }
weavero-menu-tab-open-notes =
    .label = Abrir notas
weavero-menu-tab-move-to-main-window =
    .label = Mover a la ventana principal
weavero-menu-group-unnamed-add =
    .label = Grupo sin nombre
weavero-menu-group-saved-hint = guardado

weavero-menu-reader-copy-citation =
    .label = Copiar cita
weavero-menu-reader-copy-bibliography =
    .label = Copiar bibliografía

weavero-menu-hamburger-new-tab =
    .label = Nueva pestaña
weavero-menu-hamburger-new-reader-window =
    .label = Nueva ventana del lector

weavero-menu-reader-add-selection-outline =
    .label = Añadir el texto seleccionado al esquema
weavero-menu-reader-add-selection-bookmarks =
    .label = Añadir el texto seleccionado a marcadores
weavero-menu-reader-add-position-bookmarks =
    .label = { $scope ->
        [library] Añadir esta posición a los marcadores de la biblioteca
       *[document] Añadir esta posición a marcadores
    }
weavero-menu-reader-add-page-bookmarks =
    .label = { $scope ->
        [library] Añadir esta página a los marcadores de la biblioteca
       *[document] Añadir esta página a marcadores
    }
weavero-menu-reader-add-position-outline =
    .label = Añadir esta posición al esquema…
weavero-menu-reader-page-anchor =
    .label = { $anchor ->
        [bottom] Parte inferior de la página { $page }
       *[top] Parte superior de la página { $page }
    }

weavero-menu-ctx-open =
    .label = Abrir
weavero-menu-ctx-open-new-window =
    .label = Abrir en una nueva ventana
weavero-menu-ctx-rename =
    .label = Renombrar…
weavero-menu-ctx-delete =
    .label = Eliminar
weavero-menu-ctx-edit-region =
    .label = Editar región…
weavero-menu-ctx-select-text =
    .label = Seleccionar texto…
weavero-menu-ctx-pin-spot =
    .label = Fijar un punto…
weavero-menu-bm-sort-location =
    .label = Ubicación
weavero-menu-outline-redetect-region =
    .label = Volver a detectar la región a partir del título
weavero-menu-outline-fix-spacing =
    .label = Corregir el espaciado
weavero-menu-outline-spacing-correct =
    .label = El espaciado es correcto
weavero-menu-outline-edit-position-pages =
    .label = Editar posición…
weavero-menu-outline-edit-position =
    .label = Editar posición
weavero-menu-outline-reset-original =
    .label = Restablecer el nombre y la región originales
weavero-menu-outline-not-box =
    .label = No es un recuadro (sección)
weavero-menu-outline-mark-box =
    .label = Marcar como recuadro / barra lateral
weavero-menu-outline-delete-entries =
    .label = Eliminar { $count } entradas
weavero-menu-outline-delete-weavero =
    .label = Eliminar el esquema editado…
weavero-menu-oe-verdict =
    .label = { $verdict ->
        [good] Extracción buena
        [bad] Extracción mala
        [scan] Escaneo (sin capa de texto)
       *[none] Sin marcar
    }

weavero-menu-bm-copy-to-outline =
    .label = { $count ->
        [0] Copiar al esquema
        [one] Copiar al esquema
        [many] Copiar { $count } al esquema
       *[other] Copiar { $count } al esquema
    }
weavero-menu-bm-show-parent =
    .label = Mostrar el elemento principal en la biblioteca

weavero-menu-maxspan-pair =
    .label = Maximizar en { $first } + { $second }
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
weavero-menu-maxspan-all =
    .label = { $count ->
        [3] Maximizar en los tres
       *[other] Maximizar en los { $count } monitores
    }
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
weavero-menu-maxspan-range =
    .label = Maximizar de { $first } a { $last }
    .tooltiptext = { $mixed ->
        [yes] { weavero-maxspan-tip-mixed }
       *[no] { weavero-maxspan-tip }
    }
weavero-maxspan-monitor = { $position ->
        [left] Izquierdo
        [middle] Central
        [right] Derecho
        [top] Superior
        [bottom] Inferior
       *[number] Monitor { $number }
    }
weavero-maxspan-tip = La ventana ocupa estos monitores y deja libre la barra de tareas. Restaurar, o un doble clic en la barra de título, la devuelve a su sitio.
weavero-maxspan-tip-mixed = La ventana ocupa estos monitores y deja libre la barra de tareas. Restaurar, o un doble clic en la barra de título, la devuelve a su sitio. Estos monitores usan escalas de pantalla diferentes: la ventana se dibuja a la escala de uno de ellos.

# ---- Shared words (all interface text into Fluent, 2026-11-19) -----------
weavero-common-cancel = Cancelar
weavero-common-save = Guardar
weavero-common-close = Cerrar
weavero-common-done = Hecho
weavero-common-loading = Cargando…
weavero-common-untitled = (sin título)
weavero-common-clear-search = Borrar la búsqueda
weavero-common-alt-click-exclude = Alt+clic para excluir
weavero-key-ctrl = Ctrl
weavero-key-shift = Mayús
weavero-key-alt = Alt
weavero-key-win = Win

# ---- Backlinks and Item Links (backlinks.ts, links.ts) ----
weavero-bl-ref-title = { $kind ->
        [links] { $count ->
            [one] { $count } Enlace a elemento
           *[other] { $count } Enlaces a elementos
        }
       *[backlinks] { $count ->
            [one] { $count } Retroenlace
           *[other] { $count } Retroenlaces
        }
    }
weavero-bl-internal-tip = Enlace interno: ambos extremos están en «{ $title }»
weavero-bl-page = p. { $page }
weavero-bl-note-pos = { $at ->
        [line] línea { $value }
        [section] #{ $value }
       *[heading] encabezado
    }
weavero-bl-att-kind = { $kind ->
        [pdf] PDF
        [epub] EPUB
        [snapshot] instantánea
        [file] archivo
       *[attachment] adjunto
    }
weavero-bl-row-label = { $ref ->
        [citation] { $paged ->
            [yes] Cita en nota p. { $page }
           *[no] Cita en nota
        }
        [quote] { $paged ->
            [yes] Cita en nota, anotación p. { $page }{ $file }
           *[no] Cita en nota, anotación{ $file }
        }
       *[link] Enlace de Zotero
    }
weavero-bl-kind = { $kind ->
        [cite] Cita en nota
       *[zotero] Enlace de Zotero
    }
weavero-bl-action = { $action ->
        [select] Mostrar en la biblioteca
        [annotation] Abrir en la anotación
        [page] Abrir en la página { $page }
       *[open] Abrir
    }
weavero-bl-action-open-note = { $at ->
        [line] Abrir la nota en la línea { $value } (Better Notes)
        [section] Abrir la nota en la sección { $value } (Better Notes)
        [heading] Abrir la nota en el encabezado
       *[none] Abrir la nota (Better Notes)
    }
weavero-bl-action-quote = { $form ->
        [page-cited] anotación p. { $page }, citada p. { $cited }
        [page] anotación p. { $page }
        [cited] anotación, citada p. { $cited }
        [gone] anotación, p. { $page }
       *[plain] anotación
    }
weavero-bl-chip = { $to ->
        [here] → { weavero-bl-note-pos }
        [annotation] → anotación{ $file }
        [annotation-page] → anotación p. { $page }{ $file }
        [note] → nota
        [note-pos] → nota { weavero-bl-note-pos }
        [attachment-page] → { weavero-bl-att-kind } p. { $page }
       *[attachment] → { weavero-bl-att-kind }
    }
weavero-bl-broken = { $why ->
        [library] La biblioteca no está en este perfil
       *[item] Elemento no encontrado
    }
weavero-bl-broken-why = { $why ->
        [library] El enlace nombra una biblioteca de grupo que no está en este perfil.
       *[item] Ningún elemento de la biblioteca tiene esta clave: se ha eliminado o el enlace es incorrecto.
    }
weavero-bl-card-page = Página
weavero-bl-card-comment = comentario: { $text }
weavero-bl-card-note = Nota

# ---- Hover cards (backlinks.ts) ----
weavero-card-side-source = Origen
weavero-card-side-target = Destino
weavero-card-side-item = Elemento
weavero-card-side-related = Relacionado

# ---- Annotation comments (annotation.ts) ----
weavero-ann-comment-popup = Ventana emergente del comentario

# ---- Default attachment (attachments.ts) ----
weavero-defatt-legacy-title = Weavero — se han encontrado adjuntos predeterminados
weavero-defatt-legacy-running = { $count ->
        [one] Default Attachment (PikaPei) está en ejecución y tiene { $count } adjunto predeterminado guardado.
        [many] Default Attachment (PikaPei) está en ejecución y tiene { $count } adjuntos predeterminados guardados.
       *[other] Default Attachment (PikaPei) está en ejecución y tiene { $count } adjuntos predeterminados guardados.
    }
weavero-defatt-legacy-running-offer = Weavero puede hacer lo mismo (para cualquier adjunto, URL enlazada o nota, no solo PDF) y guarda cada elección como una etiqueta para que se sincronice.
weavero-defatt-legacy-leftover = { $count ->
        [one] Se ha encontrado { $count } adjunto predeterminado que queda de Default Attachment (PikaPei), que no está en ejecución.
        [many] Se han encontrado { $count } adjuntos predeterminados que quedan de Default Attachment (PikaPei), que no está en ejecución.
       *[other] Se han encontrado { $count } adjuntos predeterminados que quedan de Default Attachment (PikaPei), que no está en ejecución.
    }
weavero-defatt-legacy-leftover-offer = Weavero puede hacerse cargo de ellos y guardar cada uno como una etiqueta para que se sincronice, o dejarlos como están.
weavero-defatt-legacy-question = ¿Qué desea hacer?
weavero-defatt-legacy-import = Importar a Weavero
weavero-defatt-legacy-skip = No importar
weavero-defatt-legacy-keep = Seguir usando Default Attachment
weavero-defatt-result-title = Weavero — adjuntos predeterminados
weavero-defatt-imported = { $count ->
        [one] Se ha importado { $count } elección como la etiqueta { $tag }.
        [many] Se han importado { $count } elecciones como la etiqueta { $tag }.
       *[other] Se han importado { $count } elecciones como la etiqueta { $tag }.
    }
weavero-defatt-imported-note = Los datos propios de Default Attachment no se han tocado: el README explica cómo eliminarlos a mano.
weavero-defatt-other-off = La función de adjunto predeterminado de Weavero está ahora desactivada.
weavero-defatt-other-keeps = Default Attachment sigue funcionando exactamente igual que antes; Weavero nunca ha modificado ninguno de sus datos.
weavero-defatt-other-back = Puede volver a activar la versión de Weavero en Ajustes → Weavero → Extras.
weavero-defatt-skipped = Los datos de Default Attachment se han dejado como estaban.
weavero-defatt-skipped-hint = Puede establecer un predeterminado en cualquier momento haciendo clic derecho en un elemento subordinado.

# ---- Split view (tab-split.ts) ----
weavero-split-splitter-label = Redimensionar las pestañas de la vista dividida
weavero-split-footer-more =
    .title = Vista dividida
    .aria-label = Menú de la vista dividida
weavero-split-picker-title = Añadir vista dividida
weavero-split-picker-desc = Elija una pestaña para mostrarla junto a esta.
weavero-split-picker-search = Buscar en las pestañas abiertas
weavero-split-picker-empty = No hay ninguna otra pestaña abierta.
weavero-split-tab-tip = { $side ->
        [left] { $label }, vista dividida a la izquierda
       *[right] { $label }, vista dividida a la derecha
    }

# ---- Settings pane, written by its script (prefs/index.ts) ----
weavero-pref-section-toggle = Contraer o expandir esta sección
weavero-pref-outline-key-none = Ninguno
weavero-pref-outline-key-press = Pulse las teclas…
weavero-pref-outline-key-esc-hint = Esc para cancelar
weavero-pref-outline-key-taken = { $keys } ya lo usa { $owner }.
weavero-pref-outline-key-saved = Guardado.
weavero-pref-outline-key-removed = Eliminado.

# ---- misc (index.ts, pane.ts) ----
weavero-misc-toast-dismiss = Haga clic para cerrar
weavero-misc-link-toast-title = Weavero — enlace roto
weavero-misc-link-group-no-access = Este enlace apunta a una biblioteca de grupo a la que no tiene acceso (grupo n.º { $group }).
weavero-misc-link-group-unresolved = Este enlace apunta a una biblioteca de grupo que no se ha podido resolver.
weavero-misc-link-collection-missing = La colección enlazada ya no existe (clave { $key }).
weavero-misc-link-collection-trashed = La colección enlazada está en la papelera (clave { $key }).
weavero-misc-link-search-missing = La búsqueda guardada enlazada ya no existe (clave { $key }).
weavero-misc-link-scope-collection-missing = La colección de este enlace ya no existe (clave { $key }): se seleccionan los elementos sin ella.
weavero-misc-link-scope-collection-trashed = La colección de este enlace está en la papelera (clave { $key }): se seleccionan los elementos sin ella.
weavero-misc-link-scope-search-missing = La búsqueda guardada de este enlace ya no existe (clave { $key }): se seleccionan los elementos sin ella.
weavero-misc-link-items-missing-all = Ya no existe ninguno de los { $count } elementos enlazados ({ $keys }).
weavero-misc-link-item-missing = El elemento enlazado ya no existe (clave { $key }).
weavero-misc-link-items-missing-some = { $count } de los { $total } elementos enlazados ya no existen ({ $keys }); se han seleccionado los demás.
weavero-misc-link-items-trashed = { $count } de los elementos enlazados están en la papelera ({ $keys }).
weavero-misc-link-item-trashed = El elemento enlazado está en la papelera (clave { $key }).
weavero-misc-link-file-missing = El archivo al que apunta este enlace ya no existe (clave { $key }).
weavero-misc-link-file-trashed = El adjunto del archivo enlazado está en la papelera (clave { $key }); se ha abierto de todos modos.
weavero-misc-link-note-missing = La nota a la que apunta este enlace ya no existe (clave { $key }).
weavero-misc-link-note-trashed = La nota enlazada está en la papelera (clave { $key }); se ha abierto de todos modos.
weavero-misc-link-refused-zotero = Este tipo de enlace de Zotero no se abre desde una nota ni desde un comentario: { $url }
weavero-misc-link-refused-remote-file = No se ha abierto un enlace a un archivo de otro ordenador ({ $host }).
weavero-misc-open-remote-file-title = ¿Abrir un archivo de otro ordenador?
weavero-misc-open-remote-file-message = Este enlace lleva a otro ordenador, «{ $host }»:

    { $target }

    Abrirlo conecta con ese ordenador. Ábralo solo si confía en la procedencia del enlace. Weavero no volverá a preguntar por este enlace.
weavero-misc-open-remote-file-button = Abrir
weavero-misc-open-local-file-title = ¿Abrir un archivo de este ordenador?
weavero-misc-open-local-file-message = Este enlace abre un archivo de este ordenador:

    { $target }

    Se abrirá en la aplicación que su ordenador usa para este tipo de archivo. Ábralo solo si confía en la procedencia del enlace. Weavero no volverá a preguntar por este enlace.
weavero-misc-open-local-file-button = Abrir
weavero-misc-link-local-file-not-opened = «{ $name }» no se ha abierto.
weavero-misc-link-local-file-missing = «{ $name }» no se ha abierto: ese archivo no existe en este ordenador.
weavero-misc-link-local-file-failed = «{ $name }» no se ha podido abrir.
weavero-misc-link-refused-title = Weavero — enlace no abierto
weavero-misc-link-refused-runnable = «{ $name }» no se ha abierto: los archivos de este tipo pueden ejecutar programas en su ordenador.
weavero-misc-open-external-title = ¿Abrir en otra aplicación?
weavero-misc-open-external-message = Zotero no puede mostrar «{ $name }», así que se abriría en la aplicación que su ordenador usa para este tipo de archivo. Ábralo solo si confía en su procedencia.
weavero-misc-open-external-button = Abrir
weavero-misc-reader-window = { $number ->
        [1] Ventana del lector
       *[other] Ventana del lector { $number }
    }
weavero-misc-update-installed = Instalado actualmente: Zotero { $version }
weavero-misc-update-other-instance = Hay otro Zotero de esta instalación abierto (otro perfil u otro usuario). Zotero espera a que se cierre para buscar e instalar actualizaciones.

# ---- count (count-popups.ts, index.ts, pane.ts) ----
weavero-count-related = { $count } Relacionado
weavero-count-title-tags = { $count ->
        [one] { $count } Etiqueta
        [many] { $count } Etiquetas
       *[other] { $count } Etiquetas
    }
weavero-count-title-manual-tags = { $count ->
        [one] { $count } Etiqueta manual
        [many] { $count } Etiquetas manuales
       *[other] { $count } Etiquetas manuales
    }
weavero-count-title-auto-tags = { $count ->
        [one] { $count } Etiqueta automática
        [many] { $count } Etiquetas automáticas
       *[other] { $count } Etiquetas automáticas
    }
weavero-count-title-backlinks = { $count ->
        [one] { $count } Retroenlace
        [many] { $count } Retroenlaces
       *[other] { $count } Retroenlaces
    }
weavero-count-title-item-links = { $count ->
        [one] { $count } Enlace a elemento
        [many] { $count } Enlaces a elementos
       *[other] { $count } Enlaces a elementos
    }
weavero-count-title-ext-links = { $count ->
        [one] { $count } Enlace externo
        [many] { $count } Enlaces externos
       *[other] { $count } Enlaces externos
    }
weavero-count-this-item = Este elemento
weavero-count-page = p. { $page }
weavero-count-tag-filter-tip = Filtrar la lista por esta etiqueta
weavero-count-empty = Ya no hay nada aquí.

# ---- scope (pane-scope.ts) ----
weavero-scope-toggle-hint = { $state ->
        [only] Solo se muestran estos · vuelva a hacer clic: mostrar todos
        [hidden] Estos están ocultos · vuelva a hacer Alt+clic: mostrarlos
       *[off] Clic: mostrar solo estos · Alt+clic: ocultar estos
    }
weavero-scope-count-own = { $prep ->
        [in] En este elemento: { $count }
        [to] Hacia este elemento: { $count }
       *[on] En este elemento: { $count }
    }
weavero-scope-count-att = { $prep ->
        [in] En sus adjuntos: { $count }
        [to] Hacia sus adjuntos: { $count }
       *[on] En sus adjuntos: { $count }
    }
weavero-scope-count-note = { $prep ->
        [in] En sus notas: { $count }
        [to] Hacia sus notas: { $count }
       *[on] En sus notas: { $count }
    }
weavero-scope-count-ann = { $prep ->
        [in] En sus anotaciones: { $count }
        [to] Hacia sus anotaciones: { $count }
       *[on] En sus anotaciones: { $count }
    }
weavero-scope-count-zotero-links = Enlaces de Zotero: { $count }
weavero-scope-count-note-citations = Citas en notas: { $count }
weavero-scope-count-internal = { $what ->
        [backlinks] Retroenlaces internos: { $count } de { $total } (ambos extremos en el mismo elemento)
       *[links] Enlaces internos: { $count } de { $total } (ambos extremos en el mismo elemento)
    }
weavero-scope-count-broken = Enlaces rotos: { $count } (el elemento ya no existe o su biblioteca de grupo no está en este perfil)

# ---- hid (pane.ts, hidden collections) ----
weavero-hid-hide = Ocultar
weavero-hid-section = { $section ->
        [feeds] Canales
       *[groups] Bibliotecas de grupo
    }
weavero-hid-dot-collections = { $count ->
        [one] { $count } colección o búsqueda guardada oculta
        [many] { $count } colecciones o búsquedas guardadas ocultas
       *[other] { $count } colecciones o búsquedas guardadas ocultas
    }
weavero-hid-dot-groups = { $count ->
        [one] { $count } biblioteca de grupo oculta
        [many] { $count } bibliotecas de grupo ocultas
       *[other] { $count } bibliotecas de grupo ocultas
    }
weavero-hid-dot-libraries = { $count ->
        [one] { $count } biblioteca oculta
        [many] { $count } bibliotecas ocultas
       *[other] { $count } bibliotecas ocultas
    }
weavero-hid-dot-feeds = { $count ->
        [one] { $count } canal oculto
        [many] { $count } canales ocultos
       *[other] { $count } canales ocultos
    }
weavero-hid-dot-section = la sección { $section }
weavero-hid-dot-here = En esta ventana: { $list }
weavero-hid-dot-everywhere = { $count } entradas ocultas en todas las ventanas (ajuste de Zotero)
weavero-hid-dot-tip = { $list } — clic derecho para mostrar
weavero-hid-mgr-title = Administrador de colecciones y bibliotecas
weavero-hid-mgr-title-window = Administrador de colecciones y bibliotecas — { $window }
weavero-hid-mgr-filter = Filtrar colecciones
weavero-hid-mgr-shown = Visibles
weavero-hid-mgr-hidden = Ocultos
weavero-hid-mgr-hide-button = Ocultar →
weavero-hid-mgr-show-button = ← Mostrar
weavero-hid-mgr-show-all-button = ← Mostrar todo
weavero-hid-mgr-show-all-tip = Mostrar todo lo oculto en esta ventana (y lo que oculta el propio ajuste de Zotero)
weavero-hid-mgr-empty = Nada oculto
weavero-hid-mgr-why-groups-section = La sección Bibliotecas de grupo solo se puede ocultar mientras Mi biblioteca está visible
weavero-hid-mgr-why-last-library = La última biblioteca visible no se puede ocultar: muestre primero otra biblioteca
weavero-hid-mgr-why-heading-hide = Un encabezado: seleccione las bibliotecas que hay debajo para ocultarlas
weavero-hid-mgr-why-heading-show = Un encabezado: seleccione las bibliotecas ocultas que hay debajo para mostrarlas
weavero-hid-mgr-why-not-hidden = No está oculto: se muestra aquí por las entradas ocultas que contiene
weavero-hid-mgr-hint-groups-section = Oculto con la sección Bibliotecas de grupo: Mostrar recupera la sección
weavero-hid-mgr-hint-feeds-section = Oculto con la sección Canales: Mostrar recupera la sección
weavero-hid-mgr-hint-library = Oculto con su biblioteca: Mostrar recupera la biblioteca
weavero-hid-mgr-hint-parent = Oculto con su colección superior: Mostrar recupera la colección superior
weavero-hid-mgr-global-tip = Oculto en todas las ventanas por el propio ajuste de Zotero: Mostrar lo recupera en todas partes
weavero-hid-mgr-all-windows = (todas las ventanas)

# ---- pane (pane.ts) ----
weavero-pane-open-in-new-main-window = Nueva ventana principal
weavero-pane-open-in-new-group-window = Un nuevo grupo en una nueva ventana principal
weavero-pane-toggle-collections = Alternar panel de colecciones
weavero-pane-tags-handle-expand = Expandir el selector de etiquetas
weavero-pane-tags-handle-expand-tag = Expandir el selector de etiquetas (la lista está filtrada por la etiqueta «{ $tag }»)
weavero-pane-tags-handle-expand-tags = Expandir el selector de etiquetas (la lista está filtrada por { $count } etiquetas)
weavero-pane-tags-handle-collapse = Contraer el selector de etiquetas (arrastre para cambiar el tamaño)
weavero-pane-added-by = Añadido por { $name }
weavero-pane-url-menu-copy-link = Copiar enlace
weavero-pane-url-menu-open-split = Abrir enlace en vista dividida
weavero-pane-related-card-foot = Clic: mostrar en la biblioteca · Clic derecho para más opciones

# ---- col (pane.ts, items-list columns) ----
weavero-col-annotations = Anotaciones
weavero-col-tags = Etiquetas
weavero-col-related = Relacionado
weavero-col-backlinks = Retroenlaces
weavero-col-item-links = Enlaces a elementos
weavero-col-ext-links = Enlaces externos

# ---- pm (pane.ts, Plugins Manager) ----
weavero-pm-window-title = Administrador de extensiones
weavero-pm-search-placeholder = Buscar en las extensiones instaladas  ({ $shortcut })
weavero-pm-search-clear = Borrar
weavero-pm-time-unknown = desconocido
weavero-pm-time-just-now = ahora mismo
weavero-pm-time-minutes = hace { $count } min
weavero-pm-time-hours = { $count ->
        [one] hace { $count } hora
        [many] hace { $count } horas
       *[other] hace { $count } horas
    }
weavero-pm-time-days = { $count ->
        [one] hace { $count } día
        [many] hace { $count } días
       *[other] hace { $count } días
    }
weavero-pm-card-meta = v{ $version } · actualizada { $when }
weavero-pm-recent-frame-tip = Hasta cuándo se remonta Actualizaciones recientes
weavero-pm-recent-frame = { $days ->
        [0] Todo
        [one] Último día
       *[other] Últimos { $days } días
    }
weavero-pm-recent-frame-default = { $frame } (predeterminado)
weavero-pm-recent-heading = Actualizaciones recientes

# ---- oe (outline-eval.ts, a developer tool) ----
weavero-oe-marked = { $verdict ->
        [good] Evaluación: marcado como BUENO ({ $count } casos registrados)
        [bad] Evaluación: marcado como MALO ({ $count } casos registrados)
       *[scan] Evaluación: marcado como ESCANEO ({ $count } casos registrados)
    }
weavero-oe-cleared = Evaluación: marca borrada

# ---- Items-list filter: toolbar, chip bar, rows (filter.ts) ----
weavero-filter-tb-button-tip = Filtrar elementos
weavero-filter-chevron-revealed-tip = Se muestran todos los subordinados de este contenedor. Haga clic para volver a aplicar el filtro.
weavero-filter-chevron-hidden-tip = { $count ->
        [one] { $count } elemento más oculto por el filtro. Haga clic para mostrarlo.
        [many] { $count } elementos más ocultos por el filtro. Haga clic para mostrarlos.
       *[other] { $count } elementos más ocultos por el filtro. Haga clic para mostrarlos.
    }

weavero-filter-added-by-tip = Añadido por { $name }

weavero-filter-chip-order = { $field } { $op } { $value }
weavero-filter-chip-op-is = es
weavero-filter-chip-op-is-not = no es
weavero-filter-chip-op-includes = incluye
weavero-filter-chip-op-includes-all = incluye todos
weavero-filter-chip-op-includes-any = incluye alguno
weavero-filter-chip-op-excludes-any = excluye cualquiera
weavero-filter-chip-op-has = tiene
weavero-filter-chip-op-has-none-of = no tiene ninguno de
weavero-filter-chip-source-embedded = Incrustada en el PDF
weavero-filter-chip-source-zotero = Creada en Zotero
weavero-filter-chip-tip = Haga clic para editar: abre la ventana emergente de filtros centrada en este grupo.
weavero-filter-chip-remove-tip = Quitar filtro
weavero-filter-bar-or = O
weavero-filter-bar-add = + Filtro
weavero-filter-bar-add-tip = Añadir un filtro al grupo actual (Y con los chips existentes de este grupo).
weavero-filter-bar-add-group = + Grupo O
weavero-filter-bar-add-group-tip = Iniciar un nuevo grupo O: sus filtros se combinan internamente con Y, y los resultados del grupo se suman a los de los demás.
weavero-filter-bar-clear-all = Borrar todo
weavero-filter-bar-clear-all-tip = Quitar todos los filtros activos y volver a un único grupo vacío.

weavero-filter-dim-annotation-color = Color de anotación
weavero-filter-dim-annotation-type = Tipo de anotación
weavero-filter-dim-has-comment = Tiene comentario
weavero-filter-dim-annotation-source = Origen de la anotación
weavero-filter-dim-tag = Etiqueta
weavero-filter-dim-author = Autor
weavero-filter-dim-item-type = Tipo de elemento
weavero-filter-dim-attachment-file-type = Tipo de fichero adjunto
weavero-filter-dim-outline-source = Origen del esquema
weavero-filter-dim-outline-flags = Indicadores del esquema
weavero-filter-dim-outline-verdict = Veredicto del esquema
weavero-filter-dim-added-by = Añadido por
weavero-filter-dim-has-related = Tiene relacionados
weavero-filter-dim-has-external-link = Tiene enlace externo
weavero-filter-dim-has-item-links = Tiene enlaces a elementos
weavero-filter-dim-has-bookmarks = Tiene marcadores
weavero-filter-dim-has-backlinks = Tiene retroenlaces
weavero-filter-dim-has-tag = Tiene etiqueta
weavero-filter-dim-item-note = Nota de elemento
weavero-filter-dim-standalone-note = Nota independiente
weavero-filter-dim-standalone-attachment = Adjunto independiente
weavero-filter-dim-has-abstract = Tiene resumen
weavero-filter-dim-has-doi = Tiene DOI
weavero-filter-dim-has-pmid = Tiene PMID
weavero-filter-dim-has-pmcid = Tiene PMCID
weavero-filter-dim-retracted = Retirado
weavero-filter-dim-has-url = Tiene URL
weavero-filter-dim-has-attachment = Tiene archivo adjunto
weavero-filter-dim-has-annotations = Tiene anotaciones
weavero-filter-dim-has-outline = Tiene esquema editado
weavero-filter-dim-has-embedded-annotations = Tiene anotaciones incrustadas
weavero-filter-dim-publication = Publicación
weavero-filter-dim-read-status = Estado de lectura
weavero-filter-dim-in-other-library = En varias bibliotecas

weavero-filter-color-yellow = Amarillo
weavero-filter-color-red = Rojo
weavero-filter-color-green = Verde
weavero-filter-color-blue = Azul
weavero-filter-color-purple = Púrpura
weavero-filter-color-magenta = Magenta
weavero-filter-color-orange = Naranja
weavero-filter-color-gray = Gris
weavero-filter-color-black = Negro

weavero-filter-ann-type-highlight = Resaltado
weavero-filter-ann-type-underline = Subrayado
weavero-filter-ann-type-note = Nota
weavero-filter-ann-type-image = Imagen
weavero-filter-ann-type-ink = Tinta
weavero-filter-ann-type-text = Texto

weavero-filter-file-type-snapshot = Instantánea
weavero-filter-file-type-image = Imagen
weavero-filter-file-type-video = Vídeo
weavero-filter-file-type-web-link = Enlace web
weavero-filter-file-type-linked-file = Archivo enlazado
weavero-filter-file-type-other-file = Otro archivo

weavero-filter-read-status-none = Sin estado
weavero-filter-read-status-tip = { $status } — Alt+clic para excluir

# ---- Collection set (filter.ts): several collections selected ----
weavero-filter-collset-header = { $header } — { $mode ->
        [all] en todas
       *[not-all] no en todas
    }
weavero-filter-collset-tip-all = { $kind ->
        [collections] Se muestran los elementos que están en TODAS las colecciones seleccionadas: haga clic para volver a mostrarlos todos (unión)
        [searches] Se muestran los elementos que están en TODAS las búsquedas guardadas seleccionadas: haga clic para volver a mostrarlos todos (unión)
       *[sources] Se muestran los elementos que están en TODAS las fuentes seleccionadas: haga clic para volver a mostrarlos todos (unión)
    }
weavero-filter-collset-tip-not-all = { $kind ->
        [collections] Se muestran los elementos que están en algunas, pero NO en todas las colecciones seleccionadas: Alt+clic para volver a mostrarlos todos (unión)
        [searches] Se muestran los elementos que están en algunas, pero NO en todas las búsquedas guardadas seleccionadas: Alt+clic para volver a mostrarlos todos (unión)
       *[sources] Se muestran los elementos que están en algunas, pero NO en todas las fuentes seleccionadas: Alt+clic para volver a mostrarlos todos (unión)
    }
weavero-filter-collset-tip-off = { $kind ->
        [collections] Mostrar solo los elementos que están en TODAS las colecciones seleccionadas (intersección). Alt+clic: los que están en algunas, pero no en todas.
        [searches] Mostrar solo los elementos que están en TODAS las búsquedas guardadas seleccionadas (intersección). Alt+clic: los que están en algunas, pero no en todas.
       *[sources] Mostrar solo los elementos que están en TODAS las fuentes seleccionadas (intersección). Alt+clic: los que están en algunas, pero no en todas.
    }
weavero-filter-collset-tip-counts = En todas: { $all ->
        [one] { $all } elemento
       *[other] { $all } elementos
    } · en algunas, pero no en todas: { $some ->
        [one] { $some } elemento
       *[other] { $some } elementos
    }

# ---- Filter popup (filter.ts) ----
weavero-filter-popup-title = Filtrar biblioteca
weavero-filter-popup-clear = Borrar
weavero-filter-popup-clear-tip = Borrar todos los filtros (mantener esta ventana abierta)
weavero-filter-popup-clear-aria = Borrar todos los filtros
weavero-filter-popup-clear-close = Borrar y cerrar

weavero-filter-kind-parent = Principal
weavero-filter-kind-attachment = Adjunto
weavero-filter-kind-note = Nota
weavero-filter-kind-annotation = Anotación
weavero-filter-kind-standalone-note-text = Texto de nota independiente
weavero-filter-kind-item-note-text = Texto de nota de elemento
weavero-filter-kind-annotation-comment = Comentario de la anotación

weavero-filter-seltarget-label = Destino de la selección:
weavero-filter-seltarget-tip = Qué tipos de fila selecciona Ctrl+A (las filas fuera del ámbito se atenúan). Déjelo vacío para el valor predeterminado inteligente: todos los tipos, o solo el tipo o tipos a los que apuntan sus filtros activos (filtros de anotación → anotaciones; filtros de tipo de elemento → elementos; ambos → ambos). Haga clic en un tipo para cambiarlo, o Alt+clic para excluirlo.
weavero-filter-seltarget-parent-tip = Los elementos normales se podrán seleccionar con Ctrl+A.
weavero-filter-seltarget-attachment-tip = Las filas de adjuntos (incluidos los independientes) se podrán seleccionar con Ctrl+A.
weavero-filter-seltarget-note-tip = Las notas (independientes y de elemento) se podrán seleccionar con Ctrl+A.
weavero-filter-seltarget-annotation-tip = Las filas de anotaciones se podrán seleccionar con Ctrl+A.
weavero-filter-seltarget-auto-tip = { $tip }  •  Automático: sus filtros activos solo apuntan a este tipo, así que es lo que selecciona Ctrl+A. Haga clic en cualquier tipo para establecerlo manualmente.

weavero-filter-show-nonmatching-annotations = Mostrar anotaciones que no coinciden
weavero-filter-show-nonmatching-annotations-tip = Refleja «Ocultar anotaciones que no coinciden» de Zotero (menú Ver). Si está desactivado, bajo los archivos coincidentes solo aparecen las anotaciones que coinciden con la búsqueda o el filtro actual.
weavero-filter-show-nonmatching-attachments = Mostrar adjuntos que no coinciden
weavero-filter-show-nonmatching-attachments-tip = Si está desactivado, bajo los elementos principales coincidentes solo aparecen los adjuntos que coinciden con la búsqueda o el filtro actual. Los adjuntos ocultos se llevan consigo sus anotaciones.

weavero-filter-mode-trigger-tip = Elegir qué filtrar
weavero-filter-tag-empty-all = No hay etiquetas en esta biblioteca
weavero-filter-tag-empty-match = No hay etiquetas que coincidan
weavero-filter-publication-empty-all = No hay publicaciones en esta biblioteca
weavero-filter-publication-empty-match = No hay publicaciones que coincidan
weavero-filter-author-empty-all = No hay autores de anotaciones en esta biblioteca
weavero-filter-author-empty-match = No hay autores que coincidan
weavero-filter-added-by-empty-all = No hay creadores registrados en esta biblioteca
weavero-filter-added-by-empty-match = No hay usuarios que coincidan
weavero-filter-collection-empty-all = No hay colecciones en esta biblioteca
weavero-filter-collection-empty-match = No hay colecciones que coincidan
weavero-filter-saved-search-empty-all = No hay búsquedas guardadas en esta biblioteca
weavero-filter-saved-search-empty-match = No hay búsquedas guardadas que coincidan
weavero-filter-suggest-more = +{ $count } más
weavero-filter-collection-collapse = Contraer
weavero-filter-collection-expand = Expandir

weavero-filter-pill-tip = { $exclude ->
        [yes] No { $kind }: { $value }
       *[no] { $kind }: { $value }
    }
weavero-filter-pill-kind = { $exclude ->
        [yes] No { $kind }:
       *[no] { $kind }:
    }
weavero-filter-pill-remove = Quitar
weavero-filter-tag-scope-tip = Elegir a qué categorías se aplica el filtro de etiquetas: elementos principales, adjuntos, notas, anotaciones (compartido con Tiene etiqueta).
weavero-filter-line-all-of = Todos estos
weavero-filter-line-any-publication = Cualquier publicación
weavero-filter-line-any-added-by = Cualquier «Añadido por»

weavero-filter-itype-trigger = Tipo de elemento
weavero-filter-itype-trigger-tip = Tipo de elemento: haga clic para elegir
weavero-filter-itype-not = No { $type }
weavero-filter-itype-empty = No hay tipos de elemento disponibles
weavero-filter-itype-mru-tip = { $type }: usado recientemente. Haga clic para filtrar; Alt+clic para excluir.

weavero-filter-qs-scope-tip = Restringir la búsqueda rápida a: elija qué tipos de fila puede mostrar la búsqueda rápida de la barra de herramientas en los resultados. Todo activado (predeterminado) significa sin restricción.
weavero-filter-qs-scope-aria = Restringir la búsqueda rápida a
weavero-filter-scope-apply-to = Aplicar a
weavero-filter-scope-arrow-tip = Elegir a qué categorías se aplica este filtro: elementos principales, adjuntos, notas, anotaciones

weavero-filter-has-tag-tip = Tiene etiqueta: elementos con al menos una etiqueta. Alt+clic para excluir. ▾ para acotar por tipo de fila.
weavero-filter-has-related-tip = Tiene relacionados: elementos con al menos un enlace a un elemento relacionado. Alt+clic para excluir. ▾ para acotar por tipo de fila.
weavero-filter-has-external-link-tip = Tiene enlace externo: elementos cuyo comentario de anotación o texto de nota contiene un enlace que sale de Zotero (https://, mailto:, enlaces de aplicaciones). Un enlace zotero:// corresponde a Tiene enlaces a elementos. Alt+clic para excluir. ▾ para elegir qué textos examinar.
weavero-filter-has-item-links-tip = Tiene enlaces a elementos: elementos cuyas notas o comentarios de anotación enlazan a otro elemento de Zotero (enlaces de Zotero y citas en notas), en el propio elemento, en una nota o en una anotación. Una URL web sola corresponde a Tiene enlace externo. Alt+clic para excluir. ▾ para elegir dónde está escrito el enlace.
weavero-filter-has-backlinks-tip = Tiene retroenlaces: elementos enlazados desde otro comentario de anotación o nota (enlaces de Zotero y citas en notas), en el propio elemento, en un subordinado o en una anotación. Alt+clic para excluir. ▾ para elegir qué está enlazado: el elemento, sus adjuntos, notas o anotaciones.
weavero-filter-in-other-library-tip = En varias bibliotecas: elementos normales que también pertenecen a otra biblioteca (existe una copia vinculada, p. ej., arrastrada a un grupo o desde él). La sección Bibliotecas y colecciones del panel de elementos muestra cuáles. Alt+clic para excluir.
weavero-filter-retracted-tip = Retirado: elementos normales que Zotero marca como retirados (aviso rojo de retractación en el panel de elementos), dentro de la colección o búsqueda actual. Alt+clic para excluirlos.
weavero-filter-has-doi-tip = Tiene DOI: elementos normales con un DOI. Alt+clic para excluir.
weavero-filter-has-pmid-tip = Tiene PMID: elementos normales con un PMID (campo propio o Adicional). Alt+clic para excluir.
weavero-filter-has-pmcid-tip = Tiene PMCID: elementos normales con un PMCID (campo propio o Adicional). Alt+clic para excluir.
weavero-filter-has-url-tip = Tiene URL: elementos normales con un campo URL. Alt+clic para excluir.
weavero-filter-has-abstract-tip = Tiene resumen: elementos normales con un resumen no vacío. Alt+clic para excluir.
weavero-filter-has-attachment-tip = Tiene archivo adjunto: elementos normales con al menos un archivo adjunto (PDF, EPUB, instantánea, etc.). Distinto de Nota de elemento: las notas de elemento también son filas del nivel de los adjuntos, pero tienen su propio icono en el grupo Adjunto. Alt+clic para excluir.
weavero-filter-linked-file-tip = Archivo enlazado: adjuntos guardados como enlaces a archivos externos (cualquier tipo de contenido). Alt+clic para excluir.
weavero-filter-standalone-attachment-tip = Adjunto independiente: mostrar solo los adjuntos de primer nivel (sin elemento principal). Alt+clic para excluir.
weavero-filter-has-bookmarks-tip = Tiene marcadores: elementos cuyos adjuntos tienen marcadores del lector guardados. Alt+clic para excluir.
weavero-filter-has-annotations-tip = Tiene anotaciones: adjuntos de archivo con al menos una anotación. Alt+clic para excluir.
weavero-filter-has-embedded-annotations-tip = Tiene anotaciones incrustadas: adjuntos de archivo con al menos una anotación incrustada en el PDF por un lector externo. Alt+clic para excluir.
weavero-filter-has-outline-tip = Tiene esquema editado: adjuntos con un esquema que usted ha editado en la pestaña Esquema del lector (entradas renombradas, sus propias adiciones). NO el esquema incrustado o extraído del propio documento: eso solo se puede saber abriendo cada archivo. Alt+clic para excluir.
weavero-filter-has-comment-tip = Tiene comentario: anotaciones con un texto de comentario no vacío. Alt+clic para excluir.
weavero-filter-annotation-source-tip = Origen de la anotación: incrustada en el PDF por un lector externo (importada cuando Zotero abre el archivo por primera vez). Alt+clic: creada en el lector de Zotero.
weavero-filter-standalone-note-tip = Nota independiente: mostrar solo las notas de primer nivel (sin elemento principal). Junto con Nota de elemento: cualquiera de los dos tipos de nota (O). Alt+clic para excluir.
weavero-filter-item-note-tip = Nota de elemento: mostrar solo las notas adjuntas a un elemento normal. Junto con Nota independiente: cualquiera de los dos tipos de nota (O). Alt+clic para excluir.

# ---- Filter popup, developer outline section (filter.ts) ----
weavero-filter-outline-scan = Analizar la biblioteca
weavero-filter-outline-quick-scanning = Análisis rápido… { $done }/{ $total }
weavero-filter-outline-scanning = Analizando… { $done }/{ $total }
weavero-filter-outline-scan-tip = Clasificar el esquema de cada PDF de esta biblioteca (abre cada uno en segundo plano). No escribe nada en la biblioteca.
weavero-filter-outline-status = { $classified } clasificados · { $marked } marcados
weavero-filter-outline-row-source = Origen
weavero-filter-outline-row-flags = Indicadores
weavero-filter-outline-row-verdict = Veredicto
weavero-filter-outline-embedded = Incrustado
weavero-filter-outline-extracted = Extraído
weavero-filter-outline-zotero = Zotero
weavero-filter-outline-scanned = Escaneado (sin texto)
weavero-filter-outline-empty = Vacío
weavero-filter-outline-unknown = Desconocido
weavero-filter-outline-flag-content-empty = Sin contenido
weavero-filter-outline-flag-entity-leak = Fuga de entidades
weavero-filter-outline-flag-ws-junk = Espacios basura
weavero-filter-outline-flag-fig-table = Encabezados de figura/tabla
weavero-filter-outline-flag-spacing = Espaciado dudoso
weavero-filter-outline-verdict-good = Bueno
weavero-filter-outline-verdict-bad = Malo
weavero-filter-outline-verdict-scan = Escaneo
weavero-filter-outline-verdict-unmarked = Sin marcar
weavero-filter-outline-tile-tip = { $count ->
        [0] { $label } — clic para incluir, Alt+clic para excluir
       *[other] { $label } ({ $count }) — clic para incluir, Alt+clic para excluir
    }

# ---- Item count breakdown in the item pane (filter.ts) ----
weavero-filter-count-top-level = Primer nivel
weavero-filter-count-children = Subordinados
weavero-filter-count-annotations = Anotaciones
weavero-filter-count-unread = No leídos
weavero-filter-count-read = Leídos
weavero-filter-count-match = Coinciden
weavero-filter-count-context = Contexto
weavero-filter-count-rows = Filas
weavero-filter-count-narrowed = acotado por { $sources }
weavero-filter-count-source = { $source ->
        [filter] filtro
        [quick] búsqueda rápida
       *[advanced] búsqueda avanzada
    }

# ---- Filter popup search box menu (filter.ts) ----
weavero-menu-filter-mode-tag =
    .label = Etiqueta
weavero-menu-filter-mode-publication =
    .label = Publicación
weavero-menu-filter-mode-author =
    .label = Autor
weavero-menu-filter-mode-added-by =
    .label = Añadido por
weavero-menu-filter-mode-collection =
    .label = Colección
weavero-menu-filter-mode-saved-search =
    .label = Búsqueda guardada

# ---- Bookmarks, shared by the reader's Bookmarks pane and the library's Bookmarks dropdown (bookmarks.ts, reader-panels.ts) ----
weavero-bm-title = Marcadores
weavero-bm-search-tip = Buscar marcadores
weavero-bm-search-placeholder = Buscar marcadores…
weavero-bm-filter-tip = Filtrar marcadores
weavero-bm-search-no-match = Ningún marcador coincide con «{ $query }».
weavero-bm-filter-no-match = Ningún marcador coincide con el filtro actual.
weavero-bm-sort-tip = { $field ->
        [location] { $dir ->
            [asc] Ordenados por ubicación (ascendente): haga clic para cambiar (se conserva el orden manual)
           *[desc] Ordenados por ubicación (descendente): haga clic para cambiar (se conserva el orden manual)
        }
        [alpha] { $dir ->
            [asc] Ordenados por nombre (ascendente): haga clic para cambiar (se conserva el orden manual)
           *[desc] Ordenados por nombre (descendente): haga clic para cambiar (se conserva el orden manual)
        }
        [date] { $dir ->
            [asc] Ordenados por fecha de adición (ascendente): haga clic para cambiar (se conserva el orden manual)
           *[desc] Ordenados por fecha de adición (descendente): haga clic para cambiar (se conserva el orden manual)
        }
       *[manual] Ordenar marcadores
    }
weavero-bm-sort-short = { $field ->
        [location] Ubicación
        [date] Fecha
       *[alpha] Nombre
    }
weavero-bm-sort-reverse = Invertir el orden
weavero-bm-filter-title = Filtrar marcadores
weavero-bm-filter-none = No hay filtros disponibles para la lista de marcadores actual.
weavero-bm-filter-chip-ann-tip = { $count ->
        [one] { $name } — { $count } anotación — Alt+clic para excluir
        [many] { $name } — { $count } anotaciones — Alt+clic para excluir
       *[other] { $name } — { $count } anotaciones — Alt+clic para excluir
    }
weavero-bm-filter-chip-tag-tip = { $count ->
        [one] { $tag } — { $count } marcador — Alt+clic para excluir
        [many] { $tag } — { $count } marcadores — Alt+clic para excluir
       *[other] { $tag } — { $count } marcadores — Alt+clic para excluir
    }
weavero-bm-filter-type-tip = { $type ->
        [highlight] Resaltados
        [underline] Subrayados
        [note] Notas
        [text] Anotaciones de texto
        [image] Anotaciones de imagen
       *[ink] Anotaciones de tinta
    } — { $count } — Alt+clic para excluir
weavero-bm-filter-kind-tip = { $kind ->
        [pin] Puntos fijados
        [page] Marcadores de página
        [text] Selecciones de texto
        [annotation] Anotaciones
        [item] Elementos
       *[link] Enlaces
    } — { $count } — Alt+clic para excluir

weavero-bm-page-name = { $anchor ->
        [bottom] Página { $page } (parte inferior)
       *[top] Página { $page }
    }
weavero-bm-library-fallback = Biblioteca { $id }
weavero-bm-unnamed = Marcador
weavero-bm-folder-unnamed = Carpeta
weavero-bm-folder-default-name = Nueva carpeta

weavero-bm-prompt-new-folder = Nueva carpeta
weavero-bm-prompt-new-subfolder = Nueva subcarpeta
weavero-bm-prompt-rename-folder = Renombrar carpeta
weavero-bm-prompt-new-bookmark = Nuevo marcador
weavero-bm-prompt-name = Nombre:

weavero-bm-delete-folder-title = Eliminar carpeta
weavero-bm-delete-folder-confirm = { $count ->
        [one] ¿Eliminar «{ $name }» y su { $count } entrada?
        [many] ¿Eliminar «{ $name }» y sus { $count } entradas?
       *[other] ¿Eliminar «{ $name }» y sus { $count } entradas?
    }

weavero-bm-sublabel-in = {" "}— en { $title }

weavero-bm-edit-title = Editar marcador
weavero-bm-edit-comment-caption = Comentario

# ---- Bookmarks, the library's dropdown (bookmarks.ts) ----
weavero-bm-add-bookmarks-tip = Añadir marcadores…
weavero-bm-new-folder-tip = Nueva carpeta…
weavero-bm-empty-library = Aún no hay marcadores. Use ＋ Añadir marcadores…
weavero-bm-folder-empty = (vacía)
weavero-bm-row-in-tip = { $label } — en { $title }
weavero-bm-missing-tip-library = El destino de este marcador ya no existe. Clic derecho → Eliminar marcador para quitarlo.
weavero-bm-missing-suffix = { $text } — el destino ya no existe

weavero-bm-edit-title-caption = Título
weavero-bm-edit-default-title = Título predeterminado:
weavero-bm-edit-reset-default = Restablecer el predeterminado
weavero-bm-add-link-title = Añadir marcador de enlace

# ---- Bookmarks, the reader's Bookmarks pane (reader-panels.ts) ----
weavero-bm-scope = { $scope ->
        [document] Documento
       *[library] Biblioteca
    }
weavero-bm-scope-tip = Clic: cambiar de ámbito. Ctrl+clic: combinar ambos ámbitos (mostrarlos juntos).

weavero-bm-section = { $section ->
        [local] Este documento
        [global] En otros lugares
       *[library] Global
    }
weavero-bm-empty-section = { $section ->
        [local] Haga clic derecho en la página o arrastre aquí una anotación.
        [global] Use + para añadir a marcadores un elemento, una colección o un enlace.
       *[library] Use + para añadir a marcadores un elemento, una colección, una biblioteca o una búsqueda guardada: aparecen aquí en todos los documentos.
    }
weavero-bm-add-tip = Añadir marcador
weavero-bm-new-folder-section-tip = Nueva carpeta en esta sección
weavero-bm-add-library-tip = Añadir marcador a la biblioteca
weavero-bm-new-folder-library-tip = Nueva carpeta en la biblioteca

weavero-bm-missing-tip-reader = El destino de este marcador ya no existe. Clic derecho → Eliminar para quitarlo.

weavero-bm-delete-selected-confirm = { $count ->
        [one] ¿Eliminar { $count } marcador seleccionado? Las carpetas se eliminan con su contenido.
        [many] ¿Eliminar { $count } marcadores seleccionados? Las carpetas se eliminan con su contenido.
       *[other] ¿Eliminar { $count } marcadores seleccionados? Las carpetas se eliminan con su contenido.
    }

weavero-bm-link-dialog-text = Texto
weavero-bm-link-dialog-apply = Aplicar

weavero-bm-hover-kind = { $kind ->
        [location] Ubicación
        [text] Texto seleccionado
        [collection] Colección
        [library] Biblioteca
        [search] Búsqueda guardada
        [missing] Elemento (no encontrado)
       *[item] Elemento
    }
weavero-bm-hover-page = Página { $page }
weavero-bm-hover-source = en: { $title }
weavero-bm-hover-expand = { $state ->
        [expanded] Contraer ▴
       *[collapsed] Expandir ▾
    }
weavero-bm-hover-meta = { $what ->
        [default] Predeterminado: { $value }
        [created] Creado: { $value }
       *[bookmarked] Añadido a marcadores: { $value }
    }

weavero-bm-note-pinned-page = Marcador fijado en la página { $page }. Arrastre la chincheta para ajustarlo.
weavero-bm-note-pinned = Marcador fijado. Arrastre la chincheta para ajustarlo.
weavero-bm-note-added-pin = Marcador añadido. Arrastre la chincheta para ajustarlo.
weavero-bm-note-added-selection = Marcador añadido a partir de la selección.
weavero-bm-note-text-not-located = No se ha podido localizar el texto del marcador.
weavero-bm-note-no-text-stayed = No hay texto ahí: el marcador se ha quedado donde estaba.
weavero-bm-note-copy-nothing = Nada que copiar: el marcador no tiene región de selección.
weavero-bm-note-copied-outline = { $count ->
        [one] Se ha copiado { $count } marcador al esquema.
        [many] Se han copiado { $count } marcadores al esquema.
       *[other] Se han copiado { $count } marcadores al esquema.
    }

weavero-menu-bm-add-bookmark-more =
    .label = Añadir marcador…
weavero-menu-bm-add-library-bookmark =
    .label = Añadir marcador de biblioteca…
weavero-menu-bm-thumb-add-pages =
    .label = { $count ->
        [one] Añadir esta página a marcadores
        [many] Añadir estas { $count } páginas a marcadores
       *[other] Añadir estas { $count } páginas a marcadores
    }

# ---- Reader panels, shared words (reader-panels.ts) ----
weavero-rpanel-selection-default = Selección
weavero-rpanel-pinned-spot = Punto fijado
weavero-rpanel-anchor = { $anchor ->
        [point] Punto fijado
        [bottom] Parte inferior de la página
       *[top] Parte superior de la página
    }
weavero-rpanel-page-short = p. { $page }
weavero-rpanel-pin-drag-tip = Arrastre para mover

weavero-rpanel-page-numbers = Números de página
weavero-rpanel-page-numbers-show = Mostrar
weavero-rpanel-page-numbers-hide = Ocultar
weavero-rpanel-sort-by = Ordenar por

weavero-rpanel-filter-clear = Borrar
    .title = Borrar todos los filtros (mantener esta ventana abierta)
    .aria-label = Borrar todos los filtros
weavero-rpanel-filter-clear-close = Borrar y cerrar

weavero-rpanel-note-select-text = Seleccione texto en el documento (Esc para cancelar).
weavero-rpanel-note-cancelled = Cancelado.
weavero-rpanel-note-drop-pin = Vaya a un punto y haga clic para colocar la chincheta (Esc para cancelar).
weavero-rpanel-note-pin-cancelled = Chincheta cancelada.
weavero-rpanel-note-no-text = No hay texto en ese punto.
weavero-rpanel-note-no-position = No se ha podido leer esa posición.
weavero-rpanel-note-rm-jump = Desactive el modo lectura para saltar a esta ubicación.

weavero-rpanel-ann-kind = { $type ->
        [highlight] Resaltado
        [underline] Subrayado
        [note] Nota
        [text] Anotación de texto
        [image] Anotación de imagen
        [ink] Anotación de tinta
       *[other] Anotación
    }

weavero-rpanel-dialog-name = Nombre
weavero-rpanel-dialog-reset-name = Restablecer
weavero-rpanel-dialog-position = Posición
weavero-rpanel-dialog-ok = Aceptar
weavero-rpanel-dialog-page = { $count ->
        [0] Página
       *[other] Página (1–{ $max })
    }
weavero-rpanel-dialog-default-name = Nombre predeterminado: { $name }

weavero-rpanel-layout-sidebar =
    .label = Barra lateral
weavero-rpanel-layout-outline =
    .label = Panel de esquema
weavero-rpanel-layout-context-pane =
    .label = Panel contextual
weavero-rpanel-layout-selector =
    .label = Selector de colores y etiquetas
weavero-rpanel-layout-menu =
    .label = Composición

weavero-rpanel-selector-handle-tip = { $state ->
        [folded-marked] Mostrar el selector de colores y etiquetas (hay una selección activa: filtra el panel y el documento)
        [folded] Mostrar el selector de colores y etiquetas
       *[open] Ocultar el selector de colores y etiquetas
    }

weavero-rpanel-thumb-copy-links =
    .label = { $count ->
        [one] Copiar enlace a esta página
        [many] Copiar enlaces a { $count } páginas
       *[other] Copiar enlaces a { $count } páginas
    }

# ---- Annotations pane: sort and dates (reader-panels.ts) ----
weavero-rpanel-ann-title = Anotaciones
weavero-rpanel-ann-sort-tip = Ordenación de anotaciones
weavero-rpanel-ann-sort-direction = Alternar el sentido de la ordenación
weavero-rpanel-ann-sort-field = { $field ->
        [position] Posición
        [dateAdded] Fecha de adición
        [dateModified] Fecha de modificación
        [manual] Manual
       *[other] { $field }
    }
weavero-rpanel-ann-sort-manual-row = Manual (arrastre para reordenar)
weavero-rpanel-ann-show-on-cards = Mostrar en las tarjetas
weavero-rpanel-ann-date-added = Añadida: { $date }
weavero-rpanel-ann-date-modified = Modificada: { $date }
weavero-rpanel-ann-date-added-full = Fecha de adición: { $date }
weavero-rpanel-ann-date-modified-full = Fecha de modificación: { $date }

# ---- Annotation filters: the reader's funnel and the annotations pane's (reader-panels.ts) ----
weavero-annfilter-toolbar-tip = Filtrar anotaciones
weavero-annfilter-popup-title = { $kind ->
        [list] Filtrar el panel de anotaciones
       *[reader] Filtrar anotaciones
    }
weavero-annfilter-empty = No hay anotaciones en este documento.

weavero-annfilter-pane-tip-head = Filtrar el panel de anotaciones (el documento conserva todas las anotaciones)
weavero-annfilter-pane-tip-state = { $state ->
        [departs] { $hidden ->
            [0] Este documento se aparta del predeterminado: se muestran todas las anotaciones
            [one] Este documento se aparta del predeterminado: oculta aquí { $hidden } anotación
           *[other] Este documento se aparta del predeterminado: oculta aquí { $hidden } anotaciones
        }
       *[default] { $hidden ->
            [0] Sigue el predeterminado: se muestran todas las anotaciones
            [one] Sigue el predeterminado: oculta aquí { $hidden } anotación
           *[other] Sigue el predeterminado: oculta aquí { $hidden } anotaciones
        }
    }

weavero-annfilter-clear-all = Borrar todo
    .title = Mostrar todas las anotaciones de este documento. Es una elección propia de este documento: el predeterminado sigue igual; Restablecer vuelve a seguirlo.
weavero-annfilter-reset = Restablecer
    .title = Volver al predeterminado
weavero-annfilter-back-close = Volver al predeterminado y cerrar

weavero-annfilter-count = { $hidden ->
        [0] Se muestran todas las anotaciones
        [one] { $hidden } de { $total } oculta en el panel
       *[other] { $hidden } de { $total } ocultas en el panel
    }
    .title = El documento sigue conteniendo todas las anotaciones; solo se filtra este panel.
weavero-annfilter-scope = { $scope ->
        [document] Solo este documento
       *[default] Predeterminado para todos los documentos
    }
    .title = { $scope ->
        [document] Este documento tiene su propio filtro; los demás documentos siguen el predeterminado.
       *[default] Este filtro es el predeterminado con el que empiezan todos los documentos.
    }
weavero-annfilter-default-note = { $all ->
        [yes] { $hidden ->
            [0] Predeterminado: todo · aquí no oculta ninguna
           *[other] Predeterminado: todo · aquí oculta { $hidden }
        }
       *[no] { $hidden ->
            [0] Predeterminado: { $parts } · aquí no oculta ninguna
           *[other] Predeterminado: { $parts } · aquí oculta { $hidden }
        }
    }
weavero-annfilter-default-note-tip = El filtro predeterminado, que este documento no usa:
weavero-annfilter-default-shows-everything = (muestra todo)
weavero-annfilter-default-note-reset = Restablecer lo aplica aquí.
weavero-annfilter-use-default = Usar como predeterminado
    .title =
        Hacer de este filtro, tal como está, el predeterminado para todos los documentos
        Alt+clic para AÑADIR sus chips al predeterminado existente en lugar de sustituirlo
weavero-annfilter-clear-default = Borrar el predeterminado
    .title = Volver a mostrar todas las anotaciones en todos los documentos (borra el predeterminado, no este documento)
weavero-annfilter-part-of-default = Forma parte del filtro predeterminado

weavero-annfilter-desc-not = no { $name }
weavero-annfilter-desc-person = { $who ->
        [added] añadida por { $name }
       *[modified] modificada por { $name }
    }
weavero-annfilter-flag = { $flag ->
        [comment] { $has ->
            [yes] Tiene comentario
           *[no] Sin comentario
        }
        [tag] { $has ->
            [yes] Tiene etiqueta
           *[no] Sin etiqueta
        }
        [related] { $has ->
            [yes] Tiene relacionados
           *[no] Sin relacionados
        }
        [link] { $has ->
            [yes] Tiene enlace externo
           *[no] Sin enlace externo
        }
        [itemLinks] { $has ->
            [yes] Tiene enlaces a elementos
           *[no] Sin enlaces a elementos
        }
       *[backlinks] { $has ->
            [yes] Tiene retroenlaces
           *[no] Sin retroenlaces
        }
    }
weavero-annfilter-unit-short = { $unit ->
        [m] min
        [h] h
        [y] a
       *[d] d
    }
weavero-annfilter-desc-date-last = { $field ->
        [added] { $neg ->
            [yes] Añadida: fuera de los últimos { $count } { weavero-annfilter-unit-short }
           *[no] Añadida: últimos { $count } { weavero-annfilter-unit-short }
        }
       *[modified] { $neg ->
            [yes] Modificada: fuera de los últimos { $count } { weavero-annfilter-unit-short }
           *[no] Modificada: últimos { $count } { weavero-annfilter-unit-short }
        }
    }
weavero-annfilter-desc-date-range = { $field ->
        [added] { $neg ->
            [yes] Añadida: fuera de { $from } a { $to }
           *[no] Añadida: de { $from } a { $to }
        }
       *[modified] { $neg ->
            [yes] Modificada: fuera de { $from } a { $to }
           *[no] Modificada: de { $from } a { $to }
        }
    }

weavero-annfilter-chip-tip = { $name } — Alt+clic para excluir
weavero-annfilter-color-black = Negro
weavero-annfilter-tag-tip = Etiqueta: { $tag } — Alt+clic para excluir
weavero-annfilter-tile-tip = { $tile ->
        [comment] Tiene comentario: anotaciones con un texto de comentario no vacío. Alt+clic para excluir.
        [tag] Tiene etiqueta: anotaciones con al menos una etiqueta. Alt+clic para excluir.
        [related] Tiene relacionados: anotaciones con al menos un enlace a un elemento relacionado. Alt+clic para excluir.
        [link] Tiene enlace externo: anotaciones cuyo comentario contiene un enlace que sale de Zotero (https://, mailto:, enlaces de aplicaciones); un enlace zotero:// corresponde a Tiene enlaces a elementos. Alt+clic para excluir.
        [itemLinks] Tiene enlaces a elementos: anotaciones cuyo comentario enlaza a otro elemento de Zotero. Alt+clic para excluir.
       *[backlinks] Tiene retroenlaces: anotaciones a las que enlaza otro comentario o nota. Alt+clic para excluir.
    }
weavero-annfilter-head = { $head ->
        [addedBy] Añadida por
        [modifiedBy] Modificada por
       *[date] Fecha
    }
weavero-annfilter-person-tip = { $who ->
        [added] Añadida por { $name } — Alt+clic para excluir
       *[modified] Modificada por { $name } — Alt+clic para excluir
    }

weavero-annfilter-date-field = { $field ->
        [added] Añadida
       *[modified] Modificada
    }
weavero-annfilter-unit = { $unit ->
        [m] minutos
        [h] horas
        [y] años
       *[d] días
    }
weavero-annfilter-date-last = Últimos
weavero-annfilter-date-last-tip = { $field ->
        [added] Añadida en los últimos N { weavero-annfilter-unit } — Alt+clic para excluir
       *[modified] Modificada en los últimos N { weavero-annfilter-unit } — Alt+clic para excluir
    }
weavero-annfilter-date-window-aria = { $field ->
        [added] Tamaño del intervalo de adición
       *[modified] Tamaño del intervalo de modificación
    }
weavero-annfilter-unit-tip = Unidad del intervalo
weavero-annfilter-date-custom = Personalizado
weavero-annfilter-date-custom-tip = { $field ->
        [added] Intervalo personalizado de fechas de adición — Alt+clic para excluir
       *[modified] Intervalo personalizado de fechas de modificación — Alt+clic para excluir
    }
weavero-annfilter-bound = { $bound ->
        [from] desde
       *[to] hasta
    }
weavero-annfilter-range-aria = { $field ->
        [added] { $bound ->
            [from] Intervalo de adición desde
           *[to] Intervalo de adición hasta
        }
       *[modified] { $bound ->
            [from] Intervalo de modificación desde
           *[to] Intervalo de modificación hasta
        }
    }
weavero-annfilter-cal-head = { $field ->
        [added] { $bound ->
            [from] Añadida — desde
           *[to] Añadida — hasta
        }
       *[modified] { $bound ->
            [from] Modificada — desde
           *[to] Modificada — hasta
        }
    }
weavero-annfilter-bound-invalid = { $bound ->
        [from] No se aplica: es posterior a la fecha «hasta»
       *[to] No se aplica: es anterior a la fecha «desde»
    }
weavero-annfilter-bound-applied = { $bound ->
        [from] Filtrando desde el { $date }
       *[to] Filtrando hasta el { $date }
    }
weavero-annfilter-bound-clear = { $bound ->
        [from] Borrar «desde»
       *[to] Borrar «hasta»
    }
weavero-annfilter-cal-conflict = Entraría en conflicto con el otro límite

weavero-annfilter-hide-reader = Ocultar las anotaciones en el lector
    .title = Ocultar las marcas de anotación en la vista del documento (la lista de la barra lateral no se ve afectada).

# ---- Outline: the reader's Outline pane (reader-panels.ts) ----
weavero-outline-title = Esquema
weavero-outline-entry-tip = Esquema (Weavero)
weavero-outline-add-tip = Añadir una nueva entrada al esquema
weavero-outline-source = { $source ->
        [embedded] Incrustado
        [weavero] Editado
        [zotero] Zotero
        [none] Ninguno
        [readingMode] Modo lectura
       *[extracted] Extraído
    }
weavero-outline-source-head = { $switch ->
        [yes] Origen del esquema (clic para cambiarlo):
       *[no] Origen del esquema:
    }
weavero-outline-source-meaning = { $source ->
        [embedded] el esquema guardado dentro del archivo del documento
        [weavero] su copia editada de este esquema
        [zotero] el esquema extraído por el propio Zotero, sin cambios
        [zoteroSame] el esquema extraído por el propio Zotero, sin cambios; la extracción de Weavero es idéntica para este PDF
        [embeddedSame] el esquema guardado dentro del archivo del documento; la extracción de Weavero es idéntica para este PDF
        [embeddedFirst] el esquema guardado dentro del archivo del documento; se muestra primero: la extracción de Weavero no coincide con él
        [none] no se encontró ningún esquema en este documento
        [readingMode] los encabezados del texto del modo lectura (solo en modo lectura)
       *[extracted] el esquema de Weavero, creado a partir de los datos de estructura de Zotero para este PDF
    }
weavero-outline-source-line = { $current ->
        [yes] ✓ { $label }: { $meaning }
       *[no] { $label }: { $meaning }
    }
weavero-outline-source-delete-hint = Clic derecho para eliminar el esquema editado.
weavero-outline-references = Referencias
weavero-outline-eval-tip = { $verdict ->
        [good] Evaluar la extracción de este esquema (herramienta de desarrollo): marcada como buena
        [bad] Evaluar la extracción de este esquema (herramienta de desarrollo): marcada como mala
        [scan] Evaluar la extracción de este esquema (herramienta de desarrollo): marcada como escaneo (sin capa de texto)
       *[none] Evaluar la extracción de este esquema (herramienta de desarrollo): sin marcar
    }

weavero-outline-empty = { $state ->
        [curated] Su esquema está vacío.
        [extracting] Extrayendo el esquema…
       *[none] No hay esquema para este documento.
    }
weavero-outline-empty-hint = Seleccione texto en el documento y luego clic derecho → { weavero-menu-reader-add-selection-outline.label }.
weavero-outline-create-button = Crear un esquema
    .title = Iniciar un esquema editable para este documento
weavero-outline-search-no-match = Ninguna entrada del esquema coincide con la búsqueda.

weavero-outline-row-tip = Doble clic para renombrar, clic derecho para más opciones
weavero-outline-kind-box-tip = Barra lateral / recuadro
weavero-outline-pin-title = Punto fijado de la página { $page }

weavero-outline-entries-tree = Árbol de entradas
weavero-outline-hint-dblclick = Doble clic, { $key }
weavero-outline-text-size = Tamaño del texto
weavero-outline-size = { $size ->
        [zotero] Esquema de Zotero
        [itemPane] Panel de elementos de Zotero
       *[fixed] Fijo
    }
weavero-outline-size-label = { $size ->
        [zotero] Esquema de Zotero, { $px } px
       *[itemPane] Panel de elementos de Zotero, { $px } px
    }

weavero-outline-reset-original-tip = { $exact ->
        [yes] El nombre y la región vuelven a los originales: «{ $name }».
       *[no] El nombre vuelve a «{ $name }»; la región se detecta de nuevo a partir de ese nombre.
    }

weavero-outline-revert-question = ¿Eliminar el esquema editado de este documento?
weavero-outline-revert-detail = { $accel ->
        [none] Su esquema editado ({ $what }) se elimina; Deshacer en esta pestaña lo recupera. El esquema propio del documento no cambia.
       *[other] Su esquema editado ({ $what }) se elimina; Deshacer ({ $accel }) en esta pestaña lo recupera. El esquema propio del documento no cambia.
    }
weavero-outline-revert-count = { $what ->
        [renamed] { $count } renombradas
        [added] { $count } añadidas por usted
       *[entries] { $count } entradas
    }

weavero-outline-prompt-new-title = Título de la nueva entrada del esquema:
weavero-outline-edit-position-title = Editar posición

weavero-outline-region-save-text = Guardar región y texto
weavero-outline-region-save = Guardar región
weavero-outline-note-region-editor = { $what ->
        [label] Arrastre las asas para cambiar la forma de la región: { weavero-outline-region-save-text } también recarga el rótulo; { weavero-outline-region-save } lo conserva. (Enter = { weavero-outline-region-save-text }, Esc = cancelar.)
       *[title] Arrastre las asas para cambiar la forma de la región: { weavero-outline-region-save-text } también recarga el título; { weavero-outline-region-save } lo conserva. (Enter = { weavero-outline-region-save-text }, Esc = cancelar.)
    }

weavero-outline-note-added-selection = Se ha añadido «{ $title }» a partir de la selección.
weavero-outline-note-added-selection-text = Se ha añadido «{ $title }» a partir de la selección ({ $text }).
weavero-outline-note-added-selection-plain = Se ha añadido «{ $title }» a partir de la selección.
weavero-outline-note-added-anchor = { $anchor ->
        [bottom] Se ha añadido «{ $title }» → parte inferior de la página { $page }.
       *[top] Se ha añadido «{ $title }» → parte superior de la página { $page }.
    }
weavero-outline-note-position = { $anchor ->
        [bottom] Posición: parte inferior de la página { $page }.
       *[top] Posición: parte superior de la página { $page }.
    }
weavero-outline-note-pinned = Fijado. Escriba su título (Enter para conservarlo); arrastre la chincheta para ajustarlo.
weavero-outline-note-target-pinned-page = Destino fijado en la página { $page }. Arrastre la chincheta para ajustarlo.
weavero-outline-note-target-pinned = Destino fijado. Arrastre la chincheta para ajustarlo.
weavero-outline-note-pin-saved = Posición de la chincheta guardada.
weavero-outline-note-target-selection = Destino establecido a partir de la selección.
weavero-outline-note-no-pin-rm = No se pueden colocar chinchetas en el modo lectura.
weavero-outline-note-anchor-pdf-only = Los anclajes de página solo son para PDF.
weavero-outline-note-pin-gone = El destino de esta chincheta ya no está en el documento: la página se ha representado de otra forma. Arrastre una nueva chincheta para volver a anclarla.
weavero-outline-note-entry-gone = El destino de esta entrada ya no está en el documento.
weavero-outline-note-rm-not-found = No se ha podido localizar esta entrada en el texto del modo lectura.
weavero-outline-note-rm-not-ready = La vista del modo lectura no está lista.
weavero-outline-note-rm-unmapped = No se ha podido trasladar esa selección al documento.
weavero-outline-note-text-not-found-doc = No se ha encontrado ese texto en el documento: la región no cambia.
weavero-outline-note-text-not-found-page = No se ha encontrado ese texto en la página: la región no cambia.
weavero-outline-note-no-anchor = No se ha podido anclar a ese texto.
weavero-outline-note-open-pdf-view = Abra la vista PDF para editar la región.
weavero-outline-note-no-selectable-text = Esta página no tiene texto seleccionable al que ajustarse.
weavero-outline-note-title-updated = Título actualizado. Para mover el resaltado en consecuencia, clic derecho → { weavero-menu-outline-redetect-region.label }.
weavero-outline-note-spacing-cleaned = { $count ->
        [one] Se ha corregido el espaciado de { $count } título.
        [many] Se ha corregido el espaciado de { $count } títulos.
       *[other] Se ha corregido el espaciado de { $count } títulos.
    }
weavero-outline-note-spacing-unchanged = No ha cambiado nada: si un título ya es correcto, use «{ weavero-menu-outline-spacing-correct.label }» para descartar el aviso.

weavero-outline-key-action = { $action ->
        [selection] Añadir el texto seleccionado al esquema
        [pin] Fijar un punto en el esquema
        [anchorTop] Añadir la parte superior de la página al esquema
       *[anchorBottom] Añadir la parte inferior de la página al esquema
    }
weavero-outline-key-space = Espacio
weavero-outline-key-owner = { $owner ->
        [hand] la herramienta de mano del lector (y el resaltado de Leer en voz alta)
        [select] la herramienta de selección del lector
        [read-aloud] Leer en voz alta (subrayado)
        [next-page] página siguiente
        [previous-page] página anterior
        [rotate] girar páginas
        [pdf-sidebar] la barra lateral del PDF
        [colors] los colores de anotación
        [navigation] la lectura y la navegación en el lector
        [text-selection] la selección de texto en el lector
        [annotation-tools] las herramientas de anotación del lector
        [back-forward] Atrás / Adelante en el lector
        [redo] Rehacer
        [find-previous] Buscar anterior
        [reopen-tab] Reabrir pestaña cerrada
        [select-all] Seleccionar todo
        [undo] Deshacer
        [find] Buscar
        [find-next] Buscar siguiente
        [print] Imprimir
        [copy] Copiar
        [cut] Cortar
        [paste] Pegar
        [close-tab] Cerrar pestaña
        [new-main-window] Nueva ventana principal
        [zoom-in] Ampliar zum
        [zoom-out] Reducir zum
        [reset-zoom] Restablecer zum
        [back] Atrás
        [forward] Adelante
        [next-tab] la pestaña siguiente
        [switch-tabs] el cambio de pestañas
       *[menu] un atajo de menú de Zotero
    }
weavero-outline-key-owner-zotero = el atajo «{ $command }» de Zotero (Ajustes → Avanzadas → Atajos)
weavero-outline-key-owner-menu-item = la entrada de menú «{ $label }»
weavero-outline-key-owner-action = «{ $label }»

# ---- Undo: steps and the History menu (bookmarks.ts, reader-panels.ts) ----
weavero-undo-outline-entries = { $action ->
        [add] { $count ->
            [one] Añadir entrada del esquema
           *[other] Añadir { $count } entradas del esquema
        }
        [delete] { $count ->
            [one] Eliminar entrada del esquema
           *[other] Eliminar { $count } entradas del esquema
        }
        [rename] { $count ->
            [one] Renombrar entrada del esquema
           *[other] Renombrar { $count } entradas del esquema
        }
        [move] { $count ->
            [one] Mover entrada del esquema
           *[other] Mover { $count } entradas del esquema
        }
       *[edit] { $count ->
            [one] Editar entrada del esquema
           *[other] Editar { $count } entradas del esquema
        }
    }
weavero-undo-outline-mixed = Editar esquema
weavero-undo-outline-create = Crear esquema editado
weavero-undo-outline-remove = Eliminar esquema editado
weavero-undo-bm-bookmarks = { $action ->
        [add] { $count ->
            [one] Añadir marcador
           *[other] Añadir { $count } marcadores
        }
        [delete] { $count ->
            [one] Eliminar marcador
           *[other] Eliminar { $count } marcadores
        }
        [rename] { $count ->
            [one] Renombrar marcador
           *[other] Renombrar { $count } marcadores
        }
        [move] { $count ->
            [one] Mover marcador
           *[other] Mover { $count } marcadores
        }
       *[edit] { $count ->
            [one] Editar marcador
           *[other] Editar { $count } marcadores
        }
    }
weavero-undo-bm-folders = { $action ->
        [add] { $count ->
            [one] Añadir carpeta
           *[other] Añadir { $count } carpetas
        }
        [delete] { $count ->
            [one] Eliminar carpeta
           *[other] Eliminar { $count } carpetas
        }
        [rename] { $count ->
            [one] Renombrar carpeta
           *[other] Renombrar { $count } carpetas
        }
        [move] { $count ->
            [one] Mover carpeta
           *[other] Mover { $count } carpetas
        }
       *[edit] { $count ->
            [one] Editar carpeta
           *[other] Editar { $count } carpetas
        }
    }
weavero-undo-bm-mixed = Editar marcadores

weavero-undo-ann-kind = { $type ->
        [highlight] { $count ->
            [one] anotación de resaltado
           *[other] anotaciones de resaltado
        }
        [underline] { $count ->
            [one] anotación de subrayado
           *[other] anotaciones de subrayado
        }
        [note] { $count ->
            [one] anotación de nota
           *[other] anotaciones de nota
        }
        [text] { $count ->
            [one] anotación de texto
           *[other] anotaciones de texto
        }
        [image] { $count ->
            [one] anotación de imagen
           *[other] anotaciones de imagen
        }
        [ink] { $count ->
            [one] anotación de tinta
           *[other] anotaciones de tinta
        }
       *[other] { $count ->
            [one] anotación
           *[other] anotaciones
        }
    }
weavero-undo-ann-step = { $action ->
        [add] { $count ->
            [one] Añadir { weavero-undo-ann-kind }
           *[other] Añadir { $count } { weavero-undo-ann-kind }
        }
        [delete] { $count ->
            [one] Eliminar { weavero-undo-ann-kind }
           *[other] Eliminar { $count } { weavero-undo-ann-kind }
        }
        [convert] { $count ->
            [one] Convertir { weavero-undo-ann-kind }
           *[other] Convertir { $count } { weavero-undo-ann-kind }
        }
        [merge] { $count ->
            [one] Fusionar { weavero-undo-ann-kind }
           *[other] Fusionar { $count } { weavero-undo-ann-kind }
        }
        [move] { $count ->
            [one] Mover { weavero-undo-ann-kind }
           *[other] Mover { $count } { weavero-undo-ann-kind }
        }
        [resize] { $count ->
            [one] Redimensionar { weavero-undo-ann-kind }
           *[other] Redimensionar { $count } { weavero-undo-ann-kind }
        }
       *[edit] { $count ->
            [one] Editar { weavero-undo-ann-kind }
           *[other] Editar { $count } { weavero-undo-ann-kind }
        }
    }
weavero-undo-ann-field = { $field ->
        [comment] comentario
        [tags] etiquetas
        [text] texto
        [pageNumber] número de página
        [fontSize] tamaño de fuente
       *[position] posición
    }
weavero-undo-ann-edit-field = { $count ->
        [one] Editar { weavero-undo-ann-field } de la { weavero-undo-ann-kind }
       *[other] Editar { weavero-undo-ann-field } de { $count } { weavero-undo-ann-kind }
    }
weavero-undo-ann-change-color = { $count ->
        [one] Cambiar el color de la { weavero-undo-ann-kind }
       *[other] Cambiar el color de { $count } { weavero-undo-ann-kind }
    }
weavero-undo-ann-change = Cambio de anotación

weavero-undo-plain = { $dir ->
        [undo] Deshacer
       *[redo] Rehacer
    }
weavero-undo-action = { $dir ->
        [undo] Deshacer { $label }
       *[redo] Rehacer { $label }
    }
weavero-undo-button-tip =
    { $action } ({ $accel })
    Clic derecho: historial

weavero-undo-note-done = { $dir ->
        [undo] Deshecho: { $label }
       *[redo] Rehecho: { $label }
    }
weavero-undo-note-stopped = { $dir ->
        [undo] { $done ->
            [0] Detenido: no se ha podido deshacer { $label }
           *[other] Detenido: no se ha podido deshacer { $label } ({ $done } hechos)
        }
       *[redo] { $done ->
            [0] Detenido: no se ha podido rehacer { $label }
           *[other] Detenido: no se ha podido rehacer { $label } ({ $done } hechos)
        }
    }
weavero-undo-note-steps = { $dir ->
        [undo] Deshechos: { $count } pasos
       *[redo] Rehechos: { $count } pasos
    }

weavero-undo-history = Historial
weavero-undo-history-list = { $dir ->
        [undo] Historial de deshacer
       *[redo] Historial de rehacer
    }
weavero-undo-stack = { $stack ->
        [reader] Anotaciones
        [bookmarks-lib] Marcadores (biblioteca)
        [bookmarks-doc] Marcadores (este documento)
       *[outline] Esquema
    }
weavero-undo-ago = { $unit ->
        [now] ahora mismo
        [min] hace { $count } min
        [h] hace { $count } h
       *[d] hace { $count } d
    }
weavero-undo-row-reach = { $dir ->
        [undo] { $count ->
            [0] Deshacer este paso
            [one] Deshacer este paso y { $count } más que lo acompaña
           *[other] Deshacer este paso y { $count } más que lo acompañan
        }
       *[redo] { $count ->
            [0] Rehacer este paso
            [one] Rehacer este paso y { $count } más que lo acompaña
           *[other] Rehacer este paso y { $count } más que lo acompañan
        }
    }
weavero-undo-row-tip =
    { $stack } — { $reach }
    Ctrl+clic o la casilla: marcarlo
weavero-undo-row-tip-plain =
    { $reach }
    Ctrl+clic o la casilla: marcarlo
weavero-undo-row-dependent = { $kind ->
        [reader] { $count ->
            [one] El paso de arriba cambió la misma anotación
           *[other] Los pasos de arriba cambiaron las mismas anotaciones
        }
       *[other] { $count ->
            [one] El paso de arriba modificó las mismas entradas
           *[other] Los pasos de arriba modificaron las mismas entradas
        }
    }
weavero-undo-tick-tip = { $state ->
        [auto] { $dir ->
            [undo] Necesario para su selección: se deshacen juntos
           *[redo] Necesario para su selección: se rehacen juntos
        }
        [on] Marcado
       *[off] { $dir ->
            [undo] Marcar para deshacer junto con otros
           *[redo] Marcar para rehacer junto con otros
        }
    }
weavero-undo-show-older = { $count ->
        [one] Mostrar { $count } paso anterior
        [many] Mostrar { $count } pasos anteriores
       *[other] Mostrar { $count } pasos anteriores
    }
weavero-undo-more = { $count } más
weavero-undo-run-selected = { $dir ->
        [undo] Deshacer { $count } seleccionados
       *[redo] Rehacer { $count } seleccionados
    }
weavero-undo-run-tip = { $dir ->
        [undo] Deshacer todos los pasos marcados, en orden
       *[redo] Rehacer todos los pasos marcados, en orden
    }

# ---- Reader: comment popup, badges, standalone reader windows (reader.ts) ----
weavero-reader-copy-url = Copiar
weavero-reader-copy-url-tip = Copiar la URL al portapapeles
weavero-reader-comment-extra-links = Enlaces adicionales en el comentario:

weavero-reader-open-comment-tip = Abrir el comentario

weavero-reader-am-add-comment = Añadir comentario…

weavero-reader-move-to-tab-tip = Mover este lector a una pestaña de la ventana principal de Zotero

weavero-reader-newtab = Nueva pestaña
weavero-reader-newtab-tip = Nueva pestaña: abrir un elemento de la biblioteca ({ $shortcut })

weavero-reader-tablist-settings = Ajustes del menú de pestañas
weavero-reader-tablist-filetype-tip = Filtrar las pestañas por tipo de archivo adjunto. Haga clic en la ventana emergente para filtrar, Alt+clic para excluir.

weavero-reader-window-minimize = Minimizar
weavero-reader-window-maximize = Maximizar
weavero-reader-window-restore = Restaurar
weavero-reader-window-close = Cerrar

weavero-reader-app-menu = Abrir el menú de la aplicación

weavero-reader-convert-last-main-window = Esta es la última ventana principal. Abra primero otra ventana principal y luego convierta esta.
weavero-reader-convert-no-documents = No hay pestañas de documentos que mover: una ventana del lector necesita al menos una pestaña abierta de PDF, EPUB o instantánea.

# ---- Related items popup in the reader (reader.ts) ----
weavero-related-add-label = Añadir elemento relacionado
weavero-related-add-tip = Añadir elemento relacionado…
weavero-related-empty = No hay elementos relacionados.
weavero-related-remove = Quitar
weavero-related-different-libraries = No se pueden relacionar elementos de bibliotecas diferentes.

# ---- Notes: note tabs in reader windows, link editor (reader.ts, note-editor.ts) ----
weavero-note-tab-fallback-title = Nota

weavero-note-link-edit-text = Texto
weavero-note-link-edit-url = URL
weavero-note-link-edit-apply = Aplicar

# ---- Note outline (note-nav.ts) ----
weavero-notenav-title = Esquema
weavero-notenav-filter = Filtrar encabezados
weavero-notenav-toggle = Alternar esquema
weavero-notenav-empty = No hay encabezados en esta nota.
weavero-notenav-no-match = Ningún encabezado coincide con la búsqueda.
weavero-notenav-heading-link-readonly = Esta nota es de solo lectura, así que su encabezado no puede recibir un ancla de enlace.
weavero-notenav-heading-missing = El encabezado al que apunta este enlace ya no está en la nota.

# ---- List All Tabs: libraries, filters, settings (tabs.ts) ----
weavero-tabs-tab-count = { $count ->
        [one] { $count } pestaña
        [many] { $count } pestañas
       *[other] { $count } pestañas
    }

weavero-tabs-annotation-count = { $count ->
        [one] { $count } anotación
        [many] { $count } anotaciones
       *[other] { $count } anotaciones
    }

weavero-tabs-library-other = Otras
weavero-tabs-library-fallback = Biblioteca { $id }
weavero-tabs-library-unnamed = Biblioteca
weavero-tabs-library-tick = Haga clic para filtrar por esta biblioteca, Alt+clic para excluirla. Vuelva a hacer clic para borrar.

weavero-tabs-filetype-button = Filtrar las pestañas por tipo de archivo adjunto. Haga clic en la ventana emergente para filtrar, Alt+clic para excluir.
weavero-tabs-settings-button = Ajustes del menú de pestañas
weavero-tabs-filter-clear = Borrar el filtro

weavero-tabs-filter-hint = Alt+clic para excluir
weavero-tabs-filter-clear-all = Borrar
    .title = Borrar todos los filtros de pestañas (mantener esta ventana abierta)
    .aria-label = Borrar todos los filtros de pestañas
weavero-tabs-filter-clear-close = Borrar y cerrar
weavero-tabs-filetype-option = { $type } — clic para incluir, Alt+clic para excluir.
weavero-tabs-filetype-note = Nota
weavero-tabs-library-chip = { $name } — clic para mostrar solo esta biblioteca, Alt+clic para excluirla.

weavero-tabs-settings-sort-by-library = Ordenar las pestañas por biblioteca
weavero-tabs-settings-annotation-count = Mostrar el número de anotaciones

# ---- Windows: names, Manage Window, rename (tabs.ts, sessions.ts) ----
weavero-window-default-name = Ventana { $number }
weavero-window-reader-default-name = Ventana del lector
weavero-window-reader-default-name-numbered = Ventana del lector { $number }
weavero-window-anchor-name = { $name } (ancla)
weavero-window-count = { $count ->
        [one] { $count } ventana
        [many] { $count } ventanas
       *[other] { $count } ventanas
    }

weavero-window-editor-title = Gestionar ventana
weavero-window-editor-kind = { $kind ->
        [reader] Ventana del lector
        [anchor] Ventana principal (ancla)
       *[main] Ventana principal
    }
weavero-window-editor-active = Activa
weavero-window-editor-name = Nombre
weavero-window-editor-reset = Usar el nombre predeterminado ({ $name })

weavero-window-rename-title = Renombrar ventana
weavero-window-rename-default-title = Renombrar
weavero-window-rename-ok = Aceptar

weavero-window-save-no-tabs = Esta ventana no tiene pestañas que guardar.
weavero-window-save-last-main = Esta es la última ventana principal: abra primero otra ventana principal y luego guarde esta.
weavero-window-save-no-documents = Esta ventana no tiene pestañas de documentos que guardar.
weavero-window-move-no-tabs = Esta ventana no tiene pestañas que mover.
weavero-window-move-last-main = Esta es la última ventana principal: no se puede mover a otra sesión.
weavero-window-move-no-documents = Esta ventana no tiene pestañas de documentos que mover.

# ---- Saved windows (tabs.ts) ----
weavero-savedwin-header = Ventanas guardadas
weavero-savedwin-reopen = Reabrir esta ventana guardada
weavero-savedwin-remove-tab = Quitar esta pestaña de la ventana guardada
weavero-savedwin-default-name = { $kind ->
        [reader] Ventana del lector
       *[main] Ventana
    }
weavero-savedwin-rename-title = Renombrar ventana guardada
weavero-savedwin-reopen-gone = Ya no existe ninguno de los documentos de esta ventana guardada.
weavero-savedwin-reopen-notes-only = Esta ventana guardada solo contiene notas: una ventana del lector necesita al menos una pestaña de documento.

# ---- Tab sessions (sessions.ts) ----
weavero-session-default-name = Sesión { $date }
weavero-session-unnamed = Sesión
weavero-session-dot = S

weavero-session-current = Sesión actual
weavero-session-current-tip = Clic derecho para renombrar esta sesión
weavero-session-created = Creada: { $date }
weavero-session-last-used = Último uso: { $date }

weavero-session-header = Sesiones
weavero-session-sort-button = Ordenar sesiones
weavero-session-sort-direction = { $order } (clic para invertir)
weavero-session-sort-order = { $order ->
        [oldest] Más antiguas primero
        [newest] Más recientes primero
        [az] De la A a la Z
        [za] De la Z a la A
        [leastRecent] Usadas hace más tiempo primero
        [mostRecent] Usadas más recientemente primero
        [ascending] Ascendente
       *[descending] Descendente
    }
weavero-session-new = Nueva sesión
    .title = Abrir un espacio de trabajo nuevo y vacío como nueva sesión (la sesión actual queda guardada abajo)
weavero-session-row-current = Sesión actual: se actualiza automáticamente al abrir y cerrar pestañas
weavero-session-row-switch = Cambiar a esta sesión
weavero-session-twisty = { $state ->
        [expanded] Contraer
       *[collapsed] Mostrar pestañas
    }
weavero-session-untitled = Sesión sin título
weavero-session-date-line = { $sort ->
        [created] Creada: { $date }
       *[lastUsed] Último uso: { $date }
    }
weavero-session-tab-untitled = Sin título
weavero-session-auto-tag = automática

weavero-session-rename-title = Renombrar sesión
weavero-session-rename-label = Nombre de la sesión:
weavero-session-delete-title = Eliminar sesión
weavero-session-delete-confirm = ¿Eliminar la sesión guardada «{ $name }»?
weavero-session-remove-window-confirm = { $count ->
        [one] ¿Quitar esta ventana ({ $count } pestaña) de «{ $name }»?
        [many] ¿Quitar esta ventana ({ $count } pestañas) de «{ $name }»?
       *[other] ¿Quitar esta ventana ({ $count } pestañas) de «{ $name }»?
    }

# ---- Tab groups (tab-groups.ts) ----
weavero-tabgroup-move-new-reader-window = Mover a una nueva ventana del lector
weavero-tabgroup-move-new-group-reader-window = Mover a un nuevo grupo en una nueva ventana del lector
weavero-tabgroup-move-new-main-window = Mover a una nueva ventana principal
weavero-tabgroup-move-new-group-main-window = Mover a un nuevo grupo en una nueva ventana principal
weavero-tabgroup-new-reader-window = Nueva ventana del lector
weavero-tabgroup-new-main-window = Nueva ventana principal
weavero-tabgroup-unnamed-short = Grupo
weavero-tabgroup-unnamed = Grupo sin nombre

weavero-tabgroup-rename-title = Renombrar grupo de pestañas
weavero-tabgroup-rename-placeholder = Nombre del grupo
weavero-tabgroup-name-placeholder = Ejemplo: Revisión bibliográfica
weavero-tabgroup-status = { $state ->
        [active] Activo
       *[saved] Guardado
    }
weavero-tabgroup-home-window = en { $name }
weavero-tabgroup-color = { $color ->
        [purple] púrpura
        [cyan] cian
        [orange] naranja
        [yellow] amarillo
        [pink] rosa
        [green] verde
        [gray] gris
        [red] rojo
       *[blue] azul
    }

weavero-tabgroup-saved-header = Grupos de pestañas guardados
weavero-tabgroup-reopen = Reabrir este grupo guardado

## ---- Added at the merge of refs, l10n and notecite into main (2026-11-20):
## references in your library, the split corner's Close Tab, the default
## attachment's marks, citations after Zotero links in notes.

weavero-pref-relations-references =
    .label = Marcar en las ventanas de citas de un PDF las referencias que tiene
weavero-pref-relations-references-desc = Al pasar el puntero sobre una cita en el texto, Zotero enumera las referencias a las que remite. Cada referencia que es un elemento de una de sus bibliotecas recibe una marca (● con un PDF, ○ sin él) y botones para abrir su PDF en una nueva pestaña, en una nueva ventana o junto al artículo que está leyendo (vista dividida: ese artículo queda bloqueado en su lado). ⋯ la muestra en la biblioteca, abre su copia en otra biblioteca o copia su enlace. Las referencias se encuentran por DOI, por título o por volumen y primera página, solo en las bibliotecas de este equipo: nada sale a internet y no se cambia nada en sus bibliotecas.
weavero-pref-relations-references-marks =
    .label = Marcar las entradas de la lista de referencias
weavero-pref-relations-references-marks-desc = Una pequeña marca en el margen junto a cada entrada de la lista de referencias del artículo que tenga; haga clic en ella para abrir la referencia, mostrarla en la biblioteca o copiar su enlace. No se muestra en el modo lectura.
weavero-pref-relations-references-section =
    .label = Sección «Referencias» en el panel de elementos del lector
weavero-pref-relations-references-section-desc = La lista de referencias del artículo, en el orden del documento, con las mismas marcas y botones, y cuántas de sus referencias tiene; muéstrela entera o solo lo que tiene. Haga clic en una referencia para verla en el PDF.
weavero-pref-relations-references-citedby =
    .label = Sección «Citado por» en el panel de elementos
weavero-pref-relations-references-citedby-desc = Los artículos de sus bibliotecas cuya lista de referencias cita el elemento, con cuántos son. Weavero lee las listas de referencias de sus PDF en segundo plano, a partir de lo que Zotero guarda junto a cada PDF (su índice de texto completo y la estructura de los PDF que abrió en el lector de Zotero). Haga clic en un artículo para abrirlo en su referencia al elemento. Nada pasa por Internet y nada se modifica en sus bibliotecas.
# Build Zotero's structure data for all PDFs (modules/sdt-build.ts, citations M5).
weavero-pref-relations-references-sdt-build =
    .label = Crear los datos de estructura de Zotero para todos los PDF
weavero-pref-relations-references-sdt-build-desc = Zotero crea los datos de estructura de un PDF, incluida su lista de referencias, cuando abre el PDF en su lector. Esta opción hace que Zotero los cree para cada PDF de sus bibliotecas en segundo plano, de uno en uno, los añadidos más recientemente primero, para que Referencias y Citado por lean las listas precisas. Solo se hace mientras no usa el ordenador, y lo que abre nunca lo espera. Desactivada por defecto: en una biblioteca grande requiere horas de trabajo, repartidas en los momentos en que no está, y algo de espacio en disco, que verá antes de empezar.
weavero-sdt-build-warn-title = ¿Crear los datos de estructura de todos sus PDF?
weavero-sdt-build-warn-intro =
    { $count ->
        [0] Todos los PDF de sus bibliotecas ya tienen sus datos de estructura. Zotero los creará para los PDF que añada, de uno en uno.
        [one] Zotero creará los datos de estructura de { $count } PDF que aún no los tiene, como si lo abriera una vez en el lector de Zotero.
       *[other] Zotero creará los datos de estructura de los { $count } PDF que aún no los tienen, como si abriera cada uno una vez en el lector de Zotero: de uno en uno, los añadidos más recientemente primero.
    }
weavero-sdt-build-warn-time = Tiempo: aproximadamente { $time } de trabajo en segundo plano. Solo se hace mientras no usa el ordenador (un minuto sin teclado ni ratón), así que se reparte en esos momentos; un núcleo del procesador está ocupado mientras se hace. Lo que abre en Zotero nunca lo espera. Continúa tras un reinicio.
weavero-sdt-build-warn-disk = Disco: unos { $disk } más, en un archivo junto a cada PDF.
weavero-sdt-build-warn-sync = No se sincroniza ni se sube nada: cada ordenador crea los suyos.
weavero-sdt-build-warn-cache = Es la propia caché de Zotero (.zotero-sdt-cache), la misma que si abriera cada PDF una vez. Los archivos se pueden borrar en cualquier momento; Zotero vuelve a crear uno cuando abre ese PDF.
weavero-sdt-build-warn-ok = Crear
weavero-sdt-build-dur =
    { $unit ->
        [minutes] { $lo }–{ $hi } minutos
        [days] { $lo }–{ $hi } días
       *[hours] { $lo }–{ $hi } horas
    }
weavero-sdt-build-dur-one =
    { $unit ->
        [minutes] { $n ->
            [0] { $n } minutos
            [one] { $n } minuto
           *[other] { $n } minutos
        }
        [days] { $n ->
            [0] { $n } días
            [one] { $n } día
           *[other] { $n } días
        }
       *[hours] { $n ->
            [0] { $n } horas
            [one] { $n } hora
           *[other] { $n } horas
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
weavero-sdt-build-status-counting = Contando sus PDF: { $done } de { $total }…
weavero-sdt-build-status-run =
    { $wait ->
        [reader] Esperando mientras se abre un PDF: { $done } de { $total } PDF, quedan aproximadamente { $left }.
        [busy] Esperando mientras Zotero lee otro PDF: { $done } de { $total } PDF, quedan aproximadamente { $left }.
        [memory] Esperando mientras hay poca memoria: { $done } de { $total } PDF, quedan aproximadamente { $left }.
        [active] Esperando mientras usa el ordenador: { $done } de { $total } PDF, quedan aproximadamente { $left }.
       *[none] Creando: { $done } de { $total } PDF, quedan aproximadamente { $left }.
    }
weavero-sdt-build-status-start = Esperando para empezar.
weavero-sdt-build-status-paused = En pausa.
weavero-sdt-build-status-done =
    { $failed ->
        [0] Terminado: cada PDF tiene sus datos de estructura.
       *[other] Terminado: cada PDF tiene sus datos de estructura, salvo { $failed } que Zotero no pudo leer.
    }
weavero-sdt-build-status-zotero = Zotero crea por sí mismo los datos de estructura de sus PDF.
weavero-sdt-build-pause = Pausa
weavero-sdt-build-resume = Reanudar
weavero-sdt-build-stop = Detener
# Remove Built Data (modules/sdt-build.ts): see en-US.
weavero-pref-relations-references-sdt-clean-desc = Los datos de estructura que Zotero guarda junto a sus documentos y las cachés que Weavero crea a partir de sus bibliotecas, entre ellas el índice «Citado por», ocupan espacio en disco. Eliminarlos no hace perder nada: se vuelven a crear cuando hacen falta. Sus propios datos se quedan como están.
weavero-sdt-clean-measuring = Midiendo los datos creados…
weavero-sdt-clean-size =
    { $index ->
        [yes] { $count ->
            [0] Datos creados: { $size }, el índice «Citado por».
            [1] Datos creados: { $size }, los datos de estructura de { $count } documento y el índice «Citado por».
           *[other] Datos creados: { $size }, los datos de estructura de { $count } documentos y el índice «Citado por».
        }
       *[no] { $count ->
            [0] Datos creados: { $size }.
            [1] Datos creados: { $size }, los datos de estructura de { $count } documento.
           *[other] Datos creados: { $size }, los datos de estructura de { $count } documentos.
        }
    }
weavero-sdt-clean-button = Eliminar los datos creados…
weavero-sdt-clean-running = Eliminando los datos creados: { $done } de { $total } documentos…
weavero-sdt-clean-done =
    { $count ->
        [0] Datos creados eliminados: { $size }.
        [1] Datos creados eliminados: { $size }, incluidos los datos de estructura de { $count } documento.
       *[other] Datos creados eliminados: { $size }, incluidos los datos de estructura de { $count } documentos.
    }
weavero-sdt-clean-done-failed =
    { $failed ->
        [1] Datos creados eliminados: { $size }. { $failed } archivo no se pudo eliminar: puede que otro programa lo esté usando. Vuelva a intentarlo más tarde.
       *[other] Datos creados eliminados: { $size }. { $failed } archivos no se pudieron eliminar: puede que otro programa los esté usando. Vuelva a intentarlo más tarde.
    }
weavero-sdt-clean-warn-title = ¿Eliminar los datos creados?
weavero-sdt-clean-warn-intro =
    { $count ->
        [0] Se eliminarán { $size } de datos creados a partir de sus bibliotecas: las cachés de Weavero, incluido el índice «Citado por».
        [1] Se eliminarán { $size } de datos creados a partir de sus bibliotecas: los datos de estructura de { $count } documento (el propio archivo .zotero-sdt-cache de Zotero) y las cachés que Weavero creó a partir de ellos, incluido el índice «Citado por».
       *[other] Se eliminarán { $size } de datos creados a partir de sus bibliotecas: los datos de estructura de { $count } documentos (los propios archivos .zotero-sdt-cache de Zotero) y las cachés que Weavero creó a partir de ellos, incluido el índice «Citado por».
    }
weavero-sdt-clean-warn-back = No se pierde nada: Zotero vuelve a crear los datos de estructura de un documento cuando lo abre en su lector, o para cada PDF con «Crear los datos de estructura de Zotero para todos los PDF», y Citado por vuelve a crear su índice en segundo plano.
weavero-sdt-clean-warn-off = Se desactiva «Crear los datos de estructura de Zotero para todos los PDF».
weavero-sdt-clean-warn-kept = Sus propios datos se quedan como están: los esquemas que editó, los marcadores, los grupos de pestañas y las sesiones, los Investigadores y la configuración de los canales.
weavero-sdt-clean-warn-ok = Eliminar
weavero-menu-split-close-tab =
    .label = Cerrar pestaña
weavero-refs-act-tab =
    .title = Abrir en una nueva pestaña
weavero-refs-act-window =
    .title = Abrir en una nueva ventana
weavero-refs-act-split =
    .title = Abrir en vista dividida
weavero-refs-act-library =
    .title = Mostrar en la biblioteca
weavero-refs-act-more =
    .title = Más
weavero-menu-refs-show-in =
    .label = Mostrar en { $library }
weavero-refs-bibmark =
    .title = { $where ->
        [other] { $others ->
            [0] Solo en { $library }
            [1] Solo en { $library } y en otra biblioteca
           *[other] Solo en { $library } y en { $others } bibliotecas más
        }
       *[here] En su biblioteca ({ $library })
    }, { $pdf ->
        [yes] { $file ->
            [epub] con un EPUB
           *[pdf] con un PDF
        }.{ "\u000A" }Haga clic para ver sus detalles y dónde abrirla.
       *[no] sin PDF.{ "\u000A" }Haga clic para ver sus detalles.
    }
weavero-menu-refs-open-short =
    .label = { $where ->
        [window] Abrir en una nueva ventana
        [split] Abrir en vista dividida
       *[tab] Abrir en una nueva pestaña
    }{ $from ->
        [other] { " (" }{ $library })
       *[here] { "" }
    }
weavero-menu-refs-children =
    .label = Adjuntos y notas
weavero-menu-refs-attachments =
    .label = { $count ->
        [one] Adjunto
       *[other] Adjuntos
    }
weavero-menu-refs-notes =
    .label = { $count ->
        [one] Nota
       *[other] Notas
    }
weavero-refs-att-missing = Archivo no encontrado
weavero-refs-header =
    .label = { $state ->
        [counted] { $total ->
            [one] { $total } Referencia
           *[other] { $total } Referencias
        }
       *[none] Referencias
    }
weavero-refs-sidenav =
    .tooltiptext = Referencias
weavero-refs-sec-fulltext = Del texto completo del PDF. Abra el PDF para obtener la lista exacta.
weavero-refs-web-tip =
    .title = { $how ->
        [link] No está en sus bibliotecas.{ "\u000A" }Haga clic para abrirla en su navegador: { $url }
       *[lookup] No está en sus bibliotecas.{ "\u000A" }Haga clic para buscarla en línea (Crossref o, si no, una búsqueda en Google Académico).
    }
weavero-citedby-header =
    .label = { $state ->
        [counted] { $count ->
            [one] { $count } artículo que lo cita
           *[other] { $count } artículos que lo citan
        }
       *[none] Citado por
    }
weavero-citedby-sidenav =
    .tooltiptext = Citado por
weavero-citedby-row = { $title }
    Haga clic para abrir este artículo en su referencia al elemento.
weavero-citedby-building = Leyendo todavía las listas de referencias de sus PDF: { $done } de { $total }…
weavero-citedby-more = Mostrar { $count } más
weavero-citedby-also = también en { $libraries }
weavero-citedby-also-label = También en
weavero-lf-toggle =
    .tooltiptext = Buscar
weavero-lf-filter-toggle =
    .tooltiptext = Ordenar y filtrar
weavero-lf-placeholder =
    .placeholder = { $kind ->
        [references] { $count ->
            [one] Buscar en { $count } referencia…
           *[other] Buscar en { $count } referencias…
        }
        [citedBy] { $count ->
            [one] Buscar en { $count } artículo…
           *[other] Buscar en { $count } artículos…
        }
       *[other] Buscar en { $count } filas…
    }
weavero-lf-count = { $shown } de { $total }
weavero-lf-busy = Filtrando…
weavero-lf-sort-short = { $field ->
        [paper] Orden del artículo
        [year] Año
        [cited] Veces citado
        [title] Título
        [author] Primer autor
       *[added] Fecha de adición
    }
weavero-lf-sort-button =
    .title = Orden
weavero-lf-sort-heading =
    .label = Ordenar por
weavero-lf-sort =
    .label = { $field ->
        [paper] Orden en el artículo
        [year] Año
        [cited] Veces citado en sus bibliotecas
        [title] Título
        [author] Primer autor
       *[added] Fecha de adición
    }
weavero-lf-sort-dir =
    .title = { $order ->
        [newest] Más recientes primero
        [oldest] Más antiguos primero
        [most] Más citados primero
        [least] Menos citados primero
        [az] De la A a la Z
       *[za] De la Z a la A
    }
weavero-lf-chip = { $chip ->
        [since] Desde { $year }
        [pdf] Con PDF
        [in] En la biblioteca
       *[out] Fuera de la biblioteca
    }
weavero-lf-chip-tip =
    .title = { $on ->
        [yes] Haga clic para volver a mostrar todo
       *[no] Haga clic para mostrar solo estos
    }
weavero-lf-none = { $kind ->
        [references] Ninguna referencia coincide con el filtro.
        [citedBy] Ningún artículo coincide con el filtro.
       *[other] Nada coincide con el filtro.
    }
weavero-refs-chip =
    .title = { $kind ->
        [pdf] En su biblioteca, con un PDF o un EPUB: { $count }
        [nopdf] En su biblioteca, sin PDF: { $count }
        [away] Solo en una biblioteca distinta de la de este artículo: { $count }
       *[web] No están en sus bibliotecas: { $count }
    }
weavero-refs-act-web-busy =
    .title = Buscando la referencia en línea…
weavero-menu-refs-web =
    .label = Abrir en el navegador
weavero-refs-card-et-al = et al.
weavero-refs-card-library = { $where ->
        [other] Solo en { $library }
       *[here] En { $library }
    }
weavero-refs-card-library-more = { $where ->
        [other] Solo en { $library } y en { $others }
       *[here] En { $library } y en { $others }
    }
weavero-refs-card-library-others = { $count } bibliotecas más
weavero-refs-libname = “{ $name }”
weavero-refs-uncertain = Varios elementos de sus bibliotecas podrían ser esta referencia; Weavero muestra el primero:
weavero-refs-uncertain-item = { $year ->
        [none] “{ $title }” ({ $type })
       *[other] “{ $title }” ({ $type }, { $year })
    }
weavero-refs-card-more = Más
weavero-refs-card-less = Menos
weavero-refs-card-image =
    .title = { $title }: haga clic para abrir
weavero-defatt-mark-pick =
    .title = Adjunto predeterminado: se abre con doble clic
weavero-defatt-mark-auto =
    .title = Elección automática: lo que Zotero abre cuando no hay ningún adjunto predeterminado
weavero-pref-notes-citations =
    .label = Citas tras los enlaces de Zotero en las notas
weavero-pref-notes-citations-desc = Haga clic derecho en un enlace <code data-l10n-name="scheme">zotero://</code> de una nota y elija <em>Añadir cita tras el enlace</em>: el enlace se queda y lo sigue la propia cita de Zotero del elemento. Un enlace a una página de un PDF cita el elemento contenedor del PDF en esa página (la página impresa de una anotación que haya en ella, si la hay); un enlace a un resaltado o subrayado añade su texto y su cita, como cuando arrastra la anotación a la nota. <em>Añadir citas tras los enlaces de la selección</em> y <em>Añadir citas tras todos los enlaces</em> procesan varios a la vez; un solo Deshacer las retira todas. Las citas son las de Zotero: se sincronizan y se leen igual sin Weavero. Los enlaces a notas, a archivos sin elemento contenedor y a otra biblioteca se quedan como están. Requiere <em>Enlaces y relaciones → Notas: Editor de notas</em>.
weavero-menu-note-cite-link =
    .label = Añadir cita tras el enlace
weavero-menu-note-cite-sel =
    .label = Añadir citas tras los enlaces de la selección ({ $n })
weavero-menu-note-cite-all =
    .label = Añadir citas tras todos los enlaces ({ $n })
weavero-note-cite-why-readonly = Esta nota es de solo lectura.
weavero-note-cite-why-noitem = Este enlace no remite a ningún elemento.
weavero-note-cite-why-note = Una nota no se puede citar.
weavero-note-cite-why-nolibrary = La biblioteca enlazada no está en este Zotero.
weavero-note-cite-why-otherlibrary = Una nota solo cita elementos de su propia biblioteca, como «Añadir cita» de Zotero.
weavero-note-cite-why-missing = El elemento enlazado no está en la biblioteca.
weavero-note-cite-why-noparent = Un archivo sin elemento contenedor no se puede citar.
weavero-note-cite-why-notcitable = Este elemento no se puede citar.
weavero-note-cite-why-cited = Ya citado justo después del enlace.

## Canales (modules/feeds.ts): columna Relevancia, sección «Por qué es relevante»,
## marca y filtro «en su biblioteca», Ajustes -> Weavero -> Canales.

weavero-feeds-col = Relevancia
weavero-feeds-libcol = En la biblioteca
weavero-feeds-header =
    .label = Por qué es relevante
weavero-feeds-sidenav =
    .tooltiptext = Por qué es relevante
weavero-feeds-inlib-tip = Ya está en su biblioteca
weavero-feeds-inlib = Ya está en su biblioteca
weavero-feeds-card-tip = Ya está en { $library } — haga clic para ver su ficha
weavero-feeds-score = Relevancia { $score }
weavero-feeds-scoring = Aún sin puntuar…
weavero-feeds-related = Relacionados, en su biblioteca
weavero-feeds-reason-lib = { $count ->
        [0] Cercano a artículos de su biblioteca
        [one] Cercano a { $count } artículo de su biblioteca
       *[other] Cercano a { $count } artículos de su biblioteca
    }
weavero-feeds-reason-near-row = { $level ->
        [strong] Muy cercano a un artículo de su biblioteca
        [moderate] Cercano a un artículo de su biblioteca
       *[weak] Algo relacionado con un artículo de su biblioteca
    }
weavero-feeds-reason-own-row = Cercano a uno de sus artículos
weavero-feeds-reltag-near = { $level ->
        [strong] Muy cercano
        [moderate] Cercano
       *[weak] Algo relacionado
    }
weavero-feeds-reltag-own = Su artículo
weavero-feeds-relscore-tip = Cercanía del texto a este elemento del canal (0 a 99)
weavero-feeds-reason-author = Autores presentes en su biblioteca: { $names }
weavero-feeds-reason-followed = Autor seguido: { $names }
weavero-feeds-reason-alert = Alerta: { $queries }
weavero-feeds-reason-journal = { $count ->
        [one] Una revista que lee: { $journal } ({ $count } artículo)
       *[other] Una revista que lee: { $journal } ({ $count } artículos)
    }
weavero-ga-header =
    .label = Resumen gráfico
weavero-ga-sidenav =
    .tooltiptext = Resumen gráfico
weavero-ga-failed = No se pudo cargar la imagen.
weavero-ga-open =
    .title = Haga clic para ver la imagen a tamaño completo
weavero-ga-close =
    .title = Haga clic o pulse Esc para cerrar
weavero-filter-dim-feed-not-in-library = No está en su biblioteca
weavero-filter-feed-not-in-library-tip = No está en su biblioteca: elementos de canal que aún no contiene ninguna de sus bibliotecas (mismo DOI o, si no, mismo título). Haga clic para ocultar los que ya tiene. Alt+clic para mostrar solo esos.
weavero-pref-nav-feeds = Canales
weavero-pref-feeds-title = Canales
weavero-pref-feeds-enable =
    .aria-label = Activar la relevancia en los canales
weavero-pref-feeds-desc = Una puntuación de relevancia para cada elemento de sus canales de Zotero, calculada en su ordenador a partir de sus bibliotecas: cercanía a sus propios artículos y a su biblioteca, autores de los que ya tiene artículos, los autores que sigue, sus alertas de palabras clave, las revistas que más lee y, para un canal que trae sus propias puntuaciones, la puntuación y los motivos del propio canal. Una columna Relevancia ordena los canales de más a menos relevante (las demás columnas también los ordenan), una sección «Por qué es relevante» en el panel del elemento da los motivos y los artículos relacionados de su biblioteca, y los elementos que ya tiene quedan marcados. Una sección «Resumen gráfico» muestra por separado la imagen de un elemento del canal. Las puntuaciones se calculan sin Internet y no se modifica nada en sus bibliotecas; solo la imagen de un elemento del canal se carga desde su editorial al seleccionar el elemento, como lo hace el Resumen de Zotero.
weavero-pref-feeds-names-title = Su nombre como autor
weavero-pref-feeds-names-desc = Un nombre por línea, como «Apellido, Nombre» o «Apellido, N.» (bastan las iniciales). Los elementos de Mi biblioteca que tienen uno de estos nombres entre sus autores son sus artículos.
weavero-pref-feeds-names-count = { $count ->
        [0] Ningún elemento de Mi biblioteca tiene uno de estos nombres como autor.
        [one] { $count } elemento de Mi biblioteca tiene uno de estos nombres como autor.
       *[other] { $count } elementos de Mi biblioteca tienen uno de estos nombres como autor.
    }
weavero-pref-feeds-followed-title = Autores seguidos
weavero-pref-feeds-followed-desc = Un nombre por línea. Un elemento de canal de uno de ellos recibe una puntuación más alta.
weavero-pref-feeds-alerts-title = Alertas de palabras clave
weavero-pref-feeds-alerts-desc = Una alerta por línea, buscada en el título y el resumen: cada palabra debe estar («bubble» también encuentra «bubbles»), una expresión entre comillas debe estar tal como está escrita y una palabra precedida de un signo menos (-review) no debe estar.
weavero-pref-feeds-watched-title = Artículos vigilados
weavero-pref-feeds-watched-desc = Un título o un DOI por línea. Se escriben en el archivo de alertas (abajo), para una herramienta que busca los artículos nuevos que los citan.
weavero-pref-feeds-cited-title = Alertas de citas de una persona
weavero-pref-feeds-cited-desc = Un nombre por línea. Se escriben en el archivo de alertas (abajo), para una herramienta que busca los artículos nuevos que citan a esta persona.
weavero-pref-feeds-journals =
    .label = Las revistas que más lee cuentan en la puntuación
weavero-pref-feeds-journals-desc = Un elemento de canal de una revista con muchos artículos en sus bibliotecas recibe una puntuación más alta.
weavero-pref-feeds-export-title = Archivo de alertas
weavero-pref-feeds-export-desc = «Exportar archivo de alertas» escribe estas listas en la carpeta de datos de Weavero (feeds/alerts.json), como un archivo JSON que una herramienta de recomendación puede leer; «Exportar…» las escribe donde usted elija. Escritas sobre un archivo de alertas existente, se conserva lo que su herramienta encontró para una entrada (sus identificadores de OpenAlex). «Importar…» lee una lista de alertas de Google Scholar, o un archivo de alertas, y añade a estas listas sus autores seguidos, artículos vigilados, alertas de citas y alertas de palabras clave.
weavero-pref-feeds-export = Exportar archivo de alertas
weavero-pref-feeds-export-as = Exportar…
weavero-pref-feeds-import = Importar…
weavero-feeds-export-as-title = Exportar archivo de alertas
weavero-feeds-import-title = Importar alertas de Google Scholar
weavero-pref-feeds-exported = Escrito: { $path }
weavero-pref-feeds-imported = { $count ->
        [0] Nada nuevo que añadir.
        [one] { $count } entrada añadida.
       *[other] { $count } entradas añadidas.
    }
weavero-pref-feeds-failed = No ha funcionado: { $error }

weavero-panelock-button-unlock =
    .tooltiptext = Desbloquear
    .aria-label = Desbloquear
weavero-panelock-menu-lock-top =
    .label = Bloquear arriba
weavero-panelock-menu-lock =
    .label = Bloquear abajo
weavero-panelock-menu-unlock =
    .label = Desbloquear

weavero-people-tab-title = Investigadores
weavero-people-menu-show =
    .label = Mostrar investigador
weavero-people-cmark-tip = { $name } está en Investigadores. Haga clic para abrir su página.
weavero-people-cmark-tip-maybe = Probablemente { $name }, en Investigadores (mismo apellido, mismas iniciales). Haga clic para abrir su página.
weavero-people-tb-hide =
    .label = Ocultar el botón Investigadores
weavero-people-menu-add =
    .label = Añadir investigador
weavero-people-search =
    .placeholder = Buscar
weavero-people-chip-check = Por revisar
weavero-people-chip-followed = Seguidas
weavero-people-chip-all = Todas
weavero-people-list-empty = Todavía nadie. Añada un investigador desde los autores de un elemento (clic derecho en un autor de la sección Info), o construya la lista a partir de los autores que sigue.
weavero-people-list-none = Nadie coincide.
weavero-people-build = Construir desde los autores seguidos
weavero-people-build-tip = Una ficha por cada autor que sigue (Preferencias → Fuentes, y el archivo de alertas de la carpeta de datos de Weavero), marcada Por revisar; después se busca en línea a cada uno con un perfil de OpenAlex, de uno en uno.
weavero-people-build-file = Desde un archivo…
weavero-people-build-file-tip = Lo mismo desde un archivo de alertas que elija
weavero-people-build-file-title = Elegir un archivo de alertas
weavero-people-build-stop = Detener
weavero-people-build-progress = Buscando investigadores: { $done } de { $total }…
weavero-people-build-done = Nuevas: { $added } · Ahora seguidas: { $followed } · En búsqueda: { $queued }
weavero-people-build-none = Ningún autor seguido que añadir. Añada algunos en Preferencias → Fuentes, o construya desde un archivo de alertas.
weavero-people-select = Elija un investigador a la izquierda.
weavero-people-refresh = Actualizar
weavero-people-refresh-tip = Busca a este investigador en OpenAlex, ORCID, theses.fr, IdRef y Wikidata. Solo se envían su nombre y sus identificadores; nada suyo.
weavero-people-refreshing = Buscando…
weavero-people-refreshed = { $count ->
        [0] Nada nuevo ({ $date }).
        [one] { $count } valor nuevo encontrado ({ $date }).
       *[other] { $count } valores nuevos encontrados ({ $date }).
    }
weavero-people-error = No se pudo acceder a { $source }: { $error }.
weavero-people-theses-none = theses.fr no tiene ningún investigador con este nombre y este identificador ORCID.
weavero-people-follow = Seguir
weavero-people-followed = Seguida
weavero-people-mark-checked = Marcar como revisada
weavero-people-mark-check = Marcar por revisar
weavero-people-remove = Quitar…
weavero-people-remove-title = Quitar de Investigadores
weavero-people-remove-confirm = ¿Quitar a { $name } de Investigadores? Lo que guardó, rechazó y escribió sobre este investigador se va también.
weavero-people-added-from = Añadida desde: { $title }
weavero-people-no-ids = Aún no hay identificador. Actualizar encuentra a este investigador por el artículo desde el que se añadió, o enumera los perfiles con su nombre para que elija.
weavero-people-no-profile = Ningún perfil de OpenAlex tiene este nombre.
weavero-people-pick = { $count ->
        [one] Un perfil de OpenAlex tiene este nombre. ¿Es este investigador? Haga clic en él para confirmarlo.
       *[other] { $count } perfiles de OpenAlex tienen este nombre. ¿Cuál es este investigador? Haga clic en él.
    }
weavero-people-cand-works = { $count ->
        [0] ningún trabajo
        [one] { $count } trabajo
       *[other] { $count } trabajos
    }
weavero-people-sec-ids = Identificadores
weavero-people-sec-facts = Datos
weavero-people-sec-links = Vínculos
weavero-people-sec-tree = Árbol genealógico académico
weavero-people-sec-works = Publicaciones
weavero-people-sec-notes = Notas
# Researchers: dated events (MJT 2026-11-25). $where: the place; $field: date, what, where, link,
# note; $kind: seminar, visit, talk (a talk at a conference), jury; $what, $date: the event's.
weavero-people-sec-events = Eventos
weavero-people-event-add = Añadir un evento
weavero-people-events-none = Aún no hay eventos: un seminario que dio, una visita, un tribunal…
weavero-people-event-at = en { $where }
weavero-people-event-announcement = anuncio
weavero-people-event-remove = Eliminar
weavero-people-event-cancel = Cancelar
weavero-people-event-field =
    { $field ->
        [date] Fecha
        [what] Qué
        [where] Dónde
        [link] Enlace
       *[note] Nota
    }
weavero-people-event-ph =
    { $field ->
        [date] 2026-11-25, o 2026-11, o 2026
        [what] Seminario, visita…
        [where] Lugar o institución
        [link] Dirección del anuncio
       *[note] Lo que conviene recordar
    }
weavero-people-event-kind =
    { $kind ->
        [seminar] Seminario
        [visit] Visita
        [talk] Ponencia en congreso
       *[jury] Tribunal
    }
weavero-people-event-bad-date = Escriba la fecha como 2026-11-25, 2026-11 o 2026.
weavero-people-event-need-what = Indique qué fue el evento.
weavero-people-event-bad-link = El enlace debe ser una dirección web.
weavero-people-event-remove-confirm = ¿Eliminar el evento «{ $what }» ({ $date })?
# The researchers table (the centre pane with no researcher open). $col: name, institution, country,
# papers (their items in your libraries), phd (the year of their PhD).
weavero-people-back = Volver a los investigadores
weavero-people-table-count =
    { $count ->
        [one] Un investigador
       *[other] { $count } investigadores
    }
weavero-people-table-col =
    { $col ->
        [name] Nombre
        [institution] Institución
        [country] País
        [papers] Artículos en sus bibliotecas
       *[phd] Doctorado
    }
weavero-people-table-sort-tip = Ordenar por esta columna; vuelva a hacer clic para invertir
# Researchers: the Contact card and the custom fields (MJT 2026-11-25). $kind: email, phone, address, web;
# $label: work, home, mobile (a phone), other; $field: kind, label, value -- and for the placeholders the
# kind, or custom (the user's own label); $why: why a value is refused; $what: the line removed.
weavero-people-sec-contact = Contacto
weavero-people-contact-add = Añadir datos de contacto
weavero-people-contact-none = Aún no hay correo, teléfono ni dirección.
weavero-people-contact-kind =
    { $kind ->
        [email] Correo
        [phone] Teléfono
        [address] Dirección
       *[web] Sitio web
    }
weavero-people-contact-label =
    { $label ->
        [work] Trabajo
        [home] Casa
        [mobile] Móvil
       *[other] Otro
    }
weavero-people-contact-label-custom = Su propia etiqueta…
weavero-people-contact-field =
    { $field ->
        [kind] Tipo
        [label] Etiqueta
       *[value] Valor
    }
weavero-people-contact-ph =
    { $field ->
        [email] nombre@ejemplo.org
        [phone] +34 912 345 678
        [address] Calle, ciudad, país: en varias líneas
        [web] Dirección del sitio web
       *[custom] Una etiqueta propia
    }
weavero-people-contact-map = mapa
weavero-people-contact-map-tip = Buscar esta dirección en OpenStreetMap (la dirección se envía a openstreetmap.org)
weavero-people-contact-bad =
    { $why ->
        [label] Indique una etiqueta.
        [email] No es una dirección de correo.
        [phone] Un número de teléfono tiene cifras, con + ( ) - . / y espacios.
        [web] No es una dirección web.
       *[empty] Escriba un valor.
    }
weavero-people-sec-custom = Campos personalizados
weavero-people-custom-add = Añadir un campo personalizado
weavero-people-custom-none = Aún no hay campos personalizados.
weavero-people-custom-field =
    { $field ->
        [label] Etiqueta
       *[value] Valor
    }
weavero-people-custom-bad = Un campo personalizado necesita una etiqueta y un valor.
weavero-people-card-remove-confirm = ¿Eliminar «{ $what }»?
weavero-people-row-edit =
    .label = Editar
weavero-people-row-remove =
    .label = Eliminar
weavero-people-row-keep =
    .label = Conservar
weavero-people-row-reject =
    .label = Rechazar
weavero-people-row-restore =
    .label = Restaurar
# The researcher page's Edit pencil: on, every field shows (the empty ones with their Add).
weavero-people-page-edit = ✎ Editar
weavero-people-page-edit-tip = Mostrar todos los campos, los vacíos con su Añadir
weavero-people-sec-empty = Aún no se sabe nada. Editar (✎) muestra todos los campos, para añadir un valor.
weavero-people-add-researcher = Añadir un investigador
weavero-people-add-researcher-tip = Añadir un investigador por su nombre: OpenAlex lista los perfiles con ese nombre para que elija (la red, solo con este clic)
weavero-people-add-researcher-prompt = Nombre del investigador (Nombre Apellido, o Apellido, Nombre):
# The "Suggested links" queue: every link a source suggested, for all researchers. $count: how many;
# $fact: the link kind (advisor, coadvisor, postdoc, lab, student, linked); $other: the linked researcher; $name: the researcher whose record holds the link.
weavero-people-queue-btn =
    { $count ->
        [0] Vínculos sugeridos
       *[other] Vínculos sugeridos ({ $count })
    }
weavero-people-queue-tip = Cada vínculo que una fuente sugirió y que aún no ha conservado ni rechazado, para todos sus investigadores
weavero-people-queue-title = Vínculos sugeridos
weavero-people-queue-count =
    { $count ->
        [1] 1 vínculo por revisar
       *[other] { $count } vínculos por revisar
    }
weavero-people-queue-none = Ningún vínculo sugerido le espera.
weavero-people-queue-q =
    { $fact ->
        [advisor] ¿Fue { $other } el director de tesis de { $name }?
        [coadvisor] ¿Fue { $other } codirector de la tesis de { $name }?
        [postdoc] ¿Acogió { $other } a { $name } como posdoc?
        [lab] ¿Trabajó { $other } en el mismo laboratorio que { $name }?
        [student] ¿Hizo { $other } su tesis con { $name }?
       *[linked] ¿Está { $other } vinculado a { $name }?
    }
# Dates that do not fit in the academic family. $kind: advisor (an advisor's PhD not before the
# student's), years (the student's PhD outside the link's years); $advisor, $student: names; $ay, $sy:
# their PhD years; $years: the link's years, as the record writes them; $text: one issue in words.
weavero-people-date-issue =
    { $kind ->
        [advisor] El doctorado de { $advisor } ({ $ay }) no es anterior al de { $student } ({ $sy }), a quien dirigió.
       *[years] El doctorado de { $student } ({ $sy }) queda fuera de los años de su vínculo con { $advisor } ({ $years }).
    }
weavero-people-date-title =
    { $count ->
        [1] 1 fecha por comprobar
       *[other] { $count } fechas por comprobar
    }
weavero-people-date-confirm-title = Una fecha no encaja
weavero-people-date-confirm = { $text } ¿Añadir este vínculo de todos modos?
# Possible duplicates: two records that may be one researcher. $count: how many; $reason: id-orcid,
# id-openalex, id-idref, id-wikidata, name, form, initials, institution; $name, $keep, $drop: names.
weavero-people-dupe-btn = Posibles duplicados ({ $count })
weavero-people-dupe-title =
    { $count ->
        [1] 1 posible duplicado
       *[other] { $count } posibles duplicados
    }
weavero-people-dupe-items =
    { $count ->
        [0] Ningún elemento en sus bibliotecas
        [1] 1 elemento en sus bibliotecas
       *[other] { $count } elementos en sus bibliotecas
    }
weavero-people-dupe-reason =
    { $reason ->
        [id-orcid] mismo ORCID iD
        [id-openalex] mismo perfil de OpenAlex
        [id-idref] mismo IdRef
        [id-wikidata] mismo elemento de Wikidata
        [name] mismo nombre
        [form] el nombre de uno es otra forma del otro
        [initials] mismas iniciales
       *[institution] misma institución
    }
weavero-people-dupe-merge = Fusionar en { $name }
weavero-people-dupe-notsame = No es la misma persona
weavero-people-dupe-confirm-title = Fusionar dos investigadores
weavero-people-dupe-confirm = ¿Fusionar { $drop } en { $keep }? Todo lo que se sabe de { $drop } pasa a { $keep }, y { $drop } se elimina.
# Evidence on the user's own value: an item of a library, its page, a quote. $field: link (the item), quote;
# $title: the item's title; $page: its page label, or none; $quote: the words, or none.
weavero-people-ev-act = Prueba…
weavero-people-row-evidence =
    .label = Prueba…
weavero-people-ev-field =
    { $field ->
        [link] Elemento
       *[quote] Cita
    }
weavero-people-ev-ph = Un enlace zotero:// al elemento, o elija uno de los PDF abiertos abajo
weavero-people-ev-tab =
    { $page ->
        [none] { $title }
       *[other] { $title }, p. { $page }
    }
weavero-people-ev-tip = Prueba: { $title }{ $page ->
        [none] {""}
       *[other] , p. { $page }
    }{ $quote ->
        [none] {""}
       *[other] {" "}“{ $quote }”
    } Haga clic para abrirla.
weavero-people-ev-bad = Pegue un enlace zotero:// a un elemento, o elija uno de los PDF abiertos.
weavero-people-ev-remove = Quitar la prueba
weavero-people-fact-position = Puesto
weavero-people-fact-institution = Institución
weavero-people-fact-phd = Institución del doctorado
weavero-people-fact-phd-year = Año del doctorado
weavero-people-fact-phd-thesis = Tesis
weavero-people-fact-web = Página web
weavero-people-link-advisor = Director de tesis
weavero-people-link-coadvisor = Codirector
weavero-people-link-postdoc = Anfitrión posdoctoral
weavero-people-link-lab = Mismo laboratorio
weavero-people-link-linked = Vinculado a
weavero-people-link-student = Doctorando
weavero-people-source-me = usted
weavero-people-keep = Conservar
weavero-people-reject = Rechazar
weavero-people-restore = Restaurar
weavero-people-edit = Editar
weavero-people-add-value = Añadir…
weavero-people-save = Guardar
weavero-people-agree = { $count } fuentes coinciden
weavero-people-new = nuevo
weavero-people-conflict = { $count } valores: las fuentes no coinciden
weavero-people-conflict-new = Una fuente dio un valor nuevo
weavero-people-status-chosen = conservado por usted
weavero-people-status-confirmed = confirmado
weavero-people-status-suggested = sugerido
weavero-people-status-alternative = otro valor
weavero-people-status-rejected = rechazado
weavero-people-open-person = Abrir { $name }
weavero-people-add-person = { $name } no está en Investigadores: haga clic para añadirlo
weavero-people-from-record = según su propia ficha
weavero-people-links-none = Aún no hay vínculos.
weavero-people-link-name =
    .placeholder = Nombre del investigador
weavero-people-link-add = Añadir vínculo
weavero-people-tree-empty = Aún no se conoce ningún director ni doctorando.
weavero-people-tree-label = Árbol genealógico académico de { $name }
# The lineage tree's academic siblings (the other PhD students of the focus's advisors). $name: an advisor.
weavero-people-lt-sibs-of = Otros doctorandos de { $name }:
weavero-people-lt-sibs-tip = Hermanos académicos: los otros doctorandos de los mismos directores. Un nombre centra el árbol en esa persona.
weavero-people-works-count = { $inlib } en sus bibliotecas, de { $total }
weavero-people-works-none = Actualizar enumera sus publicaciones desde OpenAlex.
weavero-people-works-offline = Aún no buscado. Elementos de sus bibliotecas con un autor de este nombre:
weavero-people-works-more = { $count } más
weavero-people-works-search =
    .placeholder = Filtrar por título, autor o revista
weavero-people-works-sort =
    { $sort ->
        [old] Más antiguas primero
        [cited] Más citados
        [title] Título
        [venue] Revista
       *[new] Más recientes primero
    }
weavero-people-works-sort-tip = Ordenar las publicaciones
weavero-people-works-funnel-tip = Filtrar las publicaciones
weavero-people-works-mark =
    { $kind ->
        [pdf] En su biblioteca, con su PDF
        [nopdf] En su biblioteca, sin PDF
       *[web] No está en su biblioteca
    }
weavero-people-works-filter =
    { $filter ->
        [type] Tipo
        [venue] Revista
       *[decade] Década
    }
weavero-people-works-nomatch = Ninguna publicación coincide.
# The researcher's citation figures: $h, $i10, $cites (numbers); the tooltip says where they come
# from ($from: openalex, or works = computed from the $works works listed) and when ($date).
weavero-people-metrics = índice h { $h } · índice i10 { $i10 } · { $cites } citas
weavero-people-metrics-tip =
    { $from ->
        [works] Calculado a partir de las { $works } publicaciones listadas, con sus recuentos de OpenAlex ({ $date }).
       *[openalex] OpenAlex, { $date }. Otras fuentes cuentan de otro modo.
    }
# A publication's times cited (OpenAlex's count at the last Refresh, $date in the tooltip).
weavero-people-work-cited =
    { $count ->
        [one] Citado una vez
       *[other] Citado { $count } veces
    }
weavero-people-work-cited-tip = OpenAlex, { $date }
# Semantic Scholar's figures, asked for on a click: $h, $cites (numbers), $date, $url (the profile);
# why it failed: $why = nodoi, nomatch, error ($error: the error).
weavero-people-s2-figures = Semantic Scholar: índice h { $h } · { $cites } citas
weavero-people-s2-tip = Semantic Scholar, { $date }: { $url }
weavero-people-s2-ask = Consultar Semantic Scholar
weavero-people-s2-again = Volver a consultar
weavero-people-s2-busy = Consultando…
weavero-people-s2-ask-tip = Buscar a este investigador en Semantic Scholar, a través de una de sus publicaciones con DOI (la red, solo con este clic)
weavero-people-s2-failed =
    { $why ->
        [nodoi] Ninguna de sus publicaciones tiene un DOI para buscarlo.
        [nomatch] Semantic Scholar no tiene ningún autor con este nombre en sus artículos.
       *[error] Semantic Scholar no respondió: { $error }
    }
# Google Scholar: the researcher's public profile, read on a click. $h, $i10, $cites (numbers), $date,
# $url (the profile); why reading failed: $why = refused (a refusal or a robot check), error ($error).
weavero-people-gs-add = Añadir perfil de Google Scholar
weavero-people-gs-add-tip = Indicar la dirección de su perfil público de Google Scholar, para leer sus cifras con un clic
weavero-people-gs-add-prompt = Pegue la dirección de su perfil de Google Scholar (scholar.google.com/citations?user=…):
weavero-people-gs-bad = No es la dirección de un perfil de Google Scholar.
weavero-people-gs-read = Leer Google Scholar
weavero-people-gs-busy = Leyendo…
weavero-people-gs-read-tip = Leer las cifras de su perfil de Google Scholar (su primera página, solo con este clic)
weavero-people-gs-forget = Olvidar perfil
weavero-people-gs-forget-tip = Olvidar su perfil de Google Scholar
weavero-people-gs-figures = Google Scholar: índice h { $h } · índice i10 { $i10 } · { $cites } citas
weavero-people-gs-tip = Google Scholar, { $date } – { $url }
weavero-people-gs-failed =
    { $why ->
        [refused] Google Scholar rechazó la página (puede pedir demostrar que no es un robot): abra el perfil en su navegador.
       *[error] Google Scholar no respondió: { $error }
    }
weavero-people-notes =
    .placeholder = Sus notas sobre este investigador
weavero-people-fact-country = País
weavero-people-fact-phd-country = País del doctorado
weavero-people-fact-birth-year = Año de nacimiento
weavero-people-sort-tip = Criterio de orden. Los investigadores cuyo valor aún no se conoce van al final.
weavero-people-sort-heading =
    .label = Ordenar por
weavero-people-sort =
    .label = { $sort ->
            [first] Nombre
            [added] Fecha de adición (más recientes primero)
            [modified] Última modificación (más recientes primero)
            [items] Elementos en sus bibliotecas (más primero)
            [institution] Institución (A–Z)
            [phdYear] Año del doctorado (más antiguos primero)
            [birthYear] Año de nacimiento (más antiguos primero)
           *[last] Apellido
        }
weavero-people-filter = { $filter ->
        [noOrcid] Sin ORCID iD
        [noIds] Sin identificadores
        [inLib] En sus bibliotecas
        [thesis] Tesis en sus bibliotecas
        [advisor] Con directores de tesis
        [student] Con doctorandos
        [web] Con página web
        [conflict] Fuentes en desacuerdo
        [position] Puesto
        [institution] Institución
        [country] País
        [phdCountry] País del doctorado
        [birth] Década de nacimiento
       *[phd] Década del doctorado
    }
weavero-people-filter-tip = { $filter ->
        [noOrcid] Solo los investigadores sin ORCID iD.
        [noIds] Solo los investigadores sin ningún identificador (ORCID, OpenAlex, IdRef, Wikidata): Actualizar enumera los perfiles con su nombre.
        [inLib] Solo los investigadores autores de al menos un elemento de sus bibliotecas (por su nombre).
        [thesis] Solo los investigadores autores de una tesis de sus bibliotecas (por su nombre).
        [advisor] Solo los investigadores con un vínculo a un director o codirector de tesis.
        [student] Solo los investigadores con un doctorando: un vínculo de doctorando propio, o el vínculo de director de tesis de otro investigador hacia ellos.
        [web] Solo los investigadores con una página web.
        [conflict] Solo los investigadores con un dato cuyas fuentes no coinciden, o un valor nuevo por revisar.
        [position] Solo los investigadores con este puesto.
        [institution] Solo los investigadores de esta institución.
        [country] Solo los investigadores cuya institución actual está en este país.
        [phdCountry] Solo los investigadores que obtuvieron el doctorado en este país.
        [birth] Solo los investigadores nacidos en esta década (Wikidata).
       *[phd] Solo los investigadores que obtuvieron el doctorado en esta década.
    }
weavero-people-filter-unknown = Desconocido
weavero-people-decade = Años { $decade }
# people4 (MJT 2026-11-24): a researcher's name edited in place, the other forms of the name,
# the sort's label, the filter funnel. The title's tooltip: a click edits the name.
weavero-people-name-edit-tip = Haga clic para editar el nombre
# Tooltip of the "you" mark beside a name the user typed.
weavero-people-name-mine-tip = Nombre escrito por usted: una actualización nunca lo cambia
# The two fields of the name being edited, as Zotero edits a creator.
weavero-people-name-last =
    .placeholder = Apellido
    .aria-label = Apellido
weavero-people-name-first =
    .placeholder = Nombre
    .aria-label = Nombre
weavero-people-name-empty = Un investigador necesita un apellido: el nombre no se ha cambiado.
# The row of the other forms of the name (ORCID, OpenAlex, Wikidata, the user's items, the user's own).
weavero-people-fact-other-names = Otros nombres
# A source of a form of the name: how the creators of the user's libraries write it.
weavero-people-source-items = sus elementos
# A source of a value: the alerts file (Settings → Feeds), whose followed authors a Build reads, with their ids.
weavero-people-source-radar = archivo de alertas
# The plain label before the sort button; the button shows the order alone ($sort as in weavero-people-sort).
weavero-people-sort-label = Orden:
weavero-people-sort-current = { $sort ->
        [first] Nombre
        [added] Fecha de adición
        [modified] Última modificación
        [items] Elementos en sus bibliotecas
        [institution] Institución
        [phdYear] Año del doctorado
        [birthYear] Año de nacimiento
       *[last] Apellido
    }
# The funnel beside the sort: its tooltip and spoken name, and its popup's name.
weavero-people-funnel-tip = Filtrar investigadores
# The funnel's popup: the hint at the top left; Clear (the popup stays open); the red × (Clear and Close).
weavero-people-filter-hint = Alt+clic para excluir
weavero-people-filter-clear-all = Borrar
    .title = Borrar todos los filtros de investigadores (mantener esta ventana abierta)
    .aria-label = Borrar todos los filtros de investigadores
weavero-people-filter-clear-close = Borrar y cerrar
# The second line of an on/off filter's tooltip (its first line: weavero-people-filter-tip).
weavero-people-filter-gesture = Clic para incluir, Alt+clic para excluir.
# Tooltip of a value's chip. $value: the value (a position, a country, a decade, Unknown...); $count: the researchers with it.
weavero-people-filter-value-tip = { $value } ({ $count }) — clic para incluir, Alt+clic para excluir
# Researchers, the right pane (see en-US).
weavero-people-pane-none = Ningún investigador seleccionado
weavero-people-pane-count =
    { $count ->
        [one] { $count } investigador seleccionado
       *[other] { $count } investigadores seleccionados
    }
weavero-people-pane-open = Abrir
weavero-people-pane-toggle =
    { $state ->
        [open] Ocultar el panel de detalles
       *[closed] Mostrar el panel de detalles
    }
# Researchers, page modes and family-tree dates (see en-US).
weavero-people-page-done = Listo
weavero-people-lt-when =
    { $kind ->
        [range] { $type } { $from }–{ $to }
        [from] { $type } desde { $from }
        [until] { $type } hasta { $to }
        [unknown] { $type } ¿{ $from }?
       *[end] { $type } { $to }
    }
weavero-people-lt-when-tip = { $date }: la fuente no indica si el vínculo empezó o terminó ese año.
# Researchers, the Google Contacts design, step 2 (see en-US).
weavero-people-nav =
    { $view ->
        [followed] Seguidas
        [check] Por revisar
        [queue] Vínculos sugeridos
        [dupes] Duplicados
        [conflict] Fuentes en desacuerdo
        [noOrcid] Sin ORCID
        [import] Importar desde un archivo…
       *[all] Investigadores
    }
weavero-people-nav-head =
    { $group ->
        [manage] Corregir y gestionar
       *[browse] Explorar por
    }
weavero-people-dupe-none = No hay posibles duplicados.
weavero-people-fchip =
    { $state ->
        [out] { $filter }: no { $value }
       *[in] { $filter }: { $value }
    }
weavero-people-fchip-toggle =
    { $state ->
        [out] No: { $filter }
       *[in] { $filter }
    }
weavero-people-fchip-remove = Quitar este filtro
weavero-people-sel =
    { $act ->
        [follow] Seguir
        [unfollow] Dejar de seguir
        [merge] Fusionar
       *[all] Seleccionar todo
    }
weavero-people-sel-count =
    { $count ->
        [one] { $count } seleccionado
       *[other] { $count } seleccionados
    }
weavero-people-sel-merge-tip = Marque exactamente dos investigadores para fusionarlos
weavero-people-sel-merge-into =
    .label = Fusionar en { $name }
weavero-people-sel-row = Seleccionar a { $name }
weavero-people-row-act =
    { $act ->
        [follow] Seguir
        [unfollow] Dejar de seguir
        [edit] Editar
       *[more] Más acciones
    }
weavero-people-row-menu =
    .label = { $act ->
            [open] Abrir
            [edit] Editar
            [follow] Seguir
            [unfollow] Dejar de seguir
            [check] Marcar por revisar
            [checked] Marcar como revisada
            [refresh] Actualizar
           *[remove] Quitar…
        }
weavero-people-table-colmenu =
    .label = { $col ->
            [name] Nombre
            [institution] Institución
            [country] País
            [papers] Artículos en sus bibliotecas
           *[phd] Año de doctorado
        }
weavero-people-table-colreset =
    .label = Restablecer las columnas predeterminadas
# Researchers' tags (see en-US).
weavero-people-tags = Marcas
weavero-people-tags-col =
    .label = Marcas
weavero-people-tagsel-none = No hay marcas para mostrar
weavero-people-tagsel-actions =
    .title = Acciones
weavero-people-tagsel-deselect =
    .label = Deseleccionar todo
weavero-people-tag-menu =
    .label = { $act ->
            [color] Asignar color
            [nocolor] Quitar el color
            [position] Posición
            [rename] Renombrar marca…
           *[delete] Eliminar marca…
        }
weavero-people-tag-add =
    .placeholder = Añadir una marca
weavero-people-tag-remove = Quitar { $name }
weavero-people-bulk-tag = Marca
weavero-people-bulk-tag-new =
    .label = Nueva marca…
weavero-people-tag-new-prompt = Marcar a los investigadores seleccionados con:
weavero-people-tag-rename-prompt = Renombrar «{ $name }» para todos los investigadores:
weavero-people-tag-delete-ask =
    { $count ->
        [one] ¿Quitar la marca «{ $name }» de { $count } investigador?
       *[other] ¿Quitar la marca «{ $name }» de { $count } investigadores?
    }
weavero-people-tag-colors-full = Como máximo nueve marcas tienen color.
weavero-pref-nav-people = Investigadores
weavero-pref-people-title = Investigadores
weavero-pref-people-enable =
    .aria-label = Activar Investigadores
weavero-pref-people-desc = Una pestaña Investigadores (Archivo → Investigadores) para construir y comprobar lo que sabe de otros investigadores: sus identificadores, puesto, institución y doctorado, cada dato con el valor de cada fuente lado a lado, para que lo conserve, lo rechace o lo edite; sus directores de tesis y doctorandos, dibujados como un árbol genealógico académico; sus publicaciones, marcadas según estén o no en su biblioteca. Añada un investigador con «Añadir investigador» en el menú contextual de un autor, o construya la lista a partir de los autores que sigue. Weavero los busca en OpenAlex, ORCID, theses.fr, IdRef y Wikidata solo cuando hace clic: las solicitudes llevan el nombre y los identificadores del investigador, nada suyo. Las fichas se quedan en la carpeta de datos de Weavero, nunca en sus bibliotecas.
weavero-pref-people-toolbar-button =
    .label = Botón Investigadores en la barra de herramientas del panel de colecciones
weavero-pref-people-toolbar-button-desc = Un botón en la barra de herramientas sobre sus colecciones que abre la pestaña Investigadores, o la muestra si ya está abierta; <strong>Ctrl/Cmd+clic</strong> la abre junto a la biblioteca, en una vista dividida. Haga clic derecho en el botón para ocultarlo; esta casilla lo vuelve a mostrar.
weavero-pref-people-names-title = Nombres
weavero-pref-people-names-desc = Cómo escribe cada parte de la pestaña Investigadores el nombre de un investigador. «Apellido, Nombre» muestra que la lista está ordenada por apellido; un nombre sin nombre de pila se escribe sin coma.
weavero-pref-people-names-list = Lista de investigadores
weavero-pref-people-names-heading = Título de la página de un investigador
weavero-pref-people-names-links = Vínculos (directores de tesis, doctorandos…)
weavero-pref-people-names-tree = Árbol genealógico académico
weavero-pref-people-names-last =
    .label = Apellido, Nombre
weavero-pref-people-names-first =
    .label = Nombre Apellido
# Copias de seguridad de los datos de Weavero (modules/backups.ts).
weavero-pref-nav-backups = Copias de seguridad
weavero-pref-backups-title = Copias de seguridad
weavero-pref-backups-desc = Las copias de seguridad propias de Zotero y la sincronización de Zotero no incluyen los datos de Weavero —sus marcadores, esquemas, grupos de pestañas, sesiones y listas de canales— ni su configuración. Weavero guarda él mismo copias de ellos, en su carpeta de datos. Una restauración o una importación reemplaza los datos y la configuración de Weavero por los de una copia; lo que tiene se copia antes, para que pueda deshacerlo.
weavero-pref-backups-auto =
    .label = Hacer copias automáticamente
weavero-pref-backups-auto-desc = Una vez al día, y antes de cada actualización de Weavero, Weavero copia sus datos y su configuración. Lo que puede reconstruir por sí mismo, como el índice «Citado por» y las puntuaciones de los canales, queda fuera.
weavero-pref-backups-keep-lead = Conservar las últimas
weavero-pref-backups-keep-unit = { $count ->
        [one] copia diaria
       *[other] copias diarias
    }
weavero-pref-backups-keep-desc = De las copias hechas antes de una actualización, con «Copiar ahora», antes de una restauración o una importación, y de los archivos importados, se conservan las 5 últimas de cada tipo.
weavero-pref-backups-actions-title = Sus copias
weavero-pref-backups-now = Copiar ahora
weavero-pref-backups-restore = Restaurar…
weavero-pref-backups-export = Exportar…
weavero-pref-backups-import = Importar…
weavero-pref-backups-open = Abrir carpeta
weavero-pref-backups-where = Las copias se guardan en { $path }
weavero-pref-backups-last = Última copia: { $date } ({ $reason }). { $count ->
        [one] { $count } copia
       *[other] { $count } copias
    }, { $size } en total.
weavero-pref-backups-none = Todavía no hay ninguna copia.
weavero-pref-backups-last-error = La última copia falló ({ $date }): { $error }
weavero-pref-backups-restored = { $kind ->
        [import] Importado el { $date } desde el archivo copiado como { $from }. Para deshacerlo, restaure la copia «Antes de una importación» del { $pre }.
       *[other] Restaurado el { $date } desde la copia del { $from }. Para deshacerlo, restaure la copia «Antes de una restauración» del { $pre }.
    }
weavero-pref-backups-restore-failed = La restauración del { $date } no se hizo ({ $problem }). Sus datos y su configuración quedaron como estaban.
weavero-pref-backups-pending = { $kind ->
        [import] Una importación espera a que Zotero vuelva a iniciarse.
       *[other] Una restauración de la copia del { $date } espera a que Zotero vuelva a iniciarse.
    } Weavero la escribe antes de leer sus datos, de modo que nada de lo que aún tiene en memoria puede sobrescribirla.
weavero-pref-backups-pending-restart = Reiniciar Zotero ahora
weavero-pref-backups-pending-cancel = Cancelar la restauración
weavero-pref-backups-working = Copiando…
weavero-pref-backups-backed-up = Copiado: { $date }.
weavero-pref-backups-exported = Escrito: { $path }
weavero-pref-backups-staged = Hecho: Weavero la restaura la próxima vez que se inicie Zotero.
weavero-pref-backups-failed = No ha funcionado: { $error }
weavero-pref-backups-checking = Comprobando la copia…
weavero-pref-backups-pick = Elija una copia: debajo se muestra lo que cambiaría al restaurarla.
weavero-pref-backups-no-backups = Todavía no hay ninguna copia que restaurar.
weavero-pref-backups-from-file = Desde el archivo { $file }, creado el { $date } por Weavero { $version }. Lo que cambiaría al importarlo:
weavero-pref-backups-opt-data =
    .label = Datos
weavero-pref-backups-opt-settings =
    .label = Configuración
weavero-pref-backups-go-restore = Restaurar esta copia…
weavero-pref-backups-go-import = Importar este archivo…
weavero-pref-backups-cancel = Cancelar
weavero-backups-ask-title = Restaurar una copia de Weavero
weavero-backups-ask-restore = ¿Restaurar { $what ->
        [data] los datos de Weavero
        [settings] la configuración de Weavero
       *[both] los datos y la configuración de Weavero
    } desde la copia del { $date }? Lo que tiene ahora se copia antes, para que pueda deshacerlo restaurando esa copia. Weavero restaura la copia cuando Zotero vuelve a iniciarse, antes de leer sus datos.
weavero-backups-ask-import-title = Importar datos de Weavero
weavero-backups-ask-import = ¿Reemplazar { $what ->
        [data] los datos de Weavero
        [settings] la configuración de Weavero
       *[both] los datos y la configuración de Weavero
    } por los de { $file }? Lo que tiene ahora se copia antes, para que pueda deshacerlo restaurando esa copia. Weavero importa el archivo cuando Zotero vuelve a iniciarse, antes de leer sus datos.
weavero-backups-ask-restart = Reiniciar Zotero ahora
weavero-backups-ask-later = En el próximo inicio
weavero-backups-export-title = Exportar los datos de Weavero
weavero-backups-import-title = Importar datos de Weavero
weavero-backups-row = { $date } — { $reason } — { $size }
weavero-backups-reason-daily = diaria
weavero-backups-reason-manual = Copiar ahora
weavero-backups-reason-pre-restore = antes de una restauración
weavero-backups-reason-pre-import = antes de una importación
weavero-backups-reason-import = importada de { $file }
weavero-backups-reason-update = antes de la actualización a { $to }
weavero-backups-reason-update-from = antes de la actualización de { $from } a { $to }
weavero-backups-reason-other = automática ({ $reason })
weavero-backups-store-bookmarks = Marcadores
weavero-backups-store-outlines = Esquemas
weavero-backups-store-ann-order = Orden de las anotaciones
weavero-backups-store-note-view = Esquemas y plegados de las notas
weavero-backups-store-sessions = Sesiones de pestañas
weavero-backups-store-saved-windows = Ventanas guardadas
weavero-backups-store-tab-groups-file = Grupos de pestañas (copia en archivo)
weavero-backups-store-tab-groups-bak = Grupos de pestañas (copia anterior)
weavero-backups-store-outline-eval = Evaluaciones de los esquemas
weavero-backups-store-feeds = Listas de canales
weavero-backups-store-feeds-export = Archivo de alertas
weavero-backups-store-tab-groups = Grupos de pestañas
weavero-backups-store-settings = Configuración
weavero-backups-diff-line = { $store }: { $changes }
weavero-backups-diff-added = { $count ->
        [one] { $count } añadido
       *[other] { $count } añadidos
    }
weavero-backups-diff-removed = { $count ->
        [one] { $count } eliminado
       *[other] { $count } eliminados
    }
weavero-backups-diff-changed = { $count ->
        [one] { $count } modificado
       *[other] { $count } modificados
    }
weavero-backups-diff-file-added = añadido (no está aquí ahora)
weavero-backups-diff-file-removed = eliminado (no está en esta copia)
weavero-backups-diff-file-changed = reemplazado
weavero-backups-diff-none = Nada cambiaría: esto contiene los datos y la configuración que tiene ahora.
weavero-backups-failed-title = Weavero no pudo copiar sus datos
weavero-backups-failed-kept = Sus copias anteriores se conservan.
weavero-backups-failed-disk-full = El disco está lleno.
weavero-backups-failed-locked = Otro programa tiene bloqueado uno de los archivos de Weavero. Weavero lo intenta de nuevo en la próxima copia.
weavero-backups-failed-too-large = Los datos de Weavero superan el tamaño que puede tener una copia (256 MB).
weavero-backups-failed-other = Algo salió mal: { $error }
weavero-backups-damaged = Esta copia está dañada (un archivo no coincide con su registro) y se ha eliminado.
weavero-backups-import-newer = Este archivo lo creó una versión más reciente de Weavero. Actualice Weavero y después impórtelo.
weavero-backups-import-not-weavero = Este no es un archivo exportado por Weavero.
weavero-backups-restored-title = Weavero restauró una copia
weavero-backups-restored = Los datos y la configuración de Weavero son los de la copia del { $date }. Para deshacerlo, restaure la copia hecha justo antes, en Configuración → Weavero → Copias de seguridad.
weavero-backups-restore-failed-title = Weavero no restauró la copia
weavero-backups-restore-failed = La copia del { $date } no se restauró: sus datos y su configuración están como estaban.
# Researchers: the lineage tree (peoplenet, 2026-11-25).
weavero-people-lt-back = Atrás
weavero-people-lt-forward = Adelante
weavero-people-lt-home = Volver a { $name }
weavero-people-lt-zoom-in = Ampliar
weavero-people-lt-zoom-out = Reducir
weavero-people-lt-fit = Ajustar todo el árbol
weavero-people-lt-export = Exportar
weavero-people-lt-export-svg =
    .label = Imagen SVG…
weavero-people-lt-export-png =
    .label = Imagen PNG…
weavero-people-lt-export-csv =
    .label = Tabla CSV…
weavero-people-lt-export-title = Exportar el árbol de filiación
weavero-people-lt-edge =
    { $type ->
        [phd] Doctorado
        [coadvisor] Codirección
        [postdoc] Posdoctorado
        [research] Investigador
        [ra] Asistente de investigación
       *[other] Otro
    }
weavero-people-lt-more-up =
    { $count ->
        [one] { $count } mentor más sin mostrar
        [many] { $count } mentores más sin mostrar
       *[other] { $count } mentores más sin mostrar
    }
weavero-people-lt-more-down =
    { $count ->
        [one] { $count } discípulo más sin mostrar
        [many] { $count } discípulos más sin mostrar
       *[other] { $count } discípulos más sin mostrar
    }
weavero-people-lt-fewer = Mostrar menos
weavero-people-lt-phd = Doctorado { $year }
weavero-people-lt-tree-inst = la institución que indica el { $source }, quizá una anterior
weavero-people-lt-aft-tip = La página de esta persona en el { $source } ({ $licence })
weavero-people-lt-open = Abrir
weavero-people-lt-open-tip = Abrir a esta persona en Investigadores
weavero-people-lt-follow-tip = Añadir a Investigadores y seguir
weavero-people-lt-card-tip = Haga clic para centrar el árbol en esta persona
weavero-people-lt-grants = Subvenciones de los NIH: { $list }
weavero-people-lt-credit = Mentores y discípulos también del { $source } ({ $licence }), exportación de { $version }.
# Researchers: the strip above the items list (peoplenet, 2026-11-25).
weavero-people-strip-label = Investigadores que nombra su búsqueda
weavero-people-strip-counts =
    { $here ->
        [one] { $here } elemento aquí
        [many] { $here } elementos aquí
       *[other] { $here } elementos aquí
    } · { $shown } en estos resultados
weavero-people-strip-only = Solo los suyos
weavero-people-strip-only-tip = Mostrar solo los elementos con el autor { $form } (filtro Autores de Weavero)
weavero-people-strip-close = Ocultar para esta búsqueda
weavero-people-strip-open-tip = Abrir en Investigadores
