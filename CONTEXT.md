# CONTEXT: PDFBookView

Lectura obligatoria para cualquier agente antes de tocar código. Mantenerlo corto y al día.

## Stack

- Lenguaje / runtime: TypeScript 7 + React 19 sobre Vite 8 (navegador). 3D con three.js 0.186, PDF con pdfjs-dist 6.3, MP4 con WebCodecs + mediabunny.
- Gestor de dependencias: npm (`package-lock.json`). `motion/` es un proyecto aparte (Remotion 4.0.529, Playwright para los scripts headless).

## Comandos

- Instalar: `npm install` (y `npm install` dentro de `motion/` para los scripts y Remotion).
- Desarrollo: `npm run dev` (http://localhost:5173).
- Build: `npm run build` (typecheck + `vite build` a `dist/`).
- Tests: `npm test` (Vitest, entorno node; criterio de aceptación habitual: este comando pasa en verde).
- Typecheck: `npm run typecheck`.
- Muestras de video sin interfaz (con `npm run dev` corriendo): `cd motion && node scripts/promo-sample.mjs <pdf> --template clasica --format 9:16 --video`.
- Álbum de ejemplo sin datos de clientes: `cd motion && node scripts/demo-album.mjs` (genera `out/demo/album-demo.pdf`).
- Tipografías del video: `node scripts/fetch-fonts.mjs` (regenera `public/fonts/`; no editar esos archivos a mano).

## Convenciones

- Código, comentarios, textos de interfaz y documentación en español rioplatense.
- `src/book/`: motor 3D sin React (BookEngine, Book, Leaf, Stage, PostFX). `src/pdf/`: PDF e imposición de hojas. `src/promo/`: orquestador de videos (lógica pura en `compile.ts`, testeable sin navegador). `src/studio/`: video automático anterior (a retirar). `src/ui/`: React.
- La lógica que decide (guiones, imposición, tiempos) es pura y determinista, con tests en `*.test.ts` al lado del módulo.
- Commits en español, en presente y descriptivos.

## Zonas que no se tocan

- `dist/`, `node_modules/`, `motion/out/` (generados).
- `motion/public/*/` y `motion/albums/*.json` salvo `ejemplo.json`: material de clientes, nunca se versiona (el repositorio es público). Tampoco PDFs de clientes.
- `.github/workflows/deploy.yml` (deploy a GitHub Pages): consultar antes de cambiarlo.

## Flujo de trabajo

- Una tarea = una rama (`codex/<slug>` para lo delegado a Codex). Nadie commitea en `main`.
- Cambios de arquitectura o dependencias nuevas: consultar antes.
- Al terminar, actualizar `TASKS.md` (hecho, pendiente, hallazgos).
