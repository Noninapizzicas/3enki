'use strict';

/**
 * bocaos/frontera-plaza — S01 (FronteraDePlaza) · S02 (FiltroPorCobertura).
 *
 * Lo que se vigila:
 *   1. Sin zona declarada, o sin cobertura, la respuesta es NO_CONSTA y se nombra el hueco:
 *      la frontera no adivina a qué plaza pertenece una dirección.
 *   2. Dos coberturas solapadas sin desempate declarado → AMBIGUA(plazas) y no hay pedido (Q52).
 *      Con desempate declarado, sí hay plaza — y se dice cuál y por qué.
 *   3. El filtro es la INTERSECCIÓN de la cobertura de la plaza (J03) y lo que la tienda declara
 *      (D06): una tienda sin cobertura declarada no entra con un «sí» de cortesía.
 *   4. Filtrar no es ordenar: el orden es el del censo.
 *   5. Es un reflejo: no escribe nada y no guarda posiciones.
 *
 * Ejecutar: node tests/unit/bocaos__frontera-plaza.test.js
 */

const assert = require('assert');
const FronteraPlaza = require('../../modules/bocaos/frontera-plaza/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';

// El bus de mentira: publica y deja contestar los dos puertos que este peldaño no construye.
function nuevo({ zonasPlaza = ['centro', 'norte'], tiendas = [], sinCenso = false } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new FronteraPlaza();
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'config-mercado.politica.request') {
      return { status: 200, data: { politica: { version: 1, cobertura: { zonas: zonasPlaza } } } };
    }
    if (ev === 'censo-parte.de.request') {
      if (sinCenso) return null;
      return { status: 200, data: { tiendas } };
    }
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const cubre = (m, extra) => m.onCubreRequest({ request_id: 'c', data: { project_id: PLAZA, plaza_id: PLAZA, ...extra } });
const zonas = (m, extra) => m.onZonasRequest({ request_id: 'z', data: { project_id: PLAZA, plaza_id: PLAZA, ...extra } });

test('una dirección con zona, dentro de la cobertura declarada, cae en la plaza', async () => {
  const { m, eventos } = nuevo();
  const r = await cubre(m, { direccion: { zona: 'centro' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.cubre, true);
  assert.strictEqual(r.data.estado, 'PLAZA');
  assert.strictEqual(r.data.plaza_id, PLAZA, 'la cobertura sale de la política de la plaza (J03)');
  assert.strictEqual(eventos('bocaos.direccion_sin_plaza').length, 0);
});

test('sin zona declarada NO se estima: NO_CONSTA, hueco nombrado y su hecho', async () => {
  const { m, eventos } = nuevo();
  const r = await cubre(m, { direccion: { texto: 'calle Larios 3' } });
  assert.strictEqual(r.data.cubre, null);
  assert.strictEqual(r.data.estado, 'NO_CONSTA');
  assert.strictEqual(r.data.hueco, 'sin zona declarada');
  const hechos = eventos('bocaos.direccion_sin_plaza');
  assert.strictEqual(hechos.length, 1);
  assert.strictEqual(hechos[0].p.hay_pedido, false);
});

test('fuera de cobertura: no hay plaza, no hay pedido, y queda el hecho', async () => {
  const { m, eventos } = nuevo();
  const r = await cubre(m, { direccion: { zona: 'sur' } });
  assert.strictEqual(r.data.cubre, false);
  assert.strictEqual(r.data.plaza_id, null);
  assert.strictEqual(eventos('bocaos.direccion_sin_plaza').length, 1);
  assert.ok(eventos('bocaos.direccion_sin_plaza')[0].p.motivo.includes('ninguna plaza'));
});

test('Q52: dos coberturas solapadas sin desempate → AMBIGUA y no hay pedido', async () => {
  const { m, eventos } = nuevo();
  const r = await cubre(m, {
    direccion: { zona: 'centro' },
    plazas: [
      { plaza_id: 'plaza-malaga', zonas: ['centro'] },
      { plaza_id: 'plaza-marbella', zonas: ['centro', 'este'] }
    ]
  });
  assert.strictEqual(r.data.estado, 'AMBIGUA');
  assert.strictEqual(r.data.cubre, null);
  assert.deepStrictEqual(r.data.plazas, ['plaza-malaga', 'plaza-marbella']);
  assert.strictEqual(r.data.plaza_id, null, 'no se elige la primera: eso es decidir por el cliente');
  assert.strictEqual(eventos('bocaos.frontera_ambigua').length, 1);
});

test('con desempate DECLARADO sí hay plaza, y se dice por qué', async () => {
  const { m, eventos } = nuevo();
  const r = await cubre(m, {
    direccion: { zona: 'centro' },
    plazas: [
      { plaza_id: 'plaza-malaga', zonas: ['centro'] },
      { plaza_id: 'plaza-marbella', zonas: ['centro'] }
    ],
    desempate: { plaza_id: 'plaza-marbella', motivo: 'acuerdo entre plazas' }
  });
  assert.strictEqual(r.data.estado, 'PLAZA');
  assert.strictEqual(r.data.plaza_id, 'plaza-marbella');
  assert.strictEqual(r.data.desempate, 'acuerdo entre plazas');
  assert.strictEqual(eventos('bocaos.frontera_ambigua').length, 0);
});

test('S02: sólo entran las tiendas que LLEGAN en esa dirección', async () => {
  const { m } = nuevo({
    tiendas: [
      { tienda_id: 'tienda-paco', nombre: 'Paco', zonas: ['centro'] },
      { tienda_id: 'tienda-lejos', nombre: 'Lejos', zonas: ['este'] },
      { tienda_id: 'tienda-muda', nombre: 'Muda', zonas: null }
    ]
  });
  const r = await zonas(m, { direccion: { zona: 'centro' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.plaza_llega, true);
  assert.deepStrictEqual(r.data.tiendas_que_llegan.map((t) => t.tienda_id), ['tienda-paco']);
  const no = r.data.tiendas_que_no.map((t) => [t.tienda_id, t.llega, t.motivo]);
  assert.deepStrictEqual(no, [
    ['tienda-lejos', false, 'la tienda no reparte en esa zona'],
    ['tienda-muda', null, 'la tienda no ha declarado dónde reparte (D06)']
  ]);
  assert.deepStrictEqual(r.data.a_la_inversa, [
    { tienda_id: 'tienda-paco', zonas: ['centro'] },
    { tienda_id: 'tienda-lejos', zonas: ['este'] },
    { tienda_id: 'tienda-muda', zonas: [] }
  ]);
});

test('S02: si la plaza no cubre la zona, no llega nadie (aunque la tienda diga que sí)', async () => {
  const { m } = nuevo({
    tiendas: [{ tienda_id: 'tienda-paco', zonas: ['centro', 'sur'] }],
    zonasPlaza: ['centro']
  });
  const r = await zonas(m, { direccion: { zona: 'sur' } });
  assert.strictEqual(r.data.plaza_llega, false);
  assert.deepStrictEqual(r.data.tiendas_que_llegan, []);
  assert.strictEqual(r.data.tiendas_que_no[0].motivo, 'la plaza no cubre esa zona (J03)');
});

test('sin censo el hueco se dice: no se devuelve una lista vacía como si no hubiera tiendas', async () => {
  const { m } = nuevo({ sinCenso: true });
  const r = await zonas(m, { direccion: { zona: 'centro' } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.tiendas_que_llegan, []);
  assert.ok(r.data.huecos.includes('sin censo: no se sabe qué tiendas existen'));
});

test('es un reflejo: no escribe estado ni guarda posiciones', async () => {
  const { m, pedidas } = await (async () => {
    const x = nuevo();
    await cubre(x.m, { direccion: { zona: 'centro' } });
    await zonas(x.m, { direccion: { zona: 'centro' } });
    return x;
  })();
  assert.strictEqual(m._path, null);
  assert.ok(pedidas.every((p) => !p.ev.startsWith('fs.write')), 'no escribe nada en el fs');
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
