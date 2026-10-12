# ARCHITECTURE: PDFBookView

## Visión general

- **Motor 3D** (`src/book/`): `BookEngine` arma escena, cámara, render bajo demanda y ciclo de vida del libro; `Book`/`Leaf`/`paperDeformer` modelan hojas articuladas en el lomo con curvatura por longitud de arco. En modo estudio suma post-proceso (`PostFX`), escenario (`Stage` + `StageSet`) y exportación.
- **PDF** (`src/pdf/`): `PdfSource` rasteriza con caché; `imposition` resuelve planes de hojas físicas (cuadernillo anidado o pliegos sueltos) a páginas lógicas; `PdfPageProvider` alimenta al motor por la interfaz `PageImageProvider`.
- **Orquestador de videos** (`src/promo/`): proyecto (escenas + textos + formato) → `compileProject` → línea de tiempo pura (cámara, giros de hojas, textos) → `TimelinePlayer` sobre el motor → `recordTimeline` compone 3D + textos y codifica MP4. `VideoPreview` usa el visor como vista previa (capa 2D del motor para los textos) y `projectStorage` guarda el video de cada álbum y "Mi marca".
- **Figuritas** (`src/promo/figuritas/`, `src/pdf/slots.ts`): `slots` ubica los casilleros numerados del álbum; `sheet`/`packArt`/`library` leen la hoja de figuritas y el diseño del paquete y los guardan por álbum; `targets` resuelve el destino de cada figurita; `choreography` es la coreografía pura (paquete, aleta, vuelos) y `Rig` la dibuja en 3D y pega lo aterrizado en la textura de la página (D-008, D-009).
- **Editor de video** (`src/ui/video/`): pasos Estilo → Historia → Textos y marca → Ambiente → Exportar en el panel del estudio y el guion de escenas debajo del visor (portal en `.studio-dock`). Cámara por escena en `src/promo/sceneCamera.ts` (D-010).
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
- Estado: parcialmente reemplazada por D-010 (la cámara pasó de toma continua a planos fijos con cortes). Siguen vigentes el guion por escenas y las plantillas.

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
- Estado: vigente (también en el modo Foto desde T-006; PNG transparente desactiva el escenario). Ampliada por D-011 (mesa, manteles, ventana).

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

### D-008: Figuritas pegadas dentro de la textura de la página (2026-10-11)

- Contexto: las figuritas tienen que quedar pegadas en el álbum y acompañar la hoja cuando se pasa; además el video se simula desde el principio al buscar un instante, así que lo pegado no puede ser estado acumulado.
- Decisión: `PageTextureManager.setDecorations(página, pintores)` pinta las figuritas sobre la imagen de la página (miniatura y alta calidad) y conserva el original para quitarlas. `ShowRigs` recalcula en cada cuadro el conjunto de figuritas ya pegadas a partir del tiempo. Mientras vuelan, son mallas 3D (`Rig.ts`) que al apoyarse se ocultan en el mismo cuadro en que se pintan.
- Razón: la figurita se deforma con el papel, buscar hacia atrás las despega sin lógica extra y la vista previa y la exportación dan el mismo resultado.
- Alternativas: no se registraron en su momento (Codex implementó esta vía desde el diseño inicial). La obvia, mallas hijas de la hoja, obligaría a seguir la curvatura del papel.
- Estado: vigente

### D-009: El número de la figurita es el casillero del álbum (2026-10-11)

- Contexto: el álbum real tiene corazones numerados (1–33) donde va cada figurita, y la figurita trae el mismo número; el número no es la página.
- Decisión: `src/pdf/slots.ts` lee los números como texto del PDF (pdf.js) y los pasa a página lógica y posición 0..1 usando el recorte de cada página del libro. El destino por defecto de una figurita es su casillero; la persona puede elegir otro casillero o una página interior, y editar el número. Las figuritas conservan su orientación: las horizontales giran sólo dentro del paquete y se enderezan al volar; si no caben en el casillero se reducen y la interfaz avisa.
- Razón: el pegado cae exacto sin que nadie mida nada, y el selector cubre los álbumes cuyos números no están como texto.
- Alternativas: usar el número como página (falso en este álbum). Pendiente de mejora: detectar el rectángulo real del casillero para ajustar el tamaño en vez de reducir la figurita.
- Estado: vigente

### D-010: Planos fijos con cortes, movimiento opcional por toma (2026-10-11)

- Contexto: el pedido original era una cámara "dinámica y continua" (D-003). Después, a partir de un video de referencia, el usuario pidió planos fijos con distintos acercamientos y ángulos.
- Decisión: cada escena tiene un encuadre fijo y se corta entre escenas. Por toma se puede activar acercamiento suave, desplazamiento lateral, giro alrededor del centro del álbum y un acercamiento manual (`sceneCamera.ts`); apagarlos conserva los valores. Apertura, hojeo y figuritas mantienen su animación.
- Razón: el plano fijo se ve más limpio y profesional; el movimiento sigue disponible sin que la persona entienda de cámaras.
- Alternativas descartadas: volver a la toma continua como única opción.
- Estado: vigente (reemplaza parcialmente a D-003)

- Nota U-8 (2026-10-12): Figuritas conserva un plano fijo, ajustado en perspectiva a la entrada del paquete, su aleta, los vuelos con curvatura y el mazo, con margen de 2,5%. El mazo descansa debajo del álbum en vertical/cuadrado y a la derecha en apaisado. El paquete se coloca al fondo, inclinado 65°/85° respectivamente; el recorrido y los tiempos permanecen iguales. Se elige la mayor elevación que cumple el ancho del álbum, explorando también azimuts en apaisado. La huella de mesa incluye paquete abierto y mazo; las opciones de movimiento por toma siguen disponibles.

### D-011: Mesa, manteles y luz de ventana como parte del escenario (2026-10-11)

- Contexto: sobre una superficie lisa el álbum parece flotar y los videos de producto se apoyan en escenas reales.
- Decisión: `StageSet` suma una mesa finita con patas, manteles tejidos en perspectiva (cuadros rosa, cuadros azul, rayas salvia), sombra de ventana graduable con un foco con textura y sombras de contacto por oclusión ambiental (SSAO de three). FXAA después del desenfoque, además del MSAA. El color del escenario puede tomarse de la tapa (`coverColor.ts`). El modo Foto conserva sus dimensiones y la captura transparente sigue sin escenario.
- Razón: la perspectiva de la mesa y las sombras de contacto son lo que más aporta a la sensación de objeto real.
- Alternativas: no se registraron en su momento.
- Estado: vigente

### D-012: Datos del usuario fuera del repositorio (2026-10-11)

- Contexto: el repositorio es público y las figuritas, el diseño del paquete y los álbumes son material de clientes (llevan su marca).
- Decisión: las figuritas y el diseño del paquete se cargan desde la interfaz y se guardan por nombre de álbum en el navegador (IndexedDB, con respaldo en memoria si está bloqueado). Los scripts de prueba reciben las rutas de los PDF por argumento y escriben sólo en `motion/out/` (ignorado por Git). `public/` sólo contiene recursos genéricos.
- Razón: no filtrar trabajo de clientes y que cada álbum recuerde sus figuritas.
- Pendiente de decisión del usuario: incluir el diseño de paquete de ejemplo como recurso por defecto (hoy sólo hay un paquete básico genérico).
- Estado: vigente

### D-013: Interfaz del Estudio: cinco pasos, catálogo único y hoja inferior (2026-10-12)

- Contexto: con tantas funciones nuevas (manteles, ventana, figuritas, movimiento por toma) la pantalla había quedado desordenada: "Textos y marca" mezclaba textos con escenario y luz, Foto y Video tenían catálogos de escenarios distintos, la barra superior ocupaba dos filas y tapaba el visor, y en el celular el Estudio no se podía abrir.
- Decisión (del usuario): el editor de video tiene cinco pasos (Estilo, Historia, Textos y marca, Ambiente, Exportar); Foto y Video eligen escenario del mismo catálogo (`src/book/scenarios.ts` + `ScenarioPicker`) y los ajustes de Foto anteriores se migran sin cambiar su aspecto; la barra superior va en una fila, con botón "Ocultar barra", y arranca oculta en Video (preferencia propia, aparte de la general); en 768 px o menos el Estudio es una hoja inferior (60 % / 88 %) que deja ver el visor. Componentes comunes (`Toggle`, `FileButton`, `Swatch`, `Disclosure`) y variables de CSS reemplazan los controles nativos. La biblioteca de figuritas recuerda si el paquete es propio (`PackAsset.custom`).
- Razón: cada paso responde una pregunta (qué estilo, qué historia, qué textos, qué ambiente, cómo exportar) y todo se alcanza con teclado, en celular y en escritorio; una prueba automática (`ui-a11y-e2e.mjs`) vigila desbordes, nombres accesibles y foco a 390, 768 y 1440 px, y otra (`contrast.test.ts`) el contraste del texto.
- Alternativas consideradas: cuatro pasos con el ambiente dentro de Estilo (el usuario prefirió cinco por simpleza visual).
- Estado: vigente
