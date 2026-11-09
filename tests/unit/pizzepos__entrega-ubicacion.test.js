'use strict';
/**
 * ENTREGA · UBICACIÓN DEL CLIENTE
 *
 * El cliente puede mandar su PUNTO exacto al pedir a domicilio. Lo que se prueba,
 * con el código REAL (no con una maqueta):
 *
 *   1. El normalizador del punto: basura fuera, rangos respetados, (0,0) no es un
 *      reparto (es el GPS sin fix).
 *   2. El enlace del mapa: con pin abre el punto; sin pin busca la dirección; sin
 *      nada devuelve null (nunca se inventa un mapa).
 *   3. La carta: el botón existe, el pin viaja en el #P1 y el parser de producción
 *      lo lee. Sin pin, el pedido sale igual con la dirección (nunca frena).
 *   4. La PUERTA de pedidos: el pin se normaliza, se guarda y compone el enlace; un
 *      pin inválido NO tumba el pedido — cae a la dirección; un pin en 'recoger' se
 *      descarta (un punto no lleva a ninguna parte si el cliente pasa a por él).
 *   5. El aviso al repartidor (staff): lleva destino Y enlace del mapa.
 *
 * (La confirmación al cliente por WhatsApp se probaba aquí; ese carril salió del repo:
 *  el único carril de WhatsApp es el puente Rust que publica whatsapp.mensaje.recibido.)
 */
const assert = require('assert');
const vm = require('vm');

const { generateStaticHTML } = require('../../modules/pizzepos/carta-digital/static-template.js');
const { parsearPedido } = require('../../modules/_shared/pedido-mensaje-parser.js');
const { normalizarUbicacion, enlaceMapa } = require('../../modules/_shared/ubicacion-entrega.js');
const PedidosModule = require('../../modules/pizzepos/pedidos/index.js');
const NotificadorPedidos = require('../../modules/pizzepos/notificador-pedidos/index.js');

const CARTA = {
  nombre_negocio: 'Rapitvapers',
  categorias: [{ id: 'vapeo', nombre: 'Vapeo' }],
  productos: [
    { id: 'vozol-neon-1000-vzbull', nombre: 'Vozol Neon 1000 VZ Bull', precio: 3.9, categoria: 'vapeo' }
  ]
};
const CONFIG = {
  nombre_negocio: 'Rapitvapers',
  project_slug: 'rapitvapers',
  pedido_endpoint: '/tienda/pedido/rapitvapers',
  pago_online: false,
  whatsapp_telefono: '',
  moneda: '€',
  modos_consumo: ['recoger', 'domicilio']
};
const PIN = { lat: 37.6712, lng: -1.6987 };   // Lorca

// ── 1 · normalizador del punto ───────────────────────────────────────────────────
{
  assert.deepStrictEqual(normalizarUbicacion(PIN), PIN, 'un punto válido se conserva');
  assert.deepStrictEqual(normalizarUbicacion({ latitude: 37.6712, longitude: -1.6987 }), PIN,
    'el nombre del campo no cambia el dato');
  assert.strictEqual(normalizarUbicacion({ lat: 91, lng: 0 }), null, 'lat fuera de rango: fuera');
  assert.strictEqual(normalizarUbicacion({ lat: 0, lng: 0 }), null, 'null island no es un reparto');
  assert.strictEqual(normalizarUbicacion({ lat: 'norte', lng: 'sur' }), null, 'texto no es un punto');
  assert.strictEqual(normalizarUbicacion(null), null);
  assert.strictEqual(normalizarUbicacion('37.6,-1.6'), null, 'una cadena no es un punto');
  console.log('OK · normalizador: válido se conserva · rangos y null island fuera');
}

// ── 2 · enlace del mapa: pin > dirección > nada ─────────────────────────────────
{
  const conPin = enlaceMapa({ direccion: 'Calle Mayor 14', ubicacion: PIN });
  assert.ok(conPin.includes('37.6712,-1.6987'), 'con pin el enlace abre el punto: ' + conPin);
  const sinPin = enlaceMapa({ direccion: 'Calle Mayor 14, 3ºB' });
  assert.ok(sinPin.startsWith('https://www.google.com/maps/search/?api=1&query='),
    'sin pin busca la dirección: ' + sinPin);
  assert.ok(sinPin.includes('Calle%20Mayor%2014'), 'la dirección viaja codificada');
  assert.strictEqual(enlaceMapa({}), null, 'sin punto ni dirección no hay enlace');
  assert.strictEqual(enlaceMapa({ direccion: 'Casa' }), null, 'cuatro letras no son un destino');
  console.log('OK · enlace: pin exacto · dirección codificada · nada → null');
}

// ── sandbox del bundle (DOM mínimo, con nodos por id) ────────────────────────────
function nodo(valor) {
  const e = {
    value: valor === undefined ? '' : valor,
    innerHTML: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {},
    setAttribute() {}, getAttribute: () => null, focus() {}, blur() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    insertAdjacentHTML() {}, scrollIntoView() {}
  };
  // esc() del runtime NO usa replace: asigna textContent y lee innerHTML. Un stub con
  // textContent plano devuelve cadena vacía y hunde las aserciones sin que el código falle.
  Object.defineProperty(e, 'textContent', {
    get() { return this._txt || ''; },
    set(v) { this._txt = String(v); this.innerHTML = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  });
  return e;
}
function cargarBundle(config, valores) {
  const html = generateStaticHTML(CARTA, config, {});
  const js = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'carta-inline.js' }),
    'el JS inline del template no compila (revisa escapes del template-literal)');

  const nodos = {
    'cliente-nombre': nodo('Ana'),
    'cliente-direccion': nodo(valores && valores.direccion),
    'cliente-telefono': nodo(valores && valores.telefono),
    'cliente-hora': nodo(''),
    'cart-footer': nodo(''),
    'cart-items': nodo('')
  };
  const sb = {
    console,
    document: {
      getElementById: (id) => nodos[id] || nodo(''),
      querySelector: () => nodo(''),
      querySelectorAll: () => [],
      createElement: () => nodo(''),
      addEventListener() {}, body: nodo(''), documentElement: nodo('')
    },
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      language: 'es',
      geolocation: { getCurrentPosition() {} }
    },
    location: { href: 'https://enki-ai.online/a/rapitvapers/', search: '', hash: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    encodeURIComponent, decodeURIComponent,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    alert() {}, confirm: () => true, prompt: () => null
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  try { new vm.Script(js, { filename: 'carta-inline.js' }).runInContext(sb); } catch (_) { /* DOM parcial */ }
  new vm.Script(`
    globalThis.__probe = {
      setCart: function (c) { cart = c; },
      setModo: function (m) { _modoConsumo = m; },
      setGeo: function (lat, lng) { _geoUbicacion = { lat: lat, lng: lng }; },
      modo: function () { return _pedModo(); },
      validar: function () { return _validarEntrega(); },
      msg: function () { return buildOrderMsg(); },
      p1: function () { return buildP1Line(); },
      mapa: function () { return _pedMapa(); },
      cerrar: function (n) { _cerrarPedido(n); return document.getElementById('cart-items').innerHTML; },
      pinta: function () { cart = [{ _id: 1, id: 'vozol-neon-1000-vzbull', nombre: 'Vozol Neon 1000 VZ Bull', qty: 1, precio: 3.9, detalle: '' }]; try { updateCart(); } catch (e) { return 'ERROR: ' + e.message; } return document.getElementById('cart-footer').innerHTML; }
    };
  `, { filename: 'carta-probe.js' }).runInContext(sb);
  return sb.__probe;
}

// ── 3 · la carta: botón, #P1 y parser real ──────────────────────────────────────
{
  const probe = cargarBundle(CONFIG, { direccion: 'Calle Mayor 14, 3ºB', telefono: '684062224' });
  const html = probe.pinta();
  assert.ok(/id="btn-ubicacion"/.test(html), 'el botón de ubicación debe pintarse en domicilio');
  assert.ok(/pedirUbicacion\(\)/.test(html), 'el botón debe llamar a pedirUbicacion()');
  assert.ok(/ubicaci[oó]n exacta/i.test(html), 'el botón debe decir qué hace');

  probe.setModo('domicilio');
  probe.setCart([{ _id: 1, id: 'vozol-neon-1000-vzbull', nombre: 'Vozol Neon 1000 VZ Bull', qty: 1, precio: 3.9, detalle: '' }]);
  probe.setGeo(PIN.lat, PIN.lng);
  assert.strictEqual(probe.validar(), true, 'el pin no es obligatorio: con dirección y teléfono se envía');

  const msg = probe.msg();
  const parsed = parsearPedido(msg);
  assert.strictEqual(parsed.ok, true, 'el parser debe entender el mensaje: ' + JSON.stringify(parsed));
  assert.deepStrictEqual(parsed.ubicacion_entrega, PIN, 'el pin viaja en el #P1 y el parser lo lee');

  // Sin pin, el pedido sale igual: la dirección manda.
  const sinPin = cargarBundle(CONFIG, { direccion: 'Calle Mayor 14, 3ºB', telefono: '684062224' });
  sinPin.setModo('domicilio');
  sinPin.setCart([{ _id: 1, id: 'vozol-neon-1000-vzbull', nombre: 'Vozol Neon 1000 VZ Bull', qty: 1, precio: 3.9, detalle: '' }]);
  const parsed2 = parsearPedido(sinPin.msg());
  assert.strictEqual(parsed2.ok, true, 'sin pin el pedido sigue siendo válido');
  assert.strictEqual(parsed2.ubicacion_entrega, null, 'sin pin no hay punto inventado');
  assert.strictEqual(parsed2.direccion_entrega, 'Calle Mayor 14, 3ºB', 'la dirección sigue viajando');

  // El mapa que ve el cliente antes de enviar: con pin, el punto.
  const mapa = sinPin.mapa();
  assert.ok(mapa.includes('Calle%20Mayor%2014'), 'sin pin el enlace es la dirección: ' + mapa);

  // La CONFIRMACIÓN también dice a dónde va (destino tomado ANTES de vaciar el carrito).
  const confirmacion = sinPin.cerrar('Ana');
  assert.ok(/Te lo llevamos a/.test(confirmacion), 'a domicilio la confirmación no manda a la tienda: ' + confirmacion);
  assert.ok(confirmacion.includes('Calle Mayor 14, 3ºB'), 'la confirmación lleva la dirección');
  assert.ok(/Ver el punto en el mapa/.test(confirmacion), 'y el enlace que el cliente puede abrir');
  console.log('OK · carta: botón · pin en #P1 · parser lo lee · sin pin no frena');
}

// ── 4 · la PUERTA de pedidos ────────────────────────────────────────────────────
function moduloPedidos() {
  const mod = new PedidosModule();
  mod.logger = { info() {}, warn() {}, error() {}, debug() {} };
  mod.metrics = { increment() {}, gauge() {}, timing() {} };
  mod.eventBus = { publish: async () => {}, subscribe() {} };
  mod._estadoServicio = async () => ({ abierto: true });
  return mod;
}
function pedidoBase(extra) {
  return {
    project_slug: 'rapitvapers',
    items: [{ cantidad: 1, descripcion: 'Vozol Neon 1000 VZ Bull', producto_id: 'vozol-neon-1000-vzbull', precio_unitario_centimos: 390 }],
    total_centimos: 390,
    canal_origen: 'web',
    cliente_nombre: 'Ana',
    cliente_telefono: '684062224',
    ...extra
  };
}

async function puerta() {
  const mod = moduloPedidos();

  // Con pin: se guarda y el enlace abre el punto.
  const conPin = await mod.handleCreatePedidoTienda(pedidoBase({
    modo_consumo: 'domicilio', direccion_entrega: 'Calle Mayor 14, 3ºB', ubicacion: PIN
  }));
  assert.strictEqual(conPin.status, 201, 'domicilio con pin debe nacer: ' + JSON.stringify(conPin));
  assert.deepStrictEqual(conPin.data.ubicacion_entrega, PIN, 'el pin se guarda normalizado');
  assert.ok(conPin.data.mapa_entrega.includes('37.6712'), 'el enlace del reparto usa el PUNTO: ' + conPin.data.mapa_entrega);

  // Pin basura: no tumba el pedido; cae a la dirección (el cliente no pierde su pedido
  // por un GPS que mandó null island).
  const mod2 = moduloPedidos();
  const basura = await mod2.handleCreatePedidoTienda(pedidoBase({
    modo_consumo: 'domicilio', direccion_entrega: 'Calle Mayor 14, 3ºB', ubicacion: { lat: 0, lng: 0 }
  }));
  assert.strictEqual(basura.status, 201, 'un pin inválido no puede tumbar el pedido');
  assert.strictEqual(basura.data.ubicacion_entrega, null, 'null island se descarta');
  assert.ok(basura.data.mapa_entrega.includes('Calle%20Mayor'), 'el enlace cae a la dirección');

  // Pin en 'recoger': se descarta (un punto no sirve si el cliente pasa a por él).
  const mod3 = moduloPedidos();
  const recoger = await mod3.handleCreatePedidoTienda(pedidoBase({
    modo_consumo: 'recoger', ubicacion: PIN
  }));
  assert.strictEqual(recoger.status, 201, 'recoger con pin sigue naciendo');
  assert.strictEqual(recoger.data.ubicacion_entrega, null, 'en recoger el pin no aplica');
  assert.strictEqual(recoger.data.mapa_entrega, null, 'en recoger no hay mapa de entrega');

  console.log('OK · puerta: pin guardado · pin basura cae a dirección · pin en recoger descartado');
}

// ── 5 · aviso al repartidor: destino + mapa ─────────────────────────────────────
function avisoStaff() {
  const n = new NotificadorPedidos();
  n.logger = { info() {}, warn() {}, error() {} };
  n.metrics = { increment() {} };
  const texto = n._formatPedidoMessage({ project_slug: 'rapitvapers' }, {
    cliente_nombre: 'Ana',
    items: [{ cantidad: 1, descripcion: 'Vozol Neon 1000 VZ Bull', precio_total_centimos: 390 }],
    total_centimos: 390,
    direccion_entrega: 'Calle Mayor 14, 3ºB',
    mapa_entrega: 'https://www.google.com/maps/search/?api=1&query=37.6712,-1.6987'
  });
  assert.ok(texto.includes('🛵 Entrega: Calle Mayor 14, 3ºB'), 'el staff debe ver el destino: ' + texto);
  assert.ok(texto.includes('Mapa: https://www.google.com/maps/'), 'el staff debe poder abrir el punto');
  console.log('OK · aviso al staff: destino y enlace del mapa');
}

puerta()
  .then(avisoStaff)
  .then(() => console.log('entrega-ubicacion: 5/5 OK'))
  .catch(err => { console.error('FAIL ·', err.message); process.exit(1); });
