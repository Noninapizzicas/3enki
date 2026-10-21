/**
 * Test unitario — disenador_parametrico (PASO 4 del plan-construccion).
 * Verifica: construcción de scad paramétrico, estimación de tiempo, validación de
 * formato, y el flujo generar_stl con un _mcpCall inyectado (sin red real).
 */

'use strict';

const assert = require('assert');
const DisenadorParametricoReflejo = require('../../modules/disenador_parametrico/index.js');
const { construirScad, estimarMinutos } = DisenadorParametricoReflejo;

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed++;
  console.log(`  ✓ ${msg}`);
}

async function main() {
  console.log('disenador_parametrico.test — PASO 4');

  // ── construirScad: caja paramétrica ──
  const scad = construirScad({ forma: 'caja', dimensiones: { ancho: 40, alto: 20, profundo: 30, pared: 2 } });
  ok(scad.includes('ancho = 40'), 'caja: ancho en el código');
  ok(scad.includes('cube([ancho, alto, profundo])'), 'caja: cubo exterior paramétrico');
  ok(scad.includes('difference()'), 'caja: usa difference (hueco)');
  ok(scad.includes('pared = 2'), 'caja: pared paramétrica');

  const cil = construirScad({ forma: 'cilindro', dimensiones: { radio: 10, alto: 15 } });
  ok(cil.includes('cylinder(h=alto, r=radio'), 'cilindro: cylinder paramétrico');

  // ── estimarMinutos: heurística determinista ──
  const m1 = estimarMinutos({ dimensiones: { ancho: 40, alto: 20, profundo: 30 } });
  ok(Number.isInteger(m1) && m1 >= 1, `estimarMinutos: entero >=1 (${m1})`);
  const m2 = estimarMinutos({ dimensiones: { ancho: 80, alto: 40, profundo: 60 } });
  ok(m2 > m1, 'estimarMinutos: pieza mayor → más minutos');

  // ── instancia con _mcpCall inyectado ──
  const mod = new DisenadorParametricoReflejo();
  mod.logger = { info() {}, error() {} };
  mod.metrics = { increment() {} };
  mod.eventBus = { publish() {}, subscribe() { return () => {}; } };

  // generar_stl: éxito (mcp devuelve structuredContent success)
  mod._mcpCall = async (tool, args) => {
    ok(tool === 'export_model', 'generar_stl: llama export_model');
    ok(args.output_format === 'stl', 'generar_stl: formato stl');
    ok(args.scad_content && args.scad_content.includes('cube'), 'generar_stl: scad_content presente');
    return { isError: false, texto: 'ok', structuredContent: { success: true, output_path: '/tmp/x.stl', format: 'stl', file_size_bytes: 1503 } };
  };
  const okRes = await mod._generarStl({ project_id: 'p1', parametros: { forma: 'caja', dimensiones: { ancho: 40, alto: 20, profundo: 30 }, formato: 'stl' } });
  ok(okRes.status === 200, 'generar_stl: status 200');
  ok(okRes.data.archivo === '/tmp/x.stl', 'generar_stl: devuelve archivo');
  ok(okRes.data.bytes === 1503, 'generar_stl: devuelve bytes');

  // generar_stl: formato inválido → 422 con hint
  const badFmt = await mod._generarStl({ project_id: 'p1', parametros: { forma: 'caja', formato: 'gcode' } });
  ok(badFmt.status === 422, 'generar_stl: formato inválido → 422');
  ok(badFmt.error && badFmt.error.details && badFmt.error.details.hint, 'generar_stl: 422 con hint (freno fértil)');

  // generar_stl: sin project_id → 400
  const noPid = await mod._generarStl({ parametros: { forma: 'caja' } });
  ok(noPid.status === 400, 'generar_stl: sin project_id → 400');

  // generar_stl: servidor caído → 503 degradación honesta
  mod._mcpCall = async () => { throw new Error('no session'); };
  const down = await mod._generarStl({ project_id: 'p1', parametros: { forma: 'caja', dimensiones: { ancho: 10, alto: 10, profundo: 10 } } });
  ok(down.status === 503, 'generar_stl: servidor caído → 503');
  ok(down.error && down.error.code === 'UPSTREAM_UNREACHABLE', 'generar_stl: 503 UPSTREAM_UNREACHABLE');

  // estimar_tiempo: sin project_id → 400
  const noPidT = await mod._estimarTiempo({ parametros: { dimensiones: { ancho: 10, alto: 10, profundo: 10 } } });
  ok(noPidT.status === 400, 'estimar_tiempo: sin project_id → 400');

  // estimar_tiempo: ok
  const t = await mod._estimarTiempo({ project_id: 'p1', parametros: { dimensiones: { ancho: 40, alto: 20, profundo: 30 } } });
  ok(t.status === 200 && t.data.minutos >= 1, 'estimar_tiempo: status 200 con minutos');

  console.log(`\nPASO 4 — ${passed} invariantes OK`);
}

main().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
