/**
 * Tests unitarios — panel-trabajador (REFLEJO del taller 3D, F4 TANDA 4).
 *
 * Sin bus real: se sobreescribe m._rpc con respuestas canónicas por tópico y se capturan
 * los fire-and-forget. Casos:
 *   - _estadoVivo cruza ciclo+cola+filamento+eventos (best-effort)
 *   - _proximoAEncadenar delega en cola.siguiente
 *   - _control DELEGA (pausar/reanudar/abortar -> ciclo; reintentar/saltar -> manejo-fallo;
 *     cambio_bobina -> filamento; confirmar -> confirmacion)
 *   - _control con accion invalida -> 400 (nada de decisión futura)
 *
 * Ejecutar: node modules/panel-trabajador/tests/unit/panel-trabajador.test.js
 */

'use strict';

const assert = require('assert');

const PanelTrabajador = require('../../index.js');

function nuevoReflejo(overrides = {}) {
  const m = new PanelTrabajador();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish: () => {} };
  m._rpc = async (topic, payload = {}) => {
    switch (topic) {
      case 'ciclo-impresion.estado.request':
        return overrides.sinCiclo
          ? null
          : { status: 200, data: { estado: 'IMPRIMIENDO', pieza: { tarea_id: 't1' }, error: null } };
      case 'cola.siguiente.request':
        return { status: 200, data: { siguiente: { id: 'it1', modelo_id: 'm1' }, razon: 'listo' } };
      case 'filamento.evaluar.request':
        return { status: 200, data: { evaluadas: 2, bajas: [] } };
      case 'historial.recientes.request':
        return { status: 200, data: { registros: [{ id: 'r1', resultado: 'OK' }], total: 1 } };
      case 'ciclo-impresion.pausar.request':
      case 'ciclo-impresion.reanudar.request':
      case 'ciclo-impresion.abortar.request':
        return { status: 200, data: { ok: true } };
      case 'manejo-fallo.manejar.request':
        return { status: 200, data: { accion: overrides.manejoAccion || 'REINTENTAR' } };
      case 'filamento.cambiar.request':
        return { status: 200, data: { bobina: { id: payload.bobina_id } } };
      case 'adaptador-confirmacion.confirmar.request':
        return overrides.confirmarFalla ? { status: 502, data: {} } : { status: 200, data: { ok: true } };
      default:
        return { status: 500, data: {} };
    }
  };
  return m;
}

const PID = '3d';

(async () => {
  // ── 1. _estadoVivo cruza los stores (best-effort) ──
  {
    const m = nuevoReflejo();
    const r = await m._estadoVivo({ project_id: PID });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.fase.estado, 'IMPRIMIENDO', 'fase del ciclo');
    assert.strictEqual(r.data.cola.siguiente.id, 'it1', 'cola');
    assert.strictEqual(r.data.eventos.length, 1, 'eventos');
  }
  console.log('✓ panel-trabajador: estado_vivo cruza stores');

  // ── 2. datos ausentes -> 'desconocido' (nunca inventado) ──
  {
    const m = nuevoReflejo({ sinCiclo: true });
    const r = await m._estadoVivo({ project_id: PID });
    assert.strictEqual(r.data.fase.estado, 'desconocido', 'sin ciclo -> desconocido');
  }
  console.log('✓ panel-trabajador: dato ausente -> desconocido');

  // ── 3. _proximoAEncadenar delega en cola.siguiente ──
  {
    const m = nuevoReflejo();
    const r = await m._proximoAEncadenar({ project_id: PID });
    assert.strictEqual(r.data.siguiente.id, 'it1', 'proxima pieza');
  }
  console.log('✓ panel-trabajador: proximo_encadenar');

  // ── 4. _control pausar DELEGA en ciclo-impresion ──
  {
    const m = nuevoReflejo();
    const r = await m._control({ project_id: PID, accion: 'pausar' });
    assert.strictEqual(r.status, 200, 'pausar delega');
    assert.strictEqual(r.data.accion, 'pausar', 'accion pausar');
    assert.ok(r.data.delegado_en.includes('ciclo-impresion.pausar'), 'delega en ciclo-impresion');
  }
  console.log('✓ panel-trabajador: control pausar delega');

  // ── 5. _control reintentar DELEGA en manejo-fallo ──
  {
    const m = nuevoReflejo({ manejoAccion: 'SALTAR' });
    const r = await m._control({ project_id: PID, accion: 'saltar', tarea_id: 't1' });
    assert.strictEqual(r.data.accion, 'saltar');
    assert.strictEqual(r.data.resultado.accion, 'SALTAR', 'manejo-fallo decide segun politica');
  }
  console.log('✓ panel-trabajador: control saltar delega en manejo-fallo');

  // ── 6. _control cambio_bobina DELEGA en filamento ──
  {
    const m = nuevoReflejo();
    const r = await m._control({ project_id: PID, accion: 'cambio_bobina', bobina_id: 'b1' });
    assert.strictEqual(r.status, 200, 'cambio de bobina');
    assert.strictEqual(r.data.resultado.bobina.id, 'b1', 'delega en filamento');
  }
  console.log('✓ panel-trabajador: control cambio_bobina delega en filamento');

  // ── 7. _control confirmar delega en adaptador-confirmacion ──
  {
    const m = nuevoReflejo();
    const r = await m._control({ project_id: PID, accion: 'confirmar', tipo_confirmacion: 'reanudar_ciclo' });
    assert.strictEqual(r.status, 200, 'confirmar delega');
  }
  console.log('✓ panel-trabajador: control confirmar delega');

  // ── 8. accion invalida -> 400 (nada de decision futura) ──
  {
    const m = nuevoReflejo();
    const r = await m._control({ project_id: PID, accion: 'aprobar_propuesta' });
    assert.strictEqual(r.status, 400, 'no acepta acciones de jefe');
  }
  console.log('✓ panel-trabajador: no acepta acciones de jefe');

  // ── 9. delegacion falla -> emite par de fallo ──
  {
    const m = nuevoReflejo({ confirmarFalla: true });
    const published = [];
    m.eventBus = { publish: (ev, d) => published.push([ev, d]) };
    const r = await m._control({ project_id: PID, accion: 'confirmar', tipo_confirmacion: 'reanudar_ciclo' });
    assert.strictEqual(r.status, 502, 'falla la delegacion');
    assert.ok(published.some(p => p[0] === 'panel-trabajador.control.failed'), 'emite par de fallo');
  }
  console.log('✓ panel-trabajador: delegacion falla emite par de fallo');

  // ── 10. validaciones ──
  {
    const m = nuevoReflejo();
    const noPid = await m._estadoVivo({});
    assert.strictEqual(noPid.status, 400, 'exige project_id');
    const noAccion = await m._control({ project_id: PID });
    assert.strictEqual(noAccion.status, 400, 'exige accion');
  }
  console.log('✓ panel-trabajador: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE PANEL-TRABAJADOR PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
