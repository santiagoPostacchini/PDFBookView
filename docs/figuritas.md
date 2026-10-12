# Figuritas en el visualizador

## Cómo probarlo

1. Cargá el álbum PDF y elegí el modo de lectura correcto. Para un álbum de dos páginas por hoja, usá **Revista DIY / Cuadernillo** y verificá el armado en **Hojas**.
2. Abrí **Estudio → Video promocional** y elegí la plantilla **Figuritas**, o usá **Agregar figuritas al video** para conservar tu estilo y guion.
3. En **Historia**, tocá la tarjeta **Figuritas** del guion. Cargá la hoja PDF de figuritas o imágenes individuales.
4. El editor detecta los números y elige hasta tres figuritas automáticamente. Podés seleccionar hasta seis por escena, corregir números y elegir **Casillero Nº…** o una **Página…** interior, centrada. Para usar más de seis, agregá otra escena de Figuritas.
5. Cargá el diseño del paquete como PDF de troquel o imagen, o elegí **Usar paquete básico**. El recorte del PDF reconoce el troquel de referencia (A4 apaisado, panel de frente a la derecha del panel del dorso); otros troqueles deben prepararse como imagen de frente.
6. Usá **Ver cómo se pegan** para reproducir la animación desde esa escena. El botón principal del guion reproduce desde el principio. En **Exportar**, elegí uno o varios formatos; se descargan los MP4 con un solo clic.

El botón de la barra superior permite ocultarla; **Mostrar barra** la recupera. El video aprovecha el espacio liberado y la preferencia se recuerda.

Todas las plantillas empiezan con **planos fijos con cortes**. El guion alterna tapa, apertura, doble página, detalle y vista cenital. En **Historia → Movimiento de esta toma → Acercamiento de esta toma** podés elegir el zoom fijo, entre el encuadre original y el doble de acercamiento, sin activar ningún movimiento. Podés dejar elementos fuera del cuadro según tu preferencia; el valor se guarda por toma.

Para darle movimiento a una toma, elegila en **Historia → Movimiento de esta toma**. **Activar zoom suave** permite definir el acercamiento inicial y final entre 0% y 10%; si el inicial es mayor, la cámara se aleja. **Activar movimiento lateral** permite elegir dirección y recorrido, hasta 15% del ancho de una página. **Girar alrededor del centro del álbum** convierte ese desplazamiento en una órbita suave de hasta 9°, con el centro en foco. Podés combinarlo con el zoom. **Ver punto inicial**, **Ver punto final** y **Ver esta toma** permiten revisar el recorrido antes de exportar. Apagar los movimientos vuelve al plano fijo y conserva los valores para reactivarlos. Cada toma guarda sus ajustes, que también se aplican al MP4.

El título de **Al empezar** aparece en la primera toma utilizable, aunque hayas movido **Portada** al final o la hayas quitado. No vuelve a aparecer al mostrar la tapa más adelante. Después del último pegado, el paquetito se desplaza hacia la derecha del álbum y se acuesta junto a otros dos sobres, formando un abanico de tres con el frente hacia arriba. El mazo permanece durante las tomas siguientes; los planos generales y el cierre lo incluyen completo. Buscar hacia atrás recupera su entrada. Si agregás otra escena de figuritas, el nuevo conjunto ocupa ese lugar sin superponerse al anterior.

En **Ambiente → Escenario**, **Automático · color de la tapa** toma un tono de la portada para el escenario. Si no encuentra un tono útil, usa Arena. El botón **Luz de ventana** permite elegir lino cálido con sombras suaves del marco para cualquier plantilla, sin cambiar el guion.

En **Manteles**, elegí cuadros rosa, cuadros azul o rayas salvia. En **Luz**, **Sombra de ventana** ajusta cuánto se ve el marco sobre cualquier superficie o mantel; 0% lo apaga. **Sombras de contacto** regula la oclusión ambiental y **Mostrar mesa con bordes y patas** permite alternar entre una mesa finita y la superficie extendida. Estos ajustes quedan guardados con el video. El antialiasing se aplica automáticamente.

## Tamaños y destinos

Los números identifican casilleros, no páginas. El número visible de página empieza en 1; el motor usa índices desde 0. Las tapas no son destinos válidos.

Las figuritas conservan sus proporciones y orientación original al pegarse. Las horizontales giran para entrar al paquete y se enderezan durante el vuelo. Al llegar al papel se curvan y se aplanan progresivamente desde un borde; al terminar pasan a la textura de la página y acompañan su curvatura durante los giros. Si el tamaño físico no entra alrededor del destino elegido, se reduce proporcionalmente y el editor lo avisa. No se gira ni se recorta para ajustarla.

Las imágenes y el paquete se guardan por nombre de álbum en el navegador, mediante IndexedDB. Si ese almacenamiento está bloqueado, el respaldo dura sólo mientras la aplicación sigue abierta. Los PDFs no se copian al repositorio ni se suben a un servidor. Las miniaturas del guion conservan las páginas originales.

## Verificación

- `npm test` y `npm run build`.
- Desde `motion/`, con el visualizador corriendo: `node scripts/slots-e2e.mjs <álbum.pdf> [URL]`.
- `node scripts/figuritas-e2e.mjs <álbum.pdf> <figuritas.pdf> <paquete.pdf> [URL]` recorre la interfaz, valida recursos/destinos, búsqueda hacia atrás, persistencia, barra y exportación 9:16 + 16:9. Las muestras quedan en `motion/out/figuritas-e2e/`, ignoradas por Git.
- `node scripts/ventana-e2e.mjs [URL]` genera una muestra genérica de la plantilla para revisión visual en `motion/out/ventana/`.
- `node scripts/entorno-e2e.mjs [URL]` comprueba el título en cuadro 0, reproducción desde el inicio, intensidad de ventana sobre mantel, persistencia, mesa y oclusión; muestras genéricas en `motion/out/entorno/`.
- `node scripts/camera-motion-e2e.mjs [URL]` verifica zoom y lateral por toma, ambos puntos, reproducción acotada, persistencia, desactivación y exportación MP4 real.

La música opcional (T-008) queda para una etapa posterior por decisión del usuario.
