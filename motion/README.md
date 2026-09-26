# Motion graphics de álbumes (Remotion)

Proyecto aparte de la app: arma piezas de 10 s para redes a partir del video promocional que exporta el **Estudio** de la app y de la temática de cada álbum.

```bash
npm install
npm run studio                                                   # editor visual de Remotion
npx remotion render src/index.ts Vertical out/album.mp4 --props=albums/album.json
npx remotion render src/index.ts Cuadrado out/album-1x1.mp4 --props=albums/album-1x1.json
npx remotion still  src/index.ts Vertical out/f120.png --frame=120 --props=albums/album.json
```

## Por álbum

1. Copiar el video del Estudio a `public/<album>/promo-9x16.mp4` (o `promo-1x1.mp4`).
2. Crear `albums/<album>.json` a partir de `albums/ejemplo.json`: textos, paleta, tipografías (`src/fonts.ts`), motivo (`hearts`, `paws`, `stars`, `sparkles`, `flowers`, `balloons`, `confetti`) y el tramo del video (`videoStart`, `videoSpeed`).
3. Renderizar la composición `Vertical` (1080×1920) o `Cuadrado` (1080×1080).

Estructura de los 10 s: título letra por letra con motivos → video en una tarjeta con frases tipo sticker → cierre con barrido de color, llamado a la acción y usuario. Todo en `src/AlbumPromo.tsx`.

Los videos (`public/*/`) y los temas de clientes (`albums/*.json`) no se versionan: el repositorio es público.

## Video promocional sin abrir el navegador

`scripts/studio-e2e.mjs` maneja la app real en Chrome headless (el que descarga Remotion): carga el PDF, abre el Estudio, saca una foto y exporta el video. Sirve como prueba de punta a punta y para generar el video de un álbum desde la consola.

```bash
# con la app corriendo (npm run dev en la raíz)
node scripts/studio-e2e.mjs ruta/al/album.pdf --out out/e2e --style elegante --format 9:16 --duration 15 --backdrop rosa --lighting suave
```

## Licencia de Remotion

Remotion es gratis para personas y empresas de hasta 3 empleados; por encima de eso requiere licencia de empresa (remotion.pro).
