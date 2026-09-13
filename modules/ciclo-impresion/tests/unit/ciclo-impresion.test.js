/**
 * Tests unitarios — ciclo-impresion (REFLEJO/orquestador del taller 3D, F4 TANDA 4).
 *
 * La máquina de estados se testea sin bus real: se sobreescribe m._rpc con un switch
 * de respuestas canónicas y se capturan los fire-and-forget con m.eventBus. Casos:
 *   - transiciones legales/ilegales de la máquina de estados
 *   - _iniciar LIBRE -> IMPRIMIENDO (subida+inicio ok)
 *   - sin gcode / subida falla / inicio falla -> CICLO_ABORTADO + ciclo_abortado
 *   - no se puede iniciar mientras hay una impresion activa (409 CONFLICT_STATE)
 *   - _pausar / _reanudar / _abortar
 *   - onEstadoCrudo: completado -> TERMINADA (registra+encadena), fallo -> FALLIDA (maneja)
 *
 * Ejecutar: node modules/ciclo-impresion/tests/unit/ciclo-impresion.test.js
 */

'use strict';

const assert = require('assert');

const CicloImpresion = require('../../index.js');

function nuevoReflejo(overrides = {}) {
  const m = new CicloImpresion();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish: () => {} };
  m._rpc = async (topic, payload = {}) => {
    switch (topic) {
      case 'adaptador-impresora.subir_gcode.request':
        return overrides.subidaFalla ? { status: 502, data: {} } : { status: 200, data: { ok: true } };
      case 'adaptador-impresora.iniciar_impresion.request':
        return overrides.inicioFalla ? { status: 502, data: {} } : { status: 200, data: { ok: true } };
      case 'cupula-gcode.obtener.request':
        return overrides.sinGcodeCupula
          ? { status: 200, data: { archivo: null } }
          : { status: 200, data: { archivo: { archivo_gcode: 'G28\nG1 X0 Y0\n' } } };
      case 'historial.registrar.request':
        return { status: 201, data: { registro: { id: 'r1' } } };
      case 'filamento.descontar.request':
        return { status: 200, data: { bobina: {} } };
      case 'motor-encadenamiento.al_terminar.request':
        return { status: 200, data: { encadenada: true } };
      case 'manejo-fallo.manejar.request':
        return { status: 200, data: { manejado: true } };
      case 'cola.imprimiendo.request':
        return { status: 200, data: {} };
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
  // ── 1. _aplicarTransicion: transiciones legales de la máquina ──
  {
    const m = nuevoReflejo();
    const ciclo = { estado: 'LIBRE' };
    m._aplicarTransicion(PID, ciclo, 'iniciar');
    assert.strictEqual(ciclo.estado, 'PREPARANDO', 'LIBRE --iniciar--> PREPARANDO');
    m._aplicarTransicion(PID, ciclo, 'subida_ok');
    assert.strictEqual(ciclo.estado, 'IMPRIMIENDO', 'PREPARANDO --subida_ok--> IMPRIMIENDO');
    m._aplicarTransicion(PID, ciclo, 'completado');
    assert.strictEqual(ciclo.estado, 'TERMINADA', 'IMPRIMIENDO --completado--> TERMINADA');
  }
  console.log('✓ ciclo-impresion: transiciones legales');

  // ── 2. transición ilegal lanza (estado imposible, una pieza) ──
  {
    const m = nuevoReflejo();
    const ciclo = { estado: 'PAUSADO' };
    assert.throws(
      () => m._aplicarTransicion(PID, ciclo, 'completado'),
      /transición ilegal/,
      'PAUSADO --completado--> ? debe lanzar'
    );
  }
  console.log('✓ ciclo-impresion: transición ilegal lanza');

  // ── 3. _iniciar con gcode -> IMPRIMIENDO + impresion.iniciada ──
  {
    const m = nuevoReflejo();
    const emitidos = capturar(m);
    const r = await m._iniciar({
      project_id: PID, gcode: 'G28\n', tarea_id: 't1', modelo_id: 'm1', material: 'PETG'
    });
    assert.strictEqual(r.status, 200, 'inicia ok');
    assert.strictEqual(r.data.estado, 'IMPRIMIENDO', 'llega a IMPRIMIENDO');
    assert.ok(emitidos.some(e => e.ev === 'impresion.iniciada'), 'emite impresion.iniciada');
  }
  console.log('✓ ciclo-impresion: _iniciar llega a IMPRIMIENDO');

  // ── 4. sin gcode -> CICLO_ABORTADO + ciclo_abortado ──
  {
    const m = nuevoReflejo({ sinGcodeCupula: true });
    const emitidos = capturar(m);
    const r = await m._iniciar({ project_id: PID, archivo_id: 'arc1' });
    assert.strictEqual(r.status, 500, 'aborta');
    assert.strictEqual(r.error.code, 'CICLO_ABORTADO', 'codigo de aborto');
    assert.ok(emitidos.some(e => e.ev === 'ciclo_abortado'), 'emite ciclo_abortado');
  }
  console.log('✓ ciclo-impresion: sin gcode aborta');

  // ── 5. subida falla -> CICLO_ABORTADO ──
  {
    const m = nuevoReflejo({ subidaFalla: true });
    const r = await m._iniciar({ project_id: PID, gcode: 'G28\n' });
    assert.strictEqual(r.status, 500, 'subida falla aborta');
    assert.strictEqual(r.error.code, 'CICLO_ABORTADO', 'codigo de aborto');
  }
  console.log('✓ ciclo-impresion: subida falla aborta');

  // ── 6. no se puede iniciar con impresion activa (409) ──
  {
    const m = nuevoReflejo();
    await m._iniciar({ project_id: PID, gcode: 'G28\n' });
    const r2 = await m._iniciar({ project_id: PID, gcode: 'G28\n' });
    assert.strictEqual(r2.status, 409, 'una sola impresora a la vez');
    assert.strictEqual(r2.error.code, 'CONFLICT_STATE', 'codigo 409');
  }
  console.log('✓ ciclo-impresion: no se inicia con impresion activa');

  // ── 7. pausar / reanudar ──
  {
    const m = nuevoReflejo();
    await m._iniciar({ project_id: PID, gcode: 'G28\n' });
    const p = await m._pausar({ project_id: PID });
    assert.strictEqual(p.data.estado, 'PAUSADO', 'pausa');
    const r = await m._reanudar({ project_id: PID });
    assert.strictEqual(r.data.estado, 'IMPRIMIENDO', 'reanuda');
  }
  console.log('✓ ciclo-impresion: pausar/reanudar');

  // ── 8. abortar -> CANCELADA + ciclo_abortado ──
  {
    const m = nuevoReflejo();
    await m._iniciar({ project_id: PID, gcode: 'G28\n' });
    const emitidos = capturar(m);
    const r = await m._abortar({ project_id: PID, motivo: 'trabajador' });
    assert.strictEqual(r.status, 200, 'aborta ok');
    assert.strictEqual(r.data.estado, 'CANCELADA', 'llega a CANCELADA');
    assert.ok(emitidos.some(e => e.ev === 'ciclo_abortado'), 'emite ciclo_abortado');
  }
  console.log('✓ ciclo-impresion: abortar');

  // ── 9. onEstadoCrudo completado -> TERMINADA (encadena) ──
  {
    const m = nuevoReflejo();
    await m._iniciar({ project_id: PID, gcode: 'G28\n' });
    await m._manejarTerminada(PID, m._ciclos.get(PID), {
      data: { project_id: PID },
      estado_sistema: { estado: 'completado', filament_used_mm: 1200, print_duration: 1800 }
    });
    assert.strictEqual(m._ciclos.get(PID).estado, 'TERMINADA', 'completado -> TERMINADA');
  }
  console.log('✓ ciclo-impresion: completado -> TERMINADA');

  // ── 10. onEstadoCrudo fallo -> FALLIDA + manejo-fallo ──
  {
    const m = nuevoReflejo();
    await m._iniciar({ project_id: PID, gcode: 'G28\n' });
    await m.onEstadoCrudo({
      data: {
        project_id: PID,
        estado_sistema: { estado: 'fallo', message: 'printer_halted' }
      }
    });
    assert.strictEqual(m._ciclos.get(PID).estado, 'FALLIDA', 'fallo -> FALLIDA');
  }
  console.log('✓ ciclo-impresion: fallo -> FALLIDA');

  // ── 11. validaciones ──
  {
    const m = nuevoReflejo();
    const noPid = await m._iniciar({ gcode: 'G28\n' });
    assert.strictEqual(noPid.status, 400, 'exige project_id');
    const noGcode = await m._iniciar({ project_id: PID });
    assert.strictEqual(noGcode.status, 400, 'exige gcode');
  }
  console.log('✓ ciclo-impresion: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE CICLO-IMPRESION PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
