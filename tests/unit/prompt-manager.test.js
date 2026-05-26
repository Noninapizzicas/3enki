/**
 * Tests unitarios — prompt-manager (POC2 reescritura).
 *
 * Mocks: bus + logger + metrics in-memory. eventBus.publish intercepta
 * `db.query.request` y `db.schema.init.request` y los resuelve sintetizando
 * un dbStore in-memory por proyecto + tabla.
 *
 * Ejecutar: node tests/unit/prompt-manager.test.js
 */

'use strict';

const assert = require('assert');

const PromptManagerModule = require('../../modules/prompt-manager/index.js');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };

  // dbStore[project_id][table] = rows[]
  const dbStore = new Map();
  let moduleRef = null;

  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);

      if (event === 'db.query.request' && moduleRef) {
        let rows = null;
        let err = null;
        try { rows = handleDbQuery(payload, dbStore); }
        catch (e) { err = e; }
        process.nextTick(() => {
          if (err) {
            moduleRef.onDbQueryResponse({
              data: { request_id: payload.request_id, success: false, error: err.message }
            });
          } else {
            moduleRef.onDbQueryResponse({
              data: { request_id: payload.request_id, success: true, data: rows }
            });
          }
        });
      }

      if (event === 'db.schema.init.request' && moduleRef) {
        const pid = payload.project_id;
        if (!dbStore.has(pid)) dbStore.set(pid, new Map());
        for (const t of ['prompts', 'prompt_versions', 'slot_presets', 'slot_preset_prompts', 'prompt_analytics']) {
          if (!dbStore.get(pid).has(t)) dbStore.get(pid).set(t, []);
        }
        process.nextTick(() => moduleRef.onDbSchemaInitResponse({
          data: { request_id: payload.request_id, success: true }
        }));
      }
    }
  };

  return {
    logs, published, metricsCalls, dbStore, logger, metrics, eventBus,
    setModule: (m) => { moduleRef = m; }
  };
}

function handleDbQuery({ project_id, query, params }, dbStore) {
  if (!dbStore.has(project_id)) dbStore.set(project_id, new Map());
  const proj = dbStore.get(project_id);
  for (const t of ['prompts', 'prompt_versions', 'slot_presets', 'slot_preset_prompts', 'prompt_analytics']) {
    if (!proj.has(t)) proj.set(t, []);
  }
  const q = query.trim().toUpperCase();

  if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX')) return [];

  if (q.startsWith('INSERT INTO PROMPTS')) {
    const [id, name, title, description, slot_type, content, variables, tags, metadata, current_version, created_at, updated_at] = params;
    const exists = proj.get('prompts').some(r => r.name === name);
    if (exists) {
      const err = new Error('UNIQUE constraint failed: prompts.name');
      throw err;
    }
    proj.get('prompts').push({ id, name, title, description, slot_type, content, variables, tags, metadata, current_version, created_at, updated_at });
    return [];
  }

  if (q.startsWith('INSERT INTO PROMPT_VERSIONS')) {
    const [prompt_id, version, content, variables, created_at, created_by] = params;
    proj.get('prompt_versions').push({ prompt_id, version, content, variables, created_at, created_by });
    return [];
  }

  if (q.startsWith('UPDATE PROMPTS SET')) {
    const id = params[params.length - 1];
    const row = proj.get('prompts').find(r => r.id === id);
    if (row) {
      row.title = params[0]; row.description = params[1]; row.slot_type = params[2];
      row.content = params[3]; row.variables = params[4]; row.tags = params[5];
      row.metadata = params[6]; row.current_version = params[7]; row.updated_at = params[8];
    }
    return [];
  }

  if (q.startsWith('DELETE FROM PROMPTS')) {
    const id = params[0];
    proj.set('prompts', proj.get('prompts').filter(r => r.id !== id));
    return [];
  }

  if (q.startsWith('SELECT * FROM PROMPTS ORDER BY')) {
    return proj.get('prompts').slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  if (q.startsWith('SELECT VERSION, CONTENT, VARIABLES, CREATED_AT, CREATED_BY FROM PROMPT_VERSIONS')) {
    const [prompt_id] = params;
    return proj.get('prompt_versions').filter(r => r.prompt_id === prompt_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  if (q.startsWith('SELECT CONTENT FROM PROMPT_VERSIONS')) {
    const [prompt_id, version] = params;
    return proj.get('prompt_versions').filter(r => r.prompt_id === prompt_id && r.version === version);
  }

  if (q.startsWith('INSERT INTO SLOT_PRESETS')) {
    const [id, name, description, created_at, updated_at] = params;
    if (proj.get('slot_presets').some(r => r.name === name)) throw new Error('UNIQUE constraint failed: slot_presets.name');
    proj.get('slot_presets').push({ id, name, description, created_at, updated_at });
    return [];
  }

  if (q.startsWith('INSERT INTO SLOT_PRESET_PROMPTS')) {
    const [preset_id, slot_type, prompt_id, position, created_at] = params;
    proj.get('slot_preset_prompts').push({ preset_id, slot_type, prompt_id, position, created_at });
    return [];
  }

  if (q.startsWith('DELETE FROM SLOT_PRESETS')) {
    const id = params[0];
    proj.set('slot_presets', proj.get('slot_presets').filter(r => r.id !== id));
    return [];
  }

  if (q.startsWith('SELECT * FROM SLOT_PRESETS ORDER BY')) {
    return proj.get('slot_presets').slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  if (q.startsWith('SELECT SLOT_TYPE, PROMPT_ID, POSITION FROM SLOT_PRESET_PROMPTS')) {
    const [preset_id] = params;
    return proj.get('slot_preset_prompts').filter(r => r.preset_id === preset_id);
  }

  if (q.startsWith('SELECT ID, USAGE_COUNT FROM PROMPT_ANALYTICS')) {
    const [prompt_id, version] = params;
    return proj.get('prompt_analytics').filter(r => r.prompt_id === prompt_id && r.version === version);
  }

  if (q.startsWith('UPDATE PROMPT_ANALYTICS SET USAGE_COUNT')) {
    const [last_used, id] = params;
    const row = proj.get('prompt_analytics').find(r => r.id === id);
    if (row) { row.usage_count = (row.usage_count || 0) + 1; row.last_used = last_used; }
    return [];
  }

  if (q.startsWith('INSERT INTO PROMPT_ANALYTICS')) {
    const [prompt_id, version, , first_used, last_used] = params;
    proj.get('prompt_analytics').push({
      id: proj.get('prompt_analytics').length + 1,
      prompt_id, version, usage_count: 1, first_used, last_used
    });
    return [];
  }

  if (q.startsWith('SELECT * FROM PROMPT_ANALYTICS')) {
    if (params.length > 0) {
      return proj.get('prompt_analytics').filter(r => r.prompt_id === params[0]);
    }
    return proj.get('prompt_analytics').slice();
  }

  return [];
}

async function instantiate(mocks, opts = {}) {
  const m = new PromptManagerModule();
  mocks.setModule(m);
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || {}
  });
  await flush();
  return { module: m };
}

async function flush() {
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('prompt-manager — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'prompt-manager');
    assert.strictEqual(m.version, '3.0.0');
    assert.strictEqual(m.prompts.size, 0);
    assert.strictEqual(m.presets.size, 0);
    assert.strictEqual(m.pendingDb.size, 0);
    assert.strictEqual(m.pendingSchema.size, 0);
    assert.strictEqual(m.schemaReady, true);
    await m.onUnload();
  });

  await testAsync('onUnload limpia pending Maps + timers sin leak', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let rejected = false;
    m.pendingDb.set('leak-1', {
      resolve: () => {},
      reject: () => { rejected = true; },
      timeout: setTimeout(() => {}, 60000)
    });
    await m.onUnload();
    assert.strictEqual(m.pendingDb.size, 0);
    assert.strictEqual(m.pendingSchema.size, 0);
    assert.strictEqual(m.prompts.size, 0);
    assert.strictEqual(m.presets.size, 0);
    assert.strictEqual(rejected, true, 'pending rejected en onUnload');
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers
  // ==========================================

  await testAsync('handleCreatePrompt sin name devuelve INVALID_INPUT canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePrompt({ body: { content: 'hello' } }, {});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.ok(typeof r.error.message === 'string');
    assert.ok(!('data' in r));
    await m.onUnload();
  });

  await testAsync('handleCreatePrompt sin content devuelve INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCreatePrompt({ body: { name: 'foo' } }, {});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleToolPromptGet sin id ni name devuelve INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolPromptGet({});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleUIComposerRender sin slots devuelve INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUIComposerRender({});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: CRUD prompts (publish + cache + version bump)
  // ==========================================

  await testAsync('handleCreatePrompt persiste, cachea, publica prompt.created con project_id + correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    const r = await m.handleCreatePrompt({
      body: { name: 'greet', content: 'Hello {{name}}', slot_type: 'system' }
    }, {});
    await flush();

    assert.strictEqual(r.status, 201);
    assert.ok(r.data.prompt && r.data.prompt.id, 'prompt devuelto con id');
    assert.strictEqual(m.prompts.size, 1, 'cacheado in-memory');

    const evs = publishedOf(mocks, 'prompt.created');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, '_prompts', 'project_id presente');
    assert.ok(evs[0].correlation_id, 'correlation_id propagado/generado');
    assert.ok(evs[0].timestamp, 'timestamp presente');
    assert.strictEqual(evs[0].slot_type, 'system');

    await m.onUnload();
  });

  await testAsync('handleUpdatePrompt cambiando content bumpea version a 1.0.1 + publica prompt.updated', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleCreatePrompt({ body: { name: 'p1', content: 'v1' } }, {});
    const id = created.data.prompt.id;
    mocks.published.length = 0;

    const r = await m.handleUpdatePrompt({ params: { id }, body: { content: 'v2' } }, {});
    await flush();

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.prompt.current_version, '1.0.1');
    assert.strictEqual(r.data.prompt.content, 'v2');

    const evs = publishedOf(mocks, 'prompt.updated');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].id, id);
    assert.strictEqual(evs[0].version, '1.0.1');
    assert.strictEqual(evs[0].project_id, '_prompts');

    await m.onUnload();
  });

  await testAsync('handleDeletePrompt elimina del cache + publica prompt.deleted', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleCreatePrompt({ body: { name: 'p1', content: 'v1' } }, {});
    const id = created.data.prompt.id;
    mocks.published.length = 0;

    const r = await m.handleDeletePrompt({ params: { id } }, {});
    await flush();

    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.prompts.size, 0);

    const evs = publishedOf(mocks, 'prompt.deleted');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].id, id);
    assert.strictEqual(evs[0].project_id, '_prompts');

    await m.onUnload();
  });

  await testAsync('handleDeletePrompt con id inexistente devuelve RESOURCE_NOT_FOUND canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleDeletePrompt({ params: { id: 'nope' } }, {});
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'prompt');
    await m.onUnload();
  });

  await testAsync('handleCreatePrompt con name duplicado devuelve ALREADY_EXISTS', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleCreatePrompt({ body: { name: 'unique', content: 'a' } }, {});
    const r = await m.handleCreatePrompt({ body: { name: 'unique', content: 'b' } }, {});
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'ALREADY_EXISTS');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: CRUD presets
  // ==========================================

  await testAsync('handleCreatePreset crea, persiste relaciones slots, publica preset.created', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const p1 = await m.handleCreatePrompt({ body: { name: 'sys', content: 'sys-prompt', slot_type: 'system' } }, {});
    mocks.published.length = 0;

    const r = await m.handleCreatePreset({ body: { name: 'preset-a', slots: { system: [p1.data.prompt.id] } } }, {});
    await flush();

    assert.strictEqual(r.status, 201);
    assert.strictEqual(m.presets.size, 1);

    const evs = publishedOf(mocks, 'preset.created');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, '_prompts');
    assert.ok(evs[0].correlation_id);

    await m.onUnload();
  });

  await testAsync('handleDeletePreset elimina + publica preset.deleted', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleCreatePreset({ body: { name: 'preset-x' } }, {});
    const id = created.data.preset.id;
    mocks.published.length = 0;

    const r = await m.handleDeletePreset({ params: { id } }, {});
    await flush();

    assert.strictEqual(r.status, 200);
    assert.strictEqual(m.presets.size, 0);
    const evs = publishedOf(mocks, 'preset.deleted');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].id, id);

    await m.onUnload();
  });

  // ==========================================
  // Group 5: Bus handlers RPC (par success/failure correlacionado)
  // ==========================================

  await testAsync('onPromptGetRequest con prompt existente publica response success correlacionada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleCreatePrompt({ body: { name: 'rpc-prompt', content: 'x' } }, {});
    const id = created.data.prompt.id;
    mocks.published.length = 0;

    await m.onPromptGetRequest({
      data: { request_id: 'req-1', id, correlation_id: 'corr-rpc' }
    });
    await flush();

    const evs = publishedOf(mocks, 'prompt.get.response');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].request_id, 'req-1');
    assert.strictEqual(evs[0].success, true);
    assert.strictEqual(evs[0].prompt.id, id);
    assert.strictEqual(evs[0].correlation_id, 'corr-rpc', 'correlation_id propagado del request');
    await m.onUnload();
  });

  await testAsync('onPromptGetRequest con id inexistente publica response failure con error canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;

    await m.onPromptGetRequest({
      data: { request_id: 'req-2', id: 'nope', correlation_id: 'corr-2' }
    });
    await flush();

    const evs = publishedOf(mocks, 'prompt.get.response');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].success, false);
    assert.strictEqual(evs[0].error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(evs[0].correlation_id, 'corr-2');
    await m.onUnload();
  });

  await testAsync('onPromptListRequest publica response con todos los prompts', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleCreatePrompt({ body: { name: 'a', content: 'A' } }, {});
    await m.handleCreatePrompt({ body: { name: 'b', content: 'B' } }, {});
    mocks.published.length = 0;

    await m.onPromptListRequest({ data: { request_id: 'req-3', correlation_id: 'corr-3' } });
    await flush();

    const evs = publishedOf(mocks, 'prompt.list.response');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].success, true);
    assert.strictEqual(evs[0].prompts.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'corr-3');
    await m.onUnload();
  });

  // ==========================================
  // Group 6: Render template + tools
  // ==========================================

  await testAsync('handleToolPromptRender interpola variables y reporta missing', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleCreatePrompt({
      body: { name: 'tpl', content: 'Hi {{name}}, age {{age}}', variables: [{ name: 'name' }, { name: 'age' }] }
    }, {});

    const r = await m.handleToolPromptRender({ name: 'tpl', variables: { name: 'Ada' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.rendered, 'Hi Ada, age {{age}}');
    assert.deepStrictEqual(r.data.missing_variables, ['age']);
    await m.onUnload();
  });

  await testAsync('handleToolPromptList filtra por slot_type y devuelve shape canonico sin content', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleCreatePrompt({ body: { name: 'sys-1', content: 'S1', slot_type: 'system' } }, {});
    await m.handleCreatePrompt({ body: { name: 'ctx-1', content: 'C1', slot_type: 'context' } }, {});

    const r = await m.handleToolPromptList({ slot_type: 'system' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.prompts.length, 1);
    assert.strictEqual(r.data.prompts[0].slot_type, 'system');
    assert.ok(!('content' in r.data.prompts[0]), 'content NO incluido en list');
    await m.onUnload();
  });

  await testAsync('handleRenderTemplate con version inexistente devuelve RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const created = await m.handleCreatePrompt({ body: { name: 'v1', content: 'x' } }, {});
    const id = created.data.prompt.id;

    const r = await m.handleRenderTemplate({ params: { id }, body: { version: '99.9.9', variables: {} } }, {});
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(typeof evs[1].correlation_id === 'string' && evs[1].correlation_id.length > 0);
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    const metricCall = mocks.metricsCalls.find(c => c[0] === 'increment' && c[1] === 'test.errors');
    assert.ok(metricCall, 'metric incrementada en error path');
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();
