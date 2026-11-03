'use strict';

/**
 * bocaos/estado-parte — I03 · I04. Quién existe para el mercado y en qué estado.
 *
 * Lo que se vigila:
 *   1. LA PAUSA SÓLO LA DECLARA ÉL: la sala intenta ponerlo en pausa → 403, y tampoco puede
 *      levantarle una pausa.
 *   2. «Ocupado» no se pone a mano: lo pone el contrato vivo, y su cierre lo devuelve a disponible.
 *   3. Sin alta no hay estado: el censo no inventa partes.
 *   4. El coste del rider se resuelve preguntando a config-mercado (0,140 €/km moto + €/min
 *      derivado); si no contesta, es hueco nombrado, no un número inventado.
 *   5. La capacidad la declara él y llega como HECHO desde ruta-viva: aquí no se estima.
 *   6. Saturada/cerrada las declara la tienda, no la sala.
 *   7. `de` devuelve la forma que pide la foto del mercado (riders con estado · zonas · capacidad · coste).
 *
 * Ejecutar: node tests/unit/bocaos__estado-parte.test.js
 */

const assert = require('assert');
const EstadoParte = require('../../modules/bocaos/estado-parte/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const RIDER = 'rid-1';

const COSTE_RIDER = { vehiculos: { moto: 0.14, coche: 0.25, bici: 0.02 }, eur_min: 0.257, derivado: true };

function nuevo({ config = true } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new EstadoParte();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'fs.read.request') return null;
    if (ev === 'config-mercado.politica.request') {
      return config ? { status: 200, data: { politica: { capa: 'plaza', version: 1, coste_rider: COSTE_RIDER } } } : null;
    }
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const alta = (m, extra) => m.onAltaRequest({ request_id: 'a', data: { project_id: PLAZA, ...extra } });
const declarar = (m, extra) => m.onDeclararRequest({ request_id: 'd', data: { project_id: PLAZA, ...extra } });
const de = (m, extra) => m.onDeRequest({ request_id: 'r', data: { project_id: PLAZA, ...extra } });

const RIDER_BASE = { tipo: 'rider', rider_id: RIDER, zonas: ['centro'], vehiculo: 'moto', capacidad: 2 };

test('alta de rider y tienda: la parte entra en el censo y el hecho sale con hora', async () => {
  const { m, eventos } = nuevo();
  const r = await alta(m, RIDER_BASE);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.parte.estado, 'disponible');
  assert.strictEqual(r.data.parte.rider_id, RIDER);
  assert.strictEqual(eventos('bocaos.estado_parte_declarado').length, 1);
  assert.strictEqual(eventos('bocaos.estado_parte_declarado')[0].p.motivo, 'alta');

  const t = await alta(m, { tipo: 'tienda', tienda_id: 'tienda-paco', zonas: ['centro'] });
  assert.strictEqual(t.status, 201);
  assert.strictEqual(t.data.parte.estado, 'abierta');

  const dup = await alta(m, RIDER_BASE);
  assert.strictEqual(dup.status, 409);
  assert.strictEqual(dup.error.code, 'YA_EN_CENSO');

  const cap = await alta(m, { tipo: 'rider', rider_id: 'rid-2', capacidad: 2.5 });
  assert.strictEqual(cap.status, 400, 'la capacidad se declara con un entero: no se estima');
});

test('sin alta no hay estado: el censo no inventa partes', async () => {
  const { m } = nuevo();
  const r = await declarar(m, { rider_id: 'rid-fantasma', estado: 'disponible' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'PARTE_NO_CONSTA');
  assert.strictEqual((await de(m, { rider_id: 'rid-fantasma' })).status, 404);
});

test('la pausa sólo la declara él: la sala recibe 403 y tampoco puede levantarle la pausa', async () => {
  const { m } = nuevo();
  await alta(m, RIDER_BASE);

  const sala = await declarar(m, { rider_id: RIDER, estado: 'en_pausa', rol: 'sala' });
  assert.strictEqual(sala.status, 403);
  assert.strictEqual(sala.error.code, 'PAUSA_NO_ES_SUYA');
  assert.strictEqual((await de(m, { parte_id: RIDER })).data.parte.estado, 'disponible');

  const el = await declarar(m, { rider_id: RIDER, estado: 'en_pausa', rol: 'rider', motivo: 'comer' });
  assert.strictEqual(el.status, 200, JSON.stringify(el.error || {}));
  assert.strictEqual((await de(m, { parte_id: RIDER })).data.parte.estado, 'en_pausa');

  const levantar = await declarar(m, { rider_id: RIDER, estado: 'disponible', rol: 'sala' });
  assert.strictEqual(levantar.status, 403, 'nadie levanta la pausa de otro');
  assert.strictEqual(levantar.error.code, 'PAUSA_NO_ES_SUYA');

  const vuelve = await declarar(m, { rider_id: RIDER, estado: 'disponible', rol: 'rider' });
  assert.strictEqual(vuelve.status, 200);
  assert.strictEqual((await de(m, { parte_id: RIDER })).data.parte.estado, 'disponible');
});

test('«ocupado» no lo pone la sala: lo pone el contrato vivo, y su cierre lo devuelve', async () => {
  const { m } = nuevo();
  await alta(m, RIDER_BASE);

  const aMano = await declarar(m, { rider_id: RIDER, estado: 'ocupado', rol: 'sala' });
  assert.strictEqual(aMano.status, 409);
  assert.strictEqual(aMano.error.code, 'OCUPADO_LO_PONE_EL_CONTRATO');

  await m.onContratoCreado({ data: { project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', contrato_id: 'ct-1' } });
  const ocupado = (await de(m, { parte_id: RIDER })).data.parte;
  assert.strictEqual(ocupado.estado, 'ocupado');
  assert.strictEqual(ocupado.contratos_vivos, 1);
  assert.ok(ocupado.autor.startsWith('contrato:'), 'el autor del estado es el contrato, no la sala');

  await m.onContratoCerrado({ data: { project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, pedido_id: 'ped-1', contrato_id: 'ct-1' } });
  assert.strictEqual((await de(m, { parte_id: RIDER })).data.parte.estado, 'disponible');
});

test('un contrato no da de alta a nadie: sin parte en el censo, el hecho no lo mete dentro', async () => {
  const { m } = nuevo();
  await m.onContratoCreado({ data: { project_id: PLAZA, rider_id: 'rid-sin-alta', pedido_id: 'p', contrato_id: 'c' } });
  assert.strictEqual((await de(m, { parte_id: 'rid-sin-alta' })).status, 404);
});

test('de devuelve la forma que pide la foto: riders con estado, zonas, capacidad y coste del config', async () => {
  const { m, pedidas } = nuevo();
  await alta(m, RIDER_BASE);   // sin coste declarado: se pregunta a config-mercado
  await alta(m, { tipo: 'rider', rider_id: 'rid-2', zonas: ['playa'], vehiculo: 'bici', coste: { eur_km: 0.02, eur_min: 0.2 } });

  const r = await de(m, { plaza_id: PLAZA });
  assert.strictEqual(r.status, 200);
  const { riders, tiendas, partes } = r.data;
  assert.strictEqual(partes.length, 2);
  assert.deepStrictEqual(tiendas, []);
  assert.strictEqual(riders.length, 2);

  const uno = riders.find((x) => x.rider_id === RIDER);
  assert.strictEqual(uno.estado, 'disponible');
  assert.deepStrictEqual(uno.zonas, ['centro']);
  assert.strictEqual(uno.capacidad, 2);
  assert.strictEqual(uno.coste_fuente, 'config-mercado', 'Q57: el coste por vehículo es config de la plaza');
  assert.deepStrictEqual(uno.coste, { eur_km: 0.14, eur_min: 0.257 });
  assert.deepStrictEqual(uno.faltantes, []);

  const dos = riders.find((x) => x.rider_id === 'rid-2');
  assert.strictEqual(dos.coste_fuente, 'declarado');
  assert.deepStrictEqual(dos.coste, { eur_km: 0.02, eur_min: 0.2 });

  assert.ok(pedidas.some((p) => p.ev === 'config-mercado.politica.request'), 'se PREGUNTA al bus, no se importa');
});

test('si config-mercado no contesta, el coste es un hueco nombrado (no un número inventado)', async () => {
  const { m } = nuevo({ config: false });
  await alta(m, RIDER_BASE);
  const uno = (await de(m, { parte_id: RIDER })).data.parte;
  assert.strictEqual(uno.coste, null);
  assert.ok(uno.faltantes.includes('sin coste del rider'));
});

test('vigentes: el que está en pausa u ocupado no aparece, y se dice quién quedó oculto', async () => {
  const { m } = nuevo();
  await alta(m, RIDER_BASE);
  await alta(m, { tipo: 'rider', rider_id: 'rid-2', zonas: ['playa'], vehiculo: 'moto' });
  await alta(m, { tipo: 'rider', rider_id: 'rid-3', zonas: ['centro'], vehiculo: 'bici' });
  await declarar(m, { rider_id: 'rid-3', estado: 'en_pausa', rol: 'rider' });
  await m.onContratoCreado({ data: { project_id: PLAZA, rider_id: 'rid-2', pedido_id: 'p', contrato_id: 'c' } });

  const r = await m.onVigentesRequest({ request_id: 'v', data: { project_id: PLAZA } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.riders.map((x) => x.rider_id), [RIDER]);
  assert.deepStrictEqual(r.data.ocultos.map((x) => `${x.parte_id}:${x.estado}`).sort(), ['rid-2:ocupado', 'rid-3:en_pausa']);

  const zona = await m.onVigentesRequest({ request_id: 'v2', data: { project_id: PLAZA, zona: 'playa' } });
  assert.strictEqual(zona.data.riders.length, 0, 'rid-2 está ocupado y rid-3 en pausa');
});

test('el estado de una tienda lo declara la tienda: la sala no la satura para que el mercado respire', async () => {
  const { m } = nuevo();
  await alta(m, { tipo: 'tienda', tienda_id: 'tienda-paco' });

  const sala = await declarar(m, { tienda_id: 'tienda-paco', estado: 'saturada', rol: 'sala' });
  assert.strictEqual(sala.status, 403);
  assert.strictEqual(sala.error.code, 'ESTADO_NO_ES_SUYO');

  const tienda = await declarar(m, { tienda_id: 'tienda-paco', estado: 'saturada', rol: 'tienda' });
  assert.strictEqual(tienda.status, 200);
  assert.strictEqual((await de(m, { parte_id: 'tienda-paco' })).data.parte.estado, 'saturada');
});

test('P03: la suspensión entra con motivo y acta; sin acta no se aplica y levantarla exige acta', async () => {
  const { m } = nuevo();
  await alta(m, RIDER_BASE);

  await m.onParteSancionada({ data: { project_id: PLAZA, rider_id: RIDER, motivo: 'tres retrasos' } });
  assert.strictEqual((await de(m, { parte_id: RIDER })).data.parte.estado, 'disponible', 'sin acta no hay sanción');

  await m.onParteSancionada({ data: { project_id: PLAZA, rider_id: RIDER, motivo: 'tres retrasos', acta: 'acta-7', autor: 'sala' } });
  const sancionado = (await de(m, { parte_id: RIDER })).data.parte;
  assert.strictEqual(sancionado.estado, 'suspendido');
  assert.strictEqual(sancionado.sancion.acta, 'acta-7');

  const sinActa = await declarar(m, { rider_id: RIDER, estado: 'disponible', rol: 'rider' });
  assert.strictEqual(sinActa.status, 409);
  assert.strictEqual(sinActa.error.code, 'SUSPENSION_CON_ACTA');

  const conActa = await declarar(m, { rider_id: RIDER, estado: 'disponible', rol: 'rider', acta: 'acta-9' });
  assert.strictEqual(conActa.status, 200);

  const directa = await declarar(m, { rider_id: RIDER, estado: 'suspendido', rol: 'sala' });
  assert.strictEqual(directa.status, 409, 'la suspensión no se declara a mano: entra por el hecho con acta');
});

test('la capacidad llega como hecho desde ruta-viva y no se re-estima aquí', async () => {
  const { m } = nuevo();
  await alta(m, RIDER_BASE);
  assert.strictEqual((await de(m, { parte_id: RIDER })).data.parte.capacidad, 2);

  await m.onCapacidadDeclarada({ data: { project_id: PLAZA, plaza_id: PLAZA, rider_id: RIDER, capacidad: 1 } });
  const p = (await de(m, { parte_id: RIDER })).data.parte;
  assert.strictEqual(p.capacidad, 1);
  assert.strictEqual(p.capacidad_fuente, 'ruta-viva');

  // Una parte que aún no está en el censo no pierde su capacidad: se apunta y entra con el alta.
  await m.onCapacidadDeclarada({ data: { project_id: PLAZA, rider_id: 'rid-9', capacidad: 3 } });
  const alta9 = await alta(m, { tipo: 'rider', rider_id: 'rid-9', zonas: ['centro'] });
  assert.strictEqual(alta9.data.parte.capacidad, 3);
  assert.strictEqual(alta9.data.parte.capacidad_fuente, 'ruta-viva');
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
