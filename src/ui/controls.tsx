import { useRef, type CSSProperties, type ReactNode } from 'react';

/** Bloque titulado de un panel lateral (estudio, editor de video). */
export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="studio-section">
      <h3>{title}</h3>
      {children}
      {hint && <p className="editor-formula">{hint}</p>}
    </section>
  );
}

/** Opciones excluyentes como pastillas. */
export function Chips<T extends string>({
  items,
  value,
  onChange,
  disabled,
}: {
  items: { id: T; label: string; style?: CSSProperties }[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="chips" role="radiogroup">
      {items.map((item) => (
        <button
          key={item.id}
          role="radio"
          aria-checked={value === item.id}
          className={`chip${value === item.id ? ' is-active' : ''}`}
          style={item.style}
          onClick={() => onChange(item.id)}
          disabled={disabled}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  hint,
  onChange,
  ...input
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useRef(`slider-${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="slider">
      <label htmlFor={id}>
        <span>{label}</span>
        {input.max <= 1 && <output>{Math.round(input.value * 100)}%</output>}
      </label>
      <input id={id} type="range" {...input} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </div>
  );
}
