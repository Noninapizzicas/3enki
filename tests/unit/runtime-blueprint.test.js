'use strict';

/**
 * Test piloto del runtime-blueprint.
 *
 * Valida que el runtime carga el blueprint de recetas, recibe un
 * recetas.crear.request simulado y ejecuta el patron canonico:
 *   - resuelve base_path via project.get.request
 *   - lee store via fs.read.request
 *   - valida regla "no duplicado activo"
 *   - construye receta canonica
 *   - escribe store via fs.write.request
 *   - publica receta.creada con shape canonico
 *   - publica recetas.crear.response con shape canonico
 *
 * Mocks: eventBus en memoria + responses pre-configuradas para fs.* y
 * project.*. Cero conexion al MQTT real.
 */

const assert = require('assert');
const path   = require('path');
const RuntimeBlueprint = require('../../core/runtime-blueprint');

function makeMockBus() {
  const handlers = new Map();
  const published = [];
  return {
    handlers,
    published,
    subscribe(event, handler) {
      const existing = handlers.get(event) || [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    async publish(event, data) {
      published.push({ event, data });
      const list = handlers.get(event) || [];
      // Setimmediate para simular naturaleza async del bus real
      for (const h of list) {
        setImmediate(() => { try { h({ data }); } catch (_) {} });
      }
    },
    // Helper para responder a un request: lo emite tras un tick para
    // simular que llega correlacionado.
    async simulateResponse(event, data) {
      await this.publish(event, data);
    }
  };
}

function makeLogger() {
  const logs = [];
  return {
    logs,
    info:  (...a) => logs.push(['info',  ...a]),
    warn:  (...a) => logs.push(['warn',  ...a]),
    error: (...a) => logs.push(['error', ...a])
  };
}

function makeMetrics() {
  const calls = [];
  return {
    calls,
    increment: (n, l) => calls.push(['increment', n, l])
  };
}

(async () => {
  console.log('runtime-blueprint — test piloto\n');

  // ===========================================
  // Setup
  // ===========================================
  const bus     = makeMockBus();
  const logger  = makeLogger();
  const metrics = makeMetrics();
  const blueprintPath = path.join(__dirname, '../../modules/_recetas-blueprint/recetas.blueprint.json');

  const runtime = new RuntimeBlueprint({ logger, eventBus: bus, metrics }, blueprintPath);
  await runtime.load();
  await runtime.start();

  console.log('✓ runtime cargado con blueprint:', runtime.name, '(extends', runtime.blueprint.extends_blueprint_abstract + ')');
  console.log('  parent loaded:', !!runtime.parent);
  console.log('  helpers loaded:', Object.keys(runtime.helpers || {}));

  // Configurar mocks del bus: cuando llegan request a project.get / fs.read / fs.write,
  // simular response correlacionada.
  let mockStore = null; // simula contenido del archivo recetas.json

  bus.subscribe('project.get.request', async (event) => {
    const { request_id, project_id } = event.data;
    await bus.simulateResponse('project.get.response', {
      request_id,
      project: { base_path: `/tmp/projects/${project_id}` }
    });
  });

  bus.subscribe('fs.read.request', async (event) => {
    const { request_id } = event.data;
    if (mockStore === null) {
      await bus.simulateResponse('fs.read.response', { request_id, status: 404 });
    } else {
      await bus.simulateResponse('fs.read.response', { request_id, status: 200, content: JSON.stringify(mockStore) });
    }
  });

  bus.subscribe('fs.write.request', async (event) => {
    const { request_id, content } = event.data;
    mockStore = JSON.parse(content);
    await bus.simulateResponse('fs.write.response', { request_id, status: 200 });
  });

  // ===========================================
  // CASO 1: crear receta nueva en proyecto sin recetas.json
  // ===========================================
  console.log('\nCaso 1: crear receta nueva (store vacio)');

  // Listener para capturar la response de recetas.crear
  let crearResponse = null;
  bus.subscribe('recetas.crear.response', (event) => { crearResponse = event.data; });

  await bus.publish('recetas.crear.request', {
    request_id: 'test-req-1',
    project_id: 'proj-aaaa-bbbb-cccc-dddddddddddd',
    user_id: 'user-1',
    nombre: 'Tortilla de patatas',
    ingredientes: ['patatas', 'huevos', 'cebolla', 'aceite'],
    instrucciones: 'Pela y corta. Sofríe. Bate y mezcla. Cuaja.',
    porciones: 4,
    correlation_id: 'corr-1'
  });

  // Esperar a que el flow async termine
  await new Promise(r => setTimeout(r, 100));

  assert.strictEqual(crearResponse.status, 201, 'caso 1: status 201');
  assert.strictEqual(crearResponse.data.status, 'creada');
  assert.strictEqual(crearResponse.data.nombre, 'Tortilla de patatas');
  assert.strictEqual(crearResponse.data.incompleta, false, 'tiene ingredientes+porciones+instrucciones → completa');
  assert.ok(crearResponse.data.id, 'receta tiene id');
  assert.strictEqual(crearResponse.data.version, 1);
  console.log('✓ recetas.crear.response status 201, receta.id =', crearResponse.data.id);

  // Verificar que se publicó receta.creada con shape canonico
  const recetaCreada = bus.published.find(p => p.event === 'receta.creada');
  assert.ok(recetaCreada, 'caso 1: se publica receta.creada');
  assert.strictEqual(recetaCreada.data.project_id, 'proj-aaaa-bbbb-cccc-dddddddddddd');
  assert.strictEqual(recetaCreada.data.user_id, 'user-1');
  assert.strictEqual(recetaCreada.data.correlation_id, 'corr-1', 'correlation_id propagado');
  assert.ok(recetaCreada.data.timestamp, 'timestamp ISO presente');
  assert.strictEqual(recetaCreada.data.estado_operativo, 'en_servicio');
  assert.strictEqual(recetaCreada.data.incompleta, false);
  console.log('✓ receta.creada publicada con shape canonico (project_id, user_id, correlation_id, timestamp)');

  // Verificar que el store quedo escrito
  assert.ok(mockStore, 'store fue escrito');
  assert.strictEqual(mockStore.recetas.length, 1, 'store contiene 1 receta');
  assert.strictEqual(mockStore.recetas[0].nombre, 'Tortilla de patatas');
  assert.strictEqual(mockStore.recetas[0].estado_operativo, 'en_servicio');
  console.log('✓ store persistido con 1 receta');

  // ===========================================
  // CASO 2: receta incompleta (sin ingredientes) → borrador
  // ===========================================
  console.log('\nCaso 2: crear receta incompleta (sin ingredientes) → borrador');

  // Limpiar store y volver a empezar para no interferir con caso 1
  mockStore = null;
  crearResponse = null;

  await bus.publish('recetas.crear.request', {
    request_id: 'test-req-2',
    project_id: 'proj-aaaa-bbbb-cccc-dddddddddddd',
    user_id: 'user-1',
    nombre: 'Receta sin terminar'
    // no ingredientes, no porciones, no instrucciones
  });

  await new Promise(r => setTimeout(r, 100));

  assert.strictEqual(crearResponse.status, 201);
  assert.strictEqual(crearResponse.data.incompleta, true);
  assert.deepStrictEqual(crearResponse.data.campos_pendientes.sort(),
    ['ingredientes', 'instrucciones', 'porciones'].sort());
  assert.strictEqual(mockStore.recetas[0].estado_operativo, 'borrador');
  console.log('✓ receta sin campos minimos → estado_operativo=borrador, campos_pendientes=[ingredientes,porciones,instrucciones]');

  // ===========================================
  // CASO 3: duplicado activo → ALREADY_EXISTS
  // ===========================================
  console.log('\nCaso 3: intento crear duplicada → ALREADY_EXISTS');

  // Restablecer store con la primera receta para reusar
  mockStore = {
    _version: '1.0',
    recetas: [{
      id: 'existing-id-123',
      nombre: 'Tortilla de patatas',
      estado_operativo: 'en_servicio'
    }],
    ingredientes_catalogo: []
  };
  crearResponse = null;

  await bus.publish('recetas.crear.request', {
    request_id: 'test-req-3',
    project_id: 'proj-aaaa-bbbb-cccc-dddddddddddd',
    user_id: 'user-1',
    nombre: 'Tortilla de patatas',
    ingredientes: ['patatas'],
    porciones: 4,
    instrucciones: 'algo'
  });

  await new Promise(r => setTimeout(r, 100));

  assert.strictEqual(crearResponse.status, 409);
  assert.strictEqual(crearResponse.error.code, 'ALREADY_EXISTS');
  assert.strictEqual(crearResponse.error.details.existing_id, 'existing-id-123');
  assert.strictEqual(mockStore.recetas.length, 1, 'no se escribio segunda receta');
  console.log('✓ duplicado activo bloqueado con ALREADY_EXISTS canonico');

  // ===========================================
  // CASO 4: input invalido (sin nombre) → INVALID_INPUT
  // ===========================================
  console.log('\nCaso 4: input sin nombre → INVALID_INPUT');

  crearResponse = null;

  await bus.publish('recetas.crear.request', {
    request_id: 'test-req-4',
    project_id: 'proj-aaaa-bbbb-cccc-dddddddddddd',
    user_id: 'user-1'
    // sin nombre
  });

  await new Promise(r => setTimeout(r, 100));

  assert.strictEqual(crearResponse.status, 400);
  assert.strictEqual(crearResponse.error.code, 'INVALID_INPUT');
  assert.strictEqual(crearResponse.error.details.field, 'nombre');
  console.log('✓ INVALID_INPUT con field=nombre');

  // ===========================================
  // Cleanup
  // ===========================================
  await runtime.stop();
  console.log('\nTodos los tests pasaron ✓');
})().catch(err => {
  console.error('\n✗ Test fallo:', err.message);
  console.error(err.stack);
  process.exit(1);
});
