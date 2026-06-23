'use strict';

/**
 * NERVIO skill.aplicada cerrado INTERNAMENTE (sesión "el cerebro" / lazo Hebbiano).
 *
 * La auto-mejora (paso 3) estaba cableada pero MUERTA DE HAMBRE: traza.skills solo se
 * poblaba con un evento skill.aplicada que NADIE emitía. El fix: el destilador se AUTO-ETIQUETA
 * por coincidencia de FIRMA — si una traza tiene la firma de una skill APROBADA, cuenta como
 * aplicada, y su desenlace (ok/fail, ya detectado) alimenta la ventana. El cerebro siente sus skills.
 *
 * Prueba _evaluarSkills (self-tag + ventana + revisión). Sin bus, sin fs.
 * Ejecutar: node tests/unit/destilador__skill-selftag.test.js
 */

const assert = require('assert');

const Mod = require('../../modules/destilador');
const Destilador = Mod.default || Mod;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo(over = {}) {
  const d = new Destilador();
  d.logger = { info() {}, warn() {} };
  d.metrics = { increment() {} };
  d.revisiones = [];
  d.eventBus = { publish: (ev, payload) => { if (ev === 'aprendizaje.revision.requerida') d.revisiones.push(payload); } };
  d.cola = new Map();
  d.skillStats = new Map();
  d.dirty = new Set();
  d.ventanaDesenlaces = 10;
  d.umbralTasa = 0.5;
  d.minMuestras = 3;
  d._persistirSalud = () => {};   // evita el fs reflejo en el test
  Object.assign(d, over);
  return d;
}

const PASOS = ['recetas.obtener', 'escandallo.costear', 'carta.add_product'];

test('skill APROBADA con firma coincidente -> la traza la cuenta como aplicada (desenlace en la ventana)', () => {
  const d = nuevo();
  const firma = d._firmar(PASOS);
  d.cola.set('c1', { candidata_id: 'c1', firma, nombre_skill: 'costear-receta', estado: 'aprobada' });
  d._evaluarSkills({ project_id: 'p', pasos: PASOS, fallo: false, skills: null }, 'corr:a', firma);
  const st = d.skillStats.get('p::costear-receta');
  assert.ok(st, 'la skill aprobada debió registrarse');
  assert.deepStrictEqual(st.ventana, ['ok']);
});

test('candidata NO aprobada (pendiente) -> NO se auto-etiqueta', () => {
  const d = nuevo();
  const firma = d._firmar(PASOS);
  d.cola.set('c1', { candidata_id: 'c1', firma, nombre_skill: 'x', estado: 'pendiente' });
  d._evaluarSkills({ project_id: 'p', pasos: PASOS, fallo: true, skills: null }, 'corr:a', firma);
  assert.strictEqual(d.skillStats.size, 0);
});

test('firma distinta -> no toca skills ajenas', () => {
  const d = nuevo();
  d.cola.set('c1', { candidata_id: 'c1', firma: 'otra-firma', nombre_skill: 'x', estado: 'aprobada' });
  d._evaluarSkills({ project_id: 'p', pasos: PASOS, fallo: true, skills: null }, 'corr:a', d._firmar(PASOS));
  assert.strictEqual(d.skillStats.size, 0);
});

test('fallo recurrente (>= umbral) -> emite revision.requerida UNA vez (guard revision_emitida)', () => {
  const d = nuevo();
  const firma = d._firmar(PASOS);
  d.cola.set('c1', { candidata_id: 'c1', firma, nombre_skill: 'costear-receta', estado: 'aprobada' });
  for (let i = 0; i < 4; i++) {
    d._evaluarSkills({ project_id: 'p', pasos: PASOS, fallo: true, skills: null }, `corr:${i}`, firma);
  }
  const st = d.skillStats.get('p::costear-receta');
  assert.strictEqual(st.revision_emitida, true);
  assert.strictEqual(d.revisiones.length, 1, 'solo una revisión pese a varios fallos');
  assert.ok(d.revisiones[0].tasa_fallo >= 0.5);
});

test('histeresis: tras recuperarse (tasa < umbral) la revision se des-arma', () => {
  const d = nuevo();
  const firma = d._firmar(PASOS);
  d.cola.set('c1', { candidata_id: 'c1', firma, nombre_skill: 'costear-receta', estado: 'aprobada' });
  for (let i = 0; i < 3; i++) d._evaluarSkills({ project_id: 'p', pasos: PASOS, fallo: true, skills: null }, `f${i}`, firma);
  assert.strictEqual(d.skillStats.get('p::costear-receta').revision_emitida, true);
  for (let i = 0; i < 6; i++) d._evaluarSkills({ project_id: 'p', pasos: PASOS, fallo: false, skills: null }, `o${i}`, firma);
  assert.strictEqual(d.skillStats.get('p::costear-receta').revision_emitida, false);  // se recuperó
});

// ── runner ──
let passed = 0, failed = 0; const fails = [];
for (const { name, fn } of tests) {
  try { fn(); passed++; } catch (err) { failed++; fails.push({ name, err }); }
}
if (failed === 0) { console.log(`\n[destilador__skill-selftag] OK ${passed}/${tests.length}`); process.exit(0); }
console.error(`\n[destilador__skill-selftag] FAIL ${failed}/${tests.length}`);
for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
process.exit(1);
