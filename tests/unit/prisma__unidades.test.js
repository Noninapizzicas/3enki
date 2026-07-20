'use strict';
/**
 * prisma__unidades — el CONVERSOR PURO: unidades, precio por base y fórmula panadera (escalado).
 * Todo función pura. Ejecutar: node tests/unit/prisma__unidades.test.js
 */
const assert = require('assert');
const U = require('../../modules/_shared/prisma-unidades.js');
const tests = [];
const test = (n, f) => tests.push({ n, f });
const cerca = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`);

test('aBase: kg→g, l→ml, docena→u', () => {
  cerca(U.aBase(2, 'kg').cantidad, 2000);
  cerca(U.aBase(1.5, 'l').cantidad, 1500);
  cerca(U.aBase(1, 'docena').cantidad, 12);
  assert.strictEqual(U.aBase(1, 'xyz').error, 'unidad_desconocida');
});

test('convertir misma dimensión: 2500 g → 2.5 kg', () => cerca(U.convertir(2500, 'g', 'kg'), 2.5));

test('convertir masa↔volumen SOLO con densidad', () => {
  cerca(U.convertir(1000, 'g', 'ml', 1.03), 1000 / 1.03);   // leche ~1.03 g/ml
  cerca(U.convertir(1, 'l', 'g', 1.03), 1030);              // 1 L de leche → 1030 g
  assert.strictEqual(U.convertir(1000, 'g', 'ml'), null, 'sin densidad NO inventa');
  assert.strictEqual(U.convertir(3, 'u', 'g', 1), null, 'conteo no cruza');
});

test('precioPorBase: 350c/kg → 0.35 c/g', () => {
  const r = U.precioPorBase({ precio_centimos: 350, cantidad: 1, unidad: 'kg' });
  cerca(r.coste_centimos_por_unidad, 0.35);
  assert.strictEqual(r.base, 'g');
});
test('precioPorBase: 80c/unidad → 80 c/u', () => {
  cerca(U.precioPorBase({ precio_centimos: 80, cantidad: 1, unidad: 'ud' }).coste_centimos_por_unidad, 80);
});

test('porcentajePanadero: harina=100%, agua 65%, sal 2%', () => {
  const r = U.porcentajePanadero([
    { ref: 'harina', cantidad: 1000, unidad: 'g' },
    { ref: 'agua', cantidad: 650, unidad: 'g' },
    { ref: 'sal', cantidad: 20, unidad: 'g' },
  ], 'harina');
  assert.strictEqual(r.formula.find(x => x.ref === 'harina').pct, 100);
  assert.strictEqual(r.formula.find(x => x.ref === 'agua').pct, 65);
  assert.strictEqual(r.formula.find(x => x.ref === 'sal').pct, 2);
  assert.deepStrictEqual(r.faltantes, []);
});

test('porcentajePanadero: agua en ml con densidad 1.0 → mismo %', () => {
  const r = U.porcentajePanadero([
    { ref: 'harina', cantidad: 1, unidad: 'kg' },
    { ref: 'agua', cantidad: 650, unidad: 'ml', densidad_g_ml: 1.0 },
  ], 'harina');
  assert.strictEqual(r.formula.find(x => x.ref === 'agua').pct, 65);
});

test('porcentajePanadero: componente sin masa (conteo) → faltante, NO inventa', () => {
  const r = U.porcentajePanadero([
    { ref: 'harina', cantidad: 1000, unidad: 'g' },
    { ref: 'huevo', cantidad: 2, unidad: 'u' },
  ], 'harina');
  assert.deepStrictEqual(r.faltantes, ['huevo']);
});

test('escalar modo referencia: 10 kg de harina → agua 6.5 kg', () => {
  const f = [{ ref: 'harina', pct: 100 }, { ref: 'agua', pct: 65 }, { ref: 'sal', pct: 2 }];
  const e = U.escalar(f, { modo: 'referencia', gramos: 10000 });
  cerca(e.find(x => x.ref === 'harina').cantidad, 10000);
  cerca(e.find(x => x.ref === 'agua').cantidad, 6500);
  cerca(e.find(x => x.ref === 'sal').cantidad, 200);
});

test('escalar modo total: 5 kg de tanda → reparte por los %', () => {
  const f = [{ ref: 'harina', pct: 100 }, { ref: 'agua', pct: 65 }, { ref: 'sal', pct: 2 }];
  const e = U.escalar(f, { modo: 'total', gramos: 5000 });
  const total = e.reduce((s, x) => s + x.cantidad, 0);
  cerca(total, 5000, 0.01);
  cerca(e.find(x => x.ref === 'harina').cantidad, 5000 / 1.67, 0.01);   // 167% suma → harina = total/1.67 (lib redondea a 3 dec)
});

test('precioReferencia: NO el más barato — prudente, tirando a alto (p75)', () => {
  // [10,12,15,20] → p75 = 15 + (20-15)*(2.25-2)=16.25. Por encima de la mediana (13.5), lejos del mínimo (10).
  cerca(U.precioReferencia([10, 12, 15, 20]), 16.25);
  assert.ok(U.precioReferencia([10, 12, 15, 20]) > 13.5, 'por encima de la mediana');
});
test('precioReferencia: un solo precio → ese; ninguno → null', () => {
  assert.strictEqual(U.precioReferencia([42]), 42);
  assert.strictEqual(U.precioReferencia([]), null);
  assert.strictEqual(U.precioReferencia(['x', -3, NaN]), null, 'descarta inválidos');
});

(async () => {
  let ok = 0;
  for (const { n, f } of tests) { try { await f(); console.log('  ✓ ' + n); ok++; } catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); } }
  console.log(`[prisma__unidades] ${ok === tests.length ? 'OK' : 'FAIL'} ${ok}/${tests.length}`);
  process.exit(ok === tests.length ? 0 : 1);
})();
