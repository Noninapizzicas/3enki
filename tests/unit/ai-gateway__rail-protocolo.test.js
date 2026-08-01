'use strict';

/**
 * ai-gateway · nervio RAIL-PROTOCOLO — el paso actual con FORMA EJECUTABLE.
 *
 * Cuando el paso actual del rail declara {tool, input, verifica}, el nervio inyecta
 * el PROTOCOLO: qué tool usar, con qué input, y qué respuesta confirma que está
 * hecho. El LLM deja de adivinar el cómo (causa de atascos) y pasa a ejecutar.
 *
 * Ejecutar: node tests/unit/ai-gateway__rail-protocolo.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/conversacion/ai-gateway/index.js');

const tests = [];
const test = (n, f) => tests.push({ n, f });

function gw() {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.config = {};
  return m;
}

test('paso actual SIN forma → sin bloque PROTOCOLO (retrocompatible)', () => {
  const m = gw();
  const s = m._composeRailSection({ id: 'l1', nombre: 'R', orden: 'estricto', actual: 0, pasos: [{ id: 'p0', texto: 'hacer algo', estado: 'pendiente' }] });
  assert.ok(/Paso ACTUAL: 1\. hacer algo/.test(s), 'sigue mostrando el paso actual');
  assert.ok(!/PROTOCOLO del paso actual/.test(s), 'sin forma no hay protocolo');
});

test('paso actual CON forma → inyecta tool + input + verifica + regla de no marcar antes', () => {
  const m = gw();
  const s = m._composeRailSection({
    id: 'l1', nombre: 'Publicar', orden: 'estricto', actual: 0,
    pasos: [{ id: 'p0', texto: 'Construir dashboard', estado: 'pendiente',
      forma: { tool: 'fs.write', input: { path: '/www/pos/dashboard.html' }, verifica: 'status 200 y el archivo existe' } }]
  });
  assert.ok(/PROTOCOLO del paso actual — EJECUTA ASÍ:/.test(s), 'cabecera del protocolo');
  assert.ok(/tool: fs\.write/.test(s), 'nombra la tool');
  assert.ok(/"\/www\/pos\/dashboard\.html"/.test(s), 'nombra el input');
  assert.ok(/verifica \(hecho si\): status 200/.test(s), 'nombra la verificación');
  assert.ok(/NO lo marques antes/.test(s), 'prohíbe marcar sin verificar');
});

test('forma SIN input (solo tool+verifica) → línea de input omitida', () => {
  const m = gw();
  const s = m._composeRailSection({
    id: 'l1', nombre: 'Cobrar', orden: 'libre',
    pasos: [{ id: 'p0', texto: 'Cobrar carrito', estado: 'pendiente', forma: { tool: 'cobro.crear', verifica: 'status 200' } }]
  });
  assert.ok(/tool: cobro\.crear/.test(s));
  assert.ok(!/input:/.test(s), 'sin input no hay línea input');
  assert.ok(/verifica \(hecho si\): status 200/.test(s));
});

test('orden libre: el paso actual es el PRIMER pendiente', () => {
  const m = gw();
  const s = m._composeRailSection({
    id: 'l1', nombre: 'Varias', orden: 'libre',
    pasos: [
      { id: 'p0', texto: 'hecho ya', estado: 'hecho' },
      { id: 'p1', texto: 'siguiente', estado: 'pendiente', forma: { tool: 'fs.edit', verifica: 'status 200' } }
    ]
  });
  assert.ok(/tool: fs\.edit/.test(s), 'el protocolo apunta al primer pendiente (no al hecho)');
});

test('lista SIN OBJETIVO con pendientes → aviso fijar_objetivo en el nervio', () => {
  const m = gw();
  const s = m._composeRailSection({
    id: 'l1', nombre: 'Rumbo', orden: 'libre',
    pasos: [
      { id: 'p0', texto: 'hecho', estado: 'hecho' },
      { id: 'p1', texto: 'pendiente', estado: 'pendiente' }
    ]
    // sin objetivo
  });
  assert.ok(/NO TIENE OBJETIVO/.test(s), 'avisa que falta el objetivo');
  assert.ok(/fijar_objetivo/.test(s), 'apunta a la tool fijar_objetivo');
  assert.ok(/juez no puede evaluarla/.test(s), 'explica la consecuencia');
});

test('lista CON objetivo y pendientes → SIN aviso de objetivo', () => {
  const m = gw();
  const s = m._composeRailSection({
    id: 'l1', nombre: 'Con obj', orden: 'libre', objetivo: 'terminar todo',
    pasos: [{ id: 'p0', texto: 'pendiente', estado: 'pendiente' }]
  });
  assert.ok(!/NO TIENE OBJETIVO/.test(s), 'con objetivo no hay aviso');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { n, f } of tests) {
    try { await f(); passed++; }
    catch (err) { fails.push({ n, err }); }
  }
  if (fails.length === 0) { console.log(`\n[ai-gateway__rail-protocolo] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-gateway__rail-protocolo] FAIL ${fails.length}/${tests.length}`);
  for (const { n, err } of fails) console.error(`  x ${n}\n    ${err.message}`);
  process.exit(1);
})();
