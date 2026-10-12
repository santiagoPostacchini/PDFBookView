import { SCENARIOS } from '../book/scenarios';
import { Swatch } from './controls';

export function ScenarioPicker({ value, onChange, customColor, onCustomColor, photo = false }: {
  value: string; onChange: (id: string) => void; customColor: string;
  onCustomColor: (color: string) => void; photo?: boolean;
}) {
  return <div className="scenario-picker">
    {!photo && <button className={`btn${value === 'automatico' ? ' is-active' : ''}`} aria-pressed={value === 'automatico'} onClick={() => onChange('automatico')}>Automático · color de la tapa</button>}
    <div className="swatches">
      {SCENARIOS.filter((s) => !s.tablecloth).map((s) => <Swatch key={s.id} color={s.color} name={s.label} title={s.label}
        selected={value === s.id} aria-label={`${photo ? 'Fondo' : 'Escenario'} ${s.label}`} onClick={() => onChange(s.id)} />)}
      <label className={`swatch swatch-named scenario-custom${value === 'custom' || value.startsWith('color:') ? ' is-active' : ''}`}>
        <span className="swatch-color" style={{ background: customColor }} aria-hidden="true" />
        <span>Color a elección</span>
        <input type="color" value={customColor} onChange={(e) => onCustomColor(e.target.value)} aria-label={photo ? 'Color de fondo a elección' : 'Color de escenario a elección'} />
      </label>
      {photo && <Swatch selected={value === 'transparent'} className="scenario-transparent" name="Transparente (PNG)" aria-label="Fondo transparente" onClick={() => onChange('transparent')} />}
    </div>
    <div className="scenario-cloths" aria-label="Manteles">
      {SCENARIOS.filter((s) => s.tablecloth).map((s) => <button key={s.id} className={`scenario-cloth${value === s.id ? ' is-active' : ''}`} aria-pressed={value === s.id} onClick={() => onChange(s.id)}>
        <span className={`tablecloth-sample ${s.tablecloth}`} aria-hidden="true" /><span>{s.label}</span>
      </button>)}
    </div>
  </div>;
}
