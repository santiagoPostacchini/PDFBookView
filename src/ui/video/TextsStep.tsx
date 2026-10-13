import { useEffect, useState } from 'react';
import type { PromoProject, TextItem } from '../../promo/model';
import { addText, duplicateText, removeText, updateText } from '../../promo/editing';
import { addFont, ensureFont, listFonts, removeFont, type UserFont } from '../../promo/fonts';
import { loadBrand, saveBrand } from '../../promo/projectStorage';
import { Chips, Disclosure, FileButton, Section, Slider, Swatch, Toggle } from '../controls';

export function TextsStep({ project, onChange, selected, onSelect, time, onTime }: {
  project: PromoProject; onChange: (project: PromoProject) => void;
  selected: string | null; onSelect: (id: string | null) => void; time: number; onTime: (time: number) => void;
}) {
  const [fonts, setFonts] = useState<UserFont[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void listFonts().then(next => { if (active) setFonts(next); }); };
    refresh(); window.addEventListener('pdf-book-view.fonts', refresh);
    return () => { active = false; window.removeEventListener('pdf-book-view.fonts', refresh); };
  }, []);
  const item = project.textItems.find(t => t.id === selected);
  const full = project.textItems.length >= 30;
  const change = (patch: Partial<TextItem>) => { if (item) onChange(updateText(project, item.id, patch)); setSaved(false); };
  const insert = (duplicate = false) => {
    const next = duplicate && item ? duplicateText(project, item.id) : addText(project, { start: time });
    onChange(next); onSelect(next.textItems.at(-1)?.id ?? null);
  };
  const move = (index: number, delta: number) => {
    const textItems = [...project.textItems];
    [textItems[index], textItems[index + delta]] = [textItems[index + delta], textItems[index]];
    onChange({ ...project, textItems });
  };
  return <>
    <Section title={`Textos (${project.textItems.length} de 30)`}>
      {!project.textItems.length && <p>Agregá un texto para contar algo en el momento que elijas.</p>}
      <div className="text-items-list">
        {project.textItems.map((text, index) => <div className="text-item-row" key={text.id}>
          <button className={`btn text-item-select${text.id === selected ? ' is-active' : ''}`} aria-pressed={text.id === selected} onClick={() => onSelect(text.id)}>
            <span>{text.text.slice(0, 35) || 'Texto vacío'}</span><small>{text.start.toFixed(1)}–{(text.start + text.duration).toFixed(1)} s</small>
          </button>
          <button className="btn" aria-label={`Subir texto ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
          <button className="btn" aria-label={`Bajar texto ${index + 1}`} disabled={index === project.textItems.length - 1} onClick={() => move(index, 1)}>↓</button>
        </div>)}
      </div>
      <button className="btn btn-block" disabled={full} onClick={() => insert()}>Agregar texto</button>
      {full && <p role="status">Llegaste al máximo de 30 textos. Borrá uno para agregar otro.</p>}
    </Section>
    <Section title="Momento de la vista previa">
      <Slider label="Tiempo de la vista previa (segundos)" min={0} max={project.duration} step={0.1} value={time} onChange={onTime} />
      <output>{time.toFixed(1)} s</output>
    </Section>
    {item && <>
      <Section title="Editar texto">
        <label className="field"><span>Texto</span><textarea className="text-input" aria-label="Texto" rows={3} maxLength={120} value={item.text} onChange={e => change({ text: e.target.value })} /></label>
        <small>Enter agrega un salto de línea. {item.text.length}/120 caracteres.</small>
        <div className="scene-actions">
          <button className="btn" disabled={full} onClick={() => insert(true)}>Duplicar texto</button>
          <button className="btn" onClick={() => { const next = removeText(project, item.id); onChange(next); onSelect(next.textItems[0]?.id ?? null); }}>Borrar texto</button>
        </div>
      </Section>
      <Section title="Fuente" hint="Usá solo fuentes que tengas permiso de usar">
        <Chips items={[{ id: 'builtin:clasica', label: 'Clásica' }, { id: 'builtin:moderna', label: 'Moderna' }, { id: 'builtin:manuscrita', label: 'Manuscrita' }, ...fonts.map(f => ({ id: f.id, label: f.name }))]} value={item.font} onChange={font => change({ font })} />
        {fonts.map(font => <button key={font.id} className="btn" aria-label={`Quitar fuente ${font.name}`} onClick={() => { void removeFont(font.id).catch(e => setError(String(e))); }}>Quitar {font.name}</button>)}
        <FileButton aria-label="Subir fuente" buttonLabel="Subir fuente" accept=".ttf,.otf,.woff,.woff2" onChange={e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
          setError(''); void addFont(file).then(async font => {
            if (!await ensureFont(font.id)) throw new Error('No se pudo cargar la fuente. Probá con otro archivo.');
            setFonts(await listFonts()); change({ font: font.id });
            window.dispatchEvent(new Event('pdf-book-view.fonts'));
          }).catch(e => setError(e instanceof Error ? e.message : String(e)));
        }} />
        {error && <p className="diag diag-warn" role="alert">{error}</p>}
      </Section>
      <Section title="Color">
        <button className="btn" aria-pressed={item.color === 'auto'} onClick={() => change({ color: 'auto' })}>Automático</button>
        <div className="chips">{[['#ffffff', 'Blanco'], ['#222222', 'Negro'], ['#c43a3a', 'Rojo'], ['#e8be55', 'Dorado']].map(([color, name]) => <Swatch key={color} color={color} name={name} selected={item.color === color} onClick={() => change({ color })} />)}</div>
        <label className="field"><span>Color propio</span><input aria-label="Color propio" type="color" value={item.color === 'auto' ? '#ffffff' : item.color} onChange={e => change({ color: e.target.value })} /></label>
      </Section>
      <Section title="Estilo">
        <Slider label="Tamaño" min={0.01} max={0.3} step={0.005} value={item.size} onChange={size => change({ size })} />
        <label className="check"><Toggle checked={item.bold ?? false} onChange={e => change({ bold: e.target.checked })} /><span>Negrita</span></label>
        <Section title="Alineación"><Chips items={[{ id: 'izquierda', label: 'Izquierda' }, { id: 'centro', label: 'Centro' }, { id: 'derecha', label: 'Derecha' }]} value={item.align ?? 'centro'} onChange={align => change({ align })} /></Section>
        <Section title="Animación"><Chips items={[{ id: 'subir', label: 'Subir' }, { id: 'fundido', label: 'Fundido' }, { id: 'ninguna', label: 'Ninguna' }]} value={item.animation} onChange={animation => change({ animation })} /></Section>
      </Section>
      <Section title="Posición">
        <div className="text-position-grid">{['Arriba', 'Centro', 'Abajo'].flatMap((vertical, row) => ['izquierda', 'centro', 'derecha'].map((horizontal, col) => {
          const x = [.15, .5, .85][col], y = [.15, .5, .85][row];
          return <button className="btn" key={`${row}-${col}`} aria-label={`${vertical} ${horizontal}`} aria-pressed={item.x === x && item.y === y} onClick={() => change({ x, y })}>●</button>;
        }))}</div>
        <Slider label="Posición X" min={0} max={1} step={0.01} value={item.x} onChange={x => change({ x })} />
        <Slider label="Posición Y" min={0} max={1} step={0.01} value={item.y} onChange={y => change({ y })} />
      </Section>
      <Section title="Tiempo">
        {(['start', 'duration'] as const).map(key => <label className="field" key={key}><span>{key === 'start' ? 'Inicio' : 'Duración'} (segundos)</span><input className="text-input" aria-label={key === 'start' ? 'Inicio' : 'Duración'} type="number" min={key === 'start' ? 0 : .5} step={.1} value={Number(item[key].toFixed(2))} onChange={e => change({ [key]: Number(e.target.value) })} /></label>)}
        <button className="btn btn-block" onClick={() => change({ start: time })}>Empezar en el momento actual</button>
        <button className="btn btn-block" disabled={time < item.start + .5} onClick={() => change({ duration: time - item.start })}>Terminar en el momento actual</button>
      </Section>
      <Disclosure title="Más opciones">
        <button className="btn btn-block" onClick={() => change({ x: .5, y: .2, size: .04, color: 'auto', bold: false, align: 'centro', animation: 'ninguna', font: 'builtin:clasica' })}>Restablecer posición/estilo</button>
        {['cta', 'handle'].includes(item.id) && <button className="btn btn-block" onClick={() => { saveBrand({ ...loadBrand(), [item.id]: item.text }); setSaved(true); }}>Guardar como mi marca</button>}
        {saved && <p role="status">Marca guardada para videos nuevos.</p>}
      </Disclosure>
    </>}
  </>;
}
