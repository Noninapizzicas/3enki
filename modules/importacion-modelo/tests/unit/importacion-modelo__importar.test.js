'use strict';
const assert = require('assert');
const ImportacionModeloReflejo = require('../../index.js');

// Stubs de la base (ModuloHibridoReflejo -> BaseModule)
const logger = { info() {}, error() {}, warn() {} };
const metrics = { increment() {} };

// Bus stub que simula RPC request/response: al publicar un .request, invoca el
// handler registrado y publica la .response correlada con el mismo request_id.
// Los eventos fire-and-forget (sin handler) se capturan en `emitidos`.
function crearBus(handlers) {
  const subs = {};
  const emitidos = [];
  const bus = {
    emitidos,
    publish(ev, data) {
      const h = handlers[ev];
      if (h) {
        const resp = h(data);
        const respEv = ev.replace(/\.request$/, '.response');
        const cb = subs[respEv];
        if (cb) cb({ data: { request_id: data.request_id, ...resp } });
      } else {
        emitidos.push({ ev, data });
      }
    },
    subscribe(ev, cb) { subs[ev] = cb; return () => { delete subs[ev]; }; }
  };
  return bus;
}

function instanciar(descargador, handlers) {
  const mod = new ImportacionModeloReflejo();
  mod.logger = logger;
  mod.metrics = metrics;
  mod.eventBus = crearBus(handlers || {});
  if (descargador) mod.registrarDescargador(descargador);
  return mod;
}

const casos = [];
function caso(nombre, fn) { casos.push({ name: nombre, fn }); }

// --- importar: flujo completo (descarga .3mf + lee + registra) ---
caso('importar .3mf -> descarga, lee metadatos y registra en el catalogo', async () => {
  const mod = instanciar(
    { descargar: async (url) => ({ archivo: 'pieza.3mf', formato: '3mf' }) },
    {
      'adaptador-slicing.leer_3mf.request': () => ({ status: 200, data: { metadatos: { nombre: 'Pieza', material: 'PLA' } } }),
      'catalogo.registrar.request': (d) => ({ status: 201, data: { modelo: { id: 'm1', nombre: d.nombre, archivo3mf: d.archivo3mf, origen: d.origen } } })
    }
  );
  const r = await mod._importar({ project_id: 'p1', url: 'https://printables.com/m/1', nombre: 'Pieza', origen: 'printables' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.importada, true);
  assert.strictEqual(r.data.modelo.id, 'm1');
  assert.strictEqual(r.data.modelo.archivo3mf, 'pieza.3mf');
  const importada = mod.eventBus.emitidos.find(e => e.ev === 'importacion.importada');
  assert.ok(importada && importada.data.modelo_id === 'm1');
});

// --- importar: url requerida ---
caso('importar sin url -> 400 + par de fallo url_requerida', async () => {
  const mod = instanciar({ descargar: async () => ({ archivo: 'x.3mf' }) });
  const r = await mod._importar({ project_id: 'p1', url: '   ' });
  assert.strictEqual(r.status, 400);
  const failed = mod.eventBus.emitidos.find(e => e.ev === 'importacion.importar.failed');
  assert.ok(failed && failed.data.motivo === 'url_requerida');
});

// --- importar: descargador no cableado ---
caso('importar sin descargador -> 503 + par de fallo descargador_no_configurado', async () => {
  const mod = instanciar(null);
  const r = await mod._importar({ project_id: 'p1', url: 'https://printables.com/m/1' });
  assert.strictEqual(r.status, 503);
  const failed = mod.eventBus.emitidos.find(e => e.ev === 'importacion.importar.failed');
  assert.ok(failed && failed.data.motivo === 'descargador_no_configurado');
});

// --- importar: descarga falla ---
caso('descargador lanza -> 502 + par de fallo descarga_fallida', async () => {
  const mod = instanciar({ descargar: async () => { throw new Error('red caida'); } });
  const r = await mod._importar({ project_id: 'p1', url: 'https://printables.com/m/1' });
  assert.strictEqual(r.status, 502);
  const failed = mod.eventBus.emitidos.find(e => e.ev === 'importacion.importar.failed');
  assert.ok(failed && failed.data.motivo === 'descarga_fallida');
});

// --- importar: origen .stl -> falta el .3mf (invariante 5, no se inventa) ---
caso('importar .stl -> 422 + par de fallo falta_3mf', async () => {
  const mod = instanciar({ descargar: async () => ({ archivo: 'pieza.stl', formato: 'stl' }) });
  const r = await mod._importar({ project_id: 'p1', url: 'https://cults3d.com/m/1' });
  assert.strictEqual(r.status, 422);
  const failed = mod.eventBus.emitidos.find(e => e.ev === 'importacion.importar.failed');
  assert.ok(failed && failed.data.motivo === 'falta_3mf');
});

// --- importar: registro falla en el catalogo ---
caso('catalogo rechaza -> 502 + par de fallo registro_fallido', async () => {
  const mod = instanciar(
    { descargar: async () => ({ archivo: 'pieza.3mf', formato: '3mf' }) },
    {
      'adaptador-slicing.leer_3mf.request': () => ({ status: 200, data: { metadatos: { nombre: 'Pieza' } } }),
      'catalogo.registrar.request': () => ({ status: 409, data: { error: 'ALREADY_EXISTS', message: 'duplicado' } })
    }
  );
  const r = await mod._importar({ project_id: 'p1', url: 'https://makerworld.com/m/1' });
  assert.strictEqual(r.status, 502);
  const failed = mod.eventBus.emitidos.find(e => e.ev === 'importacion.importar.failed');
  assert.ok(failed && failed.data.motivo === 'registro_fallido');
});

// --- _buscar: delega a busqueda-repositorios ---
caso('_buscar delega a busqueda-repositorios y devuelve resultados', async () => {
  const mod = instanciar(null, {
    'busqueda.buscar.request': () => ({ status: 200, data: { resultados: [{ id: 'r1', nombre: 'Pieza', repositorio: 'printables' }] } })
  });
  const r = await mod._buscar({ project_id: 'p1', query: 'engranaje' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.total, 1);
  assert.strictEqual(r.data.resultados[0].repositorio, 'printables');
});

// --- _buscar: query requerida ---
caso('_buscar sin query -> 400', async () => {
  const mod = instanciar(null);
  const r = await mod._buscar({ project_id: 'p1', query: '' });
  assert.strictEqual(r.status, 400);
});

// --- esqueleto: name/version/extends/handlers ---
caso('esqueleto: name/version/extends/handlers', () => {
  const mod = instanciar(null);
  assert.strictEqual(mod.name, 'importacion-modelo');
  assert.strictEqual(mod.version, 'reflejo-0.1.0');
  assert.ok(mod instanceof require('../../_shared/modulo-hibrido-reflejo'));
  assert.strictEqual(typeof mod.onImportarRequest, 'function');
  assert.strictEqual(typeof mod._atender, 'function');
  assert.strictEqual(typeof mod._importar, 'function');
  assert.strictEqual(typeof mod._buscar, 'function');
});

(async () => {
  let ok = 0;
  for (const c of casos) {
    try { await c.fn(); ok++; console.log(`  ok  ${c.name}`); }
    catch (e) { console.error(`FAIL ${c.name}\n  ${e.message}`); process.exitCode = 1; }
  }
  console.log(`\nimportacion-modelo: ${ok}/${casos.length} OK`);
  process.exit(process.exitCode || 0);
})();
