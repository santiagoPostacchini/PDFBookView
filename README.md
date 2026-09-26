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

## Extender

- **Otro modo de lectura:** agregar una función en `layouts.ts` que devuelva `BookLayout`.
- **Otra fuente de páginas:** implementar `PageImageProvider` (`book/types.ts`).
- **Estética:** luces y sombras en `Stage.ts`; papel en `paperMaterial.ts`; tapas rígidas con `hardCovers` en `BookOptions`.

## Nota

pdf.js dibuja en tramos sincronizados con `requestAnimationFrame`: si la pestaña queda oculta, el rasterizado se pausa hasta volver a ella.
