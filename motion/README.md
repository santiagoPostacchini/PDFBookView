# Motion graphics y scripts de punta a punta

Proyecto aparte de la app. Tiene dos usos:

- **Motion graphics de 10 s (Remotion)** a partir de un video exportado por el editor de la app y de la temática de cada álbum.
- **Scripts headless (Playwright + el Chrome de Remotion)** que manejan la app real: pruebas de punta a punta, muestras de video, el álbum de ejemplo y las miniaturas de las plantillas.

```bash
npm install
npm run studio                                                   # editor visual de Remotion
npx remotion render src/index.ts Vertical out/album.mp4 --props=albums/album.json
npx remotion render src/index.ts Cuadrado out/album-1x1.mp4 --props=albums/album-1x1.json
npx remotion still  src/index.ts Vertical out/f120.png --frame=120 --props=albums/album.json
```

## Por álbum

1. Copiar el video exportado a `public/<album>/promo-9x16.mp4` (o `promo-1x1.mp4`).
2. Crear `albums/<album>.json` a partir de `albums/ejemplo.json`: textos, paleta, tipografías (`src/fonts.ts`), motivo (`hearts`, `paws`, `stars`, `sparkles`, `flowers`, `balloons`, `confetti`) y el tramo del video (`videoStart`, `videoSpeed`).
3. Renderizar la composición `Vertical` (1080×1920) o `Cuadrado` (1080×1080).

Estructura de los 10 s: título letra por letra con motivos → video en una tarjeta con frases tipo sticker → cierre con barrido de color, llamado a la acción y usuario. Todo en `src/AlbumPromo.tsx`.

Los videos (`public/*/`) y los temas de clientes (`albums/*.json`) no se versionan: el repositorio es público.

## Scripts (con la app corriendo: `npm run dev` en la raíz)

```bash
# Álbum de ejemplo (sin datos de clientes): out/demo/album-demo.pdf
node scripts/demo-album.mjs

# Punta a punta: carga el PDF, saca una foto y arma y exporta un video con el editor
node scripts/studio-e2e.mjs out/demo/album-demo.pdf --mode simple --template ritmo --formats 9:16,1:1 --drag --out out/e2e

# Foto: superficies, persistencia, cambio Foto/Video y alfa real de los PNG
node scripts/photo-e2e.mjs out/demo/album-demo.pdf

# Muestras sin interfaz: cuadros por escena, hoja de contacto y (con --video) el MP4
node scripts/promo-sample.mjs out/demo/album-demo.pdf --template clasica --format 9:16 --video

# Miniaturas de las plantillas del editor (public/promo/plantilla-<id>.jpg)
node scripts/template-previews.mjs

# Hoja de contacto de cualquier lista de imágenes
node scripts/contact-sheet.mjs out/hoja.png "Antes=a.png" "Ahora=b.png" --title "Comparación"
```

`promo-sample.mjs --block "fonts.g*"` corta los pedidos a Google Fonts: sirve para comprobar que los textos del video usan las tipografías autoalojadas.

## Licencia de Remotion

Remotion es gratis para personas y empresas de hasta 3 empleados; por encima de eso requiere licencia de empresa (remotion.pro).
