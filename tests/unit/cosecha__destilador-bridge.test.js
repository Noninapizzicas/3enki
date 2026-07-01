'use strict';

/**
 * cosecha__destilador-bridge — el NERVIO que cierra el lazo del aprendizaje.
 *
 * El destilador SELLA una skill en una cúpula (memoria por proyecto) y emite
 * aprendizaje.skill.creada con el CUERPO (contenido_md) dentro. La cantera lo oye y
 * ABSORBE la skill a la biblioteca global (fuente 'destilador') — fire-and-forget,
 * sin re-consultar cúpulas. Lo aprendido queda buscable/ofrecible sin tocar nada más.
 *
 * Ejecutar: node tests/unit/cosecha__destilador-bridge.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const CosechaModule = require('../../modules/cosecha/index.js');

const LOG = { debug(){}, info(){}, warn(){}, error(){} };
const DEST_DIR = path.join(process.cwd(), 'data', 'cosecha', 'cantera', 'destilador');
function limpiar() { try { fs.rmSync(DEST_DIR, { recursive: true, force: true }); } catch (_) {} }

async function makeCargado() {
  const m = new CosechaModule();
  await m.onLoad({ logger: LOG, eventBus: null, metrics: null });
  return m;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('absorbe una skill sellada (aprendizaje.skill.creada) a la cantera, buscable', async () => {
  limpiar();
  const m = await makeCargado();
  const antes = m._skills.size;
  await m.onSkillDestilada({ data: {
    nombre_skill: 'costear-en-cadena',
    contenido_md: '# Costear en cadena\n## Pasos\n- lee catálogo\n- costea de una en una',
    descripcion: 'sella el atajo de costeo topológico',
    project_id: 'nonina'
  }});
  assert.strictEqual(m._skills.size, antes + 1, 'la cantera crece');
  const s = m._skills.get('costear-en-cadena');
  assert.ok(s, 'la skill destilada es descubrible');
  assert.strictEqual(s.fuente, 'destilador');
  assert.strictEqual(s.dominio, 'skill');
  assert.ok(s.contenido.includes('costea de una en una'), 'el cuerpo llegó por el evento');
  // buscable por el conserje / LLM
  const { data } = m._buscar({ query: 'costear cadena' });
  assert.ok(data.skills.some(x => x.nombre === 'costear-en-cadena'), 'aparece en la búsqueda');
  limpiar();
});

test('evento incompleto (sin contenido_md) -> no traga, no rompe', async () => {
  limpiar();
  const m = await makeCargado();
  const antes = m._skills.size;
  await m.onSkillDestilada({ data: { nombre_skill: 'a-medias' } });
  assert.strictEqual(m._skills.size, antes, 'nada absorbido');
  await m.onSkillDestilada({ data: {} });   // ni siquiera nombre
  assert.strictEqual(m._skills.size, antes, 'sigue sin crecer');
  limpiar();
});

test('idempotente: re-sellar la misma skill pisa, no duplica', async () => {
  limpiar();
  const m = await makeCargado();
  await m.onSkillDestilada({ data: { nombre_skill: 'x', contenido_md: 'v1' } });
  const tras1 = m._skills.size;
  await m.onSkillDestilada({ data: { nombre_skill: 'x', contenido_md: 'v2 refinada' } });
  assert.strictEqual(m._skills.size, tras1, 'no duplica');
  assert.ok(m._skills.get('x').contenido.includes('v2 refinada'), 'la re-selladura pisa');
  limpiar();
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[cosecha__destilador-bridge] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cosecha__destilador-bridge] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
