/**
 * Tests unitarios — confluencia-h3 (Portal de llamada · S1 criterio + S2 porta-aviso).
 *
 * Ejecutar: node tests/unit/confluencia-h3.test.js
 */
'use strict';

const assert = require('assert');

const ConfluenciaH3 = require('../../modules/confluencia-h3');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Harness mínimo: _rpc devuelve null (sin config → defaults de regla).
function makeModulo() {
  const m = new ConfluenciaH3();
  m.logger = { debug() {}, info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish() {}, subscribe() { return () => {}; } };
  m._rpc = async () => null;
  return m;
}

// ---------------------------------------------------------------------------
// S1 · Criterio de escalada
// ---------------------------------------------------------------------------
test('S1: no_disponible → aviso al cliente, prioridad alta', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({ resultado: { tipo: 'no_disponible' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, true);
  assert.strictEqual(r.data.categoria, 'cliente');
  assert.strictEqual(r.data.prioridad, 'alta');
});

test('S1: ajustado cercano (mismo día) → self, sin aviso', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({
    resultado: { tipo: 'ajustado', fecha_solicitada: '2026-08-22', propuesta: '2026-08-22' }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, false);
  assert.strictEqual(r.data.motivo, 'ajustado_cercano');
});

test('S1: ajustado lejano (5 días ≥ umbral 2) → cliente, prioridad media', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({
    resultado: { tipo: 'ajustado', fecha_solicitada: '2026-08-22', propuesta: '2026-08-27' }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, true);
  assert.strictEqual(r.data.categoria, 'cliente');
  assert.strictEqual(r.data.prioridad, 'media');
  assert.strictEqual(r.data.dias, 5);
});

test('S1: movimiento 5u (≥ umbral 3) → aviso al dueño, prioridad media', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({
    resultado: { tipo: 'confirmado', movimiento: { unidades: 5 } }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, true);
  assert.strictEqual(r.data.categoria, 'dueno');
  assert.strictEqual(r.data.prioridad, 'media');
});

test('S1: movimiento 2u (bajo umbral 3) → self, sin aviso', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({
    resultado: { tipo: 'confirmado', movimiento: { unidades: 2 } }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, false);
  assert.strictEqual(r.data.motivo, 'self');
});

test('S1: sin resultado → INVALID_INPUT 400', async () => {
  const m = makeModulo();
  const r = await m._criterioEscalada({});
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------
// S2 · Porta-aviso
// ---------------------------------------------------------------------------
test('S2: empaqueta contexto accionable (cliente + producto + día propuesto)', async () => {
  const m = makeModulo();
  const r = await m._portaAviso({
    resultado: { tipo: 'ajustado', producto_id: 'barra_pan', cantidad: 3, fecha_solicitada: '2026-08-22', propuesta: '2026-08-27' },
    cliente: { nombre: 'Ana', telefono: '+34600000000' }
  });
  assert.strictEqual(r.status, 200);
  const a = r.data.aviso;
  assert.ok(a);
  assert.strictEqual(a.categoria, 'cliente');
  assert.strictEqual(a.motivo, 'ajustado_lejano');
  assert.strictEqual(a.cliente.nombre, 'Ana');
  assert.strictEqual(a.pedido.producto, 'barra_pan');
  assert.strictEqual(a.pedido.dia_propuesto, '2026-08-27');
  assert.strictEqual(a.decision_pendiente, false);
});

test('S2: sin escalada → aviso null', async () => {
  const m = makeModulo();
  const r = await m._portaAviso({ resultado: { tipo: 'confirmado' }, cliente: { nombre: 'Ana' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aviso, null);
  assert.strictEqual(r.data.motivo, 'sin_escalada');
});

test('S2: sin cliente → INVALID_INPUT 400', async () => {
  const m = makeModulo();
  const r = await m._portaAviso({ resultado: { tipo: 'no_disponible' } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------
// S3 · Entrega a UI + chat
// ---------------------------------------------------------------------------
test('S3: porta_aviso con escalada emite aviso_emitido al bus', async () => {
  const m = makeModulo();
  const emitido = [];
  m.eventBus.publish = (ev, p) => { if (ev === 'confluencia.h3.aviso_emitido') emitido.push(p); };
  const r = await m._portaAviso({
    resultado: { tipo: 'ajustado', producto_id: 'barra_pan', cantidad: 3, fecha_solicitada: '2026-08-22', propuesta: '2026-08-27' },
    cliente: { nombre: 'Ana', telefono: '+346****0000' }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(emitido.length, 1);
  assert.strictEqual(emitido[0].aviso.categoria, 'cliente');
  assert.ok(emitido[0].correlation_id);
});

test('S3: _entregarAviso publica a UI (aviso_entregado) y al chat (chat.message.saved)', async () => {
  const m = makeModulo();
  const publicado = [];
  m.eventBus.publish = (ev, p) => publicado.push({ ev, p });
  const aviso = {
    categoria: 'dueno', prioridad: 'media', motivo: 'movimiento_dueno',
    cliente: { nombre: 'Ana' },
    pedido: { producto: 'barra_pan', cantidad: 5, dia_solicitado: '2026-08-22', dia_propuesto: null },
    unidades_movidas: 5, correlation_id: 'c-9'
  };
  const r = await m._entregarAviso({ aviso, project_id: 'despacho-de-pan', correlation_id: 'c-9' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.entregado, true);
  assert.deepStrictEqual(r.data.canales, ['ui', 'chat']);
  const evs = publicado.map(x => x.ev);
  assert.ok(evs.includes('confluencia.h3.aviso_entregado'));
  assert.ok(evs.includes('chat.message.saved'));
  const ui = publicado.find(x => x.ev === 'confluencia.h3.aviso_entregado').p;
  assert.strictEqual(ui.canal, 'ui');
  assert.strictEqual(ui.estado, 'entregado');
  assert.strictEqual(ui.aviso_id, 'c-9');
  const chat = publicado.find(x => x.ev === 'chat.message.saved').p;
  assert.strictEqual(chat.user_id, 'sistema-h3');
  assert.strictEqual(chat.channel, 'sistema');
  assert.ok(chat.user_message.includes('AVISO'));
});

test('S3: _formatearAviso produce texto legible con los datos del aviso', async () => {
  const m = makeModulo();
  const texto = m._formatearAviso({
    categoria: 'cliente', prioridad: 'alta', motivo: 'no_disponible',
    cliente: { nombre: 'Ana' },
    pedido: { producto: 'barra_pan', cantidad: 3, dia_solicitado: '2026-08-22', dia_propuesto: null }
  });
  assert.ok(texto.includes('CLIENTE'));
  assert.ok(texto.includes('alta'));
  assert.ok(texto.includes('Ana'));
  assert.ok(texto.includes('barra_pan'));
});

// ---------------------------------------------------------------------------
// S5 · Cierre (aplicar_decision) — decisión del dueño modifica flujo + rastro
// ---------------------------------------------------------------------------
test('S5: aceptar con correlation_id → 200, aplicada true, emite decision_aplicada', async () => {
  const m = makeModulo();
  const publicado = [];
  m.eventBus.publish = (ev, p) => { if (ev === 'confluencia.h3.decision_aplicada') publicado.push(p); };
  // sin store previo → fs.write
  let escrito = null;
  m._rpc = async (ev, payload) => {
    if (ev === 'fs.write.request') { escrito = payload.content; return { status: 200 }; }
    return null;
  };
  const r = await m._aplicarDecision({ correlation_id: 'c-1', decision: 'aceptar', user_id: 'dueno' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.aplicada, true);
  assert.strictEqual(r.data.registro.decision, 'aceptar');
  assert.ok(escrito); // persistió el rastro
  const store = JSON.parse(escrito);
  assert.strictEqual(store.decisiones.length, 1);
  assert.strictEqual(store.decisiones[0].aviso_correlation_id, 'c-1');
  assert.strictEqual(publicado.length, 1);
  assert.strictEqual(publicado[0].decision, 'aceptar');
});

test('S5: decision inválida → 400 INVALID_INPUT', async () => {
  const m = makeModulo();
  const r = await m._aplicarDecision({ correlation_id: 'c-1', decision: 'borrar_todo' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'INVALID_INPUT');
});

test('S5: sin correlation_id → 400 INVALID_INPUT', async () => {
  const m = makeModulo();
  const r = await m._aplicarDecision({ decision: 'aceptar' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
(async () => {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${t.name}\n    ${err.message}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
