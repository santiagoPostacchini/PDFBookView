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
- Estado: hecho (sin commitear, en revisión del usuario)
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
- Estado: pendiente
- Rama: codex/escenario-foto
- Aceptación: selector de escenario (superficie) en Foto; PNG transparente sigue funcionando sin escenario.

### T-007: Exportar varios formatos de una vez y colores automáticos desde la tapa
- Responsable: codex
- Estado: en curso (la exportación múltiple quedó hecha con T-003; falta el color automático)
- Rama: codex/color-desde-tapa
- Aceptación: un clic exporta 9:16 + 1:1 (u otros elegidos); "Automático" toma el color de escenario de la tapa; tests del extractor de color.

### T-008: Música opcional
- Responsable: claude (decisión de códec) + codex
- Estado: pendiente de decisión
- Rama: codex/musica-video
- Aceptación: subir un MP3, recorte a la duración del video con fundido de entrada y salida; el MP4 se reproduce con audio en Instagram y WhatsApp.

### T-009: Plantilla "Luz de ventana"
- Responsable: claude
- Estado: pendiente
- Rama: feature/luz-de-ventana
- Aceptación: superficie de lino con sombra de ventana proyectada (foco con textura) y tono cálido; hoja de contacto aprobada por el usuario.

### T-010: Retirar el video automático anterior
- Responsable: claude
- Estado: hecho
- Rama: feature/editor-video
- Aceptación: se borran `src/studio/promoScript*`, `PromoPlayer`, `recordPromo` y el barrido/destello de `PostFX`; tests y build en verde.
- Hallazgos: quedan en `src/studio/` sólo `framing.ts` y `cameraPath.ts`, que usan el motor y el compilador.
