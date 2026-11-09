/**
 * Tests unitarios — `sobre-conversacion` (P01 · REFLEJO).
 *
 * Fija el contrato de la hoja contra un bus mock (sin core, sin bus real):
 *   · S1 — lo ausente queda DESCONOCIDO y sale nombrado en faltantes[]
 *   · S2 — conCampos() devuelve OTRO objeto: el original no muta
 *   · S3 — el sobre sólo identifica; no se completan campos por contenido
 *   · D1/O3 — sin definición declarada NO se valida (POR_DECLARAR)
 *   · el par .response/.failed se publica correlado por request_id
 *
 * Ejecutar: node tests/unit/sobre-conversacion.test.js
 */

'use strict';

const assert = require('assert');
const SobreConversacion = require('../../modules/sobre-conversacion');

// Bus mock: registra TODO lo publicado y permite request/response síncrono.
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

function evento(bus, nombre) {
  const hits = bus.publicados.filter((p) => p.event === nombre);
  return hits.length ? hits[hits.length - 1].data : null;
}

const logger = { info() {}, warn() {}, error() {}, debug() {} };

async function modulo() {
  const bus = busMock();
  const mod = new SobreConversacion();
  await mod.onLoad({ logger, eventBus: bus, metrics: null });
  return { mod, bus };
}

let ok = 0, ko = 0;
async function caso(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { ko++; console.log('  ✗ ' + nombre + '\n      ' + (e && e.message)); }
}

(async () => {
  console.log('sobre-conversacion — contrato del sobre (P01)');

  // ─── S1: construir no completa ────────────────────────────────────────────
  await caso('sobre sin participante → PARCIAL con faltantes:["participante"] (S1)', async () => {
    const { mod } = await modulo();
    const r = await mod._construir({ declaracion: { project_id: 'bocaos', conversation_id: 'c-1' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.estado, 'PARCIAL');
    assert.deepStrictEqual(r.data.faltantes, ['participante']);
    assert.strictEqual(r.data.sobre.participante, 'DESCONOCIDO');
    assert.strictEqual(r.data.sobre.padre, 'NINGUNO');
  });

  await caso('basura ({}) → AUSENTE, no lanza (funciona con basura)', async () => {
    const { mod } = await modulo();
    const r = await mod._construir({ declaracion: {} });
    assert.strictEqual(r.data.estado, 'AUSENTE');
  });

  await caso('sobre completo (proyecto+conversacion+participante) → COMPLETO', async () => {
    const { mod } = await modulo();
    const r = await mod._construir({
      declaracion: { proyecto: 'bocaos', conversacion: 'c-1', participante: 'ana' }
    });
    assert.strictEqual(r.data.estado, 'COMPLETO');
    assert.deepStrictEqual(r.data.faltantes, []);
    assert.strictEqual(mod._es_completo(r.data.sobre, r.data.definicion), true);
  });

  // ─── S2: conCampos devuelve OTRO objeto ───────────────────────────────────
  await caso('conCampos() devuelve otro objeto — el original NO muta (S2)', async () => {
    const { mod } = await modulo();
    const declaracion = { proyecto: 'bocaos', conversacion: 'c-1' };
    const primero = await mod._construir({ declaracion });
    const segundo = await mod._construir({ declaracion, nuevos: { participante: 'ana' } });
    assert.notStrictEqual(segundo.data.sobre, primero.data.sobre);
    assert.strictEqual(primero.data.sobre.participante, 'DESCONOCIDO');
    assert.strictEqual(segundo.data.sobre.participante, 'ana');
    assert.strictEqual(segundo.data.estado, 'COMPLETO');
    // la declaración de entrada tampoco se toca
    assert.deepStrictEqual(declaracion, { proyecto: 'bocaos', conversacion: 'c-1' });
  });

  // ─── D1/O3: sin definición declarada no se valida ────────────────────────
  await caso('definición vacía → POR_DECLARAR (no inventa la lista, O3)', async () => {
    const { mod } = await modulo();
    const r = await mod._validar({
      sobre: { proyecto: 'bocaos', conversacion: 'c-1' },
      definicion: { camposObligatorios: [] }
    });
    assert.strictEqual(r.data.veredicto.estado, 'POR_DECLARAR');
    assert.deepStrictEqual(r.data.veredicto.faltantes, []);
  });

  // ─── cubreA ──────────────────────────────────────────────────────────────
  await caso('cubreA: mismo proyecto+hilo sí; otro hilo no', async () => {
    const { mod } = await modulo();
    const a = { proyecto: 'bocaos', conversacion: 'c-1' };
    assert.strictEqual(mod._cubre_a(a, { proyecto: 'bocaos', conversacion: 'c-1' }), true);
    assert.strictEqual(mod._cubre_a(a, { proyecto: 'bocaos', conversacion: 'c-2' }), false);
    assert.strictEqual(mod._cubre_a(a, { proyecto: 'the-pirate', conversacion: 'c-1' }), false);
  });

  // ─── El contrato del bus ─────────────────────────────────────────────────
  await caso('sobre.validar.request → sobre.validar.response correlada por request_id', async () => {
    const { mod, bus } = await modulo();
    await mod.onValidarRequest({
      data: {
        request_id: 'req-1',
        sobre: { proyecto: 'bocaos', conversacion: 'c-1', participante: 'ana' }
      }
    });
    const resp = evento(bus, 'sobre.validar.response');
    assert.ok(resp, 'no se publicó sobre.validar.response');
    assert.strictEqual(resp.request_id, 'req-1');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.veredicto.estado, 'COMPLETO');
    assert.deepStrictEqual(resp.data.veredicto.camposPresentes.sort(), ['conversacion', 'participante', 'proyecto']);
  });

  await caso('validar sin sobre → 400 INVALID_INPUT + sobre.validar.failed (no timeout)', async () => {
    const { mod, bus } = await modulo();
    const r = await mod.onValidarRequest({ data: { request_id: 'req-2' } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    const failed = evento(bus, 'sobre.validar.failed');
    assert.ok(failed, 'no se publicó sobre.validar.failed');
    assert.strictEqual(failed.motivo, 'SOBRE_AUSENTE');
  });

  await caso('definicion.request → response con la definición declarada en context.json', async () => {
    const { mod, bus } = await modulo();
    await mod.onDefinicionRequest({ data: { request_id: 'req-3' } });
    const resp = evento(bus, 'sobre.definicion.response');
    assert.ok(resp);
    assert.deepStrictEqual(resp.data.definicion.camposObligatorios, ['proyecto', 'conversacion', 'participante']);
    assert.strictEqual(resp.data.fuente, 'context.json');
  });

  await caso('cambio de definición declarado → hecho sobre.definicion_cambiada', async () => {
    const { mod, bus } = await modulo();
    await mod.onDefinicionRequest({ data: { request_id: 'req-4', camposObligatorios: ['proyecto', 'conversacion'], declarar: true } });
    const hecho = evento(bus, 'sobre.definicion_cambiada');
    assert.ok(hecho, 'no se publicó sobre.definicion_cambiada');
    assert.deepStrictEqual(hecho.despues, ['proyecto', 'conversacion']);
    assert.deepStrictEqual(hecho.antes, ['proyecto', 'conversacion', 'participante']);
    const r = await mod._construir({ declaracion: { proyecto: 'bocaos', conversacion: 'c-1' } });
    assert.strictEqual(r.data.estado, 'COMPLETO', 'la nueva definición debe regir');
  });

  console.log(`\n${ok} pasos OK, ${ko} fallos (${ok + ko} total)`);
  process.exit(ko === 0 ? 0 : 1);
})();
