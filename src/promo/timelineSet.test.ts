import { describe, expect, it } from 'vitest';
import { compileProject } from './compile';
import { projectFromTemplate } from './templates';
import { timelineSet } from './timelineSet';
const book = { leafCount: 6, pageWidth: 2, pageHeight: 3 };
describe('escenario del video', () => {
  it('combina mantel, mesa y ventana graduable, sin cambiar la superficie', () => {
    const project = projectFromTemplate('clasica', { set: 'mantel-rosa', windowShadow: 0.8 });
    expect(timelineSet(compileProject(project, book))).toMatchObject({ tablecloth: 'vichy-rosa', table: true, windowShadow: true, windowStrength: 0.8 });
    expect(timelineSet(compileProject({ ...project, windowShadow: 0, table: false }, book))).toMatchObject({ tablecloth: 'vichy-rosa', table: false, windowShadow: false });
  });
  it('recupera Luz de ventana de proyectos anteriores sin intensidad guardada', () => {
    expect(timelineSet(compileProject(projectFromTemplate('ventana'), book))).toMatchObject({ windowShadow: true, windowStrength: 0.45 });
  });
});
