import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3, type WebGLRenderer } from 'three';
import { Book } from './Book';
import { PageTextureManager } from './PageTextureManager';
import type { PageImage, PageImageProvider } from './types';

beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect: vi.fn(), drawImage: vi.fn() }) }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('centro de página apoyada', () => {
  it('ubica ambas caras sobre sus pilas y respeta la transformación del libro', () => {
    const book = new Book({ pageCount: 8, pageAspect: 0.7, initialSpread: 2, hardCovers: true });
    book.root.position.set(3, 2, 4);
    book.root.rotation.y = 0.3;
    for (const index of [0, 1, 2, 3, 6, 7]) {
      const spec = book.leaves[Math.floor(index / 2)].spec;
      const right = index % 2 === 0;
      book.content.updateWorldMatrix(true, false);
      const expected = new Vector3((right ? 1 : -1) * book.pageWidth / 2, 0,
        (right ? spec.restZRight : spec.restZLeft) + spec.thickness / 2).applyMatrix4(book.content.matrixWorld);
      expect(book.pageCenter(index).distanceTo(expected)).toBeLessThan(1e-10);
    }
    for (const index of [-1, 8, 0.5, NaN]) expect(() => book.pageCenter(index)).toThrow(RangeError);
    book.dispose();
  });
});

describe('decoraciones de página', () => {
  it('pinta ambas calidades, reemplaza sin acumular y restaura sin alterar miniaturas', async () => {
    const book = new Book({ pageCount: 4, pageAspect: 0.7 });
    const originals = new Map<string, PageImage>();
    const provider: PageImageProvider = {
      pageCount: 4,
      pageAspect: 0.7,
      load: async (page, quality) => {
        const image = { width: quality === 'full' ? 100 : 20, height: 140 } as PageImage;
        originals.set(`${page}-${quality}`, image);
        return image;
      },
    };
    const invalidate = vi.fn();
    const manager = new PageTextureManager(provider, book, {
      capabilities: { getMaxAnisotropy: () => 1 }, initTexture: vi.fn(),
    } as unknown as WebGLRenderer, invalidate);
    const thumbnail = vi.fn();
    manager.onThumbnail = thumbnail;
    const first = vi.fn();
    manager.setDecorations(2, [first]);
    await manager.preload([2]);
    expect(first).toHaveBeenCalledTimes(2);
    expect(first.mock.calls.map((call) => call[1])).toEqual([100, 20]);
    expect(manager.getThumbnail(2)).toBe(originals.get('2-thumb'));
    expect(thumbnail.mock.calls.find((call) => call[0] === 2)?.[1]).toBe(originals.get('2-thumb'));
    const texture = book.leaves[1].front.map!;
    expect(texture.image).not.toBe(originals.get('2-full'));
    const second = vi.fn();
    manager.setDecorations(2, [second]);
    expect(second).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledTimes(2);
    manager.setDecorations(2, null);
    expect(texture.image).toBe(originals.get('2-full'));
    manager.setDecorations(2, [second]);
    manager.setDecorations(1, [second]);
    manager.clearDecorations();
    expect(texture.image).toBe(originals.get('2-full'));
    expect(book.leaves[0].back.map!.image).toBe(originals.get('1-thumb'));
    expect(invalidate).toHaveBeenCalled();
    expect(() => manager.setDecorations(4, [second])).toThrow(RangeError);
    manager.dispose();
    book.dispose();
  });
});
