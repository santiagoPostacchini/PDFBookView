import { useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

/** Conserva el input y su evento para etiquetas, teclado y automatización. */
export function Toggle(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input {...props} type="checkbox" className={`toggle ${props.className ?? ''}`} />;
}

/** El input real cubre el botón; no se oculta del teclado ni de Playwright. */
export function FileButton({ onChange, className, buttonLabel = 'Elegir archivo', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue'> & { buttonLabel?: string }) {
  const [names, setNames] = useState('');
  return <span className={`file-control ${className ?? ''}`}>
    <span className="file-button">
      <span aria-hidden="true">{buttonLabel}</span>
      <input {...props} type="file" onChange={(event) => {
        setNames(Array.from(event.currentTarget.files ?? []).map((file) => file.name).join(', '));
        onChange?.(event);
      }} />
    </span>
    <span className="file-control-name" title={names || undefined} aria-live="polite">{names || 'Ningún archivo'}</span>
  </span>;
}

export function Swatch({ color, name, selected, className, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  color?: string; name?: string; selected: boolean;
}) {
  return <button aria-label={props['aria-label'] ?? name ?? props.title ?? 'Color'} {...props} type="button" aria-pressed={selected} className={`swatch${selected ? ' is-active' : ''}${name ? ' swatch-named' : ''} ${className ?? ''}`} style={style}>
    <span className="swatch-color" style={{ background: color }} aria-hidden="true" />
    {name && <span>{name}</span>}
  </button>;
}

/** Disponible para los ajustes secundarios, sin alterar la distribución actual. */
export function Disclosure({ children, title = 'Más ajustes', open }: { children: ReactNode; title?: string; open?: boolean }) {
  return <details className="disclosure" open={open}><summary>{title}</summary><div>{children}</div></details>;
}

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
