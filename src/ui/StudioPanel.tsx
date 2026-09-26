import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { VIEW_PRESETS, type BookEngine } from '../book/BookEngine';
import { BACKDROP_PRESETS, backdropFromColor, LIGHTING_PRESETS, type Backdrop } from '../book/Stage';
import type { SpreadInfo } from '../book/types';
import { PromoPlayer } from '../studio/PromoPlayer';
import { buildPromoScript, PROMO_STYLES, type PromoStyle } from '../studio/promoScript';
import { recordPromo } from '../studio/recordPromo';
import { IconAlert, IconClose } from './icons';

interface Props {
  engine: BookEngine;
  /** Nombre del PDF, para nombrar los archivos exportados. */
  fileName: string;
  spread: SpreadInfo | null;
  onClose: () => void;
}

type Tab = 'foto' | 'video';
type FrameId = 'libre' | '1:1' | '4:5' | '9:16' | '16:9';
type VideoFormat = '9:16' | '1:1';

const FRAMES: Record<FrameId, number | null> = { libre: null, '1:1': 1, '4:5': 4 / 5, '9:16': 9 / 16, '16:9': 16 / 9 };
const VIDEO_FORMATS: Record<VideoFormat, { aspect: number; width: number; height: number; label: string }> = {
  '9:16': { aspect: 9 / 16, width: 1080, height: 1920, label: '9:16 · Reels / historias' },
  '1:1': { aspect: 1, width: 1080, height: 1080, label: '1:1 · feed' },
};
const DURATIONS = [10, 15, 20, 30];

interface Settings {
  tab: Tab;
  lighting: string;
  backdrop: string; // id de preset | 'custom' | 'transparent'
  customColor: string;
  frame: FrameId;
  lens: number;
  aperture: number;
  vignette: number;
  grain: number;
  photoSize: number;
  photoType: 'image/png' | 'image/jpeg';
  videoFormat: VideoFormat;
  style: PromoStyle;
  duration: number;
}

const DEFAULTS: Settings = {
  tab: 'foto',
  lighting: 'estudio',
  backdrop: 'carbon',
  customColor: '#c9a27e',
  frame: '4:5',
  lens: 50,
  aperture: 0.35,
  vignette: 0.35,
  grain: 0.08,
  photoSize: 4096,
  photoType: 'image/png',
  videoFormat: '9:16',
  style: 'elegante',
  duration: 15,
};

const STORAGE_KEY = 'pdf-book-view.studio';

function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const slug = (name: string) =>
  name
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'album';

interface Recording {
  phase: 'preparando' | 'grabando' | 'finalizando';
  done: number;
  total: number;
  controller: AbortController;
}

/**
 * Estudio: modo fotografía (luz, fondo, lente, encuadre, efectos, foto en alta)
 * y video promocional automático (vista previa y exportación MP4).
 */
export function StudioPanel({ engine, fileName, spread, onClose }: Props) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [hold, setHold] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [lastVideo, setLastVideo] = useState<{ blob: Blob; name: string; seconds: number } | null>(null);
  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const s = settings;
  const base = slug(fileName);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* sin persistencia */
    }
  }, [settings]);

  // Entrar y salir del modo estudio.
  useEffect(() => {
    engine.enterStudio();
    return () => engine.exitStudio();
  }, [engine]);

  const backdrop: Backdrop | null = useMemo(() => {
    if (s.backdrop === 'transparent') return s.tab === 'foto' ? null : BACKDROP_PRESETS[0];
    if (s.backdrop === 'custom') return backdropFromColor(s.customColor);
    return BACKDROP_PRESETS.find((b) => b.id === s.backdrop) ?? BACKDROP_PRESETS[0];
  }, [s.backdrop, s.customColor, s.tab]);

  useEffect(() => engine.setLighting(s.lighting), [engine, s.lighting]);
  useEffect(() => engine.setBackdrop(backdrop), [engine, backdrop]);
  useEffect(() => {
    engine.setFrameAspect(s.tab === 'foto' ? FRAMES[s.frame] : VIDEO_FORMATS[s.videoFormat].aspect);
  }, [engine, s.tab, s.frame, s.videoFormat]);
  useEffect(() => {
    if (s.tab === 'foto') engine.setLook({ aperture: s.aperture, vignette: s.vignette, grain: s.grain, fade: 0, flash: 0, sweepStrength: 0 });
    else engine.setLook({ aperture: 0.25, vignette: 0.3, grain: 0, fade: 0, flash: 0, sweepStrength: 0 });
  }, [engine, s.tab, s.aperture, s.vignette, s.grain]);
  useEffect(() => {
    if (s.tab === 'foto') engine.setFocalLength(s.lens);
  }, [engine, s.tab, s.lens]);
  useEffect(() => {
    engine.holdLeaf(s.tab === 'foto' ? hold : 0);
  }, [engine, hold, s.tab]);
  // Al pasar de doble página, la hoja "en el aire" vuelve a apoyarse.
  useEffect(() => setHold(0), [spread?.index]);

  const takePhoto = async () => {
    setError(null);
    setBusy('Generando foto…');
    try {
      const blob = await engine.capturePhoto({
        longSide: s.photoSize,
        type: s.photoType,
        transparent: s.backdrop === 'transparent' && s.photoType === 'image/png',
      });
      const pages = [spread?.leftPage, spread?.rightPage].filter((p) => p != null).map((p) => p! + 1).join('-') || 'tapa';
      downloadBlob(blob, `${base}-foto-p${pages}.${s.photoType === 'image/png' ? 'png' : 'jpg'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const buildScript = () => {
    const book = engine.currentBook;
    if (!book) throw new Error('No hay un libro cargado.');
    return buildPromoScript({
      style: s.style,
      duration: s.duration,
      aspect: VIDEO_FORMATS[s.videoFormat].aspect,
      leafCount: book.leafCount,
      pageWidth: book.pageWidth,
      pageHeight: book.pageHeight,
    });
  };

  const togglePreview = () => {
    setError(null);
    if (previewing) {
      engine.stopDirector();
      return;
    }
    try {
      const script = buildScript();
      const player = new PromoPlayer(engine, script);
      player.reset();
      setPreviewing(true);
      engine.play(player, () => setPreviewing(false), script.fov);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const exportVideo = async () => {
    setError(null);
    engine.stopDirector();
    const format = VIDEO_FORMATS[s.videoFormat];
    const controller = new AbortController();
    setRecording({ phase: 'preparando', done: 0, total: 1, controller });
    try {
      const script = buildScript();
      const blob = await recordPromo(engine, script, {
        width: format.width,
        height: format.height,
        signal: controller.signal,
        onProgress: (phase, done, total) => setRecording((r) => r && { ...r, phase, done, total }),
      });
      const name = `${base}-promo-${s.videoFormat.replace(':', 'x')}-${s.style}.mp4`;
      setLastVideo({ blob, name, seconds: script.duration });
      downloadBlob(blob, name);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecording(null);
    }
  };

  const locked = !!recording || previewing;

  return (
    <aside className="studio-panel panel" aria-label="Estudio de fotos y video">
      <header className="editor-head">
        <h2>Estudio</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar estudio" title="Cerrar" disabled={!!recording}>
          <IconClose />
        </button>
      </header>

      <div className="studio-tabs" role="tablist">
        {(['foto', 'video'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={s.tab === tab}
            className={s.tab === tab ? 'is-active' : undefined}
            onClick={() => update({ tab })}
            disabled={locked}
          >
            {tab === 'foto' ? 'Foto' : 'Video promocional'}
          </button>
        ))}
      </div>

      <div className="editor-scroll studio-scroll">
        {error && (
          <p className="diag diag-warn">
            <IconAlert width={16} height={16} />
            <span>{error}</span>
          </p>
        )}

        <Section title="Luz">
          <Chips
            items={LIGHTING_PRESETS.map((p) => ({ id: p.id, label: p.label }))}
            value={s.lighting}
            onChange={(lighting) => update({ lighting })}
            disabled={locked}
          />
        </Section>

        <Section title="Fondo">
          <div className="swatches">
            {BACKDROP_PRESETS.map((b) => (
              <button
                key={b.id}
                className={`swatch${s.backdrop === b.id ? ' is-active' : ''}`}
                style={{ background: `radial-gradient(circle at 50% 40%, ${b.inner}, ${b.outer})` }}
                onClick={() => update({ backdrop: b.id })}
                title={b.label}
                aria-label={`Fondo ${b.label}`}
                disabled={locked}
              />
            ))}
            <label className={`swatch swatch-custom${s.backdrop === 'custom' ? ' is-active' : ''}`} title="Color a elección">
              <input
                type="color"
                value={s.customColor}
                onChange={(e) => update({ backdrop: 'custom', customColor: e.target.value })}
                aria-label="Color de fondo a elección"
                disabled={locked}
              />
            </label>
            {s.tab === 'foto' && (
              <button
                className={`swatch swatch-transparent${s.backdrop === 'transparent' ? ' is-active' : ''}`}
                onClick={() => update({ backdrop: 'transparent', photoType: 'image/png' })}
                title="Transparente (PNG)"
                aria-label="Fondo transparente"
              />
            )}
          </div>
        </Section>

        {s.tab === 'foto' ? (
          <>
            <Section title="Encuadre">
              <Chips
                items={(Object.keys(FRAMES) as FrameId[]).map((id) => ({ id, label: id === 'libre' ? 'Libre' : id }))}
                value={s.frame}
                onChange={(frame) => update({ frame })}
              />
            </Section>

            <Section title="Ángulo" hint="También podés girar y hacer zoom con el mouse.">
              <div className="chips">
                {VIEW_PRESETS.map((v) => (
                  <button key={v.id} className="chip" onClick={() => engine.setViewPreset(v.id)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Lente">
              <Slider
                label={`${Math.round(s.lens)} mm`}
                min={18}
                max={135}
                step={1}
                value={s.lens}
                onChange={(lens) => update({ lens })}
                hint="Gran angular exagera la perspectiva; tele la aplana. El libro conserva su tamaño."
              />
            </Section>

            <Section title="Efectos">
              <Slider label="Desenfoque (profundidad de campo)" min={0} max={1} step={0.01} value={s.aperture} onChange={(aperture) => update({ aperture })} />
              <Slider label="Viñeta" min={0} max={1} step={0.01} value={s.vignette} onChange={(vignette) => update({ vignette })} />
              <Slider label="Grano de película" min={0} max={1} step={0.01} value={s.grain} onChange={(grain) => update({ grain })} />
              <Slider
                label="Hoja en el aire"
                min={0}
                max={0.95}
                step={0.01}
                value={hold}
                onChange={setHold}
                hint="Congela la página de la derecha a mitad de giro."
              />
            </Section>

            <Section title="Exportar">
              <div className="editor-row">
                <Chips
                  items={[
                    { id: '2048', label: '2K' },
                    { id: '4096', label: '4K' },
                  ]}
                  value={String(s.photoSize)}
                  onChange={(v) => update({ photoSize: Number(v) })}
                />
                <Chips
                  items={[
                    { id: 'image/png', label: 'PNG' },
                    { id: 'image/jpeg', label: 'JPG' },
                  ]}
                  value={s.photoType}
                  onChange={(photoType) => update({ photoType, backdrop: photoType === 'image/jpeg' && s.backdrop === 'transparent' ? 'carbon' : s.backdrop })}
                />
              </div>
              <p className="editor-formula">
                {(() => {
                  const size = engine.exportSize(s.photoSize);
                  return `${size.width} × ${size.height} px`;
                })()}
              </p>
              <button className="btn btn-primary btn-block" onClick={takePhoto} disabled={!!busy}>
                {busy ?? 'Tomar foto'}
              </button>
            </Section>
          </>
        ) : (
          <>
            <Section title="Formato">
              <Chips
                items={(Object.keys(VIDEO_FORMATS) as VideoFormat[]).map((id) => ({ id, label: VIDEO_FORMATS[id].label }))}
                value={s.videoFormat}
                onChange={(videoFormat) => update({ videoFormat })}
                disabled={locked}
              />
            </Section>

            <Section title="Estilo">
              <div className="style-cards">
                {PROMO_STYLES.map((style) => (
                  <button
                    key={style.id}
                    className={`style-card${s.style === style.id ? ' is-active' : ''}`}
                    onClick={() => update({ style: style.id })}
                    disabled={locked}
                  >
                    <b>{style.label}</b>
                    <small>{style.description}</small>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Duración">
              <Chips
                items={DURATIONS.map((d) => ({ id: String(d), label: `${d} s` }))}
                value={String(s.duration)}
                onChange={(d) => update({ duration: Number(d) })}
                disabled={locked}
              />
            </Section>

            <Section title="Grabar">
              <p className="editor-formula">
                Intro con el libro cerrado, apertura de tapa, dobles páginas destacadas con giros en cámara y cierre.{' '}
                {VIDEO_FORMATS[s.videoFormat].width} × {VIDEO_FORMATS[s.videoFormat].height}, 30 fps, MP4.
              </p>
              <div className="editor-row">
                <button className="btn" onClick={togglePreview} disabled={!!recording}>
                  {previewing ? 'Detener vista previa' : 'Vista previa'}
                </button>
                <button className="btn btn-primary" onClick={exportVideo} disabled={locked}>
                  Exportar MP4
                </button>
              </div>
              {recording && (
                <div className="record-progress">
                  <span>
                    {recording.phase === 'preparando'
                      ? `Preparando páginas ${recording.done}/${recording.total}`
                      : recording.phase === 'grabando'
                        ? `Grabando cuadro ${recording.done}/${recording.total}`
                        : 'Finalizando MP4…'}
                  </span>
                  <div className="progress">
                    <div style={{ width: `${(recording.done / Math.max(1, recording.total)) * 100}%` }} />
                  </div>
                  <button className="link-btn" onClick={() => recording.controller.abort()}>
                    Cancelar
                  </button>
                </div>
              )}
              {lastVideo && !recording && (
                <div className="diag diag-ok video-result">
                  <span>
                    <b>{lastVideo.name}</b> · {lastVideo.seconds} s · {(lastVideo.blob.size / 1e6).toFixed(1)} MB{' '}
                    <button className="link-btn" onClick={() => downloadBlob(lastVideo.blob, lastVideo.name)}>
                      Descargar de nuevo
                    </button>
                    <br />
                    Para el motion graphics de 10 s, pasame este archivo en el chat junto con la temática del álbum.
                  </span>
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="studio-section">
      <h3>{title}</h3>
      {children}
      {hint && <p className="editor-formula">{hint}</p>}
    </section>
  );
}

function Chips<T extends string>({
  items,
  value,
  onChange,
  disabled,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="chips" role="radiogroup">
      {items.map((item) => (
        <button
          key={item.id}
          role="radio"
          aria-checked={value === item.id}
          className={`chip${value === item.id ? ' is-active' : ''}`}
          onClick={() => onChange(item.id)}
          disabled={disabled}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  hint,
  onChange,
  ...input
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useRef(`slider-${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="slider">
      <label htmlFor={id}>
        <span>{label}</span>
        {input.max <= 1 && <output>{Math.round(input.value * 100)}%</output>}
      </label>
      <input id={id} type="range" {...input} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </div>
  );
}
