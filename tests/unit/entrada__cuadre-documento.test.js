/**
 * Tests unitarios — control-cuadre-documento (A4.3) en la cadena documental.
 *
 * Fija el defecto de raíz que dejaba la entrada documental sin llegar nunca al asiento:
 * el módulo solo miraba `documento` (una REFERENCIA sin cifras) y usaba `Number()` con
 * formato inglés, así que un documento con "base 63,60 / IVA 6,36 / total 69,96" salía
 * como "no verificable" o descuadrado. Aquí se prueba:
 *   · cifras extraídas por A4.1 (strings del OCR, coma decimal) → cuadra
 *   · cifras declaradas en el documento
 *   · cuota derivada de base × iva_pct
 *   · descuadre real → encola
 *   · dato ausente → no verificable (no se inventa ni se encola)
 *   · al cuadrar → encadena a hecho-compra.componer.request (con la clase)
 *
 * Ejecutar: node tests/unit/entrada__cuadre-documento.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const Modulo = require('../../modules/contabilidad-entrada/control-cuadre-documento/index.js');

function busFalso() {
  const eventos = [];
  return {
    eventos,
    publish(ev, payload) { eventos.push({ ev, payload }); },
    subscribe() { return () => {}; },
  };
}

function crear() {
  const bus = busFalso();
  const m = new Modulo();
  m.eventBus = bus;
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  return { m, bus };
}

// ── 1 · extraído del OCR (coma decimal) → cuadra y encadena al hecho contable ──
{
  const { m, bus } = crear();
  const res = m._cuadra({
    project_id: 'p1',
    clase: 'ticket',
    documento: { id: 'ticket.png' },
    extraido: { base: '63,60', iva_pct: '10', iva_importe: '6,36', total: '69,96' },
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.cuadra, true, 'base 63,60 + cuota 6,36 debe cuadrar con total 69,96');
  assert.strictEqual(res.data.base, 63.6);
  assert.strictEqual(res.data.cuota, 6.36);
  assert.strictEqual(res.data.total, 69.96);
  assert.strictEqual(res.data.diferencia, 0);

  m.onCuadraRequest({
    request_id: 'r1', project_id: 'p1', clase: 'ticket',
    documento: { id: 'ticket.png' },
    extraido: { base: '63,60', iva_importe: '6,36', total: '69,96' },
  });
  const enc = bus.eventos.find((e) => e.ev === 'hecho-compra.componer.request');
  assert.ok(enc, 'al cuadrar debe encadenar hecho-compra.componer.request');
  assert.strictEqual(enc.payload.clase, 'ticket');
  assert.strictEqual(enc.payload.extraido.total, '69,96');
}

// ── 2 · miles con punto + decimales con coma ──
{
  const { m } = crear();
  const res = m._cuadra({
    project_id: 'p1',
    extraido: { base: '1.234,56', iva_importe: '259,26', total: '1.493,82' },
  });
  assert.strictEqual(res.data.base, 1234.56);
  assert.strictEqual(res.data.cuota, 259.26);
  assert.strictEqual(res.data.total, 1493.82);
  assert.strictEqual(res.data.cuadra, true);
}

// ── 3 · cuota derivada de base × iva_pct (cuando el documento no da el importe) ──
{
  const { m } = crear();
  const res = m._cuadra({
    project_id: 'p1',
    extraido: { base: '100,00', iva_pct: '21', total: '121,00' },
  });
  assert.strictEqual(res.data.cuota, 21);
  assert.strictEqual(res.data.cuadra, true);
}

// ── 4 · descuadre real → NO cuadra y se encola (no se asienta mal) ──
{
  const { m, bus } = crear();
  m.onCuadraRequest({
    request_id: 'r2', project_id: 'p1',
    extraido: { base: '63,60', iva_importe: '6,36', total: '99,99' },
  });
  const enc = bus.eventos.find((e) => e.ev === 'encolado-excepcion.encolar.request');
  assert.ok(enc, 'un descuadre real debe encolar la excepción');
  assert.strictEqual(enc.payload.rol, 'CONTROL_CUADRE_DOCUMENTO');
  assert.ok(Math.abs(enc.payload.payload.diferencia + 30.03) < 0.005, 'la diferencia se declara, no se corrige');
  const aHecho = bus.eventos.find((e) => e.ev === 'hecho-compra.componer.request');
  assert.ok(!aHecho, 'un documento que no cuadra NO debe encadenar al asiento');
}

// ── 5 · sin cifras → no verificable, sin excepción inventada ni encadenado ──
{
  const { m, bus } = crear();
  m.onCuadraRequest({ request_id: 'r3', project_id: 'p1', documento: { id: 'x.pdf' } });
  assert.ok(!bus.eventos.some((e) => e.ev === 'encolado-excepcion.encolar.request'),
    'un hueco no es un descuadre: no se encola');
  assert.ok(!bus.eventos.some((e) => e.ev === 'hecho-compra.componer.request'),
    'sin cifras no se encadena al asiento');
}

// ── 6 · sin project_id → 400 ──
{
  const { m } = crear();
  const res = m._cuadra({ extraido: { total: '10,00' } });
  assert.strictEqual(res.status, 400);
}

console.log('OK · control-cuadre-documento: 6/6 (cifras del OCR, formatos ES, encadenado correcto)');
