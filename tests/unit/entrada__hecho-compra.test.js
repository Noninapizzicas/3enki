'use strict';

/**
 * entrada/hecho-compra — el salto campos → HECHO con partida doble (contrato § 'D · hecho-compra').
 *
 * Lo que se vigila aquí, en el orden en que la vertical puede mentir:
 *   1. una FACTURA que cuadra y con cuenta declarada por config → asienta, y el asiento es de
 *      verdad partida doble (DEBE == HABER == 69,96) con las tres líneas PGC (629 / 472 / 400).
 *   2. un TICKET sin IVA → NO asienta (el IVA no se supone) y la compra va a la cola.
 *   3. un ALBARÁN → NO asienta (no devenga gasto), motivo `albaran_pendiente_de_factura` y
 *      encadena al cotejo para esperar la factura; no es un error, así que NO va a la cola.
 *   4. sin cuenta (config null y regla que no responde) → NO asienta y declara `abierto.cuenta_gasto`.
 *   + extras: la regla de contrapartida resuelve la cuenta; sin project_id → 400 y `.failed`;
 *     una fecha inexistente (31/02) o un documento que no cuadra tampoco se asientan.
 *
 * Ejecutar: node tests/unit/entrada__hecho-compra.test.js
 */

const assert = require('assert');

const HechoCompra = require('../../modules/contabilidad-entrada/hecho-compra/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Bus de mentira: guarda lo publicado y no entrega nada por subscribe (el módulo lo tolera).
function busFalso() {
  const publicados = [];
  return {
    publicados,
    publish(ev, p) { publicados.push({ ev, p }); },
    subscribe() { return () => {}; }
  };
}

function nuevo() {
  const m = new HechoCompra();
  const bus = busFalso();
  m.eventBus = bus;
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  return { m, bus };
}

const eventos = (bus, nombre) => bus.publicados.filter((x) => x.ev === nombre);

// Llama por el camino REAL de RPC (onComponerRequest) para ver también los efectos de bus.
async function componer(m, data) {
  const request_id = 'req-' + Math.random().toString(16).slice(2);
  const res = await m.onComponerRequest({ request_id, data: { request_id, ...data } });
  const respuesta = eventos(m.eventBus, 'hecho-compra.componer.response').pop();
  assert.ok(respuesta, 'debe publicarse hecho-compra.componer.response');
  assert.strictEqual(respuesta.p.request_id, request_id, 'la response va correlada');
  return { res, respuesta: respuesta.p, request_id };
}

// Factura española tal como la deja el OCR: importes con coma, fecha dd/mm/yyyy.
const FACTURA = {
  proveedor: 'PANADERIA EL HORNO S.L.',
  nif: 'B12345678',
  numero: 'F-2026-004512',
  fecha: '21/10/2026',
  base: '63,60',
  iva_pct: '21',
  iva_importe: '6,36',
  total: '69,96'
};

test('FACTURA que cuadra + cuenta por config → asienta con partida doble 629/472/400', async () => {
  const { m, bus } = nuevo();
  m.config.cuenta_gasto_default = '629';   // config del manifest (no se inventa nada)
  const { res } = await componer(m, { project_id: 'p1', clase: 'factura', extraido: FACTURA });

  assert.strictEqual(res.status, 200);
  const x = res.data;
  assert.strictEqual(x.asienta, true, 'la factura cuadra: debe asentar');
  assert.strictEqual(x.cuadra, true);
  assert.strictEqual(x.motivo, null);
  assert.strictEqual(x.cuenta_gasto, '629');
  assert.strictEqual(x.cuenta_gasto_origen, 'config');
  assert.deepStrictEqual(x.abierto, {
    iva: null, cuenta_gasto: null, fecha: null, clase: null, asiento: null, cifras: null
  });

  // El HECHO: fecha normalizada, importe, moneda por defecto y tercero declarado.
  const h = x.hecho;
  assert.ok(h, 'asienta:true implica hecho');
  assert.strictEqual(h.fecha, '2026-10-21', 'dd/mm/yyyy → YYYY-MM-DD');
  assert.strictEqual(h.concepto, 'PANADERIA EL HORNO S.L. F-2026-004512');
  assert.strictEqual(h.importe, 69.96);
  assert.strictEqual(h.moneda, 'EUR');
  assert.strictEqual(h.referencia, '2026-004512');
  assert.strictEqual(h.vertical, 'compras');
  assert.deepStrictEqual(h.tercero, { nif: 'B12345678', nombre: 'PANADERIA EL HORNO S.L.' });

  // La PARTIDA DOBLE, línea a línea.
  const lineas = h.asiento.lineas;
  assert.strictEqual(lineas.length, 3, 'gasto + IVA soportado + proveedores');
  assert.deepStrictEqual(lineas.map((l) => l.cuenta), ['629', '472', '400']);
  assert.deepStrictEqual(lineas.map((l) => l.debe), [63.6, 6.36, 0]);
  assert.deepStrictEqual(lineas.map((l) => l.haber), [0, 0, 69.96]);
  const debe = lineas.reduce((s, l) => s + l.debe, 0);
  const haber = lineas.reduce((s, l) => s + l.haber, 0);
  assert.ok(Math.abs(debe - 69.96) < 1e-9, `DEBE == 69.96 (fue ${debe})`);
  assert.ok(Math.abs(haber - 69.96) < 1e-9, `HABER == 69.96 (fue ${haber})`);
  assert.ok(Math.abs(debe - haber) < 1e-9, 'la partida doble cuadra');

  // El HECHO se publica para que escritor-diario (B2) lo apile: asiento + hecho + origen.
  const hechos = eventos(bus, 'contabilidad.hecho_recibido');
  assert.strictEqual(hechos.length, 1, 'se publica contabilidad.hecho_recibido');
  assert.strictEqual(hechos[0].p.origen, 'hecho-compra');
  assert.deepStrictEqual(hechos[0].p.asiento, h.asiento);
  assert.strictEqual(hechos[0].p.project_id, 'p1');
  // Con asiento NO se encola nada.
  assert.strictEqual(eventos(bus, 'encolado-excepcion.encolar.request').length, 0);
  // Ni se coteja (eso es solo del albarán).
  assert.strictEqual(eventos(bus, 'cruce-factura-recepcion.cotejar.request').length, 0);
});

test('TICKET sin IVA → NO asienta (el IVA no se supone) y se encola la compra', async () => {
  const { m, bus } = nuevo();
  m.config.cuenta_gasto_default = '629';
  m._rpc = async () => null;   // la regla tampoco responde: no hay cuenta que rescatar
  const { res } = await componer(m, {
    project_id: 'p2',
    clase: 'ticket',
    extraido: { proveedor: 'BAR PEPE', nif: '12345678Z', numero: 'T-9', fecha: '20/10/2026', base: '10,00', total: '10,00' }
  });

  assert.strictEqual(res.status, 200, 'no asentar no es un error de transporte');
  const x = res.data;
  assert.strictEqual(x.asienta, false);
  assert.strictEqual(x.hecho, null, 'sin IVA no hay hecho');
  assert.strictEqual(x.motivo, 'iva_no_declarado');
  assert.ok(x.abierto.iva, 'declara abierto.iva');

  assert.strictEqual(eventos(bus, 'contabilidad.hecho_recibido').length, 0, 'NO se publica el hecho');
  const cola = eventos(bus, 'encolado-excepcion.encolar.request');
  assert.strictEqual(cola.length, 1, 'se encola en A8.1');
  assert.strictEqual(cola[0].p.rol, 'ENCOLADO_EXCEPCION');
  assert.strictEqual(cola[0].p.clave, 'compra:12345678Z:T-9');
  assert.strictEqual(cola[0].p.motivo, 'iva_no_declarado');
  assert.strictEqual(cola[0].p.origen, 'hecho-compra');
  assert.strictEqual(cola[0].p.project_id, 'p2');
});

test('ALBARÁN → NO asienta (no devenga gasto) y encadena al cotejo, sin encolar', async () => {
  const { m, bus } = nuevo();
  const { res } = await componer(m, {
    project_id: 'p3',
    clase: 'albaran',
    extraido: {
      proveedor: 'PANADERIA EL HORNO S.L.', nif: 'B12345678', numero: 'A-77',
      fecha: '19/10/2026', base: '63,60', iva_pct: '21', total: '69,96'
    }
  });

  const x = res.data;
  assert.strictEqual(x.asienta, false);
  assert.strictEqual(x.hecho, null);
  assert.strictEqual(x.motivo, 'albaran_pendiente_de_factura');
  assert.strictEqual(eventos(bus, 'contabilidad.hecho_recibido').length, 0);

  const cotejo = eventos(bus, 'cruce-factura-recepcion.cotejar.request');
  assert.strictEqual(cotejo.length, 1, 'se encadena el cotejo con la factura (N5)');
  assert.strictEqual(cotejo[0].p.project_id, 'p3');
  assert.strictEqual(cotejo[0].p.recepcion.numero, 'A-77');
  assert.strictEqual(cotejo[0].p.recepcion.importe, 69.96);
  assert.strictEqual(cotejo[0].p.clave, 'compra:B12345678:A-77');

  // §D.1: un albarán esperando factura NO es una excepción → no se encola.
  assert.strictEqual(eventos(bus, 'encolado-excepcion.encolar.request').length, 0);
});

test('sin cuenta (config null y regla que no responde) → NO asienta y declara abierto.cuenta_gasto', async () => {
  const { m, bus } = nuevo();
  assert.strictEqual(m.config.cuenta_gasto_default, null, 'por defecto NO hay cuenta: no se inventa');
  m._rpc = async () => null;   // regla-contrapartida no contesta
  const { res } = await componer(m, { project_id: 'p4', clase: 'factura', extraido: FACTURA });

  const x = res.data;
  assert.strictEqual(x.asienta, false);
  assert.strictEqual(x.cuenta_gasto, null, 'ninguna cuenta inventada');
  assert.strictEqual(x.motivo, 'cuenta_gasto_no_declarada');
  assert.ok(x.abierto.cuenta_gasto, 'declara abierto.cuenta_gasto');
  assert.strictEqual(x.hecho, null);
  assert.strictEqual(eventos(bus, 'contabilidad.hecho_recibido').length, 0);
  assert.strictEqual(eventos(bus, 'encolado-excepcion.encolar.request').length, 1);
});

test('la regla de contrapartida resuelve la cuenta (tercera vía, declarada como origen regla)', async () => {
  const { m, bus } = nuevo();
  let pedido = null;
  m._rpc = async (evento, payload) => {
    pedido = { evento, payload };
    return { status: 200, contrapartida: '600', regla: { clave: 'panaderia' } };
  };
  const { res } = await componer(m, { project_id: 'p5', clase: 'factura', extraido: FACTURA });

  assert.strictEqual(res.data.asienta, true);
  assert.strictEqual(res.data.cuenta_gasto, '600');
  assert.strictEqual(res.data.cuenta_gasto_origen, 'regla');
  assert.strictEqual(pedido.evento, 'regla-contrapartida.aplicar.request');
  assert.strictEqual(pedido.payload.contexto.nif, 'B12345678');
  assert.strictEqual(res.data.hecho.asiento.lineas[0].cuenta, '600');
  assert.strictEqual(eventos(bus, 'contabilidad.hecho_recibido').length, 1);
});

test('documento que NO cuadra (base+IVA != total) → NO asienta y se encola', async () => {
  const { m, bus } = nuevo();
  m.config.cuenta_gasto_default = '629';
  const { res } = await componer(m, {
    project_id: 'p6',
    clase: 'factura',
    extraido: { ...FACTURA, base: '63,60', iva_importe: '6,36', total: '80,00' }
  });

  assert.strictEqual(res.data.asienta, false);
  assert.strictEqual(res.data.cuadra, false);
  assert.strictEqual(res.data.motivo, 'documento_no_cuadra');
  assert.ok(res.data.abierto.cifras, 'declara la diferencia en abierto.cifras');
  assert.strictEqual(eventos(bus, 'contabilidad.hecho_recibido').length, 0);
  assert.strictEqual(eventos(bus, 'encolado-excepcion.encolar.request').length, 1);
});

test('fecha inexistente (31/02/2026) → NO asienta y declara abierto.fecha', async () => {
  const { m, bus } = nuevo();
  m.config.cuenta_gasto_default = '629';
  const { res } = await componer(m, {
    project_id: 'p7', clase: 'factura', extraido: { ...FACTURA, fecha: '31/02/2026' }
  });

  assert.strictEqual(res.data.asienta, false);
  assert.strictEqual(res.data.motivo, 'fecha_invalida');
  assert.ok(res.data.abierto.fecha);
  assert.strictEqual(eventos(bus, 'contabilidad.hecho_recibido').length, 0);
});

test('clase "otro" → NO asienta y declara abierto.clase', async () => {
  const { m } = nuevo();
  m.config.cuenta_gasto_default = '629';
  const { res } = await componer(m, { project_id: 'p8', clase: 'otro', extraido: FACTURA });

  assert.strictEqual(res.data.asienta, false);
  assert.strictEqual(res.data.motivo, 'clase_sin_asiento');
  assert.ok(res.data.abierto.clase);
  assert.strictEqual(res.data.hecho, null);
});

test('IVA solo con iva_pct → cuota calculada (21% de 100,00 = 21,00) y asienta', async () => {
  const { m } = nuevo();
  m.config.cuenta_gasto_default = '629';
  const { res } = await componer(m, {
    project_id: 'p9',
    clase: 'factura',
    extraido: { proveedor: 'X SL', nif: 'B1', numero: '1', fecha: '01/03/2026', base: '100,00', iva_pct: '21', total: '121,00' }
  });

  assert.strictEqual(res.data.asienta, true);
  const lineas = res.data.hecho.asiento.lineas;
  assert.deepStrictEqual(lineas.map((l) => l.debe), [100, 21, 0]);
  assert.deepStrictEqual(lineas.map((l) => l.haber), [0, 0, 121]);
  assert.strictEqual(res.data.hecho.detalle.iva_origen, 'iva_pct');
});

test('clase ausente en el input pero DECLARADA en el documento (cadena real) → asienta igual', async () => {
  const { m } = nuevo();
  m.config.cuenta_gasto_default = '629';
  const { res } = await componer(m, {
    project_id: 'p10', clase: null, documento: { clase: 'factura' }, extraido: FACTURA
  });

  assert.strictEqual(res.data.clase, 'factura', 'la clase declarada por el clasificador se respeta');
  assert.strictEqual(res.data.asienta, true);
});

test('clase desconocida ("recibo") → NO se interpreta: abierto.clase y a la cola', async () => {
  const { m, bus } = nuevo();
  m.config.cuenta_gasto_default = '629';
  const { res } = await componer(m, { project_id: 'p11', clase: 'recibo', extraido: FACTURA });

  assert.strictEqual(res.data.asienta, false);
  assert.strictEqual(res.data.motivo, 'clase_no_declarada');
  assert.ok(res.data.abierto.clase);
  assert.strictEqual(eventos(bus, 'contabilidad.hecho_recibido').length, 0);
  assert.strictEqual(eventos(bus, 'encolado-excepcion.encolar.request').length, 1);
});

test('sin project_id → 400 INVALID_INPUT, .failed y ningún evento de dominio', async () => {
  const { m, bus } = nuevo();
  const { res } = await componer(m, { clase: 'factura', extraido: FACTURA });

  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.error.code, 'INVALID_INPUT');
  assert.strictEqual(eventos(bus, 'hecho-compra.componer.failed').length, 1);
  assert.strictEqual(eventos(bus, 'contabilidad.hecho_recibido').length, 0);
  assert.strictEqual(eventos(bus, 'encolado-excepcion.encolar.request').length, 0);
});

(async () => {
  let fallos = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok — ${t.name}`);
    } catch (err) {
      fallos += 1;
      console.error(`FALLO — ${t.name}\n  ${err.message}`);
    }
  }
  console.log(`\n${tests.length - fallos}/${tests.length} tests ok`);
  if (fallos > 0) process.exitCode = 1;
})();
