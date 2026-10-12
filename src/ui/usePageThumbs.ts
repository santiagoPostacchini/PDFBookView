import { useEffect, useState } from 'react';
import type { BookEngine } from '../book/BookEngine';
import type { PageImage } from '../book/types';

/** Miniaturas de las páginas del libro, actualizadas a medida que se rasterizan. */
export function usePageThumbs(engine: BookEngine, pageCount: number, key?: unknown): (PageImage | undefined)[] {
  const [images, setImages] = useState<(PageImage | undefined)[]>(() => Array.from({ length: pageCount }, (_, i) => engine.getThumbnail(i)));

  useEffect(() => {
    setImages(Array.from({ length: pageCount }, (_, i) => engine.getThumbnail(i)));
    return engine.on('thumbnail', (page, image) =>
      setImages((prev) => {
        const next = prev.slice();
        next[page] = image;
        return next;
      }),
    );
  }, [engine, pageCount, key]);

  return images;
}
