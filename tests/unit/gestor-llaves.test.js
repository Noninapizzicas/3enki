/**
 * Tests unitarios — `gestor-llaves` (P07 · CUSTODIO).
 *
 * Fija el contrato de la hoja contra un bus mock (fs simulado):
 *   · emitir sin forma declarada ⇒ 409 + decision.solicitada y CERO asientos
 *   · emitir + vigentes ⇒ 1 llave; revocar ⇒ vigentes vacío y 2 asientos (L1)
 *   · la llave guarda la REFERENCIA al secreto (HERMES_API_KEY), nunca su valor
 *   · emisor sin autorización declarada ⇒ 403 + decision.solicitada, cero asientos
 *   · el ledger sólo crece (nada de UPDATE/DELETE) y se persiste por proyecto
 *
 * Ejecutar: node tests/unit/gestor-llaves.test.js
 */

'use strict';

const assert = require('assert');
const fsSync = require('fs');
const path = require('path');
const GestorLlaves = require('../../modules/gestor-llaves');

// Bus mock con fs simulado: fs.write.request deja el contenido inspeccionable.
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
  const mod = new GestorLlaves();
  await mod.onLoad({ logger, eventBus: bus, metrics: null });
  return { mod, bus };
}

const orden = (over = {}) => ({
  request_id: 'req-emitir',
  project_id: 'bocaos',
  conversacion: 'c-1',
  actos: ['ESCRIBIR'],
  emisor: 'dueno',
  forma: 'REFERENCIA_SECRETO',
  emisor_autorizado: true,
  hilo_existe: true,
  ahora: '2026-11-09T04:00:00.000Z',
  ...over
});

let ok = 0, ko = 0;
async function caso(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { ko++; console.log('  ✗ ' + nombre + '\n      ' + (e && e.message)); }
}

(async () => {
  console.log('gestor-llaves — ledger sólo-añadir de llaves (P07)');

  // ─── El bloqueo honesto: sin forma declarada no hay fila ────────────────
  await caso('emitir sin forma declarada ⇒ 409 + decision.solicitada y CERO asientos', async () => {
    const { mod, bus } = await modulo();
    const r = await mod._emitir(orden({ forma: 'POR_DECLARAR' }));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'DECISION_REQUERIDA');
    assert.strictEqual(r.error.details.tipo, 'tipo_de_llave');
    const dec = bus.publicados.find((p) => p.event === 'decision.solicitada');
    assert.ok(dec, 'no se publicó decision.solicitada');
    assert.strictEqual(dec.data.solicitud.tipo, 'tipo_de_llave');
    assert.strictEqual(mod.ledger.size, 0, 'no debe haber ningún asiento');
    assert.strictEqual(bus.fsFiles.size, 0, 'no debe haberse escrito nada en disco');
  });

  await caso('emisor no autorizado ⇒ 403 + decision.solicitada, cero asientos', async () => {
    const { mod, bus } = await modulo();
    const r = await mod._emitir(orden({ emisor_autorizado: false }));
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.details.motivo, 'EMISOR_NO_AUTORIZADO');
    assert.ok(bus.publicados.some((p) => p.event === 'decision.solicitada'));
    assert.strictEqual(mod.ledger.size, 0);
  });

  await caso('autorización POR_DECLARAR (no declarada) ⇒ 403, no se asume permiso', async () => {
    const { mod } = await modulo();
    const r = await mod._emitir(orden({ emisor_autorizado: undefined }));
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.details.motivo, 'POLITICA_EMISION_NO_DECLARADA');
    assert.strictEqual(mod.ledger.size, 0);
  });

  await caso('hilo inexistente (hidratado) ⇒ 409 y cero asientos', async () => {
    const { mod } = await modulo();
    const r = await mod._emitir(orden({ hilo_existe: false }));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(mod.ledger.size, 0);
  });

  // ─── Emisión + vigentes ──────────────────────────────────────────────────
  await caso('emitir ⇒ 1 llave vigente con la REFERENCIA al secreto (nunca el valor)', async () => {
    const { mod, bus } = await modulo();
    const r = await mod._emitir(orden());
    assert.strictEqual(r.status, 201);
    const llave = r.data.llave;
    assert.strictEqual(llave.ref_secreto, 'HERMES_API_KEY');
    assert.strictEqual(llave.forma, 'REFERENCIA_SECRETO');
    assert.strictEqual(llave.conversacion, 'c-1');
    assert.deepStrictEqual(llave.actos, ['ESCRIBIR']);
    assert.ok(!JSON.stringify(llave).includes('sk-'), 'la llave no puede llevar material secreto');
    assert.ok(bus.publicados.some((p) => p.event === 'llave.emitida'), 'falta el hecho llave.emitida');

    const v = await mod._vigentesRpc({ conversacion: 'c-1', project_id: 'bocaos', ahora: '2026-11-09T05:00:00.000Z' });
    assert.strictEqual(v.data.total, 1);
    assert.strictEqual(v.data.caducidad, 'POR_DECLARAR', 'sin caducidad declarada se declara la ausencia');
  });

  await caso('vigentes filtra por ámbito: otra conversación no ve la llave', async () => {
    const { mod } = await modulo();
    await mod._emitir(orden());
    const v = await mod._vigentesRpc({ conversacion: 'c-2', project_id: 'bocaos' });
    assert.strictEqual(v.data.total, 0);
  });

  // ─── Revocación: anexar, nunca reescribir (L1) ───────────────────────────
  await caso('revocar ⇒ vigentes vacío y 2 asientos (emisión + revocación)', async () => {
    const { mod, bus } = await modulo();
    const emitida = await mod._emitir(orden());
    const id = emitida.data.llave.id;

    const r = await mod._revocar({ project_id: 'bocaos', id, actor: 'dueno', ahora: '2026-11-09T06:00:00.000Z' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.llave.revocadaEn, '2026-11-09T06:00:00.000Z');
    assert.ok(bus.publicados.some((p) => p.event === 'llave.revocada'));

    const asientos = mod.ledger.get('bocaos');
    assert.strictEqual(asientos.length, 2, 'emisión + revocación = 2 asientos');
    assert.deepStrictEqual(asientos.map((a) => a.tipo), ['EMISION', 'REVOCACION']);
    assert.strictEqual(asientos[0].id, id, 'el asiento de emisión sigue intacto (no se reescribe)');

    const v = await mod._vigentesRpc({ conversacion: 'c-1', project_id: 'bocaos' });
    assert.strictEqual(v.data.total, 0);

    // El histórico sigue viendo la emisión (listar no es vigencia)
    const l = await mod._listar({ project_id: 'bocaos', conversacion: 'c-1' });
    assert.strictEqual(l.data.total, 1);
    assert.strictEqual(l.data.llaves[0].revocadaEn, '2026-11-09T06:00:00.000Z');
  });

  await caso('revocar dos veces ⇒ 409 y el ledger no crece (idempotente)', async () => {
    const { mod } = await modulo();
    const { data } = await mod._emitir(orden());
    await mod._revocar({ project_id: 'bocaos', id: data.llave.id, actor: 'dueno' });
    const r = await mod._revocar({ project_id: 'bocaos', id: data.llave.id, actor: 'dueno' });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(mod.ledger.get('bocaos').length, 2);
  });

  await caso('el código no borra ni reescribe llaves (sin DELETE/UPDATE sobre el ledger)', async () => {
    const src = fsSync.readFileSync(path.join(__dirname, '..', '..', 'modules', 'gestor-llaves', 'index.js'), 'utf8');
    assert.ok(!/DELETE\s+FROM\s+llaves/i.test(src), 'no debe haber DELETE de llaves');
    assert.ok(!/UPDATE\s+llaves/i.test(src), 'no debe haber UPDATE de llaves');
    assert.ok(!/splice\(/.test(src), 'el ledger no se recorta: sólo se anexa');
  });

  // ─── Persistencia por proyecto ───────────────────────────────────────────
  await caso('el ledger se persiste en /conversaciones/llaves.json del proyecto', async () => {
    const { mod, bus } = await modulo();
    await mod._emitir(orden());
    await mod._persist.flush();
    const escrito = bus.fsFiles.get('bocaos::/conversaciones/llaves.json');
    assert.ok(escrito, 'no se escribió el ledger');
    const json = JSON.parse(escrito);
    assert.strictEqual(json.asientos.length, 1);
    assert.strictEqual(json.asientos[0].ref_secreto, 'HERMES_API_KEY');
  });

  await caso('project.activated restaura el ledger y no duplica asientos', async () => {
    const { mod, bus } = await modulo();
    const { data } = await mod._emitir(orden());
    await mod._persist.flush();
    // nuevo proceso: mismo bus (mismo "disco"), módulo limpio
    const mod2 = new GestorLlaves();
    await mod2.onLoad({ logger, eventBus: bus, metrics: null });
    await mod2.onProjectActivated({ data: { project_id: 'bocaos' } });
    assert.strictEqual(mod2.ledger.get('bocaos').length, 1);
    assert.strictEqual((await mod2._vigentesRpc({ project_id: 'bocaos', conversacion: 'c-1' })).data.llaves[0].id, data.llave.id);
    await mod2.onProjectActivated({ data: { project_id: 'bocaos' } });
    assert.strictEqual(mod2.ledger.get('bocaos').length, 1, 'restaurar dos veces no duplica');
  });

  // ─── Contrato del bus ────────────────────────────────────────────────────
  await caso('llave.emitir.request → response correlada por request_id', async () => {
    const { mod, bus } = await modulo();
    await mod.onLlaveEmitirRequest({ data: orden({ request_id: 'req-9' }) });
    const resp = bus.publicados.find((p) => p.event === 'llave.emitir.response');
    assert.ok(resp, 'no se publicó llave.emitir.response');
    assert.strictEqual(resp.data.request_id, 'req-9');
    assert.strictEqual(resp.data.status, 201);
  });

  await caso('orden incompleta ⇒ 400 + llave.emitir.failed', async () => {
    const { mod, bus } = await modulo();
    const r = await mod.onLlaveEmitirRequest({ data: { request_id: 'req-10', project_id: 'bocaos' } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.ok(bus.publicados.some((p) => p.event === 'llave.emitir.failed'));
    assert.strictEqual(mod.ledger.size, 0);
  });

  console.log(`\n${ok} pasos OK, ${ko} fallos (${ok + ko} total)`);
  process.exit(ko === 0 ? 0 : 1);
})();
