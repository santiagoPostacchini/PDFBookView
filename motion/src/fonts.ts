import { loadFont as caveat } from '@remotion/google-fonts/Caveat';
import { loadFont as dancingScript } from '@remotion/google-fonts/DancingScript';
import { loadFont as fredoka } from '@remotion/google-fonts/Fredoka';
import { loadFont as montserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as pacifico } from '@remotion/google-fonts/Pacifico';
import { loadFont as playfairDisplay } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as poppins } from '@remotion/google-fonts/Poppins';

/**
 * Tipografías disponibles para los temas. Para sumar una, importar su
 * `loadFont` de @remotion/google-fonts y agregarla acá.
 */
const FONTS = {
  Caveat: () => caveat('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily,
  DancingScript: () => dancingScript('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily,
  Fredoka: () => fredoka('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily,
  Montserrat: () => montserrat('normal', { weights: ['500', '800'], subsets: ['latin'] }).fontFamily,
  Pacifico: () => pacifico('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily,
  PlayfairDisplay: () => playfairDisplay('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily,
  Poppins: () => poppins('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily,
} as const;

export type FontId = keyof typeof FONTS;

const loaded = new Map<FontId, string>();

/** Carga la fuente (una sola vez) y devuelve su font-family. */
export function fontFamily(id: FontId): string {
  let family = loaded.get(id);
  if (!family) {
    family = FONTS[id]();
    loaded.set(id, family);
  }
  return family;
}
