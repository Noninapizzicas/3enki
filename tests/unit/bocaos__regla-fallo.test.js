'use strict';

/**
 * bocaos/regla-fallo — G02 · G03 · G06.
 *
 * Lo que se vigila:
 *   1. SIN ACTA COMPLETA NO HAY FALLO: NO_CONSTA con el nombre del hecho que falta. Nunca «seguramente
 *      se pasó».
 *   2. LAS TRES ESPERAS, POR SEPARADO: N1 (tienda), N2 (portal), N3 (llegada). La que no tiene hecho
 *      que la mida sale NO_CONSTA, no 0.
 *   3. QUIÉN, NO CUÁNTO: las filas llevan deudor y acreedor; el importe es null y su estado NO_CONSTA
 *      (Q28). Un cero sería un número inventado.
 *   4. G06: cada fila excedida apunta a hechos CON HORA anteriores al cargo. Sin evidencia, la traza
 *      FALLA y no nace deuda.
 *   5. El fallo se publica como hecho SÓLO si está verificado y trazable.
 *
 * Ejecutar: node tests/unit/bocaos__regla-fallo.test.js
 */

const assert = require('assert');
const ReglaFallo = require('../../modules/bocaos/regla-fallo/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';
const PEDIDO = 'ped-1';
const RIDER = 'rd-1';
const PROMETIDA = '2026-11-03T14:00:00.000Z';

const ESPERAS_OK = { n1_tienda_min: 8, n2_portal_min: 5, n3_entrega_min: 10 };

function acta({ listo = '2026-11-03T14:20:00.000Z', recogida = '2026-11-03T14:24:00.000Z', entrega = '2026-11-03T14:45:00.000Z', completa = true, faltan = [] } = {}) {
  if (!completa) return { status: 200, data: { completa: false, faltan } };
  return {
    status: 200,
    data: {
      completa: true,
      acta: {
        pedido_id: PEDIDO, plaza_id: PLAZA, contrato_id: 'ct-1', rider_id: RIDER,
        relojes: {
          aceptacion: '2026-11-03T13:50:00.000Z', listo, recogida, entrega,
          espera_min: 4, reparto_min: 21, total_min: 55
        },
        prueba: { falta: false, tipo: 'foto', valor: 'foto-1' },
        hechos: 2
      }
    }
  };
}

function nuevo({ actaRes = acta(), prometida = PROMETIDA, esperas = ESPERAS_OK, contrato = true, pedido = { pedido_id: PEDIDO, tienda_id: TIENDA } } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new ReglaFallo();
  m.name = 'regla-fallo';
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'hechos-reparto.acta.request') return actaRes;
    if (ev === 'config-mercado.politica.request') {
      return { status: 200, data: { politica: { capa: 'plaza', version: 1, autor: 'dueno', esperas } } };
    }
    if (ev === 'contrato-puntual.de.request') {
      return contrato ? { status: 200, data: { contrato: { contrato_id: 'ct-1', pedido_id: PEDIDO, rider_id: RIDER, hora_prometida: prometida } } } : { status: 404 };
    }
    if (ev === 'pedido-mercado.de.request') return { status: 200, data: { pedido } };
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

// El instante de la evaluación es SIEMPRE posterior a los hechos del reparto: si no, el cargo se
// apoyaría en el futuro y la traza (G06) fallaría — que es justo lo que vigila otro test.
const DESPUES = '2026-11-03T18:00:00.000Z';

const evaluar = (m, extra = {}) => m.onEvaluarRequest({ request_id: 'e1', data: {
  project_id: PLAZA, plaza_id: PLAZA, pedido_id: PEDIDO, instante: DESPUES, ...extra
} });

test('la cocina lenta: N1 excedida → responde la TIENDA y cobra el RIDER (quién, no cuánto)', async () => {
  // Prometida 14:00, listo 14:20 → N1 = 20 min, y el límite es 8: excedida.
  const { m, eventos } = nuevo();
  const r = await evaluar(m);
  assert.strictEqual(r.status, 200, JSON.stringify(r));

  const fallo = r.data.fallo;
  assert.strictEqual(fallo.existe, true);
  assert.strictEqual(fallo.esperas.n1_tienda.min, 20);
  assert.strictEqual(fallo.esperas.n1_tienda.excedido, true);

  const fila = fallo.filas.find((f) => f.fila === 'n1_tienda');
  assert.deepStrictEqual(fila.deudor, { rol: 'tienda', parte_id: TIENDA });
  assert.deepStrictEqual(fila.acreedor, { rol: 'rider', parte_id: RIDER });
  assert.strictEqual(fila.importe_centimos, null, 'Q28: la tabla no tiene importes');
  assert.strictEqual(fila.importe_estado, 'NO_CONSTA');

  const hechos = eventos('bocaos.fallo_medido');
  assert.strictEqual(hechos.length, 1, 'un fallo verificado es un hecho');
  assert.strictEqual(hechos[0].p.filas.length, fallo.filas.length);
  assert.strictEqual(hechos[0].p.evidencia.length >= 2, true, 'la evidencia es enumerable');
  assert.strictEqual(hechos[0].p.traza_estado, 'CONFORME');
});

test('sin acta completa no hay fallo: se dice qué hecho falta', async () => {
  const { m, eventos } = nuevo({ actaRes: acta({ completa: false, faltan: ['prueba o su falta declarada'] }) });
  const r = await evaluar(m);
  assert.strictEqual(r.data.estado, 'NO_CONSTA');
  assert.strictEqual(r.data.fallo, null);
  assert.ok(r.data.motivo.includes('prueba o su falta declarada'));
  assert.strictEqual(eventos('bocaos.fallo_medido').length, 0, 'sin acta no hay hecho que publicar');
});

test('las tres esperas van por separado: el portal sale NO_CONSTA porque no hay hecho', async () => {
  const { m } = nuevo();
  const esperas = (await evaluar(m)).data.fallo.esperas;
  assert.strictEqual(esperas.n2_portal.min, null);
  assert.strictEqual(esperas.n2_portal.excedido, null);
  assert.ok(esperas.n2_portal.motivo.includes('no hay hecho de llegada al portal'));
  assert.strictEqual(esperas.n1_tienda.min, 20);
  assert.strictEqual(esperas.n3_entrega.min, 45, 'prometida 14:00 → entrega 14:45');
});

test('N1 dentro de la ventana: no hay fallo que cobrar, y se dice', async () => {
  const { m, eventos } = nuevo({
    actaRes: acta({ listo: '2026-11-03T14:03:00.000Z', recogida: '2026-11-03T14:05:00.000Z', entrega: '2026-11-03T14:20:00.000Z' })
  });
  const fallo = (await evaluar(m)).data.fallo;
  assert.strictEqual(fallo.esperas.n1_tienda.excedido, false);
  const fila = fallo.filas.find((f) => f.fila === 'n1_tienda');
  assert.strictEqual(fila.deudor, null);
  assert.ok(fila.regla.includes('no hay fallo que cobrar'));
  assert.strictEqual(eventos('bocaos.fallo_medido').length, 0);
});

test('la llegada tarde sin cocina lenta NO se adjudica: Q21 está abierta', async () => {
  const { m } = nuevo({
    actaRes: acta({ listo: '2026-11-03T14:01:00.000Z', recogida: '2026-11-03T14:05:00.000Z', entrega: '2026-11-03T14:30:00.000Z' })
  });
  const fallo = (await evaluar(m)).data.fallo;
  const fila = fallo.filas.find((f) => f.fila === 'n3_entrega');
  assert.strictEqual(fila.excedido, true);
  assert.strictEqual(fila.deudor, null, 'no se inventa un responsable');
  assert.strictEqual(fila.adjudicado, false);
  assert.ok(fila.motivo_no_adjudicado.includes('Q21'));
});

test('sin hora prometida no se imputa una promesa: N1 y N3 quedan sin medir', async () => {
  const { m } = nuevo({ prometida: null, contrato: false });
  const esperas = (await evaluar(m)).data.fallo.esperas;
  assert.strictEqual(esperas.n1_tienda.min, null);
  assert.ok(esperas.n1_tienda.motivo.includes('sin hora prometida'));
  assert.strictEqual(esperas.n3_entrega.min, null);
});

test('un acta incompleta se apunta cuando llega, para no volver a descubrirlo', async () => {
  const { m } = nuevo({ actaRes: acta({ completa: false }) });
  await m.onActaIncompleta({ data: { pedido_id: 'ped-2', plaza_id: PLAZA, faltan: ['recogida'] } });
  const r = await m.onEvaluarRequest({ request_id: 'x', data: { project_id: PLAZA, pedido_id: 'ped-2', instante: DESPUES } });
  assert.ok(r.data.motivo.includes('recogida'));
});

test('sin ventana vigente hay medida y no hay cobro: se dice', async () => {
  const { m } = nuevo({ esperas: {} });
  const esperas = (await evaluar(m)).data.fallo.esperas;
  assert.strictEqual(esperas.n1_tienda.excedido, null);
  assert.ok(esperas.n1_tienda.motivo.includes('sin ventana vigente'));
});

test('G06: si la evidencia es posterior al cargo, la traza FALLA y no nace deuda', async () => {
  // Se evalúa a las 14:10, cuando el «listo» de las 14:20 todavía no ha ocurrido: el cargo se
  // apoyaría en el futuro.
  const { m, eventos } = nuevo();
  const r = await evaluar(m, { instante: '2026-11-03T14:10:00.000Z' });
  assert.strictEqual(r.data.fallo.traza.estado, 'FALLA');
  assert.ok(r.data.fallo.traza.fallos.some((f) => f.includes('POSTERIOR')));
  assert.strictEqual(r.data.fallo.existe, false, 'sin traza conforme no hay fallo');
  assert.strictEqual(eventos('bocaos.fallo_medido').length, 0);
});

test('una incidencia abierta intenta medir; si los hechos lo verifican, publica el fallo', async () => {
  const { m, eventos } = nuevo();
  await m.onIncidenciaAbierta({ data: { project_id: PLAZA, plaza_id: PLAZA, pedido_id: PEDIDO, incidencia_id: 'inc-1' } });
  assert.strictEqual(eventos('bocaos.fallo_medido').length, 1);
});

test('una incidencia sin acta no publica nada: el caso sigue en la cola, que es de quien es', async () => {
  const { m, eventos } = nuevo({ actaRes: acta({ completa: false }) });
  await m.onIncidenciaAbierta({ data: { project_id: PLAZA, plaza_id: PLAZA, pedido_id: PEDIDO } });
  assert.strictEqual(eventos('bocaos.fallo_medido').length, 0);
});

test('no escribe: mide y publica', () => {
  const { m } = nuevo();
  assert.strictEqual(m._path, null);
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
