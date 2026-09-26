import { useEffect, useState } from 'react';
import { THUMB_HEIGHT } from '../pdf/PdfPageProvider';
import type { PdfSource } from '../pdf/pdfSource';

/**
 * Miniaturas de las páginas completas del PDF (para el editor de hojas). Usa la
 * misma altura que las miniaturas del libro, así ambos comparten la caché de PdfSource.
 */
export function useSourceThumbnails(pdf: PdfSource | null, enabled: boolean): (HTMLCanvasElement | undefined)[] {
  const [thumbs, setThumbs] = useState<(HTMLCanvasElement | undefined)[]>([]);

  useEffect(() => {
    setThumbs([]);
    if (!pdf || !enabled) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < pdf.pageCount && !cancelled; i++) {
        try {
          const canvas = await pdf.rasterize(i, THUMB_HEIGHT);
          if (cancelled) return;
          setThumbs((prev) => {
            const next = prev.slice();
            next[i] = canvas;
            return next;
          });
        } catch {
          if (cancelled) return; // documento cerrado mientras cargaba
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, enabled]);

  return thumbs;
}
