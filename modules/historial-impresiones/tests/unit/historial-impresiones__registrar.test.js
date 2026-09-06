/**
 * historial-impresiones — TEST unitario determinista (sin bus, sin red).
 * Verifica la LOGICA pura: _registrar (append-only) · _listar · relleno de huecos
 * como 'desconocido' (invariante 5) · handler fire-and-forget impresion.completada,
 * con _rpc/eventBus stubeados (patron de la casa: el reflejo se testea por metodos
 * internos). Casos del plan de construccion (Fase 3b, hoja 6.5 CUSTODIO):
 * registrar impresion pasada (fecha, modelo, material, filamento usado, tiempo,
 * resultado), append-only (nunca se edita ni borra), huecos como 'desconocido',
 * listar mas reciente primero, y el par de fallo historial.registrar.failed.
 */

'use strict';
const assert = require('node:assert/strict');
const HistorialImpresiones = require('../../index.js');

function nuevaInstancia() {
  const m = new HistorialImpresiones();
  m._rpc = async () => ({ status: 500, data: {} });
  m.eventBus = { publish: () => {} };
  m.metrics = { increment: () => {} };
  return m;
}

let pasados = 0;
function ok(nombre) { pasados++; console.log('  ✓ ' + nombre); }

(async () => {
  const m = nuevaInstancia();

  // ── 1 · REGISTRAR: guarda una impresion pasada completa ──
  console.log('T1 · registrar impresion completa');
  {
    const r = await m._registrar({
      project_id: 'p1', modelo_id: 'm1', modelo_nombre: 'Soporte', material: 'PLA',
      filamento_usado: '12.5', tiempo: '2h 15m', resultado: 'completada'
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.registrado, true);
    assert.ok(r.data.id, 'id generado');
    ok('registra impresion completa → 200 · id generado');
  }

  // ── 2 · LISTAR: devuelve el historial con total ──
  console.log('T2 · listar historial');
  {
    const r = await m._listar({ project_id: 'p1' });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 1);
    assert.equal(r.data.registros[0].modelo_id, 'm1');
    assert.equal(r.data.registros[0].material, 'PLA');
    ok('lista historial → total 1 · registro con material PLA');
  }

  // ── 3 · HUECOS: datos ausentes quedan como 'desconocido' (invariante 5) ──
  console.log('T3 · huecos como desconocido');
  {
    const r = await m._registrar({ project_id: 'p1', modelo_id: 'm2' });
    assert.equal(r.status, 200);
    const l = await m._listar({ project_id: 'p1' });
    const reg = l.data.registros[0]; // mas reciente primero
    assert.equal(reg.modelo_id, 'm2');
    assert.equal(reg.material, 'desconocido');
    assert.equal(reg.filamento_usado, 'desconocido');
    assert.equal(reg.tiempo, 'desconocido');
    assert.equal(reg.resultado, 'desconocido');
    assert.equal(reg.modelo_nombre, 'desconocido');
    ok('impresion sin datos → huecos como desconocido (nunca inventado)');
  }

  // ── 4 · APPEND-ONLY: cada registro es inmutable, no se edita ni borra ──
  console.log('T4 · append-only');
  {
    const r1 = await m._registrar({ project_id: 'p1', modelo_id: 'm3', material: 'PETG' });
    const r2 = await m._registrar({ project_id: 'p1', modelo_id: 'm4', material: 'ABS' });
    const l = await m._listar({ project_id: 'p1' });
    assert.equal(l.data.total, 4);
    // mas reciente primero: m4 (ultimo) al frente
    assert.equal(l.data.registros[0].modelo_id, 'm4');
    assert.equal(l.data.registros[3].modelo_id, 'm1');
    // ids unicos
    const ids = new Set(l.data.registros.map(x => x.id));
    assert.equal(ids.size, 4);
    ok('append-only → 4 registros · ids unicos · mas reciente primero');
  }

  // ── 5 · REGISTRAR sin modelo_id → INVALID_INPUT + historial.registrar.failed ──
  console.log('T5 · registrar sin modelo_id');
  {
    const emitidos = [];
    m.eventBus = { publish: (ev, data) => emitidos.push(ev) };
    const r = await m._registrar({ project_id: 'p1' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'INVALID_INPUT');
    assert.ok(emitidos.includes('historial.registrar.failed'), 'par de fallo emitido');
    ok('registrar sin modelo_id → 400 INVALID_INPUT · emite historial.registrar.failed');
  }

  // ── 6 · REGISTRAR sin project_id → INVALID_INPUT ──
  console.log('T6 · registrar sin project_id');
  {
    const r = await m._registrar({ modelo_id: 'm9' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'INVALID_INPUT');
    ok('registrar sin project_id → 400 INVALID_INPUT');
  }

  // ── 7 · FIRE-AND-FORGET: impresion.completada → registra + emite impresion_registrada ──
  console.log('T7 · impresion.completada');
  {
    const emitidos = [];
    m.eventBus = { publish: (ev, data) => emitidos.push(ev) };
    const r = m.onImpresionCompletada({
      data: { project_id: 'p1', modelo_id: 'm5', modelo_nombre: 'Engranaje', material: 'PLA', filamento_usado: '8.2', tiempo: '1h 40m' }
    });
    assert.ok(r, 'handler devuelve resultado');
    assert.equal(r.status, 200);
    assert.ok(emitidos.includes('historial.impresion_registrada'), 'evento emitido');
    const l = await m._listar({ project_id: 'p1' });
    assert.equal(l.data.total, 5);
    assert.equal(l.data.registros[0].modelo_id, 'm5');
    assert.equal(l.data.registros[0].resultado, 'completada');
    ok('impresion.completada → registra · emite historial.impresion_registrada · resultado completada');
  }

  // ── 8 · LISTAR proyecto sin historial → vacio ──
  console.log('T8 · listar proyecto sin historial');
  {
    const r = await m._listar({ project_id: 'p-otro' });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 0);
    assert.deepEqual(r.data.registros, []);
    ok('listar proyecto sin historial → total 0 · registros vacio');
  }

  console.log(`\nRESULTADO: ${pasados}/8 bloques OK`);
  process.exit(pasados === 8 ? 0 : 1);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
