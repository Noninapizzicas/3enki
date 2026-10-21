'use strict';
// Test unitario del reflejo motor_propuesta (PASO 2) — invariantes del motor puro.
// Se conduce la función pura exportada directamente (cálculo determinista, sin
// bus, sin store, sin efectos): cola vacía→Ausente, empate→fecha_alta,
// imprimiendo excluido, y "no muta" (cero efectos sobre la lista de entrada).

const assert = require('assert');
const { proponerSiguiente } = require('../../modules/motor_propuesta/index.js');

const PENDIENTE = 'PENDIENTE';
const IMPRIMIENDO = 'IMPRIMIENDO';
const mk = (id, nombre, prioridad, estado = PENDIENTE, fecha_alta = '2026-09-01T00:00:00.000Z') =>
  ({ id, nombre, prioridad, estado, fecha_alta });

let fails = 0;
async function check(nombre, fn) {
  try { await fn(); console.log('  [OK]', nombre); }
  catch (e) { fails++; console.log('  [FALLA]', nombre, '—', e.message); }
}

async function main() {
  console.log('motor_propuesta — invariantes del motor puro');

  await check('cola vacía → Ausente (null)', () => {
    assert.strictEqual(proponerSiguiente([]), null);
  });

  await check('sin candidatos (todo IMPRIMIENDO/IMPRESO) → Ausente', () => {
    const lista = [
      mk('a', 'A', 9, IMPRIMIENDO),
      mk('b', 'B', 1, 'IMPRESO')
    ];
    assert.strictEqual(proponerSiguiente(lista), null);
  });

  await check('mayor prioridad primero', () => {
    const lista = [
      mk('a', 'A', 3),
      mk('b', 'B', 7),
      mk('c', 'C', 1)
    ];
    const p = proponerSiguiente(lista);
    assert.strictEqual(p.id, 'b');
  });

  await check('empate de prioridad → gana el más antiguo (fecha_alta asc)', () => {
    const lista = [
      mk('a', 'A', 5, PENDIENTE, '2026-09-03T00:00:00.000Z'),
      mk('b', 'B', 5, PENDIENTE, '2026-09-01T00:00:00.000Z'),
      mk('c', 'C', 5, PENDIENTE, '2026-09-02T00:00:00.000Z')
    ];
    const p = proponerSiguiente(lista);
    assert.strictEqual(p.id, 'b');   // el más antiguo
  });

  await check('IMPRIMIENDO nunca se propone aunque tenga prioridad máxima', () => {
    const lista = [
      mk('x', 'X', 99, IMPRIMIENDO),
      mk('y', 'Y', 2),
      mk('z', 'Z', 3)
    ];
    const p = proponerSiguiente(lista);
    assert.notStrictEqual(p.id, 'x');
    assert.strictEqual(p.estado, PENDIENTE);
  });

  await check('no muta la lista de entrada (cero efectos)', () => {
    const lista = [
      mk('a', 'A', 3),
      mk('b', 'B', 7),
      mk('c', 'C', 1)
    ];
    const antes = JSON.stringify(lista);
    proponerSiguiente(lista);
    assert.strictEqual(JSON.stringify(lista), antes);           // mismo contenido y orden
    assert.strictEqual(lista.length, 3);                         // nada añadido/quitado
  });

  await check('no muta los objetos candidatos', () => {
    const lista = [mk('a', 'A', 3, PENDIENTE, '2026-09-01T00:00:00.000Z')];
    const antes = JSON.stringify(lista[0]);
    proponerSiguiente(lista);
    assert.strictEqual(JSON.stringify(lista[0]), antes);
  });

  console.log(fails === 0 ? '\nTEST OK — todas las invariantes pasan.' : `\nTEST FALLA — ${fails} chequeo(s) fallido(s).`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('ERROR en test:', e); process.exit(1); });
