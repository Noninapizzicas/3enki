'use strict';
/**
 * prisma__puente-compuesto — el puente prisma-puro compuesto↔producto↔precio.
 * _decidir (aplicar/testigo, no pisa precio manual) y _pendienteDeAtar son PUROS.
 * _puente y _atar con _rpc mockeado. Ejecutar: node tests/unit/prisma__puente-compuesto.test.js
 */
const assert = require('assert');
const Mod = require('../../modules/prisma/puente-compuesto/index.js');
const tests = [];
const test = (n, f) => tests.push({ n, f });
function fresh() { const m = new Mod(); m.logger = { info(){},warn(){},error(){},debug(){} }; m._pub = []; m.eventBus = { publish: (ev, p) => m._pub.push({ ev, p }) }; m.metrics = { increment(){} }; return m; }

test('_decidir: sin precio → aplicar', () => {
  const m = fresh();
  assert.strictEqual(m._decidir({ preguntas_abiertas: [{ campo: 'coste', respondida: false }] }, 100, 0.3).accion, 'aplicar');
});
test('_decidir: precio manual firme + coste cerrado → testigo (no pisa)', () => {
  const m = fresh();
  const d = m._decidir({ precio_base_centimos: 1050, preguntas_abiertas: [{ campo: 'coste', respondida: true }] }, 100, 0.3);
  assert.strictEqual(d.accion, 'testigo');
});
test('_pendienteDeAtar: solo elaborado sin ref', () => {
  const m = fresh();
  assert.ok(m._pendienteDeAtar({ nombre: 'Funk', naturalezas: { origen: 'elaborado' } }));
  assert.ok(!m._pendienteDeAtar({ nombre: 'Funk', naturalezas: { origen: 'elaborado' }, compuesto_ref: 'x' }), 'ya atado');
  assert.ok(!m._pendienteDeAtar({ nombre: 'Cola', naturalezas: { origen: 'de_reventa' } }), 'de_reventa no');
});

function conCatalogo(prod, food) {
  const m = fresh();
  m._rpc = async (ev, p) => {
    if (ev === 'catalogo.list.request') return { status: 200, data: [{ id: 'c1', estado: 'en_servicio' }] };
    if (ev === 'catalogo.get.request') return { status: 200, data: { productos: [prod] } };
    if (ev === 'coste.aplicar.request') { m._aplicado = p; return { status: 200 }; }
    return { status: 404 };
  };
  return m;
}

test('_puente: coste PRISMA → coste.aplicar en el producto que lo referencia', async () => {
  const m = conCatalogo({ id: 'pz', compuesto_ref: 'samba', preguntas_abiertas: [{ campo: 'coste', respondida: false }] });
  await m._puente({ project_id: 'p', compuesto_id: 'samba', coste_unidad: 0.69 });
  assert.ok(m._aplicado, 'llamó coste.aplicar');
  assert.strictEqual(m._aplicado.componentes[0].coste_centimos, 69);
});

test('_puente: precio manual → testigo (puente.coste_actualizado, NO aplica)', async () => {
  const m = conCatalogo({ id: 'pz', compuesto_ref: 'samba', precio_base_centimos: 1050, preguntas_abiertas: [{ campo: 'coste', respondida: true }] });
  await m._puente({ project_id: 'p', compuesto_id: 'samba', coste_centimos: 69 });
  assert.ok(!m._aplicado, 'NO pisó el precio');
  assert.ok(m._pub.some(x => x.ev === 'puente.coste_actualizado'), 'cantó la deriva');
});

test('_puente: nadie referencia el compuesto → GATE (no hace nada)', async () => {
  const m = conCatalogo({ id: 'pz', compuesto_ref: 'otro' });
  await m._puente({ project_id: 'p', compuesto_id: 'samba', coste_centimos: 69 });
  assert.ok(!m._aplicado && m._pub.length === 0, 'gate: los no-referenciados no se precian');
});

test('_atar: producto elaborado sin ref → compuesto homónimo por nombre', async () => {
  const m = fresh();
  m._atado = null;
  m._rpc = async (ev, p) => {
    if (ev === 'compuestos.list.request') return { status: 200, data: { compuestos: [{ id: 'pizza_samba', nombre: 'Pizza Samba' }] } };
    if (ev === 'catalogo.update_product.request') { m._atado = p; return { status: 200 }; }
    return { status: 404 };
  };
  await m._atar({ project_id: 'p', catalogo: { meta: { id: 'c1' }, productos: [{ id: 'pz', nombre: 'pizza samba', naturalezas: { origen: 'elaborado' } }] } });
  assert.ok(m._atado, 'ató');
  assert.strictEqual(m._atado.campos.compuesto_ref, 'pizza_samba', 'por nombre normalizado');
});

(async () => {
  let ok = 0;
  for (const { n, f } of tests) { try { await f(); console.log('  ✓ ' + n); ok++; } catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); } }
  console.log(`[prisma__puente-compuesto] ${ok === tests.length ? 'OK' : 'FAIL'} ${ok}/${tests.length}`);
  process.exit(ok === tests.length ? 0 : 1);
})();
