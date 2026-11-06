/**
 * Tests unitarios — pizzepos/confirmacion-pedido.
 *
 * Lo que se prueba aquí es la conversación, no el transporte: que a un cliente
 * nuevo se le PIDA confirmación, que un "sí" desbloquee su pedido y un "no" lo
 * cierre, y que un habitual no reciba una petición sino un saludo.
 *
 * Ejecutar: PORT=3399 node --test tests/unit/pizzepos__confirmacion-pedido.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');

const Modulo = require('../../modules/pizzepos/confirmacion-pedido/index.js');

let TMP;

function base(extra = {}) {
  const dir = fs.mkdtempSync(path.join(TMP, 'proj-'));
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config', 'config.json'), JSON.stringify({
    whatsapp_qr: { url: 'http://127.0.0.1:9999/send', slug: 'the-pirate', eventos: path.join(dir, 'eventos.jsonl') },
    confirmacion_pedidos: { activo: true, pedidos_habitual: 3, espera_segundos: 0, ...extra }
  }));
  fs.writeFileSync(path.join(dir, 'eventos.jsonl'), '');
  return dir;
}

async function instanciar(dir, { pedidos = {}, cuentas = null } = {}) {
  const enviados = [];
  const publicados = [];
  global.fetch = async (url, opts) => {
    enviados.push(JSON.parse(opts.body));
    return { status: 200, json: async () => ({ ok: true, id: 'msg1' }) };
  };
  const m = new Modulo();
  await m.onLoad({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    metrics: { increment() {} },
    eventBus: { publish: async (e, p) => publicados.push([e, p]) },
    moduleRegistry: {
      get: (n) => {
        if (n === 'project-manager') return { instance: { handleGetProject: async () => ({ status: 200, data: { project: { id: 'the-pirate', base_path: dir } } }) } };
        if (n === 'pedidos') return { instance: pedidos };
        if (n === 'cuentas') return { instance: cuentas || { handleGetCuenta: async () => ({ status: 200, data: { ref_display: 'Paco L 395' } }) } };
        return null;
      }
    }
  });
  return { m, enviados, publicados };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'confirmacion-'));

  // ── Clasificación de la respuesta ───────────────────────────────────────────

  {
    const { m } = await instanciar(base());
    for (const [texto, esperado] of [
      ['SÍ', 'si'], ['sí', 'si'], ['Si!', 'si'], ['vale', 'si'], ['OK', 'si'],
      ['adelante', 'si'], ['sí, adelante', 'si'], ['confirmo', 'si'],
      ['no', 'no'], ['No.', 'no'], ['mejor no', 'no'], ['cancela', 'no']
    ]) {
      assert.strictEqual(m._clasificar(texto), esperado, `"${texto}" debería ser ${esperado}`);
    }
    for (const texto of ['no sé qué tal', 'hola buenas', 'cuánto tarda la pizza', 'sí pero sin cebolla por favor']) {
      assert.strictEqual(m._clasificar(texto), null, `"${texto}" no es una respuesta de confirmación`);
    }
    await m.onUnload();
  }

  // ── Cliente nuevo: se le pide confirmación ──────────────────────────────────

  {
    const dir = base();
    const { m, enviados } = await instanciar(dir);
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p1', project_slug: 'the-pirate', project_id: 'the-pirate',
      cuenta_id: 'c1', cliente_jid: '444@lid', cliente_nombre: 'Francisco Sánchez'
    } });
    await esperar(80);
    assert.strictEqual(enviados.length, 1);
    assert.strictEqual(enviados[0].slug, 'the-pirate');
    assert.strictEqual(enviados[0].to, '444@lid');
    assert.match(enviados[0].text, /Francisco/, 'saluda por su nombre de pila');
    assert.match(enviados[0].text, /SÍ/, 'dice exactamente qué tiene que responder');
    assert.match(enviados[0].text, /L 395/, 'lleva el número de pedido que dirá en la barra');
    await m.onUnload();
  }

  // ── Cliente habitual: no se le pide nada, se le saluda ──────────────────────

  {
    const dir = base();
    const { m, enviados } = await instanciar(dir);
    await m.onPedidoClienteHabitual({ data: {
      pedido_id: 'p2', project_slug: 'the-pirate', cliente_jid: '555@lid',
      cliente_nombre: 'Paco Ros', pedidos_entregados: 3
    } });
    assert.strictEqual(enviados.length, 1);
    assert.match(enviados[0].text, /Paco/);
    assert.doesNotMatch(enviados[0].text, /Responde SÍ/, 'a un habitual no se le pide confirmación');
    await m.onUnload();
  }

  // ── El "sí" del cliente desbloquea el pedido ────────────────────────────────

  {
    const dir = base();
    const llamadas = [];
    const pedidos = {
      handleConfirmarPedido: async (a) => { llamadas.push(['confirmar', a.pedido_id]); return { status: 200, data: {} }; },
      handleRechazarPedido: async (a) => { llamadas.push(['rechazar', a.pedido_id]); return { status: 200, data: {} }; }
    };
    const { m, publicados } = await instanciar(dir, { pedidos });
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p3', project_slug: 'the-pirate', cliente_jid: '666@lid', cliente_nombre: 'Ana'
    } });
    await esperar(80);
    // Primera lectura: fija el offset (lo que ya estaba escrito no es respuesta).
    await m._leerRespuestas();
    const f = path.join(dir, 'eventos.jsonl');
    await fsp.appendFile(f, JSON.stringify({ tipo: 'mensaje', grupo: false, de: '666@lid', texto: 'sí' }) + '\n');
    await m._leerRespuestas();
    assert.deepStrictEqual(llamadas, [['confirmar', 'p3']], 'un "sí" manda el pedido a cocina');
    assert.strictEqual(m.pendientes.size, 0, 'el pendiente se cierra al responder');
    assert.ok(publicados.length >= 0);
    await m.onUnload();
  }

  // ── El "no" cierra el pedido sin cocina ─────────────────────────────────────

  {
    const dir = base();
    const llamadas = [];
    const pedidos = {
      handleConfirmarPedido: async () => { llamadas.push('confirmar'); return { status: 200 }; },
      handleRechazarPedido: async (a) => { llamadas.push(['rechazar', a.pedido_id]); return { status: 200 }; }
    };
    const { m } = await instanciar(dir, { pedidos });
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p4', project_slug: 'the-pirate', cliente_jid: '777@lid', cliente_nombre: 'Luis'
    } });
    await esperar(80);
    await m._leerRespuestas();
    await fsp.appendFile(path.join(dir, 'eventos.jsonl'),
      JSON.stringify({ tipo: 'mensaje', grupo: false, de: '777@lid', texto: 'no' }) + '\n');
    await m._leerRespuestas();
    assert.deepStrictEqual(llamadas, [['rechazar', 'p4']]);
    await m.onUnload();
  }

  // ── Ruido que NO debe confirmar nada ────────────────────────────────────────

  {
    const dir = base();
    const llamadas = [];
    const pedidos = {
      handleConfirmarPedido: async () => { llamadas.push('confirmar'); return { status: 200 }; },
      handleRechazarPedido: async () => { llamadas.push('rechazar'); return { status: 200 }; }
    };
    const { m } = await instanciar(dir, { pedidos });
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p5', project_slug: 'the-pirate', cliente_jid: '888@lid', cliente_nombre: 'Eva'
    } });
    await esperar(80);
    await m._leerRespuestas();
    const f = path.join(dir, 'eventos.jsonl');
    await fsp.appendFile(f, [
      JSON.stringify({ tipo: 'mensaje', grupo: true, de: '888@lid', texto: 'sí' }),          // grupo
      JSON.stringify({ tipo: 'mensaje', grupo: false, de: '999@lid', texto: 'sí' }),          // otro cliente
      JSON.stringify({ tipo: 'mensaje', grupo: false, de: '888@lid', texto: 'Pedido recibido, Eva.' }),  // eco del bot
      JSON.stringify({ tipo: 'mensaje', grupo: false, de: '888@lid', texto: 'cuánto tarda la pizza' }),  // otra cosa
      JSON.stringify({ tipo: 'conectado', slug: 'the-pirate' })                                // no es mensaje
    ].join('\n') + '\n');
    await m._leerRespuestas();
    assert.deepStrictEqual(llamadas, [], 'ni un grupo, ni otro cliente, ni el eco del bot confirman');
    assert.strictEqual(m.pendientes.size, 1, 'el pedido sigue esperando su respuesta de verdad');
    await m.onUnload();
  }

  // ── Sin puente configurado no se manda y no se rompe ────────────────────────

  {
    const dir = fs.mkdtempSync(path.join(TMP, 'vacio-'));
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'config', 'config.json'), JSON.stringify({}));
    const { m, enviados } = await instanciar(dir);
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p6', project_slug: 'the-pirate', cliente_jid: '000@lid', cliente_nombre: 'Sin Puente'
    } });
    await esperar(80);
    assert.strictEqual(enviados.length, 0, 'sin puente no hay mensaje');
    await m.onUnload();
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('\nTodos los tests pasaron.');
})().catch((e) => { console.error(e); process.exit(1); });
