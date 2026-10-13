# Figuritas en el visualizador

## Cómo probarlo

1. Cargá el álbum PDF y elegí el modo de lectura correcto. Para un álbum de dos páginas por hoja, usá **Revista DIY / Cuadernillo** y verificá el armado en **Hojas**.
2. Abrí **Estudio → Video promocional** y elegí la plantilla **Figuritas**, o, para conservar tu estilo y guion, agregá la escena **Figuritas** desde **Historia → Agregar una escena**.
3. En **Historia**, tocá la tarjeta **Figuritas** del guion. Sin imágenes, una tarjeta explica qué podés cargar y la escena se omite. Usá **Cargar figuritas** para subir una hoja PDF sobre blanco o imágenes sueltas; después podés sumar otras con **Cargar más**.
4. El editor detecta los números y elige hasta tres figuritas automáticamente. El contador muestra cuántas elegiste de las seis permitidas; las tarjetas atenuadas no están elegidas. Abrí **Ajustar** en una tarjeta para corregir su número, elegir un casillero o una página interior centrada, o quitarla. Las miniaturas conservan su orientación y cada tarjeta muestra el destino y los avisos breves. Para usar más de seis, agregá otra escena de Figuritas.
5. Abrí **Diseño del paquete**, cerrado inicialmente: el resumen indica **Paquete básico** o **Tu diseño**. Cargá un PDF de troquel o imagen, o elegí **Usar paquete básico**; dentro se ven frente y dorso. El recorte del PDF reconoce el troquel de referencia (A4 apaisado, panel de frente a la derecha del panel del dorso); otros troqueles deben prepararse como imagen de frente.
6. Usá **Ver cómo se pegan** para reproducir la animación desde esa escena. El botón principal del guion reproduce desde el principio. En **Exportar**, elegí uno o varios formatos; se descargan los MP4 con un solo clic.

**Ocultar barra** y **Mostrar barra** recuerdan la preferencia por separado para Video (oculta por defecto) y Foto/lectura (visible por defecto). Al volver a Foto o cerrar el Estudio se recupera la preferencia general. El cuadro del video aprovecha el espacio liberado.

Todas las plantillas empiezan con **planos fijos con cortes**. El guion alterna tapa, apertura, doble página, detalle y vista cenital. Mové la cámara directamente en la vista previa para elegir el encuadre de cada toma; se guarda al terminar el gesto. **Restablecer encuadre** recupera el plano calculado y borra el acercamiento antiguo.

Para darle movimiento a una toma, elegila en **Historia → Movimiento de esta toma**. **Activar zoom suave** permite definir el acercamiento inicial y final entre 0% y 10%; si el inicial es mayor, la cámara se aleja. **Activar movimiento lateral** permite elegir dirección y recorrido, hasta 15% del ancho de una página. **Girar alrededor del centro del álbum** convierte ese desplazamiento en una órbita suave de hasta 9°, con el centro en foco. Podés combinarlo con el zoom. **Ver punto inicial**, **Ver punto final** y **Ver esta toma** permiten revisar el recorrido antes de exportar. Apagar los movimientos vuelve al plano fijo y conserva los valores para reactivarlos. Cada toma guarda sus ajustes, que también se aplican al MP4.

El título de **Al empezar** aparece en la primera toma utilizable, aunque hayas movido **Portada** al final o la hayas quitado. No vuelve a aparecer al mostrar la tapa más adelante. Después del último pegado, el paquetito se desplaza hacia la derecha del álbum y se acuesta junto a otros dos sobres, formando un abanico de tres con el frente hacia arriba. El mazo permanece durante las tomas siguientes; los planos generales y el cierre lo incluyen completo. Buscar hacia atrás recupera su entrada. Si agregás otra escena de figuritas, el nuevo conjunto ocupa ese lugar sin superponerse al anterior.

En **Ambiente → Escenario**, **Automático · color de la tapa** toma un tono de la portada para el escenario. Si no encuentra un tono útil, usa Arena. El botón **Luz de ventana** permite elegir lino cálido con sombras suaves del marco para cualquier plantilla, sin cambiar el guion.

En **Ambiente**, elegí el **Fondo**, activá **Usar mesa** y elegí el **Mantel** por separado. Fondo y mantel admiten presets y color propio; cambiar el fondo conserva el mantel. Sin mesa solo se ve el fondo, y al encenderla vuelve el mantel elegido. **Sombra de ventana** se combina con ambos (0% la apaga); **Sombras de contacto** queda en Más ajustes. Los borradores con escenarios mantel-* migran al fondo de la plantilla, con mantel y mesa encendida. Estos ajustes quedan guardados con el video.

## Tamaños y destinos

Los números identifican casilleros, no páginas. El número visible de página empieza en 1; el motor usa índices desde 0. Las tapas no son destinos válidos.

Las figuritas conservan sus proporciones y orientación original al pegarse. Las horizontales giran para entrar al paquete y se enderezan durante el vuelo. Al llegar al papel se curvan y se aplanan progresivamente desde un borde; al terminar pasan a la textura de la página y acompañan su curvatura durante los giros. Si el tamaño físico no entra alrededor del destino elegido, se reduce proporcionalmente y el editor lo avisa. No se gira ni se recorta para ajustarla.

Las imágenes y el paquete se guardan por nombre de álbum en el navegador, mediante IndexedDB. Si ese almacenamiento está bloqueado, el respaldo dura sólo mientras la aplicación sigue abierta. Los PDFs no se copian al repositorio ni se suben a un servidor. Las miniaturas del guion conservan las páginas originales.

## Verificación

- `npm test` y `npm run build`.
- Desde `motion/`, con el visualizador corriendo: `node scripts/slots-e2e.mjs <álbum.pdf> [URL]`.
- `node scripts/figuritas-e2e.mjs <álbum.pdf> <figuritas.pdf> <paquete.pdf> [URL]` recorre la interfaz, valida recursos/destinos, búsqueda hacia atrás, persistencia, barra y exportación 9:16 + 16:9. Las muestras quedan en `motion/out/figuritas-e2e/`, ignoradas por Git.
- `node scripts/ui-shots.mjs <álbum.pdf> out/ui-shots/u5 --figuritas <hoja.pdf> --paquete <troquel.pdf>` agrega capturas de escritorio del panel vacío, cargado, con **Ajustar** abierto y del final del panel; comprueba orientación, desplazamiento corto, tabulación y pie visible. Sin esos flags conserva las capturas habituales.
- `node scripts/ventana-e2e.mjs [URL]` genera una muestra genérica de la plantilla para revisión visual en `motion/out/ventana/`.
- `node scripts/entorno-e2e.mjs [URL]` comprueba el título en cuadro 0, reproducción desde el inicio, intensidad de ventana sobre mantel, persistencia, mesa y oclusión; muestras genéricas en `motion/out/entorno/`.
- `node scripts/camera-motion-e2e.mjs [URL]` verifica zoom y lateral por toma, ambos puntos, reproducción acotada, persistencia, desactivación y exportación MP4 real.

La música opcional (T-008) queda para una etapa posterior por decisión del usuario.

La cámara se maneja en la vista previa: click izquierdo gira (sobre el libro en Foto pasa o arrastra hojas), click derecho mira, W/A/S/D desplazan en el plano de vista y Q/E bajan/suben. La rueda acerca/aleja; + y - siguen disponibles y 0 vuelve a la vista inicial. En Video se guarda el encuadre por toma al terminar el gesto, persiste al recargar y se usa al exportar MP4. Durante la reproducción los controles se deshabilitan. Restablecer encuadre borra la pose libre y el acercamiento antiguo; zoom suave y movimiento lateral siguen siendo opcionales.

## Textos independientes (F-3a)

Los textos ya no pertenecen a una escena: Textos y marca muestra una lista con contenido, inicio y duración propios. La escena Figuritas no tiene un campo de frase; al reordenar o ajustar escenas los ítems conservan sus tiempos. Los videos nuevos traen los cuatro textos de la plantilla y los borradores v1 migran a v2 conservando título, línea chica, llamado, usuario y frases guardadas. Mi marca sólo se usa al crear un video.

La migración calcula los intervalos con los pesos y mínimos de v1 sin ejecutar el render 3D. Con medidas del libro omite escenas que no pueden abrirse. Como el borrador no contiene los assets de Figuritas (se cargan por separado), su intervalo se aproxima con el peso base. El dibujo avanzado, las fuentes subidas y la manipulación visual quedan para F-3b/F-3c.
