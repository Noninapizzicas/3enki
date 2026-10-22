/**
 * Test de integración mínimo — A4.1 (extraccion-dato) pide JUICIO al respaldo híbrido.
 *
 * Fija el ENGANCHE entre la extracción determinista y `extractor-juicio`: cuando el esquema
 * declarado NO completa el documento y hay TEXTO legible, extraccion-dato publica
 * `extractor-juicio.extraer.request` (best-effort, sin esperar respuesta) ANTES de encolar la
 * excepción. Sin texto, o cuando el esquema sí casa, no se pide juicio: el LLM es el respaldo
 * del hueco, no el camino normal.
 *
 * Ejecutar: node tests/unit/entrada__extraccion-dato-a-juicio.test.js
 */

'use strict';

const assert = require('assert');
const ExtraccionDato = require('../../modules/contabilidad-entrada/extraccion-dato/index.js');

function busFalso() {
  const eventos = [];
  return {
    eventos,
    publish(ev, payload) { eventos.push({ ev, payload }); },
    subscribe() { return () => {}; }
  };
}

function crear() {
  const bus = busFalso();
  const m = new ExtraccionDato();
  m.eventBus = bus;
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  return { m, bus };
}

const TEXTO = 'FACTURA Nº 2024/117\nProveedor: Suministros ACME SL\nNIF: B12345674\n' +
  'Fecha: 05/03/2024\nTotal: 69,96 EUR';

(async () => {
  // ── 1 · esquema que NO casa + texto → pide juicio ANTES de encolar ──
  {
    const { m, bus } = crear();
    await m.onJuzgarRequest({
      request_id: 'r1', project_id: 'p1', clase: 'factura',
      documento: { id: 'factura-117.pdf', texto: TEXTO },
      // El patrón declarado no aparece en el documento: la extracción determinista no completa.
      esquema: { total: { regex: 'Importe total:\\s*([\\d.,]+)' } },
      obligatorios: ['total'],
      correlation_id: 'c1'
    });

    const juicio = bus.eventos.find((e) => e.ev === 'extractor-juicio.extraer.request');
    assert.ok(juicio, 'un documento incompleto con texto debe pedir juicio');
    assert.strictEqual(juicio.payload.project_id, 'p1');
    assert.strictEqual(juicio.payload.texto, TEXTO, 'el TEXTO viaja para que el LLM lo lea');
    assert.strictEqual(juicio.payload.clase, 'factura');
    assert.deepStrictEqual(juicio.payload.obligatorios, ['total']);
    assert.strictEqual(juicio.payload.correlation_id, 'c1', 'la correlación se propaga');
    assert.deepStrictEqual(juicio.payload.documento, { id: 'factura-117.pdf', ruta: null, tipo: null });

    // UNA sola excepción por documento: si se delega al juicio, encola el juicio (no A4.1).
    // Encolar en los dos sitios dejaba DOS entradas (incompleto + asiento propuesto).
    const colaAqui = bus.eventos.findIndex((e) => e.ev === 'encolado-excepcion.encolar.request');
    assert.strictEqual(colaAqui, -1,
      'al delegar al juicio, A4.1 no encola: la excepcion la decide el juicio');
    assert.ok(!bus.eventos.some((e) => e.ev === 'control-cuadre-documento.cuadra.request'),
      'si el determinista no propone, no hay nada que cuadrar todavía');
  }

  // ── 2 · esquema que SÍ casa → no se pide juicio (el LLM es el respaldo, no el camino) ──
  {
    const { m, bus } = crear();
    await m.onJuzgarRequest({
      request_id: 'r2', project_id: 'p1', clase: 'factura',
      documento: { texto: TEXTO },
      esquema: { total: { regex: 'Total:\\s*([\\d.,]+)' } },
      obligatorios: ['total']
    });
    assert.ok(!bus.eventos.some((e) => e.ev === 'extractor-juicio.extraer.request'),
      'con el esquema completo NO se gasta juicio');
    assert.ok(bus.eventos.some((e) => e.ev === 'control-cuadre-documento.cuadra.request'),
      'la propuesta determinista sigue su camino de siempre');
  }

  // ── 3 · sin esquema declarado + texto → hueco declarado, se pide juicio ──
  {
    const { m, bus } = crear();
    await m.onJuzgarRequest({
      request_id: 'r3', project_id: 'p1', documento: { id: 'ticket.png' }, texto: TEXTO
    });
    const juicio = bus.eventos.find((e) => e.ev === 'extractor-juicio.extraer.request');
    assert.ok(juicio, 'sin esquema el documento es un hueco: se pide juicio');
    assert.ok(!('obligatorios' in juicio.payload),
      'sin obligatorios declarados no se inventa la lista (la pone el juicio)');
  }

  // ── 4 · documento sin TEXTO (solo referencia) → no hay nada que juzgar ──
  {
    const { m, bus } = crear();
    await m.onJuzgarRequest({
      request_id: 'r4', project_id: 'p1',
      documento: { id: 'escaneo.pdf' }, esquema: { total: { regex: 'Total:\\s*([\\d.,]+)' } }
    });
    assert.ok(!bus.eventos.some((e) => e.ev === 'extractor-juicio.extraer.request'),
      'sin texto no se pide juicio (no se juzga el vacío)');
    assert.ok(bus.eventos.some((e) => e.ev === 'encolado-excepcion.encolar.request'),
      'sin texto lo dudoso sigue esperando a un humano');
  }

  // ── 5 · texto demasiado corto → tampoco se pide juicio ──
  {
    const { m, bus } = crear();
    await m.onJuzgarRequest({
      request_id: 'r5', project_id: 'p1', documento: { id: 'x.pdf' }, texto: 'n/a'
    });
    assert.ok(!bus.eventos.some((e) => e.ev === 'extractor-juicio.extraer.request'),
      'un texto de 3 caracteres no es un documento');
  }

  // ── 6 · las dos mitades eligen la MISMA clave de excepción para el mismo documento ──
  // Si no, el custodio de la cola vería dos excepciones distintas del mismo documento: la
  // deduplicación por clave dejaría de servir justo cuando más falta hace (el hueco).
  {
    const { m } = crear();
    const ExtractorJuicio = require('../../modules/contabilidad-entrada/extractor-juicio/index.js');
    const juicio = new ExtractorJuicio();
    const doc = { id: 'factura-9.pdf', ruta: 'inbox/factura-9.pdf', tipo: 'factura' };
    const res = m._juzgar({ project_id: 'p1', documento: { ...doc, texto: TEXTO }, esquema: {} });
    assert.strictEqual(juicio._clave({ documento: doc }, TEXTO), res.data.clave_excepcion,
      'la clave de la excepción es la del documento, no la del motor que lo miró');
    assert.strictEqual(res.data.clave_excepcion, 'doc:factura-9.pdf');
  }

  console.log('OK · extraccion-dato → extractor-juicio: 6/6 (el respaldo solo cubre el hueco)');
})().catch((err) => {
  console.error('FALLO · extraccion-dato → extractor-juicio:', err && err.message);
  console.error(err && err.stack);
  process.exit(1);
});
