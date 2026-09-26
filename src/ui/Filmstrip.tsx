import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BookEngine } from '../book/BookEngine';
import type { PageImage, SpreadInfo } from '../book/types';
import type { BookLayout } from '../pdf/layouts';
import { CanvasThumb } from './CanvasThumb';

interface Props {
  engine: BookEngine;
  layout: BookLayout;
  spread: SpreadInfo | null;
}

const THUMB_H = 88;

/**
 * Tira de dobles páginas en orden de lectura. Además de navegar, sirve para
 * verificar el armado: cada página muestra de qué página/mitad del PDF salió.
 */
export function Filmstrip({ engine, layout, spread }: Props) {
  const pageCount = layout.slots.length;
  const [images, setImages] = useState<(PageImage | undefined)[]>(() =>
    Array.from({ length: pageCount }, (_, i) => engine.getThumbnail(i)),
  );
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setImages(Array.from({ length: pageCount }, (_, i) => engine.getThumbnail(i)));
    return engine.on('thumbnail', (page, image) =>
      setImages((prev) => {
        const next = prev.slice();
        next[page] = image;
        return next;
      }),
    );
  }, [engine, layout, pageCount]);

  useLayoutEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [spread?.index]);

  const leafCount = Math.ceil(pageCount / 2);
  const spreads = Array.from({ length: leafCount + 1 }, (_, s) => {
    const left = 2 * s - 1;
    const right = 2 * s;
    return { s, left: s > 0 && left < pageCount ? left : null, right: right < pageCount ? right : null };
  }).filter(({ left, right }) => left !== null || right !== null);

  return (
    <nav className="filmstrip" aria-label="Páginas del libro">
      {spreads.map(({ s, left, right }) => (
        <button
          key={s}
          ref={spread?.index === s ? activeRef : undefined}
          className={`strip-spread${spread?.index === s ? ' is-active' : ''}`}
          onClick={() => engine.goToSpread(s)}
          title={`Ir a ${[left, right].filter((p) => p !== null).map((p) => p! + 1).join('–')}`}
        >
          <div className="strip-pages">
            {left !== null ? <CanvasThumb image={images[left]} height={THUMB_H} className="strip-thumb" /> : <div className="strip-empty" />}
            {right !== null ? <CanvasThumb image={images[right]} height={THUMB_H} className="strip-thumb" /> : <div className="strip-empty" />}
          </div>
          <div className="strip-labels">
            <span>{left !== null && <PageLabel page={left} layout={layout} />}</span>
            <span>{right !== null && <PageLabel page={right} layout={layout} />}</span>
          </div>
        </button>
      ))}
    </nav>
  );
}

function PageLabel({ page, layout }: { page: number; layout: BookLayout }) {
  return (
    <>
      <b>{page + 1}</b>
      <small>{layout.slots[page]?.label ?? 'en blanco'}</small>
    </>
  );
}
