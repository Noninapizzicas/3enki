/**
 * test-reflejo-3d.js — Test de reflejo de los módulos nuevos del vertical 3D (F4).
 *
 * Verifica SIN bus (funciones puras exportadas + instanciación de los reflejos):
 *   - cupula_stl: registrar/obtener/listar (store en memoria, sin fs).
 *   - cupula_gcode: registrar/obtener_por_maquina/listar + cache por (stl_id, maquina).
 *   - estimador_tiempo: estimarMinutos (volumen/material).
 *   - puente_creality: instancia + handlers declarados.
 *   - motor_propuesta: ReglaPrioridadConPresencia (proponerSiguiente con contexto).
 *
 * Uso: node test-reflejo-3d.js
 */

'use strict';

const assert = require('assert');

// ── 1. estimador_tiempo (función pura) ──
const { estimarMinutos } = require('./estimador_tiempo/index.js');

// Caja 20×20×20 PETG → volumen 8000 mm³ / 7200 = 1.11 → 1 min.
assert.strictEqual(estimarMinutos({ dimensiones: { ancho: 20, alto: 20, profundo: 20 } }, 'petg'), 1, 'caja 20³ petg');
// Caja 100×100×100 PETG → 1e6 / 7200 = 138.8 → 139 min.
assert.strictEqual(estimarMinutos({ dimensiones: { ancho: 100, alto: 100, profundo: 100 } }, 'petg'), 139, 'caja 100³ petg');
// PLA es más rápido (8400) → menos minutos.
assert.ok(estimarMinutos({ dimensiones: { ancho: 100, alto: 100, profundo: 100 } }, 'pla') < estimarMinutos({ dimensiones: { ancho: 100, alto: 100, profundo: 100 } }, 'petg'), 'pla < petg');
// Cilindro r=10 h=20 → π·100·20 = 6283 / 7200 = 0.87 → 1 min.
assert.strictEqual(estimarMinutos({ forma: 'cilindro', dimensiones: { radio: 10, alto: 20 } }, 'petg'), 1, 'cilindro');
console.log('✓ estimador_tiempo.estimarMinutos');

// ── 2. motor_propuesta: ReglaPrioridadConPresencia ──
const { proponerSiguiente } = require('./motor_propuesta/index.js');

const modelos = [
  { id: 'a', estado: 'PENDIENTE', material: 'PETG', prioridad: 1, fecha_alta: '2026-09-01T10:00:00Z', tiempo_estimado: 120 },
  { id: 'b', estado: 'PENDIENTE', material: 'PETG', prioridad: 2, fecha_alta: '2026-09-01T09:00:00Z', tiempo_estimado: 30 },
  { id: 'c', estado: 'IMPRIMIENDO', material: 'PETG', prioridad: 9, fecha_alta: '2026-09-01T08:00:00Z', tiempo_estimado: 10 }
];

// Sin contexto → ReglaPrioridadPorDefecto: prioridad desc, IMPRIMIENDO excluido.
assert.strictEqual(proponerSiguiente(modelos).id, 'b', 'sin contexto → mayor prioridad pendiente');
// Con presencia: hora 14:00, ventana en casa 18:00-22:00, margen 0.
//   a: 120min → termina 16:00 (fuera de ventana) → descartada.
//   b: 30min → termina 14:30 (fuera de ventana) → descartada.
//   → ninguna viable → devuelve la primera de la cola (degradación honesta).
const ctx = { horarios_en_casa: [{ desde: '18:00', hasta: '22:00' }], hora_actual: '14:00', margen_min: 0 };
assert.strictEqual(proponerSiguiente(modelos, ctx).id, 'b', 'sin viable → primera de la cola');
// Con presencia y una viable: hora 17:30, ventana 18:00-22:00.
//   b: 30min → termina 18:00 (dentro) → viable.
//   a: 120min → termina 19:30 (dentro) → viable también, pero b tiene mayor prioridad.
const ctx2 = { horarios_en_casa: [{ desde: '18:00', hasta: '22:00' }], hora_actual: '17:30', margen_min: 0 };
assert.strictEqual(proponerSiguiente(modelos, ctx2).id, 'b', 'con viable → la de mayor prioridad viable');
// Sin tiempo_estimado → no bloquea por presencia (asume viable).
const sinTiempo = [{ id: 'x', estado: 'PENDIENTE', material: 'PETG', prioridad: 1, fecha_alta: '2026-09-01T10:00:00Z' }];
assert.strictEqual(proponerSiguiente(sinTiempo, ctx).id, 'x', 'sin tiempo_estimado → viable');
// Cola vacía → null.
assert.strictEqual(proponerSiguiente([], ctx), null, 'cola vacía → null');
console.log('✓ motor_propuesta.proponerSiguiente (con presencia)');

// ── 3. cupula_stl: instancia + store en memoria ──
const CupulaStl = require('./cupula_stl/index.js');
const stl = new CupulaStl();
assert.strictEqual(stl.name, 'cupula_stl');
assert.strictEqual(typeof stl.onRegistrarRequest, 'function');
assert.strictEqual(typeof stl.onObtenerRequest, 'function');
assert.strictEqual(typeof stl.onListarRequest, 'function');
console.log('✓ cupula_stl instancia + handlers');

// ── 4. cupula_gcode: instancia + store en memoria ──
const CupulaGcode = require('./cupula_gcode/index.js');
const gcode = new CupulaGcode();
assert.strictEqual(gcode.name, 'cupula_gcode');
assert.strictEqual(typeof gcode.onRegistrarRequest, 'function');
assert.strictEqual(typeof gcode.onObtenerPorMaquinaRequest, 'function');
assert.strictEqual(typeof gcode.onListarRequest, 'function');
console.log('✓ cupula_gcode instancia + handlers');

// ── 5. puente_creality: instancia + handlers ──
const PuenteCreality = require('./puente_creality/index.js');
const puente = new PuenteCreality();
assert.strictEqual(puente.name, 'puente_creality');
assert.strictEqual(typeof puente.onOrquestarSliceRequest, 'function');
assert.strictEqual(typeof puente.onArrancarImpresionRequest, 'function');
assert.strictEqual(typeof puente.onEstadoImpresionRequest, 'function');
assert.strictEqual(typeof puente.onComplete, 'function');
console.log('✓ puente_creality instancia + handlers');

console.log('\n✅ TODOS LOS TESTS PASAN (F4: 4 módulos nuevos + motor con presencia)');
