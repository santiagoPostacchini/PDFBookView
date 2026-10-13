# Textos y fuentes del video

Cada ítem se compone con saltos manuales y ajuste automático al 84 % del ancho del cuadro. El tamaño es relativo al alto; el bloque queda centrado verticalmente en `y`, con interlineado 1,1. `x` es el ancla horizontal: borde izquierdo, centro o borde derecho según la alineación. El color automático sigue el fondo; el propio lleva un halo de contraste. Subir y Fundido usan entrada de 0,7 s y salida de 0,45 s (acortadas en ítems breves); los textos que empiezan en cero ya se ven y los que llegan al final no se desvanecen.

Las fuentes propias son globales para los álbumes del navegador. Se guardan como Blob en IndexedDB (`pdf-book-view.fonts`, store `fonts`), con respaldo en memoria durante la sesión si el almacenamiento está bloqueado. No se guardan en localStorage ni en el repositorio. Se admiten TTF, OTF, WOFF y WOFF2, hasta 5 MB por archivo y 20 fuentes. **La persona que sube la fuente es responsable de contar con su licencia de uso.**

La interfaz de carga y manipulación corresponde a F-3c. En desarrollo se puede probar desde la consola:

```js
const { addFont, removeFont, ensureFont } = await import('/src/promo/fonts.ts');
const blob = await (await fetch('/fonts/caveat-normal-600.woff2')).blob();
const font = await addFont(new File([blob], 'Mi fuente.woff2', { type: 'font/woff2' }));
await ensureFont(font.id);
// Asignar font.id al campo font de un textItem y recompilar el proyecto.
// Para borrar la fuente: await removeFont(font.id).
```

Vista previa y exportación esperan las fuentes de todos los cues y usan el mismo dibujo. Si una fuente propia falta o falla, usan la display de la plantilla. Al borrarla se actualiza la vista previa abierta. `layoutCue` es pura; `measureCueBox(ctx, cue, width, height, fallback?)` devuelve la caja tipográfica sin halo ni animación. Para una fuente ausente, pasar `timeline.textTypography` como quinto argumento permite medir el mismo fallback que el render. F-3c puede desplazar esa caja con `cueMotion` al dibujar una selección animada.

Verificación reproducible (con `npm run dev` y álbum genérico generado): `cd motion && node scripts/text-fonts-e2e.mjs`. Carga una fuente autoalojada como propia, comprueba el CSS usado al exportar dos MP4 reales y el fallback después de borrarla.
