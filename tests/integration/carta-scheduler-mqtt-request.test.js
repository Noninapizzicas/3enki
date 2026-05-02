/**
 * Test de integracion: carta-scheduler-poc usando el mqttRequest REAL
 * inyectado por core/modules/loader.js (no mock).
 *
 * Cierra el circulo del POC3: el modulo no es mas un caso aislado con bus
 * mockeado — funciona con la cadena real:
 *
 *   loader.load(carta-scheduler-poc)
 *     → moduleContext.mqttRequest = (d, a, p) => uiHandler.handle(d, a, p)
 *     → carta-scheduler-poc llama mqttRequest('scheduler', 'addJob', ...)
 *     → uiHandler.handle invoca el handler de scheduler-mock (auto-wired
 *       desde scheduler-mock/module.json.ui_handlers[])
 *     → respuesta canonica { status, data | error } llega de vuelta
 *
 * Si esto pasa, carta-scheduler-poc se puede promocionar a producción
 * cambiando solo el directorio.
 *
 * Ejecutar: node tests/integration/carta-scheduler-mqtt-request.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ModuleLoader  = require('../../core/modules/loader');
const REAL_POC_PATH = path.resolve(__dirname, '../../modules/pizzepos/carta-scheduler-poc');

// ----------------------------------------------------------------- helpers

function makeMockUIHandler() {
  const handlers = new Map();
  return {
    register:   (d, a, fn) => handlers.set(`${d}.${a}`, fn),
    unregister: (d, a)     => handlers.delete(`${d}.${a}`),
    handle: async (d, a, data) => {
      const fn = handlers.get(`${d}.${a}`);
      if (!fn) return { status: 404, error: `No handler for ${d}/${a}` };
      return fn(data);
    },
    _handlers: handlers
  };
}

function makeMockEventBus() {
  const subs = new Map();
  const published = [];
  return {
    subscribe: async (event, handler) => {
      if (!subs.has(event)) subs.set(event, []);
      subs.get(event).push(handler);
      return () => {
        const arr = subs.get(event) || [];
        const i = arr.indexOf(handler);
        if (i >= 0) arr.splice(i, 1);
      };
    },
    publish: async (event, payload) => { published.push([event, payload]); },
    _published: published,
    _subs:      subs
  };
}

function makeNoopLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function writeMockPeer(dir, name, handlers) {
  fs.mkdirSync(dir, { recursive: true });
  const klass = `class M {
  async onLoad() { this.calls = []; }
  async onUnload() {}
${Object.entries(handlers).map(([h, code]) =>
  `  async ${h}(data) {
    this.calls.push({ handler: '${h}', data });
    ${code}
  }`).join('\n')}
}
module.exports = M;`;
  fs.writeFileSync(path.join(dir, 'index.js'), klass);
  fs.writeFileSync(path.join(dir, 'module.json'), JSON.stringify({
    name,
    version: '1.0.0',
    description: `Mock peer ${name}`,
    main: 'index.js',
    events: { publishes: [], subscribes: [] },
    ui_handlers: Object.keys(handlers).map(h => {
      const action = h.replace(/^handle/, '').replace(/^[A-Z]/, c => c.toLowerCase());
      return { domain: name, action, handler: h };
    })
  }, null, 2));
}

async function testAsync(description, fn) {
  try {
    await fn();
    console.log(`✓ ${description}`);
  } catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  }
}

// ----------------------------------------------------------------- tests

(async () => {
  console.log('carta-scheduler-poc — integracion con mqttRequest real\n');

  await testAsync('carta-scheduler-poc + scheduler + tarifas mock via loader real', async () => {
    const tmpdir       = fs.mkdtempSync(path.join(os.tmpdir(), 'integ-'));
    const modulesPath  = path.join(tmpdir, 'modules');
    const projectBase  = path.join(tmpdir, 'project');
    fs.mkdirSync(projectBase, { recursive: true });

    // Mock peers: scheduler (responde a addJob/deleteJob), tarifas (assign)
    writeMockPeer(path.join(modulesPath, 'scheduler'), 'scheduler', {
      handleAddJob:    `return { status: 201, data: { job_id: 'job-' + (data.name || 'x') } };`,
      handleDeleteJob: `return { status: 200, data: { deleted: true } };`
    });
    writeMockPeer(path.join(modulesPath, 'tarifas'), 'tarifas', {
      handleAssign: `return { status: 200, data: { canal: data.canal, carta_id: data.carta_id, applied: true } };`
    });

    // Symlink carta-scheduler-poc real (no copia, lo cargamos del directorio real)
    fs.symlinkSync(REAL_POC_PATH, path.join(modulesPath, 'carta-scheduler-poc'));

    // Setup core mock + loader real
    const uiHandler = makeMockUIHandler();
    const eventBus  = makeMockEventBus();
    const loader = new ModuleLoader({
      modulesPath,
      core:    { uiHandler, eventBus, logger: makeNoopLogger() },
      logger:  makeNoopLogger()
    });

    // Carga peers primero (registran handlers en uiHandler)
    await loader.load('scheduler', path.join(modulesPath, 'scheduler'),
      JSON.parse(fs.readFileSync(path.join(modulesPath, 'scheduler', 'module.json'), 'utf-8')));
    await loader.load('tarifas', path.join(modulesPath, 'tarifas'),
      JSON.parse(fs.readFileSync(path.join(modulesPath, 'tarifas', 'module.json'), 'utf-8')));

    // Verifica que los handlers se registraron en uiHandler
    assert.ok(uiHandler._handlers.has('scheduler.addJob'),   'scheduler.addJob handler registrado');
    assert.ok(uiHandler._handlers.has('scheduler.deleteJob'),'scheduler.deleteJob handler registrado');
    assert.ok(uiHandler._handlers.has('tarifas.assign'),     'tarifas.assign handler registrado');

    // Carga carta-scheduler-poc REAL (con manifest del repo)
    const cartaManifest = JSON.parse(fs.readFileSync(
      path.join(REAL_POC_PATH, 'module.json'), 'utf-8'
    ));
    // Override path de persistencia al tmp para no contaminar repo
    const originalPersistencePath = cartaManifest.config.persistence.data_path_template;
    cartaManifest.config.persistence.data_path_template = `${projectBase}/storage/pizzepos/config`;

    const carta = await loader.load('carta-scheduler-poc', REAL_POC_PATH, cartaManifest);

    // Activa el proyecto (carga estado vacio del disco — ENOENT graceful)
    await carta.onProjectActivated({
      project_id: 'p-test',
      base_path:  projectBase
    });

    // Crea una regla — esto dispara mqttRequest('scheduler', 'addJob', ...) REAL
    const r1 = await carta.toolCrearRegla({
      project_id: 'p-test',
      regla: {
        descripcion: 'lunes mesa carta del dia',
        cambios:     [{ canal: 'mesa', carta_id: 'dia' }],
        trigger:     { type: 'cron', cron: '0 0 * * 1' },
        activa:      true
      }
    });
    assert.strictEqual(r1.status, 201, 'crear_regla devuelve 201');
    assert.ok(r1.data.regla.id);

    // Verifica que el peer scheduler recibio el addJob
    const schedInst = loader.loadedModules.get('scheduler').instance;
    const addJobCalls = schedInst.calls.filter(c => c.handler === 'handleAddJob');
    assert.strictEqual(addJobCalls.length, 1, 'scheduler.addJob fue llamado 1 vez');
    // El modulo se identifica internamente como 'carta-scheduler' (sin -poc),
    // por eso el prefix del job en el scheduler usa ese name.
    assert.ok(addJobCalls[0].data.name.startsWith('carta-scheduler:'),
      `name del job empieza por modulo prefix (got: ${addJobCalls[0].data.name})`);
    assert.strictEqual(addJobCalls[0].data.project_id, 'p-test');

    // Simula que el job dispara → carta-scheduler crea pendiente
    const reglaId = r1.data.regla.id;
    await carta.onSchedulerJobTriggered({
      job: {
        name:       `carta-scheduler:${reglaId}`,   // mismo prefix que usa el modulo internamente
        project_id: 'p-test',
        metadata:   { regla_id: reglaId }
      }
    });
    const pendientes = Array.from(carta._getPendientes('p-test').values());
    assert.strictEqual(pendientes.length, 1, 'pendiente creado');
    const pendienteId = pendientes[0].id;

    // Confirma el pendiente — esto dispara mqttRequest('tarifas', 'assign', ...) REAL
    const r2 = await carta.toolConfirmar({
      project_id:    'p-test',
      pendiente_id:  pendienteId
    });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.data.aplicados, 1);
    assert.strictEqual(r2.data.fallidos, 0);

    // Verifica que tarifas.assign fue llamado
    const tarifasInst = loader.loadedModules.get('tarifas').instance;
    const assignCalls = tarifasInst.calls.filter(c => c.handler === 'handleAssign');
    assert.strictEqual(assignCalls.length, 1, 'tarifas.assign fue llamado 1 vez');
    assert.strictEqual(assignCalls[0].data.canal, 'mesa');
    assert.strictEqual(assignCalls[0].data.carta_id, 'dia');

    // Elimina la regla — dispara scheduler.deleteJob via mqttRequest
    const r3 = await carta.toolEliminarRegla({ project_id: 'p-test', regla_id: reglaId });
    assert.strictEqual(r3.status, 200);
    const deleteCalls = schedInst.calls.filter(c => c.handler === 'handleDeleteJob');
    assert.strictEqual(deleteCalls.length, 1, 'scheduler.deleteJob fue llamado 1 vez');

    // Cleanup
    await loader.unload('carta-scheduler-poc');
    await loader.unload('tarifas');
    await loader.unload('scheduler');

    // Restore original config (esto era una copia leida del fs, no contamina)
    cartaManifest.config.persistence.data_path_template = originalPersistencePath;
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  console.log('\ncarta-scheduler-poc integration: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });
