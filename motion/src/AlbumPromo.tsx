import type { CSSProperties } from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  random,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { fontFamily } from './fonts';
import { Motif } from './motifs';
import type { AlbumTheme } from './theme';

/**
 * Motion graphics de 10 s para promocionar un álbum:
 *   0–1.5 s  fondo, motivos y título letra por letra
 *   0.7–8 s  el video del álbum entra en una tarjeta; frases tipo sticker
 *   8–10 s   cierre: barrido de color, llamado a la acción y usuario
 * Todo lo variable (colores, tipografías, textos, motivo, tramo del video) viene del tema.
 */

const T = {
  titleIn: 6,
  subtitleIn: 30,
  cardIn: 22,
  captionsFrom: 70,
  captionEvery: 52,
  captionHold: 44,
  outro: 238,
};

export function AlbumPromo(theme: AlbumTheme) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const portrait = height > width * 1.2;
  const display = fontFamily(theme.fonts.display);
  const body = fontFamily(theme.fonts.body);

  // ── Layout según formato ──
  const cardW = portrait ? 760 : 560;
  const cardH = portrait ? Math.round((cardW * 16) / 9) : cardW;
  const cardTop = portrait ? 470 : 330;
  const titleSize = Math.min(portrait ? 112 : 84, (portrait ? 1900 : 1500) / Math.max(8, theme.title.length));

  // ── Tarjeta del video ──
  const cardSpring = spring({ frame: frame - T.cardIn, fps, config: { damping: 14, mass: 0.9 } });
  const outroProgress = interpolate(frame, [T.outro, T.outro + 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const cardStyle: CSSProperties = {
    position: 'absolute',
    left: (width - cardW) / 2,
    top: cardTop,
    width: cardW,
    height: cardH,
    borderRadius: 34,
    padding: 14,
    background: theme.palette.card,
    boxShadow: `0 40px 90px ${theme.palette.text}40, 0 8px 22px ${theme.palette.text}30`,
    transform: `translateY(${(1 - cardSpring) * 900 - outroProgress * 60}px) rotate(${interpolate(cardSpring, [0, 1], [-7, -1.5]) + outroProgress * 4}deg) scale(${1 - outroProgress * 0.18})`,
    opacity: interpolate(frame, [T.cardIn, T.cardIn + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  };

  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${theme.palette.bg} 0%, ${theme.palette.bg2} 100%)`, overflow: 'hidden' }}>
      <Blobs theme={theme} />
      <MotifField theme={theme} portrait={portrait} />

      {/* Título */}
      <div
        style={{
          position: 'absolute',
          top: portrait ? 120 : 52,
          left: 60,
          right: 60,
          textAlign: 'center',
          transform: `translateY(${-outroProgress * 120}px)`,
          opacity: 1 - outroProgress,
        }}
      >
        <SpringText text={theme.title} start={T.titleIn} style={{ fontFamily: display, fontSize: titleSize, color: theme.palette.text, lineHeight: 1.15 }} />
        <div
          style={{
            marginTop: portrait ? 18 : 10,
            fontFamily: body,
            fontWeight: 500,
            fontSize: portrait ? 40 : 30,
            color: theme.palette.accent,
            opacity: interpolate(frame, [T.subtitleIn, T.subtitleIn + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            transform: `translateY(${interpolate(frame, [T.subtitleIn, T.subtitleIn + 14], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
          }}
        >
          {theme.subtitle}
        </div>
      </div>

      {/* Video del álbum */}
      <div style={cardStyle}>
        <div style={{ width: '100%', height: '100%', borderRadius: 22, overflow: 'hidden', background: theme.palette.bg2 }}>
          {theme.video ? (
            <Sequence from={T.cardIn} layout="none">
              <OffthreadVideo
                src={staticFile(theme.video)}
                trimBefore={Math.round(theme.videoStart * fps)}
                playbackRate={theme.videoSpeed}
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </Sequence>
          ) : (
            <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: body, fontSize: 40, color: theme.palette.text }}>
              video del álbum
            </AbsoluteFill>
          )}
        </div>
      </div>

      {/* Frases tipo sticker */}
      {theme.captions.map((text, i) => (
        <Sticker
          key={text}
          text={text}
          start={T.captionsFrom + i * T.captionEvery}
          hold={T.captionHold}
          theme={theme}
          font={body}
          side={i % 2 === 0 ? 'left' : 'right'}
          top={cardTop + cardH - (portrait ? 260 : 170) - (i % 2) * (portrait ? 90 : 60)}
          size={portrait ? 58 : 42}
        />
      ))}

      <Outro theme={theme} display={display} body={body} portrait={portrait} />
    </AbsoluteFill>
  );
}

/** Manchas de color suaves que derivan lentamente. */
function Blobs({ theme }: { theme: AlbumTheme }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const blobs = [
    { color: theme.palette.primary, x: 0.15, y: 0.2, r: 0.55 },
    { color: theme.palette.accent, x: 0.9, y: 0.75, r: 0.6 },
    { color: theme.motifColors[2] ?? theme.palette.primary, x: 0.75, y: 0.1, r: 0.4 },
  ];
  return (
    <>
      {blobs.map((b, i) => {
        const size = b.r * Math.max(width, height);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              left: b.x * width - size / 2 + Math.sin(frame / 50 + i * 2) * 60,
              top: b.y * height - size / 2 + Math.cos(frame / 60 + i) * 50,
              borderRadius: '50%',
              background: b.color,
              opacity: 0.22,
              filter: `blur(${size / 5}px)`,
            }}
          />
        );
      })}
    </>
  );
}

/** Motivos de la temática flotando alrededor; en el cierre salen disparados. */
function MotifField({ theme, portrait }: { theme: AlbumTheme; portrait: boolean }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const count = portrait ? 22 : 16;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const r = (k: string) => random(`${theme.motif}-${i}-${k}`);
        // Repartidos en los bordes: lejos de la tarjeta central.
        const side = r('side') < 0.5 ? -1 : 1;
        const x = width / 2 + side * (width * (0.36 + r('x') * 0.16));
        const y = height * (0.06 + r('y') * 0.9);
        const size = (portrait ? 46 : 36) + r('s') * (portrait ? 54 : 40);
        const appear = spring({ frame: frame - 4 - i * 2, fps, config: { damping: 11 } });
        const burst = interpolate(frame, [T.outro, T.outro + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) });
        const floatY = Math.sin(frame / (18 + r('f') * 14) + i) * 14;
        return (
          <Motif
            key={i}
            id={theme.motif}
            color={theme.motifColors[i % theme.motifColors.length]}
            size={size}
            style={{
              left: x - size / 2 + side * burst * 400,
              top: y - size / 2 + floatY - burst * 300,
              transform: `scale(${appear}) rotate(${(r('rot') - 0.5) * 50 + frame * (r('spin') - 0.5) * 0.8}deg)`,
              opacity: 0.9 * (1 - burst),
            }}
          />
        );
      })}
    </>
  );
}

/** Texto que entra letra por letra con rebote. */
function SpringText({ text, start, style }: { text: string; start: number; style: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={style}>
      {text.split(' ').map((word, w, words) => (
        <span key={w} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
          {[...word].map((char, c) => {
            const index = words.slice(0, w).join(' ').length + c;
            const s = spring({ frame: frame - start - index * 1.2, fps, config: { damping: 12, stiffness: 140 } });
            return (
              <span key={c} style={{ display: 'inline-block', transform: `translateY(${(1 - s) * 70}px) scale(${0.6 + 0.4 * s})`, opacity: s }}>
                {char}
              </span>
            );
          })}
          {w < words.length - 1 && <span style={{ display: 'inline-block', width: '0.3em' }} />}
        </span>
      ))}
    </div>
  );
}

function Sticker(props: {
  text: string;
  start: number;
  hold: number;
  theme: AlbumTheme;
  font: string;
  side: 'left' | 'right';
  top: number;
  size: number;
}) {
  const { text, start, hold, theme, font, side, top, size } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inS = spring({ frame: frame - start, fps, config: { damping: 10, stiffness: 160 } });
  const outS = spring({ frame: frame - start - hold, fps, config: { damping: 14 } });
  const scale = inS * (1 - outS);
  if (scale <= 0.001) return null;
  const tilt = side === 'left' ? -4 : 3;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        [side]: 70,
        padding: `${size * 0.28}px ${size * 0.55}px`,
        borderRadius: size * 0.5,
        background: theme.palette.primary,
        color: theme.palette.onPrimary,
        fontFamily: font,
        fontWeight: 700,
        fontSize: size,
        boxShadow: `0 14px 30px ${theme.palette.text}40`,
        transform: `scale(${scale}) rotate(${tilt + (1 - inS) * 12 * (side === 'left' ? -1 : 1)}deg)`,
        transformOrigin: side === 'left' ? 'left center' : 'right center',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}

/** Cierre: círculo de color que cubre todo, llamado a la acción y usuario. */
function Outro({ theme, display, body, portrait }: { theme: AlbumTheme; display: string; body: string; portrait: boolean }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const start = T.outro + 10;
  if (frame < start) return null;
  const grow = spring({ frame: frame - start, fps, config: { damping: 20, mass: 1.1 } });
  const radius = grow * Math.hypot(width, height) * 0.6;
  const handleIn = interpolate(frame, [start + 26, start + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill
      style={{
        background: theme.palette.primary,
        clipPath: `circle(${radius}px at 50% ${portrait ? 55 : 50}%)`,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: portrait ? 34 : 22,
      }}
    >
      <Motif id={theme.motif} color={theme.palette.onPrimary} size={portrait ? 120 : 90} style={{ position: 'relative', opacity: 0.9, transform: `scale(${spring({ frame: frame - start - 6, fps, config: { damping: 8 } })})` }} />
      <SpringText text={theme.cta} start={start + 10} style={{ fontFamily: display, fontSize: portrait ? 120 : 92, color: theme.palette.onPrimary, textAlign: 'center', padding: '0 60px' }} />
      <div
        style={{
          fontFamily: body,
          fontWeight: 700,
          fontSize: portrait ? 48 : 38,
          color: theme.palette.primary,
          background: theme.palette.onPrimary,
          padding: portrait ? '14px 34px' : '10px 26px',
          borderRadius: 999,
          opacity: handleIn,
          transform: `translateY(${(1 - handleIn) * 30}px)`,
        }}
      >
        {theme.handle}
      </div>
    </AbsoluteFill>
  );
}
