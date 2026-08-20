'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ProjectManager = require('../../modules/project-manager');

function nuevo() {
  const m = new ProjectManager();
  m.logger = { info(){}, warn(){}, error(){} };
  m.metrics = { increment(){} };
  m.projectsBasePath = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'));
  m._slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return m;
}

(async () => {
  const m = nuevo();
  const base = await m._createProjectDirectories('uuid-test-1', 'Test Project');

  // el storage y subdirs nacen escribibles por grupo (g+w)
  const storage = path.join(base, 'storage');
  assert.ok(fs.existsSync(storage), 'storage creado');
  const st = fs.statSync(storage);
  assert.ok((st.mode & 0o020) !== 0, 'storage tiene g+w (grupo puede escribir)');
  assert.strictEqual((st.mode & 0o777), 0o775, 'storage mode 775');

  // subdirs también
  for (const sub of ['db', 'persistencia', 'persistencia/eventos', 'contabilidad/cierres']) {
    const p = path.join(base, sub);
    const s = fs.statSync(p);
    assert.strictEqual((s.mode & 0o777), 0o775, `${sub} mode 775`);
  }

  // limpiar
  fs.rmSync(base, { recursive: true, force: true });
  console.log('[project-manager-permisos] OK — storage y subdirs nacen 775 (g+w), autopista sin eventos');
})();
