/**
 * Acceso de desarrollo al orquestador de videos (sólo en `npm run dev`, como
 * `window.promoLab`): lo usan los scripts de punta a punta para generar muestras
 * sin pasar por la interfaz.
 */
export { compileProject, sampleCamera } from './compile';
export { FORMATS } from './model';
export { recordTimeline, renderStills } from './record';
export { projectFromTemplate, SCENES, TEMPLATES, TYPOGRAPHY } from './templates';
export { SET_PRESETS } from '../book/StageSet';

/** Blob → base64 (para sacarlo del navegador desde Playwright). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
