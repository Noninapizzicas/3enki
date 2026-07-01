/**
 * Tests de prisma/enforcement — el EFECTOR del BOSS. Consume boss.plan.actualizado
 * y enciende los interruptores de los órganos. Additivo-seguro (no apaga solo).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaEnforcementReflejo = require('../../modules/prisma/enforcement/index.js');
const { diffPlan, interruptorDe, ORGANOS_SEMILLA } = require('../../modules/_shared/organos-recetario.js');

// bus falso: captura lo publicado.
function fakeBus() {
  const pub = [];
  return { pub, publish: (ev, data) => pub.push({ ev, data }) };
}
function conBus(E) { E.eventBus = fakeBus(); return E.eventBus.pub; }

test('diffPlan — encender = deseados-aplicados; innecesarios = aplicados-deseados', () => {
  const d = diffPlan(['carta', 'cocina'], ['carta']);
  assert.deepEqual(d.encender, ['cocina']);
  assert.deepEqual(d.innecesarios, []);
  const d2 = diffPlan(['carta'], ['carta', 'cocina']);
  assert.deepEqual(d2.encender, []);
  assert.deepEqual(d2.innecesarios, ['cocina']);
});

test('la semilla de órganos cubre carta y cocina (del arquetipo comestible)', () => {
  assert.ok(ORGANOS_SEMILLA.includes('carta'));
  assert.ok(ORGANOS_SEMILLA.includes('cocina'));
});

test('_aplicar enciende el interruptor de cada órgano necesario + testigo', () => {
  const E = new PrismaEnforcementReflejo();
  const pub = conBus(E);
  const r = E._aplicar('p1', ['carta', 'cocina']);
  assert.deepEqual(r.encendidos, ['carta', 'cocina']);
  const sets = pub.filter(x => x.ev === 'interruptor.set' && x.data.enabled === true).map(x => x.data.id);
  assert.ok(sets.includes(interruptorDe('carta')));
  assert.ok(sets.includes(interruptorDe('cocina')));
  assert.ok(pub.some(x => x.ev === 'boss.organo.encendido' && x.data.organo === 'cocina'));
  assert.ok(pub.every(x => x.data.motivo === undefined || x.data.motivo === 'boss:p1'));
});

test('re-aplicar el mismo plan NO vuelve a encender (edge-triggered)', () => {
  const E = new PrismaEnforcementReflejo();
  conBus(E);
  E._aplicar('p1', ['carta']);
  const pub2 = conBus(E);       // reinicia el captador
  const r = E._aplicar('p1', ['carta']);
  assert.deepEqual(r.encendidos, []);
  assert.equal(pub2.filter(x => x.ev === 'interruptor.set').length, 0);
});

test('un órgano que sobra NO se apaga: solo testigo boss.organo.innecesario', () => {
  const E = new PrismaEnforcementReflejo();
  conBus(E);
  E._aplicar('p1', ['carta', 'cocina']);
  const pub2 = conBus(E);
  const r = E._aplicar('p1', ['carta']);        // cocina ya no hace falta
  assert.deepEqual(r.innecesarios, ['cocina']);
  // ni un solo interruptor.set enabled:false
  assert.equal(pub2.filter(x => x.ev === 'interruptor.set' && x.data.enabled === false).length, 0);
  assert.ok(pub2.some(x => x.ev === 'boss.organo.innecesario' && x.data.organo === 'cocina'));
});

test('órgano de arquetipo custom (desconocido) se acoge: se registra su interruptor al vuelo', () => {
  const E = new PrismaEnforcementReflejo();
  const pub = conBus(E);
  E._aplicar('p1', ['taller']);   // órgano no-semilla
  assert.ok(pub.some(x => x.ev === 'interruptor.registrar' && x.data.id === interruptorDe('taller')));
  assert.ok(pub.some(x => x.ev === 'interruptor.set' && x.data.id === interruptorDe('taller') && x.data.enabled === true));
});

test('estado por proyecto refleja lo aplicado', () => {
  const E = new PrismaEnforcementReflejo();
  conBus(E);
  E._aplicar('p1', ['carta']);
  E._aplicar('p2', ['agenda']);
  assert.deepEqual(E._estado({ project_id: 'p1' }).data.aplicados, ['carta']);
  assert.deepEqual(E._estado({ project_id: 'p2' }).data.aplicados, ['agenda']);
  assert.equal(E._estado({}).status, 400);
});

console.log('prisma__enforcement: asserts definidos');
