'use strict';

/**
 * bocaos/factura-gestion — H03. El cierre convertido en documento de cobro de una parte.
 *
 * Lo que se vigila:
 *   1. Sólo lo devengado en ese cierre: ni un concepto más.
 *   2. Lo que está en duda (Q18) NO se factura: se declara en `no_facturado`.
 *   3. El IVA, la serie y la forma jurídica son Q4: campos vacíos marcados, nunca un 21% inventado.
 *   4. Una factura por cierre y parte: la misma llave da el mismo documento; la segunda, con motivo,
 *      es RECTIFICATIVA.
 *
 * Ejecutar: node tests/unit/bocaos__factura-gestion.test.js
 */

const assert = require('assert');
const FacturaGestion = require('../../modules/bocaos/factura-gestion/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';

const CIERRE = {
  cierre_id: 'li-aaaa1111',
  periodo: '2026-W45',
  plaza_id: PLAZA,
  cerrado_en: '2026-11-09T03:00:00.000Z',
  estado: 'CERRADO',
  huella: 'abc123',
  partes: [
    {
      parte_id: 'rider-ana', parte: 'rider', contrato_id: 'ct-1', tramo: 2,
      pedidos: 12, cents_por_pedido: 10,
      variable_seguro_centimos: 120, variable_en_duda_centimos: 10,
      fijo_mensual_centimos: 7900, fijo_periodo_centimos: 1843, fijo_estado: 'PRORRATEADO',
      prorrateo: { dias_periodo: 7, dias_mes: 30 },
      total_seguro_centimos: 1963, total_seguro_estado: 'SUMA', devenga: true,
      detalle: [{ pedido_id: 'ped-3', estado: 'en_duda' }, { pedido_id: 'ped-4', estado: 'seguro' }]
    },
    {
      parte_id: 'tienda-paco', parte: 'tienda', contrato_id: 'ct-2', tramo: 1,
      pedidos: 30, cents_por_pedido: 20,
      variable_seguro_centimos: 600, variable_en_duda_centimos: 0,
      fijo_mensual_centimos: 3900, fijo_periodo_centimos: null, fijo_estado: 'NO_CONSTA',
      total_seguro_centimos: null, total_seguro_estado: 'NO_CONSTA', devenga: true,
      motivo_fijo: 'el fijo es mensual y el ciclo semanal: la parte que toca no consta (Q26)',
      detalle: [{ pedido_id: 'ped-1', estado: 'seguro' }]
    }
  ]
};

function nuevo({ cierre = CIERRE } = {}) {
  const publicados = [];
  const m = new FacturaGestion();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    if (ev !== 'liquidacion.de.request') return null;
    if (!cierre || payload.periodo !== cierre.periodo) return { status: 404, error: { code: 'PERIODO_NO_CONSTA' } };
    return { status: 200, data: { periodo: cierre.periodo, estado: 'CERRADO', cierre } };
  };
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const emitir = (m, extra) => m.onEmitirRequest({ request_id: 'e', data: { project_id: PLAZA, periodo: '2026-W45', parte_id: 'rider-ana', ...extra } });

test('emite el documento con las líneas del cierre y lo publica como hecho', async () => {
  const { m, eventos } = nuevo();
  const r = await emitir(m);
  assert.strictEqual(r.status, 201);
  const doc = r.data.documento;
  assert.strictEqual(doc.cierre_id, 'li-aaaa1111');
  assert.strictEqual(doc.receptor.parte_id, 'rider-ana');
  assert.strictEqual(doc.base_centimos, 1963);
  assert.strictEqual(doc.lineas.length, 2, 'variable + fijo: nada más');
  assert.strictEqual(doc.lineas[0].importe_centimos, 120);
  assert.strictEqual(doc.lineas[1].importe_centimos, 1843);
  assert.ok(/E04\/A32/.test(doc.lineas[0].base), 'la línea dice de dónde sale el número');
  assert.strictEqual(eventos('bocaos.documento_emitido').length, 1);
  assert.strictEqual(eventos('bocaos.documento_emitido')[0].p.total_centimos, 1963);
});

test('una factura por cierre y parte: la misma llave da el mismo documento', async () => {
  const { m, eventos } = nuevo();
  const a = await emitir(m);
  const b = await emitir(m);
  assert.strictEqual(a.data.documento.documento_id, b.data.documento.documento_id);
  assert.strictEqual(a.data.documento.huella, b.data.documento.huella);
  assert.strictEqual(b.data.misma_llave, true);
  assert.strictEqual(eventos('bocaos.documento_emitido').length, 2, 'el hecho se repite con la MISMA llave: deduplica quien cobra');
  assert.strictEqual(eventos('bocaos.documento_emitido')[0].p.documento_id, eventos('bocaos.documento_emitido')[1].p.documento_id);
});

test('la segunda sólo es RECTIFICATIVA, y exige motivo', async () => {
  const { m, eventos } = nuevo();
  const primera = await emitir(m);
  const sinMotivo = await emitir(m, { rectifica: { documento_id: primera.data.documento.documento_id } });
  assert.strictEqual(sinMotivo.status, 409);
  assert.strictEqual(sinMotivo.error.code, 'RECTIFICATIVA_SIN_MOTIVO');

  const rect = await emitir(m, { rectifica: { documento_id: primera.data.documento.documento_id, motivo: 'se contó dos veces el pedido 4' } });
  assert.strictEqual(rect.status, 201);
  assert.strictEqual(rect.data.documento.tipo, 'RECTIFICATIVA');
  assert.strictEqual(rect.data.documento.rectifica_a, primera.data.documento.documento_id);
  assert.notStrictEqual(rect.data.documento.documento_id, primera.data.documento.documento_id);
  assert.strictEqual(eventos('bocaos.documento_emitido')[1].p.tipo, 'RECTIFICATIVA');
});

test('sin tipo de IVA declarado: NO_CONSTA, ni una cuota inventada (Q4)', async () => {
  const { m } = nuevo();
  const doc = (await emitir(m)).data.documento;
  assert.strictEqual(doc.iva.tipo, null);
  assert.strictEqual(doc.iva.cuota_centimos, null);
  assert.strictEqual(doc.iva.estado, 'NO_CONSTA');
  assert.ok(/Q4/.test(doc.iva.motivo));
  assert.strictEqual(doc.total_centimos, 1963, 'se cobra la cuota devengada (la base)');
  assert.strictEqual(doc.total_estado, 'SIN_IVA_DECLARADO');
  assert.strictEqual(doc.serie, null);
  assert.strictEqual(doc.numero, null);
  assert.ok(/Q4/.test(doc.numeracion));
  assert.strictEqual(doc.receptor.forma_juridica_estado, 'NO_CONSTA');
  assert.ok(/Q4/.test(doc.quien_factura_a_quien));
});

test('con el tipo DECLARADO se multiplica, y se dice que el tipo no es de aquí', async () => {
  const { m } = nuevo();
  const doc = (await emitir(m, { iva: { tipo: 21 } })).data.documento;
  assert.strictEqual(doc.iva.estado, 'CALCULADA');
  assert.strictEqual(doc.iva.cuota_centimos, 412, '1963 × 21% = 412,23 → 412');
  assert.strictEqual(doc.iva.total_con_iva_centimos, 2375);
  assert.ok(/lo declara quien emite/.test(doc.iva.nota));
  assert.strictEqual(doc.total_estado, 'CON_IVA');
});

test('lo que está en duda NO se factura: se declara aparte (Q18)', async () => {
  const { m } = nuevo();
  const doc = (await emitir(m)).data.documento;
  assert.strictEqual(doc.lineas.some((l) => /duda/.test(l.concepto)), false, 'la duda no es una línea de la factura');
  assert.strictEqual(doc.no_facturado.length, 1);
  assert.deepStrictEqual(doc.no_facturado[0].pedidos, ['ped-3']);
  assert.strictEqual(doc.no_facturado[0].importe_centimos, 10);
  assert.strictEqual(doc.no_facturado[0].estado, 'NO_CONSTA');
});

test('el fijo que no consta deja el documento INCOMPLETO y no cobrable', async () => {
  const { m } = nuevo();
  const doc = (await emitir(m, { parte_id: 'tienda-paco' })).data.documento;
  assert.strictEqual(doc.base_centimos, null, 'sin la parte del fijo no hay base');
  assert.strictEqual(doc.cobrable, false);
  assert.strictEqual(doc.total_estado, 'NO_CONSTA');
  const lineaFijo = doc.lineas.find((l) => /fijo/.test(l.concepto));
  assert.strictEqual(lineaFijo.estado, 'NO_CONSTA');
  assert.ok(/Q26/.test(lineaFijo.motivo));
  assert.ok(doc.no_es.includes('comida'), 'el documento no es la comida ni el reparto (H06)');
});

test('sin cierre no hay documento; y una parte sin devengo tampoco', async () => {
  const { m, eventos } = nuevo();
  const sinCierre = await emitir(m, { periodo: '2026-W99' });
  assert.strictEqual(sinCierre.status, 404);
  assert.strictEqual(sinCierre.error.code, 'CIERRE_NO_CONSTA');

  const sinParte = await emitir(m, { parte_id: 'rider-nadie' });
  assert.strictEqual(sinParte.status, 404);
  assert.strictEqual(sinParte.error.code, 'PARTE_NO_CONSTA');
  assert.strictEqual(eventos('bocaos.documento_emitido').length, 0);

  const sinNada = await emitir(m, { periodo: undefined });
  assert.strictEqual(sinNada.status, 404, 'sin periodo ni cierre no se adivina el cierre');
});

test('de reconstruye el mismo documento desde el cierre, sin guardar nada', async () => {
  const { m } = nuevo();
  const emitido = (await emitir(m)).data.documento;
  const reconstruido = await m.onDeRequest({ request_id: 'd', data: { project_id: PLAZA, periodo: '2026-W45', parte_id: 'rider-ana' } });
  assert.strictEqual(reconstruido.status, 200);
  assert.strictEqual(reconstruido.data.reconstruido, true);
  assert.strictEqual(reconstruido.data.documento.documento_id, emitido.documento_id);
  assert.strictEqual(reconstruido.data.documento.huella, emitido.huella);
});

test('un periodo abierto (sin cierre) no se factura', async () => {
  const abierto = { ...CIERRE, estado: 'ABIERTO' };
  const { m, eventos } = nuevo({ cierre: abierto });
  const r = await emitir(m);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'CIERRE_NO_CONSTA');
  assert.strictEqual(eventos('bocaos.documento_emitido').length, 0);
});

(async () => {
  let fallos = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`ok — ${t.name}`); }
    catch (err) { fallos += 1; console.error(`FALLO — ${t.name}\n  ${err.message}`); }
  }
  console.log(`\n${tests.length - fallos}/${tests.length} tests ok`);
  if (fallos > 0) process.exitCode = 1;
})();
