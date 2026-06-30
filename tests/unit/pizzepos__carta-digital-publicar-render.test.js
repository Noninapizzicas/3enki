/**
 * FRENO de render en PUBLICAR (carta-digital) — fix del falso positivo 'imagenes_rotas'.
 *
 * El verificador-visual renderiza el HTML SUELTO (Chromium headless, sin servidor): las
 * `<img src="img/...">` del bundle (relativas a /shop/<slug>/, las sirve Caddy en deploy) no
 * se pueden bajar ahí → 'imagenes_rotas' → 422 que tumbaba TODO publish con imágenes.
 * Fix (v2.21.0): _publicarBundle verifica contra un HTML con las imágenes INLINE (data: URI).
 *
 * Verificado en vivo (nonina, 2026-06-30): publish daba 422 'imagenes_rotas' aunque las 44
 * imágenes copiaban bien. Este test fija que la verificación use imágenes inline.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const CartaDigitalModule = require('../../modules/pizzepos/carta-digital/index.js');

const CARTA = {
  meta: { id: 'carta_1' },
  categorias: [{ id: 'pizzas', nombre: 'Pizzas', orden: 1, activa: true }],
  productos: [{ id: 'p1', nombre: 'Samba', precio: 9.5, categoria_id: 'pizzas' }]
};
const MARCA = { esencia: { nombre: 'Nonina' }, visual: { colores: { primario: '#f59e0b' } } };
// El producto tiene imagen de storage (la ruta que rompía el freno).
const CONTENIDO = { p1: { imagenes: [{ id: 'i1', url: '/pizzepos/contenido/imagenes/p1.jpg', principal: true }] } };

// Bus mock parametrizable por el veredicto del render.
function makeBus(captura, renderVeredicto) {
  const handlers = new Map();
  const emit = (ev, p) => { const fns = handlers.get(ev); if (fns) for (const fn of [...fns]) setImmediate(() => fn({ data: p })); };
  return {
    subscribe(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, new Set()); handlers.get(ev).add(fn); return () => {}; },
    async publish(ev, payload) {
      const rid = payload.request_id;
      const ok = (e, data) => emit(e, { request_id: rid, status: 200, data });
      if (ev === 'carta.get.request') ok('carta.get.response', CARTA);
      else if (ev === 'carta.list.request') ok('carta.list.response', [{ id: 'carta_1', estado: 'en_servicio' }]);
      else if (ev === 'carta-marketing.get_perfil.request') ok('carta-marketing.get_perfil.response', MARCA);
      else if (ev === 'contenido.get.request') ok('contenido.get.response', CONTENIDO);
      else if (ev === 'fs.read.request') emit('fs.read.response', { request_id: rid, content: 'QUJD', encoding: 'base64' });
      else if (ev === 'fs.copy.request') emit('fs.copy.response', { request_id: rid, status: 200 });
      else if (ev === 'fs.write.request') emit('fs.write.response', { request_id: rid, status: 200 });
      else if (ev === 'render.verificar.request') {
        captura.html = payload.html;                         // ← lo que MIRA el verificador
        emit('render.verificar.response', { request_id: rid, ...renderVeredicto });
      }
    }
  };
}

async function instanciar(captura, renderVeredicto) {
  const m = new CartaDigitalModule();
  await m.onLoad({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    eventBus: makeBus(captura, renderVeredicto),
    metrics: { increment() {} },
    uiHandler: { register() {} }
  });
  return m;
}

test('publicar con imágenes NO da falso 422: el verificador recibe el HTML con imágenes inline', async () => {
  const captura = {};
  const m = await instanciar(captura, { verificado: true, ok: true, motivos: [] });
  const r = await m._publicarBundle('proj-1', 'nonina');

  assert.strictEqual(r.status, 200, 'el publish NO se bloquea por el falso imagenes_rotas');
  assert.strictEqual(r.data.imagenes_copiadas, 1, 'la imagen del producto se copia al bundle');
  assert.ok(captura.html, 'el verificador recibió un HTML');
  assert.ok(captura.html.includes('data:image'), 'la verificación usa imágenes INLINE (data: URI)');
  assert.ok(!captura.html.includes('"/pizzepos/contenido/imagenes/'), 'no quedan rutas de storage en lo verificado');
});

test('si el render dice roto DE VERDAD (verificado && !ok), el publish sí frena con 422', async () => {
  const captura = {};
  const m = await instanciar(captura, { verificado: true, ok: false, motivos: ['overflow_horizontal'] });
  const r = await m._publicarBundle('proj-1', 'nonina');
  assert.strictEqual(r.status, 422, 'un render roto REAL sí frena');
});

test('sin navegador (verificado:false) el publish sale igual — el freno es best-effort', async () => {
  const captura = {};
  const m = await instanciar(captura, { verificado: false, ok: true, motivos: [] });
  const r = await m._publicarBundle('proj-1', 'nonina');
  assert.strictEqual(r.status, 200, 'sin órgano/navegador no se vuelve dependencia dura del deploy');
});
