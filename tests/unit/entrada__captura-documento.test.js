/**
 * Tests unitarios — captura-documento (A3) en la cadena documental.
 *
 * Fija el defecto medido EN PRODUCCIÓN: el handler del hecho `contabilidad.documento_recibido`
 * volvía a encadenar el documento, aunque el emisor (puerto-documento-digital / ingesta) ya lo
 * había encadenado al camino correcto. Resultado: un SEGUNDO camino con un documento físico sin
 * texto → `extraccion-dato` sin esquema → una excepción «documento incompleto/ambiguo» en la cola
 * por CADA documento que entraba bien.
 *
 * Y fija el camino por FORMA: formato → puerto; físico (path sin texto) → lector; canónico → extracción.
 *
 * Ejecutar: node tests/unit/entrada__captura-documento.test.js
 */

'use strict';

const assert = require('assert');
const Modulo = require('../../modules/contabilidad-entrada/captura-documento/index.js');

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

// ── 1 · documento FÍSICO por RPC → se admite y va al LECTOR, no a extracción ──
{
  const { m, bus } = crear();
  const res = m._admitir({ project_id: 'p1', documento: { path: 'inbox/f.png', mime: 'image/png' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.admitido, true);
  assert.strictEqual(res.data.encadenado_a, 'lector-documento');
  assert.strictEqual(res.data.contenido_interpretado, false, 'cero juicio: no interpreta');

  m._encadenar(res, { correlation_id: 'c1' });
  assert.strictEqual(bus.eventos.length, 1);
  assert.strictEqual(bus.eventos[0].ev, 'lector-documento.leer.request');
  assert.strictEqual(bus.eventos[0].payload.documento.path, 'inbox/f.png');
}

// ── 2 · documento CANÓNICO (texto) → va a extracción ──
{
  const { m, bus } = crear();
  const res = m._admitir({ project_id: 'p1', documento: { texto: 'FACTURA 1 TOTAL 10,00', mime: 'text/plain' } });
  assert.strictEqual(res.data.encadenado_a, 'extraccion-dato');
  m._encadenar(res, {});
  assert.strictEqual(bus.eventos[0].ev, 'extraccion-dato.juzgar.request');
}

// ── 3 · formato declarado → puerto-documento (traduce la forma) ──
{
  const { m, bus } = crear();
  const res = m._admitir({ project_id: 'p1', documento: { path: 'inbox/f.pdf' }, formato: 'proveedor_x' });
  assert.strictEqual(res.data.encadenado_a, 'puerto-documento');
  m._encadenar(res, {});
  assert.strictEqual(bus.eventos[0].ev, 'puerto-documento.entrar.request');
}

// ── 4 · el HECHO no se re-encadena (el bug de producción) ──
{
  const { m, bus } = crear();
  m.onDocumentoRecibido({
    data: {
      project_id: 'p1',
      documento: { path: 'inbox/f.png', mime: 'image/png' },
      correlation_id: 'c2',
    },
  });
  assert.strictEqual(bus.eventos.filter((e) => e.ev.endsWith('.request')).length, 0,
    'escuchar el hecho NO debe abrir un segundo camino (ni lector ni extraccion)');
}

// ── 5 · sin anclajes → no admisible, no encadena ──
{
  const { m, bus } = crear();
  const res = m._admitir({ project_id: 'p1', documento: { id: '9999' } });
  assert.strictEqual(res.data.admitido, false);
  assert.strictEqual(res.data.encadenado_a, null);
  m._encadenar(res, {});
  assert.strictEqual(bus.eventos.length, 0);
  assert.ok(res.data.abierto.documento, 'declara por qué no se admite');
}

// ── 6 · sin project_id / sin documento → 400 ──
{
  const { m } = crear();
  assert.strictEqual(m._admitir({ documento: { tipo: 'x' } }).status, 400);
  assert.strictEqual(m._admitir({ project_id: 'p1' }).status, 400);
}

console.log('OK · captura-documento: 6/6 (camino por forma; el hecho no se re-encadena)');
