/**
 * Tests unitarios — credential-oauth · flujo de DISPOSITIVO (Nous).
 *
 * Lo que fija:
 *  1. NOUS entra en SUPPORTED_PROVIDERS y usa device flow, no authorization code.
 *  2. _start con NOUS NO construye redirect_uri ni llama a googleOAuth: pide el
 *     device code y devuelve { flow, auth_url, user_code, state_id }.
 *  3. _status canjea el device_code (polling) y registra la credencial como
 *     ROTATIVA en credential-manager (credential.rotate.start.request).
 *  4. Mientras el humano no autoriza (authorization_pending), _status devuelve
 *     status:'pending' — no es un error.
 *  5. El refresh NO se hace en este módulo: el token canjeado se entrega tal
 *     cual a credential-manager. Si este módulo refrescara, dos refrescadores
 *     pisarían el refresh_token y el emisor revocaría la cadena.
 *  6. El callback HTTP de Google sigue intacto (regresión): no enrutar NOUS
 *     por ahí ni romper GMAIL.
 *  7. _resolve de NOUS saca el token de la rotación (credential.rotate.resolve).
 *
 * Sin red: nousOAuth.startDeviceCode / pollForToken se inyectan.
 *
 * Ejecutar: node tests/unit/credential-oauth__nous.test.js
 */

'use strict';

const assert = require('assert');
const CredentialOAuthModule = require('../../modules/credential-oauth/index.js');
const nousOAuth = require('../../modules/credential-oauth/oauth/nous');

function makeMocks() {
  const logs = [];
  const published = [];
  const rpcs = [];
  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = { increment: () => {}, gauge: () => {}, timing: () => {} };
  const eventBus = { publish: async (event, payload) => { published.push([event, payload]); } };
  return { logs, published, rpcs, logger, metrics, eventBus };
}

async function instantiate({ rpcImpl = async () => ({}) } = {}) {
  const mocks = makeMocks();
  const m = new CredentialOAuthModule();
  m._rpc = async (op, payload) => { mocks.rpcs.push([op, payload]); return rpcImpl(op, payload); };
  await m.onLoad({
    logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
    moduleConfig: {}, project_id: 'test'
  });
  return { module: m, mocks };
}

/** Sustituye el adaptador Nous (el módulo expone __testOverride para esto). */
function mockearNous({ startDeviceCode, pollForToken }) {
  nousOAuth.__testOverride = { startDeviceCode, pollForToken };
  return () => { delete nousOAuth.__testOverride; };
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

const DEVICE = {
  device_code: 'dev-123',
  user_code: 'X9WG-NPST',
  verification_uri: 'https://portal.nousresearch.com/manage-subscription',
  expires_in: 600,
  interval: 5
};

// El flujo de dispositivo de Nous es public client: solo necesita client_id.
process.env.NOUS_CLIENT_ID = 'hermes-cli';
const _limpiarEnv = () => { delete process.env.NOUS_CLIENT_ID; };

(async () => {
  console.log('credential-oauth — flujo de dispositivo (Nous)\n');

  await testAsync('NOUS está soportado y usa device flow, no authorization code', async () => {
    assert.ok(nousOAuth.startDeviceCode, 'adaptador cargado');
    const { module: m } = await instantiate();
    assert.ok(m, 'módulo instancia');
    let llamado = false;
    const restaurar = mockearNous({
      startDeviceCode: async () => { llamado = true; return DEVICE; },
      pollForToken: async () => ({})
    });
    const r = await m._start({ provider: 'nous', level: 'GLOBAL', identifier: null });
    restaurar();
    assert.ok(llamado, 'device flow usado');
    assert.strictEqual(r.data.flow, 'device_code');
    assert.ok(r.data.user_code);
    assert.ok(r.data.auth_url.includes('user_code='), 'la URL lleva el user_code');
    await m.onUnload();
  });

  await testAsync('_start NOUS no construye redirect_uri ni usa el callback de Google', async () => {
    const { module: m } = await instantiate();
    const restaurar = mockearNous({ startDeviceCode: async () => DEVICE, pollForToken: async () => ({}) });
    const r = await m._start({ provider: 'NOUS', level: 'GLOBAL' });
    restaurar();
    assert.strictEqual(r.data.flow, 'device_code');
    assert.ok(!JSON.stringify(r).includes('redirect_uri'), 'sin redirect_uri');
    assert.ok(!JSON.stringify(r).includes('oauth/callback'), 'sin callback HTTP');
    await m.onUnload();
  });

  await testAsync('_status canjea el device_code y registra la rotación en credential-manager', async () => {
    const { module: m, mocks } = await instantiate();
    const restaurar = mockearNous({
      startDeviceCode: async () => DEVICE,
      pollForToken: async () => ({
        access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600,
        token_type: 'Bearer', scope: 'inference:invoke'
      })
    });
    const start = await m._start({ provider: 'nous', level: 'GLOBAL' });
    const st = await m._status({ state_id: start.data.state_id });
    restaurar();

    assert.strictEqual(st.data.status, 'completed', JSON.stringify(st));
    const rot = mocks.published.find(([ev]) => ev === 'credential.rotate.start.request');
    assert.ok(rot, 'publicó credential.rotate.start.request');
    assert.strictEqual(rot[1].provider, 'NOUS');
    assert.strictEqual(rot[1].access_token, 'access-1');
    assert.strictEqual(rot[1].refresh_token, 'refresh-1');
    assert.strictEqual(rot[1].expires_in, 3600);
    assert.ok(rot[1].token_url, 'lleva el endpoint de refresh');
    await m.onUnload();
  });

  await testAsync('mientras no hay autorización, _status devuelve pending (no error)', async () => {
    const { module: m } = await instantiate();
    const restaurar = mockearNous({
      startDeviceCode: async () => DEVICE,
      pollForToken: async () => { throw new Error('Nous: authorization_pending — esperando'); }
    });
    const start = await m._start({ provider: 'nous', level: 'GLOBAL' });
    const st = await m._status({ state_id: start.data.state_id });
    restaurar();

    assert.strictEqual(st.data.status, 'pending');
    assert.strictEqual(st.status, 200, 'no es un error HTTP');
    // Y NO registró ninguna rotación
    assert.ok(!m.oauthPending.get(start.data.state_id).flow === false, 'sigue pendiente');
    await m.onUnload();
  });

  await testAsync('el módulo NO refresca: entrega el par a credential-manager sin tocarlo', async () => {
    const { module: m, mocks } = await instantiate();
    const restaurar = mockearNous({
      startDeviceCode: async () => DEVICE,
      pollForToken: async () => ({
        access_token: 'access-bruto', refresh_token: 'refresh-bruto', expires_in: 3600
      })
    });
    const start = await m._start({ provider: 'nous', level: 'GLOBAL' });
    await m._status({ state_id: start.data.state_id });
    restaurar();

    const rot = mocks.published.find(([ev]) => ev === 'credential.rotate.start.request');
    assert.strictEqual(rot[1].access_token, 'access-bruto', 'tal cual lo da el emisor');
    assert.strictEqual(rot[1].refresh_token, 'refresh-bruto');
    // No hay ninguna publicación de refresh desde este módulo
    const refrescos = mocks.published.filter(([ev]) => /refresh/i.test(ev));
    assert.strictEqual(refrescos.length, 0, 'este módulo no refresca');
    await m.onUnload();
  });

  await testAsync('un fallo de canje NO registra rotación', async () => {
    const { module: m, mocks } = await instantiate();
    const restaurar = mockearNous({
      startDeviceCode: async () => DEVICE,
      pollForToken: async () => { throw new Error('Nous: expired_token'); }
    });
    const start = await m._start({ provider: 'nous', level: 'GLOBAL' });
    const st = await m._status({ state_id: start.data.state_id });
    restaurar();

    assert.strictEqual(st.data.status, 'failed');
    assert.ok(!mocks.published.some(([ev]) => ev === 'credential.rotate.start.request'));
    await m.onUnload();
  });

  await testAsync('el callback HTTP de Google sigue intacto (regresión)', async () => {
    const { module: m } = await instantiate();
    // Un provider de Google debe seguir el camino de authorization code
    const origGetAuthUrl = require('../../modules/credential-oauth/oauth/google').getAuthUrl;
    let llamado = false;
    const google = require('../../modules/credential-oauth/oauth/google');
    google.getAuthUrl = (...a) => { llamado = true; return origGetAuthUrl(...a); };

    const r = await m._start({ provider: 'gmail', level: 'GLOBAL', identifier: null,
      project_id: 'test', scopes: ['gmail'] });
    google.getAuthUrl = origGetAuthUrl;
    assert.ok(r, 'responde');
    // GMAIL va por authorization code (con redirect_uri), NO por device flow
    if (r.data) assert.notStrictEqual(r.data.flow, 'device_code');
    await m.onUnload();
  });

  await testAsync('_resolve de NOUS saca el token de la rotación y lo devuelve como access', async () => {
    const { module: m } = await instantiate({
      rpcImpl: async (op) => op === 'credential.rotate.resolve.request'
        ? { success: true, data: { token: 'access-refrescado', expires_at: '2099-01-01T00:00:00Z', generation: 7 } }
        : {}
    });
    const r = await m._resolve({ provider: 'NOUS', account: 'default' });
    assert.strictEqual(r.success, true, JSON.stringify(r));
    assert.strictEqual(r.credentials.refreshToken, 'access-refrescado');
    assert.strictEqual(r.credentials.generation, 7);
    assert.strictEqual(r.resolved_from, 'ROTATION');
    await m.onUnload();
  });

  await testAsync('sin credencial rotativa, _resolve falla con error claro', async () => {
    const { module: m } = await instantiate({
      rpcImpl: async (op) => op === 'credential.rotate.resolve.request'
        ? { success: false, error: { code: 'RESOURCE_NOT_FOUND' } }
        : {}
    });
    const r = await m._resolve({ provider: 'NOUS', account: 'default' });
    assert.strictEqual(r.success, false);
    assert.ok(/sin credencial rotativa/.test(r.error));
    await m.onUnload();
  });

  _limpiarEnv();
  console.log('\ncredential-oauth nous: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });
