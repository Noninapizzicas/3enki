/**
 * Tests unitarios — pizzepos__carta-digital REPUBLICACIÓN AUTOMÁTICA (v2.25.0).
 *
 * El bundle de la PWA es ESTÁTICO: cada cambio de carta dejaba la web VIEJA EN SILENCIO
 * hasta que el dueño volvía a pulsar `publicar`. v2.25.0 cuelga _autoPublicar de las 5
 * señales que ya refrescaban el frontend. Estas pruebas fijan las 3 reglas que lo hacen
 * honesto (sin core, con _publicarBundle y _rpc stubbados):
 *   1) SOLO proyectos que YA publicaron — la verdad es el DISCO (fs.exists /www/index.html).
 *   2) UN horneado por edición (debounce por proyecto).
 *   3) Interruptor por proyecto: opciones_visualizacion.auto_publicar === false.
 * Y la garantía del bus: un fallo NO es silencioso (emite cartadigital.republicar.fallido).
 *
 * Ejecutar: node tests/unit/pizzepos__carta-digital-republicar.test.js
 */
'use strict';

const assert = require('assert');
const CartaDigitalModule = require('../../modules/pizzepos/carta-digital/index.js');

function makeBus() {
  const handlers = new Map();
  const published = [];
  return {
    published,
    subscribe(ev, fn) {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev).add(fn);
      return () => handlers.get(ev)?.delete(fn);
    },
    // inyecta un evento al módulo (como haría el loader con el bus real)
    inject(ev, data) { const f = handlers.get(ev); if (f) for (const fn of [...f]) fn({ data }); },
    async publish(ev, payload) { published.push([ev, payload]); }
  };
}

async function makeSetup({ exists = true, config = null, publishResult = { status: 200, data: { alojada_url: '/a/x' } } } = {}) {
  const m = new CartaDigitalModule();
  const bus = makeBus();
  await m.onLoad({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    eventBus: bus, metrics: { increment() {} }, uiHandler: { register() {} }
  });
  let calls = 0;
  m._rpc = async (ev) => {
    if (ev === 'fs.exists.request') return { status: 200, exists };
    if (ev === 'fs.read.request') return { status: 200, content: JSON.stringify(config || {}) };
    return { status: 200 };
  };
  m._publicarBundle = async () => { calls++; return publishResult; };
  m.repubMs = 15;   // ventana corta para el test
  return { m, bus, getCalls: () => calls };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

let fails = 0;
async function testAsync(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { fails++; console.error(`✗ ${desc}\n  ${e.message}`); if (process.env.STACK) console.error(e.stack); }
}

(async () => {
  await testAsync('carta.actualizada con bundle en disco → re-hornea UNA vez', async () => {
    const { bus, getCalls } = await makeSetup({ exists: true });
    bus.inject('carta.actualizada', { project_id: 'p1' });
    await sleep(60);
    assert.strictEqual(getCalls(), 1, `esperaba 1 horneado, hubo ${getCalls()}`);
  });

  await testAsync('ráfaga de 3 señales (una edición de precios) → UN solo horneado (debounce)', async () => {
    const { bus, getCalls } = await makeSetup({ exists: true });
    bus.inject('carta.editada', { project_id: 'p1' });
    bus.inject('carta.editada', { project_id: 'p1' });
    bus.inject('carta.editada', { project_id: 'p1' });
    await sleep(60);
    assert.strictEqual(getCalls(), 1, `esperaba 1 horneado por ráfaga, hubo ${getCalls()}`);
  });

  await testAsync('las 5 señales disparan el horneado (carta.actualizada/editada/borrada, contenido, marketing)', async () => {
    for (const ev of ['carta.actualizada', 'carta.editada', 'carta.borrada', 'contenido.actualizado', 'marketing.perfil.actualizado']) {
      const { bus, getCalls } = await makeSetup({ exists: true });
      bus.inject(ev, { project_id: 'p1' });
      await sleep(60);
      assert.strictEqual(getCalls(), 1, `${ev} no disparó el horneado`);
    }
  });

  await testAsync('regla 1: sin bundle en disco (nunca publicado) → NO toca nada', async () => {
    const { bus, getCalls } = await makeSetup({ exists: false });
    bus.inject('carta.actualizada', { project_id: 'p1' });
    await sleep(60);
    assert.strictEqual(getCalls(), 0, 'no debía hornear (la primera publicación es acto del dueño)');
  });

  await testAsync('regla 3: interruptor auto_publicar=false → NO toca nada', async () => {
    const { bus, getCalls } = await makeSetup({ exists: true, config: { opciones_visualizacion: { auto_publicar: false } } });
    bus.inject('carta.actualizada', { project_id: 'p1' });
    await sleep(60);
    assert.strictEqual(getCalls(), 0, 'el interruptor por proyecto debía pararlo');
  });

  await testAsync('interruptor ausente → SÍ re-hornea (default encendido)', async () => {
    const { bus, getCalls } = await makeSetup({ exists: true, config: { opciones_visualizacion: { tema: 'x' } } });
    bus.inject('contenido.actualizado', { project_id: 'p1' });
    await sleep(60);
    assert.strictEqual(getCalls(), 1, 'sin interruptor debía hornear');
  });

  await testAsync('dos proyectos distintos → cada uno su horneado', async () => {
    const { bus, getCalls } = await makeSetup({ exists: true });
    bus.inject('carta.actualizada', { project_id: 'p1' });
    bus.inject('carta.actualizada', { project_id: 'p2' });
    await sleep(60);
    assert.strictEqual(getCalls(), 2, `esperaba 2 (uno por proyecto), hubo ${getCalls()}`);
  });

  await testAsync('horneado que falla → emite cartadigital.republicar.fallido (no silencio)', async () => {
    const { bus, getCalls } = await makeSetup({ exists: true, publishResult: { status: 502, error: { code: 'X' } } });
    bus.inject('carta.actualizada', { project_id: 'p1' });
    await sleep(60);
    assert.strictEqual(getCalls(), 1);
    assert.ok(bus.published.find(([ev]) => ev === 'cartadigital.republicar.fallido'), 'no emitió republicar.fallido');
  });

  await testAsync('evento sin project_id → no revienta ni hornea', async () => {
    const { bus, getCalls } = await makeSetup({ exists: true });
    bus.inject('carta.actualizada', {});
    await sleep(60);
    assert.strictEqual(getCalls(), 0);
  });

  if (fails === 0) console.log('\nTotal: 9/9 OK');
  else { console.error(`\n${fails} fallo(s)`); process.exit(1); }
})();
