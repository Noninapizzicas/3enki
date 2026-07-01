'use strict';

/**
 * conserje__cantera — la TERCERA facultad: ofrecer skills de la cosecha (cantera).
 *
 * La cara aditiva de la Teoría del Órgano: la abundancia guardada se vuelve GANANCIA.
 * Tras un paso, el conserje mina la cosecha por lo que el comerciante está haciendo y
 * ofrece en positivo la skill pertinente. Demand-driven: si no hay skill, no spamea.
 *
 * Ejecutar: node tests/unit/conserje__cantera.test.js
 */

const assert = require('assert');
const ConserjeModule = require('../../modules/conserje/index.js');

function make() {
  const m = new ConserjeModule();
  m.logger = { debug(){}, info(){}, warn(){}, error(){} };
  m.metrics = { increment(){} };
  m._publicados = [];
  m.eventBus = { publish: (ev, payload) => m._publicados.push({ ev, payload }) };
  m.activoCantera = true;
  return m;
}
function estado(m, proj, ultimaCapacidad) {
  m.estados.set(proj, { usadas: new Set(), intentadas: new Set(), ultimaCapacidad });
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('ofrece la skill pertinente que la cosecha devuelve', async () => {
  const m = make();
  m._rpc = async (ev) => {
    assert.strictEqual(ev, 'cosecha.buscar.request');
    return { data: { skills: [{ nombre: 'deep-research', descripcion: 'investigación rigurosa', dominio: 'investigacion', tags: [] }] } };
  };
  estado(m, 'proj1', 'investigacion');
  await m._tickCantera(['proj1']);
  const emp = m._publicados.find(p => p.ev === 'conserje.empujon');
  assert.ok(emp, 'debe publicar conserje.empujon');
  assert.strictEqual(emp.payload.tipo, 'skill');
  assert.strictEqual(emp.payload.recurso, 'deep-research');
  assert.strictEqual(emp.payload.accion_sugerida, 'cosecha.obtener:deep-research');
  assert.ok(m.pendientes.get('proj1'), 'deja el empujón pendiente para el nervio');
});

test('si la skill declara HOGAR (lente_dominio) ofrece PROMOVER, no solo obtener', async () => {
  const m = make();
  m._rpc = async () => ({ data: { skills: [{ nombre: 'design-persona', descripcion: 'un oficio de diseño', lente_dominio: 'diseño', lente_tarea: 'tema' }] } });
  estado(m, 'proj1', 'diseño');
  await m._tickCantera(['proj1']);
  const emp = m._publicados.find(p => p.ev === 'conserje.empujon');
  assert.ok(emp, 'debe ofrecer');
  assert.strictEqual(emp.payload.accion_sugerida, 'cosecha.promover:design-persona', 'ofrece ACTIVAR');
  assert.ok(/activamos|lente/i.test(emp.payload.mensaje), 'el mensaje invita a activar como lente');
  assert.strictEqual(m.pendientes.get('proj1').accion_sugerida, 'cosecha.promover:design-persona');
});

test('sin skill pertinente -> NO ofrece (no spamea)', async () => {
  const m = make();
  m._rpc = async () => ({ data: { skills: [] } });
  estado(m, 'proj1', 'recetas');
  await m._tickCantera(['proj1']);
  assert.ok(!m._publicados.find(p => p.ev === 'conserje.empujon'), 'no ofrece nada');
  assert.ok(!m.pendientes.get('proj1'));
});

test('brecha/rutas tienen prioridad: no pisa un empujón pendiente ni consulta', async () => {
  const m = make();
  let consultó = false;
  m._rpc = async () => { consultó = true; return { data: { skills: [{ nombre: 'x', descripcion: 'y' }] } }; };
  m.pendientes.set('proj1', { tipo: 'desbloqueo' });   // ya hay empujón de brecha
  estado(m, 'proj1', 'investigacion');
  await m._tickCantera(['proj1']);
  assert.strictEqual(consultó, false, 'ni consulta la cosecha si ya hay pendiente');
  assert.strictEqual(m.pendientes.get('proj1').tipo, 'desbloqueo', 'no lo pisa');
});

test('cooldown: no repite la misma skill', async () => {
  const m = make();
  m._rpc = async () => ({ data: { skills: [{ nombre: 'deep-research', descripcion: 'z' }] } });
  estado(m, 'proj1', 'investigacion');
  await m._tickCantera(['proj1']);
  m.pendientes.delete('proj1');   // el nervio ya lo consumió
  m._publicados.length = 0;
  await m._tickCantera(['proj1']);
  assert.ok(!m._publicados.find(p => p.ev === 'conserje.empujon'), 'en cooldown no repite');
});

test('OFF (activoCantera=false) -> el tick no ofrece', async () => {
  const m = make();
  m.activoCantera = false;
  m._rpc = async () => ({ data: { skills: [{ nombre: 'deep-research', descripcion: 'z' }] } });
  estado(m, 'proj1', 'investigacion');
  m.dirty.add('proj1');
  await m._tick();
  assert.ok(!m._publicados.find(p => p.ev === 'conserje.empujon'), 'apagado no ofrece');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[conserje__cantera] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[conserje__cantera] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
