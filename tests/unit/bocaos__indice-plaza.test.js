'use strict';

/**
 * bocaos/indice-plaza — D07 (PlazaPública) · D08 (NeutralidadOrden) · L02 · K02.
 *
 * Lo que se vigila:
 *   1. El índice son las tiendas que LLEGAN (lo filtra S02, no este módulo): una tienda que no
 *      reparte no aparece, y la que aparece no está ahí por pagar.
 *   2. No hay campo donde pagar por posición: en cuanto una fila trae `destacado`, `prioridad`,
 *      `posicion` o `peso`, el índice NO se sirve.
 *   3. Ninguna comunicación al cliente final lleva la marca de Bocaos ni la de la plaza (K02).
 *   4. Una consulta que cruce tiendas devuelve FALLA, también dentro de la misma plaza (L02).
 *   5. Es un reflejo: no escribe estado ni guarda posiciones.
 *
 * Ejecutar: node tests/unit/bocaos__indice-plaza.test.js
 */

const assert = require('assert');
const IndicePlaza = require('../../modules/bocaos/indice-plaza/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';

function nuevo({ tiendas = [], noLlegan = [], cobertura = ['centro'], sinFrontera = false } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new IndicePlaza();
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'frontera-plaza.zonas.request') {
      if (sinFrontera) return null;
      return {
        status: 200,
        data: {
          plaza_id: PLAZA,
          zona: payload.direccion?.zona || null,
          direccion: payload.direccion,
          plaza_llega: true,
          cobertura_plaza: cobertura,
          fuente_cobertura: 'política v1',
          tiendas_que_llegan: tiendas,
          tiendas_que_no: noLlegan,
          huecos: []
        }
      };
    }
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const indice = (m, extra) => m.onIndiceRequest({ request_id: 'i', data: { project_id: PLAZA, plaza_id: PLAZA, direccion: { zona: 'centro' }, ...extra } });
const guarda = (m, extra) => m.onGuardaRequest({ request_id: 'g', data: { project_id: PLAZA, plaza_id: PLAZA, ...extra } });

test('D07: el índice son las tiendas que llegan, en el orden declarado, con las que no', async () => {
  const { m, eventos } = nuevo({
    tiendas: [
      { tienda_id: 'tienda-paco', nombre: 'Paco', zonas: ['centro'] },
      { tienda_id: 'tienda-ana', nombre: 'Ana', zonas: ['centro'] }
    ],
    noLlegan: [{ tienda_id: 'tienda-lejos', motivo: 'la tienda no reparte en esa zona' }]
  });
  const r = await indice(m);
  assert.strictEqual(r.status, 200);
  const idx = r.data.indice;
  assert.deepStrictEqual(idx.tiendas.map((t) => t.tienda_id), ['tienda-paco', 'tienda-ana'], 'el orden es el del censo');
  assert.deepStrictEqual(idx.tiendas.map((t) => t.orden), [0, 1]);
  assert.strictEqual(idx.orden, 'declarado');
  assert.strictEqual(idx.n, 2);
  assert.deepStrictEqual(idx.filtro.no_llegan, [{ tienda_id: 'tienda-lejos', motivo: 'la tienda no reparte en esa zona' }]);
  assert.strictEqual(eventos('bocaos.indice_servido').length, 1);
  assert.deepStrictEqual(eventos('bocaos.indice_servido')[0].p.tiendas, ['tienda-paco', 'tienda-ana']);
});

test('D07: sin frontera no hay lista — una lista sin cobertura son «las que quieren», no las que llegan', async () => {
  const { m, eventos } = nuevo({ sinFrontera: true });
  const r = await indice(m);
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.code, 'SIN_FRONTERA');
  assert.strictEqual(eventos('bocaos.indice_servido').length, 0);
  assert.strictEqual(eventos('indice-plaza.indice.failed').length, 1, 'el rechazo también está en el bus');
});

test('D08: un campo que permita pagar por posición y el índice NO se sirve', async () => {
  for (const campo of ['destacado', 'prioridad', 'posicion', 'peso', 'promocionado', 'ranking']) {
    const { m, eventos } = nuevo({
      tiendas: [{ tienda_id: 'tienda-paco', nombre: 'Paco', zonas: ['centro'], [campo]: true }]
    });
    const r = await indice(m);
    assert.strictEqual(r.status, 409, campo);
    assert.strictEqual(r.error.code, 'ORDEN_NO_NEUTRO');
    assert.strictEqual(r.error.details.fallas[0].regla, 'D08');
    assert.strictEqual(eventos('bocaos.indice_servido').length, 0);
  }
});

test('D08: revisar un orden mostrado — filtrar sí, ordenar por conveniencia no', async () => {
  const { m } = nuevo();
  const ok = await guarda(m, { orden: [{ tienda_id: 'a' }, { tienda_id: 'b' }] });
  assert.strictEqual(ok.data.conforme, true);
  assert.strictEqual(ok.data.revisado.orden, true);

  const pagado = await guarda(m, { orden: [{ tienda_id: 'a' }, { tienda_id: 'b', prioridad: 1 }] });
  assert.strictEqual(pagado.data.conforme, false);
  assert.strictEqual(pagado.data.fallas[0].regla, 'D08');
  assert.strictEqual(pagado.data.fallas[0].fila, 1);
});

test('K02: «powered by Bocaos», el nombre de la plaza o un enlace no salen al cliente final', async () => {
  const { m } = nuevo();
  for (const texto of ['Tu pedido va en camino · powered by Bocaos', 'Bocaos te informa', 'Una plaza de Málaga te avisa']) {
    const r = await guarda(m, { texto, marca_plaza: 'Málaga' });
    assert.strictEqual(r.data.conforme, false, texto);
    assert.strictEqual(r.data.fallas[0].regla, 'K02');
  }
  const remitente = await guarda(m, { asunto: 'Pedido', remitente: 'avisos@bocaos.app' });
  assert.strictEqual(remitente.data.conforme, false);
  assert.strictEqual(remitente.data.fallas[0].campo, 'remitente');

  const limpio = await guarda(m, { texto: 'Tu pedido está en cocina. Te avisamos cuando salga.' });
  assert.strictEqual(limpio.data.conforme, true, JSON.stringify(limpio.data.fallas));
});

test('L02: una consulta que cruce tiendas devuelve FALLA, también dentro de la misma plaza', async () => {
  const { m } = nuevo();
  const cruza = await guarda(m, { consulta: { tienda_id: 'tienda-paco', tiendas: ['tienda-paco', 'tienda-ana'] } });
  assert.strictEqual(cruza.data.conforme, false);
  assert.strictEqual(cruza.data.fallas[0].regla, 'L02');

  const una = await guarda(m, { consulta: { tienda_id: 'tienda-paco', tiendas: ['tienda-paco'] } });
  assert.strictEqual(una.data.conforme, true);
});

test('la guarda dice QUÉ miró: sin eso no es una guarda', async () => {
  const { m } = nuevo();
  const r = await guarda(m, { texto: 'hola', orden: [{ tienda_id: 'a' }] });
  assert.deepStrictEqual(r.data.revisado, { orden: true, comunicacion: ['texto'], consulta: false });
  assert.ok(r.data.marcas_vedadas.includes('bocaos'));
});

test('es un reflejo: no escribe estado ni guarda posiciones', async () => {
  const { m, pedidas } = nuevo({ tiendas: [{ tienda_id: 'tienda-paco', zonas: ['centro'] }] });
  await indice(m);
  assert.strictEqual(m._path, null);
  assert.ok(pedidas.every((p) => !p.ev.startsWith('fs.write')));
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
