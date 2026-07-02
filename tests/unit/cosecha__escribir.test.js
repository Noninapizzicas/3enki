'use strict';

/**
 * cosecha__escribir — la cantera ESCRIBIBLE en-turno (Fase 3): crear + patch.
 *
 * Las guardas de Hermes skill_manage, sobre el store real en un dir temporal:
 *   crear  → create-only (409 anti-wipe), valida frontmatter.
 *   patch  → read-before-write (old debe existir), único-o-replace_all, semilla intocable,
 *            validar+rollback (no persiste si quedaría inválida o renombra).
 *
 * Ejecutar: node tests/unit/cosecha__escribir.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// aísla la cantera CRECIDA a un tmp: cwd → process.cwd() lo usa CANTERA_DATA_DIR.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cantera-esc-'));
const ORIG_CWD = process.cwd();
process.chdir(TMP);
const Cosecha = require('../../modules/cosecha/index.js');
process.chdir(ORIG_CWD);

// CANTERA_DATA_DIR se congela a TMP en el require de arriba (chdir antes de cargar el módulo),
// así crear/patch escriben/leen en TMP. enTmp mantiene el cwd por si algún helper lo usa.
async function enTmp(fn) { const p = process.cwd(); process.chdir(TMP); try { return await fn(); } finally { process.chdir(p); } }

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('crear: skill nueva → creada, aparece en el store', async () => {
  const m = new Cosecha(); m.logger = { info(){},warn(){},error(){},debug(){} }; m.metrics = { increment(){} };
  await enTmp(async () => {
    m._descubrir(); // reindexa desde tmp
    const r = m._crear({ nombre: 'saluda', contenido: '# Saluda\nDi hola.', descripcion: 'saluda al usuario', dominio: 'demo' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.creada, 'saluda');
    assert.ok(m._skills.has('saluda'), 'está en el store tras re-indexar');
  });
});

test('crear: 409 si ya existe (anti-wipe → usa patch)', async () => {
  const m = new Cosecha(); m.logger = { info(){},warn(){},error(){},debug(){} }; m.metrics = { increment(){} };
  await enTmp(async () => {
    m._descubrir();
    m._crear({ nombre: 'dup', contenido: 'x', descripcion: 'y' });
    const r = m._crear({ nombre: 'dup', contenido: 'z', descripcion: 'w' });
    assert.strictEqual(r.status, 409);
  });
});

test('crear: nombre inválido → 400', () => {
  const m = new Cosecha(); m.logger = { info(){},warn(){},error(){},debug(){} }; m.metrics = { increment(){} };
  const r = m._crear({ nombre: 'con espacios!', contenido: 'x', descripcion: 'y' });
  assert.strictEqual(r.status, 400);
});

test('patch: mejora una skill crecida (old→new), re-indexa', async () => {
  const m = new Cosecha(); m.logger = { info(){},warn(){},error(){},debug(){} }; m.metrics = { increment(){} };
  await enTmp(async () => {
    m._descubrir();
    m._crear({ nombre: 'receta', contenido: 'Paso 1: cortar.\nPaso 2: cocer.', descripcion: 'una receta' });
    const r = m._patch({ nombre: 'receta', old_string: 'Paso 2: cocer.', new_string: 'Paso 2: cocer 10 min.' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.patcheada, 'receta');
    assert.match(m._skills.get('receta').contenido, /cocer 10 min/);
  });
});

test('patch: read-before-write — old_string inexistente → 404', async () => {
  const m = new Cosecha(); m.logger = { info(){},warn(){},error(){},debug(){} }; m.metrics = { increment(){} };
  await enTmp(async () => {
    m._descubrir();
    m._crear({ nombre: 's1', contenido: 'hola mundo', descripcion: 'd' });
    const r = m._patch({ nombre: 's1', old_string: 'NO EXISTE', new_string: 'x' });
    assert.strictEqual(r.status, 404);
  });
});

test('patch: no-único sin replace_all → 409', async () => {
  const m = new Cosecha(); m.logger = { info(){},warn(){},error(){},debug(){} }; m.metrics = { increment(){} };
  await enTmp(async () => {
    m._descubrir();
    m._crear({ nombre: 's2', contenido: 'foo foo foo', descripcion: 'd' });
    const r = m._patch({ nombre: 's2', old_string: 'foo', new_string: 'bar' });
    assert.strictEqual(r.status, 409);
    const r2 = m._patch({ nombre: 's2', old_string: 'foo', new_string: 'bar', replace_all: true });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.data.reemplazos, 3);
  });
});

test('patch: validar+rollback — si borra la description → 422, NO persiste', async () => {
  const m = new Cosecha(); m.logger = { info(){},warn(){},error(){},debug(){} }; m.metrics = { increment(){} };
  await enTmp(async () => {
    m._descubrir();
    m._crear({ nombre: 's3', contenido: 'cuerpo', descripcion: 'la desc' });
    const antes = m._skills.get('s3').descripcion;
    const r = m._patch({ nombre: 's3', old_string: 'description: la desc', new_string: 'description:' });
    assert.strictEqual(r.status, 422);
    assert.strictEqual(m._skills.get('s3').descripcion, antes, 'rollback: no cambió');
  });
});

test('patch: no renombra → 422', async () => {
  const m = new Cosecha(); m.logger = { info(){},warn(){},error(){},debug(){} }; m.metrics = { increment(){} };
  await enTmp(async () => {
    m._descubrir();
    m._crear({ nombre: 's4', contenido: 'x', descripcion: 'd' });
    const r = m._patch({ nombre: 's4', old_string: 'name: s4', new_string: 'name: otro' });
    assert.strictEqual(r.status, 422);
  });
});

test('patch: skill inexistente → 404', () => {
  const m = new Cosecha(); m.logger = { info(){},warn(){},error(){},debug(){} }; m.metrics = { increment(){} };
  const r = m._patch({ nombre: 'fantasma', old_string: 'a', new_string: 'b' });
  assert.strictEqual(r.status, 404);
});

test('patch: semilla intocable → 409 (no vive en data/)', async () => {
  const m = new Cosecha(); m.logger = { info(){},warn(){},error(){},debug(){} }; m.metrics = { increment(){} };
  await enTmp(async () => {
    m._descubrir();
    // inyecta una skill "semilla" en el store sin fichero en data/
    m._skills.set('semilla-x', { nombre: 'semilla-x', descripcion: 'd', fuente: 'ECC', dominio: '', tags: [], contenido: 'x' });
    const r = m._patch({ nombre: 'semilla-x', old_string: 'x', new_string: 'y' });
    assert.strictEqual(r.status, 409);
  });
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  if (fails.length === 0) { console.log(`\n[cosecha__escribir] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cosecha__escribir] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
