import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createShow, evaluateShow, restingPacks, showDuration } from './choreography';
import { resolveTargets } from './targets';
import { compileProject, sampleCamera } from '../compile';
import { posePosition } from '../../studio/framing';
import { showPoints } from './framing';
import { projectFromTemplate } from '../templates';
import { sanitizeProject } from '../projectStorage';
import { duplicateScene, updateScene } from '../editing';

const book = { leafCount: 5, pageWidth: 2, pageHeight: 3, pagePt: { width: 200, height: 300 },
  slots: new Map([[13, [{ page: 3, u: 0.5, v: 0.5 }]], [14, [{ page: 6, u: 0.4, v: 0.4 }]]]) };
const kit = { stickers: [{ id: 'a', number: 13, widthPt: 100, heightPt: 140 }, { id: 'b', number: 14, widthPt: 120, heightPt: 80 }], pack: { widthPt: 150, heightPt: 220 } };

describe('figuritas y coreografía', () => {
  it.each((['9:16', '4:5', '1:1', '16:9'] as const).flatMap((format) => [1, 3, 6].map((count) => ({ format, count }))))(
    '$format, $count figuritas: álbum grande y margen de 2% durante toda la escena', ({ format, count }) => {
      const stickers = Array.from({ length: count }, (_, i) => ({ ...kit.stickers[i % 2], id: `s${i}` }));
      const timeline = compileProject(projectFromTemplate('figuritas', { format,
        scenes: [{ kind: 'figuritas', stickers: stickers.map((s) => ({ id: s.id })) }] }), book, { ...kit, stickers });
      const show = timeline.shows![0], pose = sampleCamera(timeline, show.start).pose;
      const camera = new PerspectiveCamera(timeline.fov, timeline.aspect, 0.01, 100);
      camera.position.set(...posePosition(pose)); camera.lookAt(...pose.target); camera.updateMatrixWorld();
      const corners = [-1, 1].flatMap((x) => [-1, 1].map((z) => new Vector3(x * show.width, 0.1, z * show.height / 2).project(camera)));
      const width = (Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x))) / 2;
      expect(width, `${format}, ${count}`).toBeGreaterThanOrEqual(format === '9:16' ? 0.8 : format === '16:9' ? 0.55 : 0.7);
      let margin = 1;
      const times = [show.start, show.open, show.opened, show.leave, show.end,
        ...show.flights.flatMap((f) => [f.exit, f.fly, f.lower, f.stick])];
      for (let t = show.start; t < show.end; t += 1 / 120) times.push(t);
      for (const t of times) {
        expect(sampleCamera(timeline, Math.min(t, show.end - 1e-8)).pose).toEqual(pose);
        for (const point of showPoints(show, t)) {
          point.project(camera);
          margin = Math.min(margin, (1 - Math.abs(point.x)) / 2, (1 - Math.abs(point.y)) / 2);
        }
      }
      console.log(`${format}, ${count}: álbum ${(width * 100).toFixed(2)}%, margen ${(margin * 100).toFixed(2)}%`);
      expect(margin).toBeGreaterThanOrEqual(0.02);
  }, 15000);
  it('deja el paquete en la mesa después del pegado y al buscar atrás recupera la entrada', () => {
    const show = createShow(resolveTargets({ kind: 'figuritas' }, book, kit), book, kit, 9 / 16, 3);
    const landing = () => new Vector3(0, 0.1, 0);
    const resting = restingPacks(show);
    for (const time of [show.end, show.end + 10]) {
      const pose = evaluateShow(show, time, landing);
      expect(pose.pack.visible).toBe(true); expect(pose.pack.position.distanceTo(resting[2].position)).toBeLessThan(1e-9);
      expect(pose.pack.rotation.angleTo(resting[2].rotation)).toBeLessThan(1e-7); expect(pose.stickers.every((s) => s.pasted && !s.visible)).toBe(true);
      expect(pose.companions).toHaveLength(2); expect(pose.companions.every((p) => p.visible)).toBe(true);
      for (const p of [...pose.companions, pose.pack]) {
        expect(p.position.z).toBeGreaterThan(show.height / 2);
        expect(new Vector3(0, 0, 1).applyQuaternion(p.rotation).y).toBeCloseTo(1, 8);
      }
    }
    for (const time of [show.leave, show.end]) {
      const a = evaluateShow(show, time - 1e-7, landing).pack;
      const b = evaluateShow(show, time + 1e-7, landing).pack;
      expect(a.position.distanceTo(b.position)).toBeLessThan(1e-5);
      expect(a.rotation.angleTo(b.rotation)).toBeLessThan(1e-5);
    }
    expect(evaluateShow(show, show.start - 0.01, landing).pack.visible).toBe(false);
    expect(evaluateShow(show, show.start, landing).pack.position.z).toBeGreaterThan(show.packPosition.z);
  });
  it('muestra los tres sobres completos al terminar y en el cierre de todos los formatos', () => {
    for (const format of ['9:16', '4:5', '1:1', '16:9'] as const) {
      const timeline = compileProject(projectFromTemplate('figuritas', { format }), book, kit);
      const show = timeline.shows![0];
      for (const t of [show.end - 1e-5, timeline.duration - 1e-5]) {
        const pose = sampleCamera(timeline, t).pose;
        const camera = new PerspectiveCamera(timeline.fov, timeline.aspect, 0.01, 100);
        camera.position.set(...posePosition(pose)); camera.lookAt(...pose.target); camera.updateMatrixWorld();
        for (const pack of restingPacks(show)) for (const x of [-1, 1]) for (const y of [-1, 1]) {
          const corner = new Vector3(x * show.packWidth / 2, y * show.packHeight / 2, 0).applyQuaternion(pack.rotation).add(pack.position).project(camera);
          expect(Math.abs(corner.x), `${format}, ${t}`).toBeLessThan(1);
          expect(Math.abs(corner.y), `${format}, ${t}`).toBeLessThan(1);
        }
      }
    }
  });
  it('resuelve números y páginas manuales sin rotar horizontales y rechaza tapas/destinos inválidos', () => {
    const targets = resolveTargets({ kind: 'figuritas' }, book, kit);
    expect(targets.map((t) => [t.page, t.spread])).toEqual([[3, 2], [6, 3]]);
    expect(targets[1].w).toBe(0.6); expect(targets[1].h).toBe(80 / 300);
    expect(resolveTargets({ kind: 'figuritas', stickers: [{ id: 'a', page: 2 }] }, book, kit)[0].page).toBe(1);
    for (const page of [1, 10, 2.5]) expect(resolveTargets({ kind: 'figuritas', stickers: [{ id: 'a', page }] }, book, kit)).toEqual([]);
    expect(resolveTargets({ kind: 'figuritas', stickers: [{ id: 'a', slot: 99 }] }, book, kit)).toEqual([]);
    expect(resolveTargets({ kind: 'figuritas', stickers: [] }, book, kit)).toEqual([]);
    const edgeBook = { ...book, slots: new Map([[14, [{ page: 6, u: 0.2, v: 0.4 }]]]) };
    const fitted = resolveTargets({ kind: 'figuritas' }, edgeBook, kit)[0];
    expect(fitted.w).toBeCloseTo(0.4);
    expect(fitted.w / fitted.h).toBeCloseTo((120 / 200) / (80 / 300));
  });
  it('mantiene continuidad en cada transición, aterriza en el casillero y revierte al buscar atrás', () => {
    const targets = resolveTargets({ kind: 'figuritas' }, book, kit);
    const show = createShow(targets, book, kit, 9 / 16);
    const landing = (page: number) => new Vector3(page % 2 ? -1 : 1, 0.1, 0);
    show.flights.forEach((flight, i) => {
      expect(evaluateShow(show, flight.lower, landing).stickers[i].curl).toBeGreaterThan(0.5);
      for (const time of [flight.fly, flight.lower, flight.stick]) {
        const before = evaluateShow(show, time - 1e-7, landing).stickers[i];
        const after = evaluateShow(show, time + 1e-7, landing).stickers[i];
        expect(before.position.distanceTo(after.position)).toBeLessThan(1e-5);
        expect(before.rotation.angleTo(after.rotation)).toBeLessThan(1e-5);
      }
      const final = evaluateShow(show, show.end, landing).stickers[i];
      const expected = landing(flight.target.page).add(new Vector3((flight.target.u - 0.5) * 2, 0.002, (flight.target.v - 0.5) * 3));
      expect(final.position.distanceTo(expected)).toBeLessThan(1e-9);
      expect(final.pasted).toBe(true); expect(final.visible).toBe(false);
      expect(final.curl).toBe(0);
      expect(evaluateShow(show, flight.exit, landing).stickers[i].pasted).toBe(false);
    });
    expect(show.turns).toHaveLength(1);
  });
  it('omite sin recursos y respeta duración mínima y giros al compilar', () => {
    const project = projectFromTemplate('figuritas', { duration: 6 });
    expect(compileProject(project, book).scenes.some((s) => s.kind === 'figuritas')).toBe(false);
    const empty = compileProject({ ...project, template: 'clasica', scenes: [{ kind: 'figuritas' }] }, book);
    expect(empty.scenes).toEqual([]);
    expect(sampleCamera(empty, 0).pose.distance).toBeGreaterThan(0);
    const tl = compileProject(project, book, kit);
    expect(tl.shows).toHaveLength(1);
    const show = tl.shows![0];
    expect(show.end - show.start).toBeGreaterThanOrEqual(showDuration(resolveTargets({ kind: 'figuritas' }, book, kit)) * 0.8 - 1e-9);
    expect(show.flights.at(-1)!.stick).toBeLessThan(show.end);
    expect(tl.actions.some((a) => a.spread === 3)).toBe(true);
  });
  it('mantiene las figuritas completas en cuadro durante el vuelo en vertical y apaisado', () => {
    for (const format of ['9:16', '16:9'] as const) {
      const timeline = compileProject(projectFromTemplate('figuritas', { format }), book, kit);
      const camera = new PerspectiveCamera(timeline.fov, timeline.aspect, 0.01, 100);
      for (const show of timeline.shows!) for (let index = 0; index < show.flights.length; index++) {
        const f = show.flights[index];
        for (let k = 0; k <= 12; k++) {
          const t = f.exit + (f.stick - f.exit) * k / 12;
          const { pose } = sampleCamera(timeline, t);
          camera.position.fromArray(posePosition(pose)); camera.lookAt(new Vector3(...pose.target)); camera.updateMatrixWorld();
          const sticker = evaluateShow(show, t, (page) => new Vector3(page % 2 ? -1 : 1, 0.1, 0)).stickers[index];
          for (const x of [-1, 1]) for (const y of [-1, 1]) {
            const projected = new Vector3(x * f.target.w * show.width / 2, y * f.target.h * show.height / 2, 0)
              .applyQuaternion(sticker.rotation).add(sticker.position).project(camera);
            expect(Math.abs(projected.x)).toBeLessThan(1);
            expect(Math.abs(projected.y), `${format}, figurita ${index}, fase ${k}`).toBeLessThan(1);
          }
        }
      }
    }
  });
  it('conserva selección al guardar, editar y duplicar; valida entradas rotas', () => {
    const project = projectFromTemplate('figuritas', { scenes: [{ kind: 'figuritas', stickers: [{ id: 'a', slot: 13 }, { id: 'b', page: 2 }] }] });
    expect(sanitizeProject(project)?.scenes).toEqual(project.scenes);
    expect(duplicateScene(project, 0).project.scenes[1]).toEqual(project.scenes[0]);
    expect(updateScene(project, 0, { caption: 'Recuerdos' }).scenes[0].stickers).toEqual(project.scenes[0].stickers);
    expect(sanitizeProject({ ...project, scenes: [{ kind: 'figuritas', stickers: [{ id: 'a', page: -1 }, { id: 42 }] }] })?.scenes[0].stickers).toEqual([{ id: 'a' }]);
  });
});
