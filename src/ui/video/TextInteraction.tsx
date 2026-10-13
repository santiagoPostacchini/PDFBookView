import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BookEngine } from '../../book/BookEngine';
import type { Timeline } from '../../promo/compile';
import type { TextItem } from '../../promo/model';
import { cueMotion, measureCueBox } from '../../promo/overlay';
import { hitText, pointerPosition, scaleText, snap, type Rect } from '../../promo/textInteraction';

export function TextInteraction({ engine, timeline, items, selected, time, onSelect, onChange }: {
  engine: BookEngine; timeline: Timeline; items: TextItem[]; selected: string | null; time: number;
  onSelect: (id: string) => void; onChange: (id: string, patch: Partial<TextItem>) => void;
}) {
  const [frame, setFrame] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const [fontVersion, setFontVersion] = useState(0);
  const drag = useRef<{ id: string; x: number; y: number; size: number; startX: number; startY: number; scale: boolean; distance: number } | null>(null);
  const ctx = useRef<CanvasRenderingContext2D | null>(null);
  if (!ctx.current) ctx.current = document.createElement('canvas').getContext('2d');
  useEffect(() => {
    let handle = 0;
    const update = () => {
      const r = engine.renderer.domElement.getBoundingClientRect();
      setFrame(old => old.x === r.x && old.y === r.y && old.width === r.width && old.height === r.height ? old : { x: r.x, y: r.y, width: r.width, height: r.height });
      handle = requestAnimationFrame(update);
    };
    update();
    const fonts = () => setFontVersion(v => v + 1);
    document.fonts.addEventListener('loadingdone', fonts); window.addEventListener('pdf-book-view.fonts', fonts);
    void document.fonts.ready.then(fonts);
    return () => { cancelAnimationFrame(handle); document.fonts.removeEventListener('loadingdone', fonts); window.removeEventListener('pdf-book-view.fonts', fonts); };
  }, [engine]);
  void fontVersion;
  const boxes = items.filter(item => item.id === selected || (time >= item.start && time <= Math.min(timeline.duration, item.start + item.duration))).map(item => {
    const cue = { ...item, end: Math.min(timeline.duration, item.start + item.duration) };
    const box = measureCueBox(ctx.current!, cue, frame.width, frame.height, timeline.textTypography);
    const active = time >= item.start && time <= cue.end;
    box.y += active ? cueMotion(cue, time, timeline.duration, frame.height).dy : 0;
    return { id: item.id, item, box, active };
  });
  return createPortal(<div className="text-interaction-layer" style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}>
    {boxes.map(({ id, item, box, active }) => <div key={id} role="button" tabIndex={id === selected ? 0 : -1} aria-label={`Mover texto: ${item.text || 'Texto vacío'}`} data-text-id={id}
      className={`text-selection${id === selected ? ' is-selected' : ''}${active ? '' : ' is-inactive'}`}
      style={{ left: box.x, top: box.y, width: Math.max(12, box.width), height: Math.max(12, box.height), pointerEvents: active || id === selected ? 'auto' : 'none' }}
      onKeyDown={e => {
        const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (!offsets[e.key]) return;
        e.preventDefault(); e.stopPropagation(); const [dx, dy] = offsets[e.key], step = e.shiftKey ? .05 : .01;
        onChange(id, { x: snap(item.x + dx * step), y: snap(item.y + dy * step) });
      }}
      onPointerDown={e => {
        if (e.button !== 0) return;
        const target = hitText(boxes.filter(b => b.active || b.id === selected), e.clientX - frame.x, e.clientY - frame.y);
        const scale = (e.target as HTMLElement).dataset.handle === 'scale';
        if (!scale && target?.id !== id) return;
        e.preventDefault(); e.stopPropagation(); onSelect(id); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
        const point = pointerPosition(e.clientX, e.clientY, frame);
        drag.current = { id, x: item.x, y: item.y, size: item.size, startX: point.x, startY: point.y, scale, distance: Math.hypot(e.clientX - frame.x - item.x * frame.width, e.clientY - frame.y - item.y * frame.height) };
      }}
      onPointerMove={e => {
        const d = drag.current; if (!d || d.id !== id) return;
        e.preventDefault(); e.stopPropagation();
        const point = pointerPosition(e.clientX, e.clientY, frame);
        onChange(id, d.scale ? { size: scaleText(d.size, d.distance, Math.hypot(e.clientX - frame.x - d.x * frame.width, e.clientY - frame.y - d.y * frame.height)) } : { x: snap(d.x + point.x - d.startX), y: snap(d.y + point.y - d.startY) });
      }}
      onPointerUp={e => { e.stopPropagation(); drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      {id === selected && <span className="text-scale-handle" data-handle="scale" aria-hidden="true" />}
    </div>)}
  </div>, engine.renderer.domElement.parentElement ?? document.body);
}
