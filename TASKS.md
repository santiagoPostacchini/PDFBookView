# TASKS: PDFBookView

- Responsables: `claude` (planificación y revisión), `codex` (implementación), `gemini` (investigación, solo lectura), `humano`.
- Estados: `pendiente`, `en curso`, `hecho`, `bloqueada`.
- Cada tarea es chica, tiene criterio de aceptación verificable y su propia rama. Al terminar, quien trabajó actualiza su bloque (estado y hallazgos).

<!-- Plantilla de tarea:
### T-000: Título corto
- Responsable:
- Estado: pendiente
- Rama:
- Aceptación:
- Hallazgos:
-->

## Tareas

### T-001: Investigar videos 3D de producto y herramientas para no técnicos
- Responsable: gemini + claude
- Estado: hecho
- Rama: feature/orquestador-video
- Aceptación: referencias con URL y principios accionables en `docs/research/referencias-video-producto-3d.md`.
- Hallazgos: una idea de cámara por plano, velocidad pareja, luz y sombra reales, producto visible desde el primer cuadro, textos dentro de zonas seguras; las herramientas para no técnicos resuelven todo con plantilla + contenido propio + pocos ajustes.

### T-002: Prototipo del orquestador y muestra de ejemplo
- Responsable: claude
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/orquestador-video
- Aceptación: MP4 9:16 de las plantillas Clásica (15 s) y Ritmo (10 s) sobre el álbum de ejemplo; hojas de contacto en 9:16, 1:1 y 16:9; maqueta del editor; `npm test` y `npm run typecheck` en verde.
- Hallazgos: el "brillo raro" venía de dos lados: el barrido de luz que se pintaba encima del cuadro y el halo de `BokehPass` (el fondo entraba al buffer de profundidad). 371 tests en verde.

### T-003: Interfaz "Video promocional" en 4 pasos (Estilo, Historia, Textos y marca, Exportar)
- Responsable: claude
- Estado: hecho
- Rama: feature/editor-video
- Aceptación: reemplaza la pestaña de video del Estudio; guion de tarjetas (agregar, mover, quitar, elegir páginas, frase, duración); vista previa en tiempo real con textos; exporta MP4; prueba de punta a punta headless en verde.
- Hallazgos: el visor 3D es la vista previa (capa 2D de textos en el motor, cámara bloqueada mientras se edita). Reordenar con arrastre de mouse/lápiz por eventos de puntero: el arrastre HTML5 no funciona con pantallas táctiles (ahí quedan "Antes"/"Después"). `studio-e2e.mjs` recorre los 4 pasos, arrastra una escena y exporta 9:16 + 4:5 en verde.

### T-004: Proyecto de video por álbum y "Mi marca"
- Responsable: claude
- Estado: hecho
- Rama: feature/editor-video
- Aceptación: el guion se guarda por archivo (como el plan de hojas) y usuario, colores y tipografía de la marca se cargan solos en cada álbum nuevo; tests de carga y validación.
- Hallazgos: "Mi marca" guarda usuario y llamado a la acción (lo que se repite entre álbumes); escenario, luz y tipografía vienen de la plantilla elegida. Datos rotos o de otra versión vuelven a los valores por defecto (tests en `projectStorage.test.ts`).

### T-005: Tipografías autoalojadas (según D-006)
- Responsable: claude
- Estado: hecho
- Rama: feature/orquestador-video
- Aceptación: sin pedidos a Google Fonts; los textos del video se ven iguales con la red cortada.
- Hallazgos: comprobado con `promo-sample.mjs --block "fonts.g*"` en las tres combinaciones (0 pedidos bloqueados). 7 archivos woff2, ≈160 KB.

### T-006: Escenario 3D también en el modo Foto
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: selector de escenario (superficie) en Foto; PNG transparente sigue funcionando sin escenario.
- Hallazgos: Foto usa `StageSet` con superficie lisa, papel o lino y conserva colores anteriores y propios. La captura transparente quita el escenario y lo restaura al terminar. `npm test` (255 tests), `npm run build` y `photo-e2e.mjs` en verde; la prueba comprueba alfa real del PNG, persistencia, Foto ↔ Video y salida del Estudio. Muestras en `motion/out/foto-e2e/` (no versionadas).

### T-007: Exportar varios formatos de una vez y colores automáticos desde la tapa
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: un clic exporta 9:16 + 1:1 (u otros elegidos); "Automático" toma el color de escenario de la tapa; tests del extractor de color.
- Hallazgos: color dominante desde la miniatura original de tapa, ignorando blanco, transparencia y texto negro; fallback Arena. Selector Automático en Textos y marca, consistente en vista previa y exportación. Tests del extractor y exportación real conjunta 9:16 + 16:9 en verde.

### T-008: Música opcional
- Responsable: claude (decisión de códec) + codex
- Estado: pendiente (usuario decidió dejar música para después)
- Rama: codex/musica-video
- Aceptación: subir un MP3, recorte a la duración del video con fundido de entrada y salida; el MP4 se reproduce con audio en Instagram y WhatsApp.

### T-009: Plantilla "Luz de ventana"
- Responsable: codex (implementación) + humano (revisión visual)
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: superficie de lino con sombra de ventana proyectada (foco con textura) y tono cálido; hoja de contacto aprobada por el usuario.
- Hallazgos: plantilla y escenario nuevos con lino cálido, textura del marco proyectada por el foco y miniatura genérica. Sombras aclaradas y difuminadas a pedido del usuario; versión suavizada aprobada con condición de que sea seleccionable. Botón explícito Luz de ventana en Textos y marca → Escenario, independiente de la plantilla; elegir otro escenario quita el efecto. `ventana-e2e.mjs` verifica selección, retiro, proyección y lino; muestra en `motion/out/ventana/hoja-contacto.png` (ignorada por Git).

### T-010: Retirar el video automático anterior
- Responsable: claude
- Estado: hecho
- Rama: feature/editor-video
- Aceptación: se borran `src/studio/promoScript*`, `PromoPlayer`, `recordPromo` y el barrido/destello de `PostFX`; tests y build en verde.
- Hallazgos: quedan en `src/studio/` sólo `framing.ts` y `cameraPath.ts`, que usan el motor y el compilador.

### T-011: Reforzar antialiasing del Estudio
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: suavizado de bordes en vista previa y exportaciones, ajustado a los píxeles reales del destino; se conserva PNG transparente y no se toca `vite.config.ts`.
- Hallazgos: FXAA después del desenfoque y la conversión sRGB, antes del grano, complementando MSAA existente; resolución actualizada al exportar y al volver al visor, recursos liberados al cerrar el motor. `manteles-e2e.mjs` comprueba cambio real en 3.089 píxeles y resolución 640×360; `photo-e2e.mjs`, 411 tests y build en verde. Foto transparente conserva su captura directa.

### T-012: Escenarios de manteles para apoyar el álbum
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: manteles distintos elegibles en Video, dibujo tejido en perspectiva bajo el álbum, selección recordada y mismo escenario en vista previa/exportación; elegir otro escenario retira el mantel.
- Hallazgos: cuadros rosa, cuadros azul y rayas salvia sobre lino; patrones repetidos con filtro anisotrópico y miniaturas de dibujo en Textos y marca → Manteles. Se conserva Luz de ventana y no se modifica la interfaz de T-006. `manteles-e2e.mjs` verifica selección, recarga, retiro y seis fotos de exportación distintas; muestras genéricas en `motion/out/manteles/`. Música sigue postergada según la decisión del usuario.

### T-013: Corregir apertura y mejorar entorno y cámara (revisión del usuario)
- Responsable: codex
- Estado: hecho (commiteada, en revisión visual del usuario)
- Rama: feature/figuritas
- Aceptación: título visible en el primer cuadro y separado del cierre; reproducción principal desde el inicio; cámara con desplazamientos físicos más contenidos; ventana graduable independiente del mantel; mesa finita con patas y sombras de contacto mediante oclusión ambiental; acceso explícito a la animación de pegado.
- Hallazgos: el botón principal arrancaba desde la escena elegida; ahora vuelve al inicio. Se elimina la espera visual de tipografías y el título está visible en cuadro 0. Recorrido de cámara interpolado en posición de mundo, con planos de dolly y desplazamiento lateral, menos órbitas/zoom y velocidad continua más pareja. Ventana 0–100% combinable con manteles y recordada; mesa de madera con cuatro patas y suelo, sin alterar escenarios de Foto. SSAO de Three existente, graduable en Sombras de contacto; Foto transparente mantiene render directo. Acceso Agregar figuritas al video, botón Ver cómo se pegan y pausa tras cada pegado más larga. `entorno-e2e.mjs` verifica apertura, intensidad, persistencia, geometría y efecto real de AO; `figuritas-e2e.mjs` verifica siete destinos y dos MP4; `photo-e2e.mjs`, 414 tests y build en verde. Muestras genéricas en `motion/out/entorno/`; miniaturas regeneradas. Sin dependencias nuevas, commits ni cambios en `vite.config.ts` o `StudioPanel.tsx`.

### T-014: Planos fijos con distintos acercamientos y ángulos
- Responsable: codex
- Estado: hecho (commiteada, en revisión visual del usuario)
- Rama: feature/figuritas
- Aceptación: todas las plantillas usan cámara fija durante cada escena y cortes entre ángulos/acercamientos distintos; apertura, hojas y figuritas mantienen sus animaciones; texto inicial y encuadres de vuelo correctos; muestra MP4 genérica para revisión.
- Hallazgos: pedido del usuario a partir de `https://www.youtube.com/watch?v=BBZ6WAg4Mbk`. Se reemplazan recorridos de cámara por un encuadre fijo por escena, conservando escenario, iluminación, textos y guion guardado. Portada, apertura, doble página, hojeo, detalle, cenital y cierre tienen composiciones distintas; cierre con margen para las hojas mientras se cierran. Se actualizan descripciones y criterios de tests: 535 pruebas comprueban inmovilidad, variantes de formato/duración y cortes exactos, incluso al buscar hacia atrás. T-006 y `vite.config.ts` preservados.
- Validación: build y `entorno-e2e.mjs --video` en verde; muestra genérica `motion/out/entorno/planos-fijos.mp4` (15 s, 640×360, 24 fps). `figuritas-e2e.mjs` comprueba vuelos sin recortes, siete pegados, persistencia y dos MP4 con planos fijos. Miniaturas de las cinco plantillas regeneradas.

### T-015: Zoom y desplazamiento lateral opcionales por toma
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: activar zoom entre dos puntos y movimiento lateral en cualquier toma, por separado o combinados; ajustes leves, persistentes e independientes de otras escenas; revisar puntos y reproducir sólo esa toma; misma cámara en vista previa y MP4, con planos fijos como valor inicial.
- Hallazgos: controles en Historia → Movimiento de esta toma; zoom inicial/final 0–10%, recorrido lateral 0–15% del ancho de página con dirección izquierda/derecha. Apagar conserva los valores; duplicar copia sin compartir referencias. Validación de proyectos anteriores y valores fuera de rango; sin dependencias nuevas ni cambios de arquitectura. T-006 y `vite.config.ts` preservados.
- Validación: 539 tests y build en verde; `camera-motion-e2e.mjs` verifica controles, ambos puntos, reproducción acotada, persistencia, retorno al plano fijo y exportación MP4 real con movimiento.

### T-016: Título al inicio del guion, órbita opcional y sobre persistente
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: título en la primera toma aunque Portada esté quinta; toggle por toma para girar alrededor del centro del álbum en lugar de trasladar la cámara; paquetito apoyado al terminar y durante las tomas siguientes; persistencia, búsqueda hacia atrás y exportación consistentes.
- Hallazgos: guion del usuario comienza con Doble página y tiene Portada quinta; el título estaba asociado al tipo Portada. Ahora aparece una sola vez en la primera escena utilizable y el campo de título muestra esa toma. Giro de hasta 9° con objetivo central y radio constante si no hay zoom, combinable con acercamiento; ajustes guardados y compatibles con proyectos anteriores. Sobre abierto permanece en su posición de mesa; una escena posterior de figuritas reemplaza el anterior para evitar superposición. Sin dependencias nuevas, commits ni cambios en T-006 o `vite.config.ts`.
- Validación: 542 tests y build en verde; prueba de navegador con guion reordenado, órbita guardada, ambos puntos y MP4 real. Regresión de figuritas con archivos del usuario verifica sobre en la toma posterior, ausencia de superposición, búsqueda hacia atrás y dos MP4 reales (9:16 y 16:9).

### T-017: Apoyar el paquete en un mazo de tres sobres
- Responsable: codex
- Estado: hecho (commiteada, en revisión visual del usuario)
- Rama: feature/figuritas
- Aceptación: tras el pegado, el sobre se desplaza a un costado y gira hasta quedar acostado junto a otros dos, con los tres frentes visibles como cartas de un mazo; animación continua, sin sobres flotantes ni cortes del encuadre; resultado persistente en tomas posteriores y exportación.
- Hallazgos: dos sobres cerrados sobre la mesa y el sobre animado se acomoda encima, con separación, alturas de pila y giros de −14°/0°/14°. Frente hacia arriba y cierre suave de la aleta. La escena reserva más tiempo para apoyarlo; encuadre de figuritas incluye la posición de entrada y el mazo. Planos generales posteriores y cierre amplían su región conservando los ángulos. Mesa ensanchada sólo cuando lo exige la huella de los sobres; Foto conserva sus dimensiones previas. Un conjunto visible a la vez al repetir escenas, y búsqueda hacia atrás determinista.
- Validación: 543 tests y build en verde; continuidad de pose, reposo de los tres paquetes y proyección de todas las esquinas en 9:16, 4:5, 1:1 y 16:9. Regresión de figuritas con los archivos del usuario, muestras y dos MP4.

### T-018: Mesa sin interferencias, acercamiento manual y figuritas flexibles
- Responsable: codex
- Estado: hecho (commiteada, en revisión visual del usuario)
- Rama: feature/figuritas
- Aceptación: quitar el defecto de render del mantel visto desde lejos; permitir elegir acercamiento fijo por toma; figuritas con curvatura y apoyo progresivo, planas al pegarse, consistentes al buscar atrás y exportar.
- Hallazgos: la madera tenía otra cara superior a sólo 0,001 unidades del mantel; se retiran sus triángulos para que ni render ni SSAO compitan con la superficie, manteniendo costados y base. Acercamiento de esta toma 0–100% (hasta 2×), independiente del zoom animado; el encuadre elegido puede recortar objetos y se guarda. Malla de figuritas subdividida con curvatura cilíndrica que conserva la longitud del papel y se aplana desde un borde; apoyo ampliado a 0,45 s antes de pegar en la textura de página. El reporte de casilleros horizontales se desestima por pedido del usuario: confirmó incompatibilidad entre sus PDFs; lógica de destinos conservada. Sin dependencias nuevas ni cambios en T-006 o `vite.config.ts`.
- Validación: 546 tests y build en verde; pruebas de acercamiento guardado, continuidad y curvatura tanto horizontal como vertical. Regresión de navegador comprueba ausencia de la tapa superpuesta de madera, deformación real de la malla, imágenes con mantel y exportación 9:16/16:9.

## Figuritas en los videos (ver `docs/figuritas.md`)

Todo el trabajo quedó en `feature/figuritas` (ver commits); las ramas `codex/<slug>` previstas no se llegaron a crear.

### F-1: Pegar imágenes sobre páginas del libro (motor)
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: `BookEngine.setPageDecorations(page, pintores|null)` y `clearPageDecorations()`; `Book.pageCenter(index)` (mundo); pegar y quitar se ve en el visor y no altera las miniaturas del guion; tests de lo puro; `npm test`/`typecheck` en verde.
- Hallazgos: API del motor expuesta; centro de cada cara apoyada sobre su pila con transformación a mundo y espesor de tapas. Decoraciones reemplazables en ambas calidades, originales preservados y validación de índices. 257 tests, typecheck y build en verde; `motion/scripts/decorations-e2e.mjs` verifica píxeles reales (30.064 al pegar, 0 al quitar/limpiar) y miniatura intacta con páginas sintéticas. Implementado en la rama activa `feature/figuritas`, sin cambiar de rama ni commitear; T-006 y `vite.config.ts` preservados.

### F-2: Casilleros numerados del álbum
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: `PdfSource.textItems`, `src/pdf/slots.ts` (`findNumberedSlots`); sobre el álbum real devuelve 13→pág. lógica y (u,v) con error < 0,01 respecto del corazón; duplicados cercanos unidos; tests con datos sintéticos.
- Hallazgos: 33 casilleros detectados; el 13 cae en página lógica 7 (0-based), u=0,27430 y v=0,29476, error <0,003 respecto del corazón de referencia. Las coordenadas (103,182) eran inicio/baseline del texto, no su centro. Duplicado 15 unido; tests sintéticos y `slots-e2e.mjs` en verde.

### F-3: Hoja de figuritas y diseño del paquete
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: `sheet.ts` separa las 7 figuritas de `fotos (1).pdf` con número y tamaño en pt (verticales y horizontales sin girar); `packArt.ts` recorta frente y dorso del troquel y trae un paquete básico; `library.ts` guarda por álbum (IndexedDB, respaldo en memoria); tests de `findBoxes`.
- Hallazgos: siete cajas y números correctos: 13/14/16/17 verticales, 19/20/21 horizontales, ~173×247 pt sin girar. Frente/dorso del troquel y paquete genérico; IndexedDB por álbum y respaldo en memoria. Persistencia real al recargar y tests de componentes/fallback en verde; PDFs e imágenes del usuario fuera de archivos versionables.

### F-4: Compilación y coreografía
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: escena `figuritas` en modelo, `resolveTargets`, `createShow`/`evaluateShow` puros, integración en `compileProject` (giros de hoja, cámara, duración mínima); tests: continuidad de poses, cada figurita termina en su casillero, la escena se omite sin figuritas; guardado y validación en `projectStorage`.
- Hallazgos: escenas con selección por número o página; hasta 3 automáticas/6 manuales. Duración mínima, giros entre destinos, fases continuas y omisión segura sin recursos. Se conserva la selección al guardar, editar y duplicar. 19 y 20 son horizontales sobre casilleros verticales cercanos al borde: se reducen proporcionalmente para entrar completas, con aviso en la interfaz.

### F-5: Paquete y figuritas en 3D
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: `Rig.ts`/`ShowRigs` integrados en `TimelinePlayer`, `VideoPreview` y `recordTimeline`; se ve el paquete abrirse, salir cada figurita, volar y pegarse sin saltos; buscar hacia atrás despega; hoja de contacto de 9:16 y 16:9 revisada a ojo.
- Hallazgos: sobre fino con boca y aleta articulada, frente/dorso y figuritas con sombra; mismas poses en vista previa/exportación. Buscar atrás retira las pegadas; libera mallas/texturas al salir. Encuadre apaisado ampliado tras revisión visual y test de esquinas durante el vuelo. Hoja de contacto revisada en `motion/out/figuritas-e2e/hoja-contacto.png`, sin recortes de figuritas.

### F-6: Interfaz de figuritas y barra superior
- Responsable: codex
- Estado: hecho (commiteada, en revisión del usuario)
- Rama: feature/figuritas
- Aceptación: pasos de `SceneStep` para cargar, elegir figuritas y casillero/página (selector), diseño del paquete, plantilla "Figuritas"; botón para ocultar/mostrar la barra superior con margen de cuadro ajustado; `figuritas-e2e.mjs` en verde con el álbum real.
- Hallazgos: carga PDF/imágenes, números editables, selección y selector de destino, diseño propio/básico, avisos y nueva plantilla con miniatura genérica. Barra ocultable recordada; margen superior del video 108→24. Prueba con los tres PDFs reales, siete destinos en ambos formatos, persistencia, búsqueda y exportación conjunta de dos MP4 en verde. Trabajo en la rama activa `feature/figuritas`, sin commits; T-006 y `vite.config.ts` preservados.

Validación conjunta (revisada el 2026-10-11): 546 tests, typecheck y build en verde. `figuritas-e2e.mjs` incluye selector manual de página/casillero, límite de seis, barra recordada y dos MP4 reales; `photo-e2e.mjs` sigue en verde (regresión de T-006). T-008 queda postergada por el usuario.

## Repaso de la interfaz (decisiones del usuario, 2026-10-11)

Decisiones: (1) el editor de video pasa a **cinco pasos**: Estilo, Historia, Textos y marca, Ambiente, Exportar; (2) **un solo catálogo de escenarios** compartido por Foto y Video; (3) la barra superior arranca **oculta en Video** y visible en el resto. Línea de base: `node scripts/ui-shots.mjs <álbum.pdf> out/ui-shots/antes` (desde `motion/`; también `--mobile`). Cada tarea en su rama `codex/ui-*`, sin cambiar la lógica del estudio salvo lo indicado, con capturas antes/después y `npm test`, `npm run typecheck`, `npm run build`, `photo-e2e.mjs` y `figuritas-e2e.mjs` en verde. Mantener los nombres accesibles que usan las pruebas (p. ej. "Estudio", "Cargar figuritas", "Diseño del paquete") o actualizarlas en la misma tarea.

### U-0: Línea de base de capturas
- Responsable: claude
- Estado: hecho
- Rama: feature/figuritas
- Aceptación: `motion/scripts/ui-shots.mjs` captura visor, Foto y cada paso del editor, en escritorio (1440×900 y panel completo) y móvil (`--mobile`, 390×844).

### U-1: Componentes comunes
- Responsable: codex
- Estado: hecho (pendiente de revisi?n visual del usuario)
- Rama: codex/ui-componentes
- Aceptación: interruptor (reemplaza las casillas nativas), botón de archivo en castellano ("Elegir archivo" + nombre o "Ningún archivo"), muestra de color con nombre visible, bloque plegable "Más ajustes" accesible, y espaciados/tamaños/radios en variables de CSS; usados en los controles actuales sin reorganizar nada ni cambiar comportamiento; sin dependencias nuevas.
- Hallazgos: Toggle conserva checked/onChange, etiquetas y rol checkbox para las pruebas existentes; FileButton mantiene input real, accept/multiple/disabled y nombre elegido aunque el consumidor reinicie el input. Swatch se usa en Foto y Video; admite nombre visible opcional. Disclosure disponible para U-2 sin plegar ni mover controles actuales. Variables CSS de espaciado, radio y tama?o; sin dependencias ni cambios de l?gica.
- Validaci?n: 546 tests, typecheck, build, photo-e2e y figuritas-e2e en verde (dos MP4). Capturas de escritorio y panel completo en motion/out/ui-shots/u1 revisadas, sin controles nativos en ingl?s ni desbordes en los controles modificados.
- Entorno: Playwright requiri? TEMP/TMP dentro del proyecto por permisos del sandbox; PDFs originales usados directamente, sin copiarlos ni registrar sus rutas.

### U-2: Cinco pasos del editor de video
- Responsable: codex
- Estado: hecho (pendiente de revisión visual del usuario)
- Rama: codex/ui-pasos
- Aceptación: Estilo = plantillas (tarjetas compactas); Historia = lo esencial de la escena arriba (páginas, frase, duración), "Movimiento de esta toma" plegado y acciones de la escena (Antes, Después, Duplicar, Quitar, Agregar) siempre visibles; Textos y marca = sólo título, línea chica, llamado a la acción, usuario y tipografía; **Ambiente** (paso nuevo) = escenario, manteles, luz, luz de ventana (un solo control, 0 % la apaga), mesa y sombras de contacto; Exportar sin cambios. El proyecto guardado sigue cargando igual.
- Hallazgos: cinco pasos; Ambiente separado sin cambios en model.ts, projectStorage ni Foto. Plantillas compactas; Movimiento plegable y acciones fijas en Historia; colores con nombre, ventana con un slider, mesa/AO en Más ajustes.
- Validación: 546 tests, typecheck y build en verde; photo, figuritas (dos MP4), ventana, manteles, entorno, camera-motion (MP4) y studio (9:16/4:5 con arrastre) en verde en puerto 5174.
- Capturas: motion/out/ui-shots/u2, escritorio y móvil revisados; cinco pasos sin recortes y acciones visibles incluso con Movimiento abierto (verificación automática). README/docs y scripts actualizados.
- Entorno/pendientes: TEMP/TMP local por permisos; ui-shots cierra el editor de hojas antes del Estudio. Revisión del usuario; refinamientos móviles en U-6. Sin dependencias nuevas ni commits.

### U-3: Catálogo único de escenarios (Foto y Video)
- Responsable: codex
- Estado: hecho (pendiente de revisión visual del usuario)
- Rama: codex/ui-escenarios
- Aceptación: Foto y Video eligen de la misma lista (colores, superficies, manteles, ventana) con nombres visibles; se conserva el PNG transparente de Foto y que Foto no cambie de aspecto para quien ya la usa; elección recordada; `photo-e2e.mjs`, `manteles-e2e.mjs` y `ventana-e2e.mjs` en verde.
- Hallazgos: catálogo común en scenarios.ts y ScenarioPicker con nombres visibles, manteles de dos columnas y color propio; Foto conserva superficies y Transparente, suma manteles/ventana recordados. Ajustes antiguos migrados a ids foto:* sin alterar color/superficie; nuevas elecciones usan los colores comunes de Video.
- Compatibilidad: ids y aspecto anteriores de Video intactos; color propio validado como color:#rrggbb dentro del campo set existente, sin cambiar el modelo. Sin cambios de cámara, figuritas ni proceso de exportación; sin dependencias nuevas ni commits.
- Validación: 550 tests, typecheck y build en verde; photo (incluye nuevos escenarios y recarga), manteles (incluye color propio recordado), ventana, entorno, studio (arrastre y MP4 9:16/4:5), camera-motion y figuritas (dos MP4) en verde, puerto 5173.
- Capturas: motion/out/ui-shots/u3 y u3-mobile con el álbum del usuario, revisadas; nombres completos y manteles compactos sin desbordes. README/docs y pruebas actualizados; TEMP/TMP local por permisos del sandbox.
- Pendientes: revisión visual del usuario; refinamientos generales de móvil siguen en U-6.

### U-4: Barra superior
- Responsable: codex
- Estado: hecho (pendiente de revisión visual del usuario)
- Rama: codex/ui-barra
- Aceptación: una sola fila (Archivo, Lectura, Estudio); botón de ocultar con texto; el aviso "Preparando páginas" no se superpone; oculta por defecto al abrir Video y visible al volver a Foto o cerrar el Estudio, recordando lo que la persona elija; el cuadro del video aprovecha el espacio.
- Hallazgos: tres grupos en una fila a 1440×900, marca y acciones compactadas en orden, nombre truncado con title; Ocultar/Mostrar barra con texto. Avisos apilados abajo-izquierda y separados de tira, pager y guion.
- Preferencias: lectura/Foto conservan la clave general; Video tiene clave propia, oculta por defecto. Funciones puras con tests de transiciones, persistencia y almacenamiento bloqueado; dataset/evento y margen 24/108 intactos.
- Validación: 553 tests, typecheck y build en verde; photo, figuritas (dos MP4), studio (arrastre y MP4 9:16/4:5), entorno, manteles, ventana y camera-motion en verde, puerto 5173. Entorno/figuritas repetidas sin recargas de desarrollo tras timeouts iniciales.
- Capturas: motion/out/ui-shots/u4 revisadas; comprobaciones de fila única, avisos sin cruces, cuadro libre con barra visible/oculta y preferencia restaurada al cerrar. README/docs actualizados; sin dependencias nuevas ni commits.
- Pendientes: revisión visual del usuario; móvil sigue en U-6. TEMP/TMP local para tests y navegador por permisos del sandbox; PDFs originales sin copiar ni registrar rutas en archivos versionados.

### U-5: Panel de Figuritas
- Responsable: codex
- Estado: hecho (pendiente de revisión visual del usuario)
- Rama: codex/ui-figuritas
- Aceptación: estado vacío claro, cuadrícula compacta de figuritas con número y destino, contador "N de 6", diseño del paquete plegado; `figuritas-e2e.mjs` en verde.
- Hallazgos: tarjetas en dos columnas con miniaturas proporcionales, destino y avisos breves; Ajustar contiene número/destino/quitar. Paquete plegado con resumen básico/propio; FileButton admite texto opcional sin alterar sus otros usos.
- Validación: 553 tests, typecheck y build en verde; figuritas (dos MP4), photo, studio (arrastre y MP4 9:16/4:5), entorno, manteles, ventana y camera-motion en verde, puerto 5173.
- Capturas: motion/out/ui-shots/u5 revisadas (vacío, cargado, Ajustar y final; escritorio y panel completo). Siete figuritas requieren 289 px de desplazamiento a 1440×900; pie visible, horizontales horizontales y Tab elegir → ajustar comprobados.
- Compatibilidad: carga, resolveTargets, destinos y límites intactos; scripts reforzados y docs/figuritas.md actualizada. Sin dependencias nuevas, cambios de arquitectura ni commits; TEMP/TMP local para navegador/tests.
- Pendientes: revisión visual del usuario; ajustes generales de móvil siguen en U-6.

### U-6: Móvil, teclado y contraste
- Responsable: codex
- Estado: pendiente
- Rama: codex/ui-accesibilidad
- Aceptación: sin recortes ni desbordes a 390 y 768 px de ancho (capturas), orden de tabulación lógico, foco visible, etiquetas accesibles en todos los controles, contraste suficiente del texto secundario.

### U-7: Cierre del repaso
- Responsable: claude
- Estado: pendiente
- Rama: feature/figuritas
- Aceptación: revisión visual antes/después de cada paso (hoja de contacto), README y docs al día, pruebas de punta a punta actualizadas.
