/**
 * Tests unitarios — credential-manager v2.3.0 · ROTACIÓN DE TOKEN.
 *
 * Lo que fija este test (y lo que NO debe romperse):
 *  1. Una credencial rotativa NUNCA entra en this.credentials ni en el .env de
 *     credenciales estáticas: si lo hiciera, _saveEnvFile() (que reescribe el
 *     .env entero) se llevaría por delante las demás credenciales cada vez que
 *     el token rota.
 *  2. El access_token solo se sirve si NO está vencido.
 *  3. Vencido + refresh_token → refresh, y el refresh ROTADO se persiste antes
 *     de dar el nuevo access por bueno.
 *  4. Vencido + SIN refresh_token → 409 CREDENTIAL_EXPIRED. No reintento a ciegas.
 *  5. Un refresh que el emisor revoca (invalid_grant / reuse) → la credencial
 *     pasa a REVOKED y NO se reintenta; el resolve da 409 CREDENTIAL_REVOKED.
 *  6. El registro sobrevive al reinicio (persistencia en fila aparte).
 *  7. El estado de UI nunca expone token ni refresh.
 *
 * Sin red: _fetchWithTimeout se inyecta.
 *
 * Ejecutar: node tests/unit/credential-manager__rotacion.test.js
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const CredentialManagerModule = require('../../modules/credential-manager/index.js');

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
    increment: (name, labels) => metricsCalls.push(['increment', name, labels]),
    gauge:     (name, value, labels) => metricsCalls.push(['gauge', name, value, labels]),
    timing:    (name, ms, labels) => metricsCalls.push(['timing', name, ms, labels])
  };
  const eventBus = { publish: async (event, payload) => { published.push([event, payload]); } };
  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(configOverride = {}) {
  const mocks = makeMocks();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-rot-'));
  const tmpEnv = path.join(dir, '.env');
  const m = new CredentialManagerModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: { envFile: tmpEnv, ...configOverride }
  });
  return { module: m, dir, envFile: tmpEnv, mocks };
}

async function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  }
}

const TOKEN_URL = 'https://issuer.example/token';

/** Emisor fake: devuelve un par nuevo y rota el refresh_token. */
function emisorFake(m, { rechaza = false } = {}) {
  const llamadas = [];
  m._fetchWithTimeout = async (url, opts) => {
    llamadas.push({ url, body: opts.body });
    if (rechaza) throw new Error('HTTP 400: invalid_grant — refresh_token_reused');
    const body = new URLSearchParams(opts.body);
    const viejo = body.get('refresh_token');
    return JSON.stringify({
      access_token: 'access-nuevo',
      refresh_token: 'refresh-nuevo-' + (viejo || '').slice(-4),
      expires_in: 3600
    });
  };
  return llamadas;
}

(async () => {
  console.log('credential-manager — rotación de token v2.3.0\n');

  await testAsync('rotate.start registra la credencial y NO toca el .env de credenciales estáticas', async () => {
    const { module: m, dir, envFile, mocks } = await instantiate();
    await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'sk-estatica' });
    const antes = fs.readFileSync(envFile, 'utf-8');

    const r = await m.onRotationStartRequest({ data: {
      request_id: 'r1', provider: 'nous', level: 'GLOBAL',
      access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600
    }});
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(m.credentials.size, 1, 'las rotaciones NO entran en credentials');
    assert.ok(m.credentials.has('OPENAI_API_KEY_GLOBAL'));
    assert.ok(!m.credentials.has('NOUS_API_KEY_GLOBAL'), 'NO debe ocupar el hueco estático');
    const despues = fs.readFileSync(envFile, 'utf-8');
    assert.strictEqual(antes, despues, 'el .env de credenciales no se reescribe');
    assert.ok(fs.existsSync(path.join(dir, 'credential.rotations.json')), 'fila aparte escrita');
    await cleanup(dir);
  });

  await testAsync('el access_token vigente se sirve sin llamar al emisor', async () => {
    const { module: m, dir } = await instantiate();
    const llamadas = emisorFake(m);
    await m.onRotationStartRequest({ data: {
      request_id: 'r1', provider: 'nous', access_token: 'access-1',
      refresh_token: 'refresh-1', expires_in: 3600
    }});
    const r = await m.onRotationResolveRequest({ data: { request_id: 'r2', provider: 'nous' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.token, 'access-1');
    assert.strictEqual(r.data.refreshed, false);
    assert.strictEqual(llamadas.length, 0, 'un token vigente no se refresca');
    await cleanup(dir);
  });

  await testAsync('vencido → refresca, rota el refresh y persiste el nuevo par', async () => {
    const { module: m, dir } = await instantiate();
    const llamadas = emisorFake(m);
    await m.onRotationStartRequest({ data: {
      request_id: 'r1', provider: 'nous', access_token: 'access-viejo',
      refresh_token: 'refresh-viejo', expires_in: 1
    }});
    // Forzar vencimiento sin esperar
    const reg = m._getRotation('NOUS', 'GLOBAL');
    reg.expires_at = new Date(Date.now() - 1000).toISOString();

    const r = await m.onRotationResolveRequest({ data: {
      request_id: 'r2', provider: 'nous', token_url: TOKEN_URL
    }});
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.token, 'access-nuevo');
    assert.strictEqual(r.data.refreshed, true);
    assert.strictEqual(r.data.generation, 2);

    const despues = m._getRotation('NOUS', 'GLOBAL');
    assert.strictEqual(despues.refresh_token, 'refresh-nuevo-iejo', 'el refresh ROTA y se persiste');
    assert.strictEqual(despues.token, 'access-nuevo');

    // Y el emisor recibió el refresh viejo, no el nuevo
    assert.strictEqual(new URLSearchParams(llamadas[0].body).get('refresh_token'), 'refresh-viejo');
    await cleanup(dir);
  });

  await testAsync('vencido SIN refresh_token → 409 CREDENTIAL_EXPIRED, sin llamada al emisor', async () => {
    const { module: m, dir } = await instantiate();
    const llamadas = emisorFake(m);
    await m.onRotationStartRequest({ data: {
      request_id: 'r1', provider: 'nous', access_token: 'access-1', expires_in: 1
    }});
    const reg = m._getRotation('NOUS', 'GLOBAL');
    reg.expires_at = new Date(Date.now() - 1000).toISOString();

    const r = await m.onRotationResolveRequest({ data: { request_id: 'r2', provider: 'nous' } });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CREDENTIAL_EXPIRED');
    assert.strictEqual(llamadas.length, 0, 'sin refresh no se intenta');
    await cleanup(dir);
  });

  await testAsync('un refresh revocado deja la credencial REVOKED y el resolve da 409 (sin reintento)', async () => {
    const { module: m, dir } = await instantiate();
    emisorFake(m, { rechaza: true });
    await m.onRotationStartRequest({ data: {
      request_id: 'r1', provider: 'nous', access_token: 'access-1',
      refresh_token: 'refresh-1', expires_in: 1
    }});
    const reg = m._getRotation('NOUS', 'GLOBAL');
    reg.expires_at = new Date(Date.now() - 1000).toISOString();

    const r1 = await m.onRotationResolveRequest({ data: { request_id: 'r2', provider: 'nous', token_url: TOKEN_URL } });
    assert.strictEqual(r1.status, 409);
    assert.strictEqual(r1.error.code, 'CREDENTIAL_REVOKED');

    // El estado quedó revocado
    assert.ok(m._getRotation('NOUS', 'GLOBAL').revoked_at, 'revoked_at persistido');

    // Y el siguiente resolve NO vuelve a llamar al emisor: espera re-login humano
    const r2 = await m.onRotationResolveRequest({ data: { request_id: 'r3', provider: 'nous', token_url: TOKEN_URL } });
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.error.code, 'CREDENTIAL_REVOKED');
    await cleanup(dir);
  });

  await testAsync('rotate.revoke marca revocada; rotate.start la reactiva', async () => {
    const { module: m, dir } = await instantiate();
    emisorFake(m);
    await m.onRotationStartRequest({ data: {
      request_id: 'r1', provider: 'nous', access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600
    }});
    const rv = await m.onRotationRevokeRequest({ data: { request_id: 'r2', provider: 'nous' } });
    assert.strictEqual(rv.status, 200);
    assert.ok(m._getRotation('NOUS', 'GLOBAL').revoked_at);

    // Reautorización: generation sube y revoked_at se limpia
    const re = await m.onRotationStartRequest({ data: {
      request_id: 'r3', provider: 'nous', access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600
    }});
    assert.strictEqual(re.status, 200);
    assert.strictEqual(re.data.status, 'ACTIVE');
    assert.strictEqual(re.data.generation, 2);
    assert.strictEqual(m._getRotation('NOUS', 'GLOBAL').revoked_at, null);
    await cleanup(dir);
  });

  await testAsync('la rotación sobrevive al reinicio (persistencia en fila aparte)', async () => {
    const { module: m1, dir } = await instantiate();
    emisorFake(m1);
    await m1.onRotationStartRequest({ data: {
      request_id: 'r1', provider: 'nous', access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600
    }});
    await m1.onUnload();

    // Segunda instancia, MISMO directorio: debe cargar la fila
    const m2 = new CredentialManagerModule();
    const mocks2 = makeMocks();
    await m2.onLoad({
      logger: mocks2.logger, metrics: mocks2.metrics, eventBus: mocks2.eventBus,
      moduleConfig: { envFile: path.join(dir, '.env') }
    });
    const reg = m2._getRotation('NOUS', 'GLOBAL');
    assert.ok(reg, 'la rotación se recargó del disco');
    assert.strictEqual(reg.token, 'access-1');
    await m2.onUnload();
    await cleanup(dir);
  });

  await testAsync('una fila corrupta NO tumba el módulo', async () => {
    const { module: m, dir } = await instantiate();
    fs.writeFileSync(path.join(dir, 'credential.rotations.json'), '{ esto no es JSON');
    const m2 = new CredentialManagerModule();
    const mocks2 = makeMocks();
    await m2.onLoad({
      logger: mocks2.logger, metrics: mocks2.metrics, eventBus: mocks2.eventBus,
      moduleConfig: { envFile: path.join(dir, '.env') }
    });
    assert.strictEqual(m2.rotations.size, 0);
    await m2.onUnload();
    await cleanup(dir);
  });

  await testAsync('el estado de UI nunca expone token ni refresh', async () => {
    const { module: m, dir } = await instantiate();
    await m.onRotationStartRequest({ data: {
      request_id: 'r1', provider: 'nous', access_token: 'SECRETO-ACCESS',
      refresh_token: 'SECRETO-REFRESH', expires_in: 3600
    }});
    const st = m._getUIState();
    const rot = st.rotations.find(x => x.provider === 'NOUS');
    assert.ok(rot);
    assert.ok(!JSON.stringify(rot).includes('SECRETO-ACCESS'), 'no filtra access');
    assert.ok(!JSON.stringify(rot).includes('SECRETO-REFRESH'), 'no filtra refresh');
    assert.ok(rot.token_preview.startsWith('*'), 'solo preview enmascarado');
    await cleanup(dir);
  });

  await testAsync('levels no-GLOBAL usan identifier; el default es GLOBAL', async () => {
    const { module: m, dir } = await instantiate();
    await m.onRotationStartRequest({ data: {
      request_id: 'r1', provider: 'nous', level: 'PROJECT', identifier: 'bocaos',
      access_token: 'a', refresh_token: 'r', expires_in: 3600
    }});
    assert.ok(m._getRotation('NOUS', 'PROJECT', 'bocaos'), 'clave compuesta');
    assert.strictEqual(m._getRotation('NOUS', 'GLOBAL'), null, 'no cae a GLOBAL');

    // Un PROJECT sin identifier es inválido (invariante de niveles existente)
    const r = await m.onRotationStartRequest({ data: {
      request_id: 'r2', provider: 'nous', level: 'PROJECT', access_token: 'a', expires_in: 3600
    }});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await cleanup(dir);
  });

  await testAsync('resolve de un provider inexistente → 404 canónico', async () => {
    const { module: m, dir } = await instantiate();
    const r = await m.onRotationResolveRequest({ data: { request_id: 'r1', provider: 'no-existe' } });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await cleanup(dir);
  });

  await testAsync('las credenciales estáticas siguen funcionando intactas (regresión)', async () => {
    const { module: m, dir } = await instantiate();
    await m.handleUICreate({ provider: 'OPENAI', level: 'GLOBAL', api_key: 'sk-1' });
    await m.handleUICreate({ provider: 'GEMINI', level: 'PROJECT', identifier: 'bocaos', api_key: 'gm-1' });

    // Resolver estático por cascada
    const rpc = await new Promise((resolve) => {
      m.eventBus.publish = async (ev, payload) => { if (ev === 'credential.resolve.response') resolve(payload); };
      m.onResolveRequest({ data: { request_id: 'x', provider: 'OPENAI', project_id: 'bocaos' } });
    });
    assert.strictEqual(rpc.api_key, 'sk-1');
    assert.strictEqual(rpc.resolved_from, 'GLOBAL');

    // Y una rotación no interfiere en la cascada estática
    await m.onRotationStartRequest({ data: {
      request_id: 'r1', provider: 'nous', access_token: 'a', refresh_token: 'r', expires_in: 3600
    }});
    const rpc2 = await new Promise((resolve) => {
      m.eventBus.publish = async (ev, payload) => { if (ev === 'credential.resolve.response') resolve(payload); };
      m.onResolveRequest({ data: { request_id: 'y', provider: 'GEMINI', project_id: 'bocaos' } });
    });
    assert.strictEqual(rpc2.api_key, 'gm-1');
    await cleanup(dir);
  });

  console.log('\ncredential-manager rotación: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });
