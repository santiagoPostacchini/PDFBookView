import { createReadStream, existsSync, statSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));
/** Recursos que pdf.js descarga a demanda: CMaps, fuentes estándar, decodificadores wasm, perfiles ICC. */
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

/** Sirve los recursos de pdf.js en /pdfjs durante el desarrollo y los copia al build. */
function pdfjsAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pdfjs-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]);
        const file = resolve(pdfjsRoot, `.${path}`);
        const allowed = PDFJS_DIRS.some((dir) => file.startsWith(join(pdfjsRoot, dir) + sep));
        if (!allowed || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    async writeBundle() {
      for (const dir of PDFJS_DIRS) {
        await cp(join(pdfjsRoot, dir), join(outDir, 'pdfjs', dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), pdfjsAssets()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' },
});
