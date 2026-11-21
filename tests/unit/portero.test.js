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
// El gateway llama `onConnect(res)` con el response REAL y mantiene la conexión.
function recolectar(result) {
  assert.strictEqual(result.status, 200);
  assert.strictEqual(result.data?._responseType, 'sse', 'el gateway solo hace SSE con _responseType');
  const res = resStub();
  result.data.onConnect(res);
  return parseSSE(res.eventos);
}

test('_ui usa mqttRequest del loader (uiHandler directo), no el eventBus interno', async () => {
  const m = nuevo();
  let visto = null;
  m.mqttRequest = async (d, a, p) => { visto = [d, a, p]; return { status: 200, data: { productos: [{ nombre: 'X' }] } }; };
  const r = await m._ui('cartadigital', 'get_carta_publica', { project_id: 'the-pirate' });
  assert.deepStrictEqual(visto, ['cartadigital', 'get_carta_publica', { project_id: 'the-pirate' }]);
  assert.ok(r.data.productos.length === 1);
});

test('modo sombra: responde pero NO emite accion (el carrito no se mueve)', async () => {
  const m = nuevo();
  m._cfgProyecto = () => ({ activado: true, modo: 'sombra' });
  const result = await m.handleChatPost({ body: { project_id: 'the-pirate', message: 'ponme una Port Royal' } });
  const evs = recolectar(result);
  assert.ok(evs.some(e => e.ev === 'token'));
  assert.ok(!evs.some(e => e.ev === 'accion'), 'emitió acción en sombra');
  assert.strictEqual(evs.find(e => e.ev === 'fin').data.modo, 'sombra');
});

test('modo vivo: sí emite la acción', async () => {
  const m = nuevo();
  m._cfgProyecto = () => ({ activado: true, modo: 'vivo' });
  const result = await m.handleChatPost({ body: { project_id: 'the-pirate', message: 'ponme una Port Royal' } });
  const evs = recolectar(result);
  assert.ok(evs.some(e => e.ev === 'accion' && e.data.producto_id === 'la_flota_port_royal'));
});

test('onLoad lee la config de modules_config.portero (no de la raíz)', async () => {
  const m = new Portero();
  const core = {
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    metrics: { increment: () => {} },
    eventBus: { publish: () => {}, subscribe: () => () => {} },
    // Forma REAL del config del core: la config del módulo va anidada.
    config: { modules_config: { portero: { proyectos: { 'the-pirate': { activado: true, modo: 'sombra' } } } } }
  };
  await m.onLoad(core);
  assert.deepStrictEqual(m._cfgProyecto('the-pirate'), { activado: true, modo: 'sombra' });
  assert.deepStrictEqual(m._cfgProyecto('otro'), {});
});

test('pedidos: filtra por proyecto, deduplica y saca el nombre de la CUENTA', () => {
  const m = nuevo();
  const pedidos = [
    { id: 'p1', project_id: 'the-pirate', cuenta_id: 'c1', estado: 'en_cocina' },
    { id: 'p1', project_id: 'the-pirate', cuenta_id: 'c1', estado: 'en_cocina' },
    { id: 'p2', project_id: 'nonina', cuenta_id: 'c2', estado: 'en_cocina' }
  ];
  const cuentas = [{ id: 'c1', nombre: 'Mijael Rodas Limpias' }, { id: 'c2', nombre: 'Otro' }];
  const r = m._pedidosDelProyecto(pedidos, cuentas, 'the-pirate');
  assert.strictEqual(r.length, 1, 'no deduplicó o no filtró el proyecto');
  assert.strictEqual(r[0].cliente_nombre, 'Mijael Rodas Limpias');
});

test('estado_pedido con nombre parcial del cliente', () => {
  const m = nuevo({ pedidos: [{ id: 'p1', project_id: 'the-pirate', cliente_nombre: 'Mijael Rodas Limpias', estado: 'en_cocina' }] });
  const r = dime(m, '¿cómo va mi pedido?', { nombre: 'Mijael' });
  assert.ok(r.resuelto);
  assert.ok(/en cocina/.test(r.texto), r.texto);
});

test('sin activado:true responde 404 y no atiende', async () => {
  const m = nuevo();
  m._cfgProyecto = () => ({});
  const r = await m.handleChatPost({ body: { project_id: 'the-pirate', message: 'hola' } });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.data.error.code, 'NOT_FOUND');
});

// ── identidad del cliente ───────────────────────────────────────────────────

const CTX_PEDIDO = {
  productos: [],
  pedidos: [{ cuenta_id: 'llevar_1', cliente_nombre: 'Mijael', numero_pedido: 'L 527', estado: 'en_cocina', created_at: '2026-11-20T14:00:00Z' }]
};

test('estado_pedido con cuenta_id: responde sin preguntar el nombre', () => {
  const m = nuevo();
  const r = m.responder('estado_pedido', {}, CTX_PEDIDO, '¿cómo va mi pedido?', { nombre: null, cuenta_id: 'llevar_1' });
  assert.strictEqual(r.resuelto, true);
  assert.ok(r.texto.startsWith('Mijael, tu pedido'), r.texto);
  assert.ok(r.texto.includes('en cocina'), r.texto);
});

test('sin cuenta_id ni nombre: pregunta (no adivina)', () => {
  const m = nuevo();
  const r = m.responder('estado_pedido', {}, CTX_PEDIDO, '¿cómo va mi pedido?', { nombre: null, cuenta_id: null });
  assert.strictEqual(r.resuelto, false);
  assert.ok(/nombre/i.test(r.texto));
});

test('sesión: el nombre dicho se recuerda para el turno siguiente', () => {
  const m = nuevo();
  const s = m._sesion('s1');
  s.esperando = 'nombre';
  assert.strictEqual(m._sesion('s1').esperando, 'nombre');
  m._sesion('s1').nombre = 'Mijael';
  assert.strictEqual(m._sesion('s1').nombre, 'Mijael');
});

test('"soy Mijael" se extrae; "soy el asistente" no', () => {
  const m = nuevo();
  assert.strictEqual(m._nombreDicho('hola, soy Mijael'), 'Mijael');
  assert.strictEqual(m._nombreDicho('me llamo Mijael Rodas'), 'Mijael Rodas');
  assert.strictEqual(m._nombreDicho('soy el asistente'), null);
});

test('respuesta a "¿con qué nombre?": un nombre sí, una frase no', () => {
  const m = nuevo();
  assert.strictEqual(m._posibleNombre('Mijael'), 'Mijael');
  assert.strictEqual(m._posibleNombre('¿cuánto cuesta la pizza?'), null);
  assert.strictEqual(m._posibleNombre('pedido'), null);
});

test('publica portero.pregunta y portero.respuesta con el hecho completo', async () => {
  const m = nuevo();
  const ev = [];
  m.eventBus = { publish: async (n, p) => ev.push([n, p]) };
  m._cfgProyecto = () => ({ activado: true, modo: 'sombra' });
  m._contexto = async () => ({ carta: { productos: [] }, productos: [], pedidos: [], opciones: {}, servicio: null });

  await m.handleChatPost({ body: {
    project_id: 'the-pirate', message: '¿estáis abiertos?', sesion_id: 's1', cuenta_id: 'llevar_1'
  } });

  const preg = ev.find(([n]) => n === 'portero.pregunta');
  assert.ok(preg, 'no se publicó portero.pregunta');
  assert.strictEqual(preg[1].mensaje, '¿estáis abiertos?');
  assert.strictEqual(preg[1].sesion_id, 's1');
  assert.strictEqual(preg[1].cuenta_id, 'llevar_1');

  const resp = ev.find(([n]) => n === 'portero.respuesta');
  assert.ok(resp, 'no se publicó portero.respuesta');
  assert.strictEqual(resp[1].mensaje, '¿estáis abiertos?');
  assert.strictEqual(resp[1].intencion, 'horario');
  assert.ok(typeof resp[1].texto === 'string' && resp[1].texto.length > 0);
});

test('contrato: todo evento publicado está declarado en module.json (y al revés)', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../modules/pizzepos/portero/index.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../modules/pizzepos/portero/module.json'), 'utf8'));

  const declarados = new Set((manifest.events?.publishes || []).map(e => e.event));
  const publicados = new Set([...src.matchAll(/publish\?\.\('([a-z0-9_.]+)'/g)].map(m => m[1]));

  for (const ev of publicados) assert.ok(declarados.has(ev), `evento publicado sin declarar en el contrato: ${ev}`);
  for (const ev of declarados) assert.ok(publicados.has(ev), `evento declarado que no se publica: ${ev}`);
});

test('sesión: contestar el nombre NO cae en "No te he entendido"', async () => {
  const m = nuevo();
  const respuestas = [];
  m.eventBus = { publish: async (n, p) => { if (n === 'portero.respuesta') respuestas.push(p); } };
  m._cfgProyecto = () => ({ activado: true, modo: 'sombra' });
  m._contexto = async () => ({
    carta: { productos: [] }, productos: [], opciones: {}, servicio: null,
    pedidos: [{ cuenta_id: 'llevar_1', cliente_nombre: 'Mijael', estado: 'en_cocina', created_at: '2026-11-20T14:00:00Z' }]
  });

  await m.handleChatPost({ body: { project_id: 'the-pirate', message: '¿cómo va mi pedido?', sesion_id: 's9' } });
  await m.handleChatPost({ body: { project_id: 'the-pirate', message: 'Mijael', sesion_id: 's9' } });

  const ult = respuestas[respuestas.length - 1];
  assert.strictEqual(ult.intencion, 'estado_pedido', 'la respuesta al nombre debe continuar la pregunta anterior');
  assert.strictEqual(ult.resuelto, true);
  assert.ok(ult.texto.includes('en cocina'), ult.texto);
});

test('identidad: un pedido CANCELADO no es "tu pedido"', () => {
  const m = nuevo();
  const ctx = { pedidos: [
    { cuenta_id: 'c1', cliente_nombre: 'Mijael', estado: 'cancelado', created_at: '2026-11-20T10:00:00Z' },
    { cuenta_id: 'c2', cliente_nombre: 'Mijael', estado: 'en_cocina', created_at: '2026-11-20T14:00:00Z' }
  ] };
  const p = m._pedidoDeCliente(ctx, 'Mijael', null);
  assert.strictEqual(p.cuenta_id, 'c2');
  const r = m.responder('estado_pedido', {}, ctx, '¿cómo va mi pedido?', { nombre: 'Mijael', cuenta_id: null });
  assert.ok(r.texto.includes('en cocina'), r.texto);
});

test('identidad: dos abiertos con el mismo nombre NO se adivinan', () => {
  const m = nuevo();
  const ctx = { pedidos: [
    { cuenta_id: 'c1', cliente_nombre: 'Mijael', estado: 'en_cocina', created_at: '2026-11-20T14:00:00Z' },
    { cuenta_id: 'c2', cliente_nombre: 'Mijael', estado: 'en_cocina', created_at: '2026-11-20T14:05:00Z' }
  ] };
  assert.strictEqual(m._pedidoDeCliente(ctx, 'Mijael', null), null);
});

// ── runner ──────────────────────────────────────────────────────────────────

const PRODUCTOS_PRUEBA = [
  { id: 'p1', nombre: 'Mahón', precio: 12, categoria: 'pizzas', categoria_id: 'pizzas', ingredientes: ['jamón', 'queso'], alergenos: ['gluten', 'lacteos'] },
  { id: 'p2', nombre: 'Nassau', precio: 12, categoria: 'pizzas', categoria_id: 'pizzas', ingredientes: ['atún', 'cebolla'], alergenos: ['gluten'] },
  { id: 'p3', nombre: 'Port Royal', precio: 12, categoria: 'pizzas', categoria_id: 'pizzas', ingredientes: ['bacon'], alergenos: ['gluten', 'lacteos'] },
  { id: 'p4', nombre: 'Pimientos', precio: 6, categoria: 'entrantes', categoria_id: 'entrantes', ingredientes: ['pimiento'], alergenos: [] }
];

test('frases reales de WhatsApp: "dime la carta" y "ayuda" tienen intención', () => {
  const m = nuevo();
  assert.strictEqual(m.clasificar('Dime la carta', PRODUCTOS_PRUEBA).intencion, 'carta');
  assert.strictEqual(m.clasificar('Ayuda con la carta', PRODUCTOS_PRUEBA).intencion, 'ayuda');
  assert.strictEqual(m.clasificar('Cómo me puedes ayudar', PRODUCTOS_PRUEBA).intencion, 'ayuda');
  assert.strictEqual(m.clasificar('¿Qué tenéis?', PRODUCTOS_PRUEBA).intencion, 'carta');
});

test('"Hola, quiero preguntar sobre la carta" ya no se clasifica como pedir', () => {
  const m = nuevo();
  const c = m.clasificar('Hola, quiero preguntar sobre la carta de The Pirate', PRODUCTOS_PRUEBA);
  assert.notStrictEqual(c.intencion, 'pedir', 'el cliente pregunta, no pide');
  assert.strictEqual(c.intencion, 'carta');
});

test('"Pizzas con atún" busca por ingrediente', () => {
  const m = nuevo();
  const c = m.clasificar('Pizzas con atún', PRODUCTOS_PRUEBA);
  assert.strictEqual(c.intencion, 'buscar');
  const r = m.responder('buscar', c.args, { productos: PRODUCTOS_PRUEBA }, 'Pizzas con atún', {});
  assert.ok(r.texto.includes('Nassau'), r.texto);
});

test('"con atún" sin resultados lo dice, no inventa', () => {
  const m = nuevo();
  const r = m.responder('buscar', { q: 'piña' }, { productos: PRODUCTOS_PRUEBA }, 'pizza con piña', {});
  assert.ok(/No tengo nada con piña/.test(r.texto), r.texto);
});

test('pedir sigue funcionando y "quiero" sin producto ya no es pedir', () => {
  const m = nuevo();
  assert.strictEqual(m.clasificar('ponme una Nassau', PRODUCTOS_PRUEBA).intencion, 'pedir');
  assert.strictEqual(m.clasificar('quiero una Nassau', PRODUCTOS_PRUEBA).intencion, 'pedir');
  assert.notStrictEqual(m.clasificar('quiero preguntar una cosa', PRODUCTOS_PRUEBA).intencion, 'pedir');
  assert.strictEqual(m.clasificar('hola', PRODUCTOS_PRUEBA).intencion, 'saludo');
});

test('la carta responde con categorías, sin volcar 52 platos', () => {
  const m = nuevo();
  const r = m.responder('carta', {}, { productos: PRODUCTOS_PRUEBA }, 'dime la carta', {});
  assert.strictEqual(r.resuelto, true);
  assert.ok(r.texto.includes('4 platos'), r.texto);
  assert.ok(r.texto.includes('pizzas'), r.texto);
  assert.ok(r.texto.length < 400, 'la carta no puede ser un muro: ' + r.texto.length);
});

test('carta: usa las secciones del dueño y su orden, no una copia', () => {
  const m = nuevo();
  const secciones = [
    { id: 'pizzas', nombre: 'Pizzas Puerto Seguro', orden: 1 },
    { id: 'entrantes', nombre: 'Las Calas', orden: 2 }
  ];
  const r = m.responder('carta', {}, { productos: PRODUCTOS_PRUEBA, secciones }, 'dime la carta', {});
  assert.ok(r.texto.includes('Pizzas Puerto Seguro'), r.texto);
  assert.ok(r.texto.includes('Las Calas'), r.texto);
  assert.ok(r.texto.indexOf('Pizzas Puerto Seguro') < r.texto.indexOf('Las Calas'), 'respeta el orden del dueño');
});

test('buscar: si el bus ya devolvió resultados, se usan los suyos (no el fallback)', () => {
  const m = nuevo();
  const encontrados = [{ id: 'pizzas_pizza_de_atun', nombre: 'Pizza de atún', precio: 10.5 }];
  const r = m.responder('buscar', { q: 'atún' }, { productos: PRODUCTOS_PRUEBA, encontrados }, 'pizzas con atún', {});
  assert.ok(r.texto.includes('Pizza de atún'), r.texto);
  assert.ok(!r.texto.includes('Nassau'), 'no mezcla el filtro local con el resultado del dueño');
});

test('carta: handleChatPost pide la carta completa en UN round-trip', async () => {
  const m = nuevo();
  const llamadas = [];
  m.eventBus = { publish: async () => {} };
  m._cfgProyecto = () => ({ activado: true, modo: 'sombra' });
  m._contexto = async () => ({ carta: { productos: [] }, productos: [], pedidos: [], opciones: {}, servicio: null });
  m._ui = async (d, a) => {
    llamadas.push(`${d}.${a}`);
    if (a === 'carta_completa') return { data: {
      categorias: [{ id: 'pizzas', nombre: 'Pizzas Puerto Seguro', orden: 0 }],
      productos: [{ nombre: 'Mahón', precio: 12, categoria_id: 'pizzas' }],
      ingredientes: []
    } };
    return { data: {} };
  };
  await m.handleChatPost({ body: { project_id: 'the-pirate', message: 'dime la carta' } });
  assert.ok(llamadas.includes('productos.carta_completa'), llamadas.join(','));
  assert.ok(!llamadas.includes('categorias.list'), 'no se usa el catálogo vacío: ' + llamadas.join(','));
});

test('carta: una sección con orden 0 no se manda al final', () => {
  const m = nuevo();
  const secciones = [
    { id: 'la_flota', nombre: 'La Flota', orden: 0 },
    { id: 'pizzas', nombre: 'Pizzas Puerto Seguro', orden: 2 }
  ];
  const productos = [
    { nombre: 'Mahón', precio: 12, categoria_id: 'la_flota' },
    { nombre: 'Margarita', precio: 9.5, categoria_id: 'pizzas' }
  ];
  const r = m.responder('carta', {}, { productos, secciones }, 'dime la carta', {});
  assert.ok(r.texto.includes('La Flota'), r.texto);
  assert.ok(r.texto.indexOf('La Flota') < r.texto.indexOf('Pizzas Puerto Seguro'), 'orden 0 va primero: ' + r.texto);
});

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
