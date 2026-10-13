import { TextInteraction } from './TextInteraction';
import { updateText } from '../../promo/editing';
import { sceneCameraBase } from '../../promo/sceneCamera';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BookEngine } from '../../book/BookEngine';
import { compileProject, type Timeline } from '../../promo/compile';
import { addScene, applyTemplate, duplicateScene, moveScene, pacingAdvice, placeScene, removeScene, sceneAt, sceneFocusTime, updateScene, type Edit } from '../../promo/editing';
import { FORMATS, type FormatId, type PromoProject } from '../../promo/model';
import { VideoPreview } from '../../promo/preview';
import { loadBrand, loadDraft, newDraft, saveDraft, type VideoDraft } from '../../promo/projectStorage';
import { recordTimeline } from '../../promo/record';
import { downloadBlob, fileSlug } from '../download';
import { IconAlert } from '../icons';
import { Storyboard } from './Storyboard';
import './video.css';
import { AddSceneStep, EnvironmentStep, ExportStep, SceneStep, StyleStep, TextsStep, type ExportResult, type RecordingStatus } from './VideoSteps';
import { AlbumContext } from './AlbumContext';
import { FiguritasStep } from './FiguritasStep';
import { findNumberedSlots, type SlotSite } from '../../pdf/slots';
import { loadLibrary, saveLibrary } from '../../promo/figuritas/library';
import { libraryImages, type FiguritasImages, type FiguritasLibrary } from '../../promo/figuritas/assets';
import { extractCoverColor } from '../../promo/coverColor';

type Step = 'estilo' | 'historia' | 'textos' | 'ambiente' | 'exportar';

const STEPS: { id: Step; label: string }[] = [
  { id: 'estilo', label: 'Estilo' },
  { id: 'historia', label: 'Historia' },
  { id: 'textos', label: 'Textos' },
  { id: 'ambiente', label: 'Ambiente' },
  { id: 'exportar', label: 'Exportar' },
];

const FORMAT_ORDER = Object.keys(FORMATS) as FormatId[];

interface Props {
  engine: BookEngine;
  /** Nombre del PDF: el video se guarda por archivo y nombra los MP4. */
  fileName: string;
  /** Lugar debajo del visor donde va el guion de escenas. */
  dock: HTMLElement | null;
  /** Avisa si hay una exportación en curso (el estudio no se puede cerrar). */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Editor de video para personas no técnicas, en 5 pasos (estilo, historia,
 * textos, ambiente, exportar). El visor 3D es la vista previa: muestra la escena
 * elegida con sus textos o reproduce el video tal como se va a exportar.
 */
export function VideoEditor({ engine, fileName, dock, onBusyChange }: Props) {
  const book = engine.currentBook;
  const album = useContext(AlbumContext);
  const [slots, setSlots] = useState<Map<number, SlotSite[]>>(new Map());
  const [pagePt, setPagePt] = useState<{ width: number; height: number }>();
  const [library, setLibrary] = useState<FiguritasLibrary | null>(null);
  const [images, setImages] = useState<FiguritasImages>();
  const [coverColor, setCoverColor] = useState<string>();
  useEffect(() => {
    const extract = () => {
      const image = engine.getThumbnail(0);
      if (!image) return;
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 64, 64);
      setCoverColor(extractCoverColor(ctx.getImageData(0, 0, 64, 64).data));
    };
    setCoverColor(undefined); extract();
    return engine.on('thumbnail', (page) => { if (page === 0) extract(); });
  }, [engine, book]);
  useEffect(() => {
    let cancelled = false;
    setSlots(new Map()); setPagePt(undefined);
    if (album) {
      void Promise.all([findNumberedSlots(album.pdf, album.layout), album.pdf.pageSize(0)]).then(([slots, size]) => {
        if (cancelled) return;
        const crop = album.layout.slots.find((s) => s !== null)!.crop;
        setSlots(slots); setPagePt({ width: size.width * crop.w, height: size.height * crop.h });
      }).catch((e) => { if (!cancelled) setError(String(e)); });
    }
    return () => { cancelled = true; };
  }, [album?.pdf, album?.layout]);
  useEffect(() => { let cancelled = false; void loadLibrary(fileName).then((l) => { if (!cancelled) setLibrary(l); }); return () => { cancelled = true; }; }, [fileName]);
  useEffect(() => {
    let cancelled = false;
    setImages(undefined);
    if (library) void libraryImages(library).then((images) => { if (!cancelled) setImages(images); }).catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [library]);
  const changeLibrary = (next: FiguritasLibrary) => { setLibrary(next); void saveLibrary(fileName, next); };
  const shape = useMemo(() => ({ leafCount: book?.leafCount ?? 1, pageWidth: book?.pageWidth ?? 2, pageHeight: book?.pageHeight ?? 3, slots, pagePt, coverColor }), [book, slots, pagePt, coverColor]);
  const [draft, setDraft] = useState<VideoDraft>(() => loadDraft(fileName, undefined, shape) ?? newDraft(loadBrand()));
  const [step, setStep] = useState<Step>('estilo');
  const [selected, setSelected] = useState(0);
  const [selectedText, setSelectedText] = useState<string | null>(draft.project.textItems[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState(0);
  const [safeZones, setSafeZones] = useState(false);
  const [recording, setRecording] = useState<RecordingStatus | null>(null);
  const [results, setResults] = useState<ExportResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { project, formats } = draft;

  const timeline = useMemo(() => compileProject(project, shape, images ? library ?? undefined : undefined), [project, shape, library, images]);
  const preview = useRef<VideoPreview | null>(null);
  const shown = useRef<Timeline | null>(null);
  const latest = useRef(timeline);
  latest.current = timeline;
  const abort = useRef<AbortController | null>(null);

  // La vista previa vive mientras el editor está abierto.
  useEffect(() => {
    const p = new VideoPreview(engine, images);
    setPlaying(false);
    preview.current = p;
    p.onCameraEdit = (index, pose) => {
      const scene = latest.current.scenes.find((s) => s.index === index);
      if (!scene) return;
      const progress = (p.time - scene.start) / (scene.end - scene.start);
      setDraft((d) => {
        const spec = d.project.scenes[index];
        if (!spec) return d;
        const free = sceneCameraBase(pose, spec.camera, engine.currentBook?.pageWidth ?? 2, progress);
        return { ...d, project: updateScene(d.project, index, { camera: { ...spec.camera, free } }) };
      });
    };
    let last = 0;
    p.onTick = (t) => {
      const now = performance.now();
      if (now - last < 80) return;
      last = now;
      setClock(t);
    };
    p.onStop = () => {
      // Al detener queda elegida la escena que se estaba viendo.
      setSelected(sceneAt(latest.current, p.time));
      setPlaying(false);
    };
    return () => {
      abort.current?.abort();
      p.dispose();
      preview.current = null;
      shown.current = null;
    };
  }, [engine, images]);

  // Mostrar en el visor la escena elegida, también después de cada edición.
  useEffect(() => {
    const p = preview.current;
    if (!p || playing || recording) return;
    const t = step === 'textos' ? p.time : sceneFocusTime(timeline, selected);
    if (shown.current !== timeline) {
      p.setTimeline(timeline, t);
      shown.current = timeline;
    } else {
      p.seek(t);
    }
    setClock(t);
  }, [timeline, selected, playing, recording, images, step]);

  useEffect(() => {
    const p = preview.current; if (!p) return;
    p.editingText = step === 'textos' && !playing && !recording ? project.textItems.find(t => t.id === selectedText) ?? null : null;
    engine.invalidate();
  }, [step, selectedText, project.textItems, playing, recording, engine, images]);

  useEffect(() => preview.current?.setSafeZones(safeZones && project.format === '9:16'), [safeZones, project.format]);
  useEffect(() => onBusyChange?.(!!recording), [recording, onBusyChange]);

  // Guardado por archivo, con un respiro para no escribir en cada tecla.
  useEffect(() => {
    const id = window.setTimeout(() => saveDraft(fileName, draft), 300);
    return () => window.clearTimeout(id);
  }, [draft, fileName]);

  const setProject = useCallback((next: PromoProject, index?: number) => {
    setDraft((d) => ({ ...d, project: next }));
    if (index !== undefined) setSelected(Math.max(0, Math.min(index, next.scenes.length - 1)));
  }, []);
  const apply = (edit: Edit) => setProject(edit.project, edit.index);

  const toggleFormat = (format: FormatId) =>
    setDraft((d) => {
      const on = d.formats.includes(format);
      if (on && d.formats.length === 1) return d; // al menos uno
      const next = on ? d.formats.filter((f) => f !== format) : [...d.formats, format];
      // La vista previa sigue al último formato elegido.
      const preview = on ? (d.project.format === format ? next[next.length - 1] : d.project.format) : format;
      return { project: { ...d.project, format: preview }, formats: next };
    });

  const play = (from: number, until?: number) => {
    const p = preview.current;
    if (!p) return;
    if (playing) {
      p.stop();
      return;
    }
    setPlaying(true);
    p.play(from, until);
  };

  const exportVideos = async () => {
    preview.current?.stop();
    setError(null);
    const controller = new AbortController();
    abort.current = controller;
    const list = FORMAT_ORDER.filter((f) => formats.includes(f));
    const done: ExportResult[] = [];
    setResults([]);
    setRecording({ format: list[0], index: 0, total: list.length, phase: 'preparando', done: 0, frames: 1 });
    try {
      for (const [index, format] of list.entries()) {
        const tl = compileProject({ ...project, format }, shape, library ?? undefined);
        const blob = await recordTimeline(engine, tl, {
          images,
          signal: controller.signal,
          onProgress: (phase, d, total) => setRecording({ format, index, total: list.length, phase, done: d, frames: total }),
        });
        const result = { name: `${fileSlug(fileName)}-video-${format.replace(':', 'x')}.mp4`, blob, format, seconds: tl.duration };
        downloadBlob(result.blob, result.name);
        done.push(result);
        setResults([...done]);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      abort.current = null;
      shown.current = null; // la grabación restauró el visor: volver a aplicar la vista previa
      setRecording(null);
    }
  };

  const advice = pacingAdvice(timeline);
  const busy = !!recording;
  const startOfSelected = timeline.scenes.find((s) => s.index === selected)?.start ?? 0;

  return (
    <>
      {step === 'textos' && !playing && !recording && <TextInteraction engine={engine} timeline={timeline} items={project.textItems} selected={selectedText} time={clock} onSelect={setSelectedText} onChange={(id, patch) => setDraft(d => ({ ...d, project: updateText(d.project, id, patch) }))} />}
      <nav role="tablist" className="video-steps" aria-label="Pasos del video">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            className={step === s.id ? 'is-active' : undefined}
            role="tab"
            aria-selected={step === s.id}
            onKeyDown={(event) => {
              if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? STEPS.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + STEPS.length) % STEPS.length;
              setStep(STEPS[next].id); setAdding(false);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next].focus();
            }}
            onClick={() => {
              setStep(s.id);
              setAdding(false);
            }}
            disabled={busy}
          >
            <span>{i + 1}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <div className={`editor-scroll studio-scroll${step === 'historia' && !adding ? ' scene-panel' : ''}`}>
        {error && (
          <p className="diag diag-warn">
            <IconAlert width={16} height={16} />
            <span>{error}</span>
          </p>
        )}

        {step === 'estilo' && <>
          <StyleStep project={project} onPick={(id) => {
            const next = applyTemplate(project, id);
            const figuritas = id === 'figuritas' ? next.scenes.findIndex((s) => s.kind === 'figuritas') : -1;
            setProject(next, Math.max(0, figuritas));
            if (figuritas >= 0) setStep('historia'); // para cargar las figuritas enseguida
          }} onNext={() => setStep('historia')} />
        </>}

        {step === 'historia' &&
          (adding ? (
            <AddSceneStep
              onPick={(kind) => {
                apply(addScene(project, kind, selected));
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <SceneStep
              figuritas={<>
                <FiguritasStep scene={project.scenes[selected]} shape={shape} library={library} onLibrary={changeLibrary} onChange={(patch) => setProject(updateScene(project, selected, patch))} />
                <button className="btn btn-block" disabled={!images || !timeline.scenes.some((s) => s.index === selected)} onClick={() => play(startOfSelected)}>{playing ? 'Detener animación' : 'Ver cómo se pegan'}</button>
              </>}
              engine={engine}
              project={project}
              timeline={timeline}
              index={selected}
              onChange={(patch) => setProject(updateScene(project, selected, patch))}
              onMove={(delta) => apply(moveScene(project, selected, delta))}
              onDuplicate={() => apply(duplicateScene(project, selected))}
              onRemove={() => apply(removeScene(project, selected))}
              onAdd={() => setAdding(true)}
              onShowPoint={(point) => {
                const scene = timeline.scenes.find((s) => s.index === selected);
                if (!scene) return;
                const t = point === 'inicio' ? scene.start : Math.max(scene.start, scene.end - 1 / 30);
                preview.current?.seek(t); setClock(t);
              }}
              onPlayScene={() => play(startOfSelected, (timeline.scenes.find((s) => s.index === selected)?.end ?? timeline.duration) - 1 / 30)}
            />
          ))}

        {step === 'textos' && (
          <TextsStep
            project={project}
            onChange={setProject}
            selected={selectedText} onSelect={setSelectedText} time={clock}
            onTime={t => { preview.current?.seek(t); setClock(t); }}
          />
        )}

        {step === 'ambiente' && <EnvironmentStep project={project} onChange={(patch) => setProject({ ...project, ...patch })} />}

        {step === 'exportar' && (
          <ExportStep
            project={project}
            formats={formats}
            timeline={timeline}
            advice={advice}
            safeZones={safeZones}
            playing={playing}
            recording={recording}
            results={results}
            onToggleFormat={toggleFormat}
            onDuration={(duration) => setProject({ ...project, duration })}
            onSafeZones={setSafeZones}
            onPlayAll={() => play(0)}
            onExport={exportVideos}
            onCancel={() => abort.current?.abort()}
            onDownload={(r) => downloadBlob(r.blob, r.name)}
          />
        )}
      </div>

      {dock &&
        createPortal(
          <Storyboard
            engine={engine}
            project={project}
            timeline={timeline}
            selected={selected}
            playing={playing}
            clock={clock}
            disabled={busy}
            onSelect={(index) => {
              if (playing) preview.current?.stop();
              setSelected(index);
              setStep('historia');
              setAdding(false);
            }}
            onPlace={(from, to) => apply(placeScene(project, from, to))}
            onAdd={() => {
              setStep('historia');
              setAdding(true);
            }}
            onTogglePlay={() => play(0)}
          />,
          dock,
        )}
    </>
  );
}
