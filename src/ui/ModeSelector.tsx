import { READING_MODES, type ReadingModeId } from '../pdf/layouts';

interface Props {
  value: ReadingModeId;
  onChange: (mode: ReadingModeId) => void;
}

const ORDER: ReadingModeId[] = ['simple', 'booklet'];

/** Selector de modo de importación (radio buttons con aspecto de control segmentado). */
export function ModeSelector({ value, onChange }: Props) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Modo de importación">
      {ORDER.map((id) => {
        const mode = READING_MODES[id];
        return (
          <label key={id} className={value === id ? 'is-active' : undefined} title={mode.description}>
            <input
              type="radio"
              name="reading-mode"
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
            />
            <span>{mode.label}</span>
          </label>
        );
      })}
    </div>
  );
}
