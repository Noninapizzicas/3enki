/**
 * cuenta-recurrente — TEST unitario determinista (sin bus, sin red).
 * Verifica la LÓGICA pura: _activar · _desactivar · _generarSemana · _generarPedidoSemana ·
 * _aplicarDescuento, con _rpc/eventBus stubeados (patrón de la casa: el reflejo se testea
 * por métodos internos). Casos del plan de construcción (Fase 3b): activar con pedido base,
 * generar semana clonando el base con descuento 10%, estado ilegal ACTIVA sin pedido base,
 * desactivar, y el recordatorio que solo se envía con ok:true del proveedor.
 */

'use strict';
const assert = require('node:assert/strict');
const CuentaRecurrente = require('./index.js');

function nuevaInstancia() {
  const m = new CuentaRecurrente();
  m._rpc = async (topic, data) => {
    if (topic === 'notificar.request') {
      // proveedor de notificación: responde ok:true (el recordatorio solo se envía con ok)
      return { status: 200, ok: true, data: { enviada: true } };
    }
    return { status: 500, data: {} };
  };
  m.eventBus = { publish: () => {} };
  m.metrics = { increment: () => {} };
  return m;
}

const PEDIDO_BASE = {
  items: [
    { cantidad: 1, descripcion: 'Pan de pueblo', producto_id: 'pan-pueblo', precio_unitario_centimos: 200, precio_total_centimos: 200 },
    { cantidad: 2, descripcion: 'Baguette', producto_id: 'baguette', precio_unitario_centimos: 150, precio_total_centimos: 300 }
  ],
  total_centimos: 500
};

let pasados = 0;
function ok(nombre) { pasados++; console.log('  ✓ ' + nombre); }

(async () => {
  const m = nuevaInstancia();

  // ── 1 · ACTIVAR: crea cuenta ACTIVA con pedido base y descuento 10% ──
  console.log('T1 · activar cuenta recurrente');
  {
    const r = await m._activar({
      project_id: 'p1',
      cliente_nombre: 'María',
      cliente_telefono: '34600000000',
      pedido_base: PEDIDO_BASE,
      dia_semana: 'lunes'
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.cuenta.estado, 'ACTIVA');
    assert.equal(r.data.cuenta.dia_semana, 'lunes');
    assert.equal(r.data.cuenta.descuento_pct, 0.10);
    assert.equal(r.data.cuenta.pedido_base.total_centimos, 500);
    ok('cuenta ACTIVA · dia lunes · descuento 10% · pedido base 500 céntimos');
  }

  // ── 2 · ACTIVAR sin pedido base → INVALID_INPUT (estado ilegal imposible) ──
  console.log('T2 · activar sin pedido base');
  {
    const r = await m._activar({ project_id: 'p1', cliente_nombre: 'Juan', dia_semana: 'martes' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'INVALID_INPUT');
    ok('rechaza activar sin pedido_base (INVALID_INPUT)');
  }

  // ── 3 · GENERAR SEMANA: clona el base con la fecha y aplica descuento 10% ──
  console.log('T3 · generar semana con descuento');
  {
    const act = await m._activar({
      project_id: 'p1', cliente_nombre: 'María', cliente_telefono: '34600000000',
      pedido_base: PEDIDO_BASE, dia_semana: 'lunes'
    });
    const cuenta_id = act.data.cuenta.id;
    const r = await m._generarSemana({ project_id: 'p1', cuenta_id, fecha_semana: '2026-09-07' });
    assert.equal(r.status, 200);
    assert.equal(r.data.fecha_semana, '2026-09-07');
    assert.equal(r.data.pedido.estado, 'PENDIENTE_PAGO');
    assert.equal(r.data.pedido.total_base_centimos, 500);
    assert.equal(r.data.pedido.descuento_centimos, 50);          // 10% de 500
    assert.equal(r.data.pedido.total_centimos, 450);              // 500 − 50
    assert.equal(r.data.pedido.items.length, 2);                  // clona los items del base
    ok('pedido de la semana · 500 → descuento 50 → total 450 · items clonados (2)');
  }

  // ── 4 · GENERAR SEMANA en cuenta inexistente → 404 ──
  console.log('T4 · generar semana en cuenta inexistente');
  {
    const r = await m._generarSemana({ project_id: 'p1', cuenta_id: 'no-existe', fecha_semana: '2026-09-07' });
    assert.equal(r.status, 404);
    assert.equal(r.data.error, 'RESOURCE_NOT_FOUND');
    ok('cuenta inexistente → 404 RESOURCE_NOT_FOUND');
  }

  // ── 5 · DESACTIVAR: pasa a INACTIVA ──
  console.log('T5 · desactivar cuenta');
  {
    const act = await m._activar({
      project_id: 'p1', cliente_nombre: 'María', pedido_base: PEDIDO_BASE, dia_semana: 'lunes'
    });
    const cuenta_id = act.data.cuenta.id;
    const r = await m._desactivar({ project_id: 'p1', cuenta_id });
    assert.equal(r.status, 200);
    assert.equal(r.data.estado, 'INACTIVA');
    // generar semana en cuenta INACTIVA → CONFLICT_STATE
    const g = await m._generarSemana({ project_id: 'p1', cuenta_id, fecha_semana: '2026-09-14' });
    assert.equal(g.status, 409);
    assert.equal(g.data.error, 'CONFLICT_STATE');
    ok('desactiva → INACTIVA · generar en INACTIVA → 409 CONFLICT_STATE');
  }

  // ── 6 · RECORDATORIO: solo se envía con ok:true del proveedor ──
  console.log('T6 · recordatorio semanal');
  {
    const act = await m._activar({
      project_id: 'p1', cliente_nombre: 'María', cliente_telefono: '34600000000',
      pedido_base: PEDIDO_BASE, dia_semana: 'lunes'
    });
    const emitidos = [];
    m.eventBus = { publish: (ev, data) => emitidos.push(ev) };
    await m._recordarSemanal({ project_id: 'p1' });
    assert.ok(emitidos.includes('cuenta-recurrente.recordatorio_enviado'), 'recordatorio emitido');
    ok('recordatorio emitido para cuenta ACTIVA (proveedor ok:true)');
  }

  console.log(`\nRESULTADO: ${pasados}/6 bloques OK`);
  process.exit(pasados === 6 ? 0 : 1);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
