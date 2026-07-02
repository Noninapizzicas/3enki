'use strict';

/**
 * planificador__index — el reflejo del planificador (las dos mitades deterministas).
 *
 * _validar = el FRENO computable de completitud: no_silent_drops · no_alucinadas ·
 * cobertura. Los huecos NO invalidan (son honestos). _ensamblar = promover el set.
 *
 * Ejecutar: node tests/unit/planificador__index.test.js
 */

const assert = require('assert');
const Planificador = require('../../modules/planificador/index.js');

const LOG = { debug(){}, info(){}, warn(){}, error(){} };

// catálogo simulado que devuelve _rpc('cosecha.listar.request')
function make(catalogo = ['deep-research', 'vercel-carta-craft', 'agentic-engineering']) {
  const m = new Planificador();
  m.logger = LOG; m.metrics = { increment(){} };
  m._promovidas = [];
  m._rpc = async (ev, payload) => {
    if (ev === 'cosecha.listar.request') return { status: 200, data: { skills: catalogo.map(n => ({ nombre: n })) } };
    if (ev === 'cosecha.promover.request') {
      if (catalogo.includes(payload.nombre)) { m._promovidas.push(payload.nombre); return { status: 200, data: { promovida: true } }; }
      return { status: 404, error: { code: 'RESOURCE_NOT_FOUND' } };
    }
    return null;
  };
  return m;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('validar: set íntegro (skills reales, sin huecos) → valido, cobertura 1', async () => {
  const m = make();
  const r = await m._validar({
    proyecto: 'una carta bonita',
    capacidades: ['diseño', 'investigación'],
    elegidas: [
      { capacidad: 'diseño', skill: 'vercel-carta-craft' },
      { capacidad: 'investigación', skill: 'deep-research' }
    ]
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.valido, true);
  assert.strictEqual(r.data.cobertura, 1);
  assert.deepStrictEqual(r.data.huecos, []);
  assert.deepStrictEqual(r.data.alucinadas, []);
});

test('validar: HUECO honesto (skill:null) → valido true, cobertura parcial, hueco nombrado', async () => {
  const m = make();
  const r = await m._validar({
    proyecto: 'tienda con reservas',
    capacidades: ['diseño', 'reservas'],
    elegidas: [
      { capacidad: 'diseño', skill: 'vercel-carta-craft' },
      { capacidad: 'reservas', skill: null }
    ]
  });
  assert.strictEqual(r.data.valido, true, 'un hueco honesto NO invalida');
  assert.strictEqual(r.data.cobertura, 0.5);
  assert.deepStrictEqual(r.data.huecos, ['reservas']);
});

test('validar: ALUCINADA (skill que no existe en el catálogo) → invalido', async () => {
  const m = make();
  const r = await m._validar({
    proyecto: 'algo',
    capacidades: ['pago'],
    elegidas: [{ capacidad: 'pago', skill: 'stripe-mega-skill-inventada' }]
  });
  assert.strictEqual(r.data.valido, false, 'una skill inventada invalida');
  assert.strictEqual(r.data.alucinadas.length, 1);
  assert.strictEqual(r.data.alucinadas[0].skill, 'stripe-mega-skill-inventada');
});

test('validar: capacidad caída CALLADA (sin entrada en elegidas) → drop, invalido', async () => {
  const m = make();
  const r = await m._validar({
    proyecto: 'algo',
    capacidades: ['diseño', 'avisos'],
    elegidas: [{ capacidad: 'diseño', skill: 'vercel-carta-craft' }]   // 'avisos' no aparece
  });
  assert.strictEqual(r.data.valido, false, 'una capacidad que se cae callada invalida');
  assert.deepStrictEqual(r.data.drops, ['avisos']);
});

test('validar: inválidos → 400', async () => {
  const m = make();
  assert.strictEqual((await m._validar({ capacidades: ['x'], elegidas: [] })).status, 400);
  assert.strictEqual((await m._validar({ proyecto: 'p', capacidades: [], elegidas: [] })).status, 400);
});

test('ensamblar: promueve las skills del set y separa fallidas', async () => {
  const m = make();
  const r = await m._ensamblar({ skills: [{ nombre: 'vercel-carta-craft' }, { nombre: 'deep-research' }, { nombre: 'no-existe' }] });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.promovidas.sort(), ['deep-research', 'vercel-carta-craft']);
  assert.strictEqual(r.data.fallidas.length, 1);
  assert.strictEqual(r.data.fallidas[0].nombre, 'no-existe');
  assert.deepStrictEqual(m._promovidas.sort(), ['deep-research', 'vercel-carta-craft']);
});

test('ensamblar: acepta nombres string además de {nombre}', async () => {
  const m = make();
  const r = await m._ensamblar({ skills: ['deep-research'] });
  assert.deepStrictEqual(r.data.promovidas, ['deep-research']);
});

test('ensamblar: sin skills → 400', async () => {
  const m = make();
  assert.strictEqual((await m._ensamblar({ skills: [] })).status, 400);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[planificador__index] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[planificador__index] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
