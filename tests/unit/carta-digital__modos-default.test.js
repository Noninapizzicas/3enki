/**
 * FRENO: un modo de consumo NUEVO no se publica en la carta de quien no lo ha pedido.
 *
 * Lo que pasó (7-nov-2026, the-pirate): el PR #930 añadió 'domicilio' a MODOS_VALIDOS y
 * dejó MODOS_VALIDOS como DEFAULT cuando el proyecto no tiene `modos_consumo` en su
 * config. Resultado: la pizzería —que nunca pidió reparto— publicó un botón «A domicilio»
 * en su carta. El default tiene que ser el HISTÓRICO (mesa/recoger/llevar); un modo nuevo
 * entra cuando el negocio lo pide como DATO, nunca por existir en el sistema.
 *
 * El test viejo (carta-digital__entrega-domicilio) no lo cazó porque llamaba a
 * generateStaticHTML directamente: probaba el default de la PLANTILLA, y el que se
 * publica de verdad es el tplConfig que monta el módulo (index.js) — dos sitios que
 * pueden divergir. Este test mira el CONFIG que queda HORNEADO en el bundle publicado,
 * que es el que lee el navegador del cliente.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const CartaDigitalModule = require('../../modules/pizzepos/carta-digital/index.js');

const CARTA = {
  meta: { id: 'carta_1' },
  categorias: [{ id: 'pizzas', nombre: 'Pizzas', orden: 1, activa: true }],
  productos: [{ id: 'p1', nombre: 'Milonga', precio: 9.5, categoria_id: 'pizzas' }]
};
const MARCA = { esencia: { nombre: 'The Pirate' }, visual: { colores: { primario: '#f59e0b' } } };

// Bus mock: el config que devuelve fs.read es el que decide los modos publicados.
function makeBus(captura, config) {
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
      else if (ev === 'contenido.get.request') ok('contenido.get.response', {});
      else if (ev === 'fs.read.request') {
        // _leerConfig parsea r.content en claro (no decodifica base64) → devolvemos el JSON tal cual.
        emit('fs.read.response', { request_id: rid, content: JSON.stringify(config), encoding: 'utf-8' });
      }
      else if (ev === 'fs.copy.request') emit('fs.copy.response', { request_id: rid, status: 200 });
      else if (ev === 'fs.write.request') emit('fs.write.response', { request_id: rid, status: 200 });
      else if (ev === 'render.verificar.request') {
        captura.html = payload.html;
        emit('render.verificar.response', { request_id: rid, verificado: true, ok: true, motivos: [] });
      }
    }
  };
}

// El bundle lleva el CONFIG horneado: `const CONFIG = {...};`. Eso es lo que lee el cliente.
function configHorneado(html) {
  const m = html.match(/const CONFIG = (\{[\s\S]*?\});/);
  assert.ok(m, 'el bundle debe hornear el CONFIG');
  return JSON.parse(m[1]);
}

async function publicarYCapturar(config) {
  const captura = {};
  const m = new CartaDigitalModule();
  await m.onLoad({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    eventBus: makeBus(captura, config),
    metrics: { increment() {} },
    uiHandler: { register() {} }
  });
  const r = await m._publicarBundle('proj-1', 'the-pirate');
  return { r, html: captura.html || '' };
}

test('carta SIN modos_consumo: el default es el histórico — NO publica A domicilio', async () => {
  const config = { _version: '1.0', dominio_publico: null, opciones_visualizacion: { moneda: '€' } };
  const { r, html } = await publicarYCapturar(config);

  assert.strictEqual(r.status, 200, 'el publish debe salir bien');
  const cfg = configHorneado(html);
  assert.deepStrictEqual(cfg.modos_consumo, ['mesa', 'recoger', 'llevar'],
    'sin dato, la carta publica los tres históricos — un negocio que no pidió reparto no lo ofrece');
  assert.ok(!cfg.modos_consumo.includes('domicilio'), 'A domicilio NO se cuela por existir en el sistema');
});

test('carta CON modos_consumo: los modos los manda el DATO del proyecto', async () => {
  const config = {
    _version: '1.0', dominio_publico: null,
    opciones_visualizacion: { moneda: '€', modos_consumo: ['recoger', 'domicilio'] }
  };
  const { r, html } = await publicarYCapturar(config);

  assert.strictEqual(r.status, 200);
  const cfg = configHorneado(html);
  assert.deepStrictEqual(cfg.modos_consumo, ['recoger', 'domicilio'],
    'si el negocio pide reparto, se le publica — junto a Recoger y sin Mesa');
});
