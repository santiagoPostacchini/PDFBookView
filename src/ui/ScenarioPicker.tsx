import { SCENARIOS, CLOTHS, customScenarioColor } from '../book/scenarios';
import { Swatch, Section, Toggle } from './controls';

export function ScenarioPicker({ value, onChange, customColor, onCustomColor, photo = false, legacy = null, table, cloth, onTable, onCloth }: {
  table: boolean; cloth?: string; onTable: (table: boolean) => void; onCloth: (cloth: string) => void;
  value: string; onChange: (id: string) => void; customColor: string;
  onCustomColor: (color: string) => void; photo?: boolean;
  /** Fondo guardado antes del catálogo (sólo Foto): se muestra seleccionado con su color real. */
  legacy?: { id: string; label: string; color: string } | null;
}) {
  return <div className="scenario-picker"><Section title="Fondo">
    {!photo && <button className={`btn${value === 'automatico' ? ' is-active' : ''}`} aria-pressed={value === 'automatico'} onClick={() => onChange('automatico')}>Automático · color de la tapa</button>}
    <div className="swatches">
      {legacy && <Swatch color={legacy.color} name={legacy.label} title={legacy.label} selected aria-label={`Fondo ${legacy.label}`} onClick={() => onChange(legacy.id)} />}
      {SCENARIOS.map((s) => <Swatch key={s.id} color={s.color} name={s.label} title={s.label}
        selected={value === s.id} aria-label={`Fondo ${s.label}`} onClick={() => onChange(s.id)} />)}
      <label className={`swatch swatch-named scenario-custom${value === 'custom' || value.startsWith('color:') ? ' is-active' : ''}`}>
        <span className="swatch-color" style={{ background: customColor }} aria-hidden="true" />
        <span>Color a elección</span>
        <input type="color" value={customColor} onChange={(e) => onCustomColor(e.target.value)} aria-label="Color de fondo a elección" />
      </label>
      {photo && <Swatch selected={value === 'transparent'} className="scenario-transparent" name="Transparente (PNG)" aria-label="Fondo transparente" onClick={() => onChange('transparent')} />}
    </div>
    </Section>
    <Section title="Mesa">
      <label className="check"><Toggle aria-label="Usar mesa" checked={table} onChange={(e) => onTable(e.target.checked)} /><span>Usar mesa</span></label>
    </Section>
    {table && <Section title="Mantel">
      <div className="scenario-cloths" aria-label="Manteles">
        {CLOTHS.map((s) => <Swatch key={s.id} color={s.color} name={s.label} className={s.tablecloth ? 'cloth-' + s.tablecloth : ''} selected={cloth === s.id}
          aria-label={'Mantel ' + s.label} onClick={() => onCloth(s.id)} />)}
      </div>
      <label className={`field${cloth?.startsWith('color:') ? ' is-active' : ''}`}><span>Color a elección</span><input type="color" aria-label="Color de mantel a elección"
        value={customScenarioColor(cloth ?? '') ?? '#f4e9dc'} onChange={(e) => onCloth('color:' + e.target.value)} /></label>
    </Section>}
  </div>;
}
