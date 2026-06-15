/**
 * Tests unitarios — pizzepos__carta-digital (PROYECTOR del canal digital, v2.0.0).
 *
 * No es híbrido: es JS clásico (gemelo de productos). Proyecta la carta pública al vuelo
 * bebiendo de tarifas (mapping, cacheado) + carta-manager + carta-marketing + contenido.
 * El mock del bus responde a carta.get / carta.list / carta-marketing.get_perfil /
 * contenido.get / fs.read.
 *
 * Ejecutar: node tests/unit/pizzepos__carta-digital.test.js
 */

'use strict';

const assert = require('assert');
const CartaDigitalModule = require('../../modules/pizzepos/carta-digital/index.js');

function makeBus(fixtures) {
  const handlers = new Map();
  const published = [];
  const emit = (event, payload) => {
    const fns = handlers.get(event);
    if (fns) for (const fn of [...fns]) setImmediate(() => fn({ data: payload }));
  };
  return {
    published,
    subscribe(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event)?.delete(fn);
    },
    // permite inyectar un evento (p.ej. tarifas.config.actualizada) al módulo
    inject(event, data) { const fns = handlers.get(event); if (fns) for (const fn of [...fns]) fn({ data }); },
    async publish(event, payload) {
      published.push([event, payload]);
      const rid = payload.request_id;
      const ok = (ev, data) => emit(ev, { request_id: rid, status: 200, data });
      if (event === 'carta.get.request') ok('carta.get.response', fixtures.carta);
      else if (event === 'carta.list.request') ok('carta.list.response', fixtures.lista || (fixtures.carta ? [{ id: fixtures.carta.meta.id, estado: 'en_servicio' }] : []));
      else if (event === 'carta-marketing.get_perfil.request') ok('carta-marketing.get_perfil.response', fixtures.marca);
      else if (event === 'contenido.get.request') ok('contenido.get.response', fixtures.contenido || {});
      else if (event === 'fs.read.request') {
        emit('fs.read.response', fixtures.config != null
          ? { request_id: rid, content: JSON.stringify(fixtures.config) }
          : { request_id: rid, error: { code: 'RESOURCE_NOT_FOUND' } });
      } else if (event === 'fs.write.request') emit('fs.write.response', { request_id: rid });
    }
  };
}

async function makeModulo(fixtures = {}) {
  const m = new CartaDigitalModule();
  const bus = makeBus(fixtures);
  await m.onLoad({ logger: { debug(){}, info(){}, warn(){}, error(){} }, eventBus: bus, metrics: { increment(){} }, uiHandler: { register(){} } });
  return { m, bus };
}

const PROJ = 'proj-1';
async function testAsync(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); if (process.env.STACK) console.error(e.stack); process.exit(1); }
}

const cartaFix = {
  meta: { id: 'carta_digital_1' },
  categorias: [{ id: 'pizzas', nombre: 'Pizzas', orden: 1, activa: true }, { id: 'off', nombre: 'Off', activa: false }],
  productos: [{ id: 'p1', nombre: 'Samba', precio: 9.5, categoria_id: 'pizzas', descripcion: 'desc carta' }]
};
const marcaFix = { esencia: { nombre: 'No ni ná', lema: 'Obvio' }, visual: { colores: { primario: '#4ade80' }, logo: '/logo.png' }, voz: { tono: ['irreverente'] } };

(async () => {
  console.log('pizzepos__carta-digital — PROYECTOR v2.0.0\n');

  await testAsync('proyecta la carta pública: branding (marca) + categorias + productos', async () => {
    const { m } = await makeModulo({ carta: cartaFix, marca: marcaFix });
    const r = await m.handleGetCartaPublica({ project_id: PROJ });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.branding.nombre, 'No ni ná', 'branding bebe de marca');
    assert.strictEqual(r.data.branding.colores.primario, '#4ade80');
    assert.strictEqual(r.data.categorias.length, 1, 'categoria inactiva fuera');
    assert.strictEqual(r.data.productos[0].nombre, 'Samba');
  });

  await testAsync('producto bebe imagen + descripcion de contenido (override de la carta)', async () => {
    const contenido = { p1: { imagenes: [{ id: 'i1', url: '/img/p1.jpg', principal: true }], descripcion: 'desc rica de contenido' } };
    const { m } = await makeModulo({ carta: cartaFix, marca: marcaFix, contenido });
    const r = await m.handleGetCartaPublica({ project_id: PROJ });
    const p = r.data.productos[0];
    assert.strictEqual(p.imagen, '/img/p1.jpg', 'imagen principal de contenido');
    assert.strictEqual(p.descripcion, 'desc rica de contenido', 'descripcion de contenido gana');
  });

  await testAsync('resuelve la carta del canal digital desde el mapping de tarifas', async () => {
    const { m, bus } = await makeModulo({ carta: cartaFix, marca: marcaFix });
    bus.inject('tarifas.config.actualizada', { project_id: PROJ, config: { general: 'carta_general', canales: { digital: 'carta_digital_especial' } } });
    await m.handleGetCartaPublica({ project_id: PROJ });
    const get = bus.published.find(([e]) => e === 'carta.get.request');
    assert.strictEqual(get[1].carta_id, 'carta_digital_especial', 'usa la carta del canal digital');
  });

  await testAsync('sin carta → 404', async () => {
    const { m } = await makeModulo({ carta: null, lista: [] });
    const r = await m.handleGetCartaPublica({ project_id: PROJ });
    assert.strictEqual(r.status, 404);
  });

  await testAsync('sin marca → branding null, la carta sigue proyectando', async () => {
    const { m } = await makeModulo({ carta: cartaFix, marca: null });
    const r = await m.handleGetCartaPublica({ project_id: PROJ });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.branding, null);
    assert.strictEqual(r.data.productos.length, 1);
  });

  await testAsync('update_config: solo guarda dominio/opciones (no branding)', async () => {
    const { m, bus } = await makeModulo({ config: { _version: '1.0', dominio_publico: null, opciones_visualizacion: {} } });
    const r = await m.handleUpdateConfig({ project_id: PROJ, campos: { dominio_publico: 'nonina.online', opciones_visualizacion: { tema: 'oscuro' }, branding: { nombre: 'HACK' } } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.dominio_publico, 'nonina.online');
    assert.strictEqual(r.data.opciones_visualizacion.tema, 'oscuro');
    assert.ok(!('branding' in r.data), 'branding NO se guarda en el config del canal');
    assert.ok(bus.published.some(([e]) => e === 'cartadigital.config.actualizada'));
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });
