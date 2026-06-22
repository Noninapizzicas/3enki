/**
 * Tests unitarios — LibroDeCapacidades (OFRECE vs USA -> brecha priorizada).
 *
 * El corazón del Conserje: la abstracción que abre el camino al comerciante.
 *
 * Ejecutar: node tests/unit/libro-capacidades.test.js
 */
'use strict';

const assert = require('assert');
const {
  LibroDeCapacidades, PIZZEPOS_CAPACIDADES
} = require('../../modules/_shared/libro-capacidades');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('una capacidad ya USADA queda fuera de la brecha', () => {
  const libro = new LibroDeCapacidades([
    { id: 'a', ofrece: 'A', valor: 5, entrada: 'a.start' }
  ]);
  const br = libro.brecha({ usadas: ['a'] });
  assert.strictEqual(br.length, 0);
});

test('descubrimiento: capacidad ofrecida nunca tocada aparece en la brecha', () => {
  const libro = new LibroDeCapacidades([
    { id: 'a', ofrece: 'A', valor: 5, entrada: 'a.start' }
  ]);
  const br = libro.brecha({ usadas: [], intentadas: [] });
  assert.strictEqual(br.length, 1);
  assert.strictEqual(br[0].tipo, 'descubrimiento');
  assert.strictEqual(br[0].listo, true);
  assert.ok(br[0].prioridad > 0);
});

test('desbloqueo (intención) pesa MÁS que descubrimiento al mismo valor', () => {
  const libro = new LibroDeCapacidades([
    { id: 'tocada',   ofrece: 'T', valor: 5, entrada: 't.start' },
    { id: 'ignorada', ofrece: 'I', valor: 5, entrada: 'i.start' }
  ]);
  const br = libro.brecha({ usadas: [], intentadas: ['tocada'] });
  assert.strictEqual(br[0].id, 'tocada', 'la intentada va primero');
  assert.strictEqual(br[0].tipo, 'desbloqueo');
  assert.ok(br[0].prioridad > br[1].prioridad);
});

test('una capacidad BLOQUEADA (requiere no cumplido) no se empuja (prioridad 0)', () => {
  const libro = new LibroDeCapacidades([
    { id: 'base',     ofrece: 'Base', valor: 8, entrada: 'base.start' },
    { id: 'derivada', ofrece: 'Der',  valor: 9, requiere: ['base'], entrada: 'der.start' }
  ]);
  const br = libro.brecha({ usadas: [], intentadas: [] });
  const derivada = br.find(i => i.id === 'derivada');
  assert.strictEqual(derivada.listo, false);
  assert.strictEqual(derivada.prioridad, 0);
  assert.deepStrictEqual(derivada.bloqueada_por, ['base']);
  // la base (lista) debe ir antes que la derivada (bloqueada), pese a menor valor
  assert.strictEqual(br[0].id, 'base');
});

test('requiere ordena la apertura: al cumplir la base, la derivada se desbloquea', () => {
  const libro = new LibroDeCapacidades([
    { id: 'base',     ofrece: 'Base', valor: 5, entrada: 'base.start' },
    { id: 'derivada', ofrece: 'Der',  valor: 9, requiere: ['base'], entrada: 'der.start' }
  ]);
  const br = libro.brecha({ usadas: ['base'] }); // base ya usada
  assert.strictEqual(br.length, 1);
  assert.strictEqual(br[0].id, 'derivada');
  assert.strictEqual(br[0].listo, true);
  assert.ok(br[0].prioridad > 0);
});

test('siguienteEmpujon devuelve el top listo, o null si nada accionable', () => {
  const libro = new LibroDeCapacidades([
    { id: 'base',     ofrece: 'Base', valor: 5, entrada: 'base.start' },
    { id: 'derivada', ofrece: 'Der',  valor: 9, requiere: ['base'], entrada: 'der.start' }
  ]);
  // solo la base es accionable (la derivada está bloqueada)
  assert.strictEqual(libro.siguienteEmpujon({ usadas: [] }).id, 'base');
  // todo usado -> nada que empujar
  assert.strictEqual(libro.siguienteEmpujon({ usadas: ['base', 'derivada'] }), null);
});

// ── El caso REAL de Nonina (lo que destapamos en vivo) ──
test('Nonina: marca intentada pero vacía = empujón de desbloqueo TOP', () => {
  const libro = new LibroDeCapacidades(PIZZEPOS_CAPACIDADES);
  // El comerciante entra a su marca (la toca) pero está sin rellenar (no usada).
  // Nada más montado todavía.
  const empujon = libro.siguienteEmpujon({ usadas: [], intentadas: ['marca'] });
  assert.strictEqual(empujon.id, 'marca');
  assert.strictEqual(empujon.tipo, 'desbloqueo');
  assert.strictEqual(empujon.entrada, 'carta-marketing.completar_onboarding');
  assert.ok(/marca/i.test(empujon.ofrece));
});

test('Nonina: con marca y recetas ya hechas, el siguiente paso natural es la carta', () => {
  const libro = new LibroDeCapacidades(PIZZEPOS_CAPACIDADES);
  const empujon = libro.siguienteEmpujon({ usadas: ['marca', 'recetas'] });
  // carta (valor 9, requiere recetas ✓) gana a escandallo (7) y a las bloqueadas
  assert.strictEqual(empujon.id, 'carta');
  assert.strictEqual(empujon.listo, true);
});

test('Nonina: diseño y digital quedan BLOQUEADOS hasta tener carta', () => {
  const libro = new LibroDeCapacidades(PIZZEPOS_CAPACIDADES);
  const br = libro.brecha({ usadas: ['marca', 'recetas'] });
  const diseno = br.find(i => i.id === 'diseno');
  const digital = br.find(i => i.id === 'digital');
  assert.strictEqual(diseno.listo, false, 'diseño requiere carta');
  assert.strictEqual(digital.listo, false, 'digital requiere carta');
  assert.ok(diseno.bloqueada_por.includes('carta'));
});

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`  ✅ ${name}`); passed++; }
    catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); failed++; }
  }
  console.log(`\n  libro-capacidades: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
