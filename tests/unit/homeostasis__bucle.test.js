'use strict';

/**
 * homeostasis — el bucle de realimentación negativa del cuerpo:
 * SENSOR -> COMPARADOR (umbral+histéresis) -> EFECTOR (inhibe) -> ENFRIAMIENTO (recupera).
 * Verifica: nace OFF, respuesta graduada, autoinmune-conservadora, testigo, recuperación.
 */

const assert = require('assert');
const Homeostasis = require('../../modules/homeostasis/index.js');

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const ko = (n, e) => { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message || e)); };
const t = (n, fn) => { try { fn(); ok(n); } catch (e) { ko(n, e); } };

function makeBus() {
  const log = [];
  return { log, publish(ev, p) { log.push({ ev, payload: p }); }, subscribe() { return () => {}; } };
}
function setsOf(bus, ev) { return bus.log.filter(e => e.ev === ev).map(e => e.payload); }

async function run() {
  console.log('homeostasis__bucle');
  const noop = () => {};
  const logger = { info: noop, warn: noop, error: noop, debug: noop };
  const metrics = { increment: noop, gauge: noop };
  const cfg = { umbral_inflamacion: 2, umbral_fiebre: 4, umbral_apoptosis: 8, enfriamiento: 1, histeresis: 1, tick_ms: 999999, pesos: { fantasma: 2, revision: 2, failed: 1, health: 1 } };

  async function nuevo() {
    const bus = makeBus();
    const m = new Homeostasis();
    await m.onLoad({ logger, metrics, eventBus: bus, moduleConfig: cfg });
    return { bus, m };
  }

  // 1. NACE OFF: registra su interruptor en default:false, efector dormido
  {
    const { bus, m } = await nuevo();
    t('nace inhibida (registra interruptor homeostasis default:false; activo=false)', () => {
      const reg = setsOf(bus, 'interruptor.registrar').find(p => p.id === 'homeostasis');
      assert.ok(reg && reg.default === false, 'registra su interruptor OFF');
      assert.strictEqual(m.activo, false);
    });
    await m.onUnload();
  }

  // 2. RESPUESTA GRADUADA — inflamación = solo testigo, sin acción
  {
    const { bus, m } = await nuevo();
    m.onInterruptorRegistrado({ data: { id: 'conserje' } });   // conserje es gobernable
    m._percibir('conserje', 2, 'failed');                      // temp 2 = inflamación
    t('inflamación → testigo homeostasis.alerta, NINGUNA inhibición', () => {
      const alertas = setsOf(bus, 'homeostasis.alerta').filter(a => a.fuente === 'conserje');
      assert.ok(alertas.find(a => a.estado === 'inflamacion'), 'emite alerta inflamación');
      assert.strictEqual(setsOf(bus, 'interruptor.set').length, 0, 'no inhibe en inflamación');
    });
    await m.onUnload();
  }

  // 3. FIEBRE con efector DORMIDO → siente, NO actúa
  {
    const { bus, m } = await nuevo();
    m.onInterruptorRegistrado({ data: { id: 'conserje' } });
    m._percibir('conserje', 4, 'failed');                      // temp 4 = fiebre, pero dormida
    t('fiebre con homeostasis DORMIDA → testifica pero NO inhibe (motor dormido)', () => {
      assert.ok(setsOf(bus, 'homeostasis.alerta').find(a => a.estado === 'fiebre'));
      assert.strictEqual(setsOf(bus, 'interruptor.set').length, 0);
    });
    await m.onUnload();
  }

  // 4. DESPIERTA + FIEBRE + gobernable → INHIBE (interruptor.set enabled:false con motivo)
  {
    const { bus, m } = await nuevo();
    m.onInterruptorRegistrado({ data: { id: 'conserje' } });
    m.onInterruptorCambiado({ data: { id: 'homeostasis', enabled: true } });  // el humano la despierta
    m._percibir('conserje', 4, 'failed');
    t('despierta + fiebre + gobernable → INHIBE (interruptor.set false + accion testigo)', () => {
      const sets = setsOf(bus, 'interruptor.set');
      assert.strictEqual(sets.length, 1);
      assert.strictEqual(sets[0].id, 'conserje');
      assert.strictEqual(sets[0].enabled, false);
      assert.ok(sets[0].motivo && sets[0].motivo.includes('fiebre'), 'lleva motivo (testigo)');
      assert.ok(setsOf(bus, 'homeostasis.accion').find(a => a.fuente === 'conserje'));
      assert.ok(m.inhibidos.has('conserje'));
    });
    await m.onUnload();
  }

  // 5. AUTOINMUNE: nunca inhibe un órgano vital aunque tenga interruptor y haya fiebre
  {
    const { bus, m } = await nuevo();
    m.onInterruptorRegistrado({ data: { id: 'propiocepcion' } });   // vital → inmune
    m.onInterruptorCambiado({ data: { id: 'homeostasis', enabled: true } });
    m._percibir('propiocepcion', 6, 'failed');
    t('autoinmune: NUNCA inhibe un órgano vital (propiocepcion) aunque arda', () => {
      assert.strictEqual(setsOf(bus, 'interruptor.set').length, 0, 'no toca lo inmune');
      assert.ok(!m.inhibidos.has('propiocepcion'));
    });
    await m.onUnload();
  }

  // 6. CONSERVADORA: fuente no gobernable (sin interruptor) → testifica, no inhibe
  {
    const { bus, m } = await nuevo();
    m.onInterruptorCambiado({ data: { id: 'homeostasis', enabled: true } });
    m._percibir('flota', 6, 'health');                          // 'flota' no tiene interruptor
    t('fuente no gobernable → testifica fiebre pero NO inhibe (conservadora)', () => {
      assert.ok(setsOf(bus, 'homeostasis.alerta').find(a => a.fuente === 'flota' && a.estado === 'fiebre'));
      assert.strictEqual(setsOf(bus, 'interruptor.set').length, 0);
    });
    await m.onUnload();
  }

  // 7. APOPTOSIS conservadora: lo canta fuerte pero NO ejecuta el corte sola
  {
    const { bus, m } = await nuevo();
    m.onInterruptorRegistrado({ data: { id: 'conserje' } });
    m.onInterruptorCambiado({ data: { id: 'homeostasis', enabled: true } });
    m._percibir('conserje', 8, 'failed');                       // temp 8 = apoptosis
    t('apoptosis → homeostasis.apoptosis (testigo fuerte), no mata sola', () => {
      const ap = setsOf(bus, 'homeostasis.apoptosis').find(a => a.fuente === 'conserje');
      assert.ok(ap, 'canta la apoptosis');
      assert.ok(ap.nota.includes('voluntad'), 'deja el corte a la voluntad');
      // la única inhibición pasó al cruzar fiebre (en el camino), no un "kill" extra
      const sets = setsOf(bus, 'interruptor.set');
      assert.ok(sets.every(s => s.enabled === false), 'no hay corte distinto de la inhibición de fiebre');
    });
    await m.onUnload();
  }

  // 8. ENFRIAMIENTO + histéresis → recupera (suelta la facultad)
  {
    const { bus, m } = await nuevo();
    m.onInterruptorRegistrado({ data: { id: 'conserje' } });
    m.onInterruptorCambiado({ data: { id: 'homeostasis', enabled: true } });
    m._percibir('conserje', 4, 'failed');                       // inhibida (fiebre)
    assert.ok(m.inhibidos.has('conserje'));
    // enfría hasta cruzar fiebre(4) - histeresis(1) = 3 -> nt<3 suelta. 4->3->2 (suelta en 2)
    m._enfriar(); m._enfriar();
    t('enfriamiento + histéresis → suelta la facultad (interruptor.set true + recuperado)', () => {
      assert.ok(!m.inhibidos.has('conserje'), 'ya no inhibida');
      const reactivar = setsOf(bus, 'interruptor.set').find(s => s.id === 'conserje' && s.enabled === true);
      assert.ok(reactivar, 'la suelta (enabled:true)');
      assert.ok(setsOf(bus, 'homeostasis.recuperado').find(r => r.fuente === 'conserje'));
    });
    await m.onUnload();
  }

  // 9. el SENSOR normaliza las señales del bus
  {
    const { bus, m } = await nuevo();
    m.onFantasma({ data: { modulo: 'carta-design' } });
    m.onFailed({ data: {} }, 'escandallo.costear.failed');
    m.onHealthAlert({ data: { device_id: 'tpv-1' } });
    t('sensor: fantasma/failed/health suben temperatura de la fuente correcta', () => {
      assert.strictEqual(m.temp.get('carta-design'), 2);   // peso fantasma
      assert.strictEqual(m.temp.get('escandallo'), 1);     // peso failed, fuente=dominio del evento
      assert.strictEqual(m.temp.get('tpv-1'), 1);          // peso health
    });
    await m.onUnload();
  }

  // 10. handleEstado da el cuadro clínico
  {
    const { m } = await nuevo();
    m.onInterruptorRegistrado({ data: { id: 'conserje' } });
    m._percibir('conserje', 3, 'failed');
    const r = await m.handleEstado();
    t('handleEstado → cuadro clínico (fuentes calientes, umbrales, gobernables)', () => {
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.data.activo, false);
      assert.ok(r.data.fuentes.find(f => f.fuente === 'conserje' && f.estado === 'inflamacion'));
      assert.ok(r.data.gobernables.includes('conserje'));
      assert.strictEqual(r.data.umbrales.fiebre, 4);
    });
    await m.onUnload();
  }

  console.log(`[homeostasis__bucle] ${fail === 0 ? 'OK' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
