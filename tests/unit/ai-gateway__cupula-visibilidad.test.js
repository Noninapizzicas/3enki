'use strict';

/**
 * ai-gateway__cupula-visibilidad — el interruptor POR PROYECTO de visibilidad
 * global de cupulas.vista_proyecto. La tool está en GLOBAL_TOOLS pero solo se
 * expone si el proyecto la encendió; nace APAGADA. Caché event-driven (calienta
 * best-effort en miss, reacciona a cupulas.visibilidad_cambiada en caliente).
 *
 * Ejecutar: node tests/unit/ai-gateway__cupula-visibilidad.test.js
 */

const assert = require('assert');
const AiGateway = require('../../modules/conversacion/ai-gateway');

function nuevo() {
  const g = new AiGateway();
  const published = [];
  g.logger = { info() {}, warn() {}, error() {}, debug() {} };
  g.config = {};
  g.eventBus = {
    publish(topic, payload) { published.push({ topic, payload }); },
    subscribe() { return () => {}; }
  };
  return { g, published };
}

const TOOLS = () => [{ name: 'fs.read' }, { name: 'cupulas.vista_proyecto' }, { name: 'invoke_agent' }];
const tiene = (list, name) => list.some(t => t.name === name);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('miss (proyecto nunca visto) → filtra la tool Y calienta (publica visibilidad.request)', () => {
  const { g, published } = nuevo();
  const out = g._filtrarVisibilidadCupula(TOOLS(), 'p1');
  assert.ok(!tiene(out, 'cupulas.vista_proyecto'), 'apagada por defecto → retirada');
  assert.ok(tiene(out, 'fs.read') && tiene(out, 'invoke_agent'), 'las demás intactas');
  assert.ok(published.find(p => p.topic === 'cupulas.visibilidad.request'), 'calienta la caché');
  assert.strictEqual(g._cupulaVistaVisible.get('p1'), false, 'queda OFF hasta que conteste');
});

test('flag ON para el proyecto → la tool se EXPONE', () => {
  const { g } = nuevo();
  g._cupulaVistaVisible.set('p1', true);
  const out = g._filtrarVisibilidadCupula(TOOLS(), 'p1');
  assert.ok(tiene(out, 'cupulas.vista_proyecto'), 'encendida → visible');
});

test('flag OFF explícito → filtra', () => {
  const { g } = nuevo();
  g._cupulaVistaVisible.set('p1', false);
  const out = g._filtrarVisibilidadCupula(TOOLS(), 'p1');
  assert.ok(!tiene(out, 'cupulas.vista_proyecto'));
});

test('POR PROYECTO: ON en p1 no expone en p2', () => {
  const { g } = nuevo();
  g._cupulaVistaVisible.set('p1', true);
  g._cupulaVistaVisible.set('p2', false);
  assert.ok(tiene(g._filtrarVisibilidadCupula(TOOLS(), 'p1'), 'cupulas.vista_proyecto'));
  assert.ok(!tiene(g._filtrarVisibilidadCupula(TOOLS(), 'p2'), 'cupulas.vista_proyecto'));
});

test('sin project_id → no es universal (se filtra)', () => {
  const { g } = nuevo();
  const out = g._filtrarVisibilidadCupula(TOOLS(), null);
  assert.ok(!tiene(out, 'cupulas.vista_proyecto'));
});

test('cupulas.visibilidad_cambiada actualiza la caché en caliente (vía el handler de onLoad)', () => {
  const { g } = nuevo();
  // simula la suscripción de onLoad
  let handler = null;
  g.eventBus.subscribe = (topic, fn) => { if (topic === 'cupulas.visibilidad_cambiada') handler = fn; return () => {}; };
  // re-registra como hace onLoad
  g.eventBus.subscribe('cupulas.visibilidad_cambiada', (event) => {
    const d = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
    if (d && d.project_id && d.flag === 'vista_proyecto_global') g._cupulaVistaVisible.set(d.project_id, d.enabled === true);
  });
  handler({ data: { project_id: 'p9', flag: 'vista_proyecto_global', enabled: true } });
  assert.strictEqual(g._cupulaVistaVisible.get('p9'), true);
  assert.ok(tiene(g._filtrarVisibilidadCupula(TOOLS(), 'p9'), 'cupulas.vista_proyecto'));
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[ai-gateway__cupula-visibilidad] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-gateway__cupula-visibilidad] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
