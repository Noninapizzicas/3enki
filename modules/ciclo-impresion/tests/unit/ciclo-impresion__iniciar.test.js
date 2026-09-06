'use strict';

/**
 * ciclo-impresion — REFLEJO _iniciar / _obtenerGcode / _aplicarTransicion /
 * _vigilarProgreso / _detectarFin / _detectarError / _detectarFaltaFilamento /
 * _encadenarSiguiente (el MICRO-AGENTE/ORQUESTADOR del ciclo de impresión 3D).
 *
 * Esta suite fija el contrato del DUEÑO de la máquina de estados:
 *   - _iniciar: cola vacía → COLA_VACIA + ciclo.cola_vacia; con pieza → obtiene gcode
 *     (cúpula primero, slicer si no), sube, inicia, observa → IMPRIMIENDO + ciclo.iniciado.
 *   - _obtenerGcode (3.1): enruta cúpula (reutilizar) vs slicer (slicear); sin .3mf → null.
 *   - _aplicarTransicion: máquina de estados; transición ilegal → throw.
 *   - _detectarFin (3.4): completado → impresion.completada.
 *   - _detectarError (3.5): fallo → impresion.error (error_desconocido si sin message).
 *   - _detectarFaltaFilamento (3.6): filament_detected false → filamento.falta.
 *   - _vigilarProgreso (3.3): emite progreso.actualizado + filamento.usado.
 *   - _encadenarSiguiente: tras retirar, re-inicia con la siguiente; cola vacía → ciclo.completado.
 *
 * Sin bus ni fs: las proyecciones se invocan directas con eventBus/_rpc stub.
 * Ejecutar: node /tmp/ciclo-impresion/tests/unit/ciclo-impresion__iniciar.test.js
 */

const assert = require('assert');
const CicloImpresion = require('../../index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Stub de bus que captura eventos publicados.
function nuevoReflejo(overrides = {}) {
  const m = new CicloImpresion();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish: () => {} };
  m._rpc = async (topic, payload = {}) => {
    const pid = payload.project_id;
    switch (topic) {
      case 'cola.siguiente.request':
        return overrides.colaVacia
          ? { status: 200, data: { vacia: true, item: null } }
          : { status: 200, data: { vacia: false, item: { id: 'it1', modelo_id: 'm1', nombre: 'Soporte', material: 'PLA' } } };
      case 'cupula.buscar.request':
        return overrides.cupulaEncontrado
          ? { status: 200, data: { encontrado: true, gcode: { clave: 'm1::PLA', contenido: 'G28\nG1 X0 Y0\n' } } }
          : { status: 200, data: { encontrado: false, gcode: null } };
      case 'catalogo.obtener.request':
        return overrides.sin3mf
          ? { status: 200, data: { modelo: { id: 'm1', archivo3mf: null } } }
          : { status: 200, data: { modelo: { id: 'm1', archivo3mf: 'modelo.3mf' } } };
      case 'adaptador-slicing.slicear.request':
        return overrides.slicerFalla
          ? { status: 502, data: { error: 'SLICER_FALLO' } }
          : { status: 200, data: { gcode: 'G28\nG1 X0 Y0\nG1 X10 Y10\n', perfil: 'rapido' } };
      case 'cupula.almacenar.request':
        return { status: 200, data: { clave: 'm1::PLA' } };
      case 'adaptador-impresora.subir_gcode.request':
        return overrides.subidaFalla
          ? { status: 502, data: { error: 'UPSTREAM_INVALID_RESPONSE' } }
          : { status: 200, data: { ok: true, id: 'g1' } };
      case 'adaptador-impresora.iniciar_impresion.request':
        return overrides.inicioFalla
          ? { status: 502, data: { error: 'UPSTREAM_INVALID_RESPONSE' } }
          : { status: 200, data: { ok: true } };
      case 'adaptador-impresora.observar_estado.request':
        return { status: 200, data: { ok: true, stream: 'abierto' } };
      case 'adaptador-avisos.enviar.request':
        return { status: 200, data: { enviado: true } };
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

// =============================================================
// _aplicarTransicion — la máquina de estados
// =============================================================
test('transición legal: IDLE --ciclo.iniciar--> OBTENIENDO_GCODE', () => {
  const m = nuevoReflejo();
  const ciclo = { estado: 'IDLE', pieza: null };
  const nuevo = m._aplicarTransicion('p1', ciclo, 'ciclo.iniciar');
  assert.strictEqual(nuevo, 'OBTENIENDO_GCODE');
  assert.strictEqual(ciclo.estado, 'OBTENIENDO_GCODE');
});

test('transición legal: IMPRIMIENDO --impresion.completada--> ESPERANDO_RETIRADA', () => {
  const m = nuevoReflejo();
  const ciclo = { estado: 'IMPRIMIENDO', pieza: { id: 'it1' } };
  const nuevo = m._aplicarTransicion('p1', ciclo, 'impresion.completada');
  assert.strictEqual(nuevo, 'ESPERANDO_RETIRADA');
});

test('transición legal: ESPERANDO_RETIRADA --confirmacion:pieza_retirada--> IDLE', () => {
  const m = nuevoReflejo();
  const ciclo = { estado: 'ESPERANDO_RETIRADA', pieza: { id: 'it1' } };
  const nuevo = m._aplicarTransicion('p1', ciclo, 'confirmacion:pieza_retirada');
  assert.strictEqual(nuevo, 'IDLE');
});

test('transición legal: IMPRIMIENDO --filamento.falta--> PAUSADO_FALTA_FILAMENTO', () => {
  const m = nuevoReflejo();
  const ciclo = { estado: 'IMPRIMIENDO', pieza: { id: 'it1' } };
  const nuevo = m._aplicarTransicion('p1', ciclo, 'filamento.falta');
  assert.strictEqual(nuevo, 'PAUSADO_FALTA_FILAMENTO');
});

test('transición legal: PAUSADO_FALTA_FILAMENTO --confirmacion:filamento_cambiado--> IMPRIMIENDO', () => {
  const m = nuevoReflejo();
  const ciclo = { estado: 'PAUSADO_FALTA_FILAMENTO', pieza: { id: 'it1' } };
  const nuevo = m._aplicarTransicion('p1', ciclo, 'confirmacion:filamento_cambiado');
  assert.strictEqual(nuevo, 'IMPRIMIENDO');
});

test('transición legal: ERROR --confirmacion:reanudar_ciclo--> IDLE', () => {
  const m = nuevoReflejo();
  const ciclo = { estado: 'ERROR', pieza: { id: 'it1' } };
  const nuevo = m._aplicarTransicion('p1', ciclo, 'confirmacion:reanudar_ciclo');
  assert.strictEqual(nuevo, 'IDLE');
});

test('transición ilegal: IDLE --impresion.completada--> throw', () => {
  const m = nuevoReflejo();
  const ciclo = { estado: 'IDLE', pieza: null };
  assert.throws(() => m._aplicarTransicion('p1', ciclo, 'impresion.completada'), /transición ilegal/);
});

test('transición ilegal: IMPRIMIENDO --ciclo.iniciar--> throw (una pieza a la vez)', () => {
  const m = nuevoReflejo();
  const ciclo = { estado: 'IMPRIMIENDO', pieza: { id: 'it1' } };
  assert.throws(() => m._aplicarTransicion('p1', ciclo, 'ciclo.iniciar'), /transición ilegal/);
});

// =============================================================
// _iniciar — el flujo completo
// =============================================================
test('iniciar con cola vacía → COLA_VACIA + ciclo.cola_vacia', async () => {
  const m = nuevoReflejo({ colaVacia: true });
  const emitidos = capturar(m);
  const r = await m._iniciar({ project_id: 'p1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estado, 'COLA_VACIA');
  assert.strictEqual(r.data.pieza, null);
  assert.ok(emitidos.some(x => x.ev === 'ciclo.cola_vacia'), 'emite ciclo.cola_vacia');
});

test('iniciar con pieza → IMPRIMIENDO + ciclo.iniciado (gcode de la cúpula)', async () => {
  const m = nuevoReflejo({ cupulaEncontrado: true });
  const emitidos = capturar(m);
  const r = await m._iniciar({ project_id: 'p1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estado, 'IMPRIMIENDO');
  assert.strictEqual(r.data.pieza.nombre, 'Soporte');
  assert.ok(emitidos.some(x => x.ev === 'ciclo.iniciado'), 'emite ciclo.iniciado');
  assert.strictEqual(m._ciclos.get('p1').estado, 'IMPRIMIENDO');
});

test('iniciar con pieza → slicer si la cúpula no tiene gcode (enruta y cachea)', async () => {
  const m = nuevoReflejo({});   // cupula no encontrado → slicer
  const emitidos = capturar(m);
  const r = await m._iniciar({ project_id: 'p1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estado, 'IMPRIMIENDO');
  // El slicer devolvió gcode y se guardó en la cúpula (cupula.almacenar.request).
  assert.ok(emitidos.some(x => x.ev === 'ciclo.iniciado'), 'emite ciclo.iniciado');
});

test('iniciar sin .3mf → ciclo.abortado (invariante 7: no avanza sin gcode)', async () => {
  const m = nuevoReflejo({ sin3mf: true });
  const emitidos = capturar(m);
  const r = await m._iniciar({ project_id: 'p1' });
  assert.strictEqual(r.status, 500);
  assert.strictEqual(r.error.code, 'CICLO_ABORTADO');
  assert.strictEqual(m._ciclos.get('p1').estado, 'ERROR');
  assert.ok(emitidos.some(x => x.ev === 'ciclo.abortado'), 'emite ciclo.abortado');
});

test('iniciar con slicer que falla → ciclo.abortado', async () => {
  const m = nuevoReflejo({ slicerFalla: true });
  const emitidos = capturar(m);
  const r = await m._iniciar({ project_id: 'p1' });
  assert.strictEqual(r.status, 500);
  assert.strictEqual(r.error.code, 'CICLO_ABORTADO');
  assert.ok(emitidos.some(x => x.ev === 'ciclo.abortado'), 'emite ciclo.abortado');
});

test('iniciar con subida que falla → ciclo.abortado (contrato tolerante)', async () => {
  const m = nuevoReflejo({ subidaFalla: true });
  const emitidos = capturar(m);
  const r = await m._iniciar({ project_id: 'p1' });
  assert.strictEqual(r.status, 500);
  assert.strictEqual(r.error.code, 'CICLO_ABORTADO');
  assert.ok(emitidos.some(x => x.ev === 'ciclo.abortado'), 'emite ciclo.abortado');
});

test('iniciar cuando ya está imprimiendo → CONFLICT_STATE (una pieza a la vez)', async () => {
  const m = nuevoReflejo({});
  await m._iniciar({ project_id: 'p1' });
  const r = await m._iniciar({ project_id: 'p1' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'CONFLICT_STATE');
});

// =============================================================
// _obtenerGcode (3.1) — enrutamiento cúpula vs slicer
// =============================================================
test('_obtenerGcode: cúpula con gcode → lo reutiliza (no slicera)', async () => {
  const m = nuevoReflejo({ cupulaEncontrado: true });
  const gcode = await m._obtenerGcode('p1', { modelo_id: 'm1', material: 'PLA' });
  assert.ok(gcode, 'devuelve gcode');
  assert.strictEqual(gcode.contenido, 'G28\nG1 X0 Y0\n');
});

test('_obtenerGcode: sin .3mf → null (no avanza sin gcode)', async () => {
  const m = nuevoReflejo({ sin3mf: true });
  const gcode = await m._obtenerGcode('p1', { modelo_id: 'm1', material: 'PLA' });
  assert.strictEqual(gcode, null);
});

// =============================================================
// Detecciones (3.4 / 3.5 / 3.6) y vigilancia (3.3)
// =============================================================
test('_detectarFin: estado completado → impresion.completada', () => {
  const m = nuevoReflejo();
  const emitidos = capturar(m);
  const ciclo = { estado: 'IMPRIMIENDO', pieza: { id: 'it1', modelo_id: 'm1', nombre: 'Soporte', material: 'PLA' } };
  m._detectarFin('p1', ciclo, { estado: 'completado', filament_used_mm: 120.5, total_duration: 3600 });
  const ev = emitidos.find(x => x.ev === 'impresion.completada');
  assert.ok(ev, 'emite impresion.completada');
  assert.strictEqual(ev.d.modelo_id, 'm1');
  assert.strictEqual(ev.d.resultado, 'completada');
});

test('_detectarError: estado fallo → impresion.error (error_desconocido si sin message)', () => {
  const m = nuevoReflejo();
  const emitidos = capturar(m);
  const ciclo = { estado: 'IMPRIMIENDO', pieza: { id: 'it1', modelo_id: 'm1' } };
  m._detectarError('p1', ciclo, { estado: 'fallo' });
  const ev = emitidos.find(x => x.ev === 'impresion.error');
  assert.ok(ev, 'emite impresion.error');
  assert.strictEqual(ev.d.error, 'error_desconocido');
});

test('_detectarFaltaFilamento: filament_detected false → filamento.falta', () => {
  const m = nuevoReflejo();
  const emitidos = capturar(m);
  const ciclo = { estado: 'IMPRIMIENDO', pieza: { id: 'it1', modelo_id: 'm1' } };
  m._detectarFaltaFilamento('p1', ciclo, { filament_detected: false });
  assert.ok(emitidos.some(x => x.ev === 'filamento.falta'), 'emite filamento.falta');
});

test('_vigilarProgreso: emite progreso.actualizado + filamento.usado', () => {
  const m = nuevoReflejo();
  const emitidos = capturar(m);
  const ciclo = { estado: 'IMPRIMIENDO', pieza: { id: 'it1', modelo_id: 'm1' } };
  m._vigilarProgreso('p1', ciclo, { progress: 0.5, filament_used_mm: 60.25 });
  assert.ok(emitidos.some(x => x.ev === 'progreso.actualizado' && x.d.progress === 0.5), 'emite progreso');
  assert.ok(emitidos.some(x => x.ev === 'filamento.usado' && x.d.filament_used === 60.25), 'emite filamento.usado');
});

// =============================================================
// onEstadoCrudo — el DUEÑO vigila y detecta
// =============================================================
test('onEstadoCrudo: en IMPRIMIENDO con estado completado → impresion.completada', () => {
  const m = nuevoReflejo();
  const emitidos = capturar(m);
  m._ciclos.set('p1', { estado: 'IMPRIMIENDO', pieza: { id: 'it1', modelo_id: 'm1', nombre: 'Soporte', material: 'PLA' } });
  m.onEstadoCrudo({ data: { project_id: 'p1', estado_sistema: { estado: 'completado' } } });
  assert.ok(emitidos.some(x => x.ev === 'impresion.completada'), 'emite impresion.completada');
});

test('onEstadoCrudo: fuera de IMPRIMIENDO → no vigila (ignora)', () => {
  const m = nuevoReflejo();
  const emitidos = capturar(m);
  m._ciclos.set('p1', { estado: 'IDLE', pieza: null });
  m.onEstadoCrudo({ data: { project_id: 'p1', estado_sistema: { estado: 'completado' } } });
  assert.ok(!emitidos.some(x => x.ev === 'impresion.completada'), 'no emite nada');
});

// =============================================================
// Confirmaciones — el DUEÑO aplica la transición
// =============================================================
test('onConfirmacionRecibida: pieza_retirada en ESPERANDO_RETIRADA → IDLE', () => {
  const m = nuevoReflejo();
  m._ciclos.set('p1', { estado: 'ESPERANDO_RETIRADA', pieza: { id: 'it1' } });
  m.onConfirmacionRecibida({ data: { project_id: 'p1', tipo: 'pieza_retirada' } });
  assert.strictEqual(m._ciclos.get('p1').estado, 'IDLE');
});

test('onConfirmacionRecibida: filamento_cambiado en PAUSADO → IMPRIMIENDO', () => {
  const m = nuevoReflejo();
  m._ciclos.set('p1', { estado: 'PAUSADO_FALTA_FILAMENTO', pieza: { id: 'it1' } });
  m.onConfirmacionRecibida({ data: { project_id: 'p1', tipo: 'filamento_cambiado' } });
  assert.strictEqual(m._ciclos.get('p1').estado, 'IMPRIMIENDO');
});

test('onConfirmacionRecibida: reanudar_ciclo en ERROR → IDLE', () => {
  const m = nuevoReflejo();
  m._ciclos.set('p1', { estado: 'ERROR', pieza: { id: 'it1' } });
  m.onConfirmacionRecibida({ data: { project_id: 'p1', tipo: 'reanudar_ciclo' } });
  assert.strictEqual(m._ciclos.get('p1').estado, 'IDLE');
});

test('onConfirmacionRecibida: tipo no reconocido → no transiciona (pide aclaración)', () => {
  const m = nuevoReflejo();
  m._ciclos.set('p1', { estado: 'ESPERANDO_RETIRADA', pieza: { id: 'it1' } });
  m.onConfirmacionRecibida({ data: { project_id: 'p1', tipo: 'no_reconocida' } });
  assert.strictEqual(m._ciclos.get('p1').estado, 'ESPERANDO_RETIRADA', 'no cambia');
});

// =============================================================
// _encadenarSiguiente — encadena la siguiente tras retirar
// =============================================================
test('_encadenarSiguiente: cola vacía → ciclo.completado (impresora ociosa con causa)', async () => {
  const m = nuevoReflejo({ colaVacia: true });
  const emitidos = capturar(m);
  m._ciclos.set('p1', { estado: 'IDLE', pieza: null });
  const r = await m._encadenarSiguiente('p1');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estado, 'COLA_VACIA');
  assert.ok(emitidos.some(x => x.ev === 'ciclo.completado'), 'emite ciclo.completado');
});

test('_encadenarSiguiente: hay siguiente → re-inicia y emite ciclo.iniciado', async () => {
  const m = nuevoReflejo({});
  const emitidos = capturar(m);
  m._ciclos.set('p1', { estado: 'IDLE', pieza: null });
  const r = await m._encadenarSiguiente('p1');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estado, 'IMPRIMIENDO');
  assert.ok(emitidos.some(x => x.ev === 'ciclo.iniciado'), 'emite ciclo.iniciado');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[ciclo-impresion__iniciar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[ciclo-impresion__iniciar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
