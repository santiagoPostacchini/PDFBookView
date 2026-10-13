import type { BookEngine } from '../../book/BookEngine';
import { LIGHTING_PRESETS } from '../../book/Stage';
import { customScenarioColor } from '../../book/scenarios';
import { ScenarioPicker } from '../ScenarioPicker';
import type { Timeline } from '../../promo/compile';
import { spreadLabel } from '../../promo/editing';
import { FORMATS, type FormatId, type PromoProject, type PromoTexts, type SceneKind, type SceneLength, type SceneSpec, type TypographyId } from '../../promo/model';
import { SCENES, TEMPLATES, TYPOGRAPHY } from '../../promo/templates';
import { CanvasThumb } from '../CanvasThumb';
import { Chips, Disclosure, Section, Slider, Toggle } from '../controls';
import { IconAlert, IconArrowLeft, IconArrowRight, IconCopy, IconDownload, IconPlay, IconPlus, IconStop, IconTrash } from '../icons';
import { usePageThumbs } from '../usePageThumbs';
import { seconds } from './Storyboard';

const asset = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href;

// ── 1. Estilo ────────────────────────────────────────────────────────────────

export function StyleStep({ project, onPick, onNext }: { project: PromoProject; onPick: (id: string) => void; onNext: () => void }) {
  return (
    <>
      <Section title="Elegí un estilo" hint="Cada estilo trae escenario, luz, ritmo y tipografía. Después podés cambiar cualquier cosa.">
        <div className="template-cards">
          {TEMPLATES.map((t) => (
            <button key={t.id} className={`template-card${project.template === t.id ? ' is-active' : ''}`} onClick={() => onPick(t.id)} aria-pressed={project.template === t.id}>
              <img src={asset(`promo/plantilla-${t.id}.jpg`)} alt="" width={36} height={64} loading="lazy" />
              <span>
                <b>{t.label}</b>
                <small>{t.duration} s · {t.scenes.length} escenas</small>
              </span>
            </button>
          ))}
        </div>
      </Section>
      <button className="btn btn-primary btn-block" onClick={onNext}>
        Siguiente: armar la historia <IconArrowRight />
      </button>
    </>
  );
}

// ── 2. Historia ──────────────────────────────────────────────────────────────

interface SceneStepProps {
  figuritas?: import('react').ReactNode;
  engine: BookEngine;
  project: PromoProject;
  timeline: Timeline;
  index: number;
  onChange: (patch: Partial<SceneSpec>) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAdd: () => void;
  onGoToTexts: () => void;
  onShowPoint: (point: 'inicio' | 'fin') => void;
  onPlayScene: () => void;
}

const LENGTHS: { id: SceneLength; label: string }[] = [
  { id: 'corta', label: 'Corta' },
  { id: 'normal', label: 'Normal' },
  { id: 'larga', label: 'Larga' },
];

export function SceneStep({ engine, project, timeline, index, onChange, onMove, onDuplicate, onRemove, onAdd, onGoToTexts, onShowPoint, onPlayScene, figuritas }: SceneStepProps) {
  const scene = project.scenes[index];
  const book = engine.currentBook;
  const thumbs = usePageThumbs(engine, book?.pageCount ?? 0);
  if (!scene || !book) return null;
  const info = SCENES[scene.kind];
  const compiled = timeline.scenes.find((s) => s.index === index);
  const interior = Math.max(1, book.leafCount - 1);
  const isOpening = timeline.scenes[0]?.index === index;
  const isText = isOpening || scene.kind === 'cierre';
  const zoom = scene.camera?.zoom ?? { enabled: false, from: 0, to: 0.06 };
  const lateral = scene.camera?.lateral ?? { enabled: false, amount: 0.08, direction: 'derecha' as const };

  return (
    <div className="scene-editor">
      <div className="scene-content">
        <Section title={`Escena ${index + 1} · ${info.label}`}>
          <p className="editor-formula">{info.hint} Tocá otra tarjeta del guion (abajo) para editarla, o arrastrala para cambiarla de lugar.</p>
        </Section>

        {info.usesSpread && book.leafCount > 1 && (
          <Section title="Qué páginas se ven">
            <div className="spread-grid">
              <button className={`spread-option${scene.spread === undefined ? ' is-active' : ''}`} onClick={() => onChange({ spread: undefined })} aria-pressed={scene.spread === undefined}>
                <span className="spread-auto">Automática</span>
                <small>{compiled ? spreadLabel(compiled.spread, book.pageCount) : ''}</small>
              </button>
              {Array.from({ length: interior }, (_, k) => k + 1).map((s) => (
                <button key={s} className={`spread-option${scene.spread === s ? ' is-active' : ''}`} onClick={() => onChange({ spread: s })} aria-pressed={scene.spread === s}>
                  <span className="spread-pages">
                    {[2 * s - 1, 2 * s]
                      .filter((p) => p < book.pageCount)
                      .map((p) => (
                        <CanvasThumb key={p} image={thumbs[p]} height={42} placeholderWidth={30} />
                      ))}
                  </span>
                  <small>{spreadLabel(s, book.pageCount)}</small>
                </button>
              ))}
            </div>
          </Section>
        )}

        {isText ? (
          <Section title="Textos">
            <p className="editor-formula">
              {isOpening ? 'El título y la línea chica' : 'El llamado a la acción y tu usuario'} se editan en{' '}
              <button className="link-btn" onClick={onGoToTexts}>
                Textos y marca
              </button>
              .
            </p>
          </Section>
        ) : (
          <Section title="Frase en pantalla" hint="Opcional. Mejor corta: tiene que leerse en dos segundos.">
            <input
              type="text"
              className="text-input"
              value={scene.caption ?? ''}
              maxLength={80}
              placeholder="Tus fotos, tu historia"
              aria-label="Frase en pantalla"
              onChange={(e) => onChange({ caption: e.target.value })}
            />
          </Section>
        )}

        <Section title="Duración" hint={compiled ? `Ahora dura ${seconds(compiled.end - compiled.start)} s.` : undefined}>
          <Chips items={LENGTHS} value={scene.length ?? 'normal'} onChange={(length) => onChange({ length })} />
        </Section>

        {scene.kind === 'figuritas' && figuritas}

        <Disclosure key={index} title="Movimiento (opcional)" open={zoom.enabled || lateral.enabled || !!scene.camera?.free || (scene.camera?.framingZoom ?? 0) !== 0}>
          <Section title="Movimiento de esta toma" hint="Sólo afecta a esta escena. Podés combinar ambos movimientos o apagarlos para volver al plano fijo.">
            <p className="editor-formula">Mové la cámara en la vista previa: rueda para acercar, click derecho para mirar, W/A/S/D para moverte</p>
            <button onClick={() => onChange({ camera: { ...scene.camera, free: undefined, framingZoom: undefined } })}>Restablecer encuadre</button>
            <label className="check"><Toggle checked={zoom.enabled} onChange={(e) => onChange({ camera: { ...scene.camera, zoom: { ...zoom, enabled: e.target.checked } } })} /><span>Activar zoom suave</span></label>
            {zoom.enabled && <>
              <Slider label="Zoom inicial" min={0} max={0.1} step={0.01} value={zoom.from} onChange={(from) => onChange({ camera: { ...scene.camera, zoom: { ...zoom, from } } })} />
              <Slider label="Zoom final" min={0} max={0.1} step={0.01} value={zoom.to} onChange={(to) => onChange({ camera: { ...scene.camera, zoom: { ...zoom, to } } })} />
              <p className="editor-formula">0% es el encuadre original; 10% es un acercamiento leve. Para alejarte, poné el inicio mayor que el final.</p>
            </>}
            <label className="check"><Toggle checked={lateral.enabled} onChange={(e) => onChange({ camera: { ...scene.camera, lateral: { ...lateral, enabled: e.target.checked } } })} /><span>Activar movimiento lateral</span></label>
            {lateral.enabled && <>
              <label className="check"><Toggle checked={lateral.orbit ?? false} onChange={(e) => onChange({ camera: { ...scene.camera, lateral: { ...lateral, orbit: e.target.checked } } })} /><span>Girar alrededor del centro del álbum</span></label>
              <Slider label="Recorrido lateral" min={0} max={0.15} step={0.01} value={lateral.amount} onChange={(amount) => onChange({ camera: { ...scene.camera, lateral: { ...lateral, amount } } })} />
              {lateral.orbit && <p className="editor-formula">El recorrido regula un giro suave de hasta 9°, manteniendo el centro del álbum en foco.</p>}
              <Chips items={[{ id: 'izquierda', label: 'Cámara hacia izquierda' }, { id: 'derecha', label: 'Cámara hacia derecha' }]} value={lateral.direction} onChange={(direction) => onChange({ camera: { ...scene.camera, lateral: { ...lateral, direction } } })} />
            </>}
            <div className="scene-actions">
              <button className="btn" disabled={!compiled} onClick={() => onShowPoint('inicio')}>Ver punto inicial</button>
              <button className="btn" disabled={!compiled} onClick={() => onShowPoint('fin')}>Ver punto final</button>
              <button className="btn" disabled={!compiled} onClick={onPlayScene}><IconPlay /> Ver esta toma</button>
            </div>
          </Section>
        </Disclosure>
      </div>

      <div className="scene-footer">
        <div className="scene-actions">
          <button className="btn" onClick={() => onMove(-1)} disabled={index === 0} title="Mover antes">
            <IconArrowLeft /> Antes
          </button>
          <button className="btn" onClick={() => onMove(1)} disabled={index === project.scenes.length - 1} title="Mover después">
            Después <IconArrowRight />
          </button>
          <button className="btn" onClick={onDuplicate}>
            <IconCopy /> Duplicar
          </button>
          <button className="btn" onClick={onRemove} disabled={project.scenes.length <= 1}>
            <IconTrash /> Quitar
          </button>
        </div>
        <button className="btn btn-block" onClick={onAdd}>
          <IconPlus /> Agregar una escena
        </button>
      </div>
    </div>
  );
}

export function AddSceneStep({ onPick, onCancel }: { onPick: (kind: SceneKind) => void; onCancel: () => void }) {
  return (
    <Section title="Agregar una escena" hint="Se agrega después de la escena elegida; después la podés mover.">
      <div className="style-cards">
        {(Object.keys(SCENES) as SceneKind[]).map((kind) => (
          <button key={kind} className="style-card" onClick={() => onPick(kind)}>
            <b>{SCENES[kind].label}</b>
            <small>{SCENES[kind].hint}</small>
          </button>
        ))}
      </div>
      <button className="btn btn-block" onClick={onCancel}>
        Cancelar
      </button>
    </Section>
  );
}

// ── 3. Textos y marca ────────────────────────────────────────────────────────

function Field({ label, value, placeholder, onChange, onFocus }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; onFocus?: () => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" className="text-input" value={value} maxLength={60} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} />
    </label>
  );
}

interface TextsStepProps {
  project: PromoProject;
  onTexts: (patch: Partial<PromoTexts>) => void;
  onChange: (patch: Partial<PromoProject>) => void;
  /** Al escribir, el visor muestra la escena donde aparece ese texto. */
  onShow: (kind: 'portada' | 'cierre') => void;
}

export function TextsStep({ project, onTexts, onChange, onShow }: TextsStepProps) {
  const { texts } = project;
  return (
    <>
      <Section title="Al empezar">
        <Field label="Título" value={texts.title} placeholder="Álbum personalizado" onChange={(title) => onTexts({ title })} onFocus={() => onShow('portada')} />
        <Field
          label="Línea chica (arriba del título)"
          value={texts.subtitle}
          placeholder="Hecho a mano, página por página"
          onChange={(subtitle) => onTexts({ subtitle })}
          onFocus={() => onShow('portada')}
        />
      </Section>
      <Section title="Al terminar" hint="Tu usuario y el llamado a la acción se recuerdan para tus próximos álbumes.">
        <Field label="Llamado a la acción" value={texts.cta} placeholder="Pedí el tuyo" onChange={(cta) => onTexts({ cta })} onFocus={() => onShow('cierre')} />
        <Field label="Usuario o web" value={texts.handle} placeholder="@tu.marca" onChange={(handle) => onTexts({ handle })} onFocus={() => onShow('cierre')} />
      </Section>
      <Section title="Tipografía">
        <Chips
          items={(Object.keys(TYPOGRAPHY) as TypographyId[]).map((id) => ({ id, label: TYPOGRAPHY[id].label, style: { fontFamily: `"${TYPOGRAPHY[id].display}", serif`, fontSize: 15 } }))}
          value={project.typography}
          onChange={(typography) => onChange({ typography })}
        />
      </Section>
    </>
  );
}

export function EnvironmentStep({ project, onChange }: { project: PromoProject; onChange: (patch: Partial<PromoProject>) => void }) {
  return (
    <>
      <Section title="Escenario">
        <ScenarioPicker table={project.table ?? true} cloth={project.cloth} onTable={(table) => onChange({ table })} onCloth={(cloth) => onChange({ cloth })} value={project.set} customColor={customScenarioColor(project.set) ?? '#c9a27e'}
          onChange={(set) => onChange(set === 'ventana' ? { set, windowShadow: 0.45 } : { set })}
          onCustomColor={(color) => onChange({ set: `color:${color}` })} />
      </Section>
      <Section title="Luz">
        <Chips items={LIGHTING_PRESETS.map((p) => ({ id: p.id, label: p.label }))} value={project.lighting} onChange={(lighting) => onChange({ lighting })} />
        <Slider label="Sombra de ventana" min={0} max={1} step={0.05} value={project.windowShadow ?? (project.set === 'ventana' ? 0.45 : 0)} onChange={(windowShadow) => onChange({ windowShadow })} hint="Se combina con cualquier mantel o superficie. En 0% se apaga." />
      </Section>
      <Disclosure title="Más ajustes">
        <Slider label="Sombras de contacto" min={0} max={1} step={0.05} value={project.ambientOcclusion ?? 0.35} onChange={(ambientOcclusion) => onChange({ ambientOcclusion })} hint="Refuerza el apoyo del álbum, el lomo y los bordes de la mesa." />
      </Disclosure>
    </>
  );
}

// ── 5. Exportar ──────────────────────────────────────────────────────────────

export interface RecordingStatus {
  format: FormatId;
  index: number;
  total: number;
  phase: 'preparando' | 'grabando' | 'finalizando';
  done: number;
  frames: number;
}

export interface ExportResult {
  name: string;
  blob: Blob;
  format: FormatId;
  seconds: number;
}

interface ExportStepProps {
  project: PromoProject;
  formats: FormatId[];
  timeline: Timeline;
  advice: string | null;
  safeZones: boolean;
  playing: boolean;
  recording: RecordingStatus | null;
  results: ExportResult[];
  onToggleFormat: (format: FormatId) => void;
  onDuration: (seconds: number) => void;
  onSafeZones: (on: boolean) => void;
  onPlayAll: () => void;
  onExport: () => void;
  onCancel: () => void;
  onDownload: (result: ExportResult) => void;
}

const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];

export function ExportStep(p: ExportStepProps) {
  const durations = [...new Set([10, 15, 20, 30, Math.round(p.project.duration)])].sort((a, b) => a - b);
  const count = p.formats.length;
  return (
    <>
      <Section title="Formatos" hint="Se exportan todos juntos. La vista previa muestra el último que elegiste.">
        <div className="format-options">
          {FORMAT_IDS.map((f) => {
            const on = p.formats.includes(f);
            return (
              <button
                key={f}
                className={`format-option${on ? ' is-active' : ''}`}
                onClick={() => p.onToggleFormat(f)}
                aria-pressed={on}
                disabled={!!p.recording}
              >
                <span className="format-shape" style={{ aspectRatio: `${FORMATS[f].width} / ${FORMATS[f].height}` }} />
                <span>
                  <b>{FORMATS[f].label}</b>
                  <small>{FORMATS[f].hint}</small>
                </span>
                {p.project.format === f && <span className="format-preview">Vista previa</span>}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Duración total">
        <Chips
          items={durations.map((d) => ({ id: String(d), label: `${d} s` }))}
          value={String(Math.round(p.project.duration))}
          onChange={(d) => p.onDuration(Number(d))}
          disabled={!!p.recording}
        />
        {p.advice && (
          <p className="diag diag-warn">
            <IconAlert width={16} height={16} />
            <span>{p.advice}</span>
          </p>
        )}
      </Section>

      <Section title="Revisar">
        <label className="check">
          <Toggle checked={p.safeZones} onChange={(e) => p.onSafeZones(e.target.checked)} disabled={p.project.format !== '9:16'} />
          <span>Mostrar lo que tapa la interfaz de Instagram y TikTok (9:16)</span>
        </label>
        <button className="btn btn-block" onClick={p.onPlayAll} disabled={!!p.recording}>
          {p.playing ? (
            <>
              <IconStop /> Detener
            </>
          ) : (
            <>
              <IconPlay /> Ver el video completo
            </>
          )}
        </button>
      </Section>

      <Section title="Exportar">
        <p className="editor-formula">
          {count === 1 ? 'Un video' : `${count} videos`} MP4 de {Math.round(p.timeline.duration)} s, listos para subir.
        </p>
        {!p.timeline.scenes.length && <p className="diag diag-warn">Cargá figuritas con un destino válido o agregá otra escena para exportar.</p>}
        <button className="btn btn-primary btn-block" onClick={p.onExport} disabled={!!p.recording || !p.timeline.scenes.length}>
          <IconDownload /> {count === 1 ? 'Exportar el video' : `Exportar ${count} videos`}
        </button>
        {p.recording && (
          <div className="record-progress" role="status" aria-live="polite">
            <span>
              {p.recording.total > 1 ? `${p.recording.format} (${p.recording.index + 1} de ${p.recording.total}) · ` : ''}
              {p.recording.phase === 'preparando'
                ? 'Preparando páginas…'
                : p.recording.phase === 'grabando'
                  ? `Grabando ${Math.round((p.recording.done / Math.max(1, p.recording.frames)) * 100)} %`
                  : 'Terminando el archivo…'}
            </span>
            <div className="progress">
              <div style={{ width: `${((p.recording.index + (p.recording.phase === 'grabando' ? p.recording.done / Math.max(1, p.recording.frames) : p.recording.phase === 'finalizando' ? 1 : 0)) / p.recording.total) * 100}%` }} />
            </div>
            <button className="link-btn" onClick={p.onCancel}>
              Cancelar
            </button>
          </div>
        )}
        {p.results.length > 0 && !p.recording && (
          <div className="diag diag-ok video-result">
            <span>
              Listo: {p.results.length === 1 ? 'se descargó tu video' : `se descargaron ${p.results.length} videos`}.
              {p.results.map((r) => (
                <span key={r.name} className="video-file">
                  <b>{r.format}</b> · {(r.blob.size / 1e6).toFixed(1).replace('.', ',')} MB{' '}
                  <button className="link-btn" onClick={() => p.onDownload(r)}>
                    Descargar de nuevo
                  </button>
                </span>
              ))}
            </span>
          </div>
        )}
      </Section>
    </>
  );
}
