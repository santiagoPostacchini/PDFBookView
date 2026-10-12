import { BoxGeometry, CanvasTexture, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, type Texture } from 'three';
import type { BookEngine } from '../../book/BookEngine';
import type { PageDecoration } from '../../book/PageTextureManager';
import type { Timeline } from '../compile';
import type { FiguritasImages } from './assets';
import { evaluateShow, type StickerShow } from './choreography';
import type { StickerTarget } from './targets';
import { curlSticker } from './stickerCurl';

/** Sobre de papel fino, boca y aleta articulada; figuritas con frente y dorso. */
export class Rig {
  readonly root = new Group();
  readonly pack = new Group();
  readonly flap = new Group();
  readonly companions: Group[] = [];
  readonly stickers: Mesh[] = [];
  private readonly textures: Texture[] = [];
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly geometries: (BoxGeometry | PlaneGeometry)[] = [];

  constructor(readonly show: StickerShow, images: FiguritasImages) {
    const material = (color: string, image?: HTMLCanvasElement, double = false) => {
      let map: CanvasTexture | undefined;
      if (image) { map = new CanvasTexture(image); map.colorSpace = SRGBColorSpace; this.textures.push(map); }
      const m = new MeshStandardMaterial({ color, map, roughness: 0.9, ...(double ? { side: DoubleSide } : {}) });
      this.materials.push(m); return m;
    };
    const cream = material('#f3e7d7'), front = material('#ffffff', images.front), back = material('#ffffff', images.back);
    const box = (w: number, h: number, d: number, materials: MeshStandardMaterial[]) => {
      const geometry = new BoxGeometry(w, h, d); this.geometries.push(geometry);
      const mesh = new Mesh(geometry, materials); mesh.castShadow = mesh.receiveShadow = true; return mesh;
    };
    const depth = show.packWidth * 0.08;
    this.pack.add(box(show.packWidth, show.packHeight, depth, [cream, cream, cream, cream, front, back]));
    const mouthGeo = new PlaneGeometry(show.packWidth * 0.95, depth * 0.9); this.geometries.push(mouthGeo);
    const mouth = new Mesh(mouthGeo, material('#37241c', undefined, true));
    mouth.rotation.x = -Math.PI / 2; mouth.position.y = show.packHeight / 2 + 0.001;
    this.pack.add(mouth);
    this.flap.position.set(0, show.packHeight / 2, -depth / 2);
    const lid = box(show.packWidth * 0.96, show.packHeight * 0.12, 0.004, [cream, cream, cream, cream, front, cream]);
    lid.position.y = show.packHeight * 0.06;
    this.flap.add(lid); this.pack.add(this.flap); this.root.add(this.pack);
    for (let i = 0; i < 2; i++) {
      const companion = this.pack.clone(true);
      companion.children.at(-1)!.rotation.x = -Math.PI;
      companion.visible = false; this.companions.push(companion); this.root.add(companion);
    }
    for (const { target } of show.flights) {
      const geometry = new BoxGeometry(target.w * show.width, target.h * show.height, 0.004, 24, 12, 1);
      this.geometries.push(geometry);
      const mesh = new Mesh(geometry, [cream, cream, cream, cream, material('#ffffff', images.stickers.get(target.sticker.id)), cream]);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.flat = new Float32Array(geometry.attributes.position.array);
      mesh.visible = false; this.stickers.push(mesh); this.root.add(mesh);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.textures.forEach((t) => t.dispose()); this.materials.forEach((m) => m.dispose()); this.geometries.forEach((g) => g.dispose());
  }
}

/** Dibuja la figurita del mismo tamaño que la malla final, con sombra de contacto. */
export function stickerPainter(target: StickerTarget, image: HTMLCanvasElement): PageDecoration {
  return (ctx, width, height) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = width * 0.004;
    ctx.drawImage(image, (target.u - target.w / 2) * width, (target.v - target.h / 2) * height, target.w * width, target.h * height);
    ctx.restore();
  };
}

export class ShowRigs {
  private readonly rigs: Rig[];
  private readonly pages = new Map<number, string>();
  constructor(private readonly engine: BookEngine, timeline: Timeline, private readonly images: FiguritasImages) {
    this.rigs = (timeline.shows ?? []).map((show) => {
      const rig = new Rig(show, images); engine.scene.add(rig.root); return rig;
    });
  }
  apply(t: number): void {
    const book = this.engine.currentBook;
    if (!book) return;
    const pasted = new Map<number, { key: string; painter: PageDecoration }[]>();
    for (const rig of this.rigs) {
      const pose = evaluateShow(rig.show, t, (page) => book.pageCenter(page));
      // Una nueva escena reutiliza el lugar del sobre; no superponer paquetes anteriores.
      const active = !this.rigs.some((next) => next.show.start > rig.show.start && t >= next.show.start);
      rig.pack.visible = pose.pack.visible && active;
      rig.pack.position.copy(pose.pack.position); rig.pack.quaternion.copy(pose.pack.rotation);
      rig.flap.rotation.x = pose.flap;
      rig.companions.forEach((mesh, i) => {
        const p = pose.companions[i]; mesh.visible = active && p.visible;
        mesh.position.copy(p.position); mesh.quaternion.copy(p.rotation);
      });
      pose.stickers.forEach((s, i) => {
        const mesh = rig.stickers[i]; mesh.visible = s.visible; mesh.position.copy(s.position); mesh.quaternion.copy(s.rotation);
        if (s.visible) {
          const geometry = mesh.geometry as BoxGeometry;
          const positions = geometry.attributes.position;
          curlSticker(mesh.userData.flat, positions.array as Float32Array, rig.show.flights[i].target.w * rig.show.width, s.curl);
          positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
        }
        if (!s.pasted) return;
        const target = rig.show.flights[i].target, image = this.images.stickers.get(target.sticker.id);
        if (!image) return;
        const list = pasted.get(target.page) ?? [];
        list.push({ key: `${rig.show.start}:${i}`, painter: stickerPainter(target, image) }); pasted.set(target.page, list);
      });
    }
    for (const page of new Set([...this.pages.keys(), ...pasted.keys()])) {
      const list = pasted.get(page) ?? [], key = list.map((s) => s.key).join(',');
      if (this.pages.get(page) === key) continue;
      this.engine.setPageDecorations(page, list.length ? list.map((s) => s.painter) : null);
      if (key) this.pages.set(page, key); else this.pages.delete(page);
    }
  }
  dispose(): void {
    this.rigs.forEach((rig) => rig.dispose());
    for (const page of this.pages.keys()) this.engine.setPageDecorations(page, null);
    this.pages.clear();
  }
}
