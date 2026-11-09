/**
 * Tests unitarios — `amarre-sesion` (P08 · CUSTODIO).
 *
 * Fija el contrato de la hoja contra un bus mock (fs simulado):
 *   · I4 — resolver(A,c) y resolver(B,c) dan DOS ids distintos
 *   · SS1 — la clave es el par: resolver dos veces el mismo par devuelve la VIVA
 *   · I5 — cerrar cierra SÓLO la sesión: no publica ningún evento de conversación
 *   · participante DESCONOCIDO ⇒ rechazo (nadie tiene sesión anónima)
 *   · huerfanas exige el umbral explícito (POR_DECLARAR no se estima)
 *   · el snapshot por proyecto se escribe y se restaura
 *
 * Ejecutar: node tests/unit/amarre-sesion.test.js
 */

'use strict';

const assert = require('assert');
const AmarreSesion = require('../../modules/amarre-sesion');

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
      for (const fn of (subs.get(ev) || [])) await fn({ data });
    },
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, []);
      subs.get(ev).push(fn);
      return () => { const a = subs.get(ev) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
    }
  };
  return bus;
}

const logger = { info() {}, warn() {}, error() {}, debug() {} };

async function modulo() {
  const bus = busMock();
  const mod = new AmarreSesion();
  await mod.onLoad({ logger, eventBus: bus, metrics: null });
  return { mod, bus };
}

let ok = 0, ko = 0;
async function caso(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { ko++; console.log('  ✗ ' + nombre + '\n      ' + (e && e.message)); }
}

(async () => {
  console.log('amarre-sesion — el par (participante, conversación) (P08)');

  // ─── I4: dos participantes, dos sesiones ────────────────────────────────
  await caso('resolver(A,c) y resolver(B,c) ⇒ DOS ids distintos (I4)', async () => {
    const { mod, bus } = await modulo();
    const a = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1', ahora: '2026-11-09T04:00:00.000Z' });
    const b = await mod._resolver({ project_id: 'bocaos', participante: 'luis', conversacion: 'c-1', ahora: '2026-11-09T04:00:00.000Z' });
    assert.strictEqual(a.status, 201);
    assert.strictEqual(b.status, 201);
    assert.notStrictEqual(a.data.sesion.id, b.data.sesion.id);
    assert.strictEqual(mod.sesiones.size, 2);
    assert.strictEqual(bus.publicados.filter((p) => p.event === 'sesion.abierta').length, 2);
  });

  await caso('el mismo par dos veces ⇒ la MISMA sesión viva (SS1), no una segunda', async () => {
    const { mod } = await modulo();
    const a = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' });
    const b = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' });
    assert.strictEqual(a.data.sesion.id, b.data.sesion.id);
    assert.strictEqual(b.data.reutilizada, true);
    assert.strictEqual(mod.sesiones.size, 1);
  });

  await caso('el mismo participante en OTRA conversación ⇒ otra sesión (AS2)', async () => {
    const { mod } = await modulo();
    const a = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' });
    const b = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-2' });
    assert.notStrictEqual(a.data.sesion.id, b.data.sesion.id);
    assert.strictEqual(mod.sesiones.size, 2);
  });

  // ─── Nadie entra anónimo ─────────────────────────────────────────────────
  await caso('resolver(DESCONOCIDO,c) ⇒ rechazo + sesion.resolver.failed', async () => {
    const { mod, bus } = await modulo();
    const r = await mod._resolver({ project_id: 'bocaos', participante: 'DESCONOCIDO', conversacion: 'c-1' });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.details.motivo, 'PARTICIPANTE_DESCONOCIDO');
    const failed = bus.publicados.find((p) => p.event === 'sesion.resolver.failed');
    assert.ok(failed, 'no se publicó sesion.resolver.failed');
    assert.strictEqual(mod.sesiones.size, 0, 'no se abrió ninguna sesión');
  });

  await caso('resolver sin conversación ⇒ 400 (la sesión se ata a UN hilo)', async () => {
    const { mod } = await modulo();
    const r = await mod._resolver({ project_id: 'bocaos', participante: 'ana' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(mod.sesiones.size, 0);
  });

  // ─── I5: cerrar NO toca la conversación ─────────────────────────────────
  await caso('cerrar ⇒ CERRADA + sesion.cerrada, y NINGÚN evento de conversación (I5)', async () => {
    const { mod, bus } = await modulo();
    const a = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' });
    const r = await mod._cerrar({ id: a.data.sesion.id, motivo: 'SE_FUE', ahora: '2026-11-09T05:00:00.000Z' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.sesion.estado, 'CERRADA');
    assert.strictEqual(r.data.sesion.cerradaEn, '2026-11-09T05:00:00.000Z');
    assert.ok(bus.publicados.some((p) => p.event === 'sesion.cerrada'));
    const eventosConversacion = bus.publicados.filter((p) => /^conversacion\./.test(p.event));
    assert.deepStrictEqual(eventosConversacion, [], 'cerrar sesión no puede archivar/cerrar el hilo');
    // la sesión cerrada NO se borra: queda en el histórico del custodio
    assert.strictEqual(mod.sesiones.size, 1);
    assert.strictEqual([...mod.sesiones.values()][0].estado, 'CERRADA');
  });

  await caso('tras cerrar, el par puede abrir una sesión NUEVA (el hilo sigue vivo)', async () => {
    const { mod } = await modulo();
    const a = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' });
    await mod._cerrar({ id: a.data.sesion.id, motivo: 'SE_FUE' });
    const b = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' });
    assert.notStrictEqual(a.data.sesion.id, b.data.sesion.id);
    assert.strictEqual(b.status, 201);
    assert.strictEqual(b.data.sesion.estado, 'VIVA');
  });

  await caso('cerrar dos veces ⇒ 200 idempotente, sin duplicar', async () => {
    const { mod } = await modulo();
    const a = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' });
    await mod._cerrar({ id: a.data.sesion.id });
    const r = await mod._cerrar({ id: a.data.sesion.id });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.ya_cerrada, true);
    assert.strictEqual(mod.sesiones.size, 1);
  });

  // ─── Señal de vida y huérfanas ───────────────────────────────────────────
  await caso('senal actualiza ultimaSenal', async () => {
    const { mod } = await modulo();
    const a = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1', ahora: '2026-11-09T04:00:00.000Z' });
    const r = await mod._senal({ id: a.data.sesion.id, ahora: '2026-11-09T04:30:00.000Z' });
    assert.strictEqual(r.data.sesion.ultimaSenal, '2026-11-09T04:30:00.000Z');
  });

  await caso('huerfanas sin umbral ⇒ 400 (POR_DECLARAR no se estima)', async () => {
    const { mod } = await modulo();
    const r = await mod._huerfanas({});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.motivo, 'UMBRAL_POR_DECLARAR');
  });

  await caso('huerfanas con umbral ⇒ detecta y publica sesion.huerfana_detectada', async () => {
    const { mod, bus } = await modulo();
    await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1', ahora: '2026-11-09T04:00:00.000Z' });
    await mod._resolver({ project_id: 'bocaos', participante: 'luis', conversacion: 'c-1', ahora: '2026-11-09T04:59:00.000Z' });
    const r = await mod._huerfanas({ project_id: 'bocaos', umbral_ms: 30 * 60 * 1000, ahora: '2026-11-09T05:00:00.000Z' });
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.sesiones[0].participante, 'ana');
    assert.strictEqual(bus.publicados.filter((p) => p.event === 'sesion.huerfana_detectada').length, 1);
  });

  // ─── Persistencia ────────────────────────────────────────────────────────
  await caso('snapshot por proyecto en /conversaciones/sesiones.json', async () => {
    const { mod, bus } = await modulo();
    await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' });
    await mod._persist.flush();
    const escrito = JSON.parse(bus.fsFiles.get('bocaos::/conversaciones/sesiones.json'));
    assert.strictEqual(escrito.sesiones.length, 1);
    assert.strictEqual(escrito.sesiones[0].participante, 'ana');
    // otro proyecto escribe SU fichero: el de bocaos no se contamina
    await mod._resolver({ project_id: 'the-pirate', participante: 'luis', conversacion: 'c-7' });
    await mod._persist.flush();
    const pirata = JSON.parse(bus.fsFiles.get('the-pirate::/conversaciones/sesiones.json'));
    assert.strictEqual(pirata.sesiones.length, 1);
    assert.strictEqual(pirata.sesiones[0].participante, 'luis');
    assert.strictEqual(
      JSON.parse(bus.fsFiles.get('bocaos::/conversaciones/sesiones.json')).sesiones.length, 1,
      'las sesiones de bocaos no se mezclan con las de otro proyecto'
    );
  });

  await caso('project.activated restaura las sesiones del proyecto', async () => {
    const { mod, bus } = await modulo();
    const a = await mod._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' });
    await mod._persist.flush();
    const mod2 = new AmarreSesion();
    await mod2.onLoad({ logger, eventBus: bus, metrics: null });
    await mod2.onProjectActivated({ data: { project_id: 'bocaos' } });
    assert.strictEqual(mod2.sesiones.size, 1);
    const misma = await mod2._resolver({ project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' });
    assert.strictEqual(misma.data.sesion.id, a.data.sesion.id, 'la sesión viva sobrevive al reinicio');
    assert.strictEqual(misma.data.reutilizada, true);
  });

  // ─── Contrato del bus ────────────────────────────────────────────────────
  await caso('sesion.resolver.request → response correlada por request_id', async () => {
    const { mod, bus } = await modulo();
    await mod.onSesionResolverRequest({ data: { request_id: 'req-1', project_id: 'bocaos', participante: 'ana', conversacion: 'c-1' } });
    const resp = bus.publicados.find((p) => p.event === 'sesion.resolver.response');
    assert.ok(resp, 'no se publicó sesion.resolver.response');
    assert.strictEqual(resp.data.request_id, 'req-1');
    assert.strictEqual(resp.data.status, 201);
    assert.strictEqual(resp.data.data.sesion.participante, 'ana');
  });

  console.log(`\n${ok} pasos OK, ${ko} fallos (${ok + ko} total)`);
  process.exit(ko === 0 ? 0 : 1);
})();
