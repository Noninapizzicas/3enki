'use strict';
const assert = require('assert');
const AdaptadorSlicingReflejo = require('../../index.js');

// Stubs de la base (ModuloHibridoReflejo -> BaseModule)
const logger = { info() {}, error() {}, warn() {} };
const metrics = { increment() {} };
const eventBus = { publish() {} };

function instanciar(slicer) {
  const mod = new AdaptadorSlicingReflejo();
  mod.logger = logger;
  mod.metrics = metrics;
  mod.eventBus = eventBus;
  if (slicer) mod.registrarSlicer(slicer);
  return mod;
}

const casos = [];
function caso(nombre, fn) { casos.push({ name: nombre, fn }); }

// --- slicear: gcode valido ---
caso('slicear devuelve gcode validado listo para la cupula', async () => {
  const mod = instanciar({ slicear: async (a, p) => ({ gcode: ';GCODE\nG28\nG1 X10 Y10\n' }) });
  const r = await mod._slicear({ project_id: 'p1', modelo_id: 'm1', archivo3mf: 'pieza.3mf', perfil: 'sparkx_i7' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.gcode, ';GCODE\nG28\nG1 X10 Y10\n');
  assert.strictEqual(r.data.listo_para_cupula, true);
  assert.strictEqual(r.data.perfil, 'sparkx_i7');
  assert.ok(r.data.bytes > 0);
});

// --- slicear: archivo3mf requerido ---
caso('slicear sin archivo3mf -> 400 + par de fallo', async () => {
  let failed = null;
  const mod = instanciar({ slicear: async () => ({ gcode: 'x' }) });
  mod.eventBus = { publish: (ev, d) => { if (ev === 'adaptador-slicing.slicear.failed') failed = d; } };
  const r = await mod._slicear({ project_id: 'p1', archivo3mf: '   ' });
  assert.strictEqual(r.status, 400);
  assert.ok(failed && failed.motivo === 'archivo_3mf_requerido');
});

// --- slicear: slicer no cableado ---
caso('slicear sin slicer cableado -> 503 + par de fallo', async () => {
  let failed = null;
  const mod = instanciar(null);
  mod.eventBus = { publish: (ev, d) => { if (ev === 'adaptador-slicing.slicear.failed') failed = d; } };
  const r = await mod._slicear({ project_id: 'p1', archivo3mf: 'pieza.3mf' });
  assert.strictEqual(r.status, 503);
  assert.ok(failed && failed.motivo === 'slicer_no_configurado');
});

// --- slicear: slicer falla ---
caso('slicer lanza -> 502 + par de fallo slicer_fallo', async () => {
  let failed = null;
  const mod = instanciar({ slicear: async () => { throw new Error('CLI no responde'); } });
  mod.eventBus = { publish: (ev, d) => { if (ev === 'adaptador-slicing.slicear.failed') failed = d; } };
  const r = await mod._slicear({ project_id: 'p1', archivo3mf: 'pieza.3mf', perfil: 'sparkx_i7' });
  assert.strictEqual(r.status, 502);
  assert.ok(failed && failed.motivo === 'slicer_fallo');
});

// --- slicear: gcode vacio (invariante 7) ---
caso('gcode vacio -> 502 + par de fallo gcode_vacio', async () => {
  let failed = null;
  const mod = instanciar({ slicear: async () => ({ gcode: '   ' }) });
  mod.eventBus = { publish: (ev, d) => { if (ev === 'adaptador-slicing.slicear.failed') failed = d; } };
  const r = await mod._slicear({ project_id: 'p1', archivo3mf: 'pieza.3mf' });
  assert.strictEqual(r.status, 502);
  assert.ok(failed && failed.motivo === 'gcode_vacio');
});

// --- leer_3mf: con lector cableado ---
caso('leer_3mf con lector -> metadatos del .3mf', async () => {
  const mod = instanciar({ slicear: async () => ({}), leer3mf: async (a) => ({ metadatos: { nombre: 'Pieza', autor: 'yo', material: 'PLA' } }) });
  const r = await mod._leer3mf({ project_id: 'p1', archivo: 'pieza.3mf' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.metadatos.nombre, 'Pieza');
  assert.strictEqual(r.data.metadatos.material, 'PLA');
});

// --- leer_3mf: sin lector -> huecos desconocido (invariante 5) ---
caso('leer_3mf sin lector -> metadatos desconocido', async () => {
  const mod = instanciar(null);
  const r = await mod._leer3mf({ project_id: 'p1', archivo: 'pieza.3mf' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.metadatos.nombre, 'desconocido');
  assert.strictEqual(r.data.metadatos.autor, 'desconocido');
});

// --- leer_3mf: archivo requerido ---
caso('leer_3mf sin archivo -> 400', async () => {
  const mod = instanciar(null);
  const r = await mod._leer3mf({ project_id: 'p1', archivo: '' });
  assert.strictEqual(r.status, 400);
});

// --- esqueleto: name/version/extends/handlers ---
caso('esqueleto: name/version/extends/handlers', () => {
  const mod = instanciar(null);
  assert.strictEqual(mod.name, 'adaptador-slicing');
  assert.strictEqual(mod.version, 'reflejo-0.1.0');
  assert.ok(mod instanceof require('../../_shared/modulo-hibrido-reflejo'));
  assert.strictEqual(typeof mod.onSlicearRequest, 'function');
  assert.strictEqual(typeof mod.onLeer3mfRequest, 'function');
  assert.strictEqual(typeof mod._atender, 'function');
});

(async () => {
  let ok = 0;
  for (const c of casos) {
    try { await c.fn(); ok++; console.log(`  ok  ${c.name}`); }
    catch (e) { console.error(`FAIL ${c.name}\n  ${e.message}`); process.exitCode = 1; }
  }
  console.log(`\nadaptador-slicing: ${ok}/${casos.length} OK`);
  process.exit(process.exitCode || 0);
})();
