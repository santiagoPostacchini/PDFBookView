import { useEffect, useMemo, useState } from 'react';
import { VIEW_PRESETS, type BookEngine } from '../book/BookEngine';
import { LIGHTING_PRESETS } from '../book/Stage';
import type { Surface } from '../book/StageSet';
import type { SpreadInfo } from '../book/types';
import { Chips, Section, Slider } from './controls';
import { migratePhotoBackdrop, photoScenario, resolveScenario } from '../book/scenarios';
import { ScenarioPicker } from './ScenarioPicker';
import { downloadBlob, fileSlug } from './download';
import { IconAlert, IconClose } from './icons';
import { VideoEditor } from './video/VideoEditor';

export type StudioTab = 'foto' | 'video';

interface Props {
  engine: BookEngine;
  /** Nombre del PDF, para nombrar los archivos exportados. */
  fileName: string;
  spread: SpreadInfo | null;
  /** Lugar debajo del visor para el guion del video. */
  dock: HTMLElement | null;
  onTabChange?: (tab: StudioTab) => void;
  onClose: () => void;
}

type FrameId = 'libre' | '1:1' | '4:5' | '9:16' | '16:9';

const FRAMES: Record<FrameId, number | null> = { libre: null, '1:1': 1, '4:5': 4 / 5, '9:16': 9 / 16, '16:9': 16 / 9 };

interface Settings {
  catalogVersion?: number;
  tab: StudioTab;
  lighting: string;
  backdrop: string; // id de preset | 'custom' | 'transparent'
  customColor: string;
  surface: Surface;
  frame: FrameId;
  lens: number;
  aperture: number;
  vignette: number;
  grain: number;
  photoSize: number;
  photoType: 'image/png' | 'image/jpeg';
}

const DEFAULTS: Settings = {
  tab: 'foto',
  lighting: 'estudio',
  backdrop: 'carbon',
  customColor: '#c9a27e',
  surface: 'papel',
  frame: '4:5',
  lens: 50,
  aperture: 0.35,
  vignette: 0.35,
  grain: 0.08,
  photoSize: 4096,
  photoType: 'image/png',
};

const STORAGE_KEY = 'pdf-book-view.studio';

function loadSettings(): Settings {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } as Settings;
    return {
      ...saved,
      backdrop: migratePhotoBackdrop(saved.backdrop, saved.catalogVersion),
      catalogVersion: 1,
      tab: saved.tab === 'video' ? 'video' : 'foto',
      surface: ['liso', 'papel', 'lino'].includes(saved.surface) ? saved.surface : DEFAULTS.surface,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Estudio: modo fotografía (luz, escenario, lente, encuadre, efectos, foto en alta)
 * y editor de video promocional.
 */
export function StudioPanel({ engine, fileName, spread, dock, onTabChange, onClose }: Props) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [hold, setHold] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !videoBusy && !busy) onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [videoBusy, busy, onClose]);
  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const s = settings;
  const photo = s.tab === 'foto';

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* sin persistencia */
    }
  }, [settings]);

  useEffect(() => onTabChange?.(s.tab), [s.tab, onTabChange]);

  // Entrar y salir del modo estudio.
  useEffect(() => {
    engine.enterStudio();
    return () => engine.exitStudio();
  }, [engine]);

  const stageSet = useMemo(() => photoScenario(s.backdrop, s.customColor, s.surface), [s.backdrop, s.customColor, s.surface]);

  // Ajustes de foto. En la pestaña de video manda el editor (escenario, luz, cuadro y cámara).
  useEffect(() => {
    if (photo) engine.setLighting(s.lighting);
  }, [engine, photo, s.lighting]);
  useEffect(() => {
    if (!photo) return;
    engine.setBackdrop(null);
    engine.setSet(stageSet);
  }, [engine, photo, stageSet]);
  useEffect(() => {
    if (photo) engine.setFrameAspect(FRAMES[s.frame]);
  }, [engine, photo, s.frame]);
  useEffect(() => {
    if (photo) engine.setLook({ aperture: s.aperture, vignette: s.vignette, grain: s.grain, fade: 0 });
  }, [engine, photo, s.aperture, s.vignette, s.grain]);
  useEffect(() => {
    if (photo) engine.setFocalLength(s.lens);
  }, [engine, photo, s.lens]);
  useEffect(() => {
    engine.holdLeaf(photo ? hold : 0);
  }, [engine, hold, photo]);
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
      downloadBlob(blob, `${fileSlug(fileName)}-foto-p${pages}.${s.photoType === 'image/png' ? 'png' : 'jpg'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className={`studio-panel panel${expanded ? ' is-expanded' : ''}`} aria-label="Estudio de fotos y video">
      <button className="sheet-handle" aria-label={expanded ? 'Colapsar estudio' : 'Expandir estudio'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span aria-hidden="true" /></button>
      <header className="editor-head">
        <h2>Estudio</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar estudio" title="Cerrar" disabled={videoBusy || !!busy}>
          <IconClose />
        </button>
      </header>

      <div className="studio-tabs" role="tablist">
        {(['foto', 'video'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            onKeyDown={(event) => {
              if (videoBusy || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              update({ tab: tab === 'foto' ? 'video' : 'foto' });
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
              buttons?.[tab === 'foto' ? 1 : 0].focus();
            }}
            aria-selected={s.tab === tab}
            className={s.tab === tab ? 'is-active' : undefined}
            onClick={() => update({ tab })}
            disabled={videoBusy}
          >
            {tab === 'foto' ? 'Foto' : 'Video promocional'}
          </button>
        ))}
      </div>

      {s.tab === 'video' ? (
        <VideoEditor engine={engine} fileName={fileName} dock={dock} onBusyChange={setVideoBusy} />
      ) : (
        <div className="editor-scroll studio-scroll">
          {error && (
            <p className="diag diag-warn">
              <IconAlert width={16} height={16} />
              <span>{error}</span>
            </p>
          )}

          <Section title="Luz">
            <Chips items={LIGHTING_PRESETS.map((p) => ({ id: p.id, label: p.label }))} value={s.lighting} onChange={(lighting) => update({ lighting })} />
          </Section>

          <Section title="Escenario" hint="La superficie recibe las sombras del libro. Transparente exporta un PNG sin escenario.">
            <ScenarioPicker photo value={s.backdrop.replace(/^foto:/, '')} customColor={s.customColor}
              onChange={(backdrop) => update({ backdrop, ...(backdrop === 'transparent' ? { photoType: 'image/png' } : {}) })}
              onCustomColor={(customColor) => update({ backdrop: 'custom', customColor })} />
            {s.backdrop !== 'transparent' && !resolveScenario(s.backdrop)?.tablecloth && !resolveScenario(s.backdrop)?.windowShadow && (
              <Chips<Surface>
                items={[
                  { id: 'liso', label: 'Lisa' },
                  { id: 'papel', label: 'Papel' },
                  { id: 'lino', label: 'Lino' },
                ]}
                value={s.surface}
                onChange={(surface) => update({ surface })}
              />
            )}
          </Section>

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

          {busy && <p role="status" aria-live="polite">{busy}</p>}
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
                onChange={(photoType) => update({ photoType, backdrop: photoType === 'image/jpeg' && s.backdrop === 'transparent' ? 'foto:carbon' : s.backdrop })}
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
        </div>
      )}
    </aside>
  );
}
