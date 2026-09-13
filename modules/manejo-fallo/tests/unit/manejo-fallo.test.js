/**
 * Tests unitarios — manejo-fallo (REFLEJO del taller 3D, F4 TANDA 4).
 *
 * Sin bus real: se sobreescribe m._rpc (para adaptador-confirmacion.confirmar.request)
 * y se capturan los fire-and-forget (aviso.solicitar) y las respuestas. Casos:
 *   - avisar SIEMPRE (emite aviso.solicitar tipo fallo)
 *   - politica 'saltar' -> SALTAR
 *   - politica 'reintentar' con reintentos no superados -> REINTENTAR
 *   - politica 'reintentar' agotado -> SALTAR (no detener)
 *   - politica ABIERTO / sin politica -> ESPERAR_DECISION (pide al dueño)
 *
 * Ejecutar: node modules/manejo-fallo/tests/unit/manejo-fallo.test.js
 */

'use strict';

const assert = require('assert');

const ManejoFallo = require('../../index.js');

function nuevoReflejo(overrides = {}) {
  const m = new ManejoFallo();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish: () => {} };
  m._rpc = async (topic, payload = {}) => {
    switch (topic) {
      case 'adaptador-confirmacion.confirmar.request':
        return overrides.confirmacionFalla
          ? { status: 502, data: {} }
          : { status: 200, data: { confirmacion_id: payload.confirmacion_id } };
      default:
        return { status: 500, data: {} };
    }
  };
  return m;
}

function capturar(m) {
  const emitidos = [];
  m.eventBus = { publish: (ev, d) => emitidos.push({ ev, d }) };
  return emitidos;
}

const PID = '3d';

(async () => {
  // ── 1. avisa SIEMPRE (emite aviso.solicitar tipo fallo) ──
  {
    const m = nuevoReflejo();
    const emitidos = capturar(m);
    await m._manejar({ project_id: PID, politica: 'saltar', motivo: 'printer_halted' });
    const aviso = emitidos.find(e => e.ev === 'aviso.solicitar');
    assert.ok(aviso, 'emite aviso.solicitar');
    assert.strictEqual(aviso.d.tipo, 'fallo', 'tipo fallo');
  }
  console.log('✓ manejo-fallo: avisa SIEMPRE');

  // ── 2. politica saltar -> SALTAR ──
  {
    const m = nuevoReflejo();
    const r = await m._manejar({ project_id: PID, politica: 'saltar' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.accion, 'SALTAR', 'politica saltar -> SALTAR');
  }
  console.log('✓ manejo-fallo: politica saltar -> SALTAR');

  // ── 3. politica reintentar no superado -> REINTENTAR ──
  {
    const m = nuevoReflejo();
    const r = await m._manejar({ project_id: PID, tarea_id: 't1', politica: 'reintentar', reintentos_max: 2 });
    assert.strictEqual(r.data.accion, 'REINTENTAR', 'reintentar si no superado');
    assert.strictEqual(r.data.reintentos, 1, 'cuenta el reintento');
  }
  console.log('✓ manejo-fallo: politica reintentar -> REINTENTAR');

  // ── 4. politica reintentar agotado -> SALTAR (no detener el taller) ──
  {
    const m = nuevoReflejo();
    await m._manejar({ project_id: PID, tarea_id: 't2', politica: 'reintentar', reintentos_max: 1 });
    const r2 = await m._manejar({ project_id: PID, tarea_id: 't2', politica: 'reintentar', reintentos_max: 1 });
    assert.strictEqual(r2.data.accion, 'SALTAR', 'agotado -> SALTAR');
    assert.strictEqual(r2.data.agotado, true, 'marca agotado');
  }
  console.log('✓ manejo-fallo: reintentos agotados -> SALTAR');

  // ── 5. politica ABIERTO / sin politica -> ESPERAR_DECISION (pide al dueño) ──
  {
    const m = nuevoReflejo();
    const r = await m._manejar({ project_id: PID, tarea_id: 't3' });
    assert.strictEqual(r.data.accion, 'ESPERAR_DECISION', 'sin politica -> esperar');
    assert.strictEqual(r.data.esperando, true, 'espera la decision del dueño');
    assert.ok(r.data.confirmacion_id, 'genera confirmacion_id');
  }
  console.log('✓ manejo-fallo: politica ABIERTO -> ESPERAR_DECISION');

  // ── 6. si no puede pedir la decision, NO calla: emite fallo ──
  {
    const m = nuevoReflejo({ confirmacionFalla: true });
    const emitidos = capturar(m);
    const r = await m._manejar({ project_id: PID, tarea_id: 't4' });
    assert.strictEqual(r.status, 500, 'no cierra con exito si no puede pedirla');
    assert.ok(emitidos.some(e => e.ev === 'manejo-fallo.manejar.failed'), 'emite par de fallo');
  }
  console.log('✓ manejo-fallo: no silencia el fallo de la decision');

  // ── 7. validaciones ──
  {
    const m = nuevoReflejo();
    const noPid = await m._manejar({});
    assert.strictEqual(noPid.status, 400, 'exige project_id');
  }
  console.log('✓ manejo-fallo: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE MANEJO-FALLO PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
