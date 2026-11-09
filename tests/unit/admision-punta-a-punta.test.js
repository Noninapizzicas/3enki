/**
 * Costura REAL de la admisión de conversaciones — punta a punta con los módulos
 * de verdad cableados al bus (nada simulado salvo el bus y el fs):
 *
 *   sobre-conversacion · gestor-llaves · politica-admision · puerta-admision
 *   · amarre-sesion · coordinador-conversacion
 *
 * Caso 1 (camino feliz): declarar política → emitir llave → entrada → ABRIR +
 *   relay_payload. La entrada NO trae `politica`: la resuelve el coordinador
 *   consultando al custodio (P04), que es el único que la declara.
 * Caso 2 (sin derecho): misma política, NINGUNA llave → RECHAZAR con
 *   MOTIVO_SIN_LLAVE y el mensaje NO llega al relay.
 * Caso 3 (sin política): proyecto sin declarar → corta en `politica_no_declarada`
 *   antes de la puerta (0 llamadas) y no se publica el paso al relay.
 *
 * Ejecutar: node tests/unit/admision-punta-a-punta.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SobreConversacion = require('../../modules/sobre-conversacion');
const GestorLlaves = require('../../modules/gestor-llaves');
const PoliticaAdmision = require('../../modules/politica-admision');
const PuertaAdmision = require('../../modules/puerta-admision');
const AmarreSesion = require('../../modules/amarre-sesion');
const CoordinadorConversacion = require('../../modules/coordinador-conversacion');

const logger = { info() {}, warn() {}, error() {}, debug() {} };
const PROYECTO = 'sistema-de-conversaciones';
const EVENTO_RELAY = 'chat.message.saved';

function busMock() {
  const publicados = [];
  const subs = new Map();
  const fsFiles = new Map();
  const key = (d) => `${d.project_id}::${d.path}`;
  const bus = {
    publicados,
    fsFiles,
    async publish(ev, data) {
      publicados.push({ event: ev, data });
      if (ev === 'fs.write.request') {
        fsFiles.set(key(data), data.content);
        return bus.publish('fs.write.response', { request_id: data.request_id, status: 200, data: {} });
      }
      if (ev === 'fs.read.request') {
        const c = fsFiles.get(key(data));
        return bus.publish('fs.read.response',
          c ? { request_id: data.request_id, status: 200, content: c }
            : { request_id: data.request_id, status: 404 });
      }
      if (ev === 'fs.edit.request') {
        return bus.publish('fs.edit.response', { request_id: data.request_id, status: 200, data: {} });
      }
      for (const fn of [...(subs.get(ev) || [])]) await fn({ data });
    },
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, []);
      subs.get(ev).push(fn);
      return () => { const a = subs.get(ev) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
    }
  };
  return bus;
}

/** Cablea las islas REALES: instancia + suscripción por cada par de su module.json. */
async function cablear() {
  const bus = busMock();
  const mods = [
    new SobreConversacion(),
    new GestorLlaves(),
    new PoliticaAdmision(),
    new PuertaAdmision(),
    new AmarreSesion(),
    new CoordinadorConversacion({ timeouts: { default: 3000, politica: 3000 } })
  ];
  for (const m of mods) {
    await m.onLoad({ logger, eventBus: bus, metrics: null });
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../modules', m.name, 'module.json'), 'utf8'));
    for (const s of manifest.subscribes || []) bus.subscribe(s.event, (ev) => m[s.handler](ev));
  }
  const porNombre = Object.fromEntries(mods.map((m) => [m.name, m]));
  return { bus, porNombre, mods };
}

const entrada = (over = {}) => ({
  request_id: `req-${Math.random().toString(36).slice(2, 8)}`,
  project_id: PROYECTO,
  conversacion: 'c-1',
  participante: 'ana',
  user_message: 'hola, ¿me pasas el estado del pedido?',
  message_id: 'm-1',
  estado_conversacion: 'ABIERTA',
  ahora: '2026-11-09T04:00:00.000Z',
  ...over
});

const publicados = (bus, ev) => bus.publicados.filter((p) => p.event === ev);

let ok = 0, ko = 0;
async function caso(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { ko++; console.log('  ✗ ' + nombre + '\n      ' + (e && e.message)); }
}

(async () => {
  console.log('admisión de conversaciones — costura real (6 módulos cableados)');

  // ── 1 · punta a punta: política + llave ⇒ ABRIR + relay_payload ─────────
  await caso('(1) definir política → emitir llave → entrada ⇒ ABRIR + relay_payload', async () => {
    const { bus, porNombre } = await cablear();

    // (a) la política la declara el CUSTODIO (una vez por proyecto)
    const declarada = await porNombre['politica-admision'].onPoliticaDefinirRequest({
      data: {
        request_id: 'req-pol-1',
        project_id: PROYECTO,
        actosPorEntrada: { ESCRIBIR: ['LEER', 'ESCRIBIR'], LEER: ['LEER'] },
        emisor: 'dueno',
        ahora: '2026-11-09T03:58:00.000Z'
      }
    });
    assert.strictEqual(declarada.status, 201);
    assert.strictEqual(declarada.data.politica.version, 1);

    // (b) el derecho de entrar lo emite el CUSTODIO de llaves
    const llave = await porNombre['gestor-llaves']._emitir({
      project_id: PROYECTO,
      conversacion: 'c-1',
      actos: ['LEER', 'ESCRIBIR'],
      emisor: 'dueno',
      forma: 'REFERENCIA_SECRETO',
      emisor_autorizado: true,
      hilo_existe: true,
      ahora: '2026-11-09T03:59:00.000Z'
    });
    assert.strictEqual(llave.status, 201);

    // (c) la entrada del chat — SIN política (la resuelve el coordinador)
    const r = await porNombre['coordinador-conversacion'].onEntradaRecibida({ data: entrada() });

    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.admitida, true);
    assert.deepStrictEqual(r.data.actos, ['LEER', 'ESCRIBIR']);
    assert.strictEqual(r.data.sesion.participante, 'ana');
    assert.strictEqual(r.data.sesion.conversacion, 'c-1');

    // el coordinador consultó la política al custodio (no la inventó)
    assert.strictEqual(publicados(bus, 'politica.consultar.request').length, 1);
    assert.strictEqual(publicados(bus, 'politica.consultar.request')[0].data.project_id, PROYECTO);

    // la puerta recibió la política VIGENTE
    const aLaPuerta = publicados(bus, 'conversacion.admitir.request')[0].data;
    assert.deepStrictEqual(aLaPuerta.politica.actosPorEntrada, { ESCRIBIR: ['LEER', 'ESCRIBIR'], LEER: ['LEER'] });
    assert.strictEqual(aLaPuerta.politica.emisor, 'dueno');

    // el payload que chat-io publicará como chat.message.saved
    const pase = r.data.relay_payload;
    assert.ok(pase, 'el coordinador entrega relay_payload');
    assert.strictEqual(pase.project_id, PROYECTO);
    assert.strictEqual(pase.conversation_id, 'c-1');
    assert.strictEqual(pase.user_message, 'hola, ¿me pasas el estado del pedido?');
    assert.strictEqual(pase.admitido, true);
    assert.strictEqual(pase.sesion.id, r.data.sesion.id);
    assert.deepStrictEqual(pase.decision, { decision: 'ABRIR', actos: ['LEER', 'ESCRIBIR'] });

    // dueño único del relay: el coordinador NO lo publica
    assert.strictEqual(publicados(bus, EVENTO_RELAY).length, 0);
  });

  // ── 2 · sin llave ⇒ RECHAZAR (el mensaje no pasa) ───────────────────────
  await caso('(2) con política pero SIN llave ⇒ RECHAZAR MOTIVO_SIN_LLAVE, 0 relay', async () => {
    const { bus, porNombre } = await cablear();
    await porNombre['politica-admision'].onPoliticaDefinirRequest({
      data: {
        request_id: 'req-pol-2',
        project_id: PROYECTO,
        actosPorEntrada: { ESCRIBIR: ['LEER', 'ESCRIBIR'] },
        emisor: 'dueno'
      }
    });

    const r = await porNombre['coordinador-conversacion'].onEntradaRecibida({
      data: entrada({ conversacion: 'c-sin-llave' })
    });

    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
    assert.strictEqual(r.error.details.motivo, 'MOTIVO_SIN_LLAVE');
    assert.strictEqual(r.error.details.paso, 'puerta');
    assert.strictEqual(r.data, undefined);
    assert.strictEqual(publicados(bus, EVENTO_RELAY).length, 0, 'sin llave el mensaje NO llega al LLM');
    assert.strictEqual(publicados(bus, 'sesion.resolver.request').length, 0, 'sin ABRIR no se ata sesión');

    const hecho = publicados(bus, 'conversacion.entrada_rechazada').pop().data;
    assert.strictEqual(hecho.motivo, 'MOTIVO_SIN_LLAVE');
    assert.strictEqual(hecho.paso, 'puerta');
    assert.strictEqual(hecho.referencia.conversacion, 'c-sin-llave');
  });

  // ── 3 · sin política ⇒ corte honesto antes de la puerta ────────────────
  await caso('(3) proyecto SIN política declarada ⇒ 422 politica_no_declarada, 0 llamadas a la puerta', async () => {
    const { bus, porNombre } = await cablear();   // nadie declaró política
    const r = await porNombre['coordinador-conversacion'].onEntradaRecibida({ data: entrada() });

    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.error.code, 'PRECONDITION_FAILED');
    assert.strictEqual(r.error.details.motivo, 'politica_no_declarada');
    assert.strictEqual(r.error.details.paso, 'politica');
    assert.strictEqual(r.error.details.detalle.causa, 'RESOURCE_NOT_FOUND',
      'la causa es el 404 literal del custodio, no un timeout');
    assert.strictEqual(publicados(bus, 'conversacion.admitir.request').length, 0, 'sin política no se llama a la puerta');
    assert.strictEqual(publicados(bus, EVENTO_RELAY).length, 0);
    // El custodio RESPONDE 404 (la ausencia es una respuesta, no un fallo de RPC).
    const consulta = publicados(bus, 'politica.consultar.response').pop().data;
    assert.strictEqual(consulta.status, 404);
    assert.strictEqual(consulta.error.code, 'RESOURCE_NOT_FOUND');
  });

  console.log(`\n  casos: ${ok}/${ok + ko}`);
  if (ko > 0) process.exit(1);
})();
