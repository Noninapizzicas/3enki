'use strict';
/**
 * Smoke test de cupula-tools: instancia el reflejo con un toolsRegistry mock
 * y verifica las 4 proyecciones (indice/dominio/detalle/buscar) contra él.
 * No toca el bus ni prod — solo el módulo en aislamiento.
 */
const assert = require('assert');
const CupulaTools = require('../../modules/cupula-tools/index.js');

const REGISTRY_MOCK = [
  { name: 'fs.read',        description: 'Lee un archivo',          parameters: { type: 'object', properties: { path: { type: 'string' } } } },
  { name: 'fs.write',       description: 'Escribe un archivo',      parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } } },
  { name: 'telegram.send',  description: 'Envía un mensaje TG',     parameters: { type: 'object', properties: { text: { type: 'string' } } } },
  { name: 'telegram.read',  description: 'Lee mensajes',            parameters: { type: 'object', properties: {} } },
  { name: 'crear_lista',    description: 'Crea un rail',            parameters: { type: 'object', properties: { nombre: { type: 'string' } } } },
];

function makeModule() {
  const m = new CupulaTools();
  // stub de la base: no tocar bus real
  m.eventBus = { publish: async () => {}, subscribe: () => {} };
  m.logger = { info: () => {}, warn: () => {}, error: () => {} };
  m.metrics = { increment: () => {}, gauge: () => {}, timing: () => {} };
  m.moduleLoader = {
    toolsRegistry: new Map(REGISTRY_MOCK.map(t => [t.name, t]))
  };
  // stub _atender de la base
  m._atender = async (event, op, respEvent, fn) => {
    const res = await fn(event?.data || event);
    return res;
  };
  m._errorResponse = (status, code, message) => ({ status, error: { code, message } });
  m._handleHandlerError = (ev, err) => ({ status: 500, error: { message: err.message } });
  return m;
}

(async () => {
  const m = makeModule();

  // 1. indice
  const ind = await m.handleIndiceTool();
  assert.strictEqual(ind.status, 200);
  assert.strictEqual(ind.data.total, 5);
  const doms = ind.data.dominios.map(d => d.dominio);
  assert.ok(doms.includes('fs') && doms.includes('telegram'), 'faltan dominios fs/telegram');

  // 2. dominio
  const fsd = await m.handleDominioTool({ dominio: 'fs' });
  assert.strictEqual(fsd.status, 200);
  assert.strictEqual(fsd.data.count, 2);
  assert.ok(fsd.data.tools.every(t => t.name.startsWith('fs.')));

  // 3. detalle (con schema)
  const det = await m.handleDetalleTool({ name: 'fs.write' });
  assert.strictEqual(det.status, 200);
  assert.ok(det.data.parameters.properties.content, 'falta schema de content');

  // 4. buscar
  const bus = await m.handleBuscarTool({ q: 'mensaje' });
  assert.strictEqual(bus.status, 200);
  assert.ok(bus.data.tools.some(t => t.name === 'telegram.send'), 'no encontró telegram.send');

  // 5. dominio inexistente → 404
  const notFound = await m.handleDominioTool({ dominio: 'zzz' });
  assert.strictEqual(notFound.status, 404);

  // 6. detalle inexistente → 404
  const det404 = await m.handleDetalleTool({ name: 'no.existe' });
  assert.strictEqual(det404.status, 404);

  // 7. args inválidos → 400
  const bad = await m.handleDetalleTool({});
  assert.strictEqual(bad.status, 400);

  console.log('SMOKE cupula-tools: OK (indice, dominio, detalle, buscar, 404s, 400s)');
})();
