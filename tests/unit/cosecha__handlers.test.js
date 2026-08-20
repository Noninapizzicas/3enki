'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Cosecha = require('../../modules/cosecha');

// aísla la cantera CRECIDA a un tmp: cwd → CANTERA_DATA_DIR
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cantera-handlers-'));
async function enTmp(fn) { const p = process.cwd(); process.chdir(TMP); try { return await fn(); } finally { process.chdir(p); } }
function nuevo() {
  const c = new Cosecha();
  c.logger = { info(){}, warn(){}, error(){}, debug(){} };
  c.metrics = { increment(){} };
  c.hibrida = false;
  return c;
}

(async () => {
  const c = nuevo();
  assert.strictEqual(typeof c.handleCrearSkillTool, 'function', 'handleCrearSkillTool existe');
  assert.strictEqual(typeof c.handleMejorarSkillTool, 'function', 'handleMejorarSkillTool existe');

  await enTmp(async () => {
    // crear skill real → 200
    const crear = await c.handleCrearSkillTool({
      nombre: 'skill-test',
      contenido: '---\nname: skill-test\ndescription: prueba\n---\n# skill\ncuerpo',
      descripcion: 'prueba'
    });
    assert.ok(crear, 'crear responde');
    assert.strictEqual(crear.status, 200, `crear skill nueva → 200 (got ${crear.status})`);
    assert.strictEqual(crear.data.creada, 'skill-test');

    // duplicado → 409 anti-wipe
    const dup = await c.handleCrearSkillTool({ nombre: 'skill-test', contenido: 'x' });
    assert.strictEqual(dup.status, 409, 'duplicado → 409');

    // patch a skill inexistente → 404
    const p = await c.handleMejorarSkillTool({ nombre: 'noexiste', old_string: 'a', new_string: 'b' });
    assert.strictEqual(p.status, 404, 'patch skill desconocida → 404');
  });

  console.log('[cosecha-handlers] OK — crear_skill y mejorar_skill enrutan a _crear/_patch');
})();
