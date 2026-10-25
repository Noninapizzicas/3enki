/**
 * Tests unitarios — carta-digital / estado de servicio en la PWA.
 *
 * El bundle es ESTÁTICO: el horario y la dirección no se hornean, se preguntan al abrir
 * (`/tienda/estado/<slug>`) y se pintan. Este test EJECUTA el runtime emitido (sin navegador)
 * con un stub de DOM y comprueba las DOS formas en que puede llegar la respuesta:
 *
 *   - PLANA  ... es la que sirve de verdad el gateway HTTP de tienda-api
 *                (curl /tienda/estado/the-pirate → {"abierto":false,…} sin envoltorio).
 *   - ENVUELTA ... {data:{…}}, la forma que asumía el código y que NUNCA llegaba del gateway.
 *
 * El bug que cierra (2026-10-25): el runtime exigía `d.data`, el gateway sirve plano, así que
 * `_servicio` se quedaba en null y el cliente no veía ni el banner de cerrado ni la dirección
 * de recogida — con el endpoint respondiendo 200.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { generateStaticHTML } = require('../../modules/pizzepos/carta-digital/static-template.js');

const CARTA = {
  categorias: [{ id: 'pizzas', nombre: 'Pizzas', orden: 1 }],
  productos: [{ id: 'p1', nombre: 'Bachata', categoria: 'pizzas', categoria_id: 'pizzas', precio: 9.5, ingredientes: [], alergenos: [] }],
  catalogo_ingredientes: [],
  alergenos_leyenda: []
};

const CONFIG = {
  nombre_negocio: 'The Pirate',
  moneda: '€',
  pedido_endpoint: '/tienda/pedido/the-pirate',
  estado_endpoint: '/tienda/estado/the-pirate'
};

// Estado REAL, tal cual lo devolvió el endpoint en vivo (plano, domingo 05:00 en Madrid).
const ESTADO_VIVO = {
  project_slug: 'the-pirate',
  zona_horaria: 'Europe/Madrid',
  franjas_hoy: ['18:00-23:30'],
  recogida: {
    direccion: 'Juan Carlo I, 49',
    ciudad: 'Lorca',
    maps_url: 'https://www.google.com/maps/search/?api=1&query=Juan+Carlo+I+49,+Lorca'
  },
  abierto: false,
  motivo: 'horario',
  motivo_texto: 'Fuera de horario',
  mensaje: 'Fuera de horario. Abrimos el 2026-10-25 a las 18:00.'
};

/** Extrae el runtime grande (el que lleva DATA/CONFIG) y lo corta antes del bootstrap. */
function runtimeJS() {
  const html = generateStaticHTML(CARTA, CONFIG, {});
  const bloques = html.match(/<script>[\s\S]*?<\/script>/g) || [];
  const grande = bloques.filter((b) => b.includes('const DATA =')).sort((a, b) => b.length - a.length)[0];
  assert.ok(grande, 'el render no trae el script con DATA');
  let js = grande.replace(/^<script>/, '').replace(/<\/script>$/, '');
  const corte = js.indexOf('\n// Init');
  assert.ok(corte > 0, 'no encuentro el bootstrap // Init para cortar');
  js = js.slice(0, corte);
  return js;
}

function makeEl() {
  const e = {
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    children: [],
    parentNode: null,
    innerHTML: '',
    value: '',
    offsetParent: {},
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    insertBefore() {},
    appendChild() {},
    removeChild() {},
    focus() {},
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; }
  };
  // esc() del runtime NO usa replace: crea un div, le mete textContent y lee innerHTML.
  // El stub tiene que hacer lo mismo o esc() devuelve '' y todo nombre/dirección sale en blanco.
  Object.defineProperty(e, 'textContent', {
    get() { return this._txt || ''; },
    set(v) {
      this._txt = String(v);
      this.innerHTML = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  });
  return e;
}

/**
 * Ejecuta el runtime con un stub de DOM y un fetch que devuelve `payload`.
 * Devuelve el estado interno + helpers puros del runtime.
 */
async function ejecutarRuntime(payload) {
  const js = runtimeJS();
  const els = {};
  const document = {
    getElementById(id) { if (!els[id]) els[id] = makeEl(); return els[id]; },
    createElement() { return makeEl(); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    body: makeEl(),
    documentElement: makeEl()
  };
  const window = { addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  const location = { origin: 'https://enki-ai.online', pathname: '/a/the-pirate/', href: '', search: '' };
  const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const fetchStub = () => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
  const navigator = { serviceWorker: undefined };
  const console_ = { log() {}, warn() {}, error() {} };

  const cuerpo = js + '\n;return { cargar: cargarEstadoServicio, estado: function(){ return _servicio; },' +
    ' cerrado: servicioCerrado, mensaje: mensajeServicio, recogida: recogidaHTML };';

  // eslint-disable-next-line no-new-func
  const api = new Function('document', 'window', 'location', 'localStorage', 'fetch', 'navigator', 'console', cuerpo)(
    document, window, location, localStorage, fetchStub, navigator, console_
  );

  api.cargar();
  await new Promise((r) => setTimeout(r, 0)); // deja resolver la promesa del fetch
  return api;
}

test('estado de servicio — el gateway sirve PLANO y la PWA lo pinta (banner + dirección)', async () => {
  const api = await ejecutarRuntime(ESTADO_VIVO);

  const st = api.estado();
  assert.ok(st, '_servicio sigue null con la respuesta plana del gateway');
  assert.strictEqual(st.abierto, false, 'abierto debe leerse del cuerpo plano');
  assert.strictEqual(api.cerrado(), true, 'servicioCerrado() debe dar true');
  assert.ok(api.mensaje().includes('2026-10-25 a las 18:00'), 'el mensaje de cierre debe llegar al cliente');

  const dir = api.recogida();
  assert.ok(dir.includes('Juan Carlo I, 49'), 'la dirección real debe pintarse en la confirmación');
  assert.ok(dir.includes('Lorca'), 'la ciudad debe acompañar a la dirección');
  assert.ok(dir.includes('Cómo llegar'), 'el enlace al mapa debe pintarse');
});

test('estado de servicio — la forma ENVUELTA {data:{…}} sigue funcionando', async () => {
  const api = await ejecutarRuntime({ status: 200, data: ESTADO_VIVO });

  assert.ok(api.estado(), '_servicio null con respuesta envuelta');
  assert.strictEqual(api.estado().abierto, false);
  assert.ok(api.recogida().includes('Juan Carlo I, 49'));
});

test('estado de servicio — respuesta basura no rompe la carta (se comporta abierto)', async () => {
  const api = await ejecutarRuntime({ hola: 'mundo' });

  assert.strictEqual(api.estado(), null, 'una respuesta sin "abierto" no debe tomarse por estado');
  assert.strictEqual(api.cerrado(), false, 'sin estado la carta sigue como siempre: abierta');
  assert.strictEqual(api.recogida(), '', 'sin recogida no se pinta dirección inventada');
});
