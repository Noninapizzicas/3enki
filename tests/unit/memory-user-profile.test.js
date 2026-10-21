/**
 * Tests unitarios para memory-user-profile.
 *
 * Foco:
 *  - extraccion heuristica de hechos en español (varios patrones).
 *  - dedup por (user_id, fact) — INSERT OR IGNORE.
 *  - publish chat.context.enriched con payload canonico.
 *  - chat.context.enriched VALIDA contra el JSON Schema oficial.
 *  - sin user_message valido no publica nada (no falla).
 *  - mensaje sin patrones reconocibles: si no hay perfil acumulado no publica;
 *    si si hay (de mensajes anteriores), reusa el perfil acumulado.
 *  - config.enabled=false desactiva el modulo.
 *
 * Ejecutar: node tests/unit/memory-user-profile.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const MemoryUserProfileModule = require('../../modules/conversacion/memory-user-profile/index.js');

function makeAjv() {
  const dir = path.resolve(__dirname, '../../arquitectura/decisiones/_schemas/chat-flow');
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f);
  }
  return ajv;
}

/**
 * Mock de database-manager: responde sincronamente al db.query.request
 * con datos plausibles. Mantiene un store en memoria por (project_id).
 */
function makeMocks() {
  const logs = [];
  const published = [];
  const dbStore = new Map(); // project_id → array de filas user_profile_facts

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  // Modulo bajo test — para resolver pending request_id desde el "DB"
  let moduleRef = null;

  const eventBus = {
    publish: async (event, payload) => {
      published.push([event, payload]);
      if (event === 'db.query.request' && moduleRef) {
        const rows = handleDbQuery(payload, dbStore);
        // simula la respuesta del database-manager
        moduleRef.onDbQueryResponse({ data: { request_id: payload.request_id, data: rows } });
      }
    }
  };

  return { logs, published, dbStore, logger, eventBus, setModule: (m) => { moduleRef = m; } };
}

function handleDbQuery({ project_id, query, params }, dbStore) {
  if (!dbStore.has(project_id)) dbStore.set(project_id, []);
  const rows = dbStore.get(project_id);
  const q = query.trim().toUpperCase();

  if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX')) return [];

  if (q.startsWith('INSERT OR IGNORE INTO USER_PROFILE_FACTS')) {
    const [id, user_id, fact, source_message_id, conversation_id, created_at] = params;
    const exists = rows.find(r => r.user_id === user_id && r.fact === fact);
    if (!exists) rows.push({ id, user_id, fact, source_message_id, conversation_id, created_at });
    return [];
  }

  if (q.startsWith('SELECT FACT FROM USER_PROFILE_FACTS')) {
    const [user_id, limit] = params;
    return rows.filter(r => r.user_id === user_id).slice(0, limit).map(r => ({ fact: r.fact }));
  }

  return [];
}

function instantiate(mocks, configOverride = {}) {
  const m = new MemoryUserProfileModule();
  m.logger   = mocks.logger;
  m.eventBus = mocks.eventBus;
  m.config   = { enabled: true, priority_in_prompt: 100, max_facts_per_user: 200, min_fact_length: 4, ...configOverride };
  mocks.setModule(m);
  return m;
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  console.log('memory-user-profile — primer modulo de memoria modular\n');
  const ajv = makeAjv();
  const validateEnriched = ajv.getSchema('chat.context.enriched.schema.json');

  // Group 1 — extraccion heuristica

  await testAsync('extrae nombre + ubicacion + preferencia de un solo mensaje', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({
      correlation_id: 'c1',
      project_id: 'p1', user_id: 'u1',
      conversation_id: 'conv1', message_id: 'msg1',
      user_message: 'Hola, me llamo Andrea, vivo en Bilbao y me gusta el espresso doble.',
      timestamp: '2026-05-03T10:00:00.000Z'
    });
    const stored = mocks.dbStore.get('p1');
    const facts = stored.map(r => r.fact);
    assert.ok(facts.some(f => /se llama Andrea/i.test(f)), `falta nombre. facts=${JSON.stringify(facts)}`);
    assert.ok(facts.some(f => /vive en Bilbao/i.test(f)), `falta ubicacion`);
    assert.ok(facts.some(f => /le gusta el espresso doble/i.test(f)), `falta preferencia`);
  });

  await testAsync('extrae trabajo + edad + restriccion alimentaria', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({
      correlation_id: 'c2',
      project_id: 'p1', user_id: 'u2',
      conversation_id: 'conv2', message_id: 'msg2',
      user_message: 'Trabajo de medico en un hospital, tengo 42 años y soy alergico a los frutos secos.',
      timestamp: '2026-05-03T10:00:00.000Z'
    });
    const facts = mocks.dbStore.get('p1').filter(r => r.user_id === 'u2').map(r => r.fact);
    assert.ok(facts.some(f => /trabaja de medico/i.test(f)), `falta trabajo. facts=${JSON.stringify(facts)}`);
    assert.ok(facts.some(f => /42 años/.test(f)), `falta edad`);
    assert.ok(facts.some(f => /alergico a los frutos secos/i.test(f)), `falta alergia`);
  });

  await testAsync('mensaje sin patrones no genera facts (pero tampoco rompe)', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({
      correlation_id: 'c3',
      project_id: 'p1', user_id: 'u3',
      conversation_id: 'conv3', message_id: 'msg3',
      user_message: 'Que tal todo? Como va?',
      timestamp: '2026-05-03T10:00:00.000Z'
    });
    const stored = (mocks.dbStore.get('p1') || []).filter(r => r.user_id === 'u3');
    assert.strictEqual(stored.length, 0, 'no debe insertar facts');
    const enriched = mocks.published.find(p => p[0] === 'chat.context.enriched');
    assert.ok(!enriched, 'no debe publicar chat.context.enriched si no hay perfil');
  });

  // Group 2 — dedup + acumulacion

  await testAsync('dedup: el mismo fact no se inserta dos veces', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    for (let i = 0; i < 3; i++) {
      await m.onMessageSaved({
        correlation_id: `c-${i}`,
        project_id: 'p1', user_id: 'u-dedup',
        conversation_id: 'conv', message_id: `msg-${i}`,
        user_message: 'me llamo Pedro',
        timestamp: '2026-05-03T10:00:00.000Z'
      });
    }
    const stored = mocks.dbStore.get('p1').filter(r => r.user_id === 'u-dedup');
    assert.strictEqual(stored.length, 1, `dedup fallo. stored=${JSON.stringify(stored.map(r => r.fact))}`);
  });

  await testAsync('mensaje 2 sin patrones REUSA perfil acumulado del mensaje 1', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({
      correlation_id: 'c-a',
      project_id: 'p1', user_id: 'u-acum',
      conversation_id: 'conv', message_id: 'msg-a',
      user_message: 'me llamo Marta y soy de Sevilla',
      timestamp: '2026-05-03T10:00:00.000Z'
    });
    mocks.published.length = 0; // reset publishes
    await m.onMessageSaved({
      correlation_id: 'c-b',
      project_id: 'p1', user_id: 'u-acum',
      conversation_id: 'conv', message_id: 'msg-b',
      user_message: 'que recomiendas para cenar?',
      timestamp: '2026-05-03T10:00:01.000Z'
    });
    const enriched = mocks.published.find(p => p[0] === 'chat.context.enriched');
    assert.ok(enriched, 'debe publicar enriched aunque el mensaje 2 no aporte facts nuevos');
    assert.ok(/Marta/.test(enriched[1].context_addition), 'el perfil acumulado debe incluir el nombre');
    assert.ok(/Sevilla/.test(enriched[1].context_addition), 'el perfil acumulado debe incluir la ubicacion');
    assert.strictEqual(enriched[1].metadata.new_facts_added, 0);
    assert.strictEqual(enriched[1].metadata.fact_count, 2);
  });

  // Group 3 — payload canonico + schema

  await testAsync('chat.context.enriched VALIDA contra el JSON Schema oficial', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({
      correlation_id: 'c-v',
      project_id: 'p1', user_id: 'u-v',
      conversation_id: 'conv-v', message_id: 'msg-v',
      user_message: 'me llamo Luis',
      timestamp: '2026-05-03T10:00:00.000Z'
    });
    const enriched = mocks.published.find(p => p[0] === 'chat.context.enriched');
    assert.ok(enriched);
    const ok = validateEnriched(enriched[1]);
    assert.ok(ok, `payload debe validar. errors: ${JSON.stringify(validateEnriched.errors)}`);
    assert.strictEqual(enriched[1].source, 'memory-user-profile');
    assert.strictEqual(enriched[1].priority, 100);
  });

  // Group 4 — robustez

  await testAsync('payload incompleto (sin user_message) NO rompe ni publica', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({
      correlation_id: 'c-x',
      project_id: 'p1', user_id: 'u-x',
      conversation_id: 'conv-x', message_id: 'msg-x'
      // sin user_message
    });
    assert.ok(!mocks.published.find(p => p[0] === 'chat.context.enriched'));
    assert.ok(!mocks.logs.find(l => l[0] === 'error'));
  });

  await testAsync('config.enabled=false desactiva el modulo (no publica nada)', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { enabled: false });
    await m.onMessageSaved({
      correlation_id: 'c-d',
      project_id: 'p1', user_id: 'u-d',
      conversation_id: 'conv-d', message_id: 'msg-d',
      user_message: 'me llamo X',
      timestamp: '2026-05-03T10:00:00.000Z'
    });
    assert.strictEqual(mocks.published.length, 0);
  });

  // Group 5 — aislamiento por user_id

  await testAsync('el perfil esta aislado por user_id (multi-user)', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onMessageSaved({
      correlation_id: 'c-a', project_id: 'p1', user_id: 'alice',
      conversation_id: 'cA', message_id: 'mA',
      user_message: 'me llamo Alice', timestamp: '2026-05-03T10:00:00.000Z'
    });
    mocks.published.length = 0;
    await m.onMessageSaved({
      correlation_id: 'c-b', project_id: 'p1', user_id: 'bob',
      conversation_id: 'cB', message_id: 'mB',
      user_message: 'me llamo Bob', timestamp: '2026-05-03T10:00:00.000Z'
    });
    const enriched = mocks.published.find(p => p[0] === 'chat.context.enriched');
    assert.ok(enriched);
    assert.ok(/Bob/.test(enriched[1].context_addition));
    assert.ok(!/Alice/.test(enriched[1].context_addition), 'el perfil de Bob NO debe incluir a Alice');
  });

  console.log('\nmemory-user-profile: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });
