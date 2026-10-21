'use strict';

/**
 * CÚPULA DE TOOLS (runtime) — buscar_capacidad + detalle_capacidad + capacidad_dominio.
 *
 * La biblioteca buscable de las capacidades del sistema: el LLM descubre y conduce cualquier
 * tool sin cargar el catálogo entero, y puede explorar un dominio completo. Gemela de
 * buscar_agente / buscar_skill.
 *
 * Ejecutar: node tests/unit/cupula-tools__runtime.test.js
 */

const assert = require('assert');
const Cupula = require('../../modules/cupula-tools');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function registrySintetico() {
  return new Map([
    ['escandallo.costear', { name: 'escandallo.costear', description: 'Calcula el coste de una receta del proyecto', parameters: { type: 'object', properties: { receta_id: { type: 'string' } }, required: ['receta_id'] }, module: 'escandallo', event_based: true }],
    ['mercadona.producto.obtener', { name: 'mercadona.producto.obtener', description: 'Precio real de un producto en Mercadona', parameters: { type: 'object' }, module: 'mercadona-api' }],
    ['invoke_agent', { name: 'invoke_agent', description: 'Invoca un agente especialista para una tarea', parameters: { type: 'object' } }],
    ['whatsapp.enviar_plantilla', { name: 'whatsapp.enviar_plantilla', description: 'Envia una plantilla de whatsapp aprobada al cliente', parameters: { type: 'object' }, module: 'whatsapp-bot', confirmation: true }]
  ]);
}

function nuevo() {
  const reg = registrySintetico();
  const published = [];
  const m = new Cupula();
  m.onLoad({
    logger: { info() {}, warn() {}, error() {} },
    metrics: { increment() {} },
    eventBus: { publish: (t, p) => { published.push({ topic: t, payload: p }); } },
    moduleLoader: { toolsRegistry: reg, getTool: (n) => reg.get(n) }
  });
  return { m, reg, published };
}

test('onLoad registra buscar_capacidad, detalle_capacidad y capacidad_dominio', () => {
  const { reg } = nuevo();
  assert.ok(reg.has('buscar_capacidad'), 'registra buscar_capacidad');
  assert.ok(reg.has('detalle_capacidad'), 'registra detalle_capacidad');
  assert.ok(reg.has('capacidad_dominio'), 'registra capacidad_dominio');
  assert.strictEqual(reg.get('buscar_capacidad').event_based, true);
  assert.strictEqual(reg.get('capacidad_dominio').module, 'cupula-tools');
});

test('buscar_capacidad rankea y devuelve el catálogo BARATO (name+tipo+descripcion)', () => {
  const { m } = nuevo();
  const r = m._buscar({ query: 'costear receta' });
  assert.ok(r.capacidades.length >= 1);
  const top = r.capacidades[0];
  assert.strictEqual(top.name, 'escandallo.costear', 'la más relevante primero');
  assert.strictEqual(top.tipo, 'rpc', 'name con punto → rpc');
  assert.ok(top.descripcion.includes('coste'), 'trae descripción');
  assert.ok(!('parameters' in top), 'NO trae el cuerpo pesado (parameters) en la búsqueda');
});

test('buscar_capacidad — el match en el NOMBRE pesa más que en la descripción', () => {
  const { m } = nuevo();
  const r = m._buscar({ query: 'mercadona' });
  assert.strictEqual(r.capacidades[0].name, 'mercadona.producto.obtener');
});

test('buscar_capacidad filtra por tipo (tool vs rpc)', () => {
  const { m } = nuevo();
  const soloTool = m._buscar({ query: 'agente', tipo: 'tool' });
  assert.ok(soloTool.capacidades.every(c => c.tipo === 'tool'), 'solo tools (nombre pelado)');
  assert.ok(soloTool.capacidades.some(c => c.name === 'invoke_agent'));
  const soloRpc = m._buscar({ query: 'coste', tipo: 'rpc' });
  assert.ok(soloRpc.capacidades.every(c => c.tipo === 'rpc'));
});

test('buscar_capacidad respeta el límite (sin saturar)', () => {
  const { m } = nuevo();
  const r = m._buscar({ query: 'a', limite: 1 });   // 'a' matchea varias
  assert.ok(r.capacidades.length <= 1, 'top-K acotado');
  assert.ok(typeof r.total === 'number', 'reporta el total real (más allá del límite)');
});

test('buscar_capacidad NO se devuelve a sí misma', () => {
  const { m } = nuevo();
  const r = m._buscar({ query: 'capacidad buscar detalle' });
  const nombres = r.capacidades.map(c => c.name);
  assert.ok(!nombres.includes('buscar_capacidad'), 'la puerta no se busca a sí misma');
  assert.ok(!nombres.includes('detalle_capacidad'));
});

test('detalle_capacidad devuelve el CONTRATO completo bajo demanda', () => {
  const { m } = nuevo();
  const d = m._detalle({ name: 'escandallo.costear' });
  assert.strictEqual(d.name, 'escandallo.costear');
  assert.strictEqual(d.tipo, 'rpc');
  assert.deepStrictEqual(d.request_shape.required, ['receta_id'], 'trae el request_shape');
  assert.strictEqual(d.response_topic, 'escandallo.costear.response');
  assert.ok(d.como_conducir.includes("bus.publishAndWait('escandallo.costear'"), 'dice cómo conducirla');
});

test('detalle_capacidad propaga confirmation:true', () => {
  const { m } = nuevo();
  const d = m._detalle({ name: 'whatsapp.enviar_plantilla' });
  assert.strictEqual(d.confirmation, true);
});

test('detalle_capacidad → 404 para capacidad desconocida', () => {
  const { m } = nuevo();
  const r = m._detalle({ name: 'no.existe' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
});

test('detalle_capacidad → 400 sin name', () => {
  const { m } = nuevo();
  assert.strictEqual(m._detalle({}).status, 400);
});

test('onBuscarCapacidad publica buscar_capacidad.response correlada por request_id', async () => {
  const { m, published } = nuevo();
  await m.onBuscarCapacidad({ data: { request_id: 'r1', query: 'costear' } });
  const ev = published.find(p => p.topic === 'buscar_capacidad.response');
  assert.ok(ev, 'publica la response');
  assert.strictEqual(ev.payload.request_id, 'r1');
  assert.ok(ev.payload.result.capacidades.length >= 1);
});

test('onDetalleCapacidad publica error como {error} (no como result)', async () => {
  const { m, published } = nuevo();
  await m.onDetalleCapacidad({ data: { request_id: 'r2', name: 'no.existe' } });
  const ev = published.find(p => p.topic === 'detalle_capacidad.response');
  assert.ok(ev.payload.error, 'el 404 viaja como error, no como result');
  assert.strictEqual(ev.payload.error.code, 'RESOURCE_NOT_FOUND');
});

test('capacidad_dominio lista TODAS las tools de un dominio', () => {
  const { m } = nuevo();
  const r = m._dominio({ dominio: 'whatsapp' });
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.tools[0].name, 'whatsapp.enviar_plantilla');
  assert.ok(r.tools[0].descripcion.includes('plantilla'), 'trae la descripción de cada tool');
});

test('capacidad_dominio matchea por prefijo (todas las tools del dominio)', () => {
  const { m } = nuevo();
  const r = m._dominio({ dominio: 'escandallo' });
  assert.strictEqual(r.tools.length, 1);
  assert.strictEqual(r.tools[0].name, 'escandallo.costear');
});

test('capacidad_dominio → 404 si el dominio no existe', () => {
  const { m } = nuevo();
  const r = m._dominio({ dominio: 'zzz' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
});

test('capacidad_dominio → 400 sin dominio', () => {
  const { m } = nuevo();
  assert.strictEqual(m._dominio({}).status, 400);
});

test('onCapacidadDominio publica capacidad_dominio.response correlada por request_id', async () => {
  const { m, published } = nuevo();
  await m.onCapacidadDominio({ data: { request_id: 'r3', dominio: 'whatsapp' } });
  const ev = published.find(p => p.topic === 'capacidad_dominio.response');
  assert.ok(ev, 'publica la response');
  assert.strictEqual(ev.payload.request_id, 'r3');
  assert.strictEqual(ev.payload.result.count, 1);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[cupula-tools__runtime] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cupula-tools__runtime] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
