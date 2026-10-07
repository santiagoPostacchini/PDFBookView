import { useRef, useState } from 'react';
import type { BookEngine } from '../../book/BookEngine';
import type { PageImage } from '../../book/types';
import type { Timeline } from '../../promo/compile';
import { sceneAt } from '../../promo/editing';
import type { PromoProject } from '../../promo/model';
import { SCENES } from '../../promo/templates';
import { CanvasThumb } from '../CanvasThumb';
import { IconPlay, IconPlus, IconStop } from '../icons';
import { usePageThumbs } from '../usePageThumbs';

interface Props {
  engine: BookEngine;
  project: PromoProject;
  timeline: Timeline;
  selected: number;
  playing: boolean;
  /** Instante mostrado o reproducido (s). */
  clock: number;
  disabled: boolean;
  onSelect: (index: number) => void;
  onPlace: (from: number, to: number) => void;
  onAdd: () => void;
  onTogglePlay: () => void;
}

export const seconds = (s: number) => s.toFixed(1).replace('.', ',');

/**
 * Guion del video debajo del visor: una tarjeta por escena con las páginas que
 * muestra y cuánto dura. Se elige tocando, se reordena arrastrando y el botón
 * de la izquierda reproduce desde la escena elegida.
 */
export function Storyboard({ engine, project, timeline, selected, playing, clock, disabled, onSelect, onPlace, onAdd, onTogglePlay }: Props) {
  const book = engine.currentBook;
  const pageCount = book?.pageCount ?? 0;
  const thumbs = usePageThumbs(engine, pageCount);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const drag = useRef<{ from: number; x: number; y: number; pointerId: number; active: boolean } | null>(null);
  const skipClick = useRef(false);
  const active = playing ? sceneAt(timeline, clock) : selected;

  // Arrastrar con mouse o lápiz (en pantallas táctiles el dedo desplaza el guion; para reordenar están "Antes" y "Después").
  const sceneAtPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-scene]');
    return el ? Number(el.dataset.scene) : null;
  };
  const endDrag = (x?: number, y?: number) => {
    const d = drag.current;
    drag.current = null;
    if (d?.active) {
      const to = x === undefined || y === undefined ? null : sceneAtPoint(x, y);
      if (to !== null && to !== d.from) onPlace(d.from, to);
      skipClick.current = true;
    }
    setDragging(null);
    setOver(null);
  };

  return (
    <div className="storyboard panel" role="toolbar" aria-label="Guion del video">
      <button
        className="storyboard-play"
        onClick={onTogglePlay}
        disabled={disabled}
        aria-label={playing ? 'Detener' : 'Reproducir desde la escena elegida'}
        title={playing ? 'Detener' : 'Reproducir desde la escena elegida'}
      >
        {playing ? <IconStop width={20} height={20} /> : <IconPlay width={20} height={20} />}
      </button>

      <ol className="storyboard-track">
        {project.scenes.map((scene, i) => {
          const compiled = timeline.scenes.find((s) => s.index === i);
          const progress = playing && compiled && active === i ? (clock - compiled.start) / Math.max(0.01, compiled.end - compiled.start) : null;
          const classes = ['scene-card', i === active && 'is-active', dragging === i && 'is-dragging', over === i && dragging !== i && 'is-over', !compiled && 'is-skipped'];
          return (
            <li key={i}>
              <button
                className={classes.filter(Boolean).join(' ')}
                data-scene={i}
                onPointerDown={(e) => {
                  if (disabled || e.button !== 0 || e.pointerType === 'touch') return;
                  drag.current = { from: i, x: e.clientX, y: e.clientY, pointerId: e.pointerId, active: false };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || d.pointerId !== e.pointerId) return;
                  if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
                    d.active = true;
                    setDragging(d.from);
                  }
                  if (d.active) setOver(sceneAtPoint(e.clientX, e.clientY));
                }}
                onPointerUp={(e) => endDrag(e.clientX, e.clientY)}
                onPointerCancel={() => endDrag()}
                onClick={() => {
                  if (skipClick.current) {
                    skipClick.current = false;
                    return;
                  }
                  onSelect(i);
                }}
                disabled={disabled}
                title={compiled ? `${SCENES[scene.kind].hint} Arrastrala para cambiarla de lugar.` : 'Este álbum tiene una sola hoja: la escena se omite.'}
                aria-current={i === active ? 'true' : undefined}
              >
                <SceneThumb thumbs={thumbs} spread={compiled?.spread ?? 0} pageCount={pageCount} leafCount={book?.leafCount ?? 0} />
                <span className="scene-card-label">
                  <b>
                    {i + 1}. {SCENES[scene.kind].label}
                  </b>
                  <small>{compiled ? `${seconds(compiled.end - compiled.start)} s` : 'se omite'}</small>
                </span>
                {scene.caption && <span className="scene-card-caption">“{scene.caption}”</span>}
                {progress !== null && <span className="scene-card-progress" style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }} />}
              </button>
            </li>
          );
        })}
        <li>
          <button className="scene-add" onClick={onAdd} disabled={disabled} title="Agregar una escena después de la elegida">
            <IconPlus />
            <span>Escena</span>
          </button>
        </li>
      </ol>

      <span className="storyboard-time" aria-live="off">
        {seconds(clock)} / {seconds(timeline.duration)} s
      </span>
    </div>
  );
}

/** Las páginas que se ven en la escena: la tapa, o la doble página (izquierda y derecha). */
function SceneThumb({ thumbs, spread, pageCount, leafCount }: { thumbs: (PageImage | undefined)[]; spread: number; pageCount: number; leafCount: number }) {
  const pages = spread <= 0 ? [0] : spread >= leafCount ? [pageCount - 1] : [2 * spread - 1, 2 * spread].filter((p) => p < pageCount);
  return (
    <span className="scene-thumb">
      {pages.map((p) => (
        <CanvasThumb key={p} image={thumbs[p]} height={46} placeholderWidth={33} className="scene-thumb-page" />
      ))}
    </span>
  );
}
