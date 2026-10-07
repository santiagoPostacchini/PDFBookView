# ARCHITECTURE: PDFBookView

## Visión general

- **Motor 3D** (`src/book/`): `BookEngine` arma escena, cámara, render bajo demanda y ciclo de vida del libro; `Book`/`Leaf`/`paperDeformer` modelan hojas articuladas en el lomo con curvatura por longitud de arco. En modo estudio suma post-proceso (`PostFX`), escenario (`Stage` + `StageSet`) y exportación.
- **PDF** (`src/pdf/`): `PdfSource` rasteriza con caché; `imposition` resuelve planes de hojas físicas (cuadernillo anidado o pliegos sueltos) a páginas lógicas; `PdfPageProvider` alimenta al motor por la interfaz `PageImageProvider`.
- **Orquestador de videos** (`src/promo/`, propuesta en `feature/orquestador-video`): proyecto (escenas + textos + formato) → `compileProject` → línea de tiempo pura (cámara, giros de hojas, textos) → `TimelinePlayer` sobre el motor → `recordTimeline` compone 3D + textos y codifica MP4.
- **Motion graphics** (`motion/`): proyecto Remotion aparte; también aloja los scripts headless (Playwright) de muestras y pruebas de punta a punta.

## Decisiones

Una entrada por decisión. No se borran: si una cambia, se marca como reemplazada y se agrega la nueva.

### D-001: Motor 3D independiente de React (2026-10-07, registrada a posteriori)

- Contexto: la interfaz cambia mucho más que la simulación del papel.
- Decisión: `src/book/` no importa React; la UI sólo llama métodos y escucha eventos.
- Razón: se puede probar, reutilizar (fotos, videos, embebido) y reemplazar la UI sin tocar el 3D.
- Alternativas descartadas: react-three-fiber (acopla el bucle de render al ciclo de React).
- Estado: vigente

### D-002: Video exportado cuadro a cuadro, fuera de tiempo real (2026-10-07, registrada a posteriori)

- Contexto: las máquinas de los usuarios no siempre renderizan 1080×1920 a 30 fps.
- Decisión: simular con paso fijo y codificar cada cuadro con WebCodecs + mediabunny (MP4 H.264).
- Razón: el video sale fluido y determinista en cualquier equipo.
- Alternativas descartadas: MediaRecorder sobre el canvas (saltos de cuadros, WebM).
- Estado: vigente

### D-003: Orquestador de videos por escenas (2026-10-07)

- Contexto: el video automático anterior (`src/studio/promoScript`) era poco profesional (barridos de luz pintados encima, destellos, fondo plano) y no se podía personalizar sin saber de cámaras.
- Decisión: la persona arma un guion de escenas con nombres comunes (Portada, Apertura, Doble página, Hojeo, Detalle, Vista cenital, Cierre), cada una con 2–3 opciones (páginas, frase, duración). Las plantillas definen escenario, luz, ritmo, tipografía y guion inicial. El compilador traduce eso a cámara (toma continua o cortes en movimiento), giros de hojas y textos dentro de las zonas seguras.
- Razón: así trabajan las herramientas para no técnicos (Placeit, Rotato, Bookbrush): plantilla + contenido propio + pocos ajustes; y así se ven los videos de producto profesionales (una idea de cámara por plano, velocidad pareja, luz real).
- Alternativas descartadas: línea de tiempo con keyframes (demasiado técnica); seguir con un único video automático con estilos (poco control).
- Estado: vigente (aprobada por el usuario el 2026-10-07)

### D-004: Profundidad de campo sin halos (2026-10-07)

- Contexto: `BokehPass` de three.js dibujaba el fondo de la escena dentro del buffer de profundidad (como si estuviera pegado a la cámara) y desenfocaba cada píxel sólo por su propia distancia: las páginas claras se derramaban sobre el fondo, un halo brillante.
- Decisión: `DofPass` propio en una pasada (técnica de Gustafsson, 2018): cada muestra aporta según su propio círculo de confusión, lo de atrás no se derrama sobre lo nítido, y la profundidad se renderiza sin fondo.
- Razón: elimina el "brillo raro" y sirve igual para fotos y videos.
- Alternativas descartadas: apagar el desenfoque (se pierde el look fotográfico).
- Estado: vigente

### D-005: Escenario 3D en lugar de fondo pegado a la pantalla (2026-10-07)

- Contexto: con un degradé en pantalla, al mover la cámara el libro parece flotar.
- Decisión: `StageSet`: superficie con textura que recibe sombras, sombra de contacto bajo cada pila de hojas, foco de luz con caída suave, luz de entorno y niebla del color del horizonte para que la superficie se funda sin bordes.
- Razón: la perspectiva de la superficie es lo que hace creíble el movimiento de cámara.
- Alternativas descartadas: ciclorama curvo modelado (más geometría, mismo resultado visible).
- Estado: vigente (falta usarlo también en el modo Foto, T-006)

### D-006: Tipografías de los textos del video, autoalojadas (2026-10-07)

- Contexto: el prototipo cargaba Google Fonts en tiempo de ejecución.
- Decisión: tres combinaciones (Cormorant Garamond + Jost, Fraunces + Manrope, Caveat + Jost) autoalojadas en `public/fonts/` con sus licencias OFL; sólo el subconjunto latino y los estilos que usa el video (≈160 KB en total). `scripts/fetch-fonts.mjs` las regenera; `promo.css` se carga recién al abrir el editor de video y cada archivo baja cuando se usa.
- Razón: no depende de terceros, funciona en GitHub Pages con `base: './'` y el video sale igual en cualquier equipo.
- Alternativas descartadas: paquetes `@fontsource/*` (seis dependencias nuevas para siete archivos); fuentes del sistema (cambian entre Windows, Mac y celulares).
- Estado: vigente (aprobada por el usuario)

### D-007: Lugar de Remotion (2026-10-07)

- Contexto: los títulos, frases y cierre ya salen dentro del video del orquestador.
- Decisión: a definir con el usuario: Remotion queda para piezas especiales (stickers, motivos animados) o se retira.
- Estado: pendiente de decisión
