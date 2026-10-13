# Textos y fuentes del video

Cada ítem se compone con saltos manuales y ajuste automático al 84 % del ancho del cuadro. El tamaño es relativo al alto; el bloque queda centrado verticalmente en `y`, con interlineado 1,1. `x` es el ancla horizontal: borde izquierdo, centro o borde derecho según la alineación. El color automático sigue el fondo; el propio lleva un halo de contraste. Subir y Fundido usan entrada de 0,7 s y salida de 0,45 s (acortadas en ítems breves); los textos que empiezan en cero ya se ven y los que llegan al final no se desvanecen.

Las fuentes propias son globales para los álbumes del navegador. Se guardan como Blob en IndexedDB (`pdf-book-view.fonts`, store `fonts`), con respaldo en memoria durante la sesión si el almacenamiento está bloqueado. No se guardan en localStorage ni en el repositorio. Se admiten TTF, OTF, WOFF y WOFF2, hasta 5 MB por archivo y 20 fuentes. **La persona que sube la fuente es responsable de contar con su licencia de uso.**

En **Textos**, usá **Agregar texto** para crearlo en el momento de la vista previa. La lista selecciona ítems y permite subir o bajar su orden (el último queda encima). El editor admite 120 caracteres, saltos de línea, fuentes integradas o propias, color automático/preset/propio, tamaño, negrita, alineación, animación, una rejilla de nueve posiciones y coordenadas X/Y. Inicio y duración son independientes del guion; los botones de tiempo usan el instante actual. **Restablecer posición/estilo** conserva contenido y tiempos. **Guardar como mi marca**, disponible para los ítems `cta` y `handle`, sólo modifica la marca cuando se pulsa.

**Subir fuente** admite los cuatro formatos indicados y muestra errores en el panel; **Quitar** retira la fuente de la biblioteca y activa el fallback para los textos que la usaban. En desarrollo también se puede probar desde la consola:

```js
const { addFont, removeFont, ensureFont } = await import('/src/promo/fonts.ts');
const blob = await (await fetch('/fonts/caveat-normal-600.woff2')).blob();
const font = await addFont(new File([blob], 'Mi fuente.woff2', { type: 'font/woff2' }));
await ensureFont(font.id);
// Asignar font.id al campo font de un textItem y recompilar el proyecto.
// Para borrar la fuente: await removeFont(font.id).
```

Vista previa y exportación esperan las fuentes de todos los cues y usan el mismo dibujo. Si una fuente propia falta o falla, usan la display de la plantilla. Al borrarla se actualiza la vista previa abierta. `layoutCue` es pura; `measureCueBox(ctx, cue, width, height, fallback?)` devuelve la caja tipográfica sin halo ni animación. La selección usa esa medición y `cueMotion`, con el mismo fallback de la plantilla.

En el paso Textos y con la reproducción detenida, tocá un texto visible para seleccionarlo, arrastralo para moverlo o usá la manija de la esquina para escalarlo. Con foco en la caja, las flechas mueven 1 % y Mayús 5 %. Las coordenadas se calculan sobre el cuadro real del video, en los cuatro formatos, y se limitan a 0–100 %. Fuera del texto, los gestos siguen controlando la cámara. El texto seleccionado fuera de su intervalo se muestra tenue; otros ítems fuera de tiempo sólo se seleccionan desde la lista. Las cajas y manijas son elementos DOM de edición; el texto tenue usa un canal exclusivo de preview. Ninguno se incluye en el MP4.

Verificación reproducible (con `npm run dev` y álbum genérico generado): `cd motion && node scripts/text-fonts-e2e.mjs`. Carga una fuente autoalojada como propia, comprueba el CSS usado al exportar dos MP4 reales y el fallback después de borrarla.

`node scripts/text-items-e2e.mjs` crea tres textos desde la interfaz con fuentes propias, mueve y escala, cambia color y duración, comprueba la recarga y decodifica un MP4 para verificar que no contiene las guías azules. `node scripts/ui-a11y-e2e.mjs out/demo/album-demo.pdf` comprueba teclado, etiquetas y alcance a 390, 768 y 1440 px.
