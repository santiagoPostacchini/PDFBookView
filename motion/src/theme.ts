import type { FontId } from './fonts';
import type { MotifId } from './motifs';

/**
 * Temática de un álbum: todo lo que cambia entre un motion graphics y otro.
 * Un archivo por álbum en `albums/<nombre>.json`.
 */
export type AlbumTheme = {
  /** Video exportado desde el Estudio, relativo a `public/` (p. ej. "nataly/promo-9x16.mp4"). */
  video: string;
  /** Segundo del video original desde el que se toma el fragmento. */
  videoStart: number;
  /** Velocidad del fragmento (1 = normal; 1.4 acelera un video de 15 s para que entre más). */
  videoSpeed: number;
  title: string;
  subtitle: string;
  /** 2–3 frases cortas que aparecen como stickers sobre el video. */
  captions: string[];
  cta: string;
  handle: string;
  palette: {
    /** Fondo: degradé de bg a bg2. */
    bg: string;
    bg2: string;
    /** Color principal (stickers, cierre). */
    primary: string;
    accent: string;
    text: string;
    /** Marco del video. */
    card: string;
    /** Texto sobre `primary`. */
    onPrimary: string;
  };
  fonts: { display: FontId; body: FontId };
  motif: MotifId;
  motifColors: string[];
};

export const exampleTheme: AlbumTheme = {
  video: '',
  videoStart: 2,
  videoSpeed: 1.2,
  title: 'Tu álbum',
  subtitle: 'Hecho a mano, página por página',
  captions: ['Tus fotos', 'Tus recuerdos', 'Tu historia en papel'],
  cta: 'Pedí el tuyo',
  handle: '@tu.marca',
  palette: {
    bg: '#f6efe4',
    bg2: '#e7d6bf',
    primary: '#c2562f',
    accent: '#2f5d62',
    text: '#2b2118',
    card: '#ffffff',
    onPrimary: '#ffffff',
  },
  fonts: { display: 'PlayfairDisplay', body: 'Poppins' },
  motif: 'sparkles',
  motifColors: ['#c2562f', '#2f5d62', '#e0a458'],
};
