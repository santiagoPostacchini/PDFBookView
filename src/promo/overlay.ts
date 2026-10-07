import type { OverlayCue, Timeline } from './compile';
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

/** Carga las tipografías y espera a que el canvas pueda usarlas. */
export async function loadTypography(id: TypographyId): Promise<void> {
  if (loaded.has(id)) return;
  const t = TYPOGRAPHY[id];
  if (!document.querySelector(`link[data-promo-font="${id}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${t.css}&display=block`;
    link.dataset.promoFont = id;
    const ready = new Promise<void>((resolve, reject) => {
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('No se pudieron cargar las tipografías del video.'));
    });
    document.head.appendChild(link);
    await ready;
  }
  await Promise.all([
    document.fonts.load(`${t.displayWeight} 96px "${t.display}"`),
    document.fonts.load(`italic 500 64px "${t.display}"`),
    document.fonts.load(`400 32px "${t.body}"`),
    document.fonts.load(`500 32px "${t.body}"`),
  ]);
  loaded.add(id);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;

interface Layout {
  /** Escala respecto de un cuadro de 1080 px de lado corto. */
  unit: number;
  /** Escala extra de los títulos (en cuadrado hay menos alto disponible). */
  head: number;
  align: 'center' | 'left';
  x: number;
  maxWidth: number;
  /** Arriba del bloque de título/cierre y centro de las frases. */
  headTop: number;
  captionY: number;
  /** Las frases siempre van centradas abajo. */
  captionX: number;
}

/**
 * Zonas seguras: Reels/TikTok tapan ~13 % arriba, la columna de botones a la
 * derecha y abajo el usuario y la descripción (~25 %; en anuncios, hasta 35 %).
 */
function layoutFor(w: number, h: number): Layout {
  const unit = Math.min(w, h) / 1080;
  const aspect = w / h;
  if (aspect > 1.3) return { unit, head: 0.85, align: 'left', x: w * 0.07, maxWidth: w * 0.34, headTop: h * 0.3, captionX: w * 0.5, captionY: h * 0.92 };
  if (aspect < 0.7) return { unit, head: 1, align: 'center', x: w * 0.48, maxWidth: w * 0.76, headTop: h * 0.15, captionX: w * 0.48, captionY: h * 0.725 };
  return { unit, head: 0.72, align: 'center', x: w * 0.5, maxWidth: w * 0.84, headTop: h * 0.06, captionX: w * 0.5, captionY: h * 0.915 };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Opacidad y desplazamiento de un elemento que entra en `delay` y sale al final del cue. */
function motion(cue: OverlayCue, t: number, delay: number, unit: number) {
  const enter = easeOut((t - cue.start - delay) / 0.7);
  const exit = cue.end >= Number.MAX_SAFE_INTEGER ? 1 : 1 - easeOut((t - (cue.end - 0.45)) / 0.45);
  return { alpha: Math.min(enter, exit), dy: (1 - enter) * 26 * unit - (1 - exit) * 10 * unit, enter };
}

export function drawOverlay(ctx: CanvasRenderingContext2D, timeline: Timeline, t: number, theme: OverlayTheme): void {
  const { width: w, height: h } = ctx.canvas;
  const font = TYPOGRAPHY[timeline.typography];
  const L = layoutFor(w, h);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = L.align;
  for (const cue of timeline.cues) {
    if (t < cue.start || t > cue.end) continue;
    const end = cue.end >= timeline.duration ? { ...cue, end: Number.MAX_SAFE_INTEGER } : cue;
    if (cue.kind === 'frase') drawCaption(ctx, end, t, L, font, theme);
    else drawHead(ctx, end, t, L, font, theme);
  }
  ctx.restore();
}

type Font = (typeof TYPOGRAPHY)[TypographyId];

function setHalo(ctx: CanvasRenderingContext2D, theme: OverlayTheme, unit: number) {
  ctx.shadowColor = theme.halo;
  ctx.shadowBlur = 22 * unit;
  ctx.shadowOffsetY = 0;
}

/** Título de apertura o cierre: línea chica + texto grande + filete. */
function drawHead(ctx: CanvasRenderingContext2D, cue: OverlayCue, t: number, L: Layout, font: Font, theme: OverlayTheme) {
  const u = L.unit * L.head;
  const isTitle = cue.kind === 'titulo';
  const [small, big] = isTitle ? cue.lines : [cue.lines[1], cue.lines[0]];
  const bigSize = (isTitle ? 132 : 124) * u;
  ctx.font = `${font.displayWeight} ${bigSize}px "${font.display}"`;
  const bigLines = wrap(ctx, big ?? '', L.maxWidth);
  let y = L.headTop;
  setHalo(ctx, theme, u);
  ctx.fillStyle = theme.text;

  // En la apertura, la línea chica va arriba; en el cierre, el usuario va abajo.
  const drawSmall = (delay: number) => {
    if (!small) return;
    const m = motion(cue, t, delay, u);
    const size = (isTitle ? 32 : 42) * u;
    ctx.globalAlpha = m.alpha * 0.88;
    ctx.font = `500 ${size}px "${font.body}"`;
    ctx.letterSpacing = `${((isTitle ? 0.28 : 0.06) + (1 - m.enter) * 0.12) * size}px`;
    ctx.fillText(isTitle ? small.toUpperCase() : small, L.x, y + size + m.dy);
    ctx.letterSpacing = '0px';
    y += size + 36 * u;
  };

  if (isTitle) drawSmall(0);
  const m = motion(cue, t, isTitle ? 0.12 : 0, u);
  ctx.globalAlpha = m.alpha;
  ctx.font = `${font.displayWeight} ${bigSize}px "${font.display}"`;
  ctx.letterSpacing = `${(1 - m.enter) * 0.05 * bigSize}px`;
  for (const line of bigLines) {
    y += bigSize * 0.92;
    ctx.fillText(line, L.x, y + m.dy);
  }
  ctx.letterSpacing = '0px';
  y += 52 * u;

  // Filete que crece desde el centro (o desde el margen, alineado a la izquierda).
  const r = motion(cue, t, isTitle ? 0.4 : 0.25, u);
  const ruleWidth = 72 * u * r.enter;
  ctx.globalAlpha = r.alpha * 0.8;
  ctx.shadowBlur = 0;
  const rx = L.align === 'center' ? L.x - ruleWidth / 2 : L.x;
  ctx.fillRect(rx, y, ruleWidth, Math.max(1, 2.5 * u));
  y += 26 * u;
  setHalo(ctx, theme, u);
  if (!isTitle) drawSmall(0.35);
  ctx.globalAlpha = 1;
}

/** Frase de escena: una línea elegante, abajo, dentro de la zona segura. */
function drawCaption(ctx: CanvasRenderingContext2D, cue: OverlayCue, t: number, L: Layout, font: Font, theme: OverlayTheme) {
  const u = L.unit;
  const size = (font.display === 'Caveat' ? 84 : 70) * u * (L.align === 'left' ? 0.85 : 1);
  const m = motion(cue, t, 0, u);
  ctx.globalAlpha = m.alpha;
  setHalo(ctx, theme, u);
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'center';
  ctx.font = `${font.display === 'Caveat' ? 600 : 'italic 500'} ${size}px "${font.display}"`;
  const lines = wrap(ctx, cue.lines[0] ?? '', Math.max(L.maxWidth, ctx.canvas.width * 0.7));
  let y = L.captionY - ((lines.length - 1) * size * 1.05) / 2;
  for (const line of lines) {
    ctx.fillText(line, L.captionX, y + m.dy);
    y += size * 1.05;
  }
  ctx.textAlign = L.align;
  ctx.globalAlpha = 1;
}
