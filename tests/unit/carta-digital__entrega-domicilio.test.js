'use strict';
/**
 * carta-digital · ENTREGA A DOMICILIO
 *
 * Lo que se prueba, con el código REAL:
 *   1. La carta pinta SOLO los modos que el negocio ofrece (dato `modos_consumo`).
 *      Una tienda sin mesas no puede pintar el botón Mesa — un pedido de mesa en un
 *      local sin plano nace en el plano y su cuenta no la cierra nadie (el círculo
 *      que vio el dueño). Y sin la clave, el default histórico no cambia.
 *   2. El JS inline del bundle COMPILA (editar el template-literal sin romperlo).
 *   3. El mensaje que compone la carta lleva la dirección en el #P1 (autoritativo) y
 *      el parser de producción la lee: el destino no depende del texto editable.
 *   4. El navegador no envía a domicilio sin destino ni teléfono.
 *   5. La PUERTA (pedidos) rechaza un domicilio sin dirección o sin teléfono: no nace
 *      una cuenta que nadie sabe dónde llevar.
 */
const assert = require('assert');
const vm = require('vm');

const { generateStaticHTML } = require('../../modules/pizzepos/carta-digital/static-template.js');
const { parsearPedido } = require('../../modules/_shared/pedido-mensaje-parser.js');
const PedidosModule = require('../../modules/pizzepos/pedidos/index.js');
const CuentasModule = require('../../modules/pizzepos/cuentas/index.js');

const CARTA = {
  nombre_negocio: 'Rapitvapers',
  categorias: [{ id: 'vapeo', nombre: 'Vapeo' }],
  productos: [
    { id: 'vozol-neon-1000-vzbull', nombre: 'Vozol Neon 1000 VZ Bull', precio: 3.9, categoria: 'vapeo' }
  ]
};
const CONFIG_BASE = {
  nombre_negocio: 'Rapitvapers',
  project_slug: 'rapitvapers',
  pedido_endpoint: '/tienda/pedido/rapitvapers',
  pago_online: false,
  whatsapp_telefono: '',
  moneda: '€'
};

// ── 1 · modos: solo los que el negocio ofrece ─────────────────────────────────────
{
  const probe = cargarBundle({ ...CONFIG_BASE, modos_consumo: ['recoger', 'domicilio'] }, {});
  const html = probe.pinta();
  assert.ok(/data-modo="domicilio"/.test(html), 'debe ofrecer A domicilio · ' + html.slice(0, 200));
  assert.ok(/data-modo="recoger"/.test(html), 'debe ofrecer Recoger');
  assert.ok(!/data-modo="mesa"/.test(html), 'NO debe ofrecer Mesa si el negocio no la ofrece');
  assert.ok(!/data-modo="llevar"/.test(html), 'NO debe ofrecer Llevar si el negocio no lo ofrece');
  assert.ok(/id="cliente-direccion"/.test(html), 'debe existir el campo de dirección');
  assert.ok(/id="cliente-telefono"/.test(html), 'debe existir el campo de teléfono');
  console.log('OK · modos: recoger+domicilio pintados, mesa fuera');
}

// ── 2 · sin la clave, el default histórico NO cambia (cero regresión) ─────────────
{
  const html = cargarBundle(CONFIG_BASE, {}).pinta();
  for (const m of ['mesa', 'recoger', 'llevar']) {
    assert.ok(new RegExp('data-modo="' + m + '"').test(html), 'default histórico debe mantener ' + m);
  }
  assert.ok(!/data-modo="domicilio"/.test(html), 'el default NO ofrece domicilio sin pedirlo');
  console.log('OK · default histórico intacto (mesa/recoger/llevar)');
}

// ── sandbox del bundle (DOM mínimo, con nodos por id) ────────────────────────────
function nodo(valor) {
  return {
    value: valor === undefined ? '' : valor,
    innerHTML: '', textContent: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {},
    setAttribute() {}, getAttribute: () => null, focus() {}, blur() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    insertAdjacentHTML() {}, scrollIntoView() {}
  };
}
function cargarBundle(config, valores) {
  const html = generateStaticHTML(CARTA, config, {});
  const js = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'carta-inline.js' }),
    'el JS inline del template no compila');

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
    navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', language: 'es' },
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
      modo: function () { return _pedModo(); },
      validar: function () { return _validarEntrega(); },
      msg: function () { return buildOrderMsg(); },
      p1: function () { return buildP1Line(); },
      pinta: function () { cart = [{ _id: 1, id: 'vozol-neon-1000-vzbull', nombre: 'Vozol Neon 1000 VZ Bull', qty: 1, precio: 3.9, detalle: '' }]; try { updateCart(); } catch (e) { return 'ERROR: ' + e.message; } return document.getElementById('cart-footer').innerHTML; }
    };
  `, { filename: 'carta-probe.js' }).runInContext(sb);
  return sb.__probe;
}

// ── 3 · mensaje + #P1 + parser real: el destino viaja autoritativo ───────────────
{
  const probe = cargarBundle({ ...CONFIG_BASE, modos_consumo: ['recoger', 'domicilio'] },
    { direccion: 'Calle Mayor 14, 3ºB', telefono: '684 06 22 24' });
  assert.ok(probe, 'el bundle debe cargarse para sondearlo');
  probe.setCart([{ _id: 1, id: 'vozol-neon-1000-vzbull', nombre: 'Vozol Neon 1000 VZ Bull', qty: 1, precio: 3.9, detalle: '' }]);
  probe.setModo('domicilio');
  assert.strictEqual(probe.modo(), 'domicilio', 'el modo elegido debe persistir');
  assert.strictEqual(probe.validar(), true, 'con dirección y teléfono debe poder enviarse');

  const msg = probe.msg();
  assert.ok(/Entrega: Calle Mayor 14/.test(msg), 'el texto debe llevar la dirección en claro');
  assert.ok(/\n#P1 \S+/.test(msg), 'debe llevar la línea #P1');

  const parsed = parsearPedido(msg);
  assert.strictEqual(parsed.ok, true, 'el parser debe entenderlo: ' + JSON.stringify(parsed));
  assert.strictEqual(parsed.modo_consumo, 'domicilio', 'modo_consumo desde el #P1');
  assert.strictEqual(parsed.direccion_entrega, 'Calle Mayor 14, 3ºB', 'dirección desde el #P1');
  console.log('OK · #P1 → parser real: domicilio con dirección ' + JSON.stringify(parsed.direccion_entrega));
}

// ── 4 · el navegador frena sin destino / sin teléfono ───────────────────────────
{
  const sinDir = cargarBundle({ ...CONFIG_BASE, modos_consumo: ['domicilio'] }, { direccion: 'Casa', telefono: '684062224' });
  sinDir.setCart([]); sinDir.setModo('domicilio');
  assert.strictEqual(sinDir.validar(), false, 'una dirección de 4 letras no es un destino');

  const sinTel = cargarBundle({ ...CONFIG_BASE, modos_consumo: ['domicilio'] }, { direccion: 'Calle Mayor 14', telefono: '12' });
  sinTel.setModo('domicilio');
  assert.strictEqual(sinTel.validar(), false, 'sin teléfono válido no se envía');

  const ok = cargarBundle({ ...CONFIG_BASE, modos_consumo: ['domicilio'] }, { direccion: 'Calle Mayor 14', telefono: '684062224' });
  ok.setModo('domicilio');
  assert.strictEqual(ok.validar(), true, 'con destino y teléfono se envía');
  console.log('OK · puerta del navegador: dirección y teléfono exigidos');
}

// ── 5 · la PUERTA del servidor: no nace una entrega sin destino ─────────────────
async function puertaServidor() {
  const mod = new PedidosModule();
  mod.logger = { info() {}, warn() {}, error() {}, debug() {} };
  mod.metrics = { increment() {}, gauge() {}, timing() {} };
  const publicados = [];
  mod.eventBus = { publish: async (ev, payload) => { publicados.push({ ev, payload }); }, subscribe() {} };
  mod._estadoServicio = async () => ({ abierto: true });

  const base = {
    project_slug: 'rapitvapers',
    items: [{ cantidad: 1, descripcion: 'Vozol Neon 1000 VZ Bull', producto_id: 'vozol-neon-1000-vzbull', precio_unitario_centimos: 390 }],
    total_centimos: 390,
    canal_origen: 'web',
    cliente_nombre: 'Ana',
    modo_consumo: 'domicilio'
  };

  const sinDir = await mod.handleCreatePedidoTienda({ ...base, cliente_telefono: '684062224' });
  assert.strictEqual(sinDir.status, 400, 'domicilio sin dirección debe rechazarse');
  assert.strictEqual(sinDir.error.details.field, 'direccion_entrega');

  const sinTel = await mod.handleCreatePedidoTienda({ ...base, direccion_entrega: 'Calle Mayor 14, 3ºB' });
  assert.strictEqual(sinTel.status, 400, 'domicilio sin teléfono debe rechazarse');
  assert.strictEqual(sinTel.error.details.field, 'cliente_telefono');

  const ok = await mod.handleCreatePedidoTienda({
    ...base, direccion_entrega: 'Calle Mayor 14, 3ºB', cliente_telefono: '684062224'
  });
  assert.strictEqual(ok.status, 201, 'domicilio con destino y teléfono debe nacer: ' + JSON.stringify(ok));
  assert.strictEqual(ok.data.modo_consumo, 'domicilio');
  assert.strictEqual(ok.data.direccion_entrega, 'Calle Mayor 14, 3ºB');

  // La CUENTA no puede nacer huérfana: 'domicilio' se canoniza al canal 'llevar'.
  assert.strictEqual(CuentasModule.ALIAS_CANAL.domicilio, 'llevar',
    'domicilio debe tener canal con dueño (si no, nadie cierra la cuenta)');
  console.log('OK · puerta del servidor: sin dirección/teléfono 400 · con ambos 201 · alias a llevar');
}

puertaServidor()
  .then(() => console.log('carta-digital entrega-domicilio: 6/6 OK'))
  .catch(err => { console.error('FAIL ·', err.message); process.exit(1); });
