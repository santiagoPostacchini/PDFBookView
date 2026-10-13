import type { Timeline } from './compile';
import type { TypographyId } from './model';
import { TYPOGRAPHY } from './templates';

/**
 * Textos en pantalla del video (título, frases y cierre), dibujados en un canvas
 * 2D encima del cuadro 3D. Animaciones sobrias (aparecer subiendo, el interletrado
 * que se cierra, una línea que crece) y siempre dentro de las zonas seguras.
 */

export interface OverlayTheme {
  text: string;
  /** Halo suave para que el texto se lea sobre cualquier imagen. */
  halo: string;
}

/** Texto oscuro sobre escenarios claros y claro sobre escenarios oscuros. */
export function overlayTheme(setColor: string): OverlayTheme {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(setColor.slice(i, i + 2), 16) / 255);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma > 0.45 ? { text: '#3a2a1f', halo: 'rgba(255, 249, 240, 0.55)' } : { text: '#fbf3e8', halo: 'rgba(10, 8, 6, 0.45)' };
}

const loaded = new Set<TypographyId>();
let stylesheet: Promise<void> | null = null;

/** Declara las tipografías autoalojadas (public/fonts/promo.css). Los archivos bajan recién cuando se usan. */
function fontStylesheet(): Promise<void> {
  stylesheet ??= new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL(`${import.meta.env.BASE_URL}fonts/promo.css`, document.baseURI).href;
    link.onload = () => resolve();
    link.onerror = () => {
      stylesheet = null;
      link.remove();
      reject(new Error('No se pudieron cargar las tipografías del video.'));
    };
    document.head.appendChild(link);
  });
  return stylesheet;
}

/** Carga las tipografías de una combinación y espera a que el canvas pueda usarlas. */
export async function loadTypography(id: TypographyId): Promise<void> {
  if (loaded.has(id)) return;
  const t = TYPOGRAPHY[id];
  await fontStylesheet();
  const faces = await Promise.all([
    document.fonts.load(`${t.displayWeight} 96px "${t.display}"`),
    t.italic ? document.fonts.load(`italic 500 64px "${t.display}"`) : Promise.resolve([true]),
    document.fonts.load(`500 32px "${t.body}"`),
  ]);
  if (faces.some((list) => list.length === 0)) throw new Error('No se pudieron cargar las tipografías del video.');
  loaded.add(id);
}

/** Adaptación mínima por ítem; composición avanzada y fuentes user corresponden a F-3b. */
export async function loadTextFonts(timeline: Timeline): Promise<void> {
  const ids = [...new Set(timeline.cues.map(c => c.font.replace('builtin:', '')).filter((id): id is TypographyId => id in TYPOGRAPHY))];
  await Promise.all(ids.map(loadTypography));
}
export function drawOverlay(ctx: CanvasRenderingContext2D, timeline: Timeline, t: number, theme: OverlayTheme): void {
  const { width, height } = ctx.canvas;
  for (const cue of timeline.cues) {
    if (t < cue.start || t > cue.end) continue;
    const font = TYPOGRAPHY[cue.font.replace('builtin:', '') as TypographyId] ?? TYPOGRAPHY.clasica;
    const enter = cue.animation === 'ninguna' || cue.start === 0 ? 1 : Math.min(1, Math.max(0, (t - cue.start) / Math.min(0.4, (cue.end - cue.start) / 2)));
    ctx.save();
    ctx.globalAlpha = enter;
    ctx.fillStyle = cue.color === 'auto' ? theme.text : cue.color;
    ctx.shadowColor = theme.halo;
    ctx.shadowBlur = height * 0.006;
    ctx.font = `${cue.bold ? 700 : font.displayWeight} ${cue.size * height}px "${font.display}", serif`;
    ctx.textAlign = cue.align === 'izquierda' ? 'left' : cue.align === 'derecha' ? 'right' : 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cue.text, cue.x * width, cue.y * height + (cue.animation === 'subir' ? (1 - enter) * height * 0.015 : 0), width * 0.84);
    ctx.restore();
  }
}
