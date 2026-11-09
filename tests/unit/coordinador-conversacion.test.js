/**
 * Tests unitarios — `coordinador-conversacion` (C1–C3 · MICRO-AGENTE).
 *
 * Fija la SECUENCIA contra un bus mock que simula las 4 islas:
 *   (a) el orden es sobre.construir → sobre.validar → llave.vigentes → admitir
 *       → sesion.resolver → chat.message.saved (el paso al relay), y NADA más
 *   (b) RECHAZAR corta la cadena: no hay sesión y NO se publica el paso al relay
 *   (c) un `.failed` (real: sin request_id, como lo publican las islas) corta la
 *       cadena en su paso (fail-closed)
 *   (d) un timeout declarado también corta (fail-closed, 504) — nunca se inventa
 *       una respuesta ni se sigue adelante
 *   (e) el sobre incompleto va a cuarentena y no se llama ni a llaves
 *   (f) con los 4 módulos REALES cableados al bus, el payload de cada paso
 *       encaja con su contrato (integración de costura, no de forma)
 *
 * Ejecutar: node tests/unit/coordinador-conversacion.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const CoordinadorConversacion = require('../../modules/coordinador-conversacion');
const SobreConversacion = require('../../modules/sobre-conversacion');
const PuertaAdmision = require('../../modules/puerta-admision');
const AmarreSesion = require('../../modules/amarre-sesion');
const GestorLlaves = require('../../modules/gestor-llaves');

const logger = { info() {}, warn() {}, error() {}, debug() {} };
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
      for (const fn of [...(subs.get(ev) || [])]) await fn({ data });
    },
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, []);
      subs.get(ev).push(fn);
      return () => { const a = subs.get(ev) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
    },
    /** Simula una isla: al recibir `req` publica `res` correlado. */
    simular(req, res, cuerpo) {
      bus.subscribe(req, (ev) => {
        const d = ev?.data || ev;
        const out = typeof cuerpo === 'function' ? cuerpo(d) : cuerpo;
        if (out && out.__failed) {
          // las islas publican su .failed con _publicarEvento SIN request_id
          return bus.publish(res.replace(/\.response$/, '.failed'), out.__failed);
        }
        return bus.publish(res, { request_id: d.request_id, ...out });
      });
    }
  };
  return bus;
}

const entradaOK = () => ({
  request_id: 'req-entrada-1',
  project_id: 'sistema-de-conversaciones',
  conversacion: 'c-1',
  participante: 'ana',
  user_message: 'hola, ¿qué tal?',
  message_id: 'm-1',
  estado_conversacion: 'ABIERTA',
  politica: {
    actosPorEntrada: { ESCRIBIR: ['LEER', 'ESCRIBIR'] },
    actosPorEstado: { ABIERTA: ['LEER', 'ESCRIBIR'] }
  },
  ahora: '2026-11-09T04:00:00.000Z'
});

const SOBRE_CONSTRUIDO = {
  status: 200,
  data: {
    sobre: { proyecto: 'sistema-de-conversaciones', conversacion: 'c-1', participante: 'ana', mensaje: 'm-1', padre: 'NINGUNO', instante: '2026-11-09T04:00:00.000Z' },
    faltantes: [],
    estado: 'COMPLETO',
    definicion: { camposObligatorio: ['proyecto', 'conversacion', 'participante'] }
  }
};

const VEREDICTO_OK = {
  status: 200,
  data: { veredicto: { estado: 'COMPLETO', faltantes: [], camposPresentes: ['proyecto', 'conversacion', 'participante'], sobre: SOBRE_CONSTRUIDO.data.sobre } }
};

const LLAVE = { id: 'llave-1', conversacion: 'c-1', actos: ['LEER', 'ESCRIBIR'], caducaEn: 'POR_DECLARAR' };
const VIGENTES = { status: 200, data: { llaves: [LLAVE], total: 1, caducidad: 'POR_DECLARAR' } };
const ABRIR = { status: 200, data: { decision: 'ABRIR', actos: ['LEER', 'ESCRIBIR'], llaves: [{ id: 'llave-1', actos: ['LEER', 'ESCRIBIR'] }], base: { sobre: 'COMPLETO' } } };
const SESION = { status: 201, data: { sesion: { id: 'sesion-1', participante: 'ana', conversacion: 'c-1', estado: 'VIVA' }, reutilizada: false } };

/** Coordinador con las 4 islas simuladas; `traza` registra el orden real. */
async function montar({ over = {}, timeouts = {} } = {}) {
  const bus = busMock();
  const traza = [];
  const respuestas = {
    'sobre.construir.request': ['sobre.construir.response', SOBRE_CONSTRUIDO],
    'sobre.validar.request': ['sobre.validar.response', VEREDICTO_OK],
    'llave.vigentes.request': ['llave.vigentes.response', VIGENTES],
    // Default del mock: el proyecto NO ha declarado política (404 del custodio).
    'politica.consultar.request': ['politica.consultar.response', {
      status: 404,
      error: { code: 'RESOURCE_NOT_FOUND', message: 'El proyecto no ha declarado política de admisión' }
    }],
    'conversacion.admitir.request': ['conversacion.admitir.response', ABRIR],
    'sesion.resolver.request': ['sesion.resolver.response', SESION]
  };
  for (const [req, [res, cuerpo]] of Object.entries(respuestas)) {
    if (over[req] === 'silencio') { bus.subscribe(req, () => { traza.push(req); }); continue; }
    bus.simular(req, res, (d) => {
      traza.push(req);
      return typeof over[req] === 'function' ? over[req](d) : (over[req] || cuerpo);
    });
  }
  bus.subscribe(EVENTO_RELAY, () => traza.push(EVENTO_RELAY));

  const mod = new CoordinadorConversacion({ timeouts });
  await mod.onLoad({ logger, eventBus: bus, metrics: null });
  return { mod, bus, traza };
}

const ultimo = (bus, ev) => {
  const hits = bus.publicados.filter((p) => p.event === ev);
  return hits.length ? hits[hits.length - 1].data : null;
};

let ok = 0, ko = 0, pasosOrden = 0;
async function caso(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { ko++; console.log('  ✗ ' + nombre + '\n      ' + (e && e.message)); }
}

(async () => {
  console.log('coordinador-conversacion — la secuencia (C1–C3)');

  // ─── (a) orden completo ──────────────────────────────────────────────────
  await caso('(a) ABRIR: sobre→validar→llaves→puerta→sesión→relay, en ese orden', async () => {
    const { mod, bus, traza } = await montar();
    const r = await mod.onEntradaRecibida({ data: entradaOK() });

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.ok, true);
    assert.strictEqual(r.data.admitida, true);
    // UN SOLO DUEÑO DEL RELAY (v2): el coordinador NO publica chat.message.saved.
    // Entrega `relay_payload` y es chat-io quien lo publica (si no, el relay
    // razonaría dos veces por mensaje).
    assert.deepStrictEqual(traza, [
      'sobre.construir.request',
      'sobre.validar.request',
      'llave.vigentes.request',
      'conversacion.admitir.request',
      'sesion.resolver.request'
    ]);
    pasosOrden = traza.length;

    const resultado = ultimo(bus, 'conversacion.entrada_resultado');
    assert.strictEqual(resultado.status, 200);
    assert.strictEqual(resultado.request_id, 'req-entrada-1');
    assert.strictEqual(resultado.data.sesion.id, 'sesion-1');

    // El coordinador NO publica el relay: lo ENTREGA.
    assert.strictEqual(bus.publicados.filter((p) => p.event === EVENTO_RELAY).length, 0,
      'el coordinador NO debe publicar chat.message.saved (dueño único: chat-io)');

    const pase = resultado.data.relay_payload;
    assert.ok(pase, 'el coordinador debe entregar relay_payload');
    assert.strictEqual(pase.project_id, 'sistema-de-conversaciones');
    assert.strictEqual(pase.conversation_id, 'c-1');
    assert.strictEqual(pase.user_message, 'hola, ¿qué tal?');
    assert.strictEqual(pase.admitido, true);
    assert.strictEqual(pase.sesion.id, 'sesion-1');
    assert.strictEqual(pase.sobre.participante, 'ana');
  });

  // ─── (b) RECHAZAR corta la cadena ────────────────────────────────────────
  await caso('(b) RECHAZAR: no abre sesión y NO publica el paso al relay', async () => {
    const rechazo = { status: 200, data: { decision: 'RECHAZAR', motivo: 'MOTIVO_SIN_LLAVE', base: { estado: 'ABIERTA' } } };
    const { mod, bus, traza } = await montar({ over: { 'conversacion.admitir.request': rechazo } });
    const r = await mod.onEntradaRecibida({ data: entradaOK() });

    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
    assert.strictEqual(r.error.details.motivo, 'MOTIVO_SIN_LLAVE');
    assert.deepStrictEqual(traza, [
      'sobre.construir.request',
      'sobre.validar.request',
      'llave.vigentes.request',
      'conversacion.admitir.request'
    ]);
    assert.strictEqual(bus.publicados.filter((p) => p.event === EVENTO_RELAY).length, 0, 'el relay no debe ver el mensaje');
    assert.strictEqual(bus.publicados.filter((p) => p.event === 'sesion.resolver.request').length, 0, 'sin ABRIR no se ata sesión');

    const hecho = ultimo(bus, 'conversacion.entrada_rechazada');
    assert.strictEqual(hecho.motivo, 'MOTIVO_SIN_LLAVE');
    assert.strictEqual(hecho.paso, 'puerta');
  });

  // ─── (c) .failed corta la cadena (forma REAL, sin request_id) ────────────
  await caso('(c) sesion.resolver.failed (sin request_id, como lo emite la isla) detiene la cadena', async () => {
    const { mod, bus, traza } = await montar({
      over: { 'sesion.resolver.request': { __failed: { motivo: 'PARTICIPANTE_DESCONOCIDO' } } }
    });
    const r = await mod.onEntradaRecibida({ data: entradaOK() });

    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'UPSTREAM_UNREACHABLE');
    assert.strictEqual(r.error.details.paso, 'sesion');
    assert.strictEqual(r.error.details.causa, 'FAILED');
    assert.strictEqual(traza.includes(EVENTO_RELAY), false, 'un fallo de sesión NO puede llegar al LLM');
    assert.strictEqual(bus.publicados.filter((p) => p.event === EVENTO_RELAY).length, 0);
    const hecho = ultimo(bus, 'conversacion.entrada_rechazada');
    assert.strictEqual(hecho.motivo, 'SESION_NO_ATADA');
    assert.strictEqual(hecho.paso, 'sesion');
  });

  // ─── (d) timeout declarado ⇒ fail-closed ─────────────────────────────────
  await caso('(d) llave.vigentes sin respuesta ⇒ timeout (504) y no se pide la puerta', async () => {
    const { mod, bus, traza } = await montar({
      over: { 'llave.vigentes.request': 'silencio' },
      timeouts: { llaves: 40 }
    });
    const r = await mod.onEntradaRecibida({ data: entradaOK() });

    assert.strictEqual(r.status, 504);
    assert.strictEqual(r.error.code, 'UPSTREAM_TIMEOUT');
    assert.strictEqual(r.error.details.motivo, 'LLAVES_NO_HIDRATADAS');
    assert.deepStrictEqual(traza, ['sobre.construir.request', 'sobre.validar.request', 'llave.vigentes.request']);
    assert.strictEqual(bus.publicados.filter((p) => p.event === 'conversacion.admitir.request').length, 0);
    assert.strictEqual(bus.publicados.filter((p) => p.event === EVENTO_RELAY).length, 0);
  });

  // ─── (e) sobre incompleto ⇒ cuarentena, no se sigue ──────────────────────
  await caso('(e) sobre PARCIAL ⇒ cuarentena (sobre_incompleto) y cero llamadas a llaves', async () => {
    const parcial = {
      status: 200,
      data: { sobre: { proyecto: 'sistema-de-conversaciones', conversacion: 'c-1', participante: 'DESCONOCIDO', padre: 'NINGUNO' }, faltantes: ['participante'], estado: 'PARCIAL', definicion: { camposObligatorios: ['proyecto', 'conversacion', 'participante'] } }
    };
    const { mod, bus, traza } = await montar({ over: { 'sobre.construir.request': parcial } });
    const r = await mod.onEntradaRecibida({ data: entradaOK() });

    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.error.code, 'PRECONDITION_FAILED');
    assert.strictEqual(r.error.details.motivo, 'SOBRE_INCOMPLETO');
    assert.deepStrictEqual(traza, ['sobre.construir.request']);
    const cuarentena = ultimo(bus, 'conversacion.sobre_incompleto');
    assert.deepStrictEqual(cuarentena.faltantes, ['participante']);
    assert.strictEqual(bus.publicados.filter((p) => p.event === EVENTO_RELAY).length, 0);
  });

  // ─── (f) costura con las 4 islas REALES ──────────────────────────────────
  await caso('(f) con los 4 módulos reales cableados: ABRIR + sesión + paso al relay', async () => {
    const bus = busMock();
    const mods = [new SobreConversacion(), new GestorLlaves(), new PuertaAdmision(), new AmarreSesion(), new CoordinadorConversacion({ timeouts: { default: 2000 } })];
    for (const m of mods) {
      await m.onLoad({ logger, eventBus: bus, metrics: null });
      const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../modules', m.name, 'module.json'), 'utf8'));
      for (const s of manifest.subscribes || []) bus.subscribe(s.event, (ev) => m[s.handler](ev));
    }
    const gestor = mods[1];

    // una llave vigente de verdad, emitida por el custodio real
    const emitida = await gestor._emitir({
      project_id: 'sistema-de-conversaciones',
      conversacion: 'c-1',
      actos: ['LEER', 'ESCRIBIR'],
      emisor: 'dueno',
      forma: 'REFERENCIA_SECRETO',
      emisor_autorizado: true,
      hilo_existe: true,
      ahora: '2026-11-09T03:59:00.000Z'
    });
    assert.strictEqual(emitida.status, 201);

    const r = await mods[4].onEntradaRecibida({ data: entradaOK() });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.admitida, true);
    assert.strictEqual(r.data.sesion.participante, 'ana');
    assert.strictEqual(r.data.sesion.conversacion, 'c-1');

    // Dueño único del relay: el coordinador entrega, chat-io publica.
    assert.strictEqual(bus.publicados.filter((p) => p.event === EVENTO_RELAY).length, 0,
      'el coordinador NO publica chat.message.saved');
    const pase = r.data.relay_payload;
    assert.ok(pase, 'el coordinador entrega relay_payload con el sobre y la sesión');
    assert.strictEqual(pase.user_message, 'hola, ¿qué tal?');
    assert.strictEqual(pase.sesion.id, r.data.sesion.id);

    for (const m of mods) { try { await m.onUnload(); } catch (_) { /* limpieza */ } }
  });

  // ─── (g) sin política declarada ⇒ corta en politica_no_declarada ─────────
  await caso('(g) sin política declarada: corta en `politica_no_declarada`, 0 llamadas a la puerta, 0 mensajes', async () => {
    const { mod, bus, traza } = await montar({
      over: {
        'politica.consultar.request': {
          status: 404,
          error: { code: 'RESOURCE_NOT_FOUND', message: 'El proyecto no ha declarado política de admisión' }
        }
      }
    });
    const entrada = entradaOK();
    delete entrada.politica;                       // el chat no la manda: la resuelve el coordinador
    const r = await mod.onEntradaRecibida({ data: entrada });

    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.error.code, 'PRECONDITION_FAILED');
    assert.strictEqual(r.error.details.motivo, 'politica_no_declarada');
    assert.strictEqual(r.error.details.paso, 'politica');
    assert.strictEqual(bus.publicados.filter((p) => p.event === 'conversacion.admitir.request').length, 0,
      'sin política NO se llama a la puerta (no se inventa una política por defecto)');
    assert.strictEqual(bus.publicados.filter((p) => p.event === EVENTO_RELAY).length, 0,
      'sin política el mensaje NO puede llegar al LLM');
    assert.deepStrictEqual(traza, ['sobre.construir.request', 'sobre.validar.request', 'llave.vigentes.request', 'politica.consultar.request']);

    const hecho = ultimo(bus, 'conversacion.entrada_rechazada');
    assert.strictEqual(hecho.motivo, 'politica_no_declarada');
    assert.strictEqual(hecho.paso, 'politica');
    assert.strictEqual(mod.politicas.size, 0, 'un 404 NO se cachea: declarar surte efecto en el siguiente mensaje');
  });

  // ─── (h) política consultada ⇒ llega a la puerta y ABRE ──────────────────
  await caso('(h) con política declarada (consultada al custodio): llega a la puerta y ABRE', async () => {
    const POLITICA = {
      actosPorEntrada: { ESCRIBIR: ['LEER', 'ESCRIBIR'] },
      actosPorEstado: { ABIERTA: ['LEER', 'ESCRIBIR'] },
      estadosQueAdmiten: ['ABIERTA', 'ACTIVA'],
      emisor: 'dueno',
      version: 1
    };
    const { mod, bus, traza } = await montar({
      over: { 'politica.consultar.request': { status: 200, data: { politica: POLITICA } } }
    });
    const entrada = entradaOK();
    delete entrada.politica;
    const r = await mod.onEntradaRecibida({ data: entrada });

    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.admitida, true);
    assert.deepStrictEqual(traza, [
      'sobre.construir.request',
      'sobre.validar.request',
      'llave.vigentes.request',
      'politica.consultar.request',
      'conversacion.admitir.request',
      'sesion.resolver.request'
    ]);
    // La puerta recibió LA política consultada (hidratada por valor, es isla).
    const aLaPuerta = bus.publicados.find((p) => p.event === 'conversacion.admitir.request');
    assert.deepStrictEqual(aLaPuerta.data.politica, POLITICA);
    assert.ok(r.data.relay_payload, 'ABRIR entrega relay_payload');
    assert.strictEqual(r.data.relay_payload.admitido, true);
  });

  // ─── (i) la caché evita pedir la política en cada mensaje (TTL 60 s) ─────
  await caso('(i) dos entradas del MISMO proyecto ⇒ una sola consulta de política (caché TTL)', async () => {
    const POLITICA = {
      actosPorEntrada: { ESCRIBIR: ['LEER', 'ESCRIBIR'] },
      actosPorEstado: { ABIERTA: ['LEER', 'ESCRIBIR'] }
    };
    const { mod, bus } = await montar({
      over: { 'politica.consultar.request': { status: 200, data: { politica: POLITICA } } }
    });
    const primera = entradaOK(); delete primera.politica;
    const segunda = entradaOK(); delete segunda.politica;

    assert.strictEqual((await mod.onEntradaRecibida({ data: primera })).status, 200);
    assert.strictEqual((await mod.onEntradaRecibida({ data: segunda })).status, 200);
    assert.strictEqual(bus.publicados.filter((p) => p.event === 'politica.consultar.request').length, 1,
      'la segunda entrada usa la caché (TTL 60 s por proyecto)');
    assert.strictEqual(mod.politicaTTL, 60000);
  });

  // ─── recuento ────────────────────────────────────────────────────────────
  console.log(`\n  secuencia verificada: ${pasosOrden} pasos (sobre→validar→llaves→puerta→sesión→relay)`);
  console.log(`  casos: ${ok}/${ok + ko}`);
  if (ko > 0) process.exit(1);
})();
