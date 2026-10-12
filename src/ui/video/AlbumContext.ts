import { createContext } from 'react';
import type { PdfSource } from '../../pdf/pdfSource';
import type { BookLayout } from '../../pdf/layouts';
/** Documento y armado actual, compartidos sólo con el editor de video. */
export const AlbumContext = createContext<{ pdf: PdfSource; layout: BookLayout } | null>(null);
