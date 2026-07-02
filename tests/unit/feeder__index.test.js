'use strict';

/**
 * feeder__index — el alimentador público de la cantera.
 *
 * Testea el NÚCLEO determinista: _parseMd (SKILL.md crudo → skill estructurada) y
 * _ingerir (→ cosecha.importar). Los wrappers npx (_instalar/_buscar) se verifican en
 * vivo; aquí se comprueba su GUARDA y que degradan LIMPIO (503) cuando el CLI no está.
 *
 * Ejecutar: node tests/unit/feeder__index.test.js
 */

const assert = require('assert');
const Feeder = require('../../modules/feeder/index.js');

const LOG = { debug(){}, info(){}, warn(){}, error(){} };

function make() {
  const m = new Feeder();
  m.logger = LOG; m.metrics = { increment(){} };
  m._importado = null;
  m._rpc = async (ev, payload) => {
    if (ev === 'cosecha.importar.request') { m._importado = payload; return { status: 200, data: { importadas: 1, total: 5 } }; }
    return null;
  };
  return m;
}

const MD = `---
name: playwright-e2e
description: Escribe y depura tests end-to-end con Playwright
tags: [testing, e2e, playwright]
lente_dominio: diseño
lente_tarea: tema
---

# Playwright E2E
Cuerpo de la skill.`;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('parseMd: frontmatter (name/description/tags/hogar) + cuerpo', () => {
  const m = make();
  const s = m._parseMd(MD);
  assert.strictEqual(s.nombre, 'playwright-e2e');
  assert.ok(s.descripcion.includes('Playwright'));
  assert.deepStrictEqual(s.tags, ['testing', 'e2e', 'playwright']);
  assert.strictEqual(s.lente_dominio, 'diseño');
  assert.strictEqual(s.lente_tarea, 'tema');
  assert.ok(s.contenido.includes('Cuerpo de la skill'));
  assert.ok(!/^---/.test(s.contenido), 'el frontmatter no queda en el cuerpo');
});

test('parseMd: SKILL.md sin frontmatter → cuerpo entero, nombre por defecto', () => {
  const m = make();
  const s = m._parseMd('# Suelto\nsin frontmatter', { nombreDefault: 'suelto' });
  assert.strictEqual(s.nombre, 'suelto');
  assert.ok(s.contenido.includes('sin frontmatter'));
});

test('ingerir: parsea y mete en la cantera vía cosecha.importar', async () => {
  const m = make();
  const r = await m._ingerir({ fuente: 'skills.sh', md: MD });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.ingerida, 'playwright-e2e');
  assert.strictEqual(m._importado.fuente, 'skills.sh', 'importa con la fuente dada');
  assert.strictEqual(m._importado.skills.length, 1);
  assert.strictEqual(m._importado.skills[0].nombre, 'playwright-e2e');
  assert.strictEqual(m._importado.skills[0].lente_dominio, 'diseño', 'preserva el hogar declarado');
});

test('ingerir: SKILL.md sin name y sin nombre → 400', async () => {
  const m = make();
  const r = await m._ingerir({ fuente: 'x', md: '# sin nombre\ncuerpo' });
  assert.strictEqual(r.status, 400);
});

test('ingerir: propaga el error de la cantera', async () => {
  const m = make();
  m._rpc = async () => ({ status: 409, error: { code: 'CONFLICT_STATE' } });
  const r = await m._ingerir({ fuente: 'x', md: MD });
  assert.strictEqual(r.status, 409);
});

test('ingerir: inválidos (sin fuente/md) → 400', async () => {
  const m = make();
  assert.strictEqual((await m._ingerir({ md: MD })).status, 400);
  assert.strictEqual((await m._ingerir({ fuente: 'x' })).status, 400);
});

test('instalar/buscar: guarda (sin paquete/query) → 400', async () => {
  const m = make();
  assert.strictEqual((await m._instalar({})).status, 400);
  assert.strictEqual((await m._buscar({})).status, 400);
});

test('instalar: si npx no está, DEGRADA LIMPIO (503), no falso éxito', async () => {
  const m = make();
  m._ejec = async () => ({ degradado: true, motivo: 'comando no disponible: npx' });
  const r = await m._instalar({ paquete: 'vercel-labs/agent-skills@find-skills' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.code, 'UPSTREAM_UNREACHABLE');
});

test('buscar: si npx no está, DEGRADA LIMPIO (503)', async () => {
  const m = make();
  m._ejec = async () => ({ degradado: true, motivo: 'no npx' });
  const r = await m._buscar({ query: 'playwright' });
  assert.strictEqual(r.status, 503);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[feeder__index] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[feeder__index] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
