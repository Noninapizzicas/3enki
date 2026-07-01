'use strict';

/**
 * lentes-diseno__montar — la PUERTA DE ESCRITURA del cuenco (crecible en caliente).
 *
 * Una lente montada (skill promovida desde la cantera) ENTRA en el pack semilla de su
 * dominio: se persiste en data/lentes-diseno/packs/<dominio>/, se re-descubre y queda
 * ACTIVA — servible por lentes.obtener {dominio, tarea} (que es lo que el nervio inyecta).
 * Guarda no-colgantes: solo dominios que ya existen como pack (bebidos por una página).
 *
 * Ejecutar: node tests/unit/lentes-diseno__montar.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const LentesDisenoModule = require('../../modules/lentes-diseno/index.js');

const LOG = { debug(){}, info(){}, warn(){}, error(){} };
const DATA_ROOT = path.join(process.cwd(), 'data', 'lentes-diseno');
const existedBefore = fs.existsSync(DATA_ROOT);
function limpiar() {
  if (!existedBefore) { try { fs.rmSync(DATA_ROOT, { recursive: true, force: true }); } catch (_) {} }
}

async function makeCargado() {
  const m = new LentesDisenoModule();
  m._publicados = [];
  await m.onLoad({ logger: LOG, eventBus: { publish: (ev, p) => m._publicados.push({ ev, p }) }, metrics: { increment(){} } });
  return m;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('monta una lente en un dominio semilla, la persiste y la re-descubre', async () => {
  limpiar();
  const m = await makeCargado();
  const antes = m._packs.get('diseño').lentes.size;
  const r = m._montar({
    dominio: 'diseño', nombre: 'promo-lente', cuando_usar: 'para probar el montaje',
    tarea: 'tema', contenido: '# Promo Lente\nsoy una lente montada en caliente'
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.montada, true);
  assert.strictEqual(r.data.total_lentes, antes + 1, 'el pack diseño crece en 1');
  // en memoria: mergeada en el pack semilla
  const pack = m._packs.get('diseño');
  assert.ok(pack.lentes.has('promo-lente'), 'la lente montada es descubrible');
  assert.ok(pack.lentes.get('promo-lente').contenido.includes('en caliente'));
  // persistida en data/
  assert.ok(fs.existsSync(path.join(DATA_ROOT, 'packs', 'diseño', 'promo-lente.md')), 'la .md está en disco');
  assert.ok(fs.existsSync(path.join(DATA_ROOT, 'packs', 'diseño', '_pack.json')), 'el overlay ADN está en disco');
  // emitió lente.registrar (simetría con onLoad)
  assert.ok(m._publicados.some(x => x.ev === 'lente.registrar' && x.p.dominio === 'diseño'));
  limpiar();
});

test('la lente montada es ACTIVA: lentes.obtener {dominio, tarea} la incluye', async () => {
  limpiar();
  const m = await makeCargado();
  m._montar({ dominio: 'diseño', nombre: 'promo-tema', cuando_usar: 'x', tarea: 'tema', contenido: '# cuerpo tema' });
  // la ruta 'tema' del pack diseño ahora también resuelve la nueva lente
  const { data } = m._obtener({ dominio: 'diseño', tarea: 'tema' });
  assert.ok(data.lentes.some(l => l.nombre === 'promo-tema'), 'el ruteo determinista la alcanza');
  const l = data.lentes.find(l => l.nombre === 'promo-tema');
  assert.ok(l.contenido.includes('cuerpo tema'), 'entrega el .md completo');
  limpiar();
});

test('la semilla no se pisa: las lentes de código siguen ahí tras montar', async () => {
  limpiar();
  const m = await makeCargado();
  m._montar({ dominio: 'diseño', nombre: 'extra', cuando_usar: 'x', contenido: '# extra' });
  const pack = m._packs.get('diseño');
  assert.ok(pack.lentes.has('ux-architect') && pack.lentes.has('brand-guardian'), 'las semilla intactas');
  assert.deepStrictEqual(pack.rutas['tema'].filter(n => n === 'ux-architect').length, 1, 'ruta tema semilla intacta');
  limpiar();
});

test('GUARDA no-colgantes: dominio inexistente -> 409', async () => {
  limpiar();
  const m = await makeCargado();
  const r = m._montar({ dominio: 'inventado', nombre: 'x', contenido: '# y' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'CONFLICT_STATE');
  limpiar();
});

test('inválidos: sin nombre/contenido -> 400', async () => {
  limpiar();
  const m = await makeCargado();
  assert.strictEqual(m._montar({ dominio: 'diseño', contenido: '# y' }).status, 400);
  assert.strictEqual(m._montar({ dominio: 'diseño', nombre: 'x' }).status, 400);
  limpiar();
});

test('idempotente por nombre: re-montar pisa el cuerpo, no duplica', async () => {
  limpiar();
  const m = await makeCargado();
  m._montar({ dominio: 'diseño', nombre: 'dup', cuando_usar: 'x', contenido: '# v1' });
  const tras1 = m._packs.get('diseño').lentes.size;
  m._montar({ dominio: 'diseño', nombre: 'dup', cuando_usar: 'x', contenido: '# v2 nueva' });
  assert.strictEqual(m._packs.get('diseño').lentes.size, tras1, 'no duplica');
  assert.ok(m._packs.get('diseño').lentes.get('dup').contenido.includes('v2 nueva'), 're-montar pisa');
  limpiar();
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  limpiar();
  if (fails.length === 0) { console.log(`\n[lentes-diseno__montar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[lentes-diseno__montar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
