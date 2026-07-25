'use strict';

/**
 * uiwebv2__anatomia-a-spec — el REFLEJO de uiwebv2: anatomía → UI-SPEC, determinista.
 * La prueba de que la forma es real: mismo input → mismo output, estructura por reglas
 * (no por el LLM). Si esto pasa, el agente solo tiene que estilizar sobre el esqueleto.
 *
 * Ejecutar: node tests/unit/uiwebv2__anatomia-a-spec.test.js
 */

const assert = require('assert');
const { buildSpec, camposDesdeShape, MARCA_DEFAULT } = require('../../.claude/skills/uiwebv2/anatomia-a-spec.js');

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('input vacío → spec válido con marca default y colecciones vacías', () => {
  const s = buildSpec({});
  assert.strictEqual(s.esquema, 'ui-spec-v1');
  assert.deepStrictEqual(s.marca.colores, MARCA_DEFAULT.colores);
  assert.strictEqual(s.marca.fuentes, MARCA_DEFAULT.fuentes);
  assert.deepStrictEqual(s.nav, []);
  assert.deepStrictEqual(s.secciones, []);
});

test('dominios vivos → una sección de datos cada uno + nav derivada', () => {
  const s = buildSpec({ dominios: [
    { clave: 'ventas', titulo: 'Ventas', muestra: { total: 320 } },
    { clave: 'cuentas_activas' }
  ] });
  const datos = s.secciones.filter(x => x.tipo === 'datos');
  assert.strictEqual(datos.length, 2);
  assert.strictEqual(datos[0].id, 'ventas');
  assert.deepStrictEqual(datos[0].muestra, { total: 320 });
  assert.strictEqual(datos[1].titulo, 'Cuentas activas', 'titulo legible desde la clave');
  // nav DERIVADA de las secciones (regla, no invención). El id va SLUGado (id de DOM limpio).
  assert.deepStrictEqual(s.nav.map(n => n.id), ['ventas', 'cuentas-activas']);
});

test('capacidades → operaciones ordenadas + campos desde request_shape + sección operaciones', () => {
  const s = buildSpec({ capacidades: [
    { name: 'cobro.crear', tipo: 'rpc', request_shape: { properties: { monto: { type: 'number', description: 'cts' }, metodo: { type: 'string' } }, required: ['monto'] } },
    { name: 'carrito.add', tipo: 'rpc', request_shape: { properties: { id: { type: 'string' } } } }
  ] });
  // orden determinista: por dominio, luego name → carrito.add antes que cobro.crear
  assert.deepStrictEqual(s.operaciones.map(o => o.name), ['carrito.add', 'cobro.crear']);
  const cobro = s.operaciones.find(o => o.name === 'cobro.crear');
  assert.strictEqual(cobro.dominio, 'cobro');
  const monto = cobro.campos.find(c => c.nombre === 'monto');
  assert.strictEqual(monto.tipo, 'number');
  assert.strictEqual(monto.requerido, true);
  assert.ok(s.secciones.some(x => x.tipo === 'operaciones' && x.total === 2));
});

test('cupulas → sección inventario', () => {
  const s = buildSpec({ cupulas: [{ id: 'proyecto', tipo: 'vista', notas_count: 1 }] });
  const inv = s.secciones.find(x => x.tipo === 'inventario');
  assert.ok(inv);
  assert.strictEqual(inv.items[0].tema, 'proyecto');
  assert.strictEqual(inv.items[0].notas, 1);
});

test('marca: identidad tiñe, colores parciales se fusionan con el default', () => {
  const s = buildSpec({ identidad: { name: 'Nonina', tipo: 'pizzeria', marca: { colores: { acento: '#e63946' } } } });
  assert.strictEqual(s.marca.nombre, 'Nonina');
  assert.strictEqual(s.marca.tipo, 'pizzeria');
  assert.strictEqual(s.marca.colores.acento, '#e63946', 'override');
  assert.strictEqual(s.marca.colores.fondo, MARCA_DEFAULT.colores.fondo, 'lo no dado cae al default');
});

test('camposDesdeShape: sin properties → []; required se marca', () => {
  assert.deepStrictEqual(camposDesdeShape(null), []);
  assert.deepStrictEqual(camposDesdeShape({}), []);
  const c = camposDesdeShape({ properties: { a: { type: 'string' } }, required: ['a'] });
  assert.deepStrictEqual(c, [{ nombre: 'a', tipo: 'string', requerido: true, descripcion: '' }]);
});

test('DETERMINISMO: mismo input dos veces → deep equal (la promesa del reflejo)', () => {
  const input = {
    identidad: { name: 'X', marca: { colores: { acento: '#123456' } } },
    dominios: [{ clave: 'a' }, { clave: 'b' }],
    capacidades: [{ name: 'z.uno' }, { name: 'a.dos' }],
    cupulas: [{ id: 'c1' }]
  };
  assert.deepStrictEqual(buildSpec(input), buildSpec(input));
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[uiwebv2__anatomia-a-spec] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[uiwebv2__anatomia-a-spec] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();
