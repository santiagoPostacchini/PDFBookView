import { expect, it } from 'vitest';
import { MAX_FONT_BYTES, validateFont } from './fonts';
const file = { name: 'Mi_Fuente.woff2', type: 'font/woff2', size: 100 };
it('acepta formatos de fuente y MIME permitido o vacío', () => {
  for (const ext of ['ttf', 'otf', 'woff', 'woff2']) for (const type of ['', 'font/ttf', 'application/font-woff']) expect(validateFont({ ...file, name: `nombre.${ext}`, type }, []).id).toBe('user:nombre');
});
it('rechaza extensión, MIME, archivo vacío y tamaño excesivo', () => {
  for (const patch of [{ name: 'x.png' }, { type: 'image/png' }, { size: 0 }, { size: MAX_FONT_BYTES + 1 }]) expect(() => validateFont({ ...file, ...patch }, [])).toThrow();
  expect(validateFont({ ...file, size: MAX_FONT_BYTES }, []).id).toBe('user:mi-fuente');
});
it('genera nombre legible e ids únicos de hasta 40 caracteres', () => {
  expect(validateFont(file, []).name).toBe('Mi Fuente');
  const existing: { id: string }[] = [];
  for (let i = 0; i < 20; i++) {
    const font = validateFont({ ...file, name: `${'Á'.repeat(50)}.ttf` }, existing);
    expect(font.id).toMatch(/^user:[a-z0-9-]{1,40}$/); expect(existing.some(f => f.id === font.id)).toBe(false); existing.push(font);
  }
  expect(() => validateFont(file, existing)).toThrow('20 fuentes');
  expect(validateFont({ ...file, name: '字.ttf' }, []).id).toBe('user:fuente');
});
