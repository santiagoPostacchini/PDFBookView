import { useEffect, useRef } from 'react';
import type { PageImage } from '../book/types';

interface Props {
  image: PageImage | undefined;
  /** Alto en px CSS; el ancho sale de la proporción de la imagen. */
  height: number;
  /** Ancho provisorio mientras la imagen no está lista. */
  placeholderWidth?: number;
  className?: string;
}

/** Copia una imagen (lienzo compartido de caché) a un lienzo propio del tamaño justo. */
export function CanvasThumb({ image, height, placeholderWidth = height * 0.7, className = '' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.height = Math.round(height * dpr);
    canvas.width = Math.max(1, Math.round((image.width / image.height) * canvas.height));
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }, [image, height]);

  const style = image
    ? { height, width: (image.width / image.height) * height }
    : { height, width: placeholderWidth };
  return <canvas ref={ref} className={`${className}${image ? '' : ' is-loading'}`} style={style} />;
}
