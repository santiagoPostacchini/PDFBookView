/** Descarga un archivo generado en el navegador. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Nombre de archivo seguro a partir del nombre del PDF ("Mi Álbum.pdf" → "mi-album"). */
export function fileSlug(name: string): string {
  return (
    name
      .replace(/\.pdf$/i, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'album'
  );
}
