/**
 * Tests unitarios — PLANTILLA canonica.
 *
 * Para usar:
 *   1. cp tests/_template/_template.test.js tests/unit/<nombre-real>.test.js
 *   2. Renombrar referencias a _template -> <nombre-real>.
 *   3. Ajustar el path de require al modulo real.
 *   4. Anadir tests por handler de tu modulo.
 *   5. Wire en package.json: "test:<nombre>": "node tests/unit/<nombre>.test.js"
 *   6. Wire en .github/workflows/validate.yml.
 *
 * Estructura:
 *   - makeAjv: carga schemas del subsistema relevante (chat-flow, agent-flow,
 *     llm-flow, embedding-flow, segun aplique).
 *   - makeMocks: bus + logger + metrics + dbStore mockeados in-memory. Resuelve
 *     db.query.request automaticamente con datos plausibles.
 *   - instantiate: instancia el modulo bajo test inyectando los mocks.
 *   - testAsync: harness simple que imprime ✓/✗ y exit con codigo apropiado.
 *
 * Ejecutar: node tests/_template/_template.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

// Si el modulo publica/consume eventos canonicos, descomentar Ajv:
// const Ajv    = require('ajv/dist/2020');
// const addFormats = require('ajv-formats');

// AJUSTAR: path al modulo real
const TemplateModule = require('../../modules/_template/index.js');

// AJUSTAR: descomentar y ajustar segun subsistema
// function makeAjv() {
//   const dir = path.resolve(__dirname, '../../arquitectura/decisiones/_schemas/<flow>');
//   const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
//   addFormats(ajv);
//   for (const f of fs.readdirSync(dir)) {
//     if (f.endsWith('.json')) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f);
//   }
//   return ajv;
// }

function makeMocks(opts = {}) {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const dbStore = new Map(); // project_id -> Map<table, rows[]>

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  const metrics = {
    increment: (name, labels) => metricsCalls.push(['increment', name, labels]),
    gauge:     (name, value, labels) => metricsCalls.push(['gauge', name, value, labels]),
    timing:    (name, ms, labels) => metricsCalls.push(['timing', name, ms, labels])
  };

  let moduleRef = null;

  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);
      // Resolver db.query.request automaticamente con un rowstore in-memory
      if (event === 'db.query.request' && moduleRef) {
        const rows = handleDbQuery(payload, dbStore);
        process.nextTick(() => moduleRef.onDbQueryResponse({ data: { request_id: payload.request_id, data: rows } }));
      }
    }
  };

  return { logs, published, metricsCalls, dbStore, logger, metrics, eventBus, setModule: (m) => { moduleRef = m; } };
}

/**
 * Mock de database-manager: parsea queries simples y mantiene un store in-memory.
 * AJUSTAR para tu modulo: añadir las queries SQL especificas.
 */
function handleDbQuery({ project_id, query, params }, dbStore) {
  if (!dbStore.has(project_id)) dbStore.set(project_id, []);
  const rows = dbStore.get(project_id);
  const q = query.trim().toUpperCase();

  if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX')) return [];

  if (q.startsWith('INSERT INTO _TEMPLATE_ENTIDADES')) {
    const [id, pid, datos, created_at, updated_at] = params;
    rows.push({ id, project_id: pid, datos, created_at, updated_at });
    return [];
  }

  if (q.startsWith('SELECT')) {
    return rows.filter(r => r.project_id === params[0]);
  }

  return [];
}

function instantiate(mocks, configOverride = {}) {
  const m = new TemplateModule();
  m.logger    = mocks.logger;
  m.eventBus  = mocks.eventBus;
  m.metrics   = mocks.metrics;
  m.config    = { enabled: true, ...configOverride };
  mocks.setModule(m);
  return m;
}

async function flush() {
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  console.log('_template — plantilla canonica\n');

  await testAsync('toolCrear con args validos publica evento + persiste + retorna shape canonico', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    const result = await m.toolCrear({ project_id: 'p1', datos: { foo: 'bar' } }, { correlation_id: 'c1' });
    await flush();
    assert.strictEqual(result.status, 200);
    assert.ok(result.data && result.data.id);
    assert.strictEqual(result.data.project_id, 'p1');
    const ev = mocks.published.find(p => p[0] === '_template.entidad.creada');
    assert.ok(ev, 'evento canonico publicado');
    assert.strictEqual(ev[1].correlation_id, 'c1', 'correlation_id propagado');
  });

  await testAsync('toolCrear sin project_id devuelve INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    const result = await m.toolCrear({ datos: { foo: 'bar' } }, null);
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
  });

  await testAsync('toolCrear sin datos devuelve INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    const result = await m.toolCrear({ project_id: 'p1' }, null);
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.error.code, 'INVALID_INPUT');
  });

  await testAsync('handleUiList lista entidades del proyecto', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.toolCrear({ project_id: 'pA', datos: { x: 1 } }, null);
    await m.toolCrear({ project_id: 'pA', datos: { x: 2 } }, null);
    await m.toolCrear({ project_id: 'pB', datos: { y: 9 } }, null);
    await flush();
    const result = await m.handleUiList({ project_id: 'pA' });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.count, 2, 'solo las del proyecto pA');
  });

  await testAsync('onUnload limpia state runtime sin leak', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.toolCrear({ project_id: 'p1', datos: { foo: 'bar' } }, null);
    await m.onUnload();
    assert.strictEqual(m.pendingDb.size, 0);
    assert.strictEqual(m.schemaReady.size, 0);
    assert.strictEqual(m.cacheVolatil.size, 0);
  });

  console.log('\n_template: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });
