/**
 * Tests unitarios — `puerta-admision` (P03 · REFLEJO).
 *
 * Fija el contrato de la hoja contra un bus mock:
 *   · I6 — misma ctx ⇒ decisión idéntica byte a byte
 *   · P2 — toda decisión lleva base; si rechaza, motivo
 *   · I7 — llave {LEER} + acto ESCRIBIR ⇒ LLAVE_NO_CUBRE_ACTO
 *   · O12 — sin política declarada NO se decide: POLITICA_NO_DECLARADA
 *   · I1/I2 — participante DESCONOCIDO y proyecto ajeno se rechazan
 *   · P3 — la puerta no emite hechos: sólo su .response
 *
 * Ejecutar: node tests/unit/puerta-admision.test.js
 */

'use strict';

const assert = require('assert');
const PuertaAdmision = require('../../modules/puerta-admision');

function busMock() {
  const publicados = [];
  const subs = new Map();
  return {
    publicados,
    async publish(ev, data) {
      publicados.push({ event: ev, data });
      for (const fn of (subs.get(ev) || [])) await fn({ data });
    },
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, []);
      subs.get(ev).push(fn);
      return () => { const a = subs.get(ev) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
    }
  };
}

const logger = { info() {}, warn() {}, error() {}, debug() {} };

async function modulo() {
  const bus = busMock();
  const mod = new PuertaAdmision();
  await mod.onLoad({ logger, eventBus: bus, metrics: null });
  return { mod, bus };
}

// ctx canónico válido: sobre COMPLETO, hilo ACTIVA, sujeto conocido, llave ESCRIBIR.
function ctx(over = {}) {
  return {
    veredicto: { estado: 'COMPLETO', faltantes: [], camposPresentes: ['proyecto', 'conversacion', 'participante'] },
    proyecto: { idCanonico: 'bocaos' },
    conversacion: { id: 'c-1', proyecto: 'bocaos', estado: 'ACTIVA' },
    participante: { id: 'ana' },
    acto: 'MENSAJE',
    politica: {
      actosPorEntrada: { MENSAJE: ['ESCRIBIR'] },
      actosPorEstado: { ACTIVA: ['ESCRIBIR', 'LEER'], ARCHIVADA: ['LEER'] }
    },
    llaves: [{ id: 'll-1', conversacion: 'c-1', actos: ['ESCRIBIR'], caducaEn: 'POR_DECLARAR' }],
    ahora: '2026-11-09T04:00:00.000Z',
    ...over
  };
}

let ok = 0, ko = 0;
async function caso(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { ko++; console.log('  ✗ ' + nombre + '\n      ' + (e && e.message)); }
}

(async () => {
  console.log('puerta-admision — veredicto de entrada (P03)');

  // ─── I6: determinismo ────────────────────────────────────────────────────
  await caso('misma ctx dos veces ⇒ decisión idéntica byte a byte (I6)', async () => {
    const { mod } = await modulo();
    const a = await mod._decidir(ctx());
    const b = await mod._decidir(ctx());
    assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
    assert.strictEqual(a.data.decision, 'ABRIR');
  });

  await caso('ABRIR devuelve actos + llaves usadas + base (P2)', async () => {
    const { mod } = await modulo();
    const r = await mod._decidir(ctx());
    assert.deepStrictEqual(r.data.actos, ['ESCRIBIR']);
    assert.deepStrictEqual(r.data.llaves.map((l) => l.id), ['ll-1']);
    assert.strictEqual(r.data.base.proyecto, 'bocaos');
    assert.strictEqual(r.data.base.conversacion, 'c-1');
    assert.strictEqual(r.data.base.participante, 'ana');
    assert.strictEqual(r.data.base.ahora, '2026-11-09T04:00:00.000Z');
  });

  // ─── I7: LEER ≠ ESCRIBIR ─────────────────────────────────────────────────
  await caso('llave {LEER} + acto ESCRIBIR ⇒ LLAVE_NO_CUBRE_ACTO (I7)', async () => {
    const { mod } = await modulo();
    const r = await mod._decidir(ctx({ llaves: [{ id: 'll-leer', conversacion: 'c-1', actos: ['LEER'] }] }));
    assert.strictEqual(r.data.decision, 'RECHAZAR');
    assert.strictEqual(r.data.motivo, 'MOTIVO_LLAVE_NO_CUBRE_ACTO');
    assert.strictEqual(r.data.detalle.acto, 'ESCRIBIR');
    assert.ok(r.data.base, 'toda decisión lleva base');
  });

  await caso('sin llaves ⇒ SIN_LLAVE', async () => {
    const { mod } = await modulo();
    const r = await mod._decidir(ctx({ llaves: [] }));
    assert.strictEqual(r.data.motivo, 'MOTIVO_SIN_LLAVE');
  });

  await caso('llave caducada ⇒ no cubre (y sin `ahora` tampoco)', async () => {
    const { mod } = await modulo();
    const caducada = ctx({
      ahora: '2026-11-09T06:00:00.000Z',
      llaves: [{ id: 'll-1', conversacion: 'c-1', actos: ['ESCRIBIR'], caducaEn: '2026-11-09T05:00:00.000Z' }]
    });
    const r = await mod._decidir(caducada);
    assert.strictEqual(r.data.motivo, 'MOTIVO_LLAVE_NO_CUBRE_ACTO');
    const sinAhora = ctx({
      ahora: null,
      llaves: [{ id: 'll-1', conversacion: 'c-1', actos: ['ESCRIBIR'], caducaEn: '2026-11-09T05:00:00.000Z' }]
    });
    assert.strictEqual((await mod._decidir(sinAhora)).data.motivo, 'MOTIVO_LLAVE_NO_CUBRE_ACTO');
  });

  await caso('llave revocada ⇒ no cubre', async () => {
    const { mod } = await modulo();
    const r = await mod._decidir(ctx({
      llaves: [{ id: 'll-1', conversacion: 'c-1', actos: ['ESCRIBIR'], revocadaEn: '2026-11-08T10:00:00.000Z' }]
    }));
    assert.strictEqual(r.data.motivo, 'MOTIVO_LLAVE_NO_CUBRE_ACTO');
  });

  // ─── O12: la política es dato ────────────────────────────────────────────
  await caso('ctx sin política ⇒ POLITICA_NO_DECLARADA (O12, no se inventa)', async () => {
    const { mod } = await modulo();
    const r = await mod._decidir(ctx({ politica: 'POR_DECLARAR' }));
    assert.strictEqual(r.data.motivo, 'MOTIVO_POLITICA_NO_DECLARADA');
    const r2 = await mod._decidir(ctx({ politica: { actosPorEstado: { ACTIVA: ['ESCRIBIR'] } } }));
    assert.strictEqual(r2.data.motivo, 'MOTIVO_POLITICA_NO_DECLARADA');
  });

  await caso('estado del hilo que no admite el acto ⇒ ESTADO_NO_ADMITE', async () => {
    const { mod } = await modulo();
    const r = await mod._decidir(ctx({
      conversacion: { id: 'c-1', proyecto: 'bocaos', estado: 'ARCHIVADA' }
    }));
    assert.strictEqual(r.data.motivo, 'MOTIVO_ESTADO_NO_ADMITE');
  });

  // ─── I1, I2, el sobre ────────────────────────────────────────────────────
  await caso('participante DESCONOCIDO ⇒ PARTICIPANTE_DESCONOCIDO (I1)', async () => {
    const { mod } = await modulo();
    const r = await mod._decidir(ctx({ participante: 'DESCONOCIDO' }));
    assert.strictEqual(r.data.motivo, 'MOTIVO_PARTICIPANTE_DESCONOCIDO');
  });

  await caso('hilo de otro proyecto ⇒ FUERA_DE_AMBITO (I2)', async () => {
    const { mod } = await modulo();
    const r = await mod._decidir(ctx({ conversacion: { id: 'c-9', proyecto: 'the-pirate', estado: 'ACTIVA' } }));
    assert.strictEqual(r.data.motivo, 'MOTIVO_FUERA_DE_AMBITO');
  });

  await caso('sobre PARCIAL ⇒ SOBRE_INCOMPLETO con faltantes nombrados', async () => {
    const { mod } = await modulo();
    const r = await mod._decidir(ctx({ veredicto: { estado: 'PARCIAL', faltantes: ['participante'] } }));
    assert.strictEqual(r.data.motivo, 'MOTIVO_SOBRE_INCOMPLETO');
    assert.deepStrictEqual(r.data.detalle.faltantes, ['participante']);
  });

  await caso('proyecto NO_RESUELVE / conversación NINGUNA ⇒ sus motivos', async () => {
    const { mod } = await modulo();
    assert.strictEqual((await mod._decidir(ctx({ proyecto: 'NO_RESUELVE' }))).data.motivo, 'MOTIVO_PROYECTO_NO_RESUELVE');
    assert.strictEqual((await mod._decidir(ctx({ conversacion: 'NINGUNA' }))).data.motivo, 'MOTIVO_CONVERSACION_NO_EXISTE');
  });

  // ─── P3: la puerta no emite hechos ───────────────────────────────────────
  await caso('decidir no publica ningún hecho: sólo su .response (P3)', async () => {
    const { mod, bus } = await modulo();
    await mod.onAdmitirRequest({ data: { request_id: 'req-1', ...ctx() } });
    const eventos = bus.publicados.map((p) => p.event);
    assert.deepStrictEqual(eventos, ['conversacion.admitir.response']);
    assert.strictEqual(bus.publicados[0].data.request_id, 'req-1');
    assert.strictEqual(bus.publicados[0].data.data.decision, 'ABRIR');
  });

  await caso('ctx sin veredicto ⇒ 400 INVALID_INPUT + conversacion.admitir.failed', async () => {
    const { mod, bus } = await modulo();
    const r = await mod.onAdmitirRequest({ data: { request_id: 'req-2', proyecto: { idCanonico: 'bocaos' } } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    const failed = bus.publicados.find((p) => p.event === 'conversacion.admitir.failed');
    assert.ok(failed, 'no se publicó conversacion.admitir.failed');
    assert.strictEqual(failed.data.motivo, 'CONTEXTO_SIN_VEREDICTO');
  });

  console.log(`\n${ok} pasos OK, ${ko} fallos (${ok + ko} total)`);
  process.exit(ko === 0 ? 0 : 1);
})();
