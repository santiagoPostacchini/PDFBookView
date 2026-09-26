import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { BookEngine } from './book/BookEngine';
import type { SpreadInfo } from './book/types';
import { diagnosePlan, type SheetPlan } from './pdf/imposition';
import type { ReadingModeId } from './pdf/layouts';
import { PdfSource } from './pdf/pdfSource';
import { loadPlan, savePlan } from './pdf/planStorage';
import { Filmstrip } from './ui/Filmstrip';
import {
  IconAlert,
  IconBook,
  IconChevronLeft,
  IconChevronRight,
  IconFirst,
  IconLast,
  IconPages,
  IconReset,
  IconSheets,
  IconUpload,
  IconZoomIn,
  IconZoomOut,
} from './ui/icons';
import { ModeSelector } from './ui/ModeSelector';
import { SheetEditor } from './ui/SheetEditor';
import { useBookLoader } from './ui/useBookLoader';

const MODE_KEY = 'pdf-book-view.mode';

function readStoredMode(): ReadingModeId {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'simple' || stored === 'booklet') return stored;
  } catch {
    /* almacenamiento bloqueado: se usa el valor por defecto */
  }
  return 'booklet';
}

function describeSpread(spread: SpreadInfo): string {
  const pages = [spread.leftPage, spread.rightPage].filter((p): p is number => p !== null).map((p) => p + 1);
  if (!pages.length) return `${spread.pageCount} páginas`;
  return `${pages.length > 1 ? 'Págs.' : 'Pág.'} ${pages.join('–')} de ${spread.pageCount}`;
}

export function App() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [engine, setEngine] = useState<BookEngine | null>(null);
  const [pdf, setPdf] = useState<PdfSource | null>(null);
  const [mode, setMode] = useState<ReadingModeId>(readStoredMode);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [spread, setSpread] = useState<SpreadInfo | null>(null);
  const [progress, setProgress] = useState<{ ready: number; total: number } | null>(null);
  const [showStrip, setShowStrip] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [plan, setPlan] = useState<SheetPlan | null>(null);
  const [planNotes, setPlanNotes] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  const { book, error: bookError } = useBookLoader(engine, pdf, mode, plan);
  // Declarado después de useBookLoader: al cambiar de PDF primero se desmonta el libro y luego se cierra el documento.
  useEffect(() => () => void pdf?.destroy(), [pdf]);

  useEffect(() => {
    const instance = new BookEngine(viewportRef.current!);
    setEngine(instance);
    if (import.meta.env.DEV) Object.assign(window, { bookEngine: instance }); // para depurar desde la consola
    return () => {
      instance.dispose();
      setEngine(null);
    };
  }, []);

  useEffect(() => {
    if (!engine) return;
    const offSpread = engine.on('spread', setSpread);
    const offProgress = engine.on('progress', (ready, total) => setProgress({ ready, total }));
    return () => {
      offSpread();
      offProgress();
    };
  }, [engine]);

  useEffect(() => {
    if (!book) setProgress(null);
  }, [book]);

  const openFile = useCallback(
    async (file: File) => {
      setOpenError(null);
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setOpenError(`"${file.name}" no es un PDF.`);
        return;
      }
      setOpening(true);
      try {
        const doc = await PdfSource.open(await file.arrayBuffer(), file.name);
        // Asignación de hojas guardada para este archivo (o la automática si es nuevo).
        const saved = loadPlan(doc.name, doc.pageCount);
        setPlan(saved.plan);
        setPlanNotes(saved.notes);
        setPdf(doc);
        setEditorOpen(mode === 'booklet' && !saved.restored);
      } catch (err) {
        setOpenError(`No se pudo abrir "${file.name}": ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setOpening(false);
      }
    },
    [mode],
  );

  const updatePlan = useCallback(
    (next: SheetPlan) => {
      setPlan(next);
      setPlanNotes([]);
      if (pdf) savePlan(pdf.name, pdf.pageCount, next);
    },
    [pdf],
  );
  const closeEditor = useCallback(() => setEditorOpen(false), []);

  const diagnostics = useMemo(() => (plan && pdf ? diagnosePlan(plan, pdf.pageCount) : null), [plan, pdf]);
  const planIssues = diagnostics ? diagnostics.repeated.length + diagnostics.unused.length : 0;

  const changeMode = (next: ReadingModeId) => {
    setMode(next);
    if (next !== 'booklet') setEditorOpen(false);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* sin persistencia */
    }
  };

  // Teclado: ← → para pasar hoja, Inicio/Fin, + − para zoom, 0 para resetear la vista.
  useEffect(() => {
    if (!engine) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.altKey || event.ctrlKey || event.metaKey) return;
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          engine.next();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          engine.prev();
          break;
        case 'Home':
          engine.goToSpread(0);
          break;
        case 'End':
          engine.goToSpread(Infinity);
          break;
        case '+':
        case '=':
          engine.zoom(0.8);
          break;
        case '-':
          engine.zoom(1.25);
          break;
        case '0':
          engine.resetView();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setDragOver(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void openFile(file);
  };

  const canPrev = !!spread && spread.index > 0;
  const canNext = !!spread && spread.index < spread.leafCount;
  const loading = progress && progress.ready < progress.total;
  const notices = [openError, bookError, ...(mode === 'booklet' ? planNotes : []), book?.hint].filter(Boolean) as string[];
  const showPlanIssue = mode === 'booklet' && !editorOpen && diagnostics && planIssues > 0;
  const editorVisible = editorOpen && mode === 'booklet' && pdf && plan && diagnostics;

  return (
    <div
      className={`app${dragOver ? ' is-dragover' : ''}${editorVisible ? ' is-editing' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
      onDrop={onDrop}
    >
      <div ref={viewportRef} className="viewport" />

      <header className="topbar panel">
        <div className="brand">
          <IconBook width={20} height={20} />
          <span>PDF Book View</span>
        </div>
        <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={opening}>
          <IconUpload />
          {opening ? 'Abriendo…' : 'Cargar PDF'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = '';
          }}
        />
        <ModeSelector value={mode} onChange={changeMode} />
        {pdf && mode === 'booklet' && (
          <button
            className={`btn${editorOpen ? ' is-on' : ''}`}
            onClick={() => setEditorOpen((open) => !open)}
            aria-pressed={editorOpen}
            title="Editar qué página del PDF va en cada hoja física"
          >
            <IconSheets />
            Hojas
            {planIssues > 0 && <span className="badge">{planIssues}</span>}
          </button>
        )}
        {pdf && (
          <span className="file-name" title={pdf.name}>
            {pdf.name}
          </span>
        )}
      </header>

      <div className="camera-controls panel" role="toolbar" aria-label="Cámara">
        <button className="icon-btn" onClick={() => engine?.zoom(0.8)} title="Acercar (+)" aria-label="Acercar">
          <IconZoomIn />
        </button>
        <button className="icon-btn" onClick={() => engine?.zoom(1.25)} title="Alejar (−)" aria-label="Alejar">
          <IconZoomOut />
        </button>
        <button className="icon-btn" onClick={() => engine?.resetView()} title="Vista inicial (0)" aria-label="Vista inicial">
          <IconReset />
        </button>
      </div>

      {(notices.length > 0 || loading || showPlanIssue) && (
        <div className="notices">
          {loading && (
            <div className="notice notice-progress panel">
              <span>
                Preparando páginas {progress.ready}/{progress.total}
              </span>
              <div className="progress">
                <div style={{ width: `${(progress.ready / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          {showPlanIssue && (
            <div className="notice panel">
              <IconAlert />
              <span>
                {[
                  diagnostics.repeated.length && `${diagnostics.repeated.length} página(s) del PDF repetida(s)`,
                  diagnostics.unused.length && `${diagnostics.unused.length} sin usar`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                .{' '}
                <button className="link-btn" onClick={() => setEditorOpen(true)}>
                  Revisar hojas
                </button>
              </span>
            </div>
          )}
          {notices.map((text) => (
            <div key={text} className="notice panel">
              <IconAlert />
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}

      {!pdf && (
        <div className="empty">
          <div className="empty-card panel">
            <IconBook width={44} height={44} className="empty-icon" />
            <h1>Soltá un PDF acá</h1>
            <p>
              Elegí el modo según el archivo: <b>Páginas simples</b> (1 página del PDF = 1 carilla) o <b>Revista DIY</b>{' '}
              (cada hoja del PDF trae 2 páginas compaginadas para imprimir en cuadernillo). Podés cambiarlo después: el
              libro se rearma solo.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => fileInputRef.current?.click()} disabled={opening}>
              <IconUpload />
              {opening ? 'Abriendo…' : 'Elegir PDF'}
            </button>
          </div>
        </div>
      )}

      {book && spread && (
        <>
          <button className="nav-arrow nav-prev" onClick={() => engine?.prev()} disabled={!canPrev} aria-label="Página anterior">
            <IconChevronLeft width={28} height={28} />
          </button>
          <button className="nav-arrow nav-next" onClick={() => engine?.next()} disabled={!canNext} aria-label="Página siguiente">
            <IconChevronRight width={28} height={28} />
          </button>

          <footer className="bottombar">
            {showStrip && engine && <Filmstrip engine={engine} layout={book.layout} spread={spread} />}
            <div className="pager panel">
              <button className="icon-btn" onClick={() => engine?.goToSpread(0)} disabled={!canPrev} title="Tapa (Inicio)" aria-label="Tapa">
                <IconFirst />
              </button>
              <button className="icon-btn" onClick={() => engine?.prev()} disabled={!canPrev} aria-label="Anterior">
                <IconChevronLeft />
              </button>
              <span className="pager-label">{describeSpread(spread)}</span>
              <button className="icon-btn" onClick={() => engine?.next()} disabled={!canNext} aria-label="Siguiente">
                <IconChevronRight />
              </button>
              <button
                className="icon-btn"
                onClick={() => engine?.goToSpread(Infinity)}
                disabled={!canNext}
                title="Contratapa (Fin)"
                aria-label="Contratapa"
              >
                <IconLast />
              </button>
              <span className="pager-sep" />
              <button
                className={`icon-btn${showStrip ? ' is-on' : ''}`}
                onClick={() => setShowStrip((v) => !v)}
                title="Mostrar/ocultar páginas"
                aria-pressed={showStrip}
                aria-label="Tira de páginas"
              >
                <IconPages />
              </button>
            </div>
          </footer>
        </>
      )}

      {editorVisible && (
        <SheetEditor pdf={pdf} plan={plan} diagnostics={diagnostics} onChange={updatePlan} onClose={closeEditor} />
      )}

      {dragOver && <div className="drop-overlay">Soltá el PDF para abrirlo</div>}
    </div>
  );
}
