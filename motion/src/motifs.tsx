import type { CSSProperties } from 'react';

/** Motivos decorativos por temática (SVG 24×24). */
export const MOTIFS = {
  hearts: <path d="M12 21s-7.4-4.5-9.4-9.1C1.2 8.6 3.3 5 6.8 5c2 0 3.5 1.1 5.2 3 1.7-1.9 3.2-3 5.2-3 3.5 0 5.6 3.6 4.2 6.9C19.4 16.5 12 21 12 21z" />,
  paws: (
    <>
      <ellipse cx="6" cy="9.5" rx="2.1" ry="2.7" />
      <ellipse cx="10" cy="6" rx="2.1" ry="2.8" />
      <ellipse cx="14.5" cy="6" rx="2.1" ry="2.8" />
      <ellipse cx="18.4" cy="9.6" rx="2.1" ry="2.7" />
      <path d="M12.2 11.2c3 0 6.3 3.6 6.3 6.3 0 2.4-2.1 3-3.4 2.6-1.2-.4-1.9-.9-2.9-.9s-1.7.5-2.9.9c-1.3.4-3.4-.2-3.4-2.6 0-2.7 3.3-6.3 6.3-6.3z" />
    </>
  ),
  stars: <path d="M12 2.5l2.8 6.1 6.6.7-5 4.5 1.4 6.6L12 17l-5.8 3.4 1.4-6.6-5-4.5 6.6-.7z" />,
  sparkles: <path d="M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5C11.3 16.9 7.1 12.7 1.5 12 7.1 11.3 11.3 7.1 12 1.5z" />,
  flowers: (
    <>
      <circle cx="12" cy="6.5" r="4" />
      <circle cx="17.2" cy="10.3" r="4" />
      <circle cx="15.2" cy="16.4" r="4" />
      <circle cx="8.8" cy="16.4" r="4" />
      <circle cx="6.8" cy="10.3" r="4" />
      <circle cx="12" cy="12" r="3" fill="#fff6d8" />
    </>
  ),
  balloons: (
    <>
      <ellipse cx="12" cy="9" rx="6" ry="7.5" />
      <path d="M12 16.5l-1.2 1.6h2.4z" />
      <path d="M12 18.1c-1 2 1 3 0 5" fill="none" stroke="currentColor" strokeWidth="0.8" />
    </>
  ),
  confetti: <rect x="8" y="4" width="8" height="16" rx="2" />,
} as const;

export type MotifId = keyof typeof MOTIFS;

export function Motif({ id, color, size, style }: { id: MotifId; color: string; size: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} color={color} style={{ position: 'absolute', overflow: 'visible', ...style }}>
      {MOTIFS[id]}
    </svg>
  );
}
