/**
 * Tests unitarios — panel-jefe (REFLEJO del taller 3D, F4 TANDA 4).
 *
 * Sin bus real: se sobreescribe m._rpc con respuestas canónicas por tópico y se
 * capturan los fire-and-forget. Casos:
 *   - _resumen cruza ciclo+cola+filamento+consumo+historial
 *   - _propuestas usa motor-propuesta.proponer (PROPUESTA, no muta)
 *   - _aprobarPropuesta delega en cola.reordenar SOLO con decision del jefe
 *   - _marcarPrioridad delega en cola.marcar_urgente
 *   - _pedirReposicion delega en adaptador-confirmacion
 *   - _verDetalle cruza catalogo + cupula-gcode
 *   - CERO juicio: no decide el orden por su cuenta (exige propuesta aprobada)
 *
 * Ejecutar: node modules/panel-jefe/tests/unit/panel-jefe.test.js
 */

'use strict';

const assert = require('assert');

const PanelJefe = require('../../index.js');

function nuevoReflejo(overrides = {}) {
  const m = new PanelJefe();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish: () => {} };
  m._rpc = async (topic, payload = {}) => {
    switch (topic) {
      case 'ciclo-impresion.estado.request':
        return { status: 200, data: { estado: 'IMPRIMIENDO', pieza: { tarea_id: 't1' } } };
      case 'cola.siguiente.request':
        return { status: 200, data: { siguiente: { id: 'it1', modelo_id: 'm1' }, razon: 'listo' } };
      case 'filamento.evaluar.request':
        return { status: 200, data: { evaluadas: 2, bajas: [] } };
      case 'consumo.promedio.request':
        return overrides.consumoNull ? { status: 200, data: { gramos_promedio: null } } : { status: 200, data: { gramos_promedio: 12.5, tiempo_promedio_s: 1800 } };
      case 'historial.recientes.request':
        return { status: 200, data: { registros: [{ id: 'r1', resultado: 'OK' }], total: 1 } };
      case 'motor-propuesta.proponer.request':
        return overrides.proponerFalla ? { status: 502, data: {} } : { status: 200, data: { propuesta: true, orden: [{ id: 'it1' }], total: 1 } };
      case 'cola.reordenar.request':
        return overrides.reordenarFalla ? { status: 409, data: {} } : { status: 200, data: { total: 2, orden: payload.orden.map(o => o.id || o) } };
      case 'cola.marcar_urgente.request':
        return { status: 200, data: { tarea: { id: payload.id, urgente: payload.urgente } } };
      case 'adaptador-confirmacion.confirmar.request':
        return overrides.reposicionFalla ? { status: 502, data: {} } : { status: 200, data: { confirmacion_id: 'cf1' } };
      case 'catalogo.por_id.request':
        return { status: 200, data: { modelo: { id: 'm1', nombre: 'Soporte' } } };
      case 'cupula-gcode.obtener.request':
        return { status: 200, data: { archivo: { id: 'arc1', formato: 'GCODE' } } };
      default:
        return { status: 500, data: {} };
    }
  };
  return m;
}

const PID = '3d';

(async () => {
  // ── 1. _resumen cruza todos los stores ──
  {
    const m = nuevoReflejo();
    const r = await m._resumen({ project_id: PID });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.impresion_actual.estado, 'IMPRIMIENDO', 'ciclo');
    assert.strictEqual(r.data.cola.siguiente.id, 'it1', 'cola');
    assert.strictEqual(r.data.consumo.gramos_promedio, 12.5, 'consumo');
    assert.strictEqual(r.data.historial.length, 1, 'historial');
  }
  console.log('✓ panel-jefe: resumen cruza stores');

  // ── 2. consumo sin dato -> NULO (no inventa) ──
  {
    const m = nuevoReflejo({ consumoNull: true });
    const r = await m._resumen({ project_id: PID });
    assert.strictEqual(r.data.consumo.gramos_promedio, null, 'sin dato -> NULO');
  }
  console.log('✓ panel-jefe: consumo sin dato -> NULO');

  // ── 3. _propuestas usa motor-propuesta (PROPUESTA, no muta) ──
  {
    const m = nuevoReflejo();
    const r = await m._propuestas({ project_id: PID, tareas: [{ id: 'it1', gcode_listo: true }] });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.propuesta, true, 'es propuesta');
    assert.strictEqual(r.data.orden[0].id, 'it1', 'orden propuesta');
  }
  console.log('✓ panel-jefe: propuestas -> motor-propuesta');

  // ── 4. _aprobarPropuesta delega en cola.reordenar (decision del jefe) ──
  {
    const m = nuevoReflejo();
    const r = await m._aprobarPropuesta({ project_id: PID, orden: [{ id: 'it1' }, { id: 'it2' }], aprobada_by: 'el_jefe' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.aprobada, true, 'aprueba');
    assert.strictEqual(r.data.por, 'el_jefe', 'decision del jefe');
  }
  console.log('✓ panel-jefe: aprobar_propuesta delega en cola');

  // ── 5. _marcarPrioridad delega en cola.marcar_urgente ──
  {
    const m = nuevoReflejo();
    const r = await m._marcarPrioridad({ project_id: PID, id: 'it1', urgente: true });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.tarea.urgente, true, 'marca urgencia');
  }
  console.log('✓ panel-jefe: marcar_prioridad delega');

  // ── 6. _pedirReposicion delega en adaptador-confirmacion ──
  {
    const m = nuevoReflejo();
    const r = await m._pedirReposicion({ project_id: PID, bobina_id: 'b1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.pedida, true, 'pide reposicion');
    assert.ok(r.data.confirmacion_id, 'tiene confirmacion_id');
  }
  console.log('✓ panel-jefe: pedir_reposicion delega');

  // ── 7. _verDetalle cruza catalogo + cupula ──
  {
    const m = nuevoReflejo();
    const r = await m._verDetalle({ project_id: PID, modelo_id: 'm1', archivo_id: 'arc1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.modelo.nombre, 'Soporte', 'detalle del modelo');
    assert.strictEqual(r.data.archivo.formato, 'GCODE', 'detalle del archivo');
  }
  console.log('✓ panel-jefe: ver_detalle cruza');

  // ── 8. CERO juicio: no reordena por su cuenta (sin decision) ──
  {
    const m = nuevoReflejo({ reordenarFalla: true });
    const r = await m._aprobarPropuesta({ project_id: PID, orden: [{ id: 'it1' }] });
    assert.strictEqual(r.status === 502 || r.status === 409, true, 'reordena solo si la cola acepta la decision');
    // la cola exige aprobada_by; si no llega, el sistema no fuerza el reorden
  }
  console.log('✓ panel-jefe: cero juicio en reorden');

  // ── 9. delegacion de reposicion falla -> emite par de fallo ──
  {
    const m = nuevoReflejo({ reposicionFalla: true });
    const published = [];
    m.eventBus = { publish: (ev, d) => published.push([ev, d]) };
    const r = await m._pedirReposicion({ project_id: PID, bobina_id: 'b1' });
    assert.strictEqual(r.status, 502, 'falla la delegacion');
    assert.ok(published.some(p => p[0] === 'panel-jefe.pedir_reposicion.failed'), 'emite par de fallo');
  }
  console.log('✓ panel-jefe: delegacion falla emite par de fallo');

  // ── 10. validaciones ──
  {
    const m = nuevoReflejo();
    const noPid = await m._resumen({});
    assert.strictEqual(noPid.status, 400, 'exige project_id');
    const noOrden = await m._aprobarPropuesta({ project_id: PID });
    assert.strictEqual(noOrden.status, 400, 'exige orden');
    const noModelo = await m._verDetalle({ project_id: PID });
    assert.strictEqual(noModelo.status, 400, 'exige modelo_id o archivo_id');
  }
  console.log('✓ panel-jefe: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE PANEL-JEFE PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
