import type { OverlayCue, Timeline } from './compile';
import type { TypographyId } from './model';
import { TYPOGRAPHY } from './templates';
import { ensureFont, userFontFamily } from './fonts';

/**
 * Ítems de texto dibujados en el mismo canvas 2D para vista previa y MP4.
 * La posición y alineación son propias del ítem; las guías seguras las pinta preview.
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

export async function loadTextFonts(timeline: Timeline): Promise<void> {
  await Promise.all([...new Set([`builtin:${timeline.textTypography ?? 'clasica'}`, ...timeline.cues.map(c => c.font)])].map(ensureFont));
}
export const CUE_MAX_WIDTH = 0.84;
export const CUE_LINE_HEIGHT = 1.1;
function fontCss(cue: OverlayCue, size: number): string {
  const builtin = TYPOGRAPHY[cue.font.slice(8) as TypographyId] ?? TYPOGRAPHY.clasica;
  const family = cue.font.startsWith('user:') ? cue.font.replace(':', '-') : builtin.display;
  return `${cue.bold ? 700 : builtin.displayWeight} ${size}px "${family}", serif`;
}
/** Caja tipográfica (em), sin halo ni desplazamiento de animación; x es el ancla de alineación. */
export function layoutCue(measure: (text: string, fontCss: string) => number, cue: OverlayCue, frameWidth: number, frameHeight: number) {
  const size = cue.size * frameHeight, css = fontCss(cue, size);
  const max = frameWidth * CUE_MAX_WIDTH;
  const lines: string[] = [];
  for (const paragraph of cue.text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next, css) > max) { lines.push(line); line = ''; }
      else if (line) line += ' ';
      // También parte palabras largas, sin comprimir las letras con fillText(maxWidth).
      for (const char of word) {
        if (line && measure(line + char, css) > max) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  const width = Math.max(0, ...lines.map(line => measure(line, css)));
  const height = size + (lines.length - 1) * size * CUE_LINE_HEIGHT;
  const x = cue.x * frameWidth - (cue.align === 'izquierda' ? 0 : cue.align === 'derecha' ? width : width / 2);
  return { lines, size, fontCss: css, box: { x, y: cue.y * frameHeight - height / 2, width, height } };
}
export function measureCueBox(ctx: CanvasRenderingContext2D, cue: OverlayCue, frameWidth: number, frameHeight: number, fallback: TypographyId = 'clasica') {
  ctx.save();
  const resolved = cue.font.startsWith('user:') && !userFontFamily(cue.font) ? { ...cue, font: `builtin:${fallback}` } : cue;
  try { return layoutCue((text, css) => { ctx.font = css; return ctx.measureText(text).width; }, resolved, frameWidth, frameHeight).box; }
  finally { ctx.restore(); }
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - (1 - clamp(v)) ** 3;
export function cueMotion(cue: OverlayCue, t: number, duration: number, frameHeight: number) {
  if (t < cue.start || t > cue.end) return { alpha: 0, dy: 0 };
  if (cue.animation === 'ninguna') return { alpha: 1, dy: 0 };
  const length = cue.end - cue.start;
  const enter = cue.start === 0 ? 1 : easeOut((t - cue.start) / Math.min(0.7, length / 2));
  const exit = cue.end >= duration ? 1 : 1 - easeOut((t - cue.end + Math.min(0.45, length / 2)) / Math.min(0.45, length / 2));
  return { alpha: Math.min(enter, exit), dy: cue.animation === 'subir' ? (1 - enter) * frameHeight * 0.015 : 0 };
}
function resolvedCue(cue: OverlayCue, timeline: Timeline): OverlayCue {
  return cue.font.startsWith('user:') && !userFontFamily(cue.font) ? { ...cue, font: `builtin:${timeline.textTypography ?? 'clasica'}` } : cue;
}
export function drawOverlay(ctx: CanvasRenderingContext2D, timeline: Timeline, t: number, theme: OverlayTheme): void {
  const { width, height } = ctx.canvas;
  for (const raw of timeline.cues) {
    const motion = cueMotion(raw, t, timeline.duration, height);
    if (motion.alpha <= 0) continue;
    const cue = resolvedCue(raw, timeline);
    ctx.save();
    try {
      const layout = layoutCue((text, css) => { ctx.font = css; return ctx.measureText(text).width; }, cue, width, height);
      ctx.font = layout.fontCss;
      ctx.globalAlpha = motion.alpha;
      ctx.fillStyle = cue.color === 'auto' ? theme.text : cue.color;
      ctx.shadowColor = cue.color === 'auto' ? theme.halo : overlayTheme(cue.color).halo;
      // overlayTheme elige halo claro sobre fondos claros; para texto se invierte.
      if (cue.color !== 'auto') ctx.shadowColor = overlayTheme(cue.color).text === '#3a2a1f' ? 'rgba(10, 8, 6, 0.45)' : 'rgba(255, 249, 240, 0.55)';
      ctx.shadowBlur = height * 0.012;
      ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
      ctx.textBaseline = 'middle';
      ctx.textAlign = cue.align === 'izquierda' ? 'left' : cue.align === 'derecha' ? 'right' : 'center';
      layout.lines.forEach((line, i) => ctx.fillText(line, cue.x * width, layout.box.y + layout.size / 2 + i * layout.size * CUE_LINE_HEIGHT + motion.dy));
    } finally { ctx.restore(); }
  }
}
