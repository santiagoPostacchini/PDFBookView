import { useEffect, useRef, useState } from 'react';
import type { BookEngine } from '../book/BookEngine';
import type { SheetPlan } from '../pdf/imposition';
import { bookletLayout, simpleLayout, type BookLayout, type ReadingModeId } from '../pdf/layouts';
import { PdfPageProvider } from '../pdf/PdfPageProvider';
import type { PdfSource } from '../pdf/pdfSource';

export interface LoadedBook {
  layout: BookLayout;
  pageCount: number;
  /** Aviso cuando el modo elegido no parece coincidir con el PDF. */
  hint: string | null;
}

/** Espera antes de rearmar tras una edición, para agrupar clics seguidos. */
const REBUILD_DELAY_MS = 120;

/**
 * Conecta PDF + modo de lectura (+ plan de hojas) con el motor 3D. Al editar el
 * plan o cambiar de modo el libro se rearma en el lugar, conservando la doble
 * página visible y la cámara; al cambiar de PDF se descarta antes de cerrarlo.
 */
export function useBookLoader(engine: BookEngine | null, pdf: PdfSource | null, mode: ReadingModeId, plan: SheetPlan | null) {
  const [book, setBook] = useState<LoadedBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const builtFor = useRef<PdfSource | null>(null);

  // Ciclo de vida por documento: este cleanup corre antes de que App cierre el PDF.
  useEffect(() => {
    if (!engine || !pdf) return;
    return () => {
      engine.setBook(null);
      builtFor.current = null;
      setBook(null);
    };
  }, [engine, pdf]);

  useEffect(() => {
    setError(null);
    if (!engine || !pdf || (mode === 'booklet' && !plan)) return;

    let cancelled = false;
    const rebuild = builtFor.current === pdf;
    const timer = setTimeout(
      async () => {
        try {
          const layout = mode === 'booklet' ? bookletLayout(plan!, pdf.pageCount) : simpleLayout(pdf.pageCount);
          const [provider, firstSize] = await Promise.all([PdfPageProvider.create(pdf, layout), pdf.pageSize(0)]);
          if (cancelled) return;
          engine.setBook(provider, rebuild ? { initialSpread: engine.spreadIndex, keepView: true } : {});
          builtFor.current = pdf;
          const landscape = firstSize.width > firstSize.height * 1.2;
          setBook({
            layout,
            pageCount: provider.pageCount,
            hint:
              mode === 'simple' && landscape
                ? 'Las páginas del PDF son apaisadas: si traen dos páginas por hoja, probá el modo Revista DIY.'
                : null,
          });
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        }
      },
      rebuild ? REBUILD_DELAY_MS : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [engine, pdf, mode, plan]);

  return { book, error };
}
