import { useEffect, useMemo, useState } from 'react';
import {
  autoPlan,
  FACE_SIDES,
  resizePlan,
  sheetFacePages,
  updateFace,
  type Binding,
  type FaceRef,
  type FaceSide,
  type PlanDiagnostics,
  type SheetPlan,
} from '../pdf/imposition';
import type { PdfSource } from '../pdf/pdfSource';
import { CanvasThumb } from './CanvasThumb';
import { IconAlert, IconCheck, IconClear, IconClose, IconMinus, IconPlus, IconSwap, IconWand } from './icons';
import { useSourceThumbnails } from './useSourceThumbnails';

interface Props {
  pdf: PdfSource;
  plan: SheetPlan;
  diagnostics: PlanDiagnostics;
  onChange: (plan: SheetPlan) => void;
  onClose: () => void;
}

const SIDE_LABEL: Record<FaceSide, string> = { front: 'Frente', back: 'Dorso' };
const FACE_THUMB_H = 88;

const BINDINGS: { id: Binding; label: string; formula: string }[] = [
  { id: 'nested', label: 'Anidadas (cuadernillo)', formula: 'frente [N−2k | 2k+1] · dorso [2k+2 | N−2k−1]' },
  { id: 'separate', label: 'Cada hoja doblada por separado', formula: 'frente [4k+4 | 4k+1] · dorso [4k+2 | 4k+3]' },
];

export const faceName = ({ sheet, side }: FaceRef) => `H${sheet + 1} ${SIDE_LABEL[side].toLowerCase()}`;

/**
 * Editor de hojas físicas: para cada hoja (de la exterior a la central) se elige
 * qué página del PDF va en el frente y cuál en el dorso. Cada mitad muestra el
 * número de página del libro que resulta según la encuadernación.
 */
export function SheetEditor({ pdf, plan, diagnostics, onChange, onClose }: Props) {
  const thumbs = useSourceThumbnails(pdf, true);
  const [picking, setPicking] = useState<FaceRef | null>(null);
  const sheetCount = plan.sheets.length;
  const binding = BINDINGS.find((b) => b.id === plan.binding)!;

  const usage = useMemo(() => {
    const map = new Map<number, FaceRef[]>();
    plan.sheets.forEach((sheet, k) =>
      FACE_SIDES.forEach((side) => {
        const { source } = sheet[side];
        if (source !== null) map.set(source, [...(map.get(source) ?? []), { sheet: k, side }]);
      }),
    );
    return map;
  }, [plan]);

  const repeatedSources = new Set(diagnostics.repeated.map((r) => r.source));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (picking) setPicking(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking, onClose]);

  return (
    <aside className="sheet-editor panel" aria-label="Editor de hojas físicas">
      <header className="editor-head">
        <h2>Hojas físicas</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar editor" title="Cerrar (Esc)">
          <IconClose />
        </button>
      </header>

      <div className="editor-scroll">
        <section className="editor-controls">
          <div className="segmented segmented-block" role="radiogroup" aria-label="Encuadernación">
            {BINDINGS.map((b) => (
              <label key={b.id} className={plan.binding === b.id ? 'is-active' : undefined}>
                <input
                  type="radio"
                  name="binding"
                  checked={plan.binding === b.id}
                  onChange={() => onChange({ ...plan, binding: b.id })}
                />
                <span>{b.label}</span>
              </label>
            ))}
          </div>
          <p className="editor-formula">
            Hoja k (0 = exterior), N = 4·hojas: <code>{binding.formula}</code>
          </p>

          <div className="editor-row">
            <div className="stepper" aria-label="Cantidad de hojas">
              <span>Hojas</span>
              <button
                className="icon-btn"
                onClick={() => onChange(resizePlan(plan, sheetCount - 1))}
                disabled={sheetCount <= 1}
                aria-label="Quitar la hoja central"
                title="Quitar la hoja central"
              >
                <IconMinus />
              </button>
              <output>{sheetCount}</output>
              <button
                className="icon-btn"
                onClick={() => onChange(resizePlan(plan, sheetCount + 1))}
                aria-label="Agregar una hoja"
                title="Agregar una hoja vacía"
              >
                <IconPlus />
              </button>
              <span className="stepper-note">{diagnostics.pageCount} páginas</span>
            </div>
            <button
              className="btn"
              onClick={() => onChange(autoPlan(pdf.pageCount, plan.binding))}
              title="PDF 1 → frente hoja 1, PDF 2 → dorso hoja 1, PDF 3 → frente hoja 2…"
            >
              <IconWand />
              Autocompletar
            </button>
          </div>
        </section>

        <Diagnostics diagnostics={diagnostics} plan={plan} />

        <ol className="sheet-list">
          {plan.sheets.map((sheet, k) => {
            const positions = sheetFacePages(plan.binding, k, sheetCount);
            const role = plan.binding === 'nested' ? (k === 0 ? 'exterior' : k === sheetCount - 1 ? 'central' : '') : '';
            return (
              <li key={k} className="sheet-card">
                <div className="sheet-title">
                  Hoja {k + 1}
                  {role && <span>{role}</span>}
                </div>
                <div className="sheet-faces">
                  {FACE_SIDES.map((side) => {
                    const face = sheet[side];
                    const [left, right] = positions[side];
                    const ref = { sheet: k, side };
                    return (
                      <div
                        key={side}
                        className={`face${face.source === null ? ' is-empty' : ''}${
                          face.source !== null && repeatedSources.has(face.source) ? ' is-repeated' : ''
                        }`}
                      >
                        <div className="face-head">
                          <span className="face-side">{SIDE_LABEL[side]}</span>
                          <span className="face-source">{face.source === null ? 'vacía' : `PDF ${face.source + 1}`}</span>
                          <button
                            className={`icon-btn icon-btn-sm${face.swap ? ' is-on' : ''}`}
                            onClick={() => onChange(updateFace(plan, ref, { swap: !face.swap }))}
                            disabled={face.source === null}
                            aria-pressed={face.swap}
                            aria-label={`Invertir mitades de ${faceName(ref)}`}
                            title="Invertir mitades"
                          >
                            <IconSwap width={16} height={16} />
                          </button>
                          <button
                            className="icon-btn icon-btn-sm"
                            onClick={() => onChange(updateFace(plan, ref, { source: null, swap: false }))}
                            disabled={face.source === null}
                            aria-label={`Dejar vacía ${faceName(ref)}`}
                            title="Dejar la cara vacía"
                          >
                            <IconClear width={16} height={16} />
                          </button>
                        </div>
                        <button
                          className="face-preview"
                          onClick={() => setPicking(ref)}
                          aria-label={`Elegir página del PDF para ${faceName(ref)}`}
                          title="Elegir página del PDF"
                        >
                          {/* Las insignias marcan qué página del libro resulta en cada mitad del PDF. */}
                          <span className="face-art">
                            {face.source === null ? (
                              <span className="face-blank">en blanco</span>
                            ) : (
                              <CanvasThumb image={thumbs[face.source]} height={FACE_THUMB_H} placeholderWidth={FACE_THUMB_H * 1.41} className="face-thumb" />
                            )}
                            <span className="half-badge half-left">{face.swap ? right : left}</span>
                            <span className="half-badge half-right">{face.swap ? left : right}</span>
                          </span>
                          {face.swap && <span className="swap-flag">mitades invertidas</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {picking && (
        <SourcePicker
          target={picking}
          current={plan.sheets[picking.sheet][picking.side].source}
          pageCount={pdf.pageCount}
          thumbs={thumbs}
          usage={usage}
          onPick={(source) => {
            const face = plan.sheets[picking.sheet][picking.side];
            onChange(updateFace(plan, picking, { source, swap: source === face.source ? face.swap : false }));
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </aside>
  );
}

function Diagnostics({ diagnostics, plan }: { diagnostics: PlanDiagnostics; plan: SheetPlan }) {
  const { repeated, unused, emptyFaces } = diagnostics;
  const blankPages = (ref: FaceRef) => {
    const [a, b] = sheetFacePages(plan.binding, ref.sheet, plan.sheets.length)[ref.side];
    return `págs. ${Math.min(a, b)} y ${Math.max(a, b)}`;
  };
  const ok = repeated.length === 0 && unused.length === 0;
  return (
    <section className="diagnostics" aria-live="polite">
      {ok && (
        <p className="diag diag-ok">
          <IconCheck width={16} height={16} />
          Cada página del PDF está asignada una sola vez.
        </p>
      )}
      {repeated.map(({ source, faces }) => (
        <p key={source} className="diag diag-warn">
          <IconAlert width={16} height={16} />
          <span>
            <b>PDF {source + 1}</b> se repite en {faces.map(faceName).join(', ')}.
          </span>
        </p>
      ))}
      {unused.length > 0 && (
        <p className="diag diag-warn">
          <IconAlert width={16} height={16} />
          <span>
            Sin usar: <b>{unused.map((s) => `PDF ${s + 1}`).join(', ')}</b>.
          </span>
        </p>
      )}
      {emptyFaces.length > 0 && (
        <p className="diag diag-info">
          <IconClear width={16} height={16} />
          <span>
            Caras vacías: {emptyFaces.map((ref) => `${faceName(ref)} (${blankPages(ref)} en blanco)`).join(', ')}.
          </span>
        </p>
      )}
    </section>
  );
}

interface PickerProps {
  target: FaceRef;
  current: number | null;
  pageCount: number;
  thumbs: (HTMLCanvasElement | undefined)[];
  usage: Map<number, FaceRef[]>;
  onPick: (source: number | null) => void;
  onClose: () => void;
}

function SourcePicker({ target, current, pageCount, thumbs, usage, onPick, onClose }: PickerProps) {
  return (
    <div className="picker" role="dialog" aria-modal="true" aria-label={`Página del PDF para ${faceName(target)}`}>
      <header className="editor-head">
        <h2>
          {faceName(target).replace(/^H/, 'Hoja ')}
          <small>elegí la página del PDF</small>
        </h2>
        <button className="icon-btn" onClick={onClose} aria-label="Volver" title="Volver (Esc)">
          <IconClose />
        </button>
      </header>
      <div className="picker-grid">
        <button className={`picker-item picker-empty${current === null ? ' is-current' : ''}`} onClick={() => onPick(null)} autoFocus={current === null}>
          <span className="face-blank picker-blank">
            <IconClear />
          </span>
          <span>Cara vacía</span>
          <small>páginas en blanco</small>
        </button>
        {Array.from({ length: pageCount }, (_, source) => {
          const uses = usage.get(source) ?? [];
          return (
            <button
              key={source}
              className={`picker-item${current === source ? ' is-current' : ''}${uses.length === 0 ? ' is-unused' : ''}`}
              onClick={() => onPick(source)}
              autoFocus={current === source}
            >
              <CanvasThumb image={thumbs[source]} height={70} placeholderWidth={99} className="face-thumb" />
              <span>PDF {source + 1}</span>
              <small>{uses.length === 0 ? 'sin usar' : uses.map(faceName).join(', ')}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
