import { useEffect, useRef, useState } from 'react';
import type { Timeline } from '../../promo/compile';
import type { TextItem } from '../../promo/model';
import { assignLanes, dragText, FRAME, snapTime, timeToX, xToTime, type TextDrag } from '../../promo/timelineBar';

const LANE = 24;
const seconds = (t: number) => t.toFixed(2).replace('.', ',');
export function TimelineBar({ timeline, items, selected, clock, disabled, playing, onSeek, onPlay, onSelect, onChange, onAdd }: {
  timeline: Timeline; items: TextItem[]; selected: string | null; clock: number; disabled: boolean; playing: boolean;
  onSeek: (t: number) => void; onPlay: () => void; onSelect: (id: string) => void;
  onChange: (id: string, patch: { start: number; duration: number }) => void; onAdd: () => void;
}) {
  const lanes = assignLanes(items);
  const [input, setInput] = useState(clock.toFixed(2));
  const rail = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const pending = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const drag = useRef<{ x: number; width: number; item: TextItem; mode: TextDrag } | null>(null);
  useEffect(() => setInput(clock.toFixed(2)), [clock]);
  useEffect(() => {
    const row = Array.from(track.current?.children ?? []).find(el => (el as HTMLElement).dataset.textId === selected) as HTMLElement | undefined;
    if (row && track.current) track.current.scrollTop = row.offsetTop;
  }, [selected]);
  useEffect(() => () => { if (raf.current !== null) cancelAnimationFrame(raf.current); }, []);
  const seekPointer = (x: number) => {
    const rect = rail.current!.getBoundingClientRect();
    pending.current = xToTime(x - rect.left, rect.width, timeline.duration);
    if (raf.current === null) raf.current = requestAnimationFrame(() => { raf.current = null; if (pending.current !== null) onSeek(pending.current); pending.current = null; });
  };
  const cancelSeek = () => { if (raf.current !== null) cancelAnimationFrame(raf.current); raf.current = null; pending.current = null; };
  return <section className="timeline-bar panel" aria-label="Tiempo y textos del video">
    <div className="timeline-controls">
      <button className="btn timeline-play" disabled={disabled} onClick={onPlay} aria-label={playing ? 'Detener' : 'Reproducir desde el principio'}>{playing ? 'Pausar' : 'Reproducir'}</button>
      <button className="btn" disabled={disabled} aria-label="Cuadro anterior" onClick={() => onSeek(clock - FRAME)}>◀</button>
      <label>Instante <input aria-label="Instante exacto (segundos)" type="number" min="0" max={timeline.duration} step={FRAME} value={input} disabled={disabled} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSeek(Number(input)); } }} /></label>
      <button className="btn" disabled={disabled} aria-label="Cuadro siguiente" onClick={() => onSeek(clock + FRAME)}>▶</button>
      <output>{seconds(clock)} / {seconds(timeline.duration)} s</output>
      <button className="btn" disabled={disabled || items.length >= 30 || snapTime(timeline.duration - clock, timeline.duration) < .5} onClick={onAdd}>Agregar texto aquí</button>
    </div>
    <div ref={rail} className="timeline-rail" role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label="Línea de tiempo del video" aria-valuemin={0} aria-valuemax={timeline.duration} aria-valuenow={clock} aria-valuetext={`${seconds(clock)} s de ${seconds(timeline.duration)} s`}
      onKeyDown={e => { if (disabled) return; const delta = e.shiftKey ? 1 : FRAME; const t = ({ ArrowLeft: clock - delta, ArrowDown: clock - delta, ArrowRight: clock + delta, ArrowUp: clock + delta, Home: 0, End: timeline.duration } as Record<string, number>)[e.key]; if (t !== undefined) { e.preventDefault(); onSeek(t); } }}
      onPointerDown={e => { if (disabled || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); seekPointer(e.clientX); }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seekPointer(e.clientX); }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seekPointer(e.clientX); }} onPointerCancel={cancelSeek}>
      {timeline.scenes.slice(1).map(s => <span key={s.index} className="timeline-mark" style={{ left: `${timeToX(s.start, 100, timeline.duration)}%` }} />)}
      <span className="timeline-head" style={{ left: `${timeToX(clock, 100, timeline.duration)}%` }} />
    </div>
    <div ref={track} className="timeline-text-track" aria-label="Intervalos de los textos">
      <div className="timeline-text-lanes" style={{ height: lanes.count * LANE }}>
      {items.map((item, index) => {
        const start = Math.max(0, item.start), end = Math.min(timeline.duration, item.start + item.duration);
        if (end <= start) return null;
        return <div key={item.id} data-text-id={item.id} className={`timeline-text${selected === item.id ? ' is-selected' : ''}`} style={{ left: `${timeToX(start, 100, timeline.duration)}%`, width: `${timeToX(end - start, 100, timeline.duration)}%`, top: lanes.lanes[index] * LANE }} title={item.text}
          onClick={() => { if (!disabled) onSelect(item.id); }}
          onPointerDown={e => { if (disabled || e.button !== 0) return; e.preventDefault(); onSelect(item.id); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, width: e.currentTarget.parentElement!.getBoundingClientRect().width, item, mode: (e.target as HTMLElement).dataset.edge as TextDrag || 'body' }; }}
          onPointerMove={e => { const d = drag.current; if (d && e.currentTarget.hasPointerCapture(e.pointerId)) onChange(d.item.id, dragText(d.item, d.mode, (e.clientX - d.x) / d.width * timeline.duration, timeline.duration)); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <span className="timeline-edge" data-edge="start" /><span className="timeline-text-label">{item.text}</span><span className="timeline-edge" data-edge="end" />
        </div>;
      })}
      </div>
    </div>
  </section>;
}
