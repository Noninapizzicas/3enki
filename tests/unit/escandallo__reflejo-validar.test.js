'use strict';

/**
 * escandallo — REFLEJO _validar / _checkCosteo (EL FRENO, skill blueprint-agentico).
 *
 * Un escandallo no se valida con un schema de forma: su contrato es PROCEDENCIA + COHERENCIA.
 *   - PROCEDENCIA: cada precio es trazable (mercadona/catalogo/sub_receta/manual). El precio que
 *     el LLM INVENTA (fuente 'estimado_llm') NO es un coste de fiar → PRECIO_INVENTADO. Lo que
 *     Mercadona no tiene es sin_precio (honesto), no un número inventado.
 *   - COHERENCIA: valor=cantidad×precio, coste_total=Σlíneas, coste_unidad=coste_total/rinde →
 *     caza el total fabricado.
 *
 * Función pura: no lee ni escribe. Ejecutar: node tests/unit/escandallo__reflejo-validar.test.js
 */

const assert = require('assert');
const Escandallo = require('../../modules/pizzepos/escandallo');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const m = new Escandallo();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  return m;
}

// costeo bien formado: 2 líneas, precios de mercadona/catalogo, aritmética cuadrada.
const COSTEO_OK = {
  coste_total: 1.30,
  coste_unidad: 1.30,
  rinde: { cantidad: 1, unidad: 'ud' },
  lineas_detalle: [
    { ref: 'mozzarella', nombre: 'Mozzarella', cantidad: 80, unidad: 'g', precio_unitario: 0.0072, valor_calculado: 0.58, fuente: 'mercadona' },
    { ref: 'masa', nombre: 'Masa', cantidad: 1, unidad: 'ud', precio_unitario: 0.72, valor_calculado: 0.72, fuente: 'sub_receta' }
  ],
  lineas_sin_precio: [],
  fuentes_precios: ['mercadona', 'sub_receta']
};
const clon = () => JSON.parse(JSON.stringify(COSTEO_OK));

test('costeo trazable y coherente → valid:true, sin precios estimados', async () => {
  const m = nuevo();
  const r = await m._validar({ costeo: COSTEO_OK });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.valid, true, JSON.stringify(r.data.errors));
  assert.deepStrictEqual(r.data.precios_estimados, []);
  assert.strictEqual(r.data.lineas_costeadas, 2);
});

test('precio INVENTADO por el LLM (estimado_llm) → valid:false + PRECIO_INVENTADO + lista', async () => {
  const m = nuevo();
  const c = clon();
  c.lineas_detalle[0].fuente = 'estimado_llm';   // la fuga: un número inventado
  const r = await m._validar({ costeo: c });
  assert.strictEqual(r.data.valid, false);
  const e = r.data.errors.find(x => x.code === 'PRECIO_INVENTADO');
  assert.ok(e, 'debe rechazar el precio inventado');
  assert.deepStrictEqual(r.data.precios_estimados, ['Mozzarella']);
});

test('precio SOYSUPER con evidencia (url) → valid:true (afirmación externa rectificable entra)', async () => {
  const m = nuevo();
  const c = clon();
  c.lineas_detalle[0].fuente = 'soysuper';
  c.lineas_detalle[0].evidencia = 'https://soysuper.com/p/mozzarella-maxi-santa-lucia-250-g';
  const r = await m._validar({ costeo: c });
  assert.strictEqual(r.data.valid, true, JSON.stringify(r.data.errors));
  assert.deepStrictEqual(r.data.precios_estimados, []);
});

test('precio SOYSUPER SIN evidencia → valid:false + PRECIO_SIN_EVIDENCIA (label sin dirección de vuelta)', async () => {
  const m = nuevo();
  const c = clon();
  c.lineas_detalle[0].fuente = 'soysuper';   // el número parece bueno, pero sin url no es rectificable
  const r = await m._validar({ costeo: c });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(x => x.code === 'PRECIO_SIN_EVIDENCIA' && x.path === '/lineas/0'),
    'un precio soysuper sin url debe caer: ' + JSON.stringify(r.data.errors));
});

test('total FABRICADO (no cuadra con las líneas) → TOTAL_INCOHERENTE', async () => {
  const m = nuevo();
  const c = clon();
  c.coste_total = 99.99;   // mentira: las líneas suman 1.30
  const r = await m._validar({ costeo: c });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(x => x.code === 'TOTAL_INCOHERENTE'));
});

test('valor de línea incoherente (valor ≠ cantidad×precio) → VALOR_INCOHERENTE', async () => {
  const m = nuevo();
  const c = clon();
  c.lineas_detalle[1].valor_calculado = 5.00;   // 1×0.72 ≠ 5.00
  const r = await m._validar({ costeo: c });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(x => x.code === 'VALOR_INCOHERENTE' && x.path === '/lineas/1'));
});

test('precio no finito (NaN/negativo) → PRECIO_NO_FINITO', async () => {
  const m = nuevo();
  const c = clon();
  c.lineas_detalle[0].precio_unitario = -1;
  const r = await m._validar({ costeo: c });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(x => x.code === 'PRECIO_NO_FINITO'));
});

test('LEY DE LA EVIDENCIA: fuente desconocida SIN evidencia → PRECIO_SIN_EVIDENCIA (fértil, no muro)', async () => {
  const m = nuevo();
  const c = clon();
  c.lineas_detalle[0].fuente = 'adivinada';   // afirmación externa sin dirección de vuelta
  const r = await m._validar({ costeo: c });
  assert.strictEqual(r.data.valid, false);
  const err = r.data.errors.find(x => x.code === 'PRECIO_SIN_EVIDENCIA');
  assert.ok(err, 'debe caer por falta de evidencia, no por el nombre');
  assert.ok(/direcci[oó]n de vuelta/.test(err.message), 'el error prescribe el camino (fértil)');
});

test('LEY DE LA EVIDENCIA: fuente desconocida CON evidencia → ENTRA (la fuente jamás se veta por nombre)', async () => {
  const m = nuevo();
  const c = clon();
  c.lineas_detalle[0].fuente = 'makro';       // fuente que no existía ayer
  c.lineas_detalle[0].url = 'https://tienda.makro.es/p/mozzarella-1kg';
  const r = await m._validar({ costeo: c });
  assert.strictEqual(r.data.valid, true, 'makro + url = rectificable: entra sin tocar una línea de código');
});

test('coste_unidad incoherente con el rinde → COSTE_UNIDAD_INCOHERENTE', async () => {
  const m = nuevo();
  const c = clon();
  c.rinde = { cantidad: 2, unidad: 'ud' };   // coste_unidad debería ser 0.65, no 1.30
  const r = await m._validar({ costeo: c });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(x => x.code === 'COSTE_UNIDAD_INCOHERENTE'));
});

test('todo sin_precio (desglose vacío) → valid (honesto: nada que costear aún)', async () => {
  const m = nuevo();
  const r = await m._validar({ costeo: { coste_total: 0, coste_unidad: 0, rinde: { cantidad: 1, unidad: 'ud' }, lineas_detalle: [], lineas_sin_precio: ['Mozzarella', 'Masa'], fuentes_precios: ['no_disponible'] } });
  assert.strictEqual(r.data.valid, true);
});

test('acepta el costeo en bruto (sin envoltorio "costeo")', async () => {
  const m = nuevo();
  const r = await m._validar(COSTEO_OK);
  assert.strictEqual(r.data.valid, true);
});

test('sin costeo → INVALID_INPUT (400)', async () => {
  const m = nuevo();
  const r = await m._validar({ costeo: null });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[escandallo__reflejo-validar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[escandallo__reflejo-validar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
