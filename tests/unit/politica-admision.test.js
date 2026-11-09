/**
 * Tests unitarios — `politica-admision` (P04 · CUSTODIO CON PERSISTENCIA).
 *
 * Fija el contrato de la hoja contra un bus mock:
 *   · definir → consultar devuelve LO MISMO (y en la forma que la puerta lee)
 *   · acto inválido (no LEER|ESCRIBIR) → politica.definir.failed con motivo
 *   · sin emisor → failed (una política sin dueño no es política)
 *   · proyecto sin política → 404 RESOURCE_NOT_FOUND (NUNCA un default)
 *   · redefinir SOBREESCRIBE y sube version (no acumula políticas)
 *   · estadosQueAdmiten omitido ⇒ default DECLARADO ['ABIERTA','ACTIVA']
 *   · actosPorEntrada vacío / ausente ⇒ failed (no hay política sin entradas)
 *   · el hecho politica.definida se publica después de escribir
 *
 * Ejecutar: node tests/unit/politica-admision.test.js
 */

'use strict';

const assert = require('assert');
const PoliticaAdmision = require('../../modules/politica-admision');

const logger = { info() {}, warn() {}, error() {}, debug() {} };

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
    }
  };
  return bus;
}

async function modulo() {
  const bus = busMock();
  const mod = new PoliticaAdmision();
  await mod.onLoad({ logger, eventBus: bus, metrics: null });
  return { mod, bus };
}

const UNA_POLITICA = (over = {}) => ({
  request_id: 'r-def-1',
  project_id: 'bocaos',
  actosPorEntrada: { ESCRIBIR: ['LEER', 'ESCRIBIR'], LEER: ['LEER'] },
  emisor: 'dueno',
  ahora: '2026-11-09T04:00:00.000Z',
  ...over
});

const ultimo = (bus, ev) => {
  const hits = bus.publicados.filter((p) => p.event === ev);
  return hits.length ? hits[hits.length - 1].data : null;
};

let ok = 0, ko = 0;
async function caso(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { ko++; console.log('  ✗ ' + nombre + '\n      ' + (e && e.message)); }
}

(async () => {
  console.log('politica-admision — la política como DATO (PA1–PA4, O12, I7)');

  await caso('definir → consultar devuelve la MISMA política (200, forma de la puerta incluida)', async () => {
    const { mod, bus } = await modulo();
    const def = await mod.onPoliticaDefinirRequest({ data: UNA_POLITICA() });
    assert.strictEqual(def.status, 201);
    assert.strictEqual(def.data.redefinida, false);

    const r = await mod.onPoliticaConsultarRequest({ data: { request_id: 'r-con-1', project_id: 'bocaos' } });
    assert.strictEqual(r.status, 200);
    const p = r.data.politica;
    assert.deepStrictEqual(p.actosPorEntrada, { ESCRIBIR: ['LEER', 'ESCRIBIR'], LEER: ['LEER'] });
    // La forma que la puerta ya sabe leer: derivada, no estimada.
    assert.deepStrictEqual(p.actosPorEstado, { ABIERTA: ['LEER', 'ESCRIBIR'], ACTIVA: ['LEER', 'ESCRIBIR'] });
    assert.deepStrictEqual(p.estadosQueAdmiten, ['ABIERTA', 'ACTIVA']);
    assert.strictEqual(p.emisor, 'dueno');
    assert.strictEqual(p.version, 1);
    assert.strictEqual(p.definidaEn, '2026-11-09T04:00:00.000Z');

    // El hecho describe lo ESCRITO (el store ya lo tiene cuando se publica).
    const hecho = ultimo(bus, 'politica.definida');
    assert.ok(hecho, 'politica.definida debe publicarse');
    assert.strictEqual(hecho.project_id, 'bocaos');
    assert.strictEqual(hecho.version, 1);
    assert.strictEqual(hecho.redefinida, false);
    assert.deepStrictEqual(hecho.actosPorEntrada, { ESCRIBIR: ['LEER', 'ESCRIBIR'], LEER: ['LEER'] });
    assert.strictEqual(mod.politicas.get('bocaos').version, 1, 'cuando sale el hecho, el store ya lo tiene');
  });

  await caso('acto inválido ("MENSAJE") ⇒ politica.definir.failed ACTO_INVALIDO', async () => {
    const { mod, bus } = await modulo();
    const r = await mod.onPoliticaDefinirRequest({
      data: UNA_POLITICA({ actosPorEntrada: { MENSAJE: ['ESCRIBIR'] } })
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.motivo, 'ACTO_INVALIDO');
    assert.strictEqual(r.error.details.field, 'actosPorEntrada.MENSAJE');
    const failed = ultimo(bus, 'politica.definir.failed');
    assert.strictEqual(failed.motivo, 'ACTO_INVALIDO');
    // Nada se guardó: el proyecto sigue sin política.
    const c = await mod.onPoliticaConsultarRequest({ data: { request_id: 'r-c', project_id: 'bocaos' } });
    assert.strictEqual(c.status, 404);
  });

  await caso('acto inválido en el VALOR (["LEER","BORRAR"]) ⇒ ACTO_INVALIDO', async () => {
    const { mod } = await modulo();
    const r = await mod.onPoliticaDefinirRequest({
      data: UNA_POLITICA({ actosPorEntrada: { ESCRIBIR: ['LEER', 'BORRAR'] } })
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.motivo, 'ACTO_INVALIDO');
    assert.ok(r.error.message.includes('BORRAR'), 'el motivo nombra el acto ofensor');
  });

  await caso('sin emisor ⇒ politica.definir.failed SIN_EMISOR', async () => {
    const { mod, bus } = await modulo();
    const r = await mod.onPoliticaDefinirRequest({ data: UNA_POLITICA({ emisor: '' }) });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.motivo, 'SIN_EMISOR');
    assert.strictEqual(r.error.details.field, 'emisor');
    assert.strictEqual(ultimo(bus, 'politica.definir.failed').motivo, 'SIN_EMISOR');
  });

  await caso('actosPorEntrada ausente o vacío ⇒ ACTOS_POR_ENTRADA_AUSENTE (no hay política sin entradas)', async () => {
    const { mod } = await modulo();
    const sin = await mod.onPoliticaDefinirRequest({ data: UNA_POLITICA({ actosPorEntrada: undefined }) });
    assert.strictEqual(sin.status, 400);
    assert.strictEqual(sin.error.details.motivo, 'ACTOS_POR_ENTRADA_AUSENTE');
    const vacio = await mod.onPoliticaDefinirRequest({ data: UNA_POLITICA({ actosPorEntrada: {} }) });
    assert.strictEqual(vacio.status, 400);
    assert.strictEqual(vacio.error.details.motivo, 'ACTOS_POR_ENTRADA_AUSENTE');
    const lista = await mod.onPoliticaDefinirRequest({ data: UNA_POLITICA({ actosPorEntrada: ['ESCRIBIR'] }) });
    assert.strictEqual(lista.status, 400);
    assert.strictEqual(lista.error.details.motivo, 'ACTOS_POR_ENTRADA_AUSENTE');
  });

  await caso('proyecto SIN política ⇒ 404 RESOURCE_NOT_FOUND (jamás una política por defecto)', async () => {
    const { mod, bus } = await modulo();
    const r = await mod.onPoliticaConsultarRequest({ data: { request_id: 'r-x', project_id: 'otro-proyecto' } });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.message, 'El proyecto no ha declarado política de admisión');
    assert.strictEqual(r.error.details.motivo, 'POLITICA_NO_DECLARADA');
    assert.strictEqual(r.data, undefined, 'un 404 no puede traer política inventada');
    // La ausencia se RESPONDE (404 en la response), no se grita por .failed:
    // .failed queda para payloads inválidos (mismo criterio que gestor-llaves).
    assert.strictEqual(bus.publicados.filter((p) => p.event === 'politica.consultar.failed').length, 0,
      'un proyecto sin política NO produce .failed: produce un 404');
    const resp = bus.publicados.filter((p) => p.event === 'politica.consultar.response').pop().data;
    assert.strictEqual(resp.status, 404);
    assert.strictEqual(resp.request_id, 'r-x');
  });

  await caso('consultar sin project_id ⇒ 400 INVALID_INPUT', async () => {
    const { mod } = await modulo();
    const r = await mod.onPoliticaConsultarRequest({ data: { request_id: 'r-y' } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.motivo, 'PAYLOAD_INVALIDO');
  });

  await caso('redefinir SOBREESCRIBE y sube version (una sola política vigente)', async () => {
    const { mod } = await modulo();
    const uno = await mod.onPoliticaDefinirRequest({ data: UNA_POLITICA() });
    assert.strictEqual(uno.data.politica.version, 1);
    const dos = await mod.onPoliticaDefinirRequest({
      data: UNA_POLITICA({ actosPorEntrada: { LEER: ['LEER'] }, emisor: 'operador' })
    });
    assert.strictEqual(dos.status, 200);
    assert.strictEqual(dos.data.redefinida, true);
    assert.strictEqual(dos.data.politica.version, 2);

    const r = await mod.onPoliticaConsultarRequest({ data: { request_id: 'r-z', project_id: 'bocaos' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.politica.version, 2);
    assert.deepStrictEqual(r.data.politica.actosPorEntrada, { LEER: ['LEER'] }, 'la nueva SOBREESCRIBE');
    assert.strictEqual(r.data.politica.emisor, 'operador');
    assert.strictEqual(mod.politicas.size, 1, 'redefinir NO acumula políticas');
  });

  await caso('estadosQueAdmiten omitido ⇒ default DECLARADO [ABIERTA, ACTIVA]; declarado ⇒ el del emisor', async () => {
    const { mod } = await modulo();
    await mod.onPoliticaDefinirRequest({ data: UNA_POLITICA() });
    const porDefecto = await mod.onPoliticaConsultarRequest({ data: { request_id: 'r-1', project_id: 'bocaos' } });
    assert.deepStrictEqual(porDefecto.data.politica.estadosQueAdmiten, ['ABIERTA', 'ACTIVA']);

    await mod.onPoliticaDefinirRequest({
      data: UNA_POLITICA({ project_id: 'solo-abierta', estadosQueAdmiten: ['abierta'] })
    });
    const declarado = await mod.onPoliticaConsultarRequest({ data: { request_id: 'r-2', project_id: 'solo-abierta' } });
    assert.deepStrictEqual(declarado.data.politica.estadosQueAdmiten, ['ABIERTA']);
    assert.deepStrictEqual(declarado.data.politica.actosPorEstado, { ABIERTA: ['LEER', 'ESCRIBIR'] },
      'un solo estado ⇒ un solo estado admite; el resto no aparece');
  });

  await caso('estadosQueAdmiten inválido (no array / vacío) ⇒ ESTADOS_QUE_ADMITEN_INVALIDO', async () => {
    const { mod } = await modulo();
    const noArray = await mod.onPoliticaDefinirRequest({ data: UNA_POLITICA({ estadosQueAdmiten: 'ABIERTA' }) });
    assert.strictEqual(noArray.status, 400);
    assert.strictEqual(noArray.error.details.motivo, 'ESTADOS_QUE_ADMITEN_INVALIDO');
    const vacio = await mod.onPoliticaDefinirRequest({ data: UNA_POLITICA({ estadosQueAdmiten: [] }) });
    assert.strictEqual(vacio.error.details.motivo, 'ESTADOS_QUE_ADMITEN_INVALIDO');
  });

  await caso('persistencia: marcarDirty + restaurar devuelve la política del proyecto', async () => {
    const { mod, bus } = await modulo();
    await mod.onPoliticaDefinirRequest({ data: UNA_POLITICA() });
    await mod._persist.flush();
    assert.ok(bus.fsFiles.get('bocaos::/conversaciones/politica.json'), 'snapshot escrito en /conversaciones/politica.json');

    // Otra instancia (reinicio) restaura desde el mismo storage.
    const mod2 = new PoliticaAdmision();
    await mod2.onLoad({ logger, eventBus: bus, metrics: null });
    await mod2.onProjectActivated({ data: { project_id: 'bocaos' } });
    const r = await mod2.onPoliticaConsultarRequest({ data: { request_id: 'r-r', project_id: 'bocaos' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.politica.version, 1);
    assert.deepStrictEqual(r.data.politica.actosPorEntrada, { ESCRIBIR: ['LEER', 'ESCRIBIR'], LEER: ['LEER'] });
  });

  console.log(`\n  casos: ${ok}/${ok + ko}`);
  if (ko > 0) process.exit(1);
})();
