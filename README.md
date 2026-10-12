# PDF Book View

Visor que convierte un PDF en un libro 3D interactivo (flipbook), con un editor de hojas físicas para PDFs maquetados como revista / cuadernillo.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests de la imposición y del guardado
npm run build      # estático en dist/ (incluye los recursos de pdf.js)
```

## Stack

| Capa | Librería | Rol |
| --- | --- | --- |
| Rasterizado | `pdfjs-dist` 6 | PDF → `<canvas>` por página, en un worker |
| Recorte | Canvas 2D | cada página del PDF se corta por el eje vertical en dos páginas del libro |
| 3D | `three` 0.186 | escena, hojas deformables, sombras, `OrbitControls` |
| UI | React 19 + Vite | barra, editor de hojas, tira de páginas |

## Arquitectura

```
src/
  pdf/                       ← no sabe nada de 3D
    imposition.ts            modelo de hojas físicas + des-imposición (lógica pura, testeada)
    layouts.ts               modos de lectura → páginas lógicas (página del PDF + recorte)
    planStorage.ts           guarda/recupera el plan de hojas por archivo (localStorage)
    pdfSource.ts             pdf.js: abrir, medir, rasterizar con caché
    pageExtraction.ts        recorte de mitades, páginas en blanco, deimposeBooklet()
    slots.ts                 casilleros numerados del álbum (texto del PDF → página lógica y posición)
    PdfPageProvider.ts       proveedor perezoso de páginas para el libro
  book/                      ← no sabe nada de PDFs (sólo PageImageProvider)
    BookEngine.ts            renderer, cámara, controles, bucle (dibuja sólo si algo cambia)
    Book.ts                  pilas de hojas, navegación, arrastre
    Leaf.ts                  malla de una hoja: BoxGeometry con espesor, material frente (+z) / dorso (−z)
    paperDeformer.ts         curvado del papel por longitud de arco (la hoja no se estira)
    flipAnimation.ts         curvas de giro automático
    paperMaterial.ts         MeshStandardMaterial + sombra de lomo en el shader
    PageTextureManager.ts    prioridad de carga, miniaturas, liberación de texturas lejanas
    PageInteraction.ts       clic/arrastre sobre las hojas vs. órbita de cámara
    Stage.ts                 luces y sombras (punto de extensión estético)
  ui/                        componentes React (SheetEditor, Filmstrip, …)
```

## Modo Revista DIY: hojas físicas

Cada hoja de papel (de la exterior, k = 0, a la central) tiene un **frente** y un **dorso**. A cada cara se le asigna una página del PDF (o se deja vacía), opcionalmente con las **mitades invertidas**. Cada mitad cae en una página del libro según la encuadernación, con N = 4·hojas y `[izquierda | derecha]`:

| Encuadernación | Frente | Dorso |
| --- | --- | --- |
| Anidadas (cuadernillo) | `[N−2k \| 2k+1]` | `[2k+2 \| N−2k−1]` |
| Cada hoja doblada por separado | `[4k+4 \| 4k+1]` | `[4k+2 \| 4k+3]` |

`resolvePlan(plan)` devuelve el array en orden de lectura (índice 0 = página 1) con `{ página del PDF, mitad }` o `null` (en blanco). `deimposeBooklet(pdf, plan, opciones)` lo aplica y devuelve los lienzos recortados y ordenados.

El editor muestra cada cara con la miniatura del PDF y el número de página resultante sobre cada mitad, avisa de páginas repetidas o sin usar, y guarda la asignación por nombre de archivo (si el PDF cambia de cantidad de páginas, se avisa y se descartan las referencias inválidas). **Autocompletar** asigna el PDF en orden de impresión a doble faz (PDF 1 → frente hoja 1, PDF 2 → dorso hoja 1, …).

## Estudio: fotos y video promocional

Botón **Estudio** (con un libro cargado):

- **Foto:** luz (Estudio, Cálida, Dramática, Suave, Fría), escenario 3D (superficie lisa, papel o lino, con sombras; colores predefinidos o a elección), encuadre (libre, 1:1, 4:5, 9:16, 16:9 — lo que se ve es lo que se exporta), ángulos predefinidos, lente de 18 a 135 mm conservando el encuadre, profundidad de campo, viñeta, grano y "hoja en el aire". Exporta PNG/JPG en 2K o 4K; la opción Transparente genera un PNG sin escenario.
- **Video promocional:** un editor en cuatro pasos pensado para quien no sabe de cámaras:
  1. **Estilo:** Clásica, Ritmo (más corta, para Reels), Minimal, Ventana o Figuritas. Cada uno trae escenario, luz, ritmo, tipografía y guion inicial. Todos usan planos fijos con cortes entre escenas.
  2. **Historia:** el guion es una fila de escenas debajo del visor (Portada, Apertura, Doble página, Hojeo, Detalle, Vista cenital, Figuritas, Cierre). Cada escena se elige tocándola y se reordena arrastrándola; para cada una se decide qué páginas se ven (o automática), una frase opcional, si es corta, normal o larga y, si se quiere, un movimiento suave de esa toma (acercamiento, desplazamiento lateral, giro) o un acercamiento fijo.
  3. **Textos y marca:** título (aparece en la primera toma), línea chica, llamado a la acción y usuario (estos dos se recuerdan para los próximos álbumes), tipografía y escenario: colores, "Automático" (color de la tapa), luz de ventana graduable y manteles (cuadros rosa, cuadros azul, rayas salvia), más la luz y las sombras de contacto.
  4. **Exportar:** 9:16, 4:5, 1:1 y 16:9 a la vez, duración total, guía de lo que tapa Instagram y vista previa completa.

  **Figuritas:** la escena Figuritas muestra un paquete que se abre, deja salir tus figuritas y las pega en su lugar del álbum. Se cargan desde **Historia → Figuritas** (la hoja de figuritas en PDF o imágenes sueltas, y opcionalmente el diseño del paquete). El número de cada figurita es el **casillero** numerado del álbum, que se lee del texto del PDF; se puede cambiar por otro casillero o por una página, hasta seis por escena. Las horizontales se respetan. Lo que cargues queda guardado en tu navegador, por álbum, y nunca se sube al repositorio. Detalles en [docs/figuritas.md](docs/figuritas.md).

  La barra superior se puede ocultar con el botón de la propia barra (**Mostrar barra** la recupera); el cuadro del video aprovecha el espacio.

  El visor es la vista previa: muestra la escena elegida con sus textos o reproduce el video tal cual se exporta. El video de cada álbum se guarda por nombre de archivo. La grabación es cuadro a cuadro (WebCodecs + mediabunny) a MP4 H.264 de 30 fps, sin cuadros perdidos.

Código: `src/promo/` (proyecto, plantillas, compilador del guion a cámara y textos, vista previa, grabación), `src/promo/figuritas/` (paquete y figuritas), `src/ui/video/` (editor), `src/book/StageSet.ts` (escenario 3D: mesa, manteles, ventana, sombra de contacto, foco y horizonte), `src/book/DofPass.ts` (profundidad de campo sin halos) y `src/book/PostFX.ts` (viñeta, grano, fundidos). Las tipografías del video están autoalojadas en `public/fonts/` (OFL). Los motion graphics especiales se arman aparte, en [`motion/`](motion/README.md).

## Extender

- **Otro modo de lectura:** agregar una función en `layouts.ts` que devuelva `BookLayout`.
- **Otra fuente de páginas:** implementar `PageImageProvider` (`book/types.ts`).
- **Estética:** luces y sombras en `Stage.ts`; papel en `paperMaterial.ts`; tapas rígidas con `hardCovers` en `BookOptions`.

## Nota

pdf.js dibuja en tramos sincronizados con `requestAnimationFrame`: si la pestaña queda oculta, el rasterizado se pausa hasta volver a ella.
