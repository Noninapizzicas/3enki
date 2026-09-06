/**
 * cupula-gcode — TEST unitario determinista (sin bus, sin red).
 * Verifica la LOGICA pura: _almacenar · _buscar · _indexar (clave (modelo, material)),
 * con _rpc/eventBus stubeados (patron de la casa: el reflejo se testea por metodos
 * internos). Casos del plan de construccion (Fase 3b, hoja 6.3 CUSTODIO):
 * almacenar gcode por (modelo, material), reutilizar sin reslicear, rechazar gcode
 * vacio/corrupto (invariante 10), buscar con material_por_defecto, y la fuente de
 * verdad: si un modelo no tiene gcode aqui, no se puede imprimir (encontrado:false).
 */

'use strict';
const assert = require('node:assert/strict');
const CupulaGcode = require('../../index.js');

function nuevaInstancia() {
  const m = new CupulaGcode();
  m._rpc = async () => ({ status: 500, data: {} });
  m.eventBus = { publish: () => {} };
  m.metrics = { increment: () => {} };
  return m;
}

const GCODE_OK = 'G28 ; home\nG1 Z5 F3000\nG1 X0 Y0 F3000\nG1 Z0.2 F600\nG92 E0\nG1 E2 F2400\nG1 X10 Y10 E5 F1800\nM104 S210\nM140 S60\nG28\nM84';

let pasados = 0;
function ok(nombre) { pasados++; console.log('  ✓ ' + nombre); }

(async () => {
  const m = nuevaInstancia();

  // ── 1 · ALMACENAR: guarda gcode por (modelo, material) ──
  console.log('T1 · almacenar gcode');
  {
    const r = await m._almacenar({ project_id: 'p1', modelo_id: 'm1', material: 'PLA', gcode: GCODE_OK });
    assert.equal(r.status, 200);
    assert.equal(r.data.reutilizable, true);
    assert.equal(r.data.clave, 'm1::PLA');
    ok('almacena gcode por (m1, PLA) · clave m1::PLA · reutilizable');
  }

  // ── 2 · BUSCAR: encuentra el gcode del mismo (modelo, material) sin reslicear ──
  console.log('T2 · buscar gcode existente');
  {
    const r = await m._buscar({ project_id: 'p1', modelo_id: 'm1', material: 'PLA' });
    assert.equal(r.status, 200);
    assert.equal(r.data.encontrado, true);
    assert.equal(r.data.gcode.contenido, GCODE_OK);
    assert.equal(r.data.gcode.material, 'PLA');
    ok('busca (m1, PLA) → encontrado · mismo gcode (reutilizado, sin reslicear)');
  }

  // ── 3 · BUSCAR con material_por_defecto: indexa por defecto si no hay material ──
  console.log('T3 · buscar con material_por_defecto');
  {
    const r = await m._almacenar({ project_id: 'p1', modelo_id: 'm2', gcode: GCODE_OK });
    assert.equal(r.status, 200);
    assert.equal(r.data.clave, 'm2::material_por_defecto');
    const b = await m._buscar({ project_id: 'p1', modelo_id: 'm2' });
    assert.equal(b.data.encontrado, true);
    assert.equal(b.data.gcode.material, 'material_por_defecto');
    ok('almacena sin material → clave m2::material_por_defecto · buscar sin material lo encuentra');
  }

  // ── 4 · BUSCAR modelo sin gcode: fuente de verdad → no se puede imprimir ──
  console.log('T4 · buscar modelo sin gcode');
  {
    const r = await m._buscar({ project_id: 'p1', modelo_id: 'm-no-sliceado', material: 'PLA' });
    assert.equal(r.status, 200);
    assert.equal(r.data.encontrado, false);
    assert.equal(r.data.gcode, null);
    ok('modelo sin gcode → encontrado:false (no se puede imprimir)');
  }

  // ── 5 · ALMACENAR gcode vacio → rechazado + cupula.almacenar.failed ──
  console.log('T5 · almacenar gcode vacio');
  {
    const emitidos = [];
    m.eventBus = { publish: (ev, data) => emitidos.push(ev) };
    const r = await m._almacenar({ project_id: 'p1', modelo_id: 'm3', material: 'PLA', gcode: '   ' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'INVALID_INPUT');
    assert.ok(emitidos.includes('cupula.almacenar.failed'), 'par de fallo emitido');
    ok('gcode vacio → 400 INVALID_INPUT · emite cupula.almacenar.failed');
  }

  // ── 6 · ALMACENAR gcode corrupto (muy corto) → rechazado + failed ──
  console.log('T6 · almacenar gcode corrupto');
  {
    const emitidos = [];
    m.eventBus = { publish: (ev, data) => emitidos.push(ev) };
    const r = await m._almacenar({ project_id: 'p1', modelo_id: 'm4', material: 'PLA', gcode: 'G28' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'INVALID_INPUT');
    assert.ok(emitidos.includes('cupula.almacenar.failed'), 'par de fallo emitido');
    // el gcode corrupto NO se guarda
    const b = await m._buscar({ project_id: 'p1', modelo_id: 'm4', material: 'PLA' });
    assert.equal(b.data.encontrado, false);
    ok('gcode corrupto → 400 · emite failed · NO se guarda (invariante 10)');
  }

  // ── 7 · ALMACENAR sin modelo_id → INVALID_INPUT ──
  console.log('T7 · almacenar sin modelo_id');
  {
    const r = await m._almacenar({ project_id: 'p1', gcode: GCODE_OK });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'INVALID_INPUT');
    ok('almacenar sin modelo_id → 400 INVALID_INPUT');
  }

  // ── 8 · UPSERT: re-almacenar el mismo (modelo, material) actualiza sin duplicar ──
  console.log('T8 · upsert por (modelo, material)');
  {
    const r1 = await m._almacenar({ project_id: 'p1', modelo_id: 'm5', material: 'PETG', gcode: GCODE_OK });
    const r2 = await m._almacenar({ project_id: 'p1', modelo_id: 'm5', material: 'PETG', gcode: GCODE_OK + '\n; v2' });
    assert.equal(r2.status, 200);
    assert.equal(r2.data.clave, 'm5::PETG');
    const b = await m._buscar({ project_id: 'p1', modelo_id: 'm5', material: 'PETG' });
    assert.equal(b.data.encontrado, true);
    assert.ok(b.data.gcode.contenido.includes('; v2'), 'contenido actualizado');
    ok('upsert (m5, PETG) → misma clave · contenido actualizado sin duplicar');
  }

  console.log(`\nRESULTADO: ${pasados}/8 bloques OK`);
  process.exit(pasados === 8 ? 0 : 1);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
