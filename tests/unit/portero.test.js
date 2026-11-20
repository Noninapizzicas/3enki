'use strict';

/**
 * portero — capa 1 determinista.
 *
 * Lo que se prueba: que las ocho intenciones se contestan con DATOS y que, cuando el dato
 * no está, el portero lo dice en vez de inventar. También que el modo sombra no mueve el
 * carrito y que sin `activado:true` no atiende.
 *
 * Ejecutar: node tests/unit/portero.test.js
 */

const assert = require('assert');
const Portero = require('../../modules/pizzepos/portero');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── fixture: forma REAL de la carta viva (productos con ingredientes/alergenos/opciones) ──
const CARTA = {
  branding: { nombre: 'The Pirate' },
  categorias: [
    { id: 'la_flota', nombre: 'La Flota' },
    { id: 'bebidas', nombre: 'Bebidas' }
  ],
  productos: [
    {
      id: 'la_flota_mahon', nombre: 'Mahón', precio: 12, disponible: true,
      categoria_id: 'la_flota', etiquetas: [],
      descripcion: 'Salsa The Pirate, queso y jamón.',
      ingredientes: [
        { id: 'salsa_the_pirate', nombre: 'Salsa The Pirate' },
        { id: 'mezcla_de_quesos', nombre: 'Mezcla de quesos' },
        { id: 'jamon_de_york', nombre: 'Jamón de york' }
      ],
      alergenos: ['gluten', 'lacteos'],
      opciones: []
    },
    {
      id: 'la_flota_port_royal', nombre: 'Port Royal', precio: 12, disponible: true,
      categoria_id: 'la_flota', etiquetas: [],
      ingredientes: [{ id: 'tomate', nombre: 'Tomate' }], alergenos: ['gluten'], opciones: []
    },
    {
      id: 'la_flota_nassau', nombre: 'Nassau', precio: 12, disponible: true,
      categoria_id: 'la_flota', etiquetas: [],
      ingredientes: [{ id: 'tomate', nombre: 'Tomate' }], alergenos: [], opciones: []
    },
    {
      id: 'bebida_cola', nombre: 'Coca-Cola', precio: 2, disponible: true,
      categoria_id: 'bebidas', etiquetas: [], ingredientes: [], alergenos: [], opciones: []
    }
  ]
};
const SERVICIO_CERRADO = {
  zona_horaria: 'Europe/Madrid',
  horario: { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] },
  interruptor: { abierto: false, motivo: 'manual', motivo_texto: 'cerrado por el dueño' },
  recogida: { direccion: 'Juan Carlos I, 49', ciudad: 'Lorca', maps_url: 'https://maps' }
};
const SERVICIO_ABIERTO = {
  ...SERVICIO_CERRADO,
  horario: { lunes: ['00:00-23:59'], martes: ['00:00-23:59'], miercoles: ['00:00-23:59'], jueves: ['00:00-23:59'], viernes: ['00:00-23:59'], sabado: ['00:00-23:59'], domingo: ['00:00-23:59'] },
  interruptor: { abierto: true }
};

function nuevo({ servicio = SERVICIO_CERRADO, pedidos = [], opciones = { modos_consumo: ['mesa', 'recoger', 'llevar'] } } = {}) {
  const m = new Portero();
  m.logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  m.metrics = { increment: () => {} };
  m.eventBus = { publish: () => {}, subscribe: () => () => {} };
  m.ctx = {
    carta: CARTA, productos: CARTA.productos, opciones, servicio, pedidos
  };
  m._contexto = async () => m.ctx;
  return m;
}
const ctx = (m) => m.ctx;
const dime = (m, texto, extra = {}) => {
  const c = m.clasificar(texto, m.ctx.productos);
  return { ...c, ...m.responder(c.intencion, c.args, m.ctx, texto, extra) };
};

// ── clasificador ────────────────────────────────────────────────────────────

test('clasifica: horario', () => {
  const m = nuevo();
  assert.strictEqual(m.clasificar('¿estáis abiertos?', CARTA.productos).intencion, 'horario');
  assert.strictEqual(m.clasificar('¿hasta qué hora abrís?', CARTA.productos).intencion, 'horario');
});

test('clasifica: qué lleva / alérgenos / precio', () => {
  const m = nuevo();
  assert.strictEqual(m.clasificar('¿qué lleva la Mahón?', CARTA.productos).intencion, 'que_lleva');
  assert.strictEqual(m.clasificar('soy celíaco, ¿tiene gluten?', CARTA.productos).intencion, 'alergenos');
  assert.strictEqual(m.clasificar('¿cuánto cuesta la Port Royal?', CARTA.productos).intencion, 'precio');
});

test('clasifica: reparto, tiempo, estado y pedir', () => {
  const m = nuevo();
  assert.strictEqual(m.clasificar('¿hacéis reparto a domicilio?', CARTA.productos).intencion, 'reparto');
  assert.strictEqual(m.clasificar('¿cuánto tarda?', CARTA.productos).intencion, 'tiempo');
  assert.strictEqual(m.clasificar('¿cómo va mi pedido?', CARTA.productos).intencion, 'estado_pedido');
  assert.strictEqual(m.clasificar('ponme una Port Royal', CARTA.productos).intencion, 'pedir');
});

test('clasifica: extrae el producto aunque haya ruido', () => {
  const m = nuevo();
  const c = m.clasificar('oye, ¿la Mahón qué lleva exactamente?', CARTA.productos);
  assert.strictEqual(c.intencion, 'que_lleva');
  assert.strictEqual(c.args.producto, 'Mahón');
});

// ── las ocho respuestas ─────────────────────────────────────────────────────

test('horario cerrado: lo dice y no se inventa apertura', () => {
  const m = nuevo({ servicio: SERVICIO_CERRADO });
  const r = dime(m, '¿estáis abiertos?');
  assert.ok(r.resuelto);
  assert.ok(/cerrado/i.test(r.texto), r.texto);
});

test('horario abierto: lo dice con la hora de cierre', () => {
  const m = nuevo({ servicio: SERVICIO_ABIERTO });
  const r = dime(m, '¿estáis abiertos?');
  assert.ok(r.resuelto);
  assert.ok(/abiertos/i.test(r.texto), r.texto);
});

test('horario: formatea la próxima apertura (nunca [object Object])', () => {
  const m = nuevo();
  assert.strictEqual(
    m._cuandoAbre({ fecha: '2026-11-20', desde: '18:00' }, { ahora: { fecha: '2026-11-20' } }),
    'hoy a las 18:00'
  );
  assert.strictEqual(
    m._cuandoAbre({ fecha: '2026-11-21', desde: '18:00' }, { ahora: { fecha: '2026-11-20' } }),
    'el sábado a las 18:00'
  );
});

test('qué lleva: devuelve los ingredientes reales', () => {
  const m = nuevo();
  const r = dime(m, '¿qué lleva la Mahón?');
  assert.ok(r.resuelto);
  assert.ok(/Salsa The Pirate/.test(r.texto) && /Jamón de york/.test(r.texto), r.texto);
});

test('alérgenos por producto: declara gluten y lácteos', () => {
  const m = nuevo();
  const r = dime(m, '¿la Mahón tiene gluten?');
  assert.ok(r.resuelto);
  assert.ok(/gluten/.test(r.texto) && /lacteos/.test(r.texto), r.texto);
});

test('alérgenos por exclusión: no ofrece BEBIDAS como plato sin gluten', () => {
  const m = nuevo();
  const r = dime(m, 'algo sin gluten');
  assert.ok(r.resuelto);
  assert.ok(/Nassau/.test(r.texto), r.texto);
  assert.ok(!/Coca-Cola/.test(r.texto), 'coló una bebida como plato: ' + r.texto);
});

test('precio: el de la carta, en euros', () => {
  const m = nuevo();
  const r = dime(m, '¿cuánto cuesta la Port Royal?');
  assert.ok(/12,00 €/.test(r.texto), r.texto);
});

test('reparto: sin modo domicilio lo dice y da la dirección de recogida', () => {
  const m = nuevo();
  const r = dime(m, '¿hacéis reparto a domicilio?');
  assert.ok(/no hacemos/i.test(r.texto), r.texto);
  assert.ok(/Juan Carlos I, 49/.test(r.texto), r.texto);
});

test('tiempo: NO promete minutos (no hay ETA en el sistema)', () => {
  const m = nuevo();
  const r = dime(m, '¿cuánto tarda?');
  assert.ok(!/\b\d+\s*(min|minutos)\b/i.test(r.texto), 'prometió un plazo: ' + r.texto);
  assert.ok(/a ojo|no te quiero dar/i.test(r.texto), r.texto);
});

test('estado: sin nombre pide el nombre; con nombre y UN pedido lo dice', () => {
  const m = nuevo({ pedidos: [{ id: 'p1', project_id: 'the-pirate', cliente_nombre: 'Mijael', estado: 'en_cocina' }] });
  const sinNombre = dime(m, '¿cómo va mi pedido?');
  assert.ok(!sinNombre.resuelto);
  const conNombre = dime(m, '¿cómo va mi pedido?', { nombre: 'Mijael' });
  assert.ok(conNombre.resuelto);
  assert.ok(/en cocina/.test(conNombre.texto), conNombre.texto);
});

test('pedir: resuelve a id y propone la acción de carrito', () => {
  const m = nuevo();
  const r = dime(m, 'ponme una Port Royal');
  assert.ok(r.resuelto);
  assert.ok(r.acciones.some(a => a.tipo === 'anadir_carrito' && a.producto_id === 'la_flota_port_royal'), JSON.stringify(r.acciones));
});

test('fail-closed: producto inexistente no se inventa', () => {
  const m = nuevo();
  const r = dime(m, '¿qué lleva el sushi de atún rojo?');
  assert.strictEqual(r.resuelto, false);
  assert.ok(/no tengo ese plato/i.test(r.texto), r.texto);
});

test('fail-closed: sin servicio no se afirma el horario', () => {
  const m = nuevo({ servicio: null });
  const r = dime(m, '¿estáis abiertos?');
  assert.strictEqual(r.resuelto, false);
  assert.ok(/no puedo confirmar/i.test(r.texto), r.texto);
});

// ── modo sombra y puerta de activación ──────────────────────────────────────

function resStub() {
  const out = { eventos: [] };
  out.writeHead = () => {};
  out.write = (s) => { out.eventos.push(s); };
  out.end = () => {};
  return out;
}
function parseSSE(eventos) {
  return eventos.map(b => {
    const ev = (b.match(/^event: (.+)$/m) || [])[1];
    const da = (b.match(/^data: (.+)$/m) || [])[1];
    return { ev, data: da ? JSON.parse(da) : null };
  });
}

test('modo sombra: responde pero NO emite accion (el carrito no se mueve)', async () => {
  const m = nuevo();
  m._cfgProyecto = () => ({ activado: true, modo: 'sombra' });
  const res = resStub();
  await m.handleChatPost({ body: { project_id: 'the-pirate', message: 'ponme una Port Royal' } }, res);
  const evs = parseSSE(res.eventos);
  assert.ok(evs.some(e => e.ev === 'token'));
  assert.ok(!evs.some(e => e.ev === 'accion'), 'emitió acción en sombra');
  assert.strictEqual(evs.find(e => e.ev === 'fin').data.modo, 'sombra');
});

test('modo vivo: sí emite la acción', async () => {
  const m = nuevo();
  m._cfgProyecto = () => ({ activado: true, modo: 'vivo' });
  const res = resStub();
  await m.handleChatPost({ body: { project_id: 'the-pirate', message: 'ponme una Port Royal' } }, res);
  const evs = parseSSE(res.eventos);
  assert.ok(evs.some(e => e.ev === 'accion' && e.data.producto_id === 'la_flota_port_royal'));
});

test('sin activado:true responde 404 y no atiende', async () => {
  const m = nuevo();
  m._cfgProyecto = () => ({});
  let visto = null;
  const res = { status: (s) => ({ json: (b) => { visto = { s, b }; } }), setHeader: () => {} };
  await m.handleChatPost({ body: { project_id: 'the-pirate', message: 'hola' } }, res);
  assert.strictEqual(visto.s, 404);
});

// ── runner ──────────────────────────────────────────────────────────────────

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[portero] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[portero] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
