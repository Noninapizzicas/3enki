/**
 * Test del INTEGRADOR F7b (ensamblaje).
 *
 * Cubre: el reflejo lee el ecosistema vivo, un LLM elige qué eventos del bus
 * necesita suscribir el módulo nuevo, y el reflejo escribe los subscribes al
 * manifest y los handlers esqueleto al index.js — SIN tocar módulos viejos.
 * Patrón agente-perspectiva-c (determinista fuera, fuzzy dentro).
 *
 *   node tests/unit/proceso-negocio__ensamblaje.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  Integrador,
  normalizarEntrada,
  sacarContrato,
  handlerCanonico
} = require('../../modules/proceso-negocio/ensamblaje');

let pasados = 0, fallados = 0;
const _tests = [];
function test(desc, fn) { _tests.push({ desc, fn }); }
async function _correr() {
  for (const { desc, fn } of _tests) {
    try { await fn(); console.log(`✓ ${desc}`); pasados++; }
    catch (e) { console.log(`✗ ${desc}\n    ${e.stack || e.message}`); fallados++; }
  }
  console.log(`\n${pasados} pasados, ${fallados} fallados`);
  process.exit(fallados ? 1 : 0);
}

// ─── montaje de fixtures ───────────────────────────────────────────────────
function hacerRepoFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f7b-repo-'));
  fs.mkdirSync(path.join(root, 'modules'), { recursive: true });
  return root;
}
function limpiarRepo(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
}
function escribirModuloViejo(root, slug, manifest, indexSrc) {
  const dir = path.join(root, 'modules', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'module.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.js'), indexSrc, 'utf8');
}
function slugAPascal(slug) {
  return slug.split(/[-_]+/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}
function moduloNuevoSinOrejas(root, slug, descripcion, publishes = []) {
  const nombreClase = slugAPascal(slug) + 'Module';
  const manifest = {
    name: slug,
    version: '0.1.0',
    description: descripcion,
    publishes: publishes.map((e) => ({ event: e })),
    subscribes: []
  };
  const indexSrc = [
    "'use strict';",
    `class ${nombreClase} {`,
    '  constructor() { this.name = "' + slug + '"; }',
    '}',
    `module.exports = ${nombreClase};`,
    ''
  ].join('\n');
  escribirModuloViejo(root, slug, manifest, indexSrc);
  return {
    dir: path.join(root, 'modules', slug),
    manifestPath: path.join(root, 'modules', slug, 'module.json'),
    indexPath: path.join(root, 'modules', slug, 'index.js')
  };
}
function leerManifest(ruta) { return JSON.parse(fs.readFileSync(ruta, 'utf8')); }
function leerTexto(ruta)    { return fs.readFileSync(ruta, 'utf8'); }

// ─── helpers de salida del LLM ─────────────────────────────────────────────
function llmQueDevuelve(obj) {
  return async () => JSON.stringify(obj);
}
function llmQueDevuelveTextoCrudo(txt) {
  return async () => txt;
}

// ─── 1 · helpers puros ─────────────────────────────────────────────────────
test('handlerCanonico: evento normal → onCamelCase', () => {
  assert.strictEqual(handlerCanonico('puertas.abierta'), 'onAbierta');
  assert.strictEqual(handlerCanonico('carta.get.response'), 'onGetResponse');
  assert.strictEqual(handlerCanonico('nichos.pipeline.ciclo.iniciado'), 'onPipelineCicloIniciado');
});

test('handlerCanonico: evento sin segmentos → onEvento', () => {
  assert.strictEqual(handlerCanonico(''), 'onEvento');
  assert.strictEqual(handlerCanonico(null), 'onEvento');
});

test('normalizarEntrada: acepta string u objeto', () => {
  assert.deepStrictEqual(normalizarEntrada('a.b.c'), { event: 'a.b.c' });
  assert.deepStrictEqual(normalizarEntrada({ event: 'a.b', handler: 'onB' }), { event: 'a.b', handler: 'onB' });
  assert.strictEqual(normalizarEntrada({ noEvent: 'x' }), null);
});

test('sacarContrato: lee publishes/subscribes de raíz o events{}', () => {
  const plano = { publishes: ['a'], subscribes: ['b'] };
  const anidado = { events: { publishes: ['a'], subscribes: ['b'] } };
  const r1 = sacarContrato(plano);
  const r2 = sacarContrato(anidado);
  assert.strictEqual(r1.publishes[0].event, 'a');
  assert.strictEqual(r2.publishes[0].event, 'a');
  assert.strictEqual(r1.subscribes[0].event, 'b');
  assert.strictEqual(r2.subscribes[0].event, 'b');
});

// ─── 2 · flujo feliz: control-puertas se integra con puertas ──────────────
test('control-puertas se integra con puertas viejo — ecosistema vivo manda', async () => {
  const root = hacerRepoFixture();
  try {
    // módulo viejo "puertas" — publica desde hace meses
    escribirModuloViejo(root, 'puertas', {
      name: 'puertas',
      version: '1.0.0',
      description: 'Control físico de puertas; publica cambios de estado',
      publishes: ['puertas.abierta', 'puertas.cerrada'],
      subscribes: []
    }, "'use strict';\nclass Puertas{}\nmodule.exports = Puertas;\n");

    // módulo nuevo "control-puertas" — nace sin orejas
    const n = moduloNuevoSinOrejas(root, 'control-puertas',
      'Decide abrir o cerrar puertas según el estado actual del edificio',
      ['control-puertas.apertura.solicitada', 'control-puertas.cierre.solicitado']);

    // LLM elige las dos voces vivas
    const llm = llmQueDevuelve({
      subscribes_a_anadir: [
        { event: 'puertas.abierta', handler: 'onAbierta' },
        { event: 'puertas.cerrada', handler: 'onCerrada' }
      ]
    });

    const integ = new Integrador({ reposRoot: root, slug: 'control-puertas', pedirAlLLM: llm });
    const r = await integ.integrar();

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.subscribes_añadidos.length, 2);
    assert.deepStrictEqual(r.data.handlers_creados.sort(), ['onAbierta', 'onCerrada']);

    // manifest actualizado
    const mNuevo = leerManifest(n.manifestPath);
    const subs = mNuevo.subscribes.map((s) => s.event).sort();
    assert.deepStrictEqual(subs, ['puertas.abierta', 'puertas.cerrada']);

    // index.js con handlers esqueleto
    const idx = leerTexto(n.indexPath);
    assert.ok(idx.includes('onAbierta(e)'), 'onAbierta falta en index.js');
    assert.ok(idx.includes('onCerrada(e)'), 'onCerrada falta en index.js');

    // módulo viejo intacto
    const mViejo = leerManifest(path.join(root, 'modules', 'puertas', 'module.json'));
    assert.deepStrictEqual(mViejo.publishes.sort(), ['puertas.abierta', 'puertas.cerrada']);
    assert.deepStrictEqual(mViejo.subscribes || [], []);

    // pulso coherente
    assert.strictEqual(r.pulso.evento, 'proceso.hoja.integrada');
    assert.strictEqual(r.pulso.payload.slug, 'control-puertas');
  } finally { limpiarRepo(root); }
});

// ─── 3 · lista vacía: no toca ficheros ─────────────────────────────────────
test('LLM devuelve lista vacía → no se tocan ficheros', async () => {
  const root = hacerRepoFixture();
  try {
    escribirModuloViejo(root, 'puertas', {
      name: 'puertas', version: '1.0.0', description: '…',
      publishes: ['puertas.abierta'], subscribes: []
    }, "class P{}\nmodule.exports = P;\n");

    const n = moduloNuevoSinOrejas(root, 'otro', 'Módulo que no necesita oír nada', []);
    const manifestOrig = leerTexto(n.manifestPath);
    const indexOrig = leerTexto(n.indexPath);

    const llm = llmQueDevuelve({ subscribes_a_anadir: [] });
    const integ = new Integrador({ reposRoot: root, slug: 'otro', pedirAlLLM: llm });
    const r = await integ.integrar();

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.subscribes_añadidos.length, 0);
    assert.strictEqual(r.data.handlers_creados.length, 0);
    assert.strictEqual(leerTexto(n.manifestPath), manifestOrig);
    assert.strictEqual(leerTexto(n.indexPath), indexOrig);
  } finally { limpiarRepo(root); }
});

// ─── 4 · LLM propone evento inexistente: se descarta ───────────────────────
test('LLM propone evento sin voz viva → se descarta', async () => {
  const root = hacerRepoFixture();
  try {
    escribirModuloViejo(root, 'puertas', {
      name: 'puertas', version: '1.0.0', description: '…',
      publishes: ['puertas.abierta'], subscribes: []
    }, "class P{}\nmodule.exports = P;\n");

    const n = moduloNuevoSinOrejas(root, 'ctrl', 'nuevo', []);
    const llm = llmQueDevuelve({
      subscribes_a_anadir: [
        { event: 'puertas.abierta' },               // válido
        { event: 'inexistente.evento.inventado' },  // ← debe descartarse
        { event: 'tambien.inventado' }              // ← también
      ]
    });

    const integ = new Integrador({ reposRoot: root, slug: 'ctrl', pedirAlLLM: llm });
    const r = await integ.integrar();

    assert.strictEqual(r.status, 200);
    const subs = r.data.subscribes_añadidos.map((s) => s.event);
    assert.deepStrictEqual(subs, ['puertas.abierta']);
    assert.strictEqual(r.data.descartados.length, 2);
  } finally { limpiarRepo(root); }
});

// ─── 5 · no duplica suscripciones existentes ───────────────────────────────
test('LLM propone un evento ya suscrito → se descarta', async () => {
  const root = hacerRepoFixture();
  try {
    escribirModuloViejo(root, 'puertas', {
      name: 'puertas', version: '1.0.0', description: '…',
      publishes: ['puertas.abierta'], subscribes: []
    }, "class P{}\nmodule.exports = P;\n");

    // módulo nuevo YA tiene 'puertas.abierta' en su manifest
    escribirModuloViejo(root, 'nuevo', {
      name: 'nuevo', version: '0.1.0', description: 'Ya escucho puertas',
      publishes: [],
      subscribes: [{ event: 'puertas.abierta', handler: 'onAbierta' }]
    }, [
      "class N {",
      "  onAbierta(e) { return e; }",
      "}",
      "module.exports = N;",
      ''
    ].join('\n'));

    const llm = llmQueDevuelve({
      subscribes_a_anadir: [{ event: 'puertas.abierta', handler: 'onAbierta' }]
    });
    const integ = new Integrador({ reposRoot: root, slug: 'nuevo', pedirAlLLM: llm });
    const r = await integ.integrar();

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.subscribes_añadidos.length, 0);
    assert.strictEqual(r.data.descartados.length, 1);
  } finally { limpiarRepo(root); }
});

// ─── 6 · CONTRATO: slug inexistente ────────────────────────────────────────
test('slug sin modules/<slug>/ → 409 FASE_INCOMPLETA', async () => {
  const root = hacerRepoFixture();
  try {
    const integ = new Integrador({ reposRoot: root, slug: 'no-existo', pedirAlLLM: llmQueDevuelve({ subscribes_a_anadir: [] }) });
    await assert.rejects(() => integ.integrar(), (err) => err.code === 'FASE_INCOMPLETA' && err.status === 409);
  } finally { limpiarRepo(root); }
});

// ─── 7 · LLM responde texto crudo (sin JSON) → fail-safe ───────────────────
test('LLM responde sin JSON → LLM_RESPUESTA_NO_JSON', async () => {
  const root = hacerRepoFixture();
  try {
    moduloNuevoSinOrejas(root, 'x', 'desc', []);
    const integ = new Integrador({ reposRoot: root, slug: 'x', pedirAlLLM: llmQueDevuelveTextoCrudo('texto sin json aquí') });
    await assert.rejects(() => integ.integrar(), (err) => err.code === 'LLM_RESPUESTA_NO_JSON');
  } finally { limpiarRepo(root); }
});

// ─── 8 · LLM responde JSON envuelto en ``` → tolerante ────────────────────
test('LLM envuelve el JSON en bloque markdown → parsea igual', async () => {
  const root = hacerRepoFixture();
  try {
    escribirModuloViejo(root, 'p', {
      name: 'p', version: '1.0', description: '…', publishes: ['p.evento'], subscribes: []
    }, "class P{}\nmodule.exports = P;\n");
    moduloNuevoSinOrejas(root, 'n', 'desc', []);

    const envuelto = 'Claro, aquí tienes:\n```json\n{"subscribes_a_anadir":[{"event":"p.evento"}]}\n```\nEso es todo.';
    const integ = new Integrador({ reposRoot: root, slug: 'n', pedirAlLLM: llmQueDevuelveTextoCrudo(envuelto) });
    const r = await integ.integrar();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.subscribes_añadidos[0].event, 'p.evento');
  } finally { limpiarRepo(root); }
});

// ─── 9 · informe incremental ───────────────────────────────────────────────
test('dos integraciones consecutivas → informe acumula', async () => {
  const root = hacerRepoFixture();
  try {
    escribirModuloViejo(root, 'bus-vivo', {
      name: 'bus-vivo', version: '1.0', description: '…',
      publishes: ['evento.uno', 'evento.dos'], subscribes: []
    }, "class B{}\nmodule.exports = B;\n");

    moduloNuevoSinOrejas(root, 'uno', 'oye uno', []);
    moduloNuevoSinOrejas(root, 'dos', 'oye dos', []);

    const i1 = new Integrador({
      reposRoot: root, slug: 'uno',
      pedirAlLLM: llmQueDevuelve({ subscribes_a_anadir: [{ event: 'evento.uno' }] })
    });
    const i2 = new Integrador({
      reposRoot: root, slug: 'dos',
      pedirAlLLM: llmQueDevuelve({ subscribes_a_anadir: [{ event: 'evento.dos' }] })
    });
    await i1.integrar();
    await i2.integrar();

    const informePath = path.join(root, 'proceso-negocio', 'fase7b-ensamblaje.json');
    assert.ok(fs.existsSync(informePath), 'informe no persistido');
    const informe = JSON.parse(fs.readFileSync(informePath, 'utf8'));
    assert.strictEqual(informe.integraciones.length, 2);
    assert.deepStrictEqual(informe.integraciones.map((e) => e.slug).sort(), ['dos', 'uno']);
  } finally { limpiarRepo(root); }
});

// ─── 10 · vertical nombra el pulso ────────────────────────────────────────
test('vertical nombra el pulso: puertas.hoja.integrada', async () => {
  const root = hacerRepoFixture();
  try {
    escribirModuloViejo(root, 'puertas', {
      name: 'puertas', version: '1.0', description: '…', publishes: ['x.y'], subscribes: []
    }, "class P{}\nmodule.exports = P;\n");
    moduloNuevoSinOrejas(root, 'n', 'd', []);

    const integ = new Integrador({
      reposRoot: root, slug: 'n',
      vertical: { nombre: 'puertas' },
      pedirAlLLM: llmQueDevuelve({ subscribes_a_anadir: [] })
    });
    const r = await integ.integrar();
    assert.strictEqual(r.pulso.evento, 'puertas.hoja.integrada');
  } finally { limpiarRepo(root); }
});

// ─── 11 · handler ya existente → se renombra con sufijo ───────────────────
test('handler propuesto colisiona con uno existente → se renombra con sufijo', async () => {
  const root = hacerRepoFixture();
  try {
    escribirModuloViejo(root, 'puertas', {
      name: 'puertas', version: '1.0', description: '…', publishes: ['puertas.abierta'], subscribes: []
    }, "class P{}\nmodule.exports = P;\n");

    // módulo nuevo ya tiene onAbierta declarado para OTRA cosa
    escribirModuloViejo(root, 'nuevo', {
      name: 'nuevo', version: '0.1', description: 'tiene onAbierta previo',
      publishes: [], subscribes: []
    }, [
      "class N {",
      "  onAbierta(e) { return 'esto es otra cosa'; }",
      "}",
      "module.exports = N;",
      ''
    ].join('\n'));

    const integ = new Integrador({
      reposRoot: root, slug: 'nuevo',
      pedirAlLLM: llmQueDevuelve({ subscribes_a_anadir: [{ event: 'puertas.abierta', handler: 'onAbierta' }] })
    });
    const r = await integ.integrar();
    assert.strictEqual(r.status, 200);
    // handler final no debe ser onAbierta (ya existía) sino onAbierta2
    assert.strictEqual(r.data.subscribes_añadidos[0].handler, 'onAbierta2');
    const idx = leerTexto(path.join(root, 'modules', 'nuevo', 'index.js'));
    assert.ok(idx.includes('onAbierta2(e)'));
  } finally { limpiarRepo(root); }
});

// ─── 12 · rollback: index.js sin module.exports → retroceso total ────────
test('index.js sin module.exports → retroceso total, 500', async () => {
  const root = hacerRepoFixture();
  try {
    escribirModuloViejo(root, 'puertas', {
      name: 'puertas', version: '1.0', description: '…', publishes: ['puertas.abierta'], subscribes: []
    }, "class P{}\nmodule.exports = P;\n");

    const dir = path.join(root, 'modules', 'malo');
    fs.mkdirSync(dir, { recursive: true });
    const manifestOrig = JSON.stringify({ name: 'malo', version: '0.1', description: 'd', publishes: [], subscribes: [] }, null, 2);
    const indexOrig = 'class M{}\n// SIN module.exports\n';
    fs.writeFileSync(path.join(dir, 'module.json'), manifestOrig, 'utf8');
    fs.writeFileSync(path.join(dir, 'index.js'), indexOrig, 'utf8');

    const integ = new Integrador({
      reposRoot: root, slug: 'malo',
      pedirAlLLM: llmQueDevuelve({ subscribes_a_anadir: [{ event: 'puertas.abierta' }] })
    });
    await assert.rejects(() => integ.integrar(), (err) => err.code === 'PERSISTENCIA_FALLIDA');

    // ambos ficheros intactos
    assert.strictEqual(fs.readFileSync(path.join(dir, 'module.json'), 'utf8'), manifestOrig);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'index.js'), 'utf8'), indexOrig);
  } finally { limpiarRepo(root); }
});

// ─── 13 · un publish sin oyente HOY sigue ahí tras integrar (futuro abierto) ─
test('un publish sin oyente queda como futuro abierto — no se "arregla"', async () => {
  const root = hacerRepoFixture();
  try {
    // módulo viejo publica sin oyente (ejemplo "puertas" de la filosofía)
    escribirModuloViejo(root, 'solitario', {
      name: 'solitario', version: '1.0', description: '…',
      publishes: ['solitario.grito'], subscribes: []
    }, "class S{}\nmodule.exports = S;\n");

    // módulo nuevo que NO escucha solitario.grito
    moduloNuevoSinOrejas(root, 'otro', 'no tiene nada que ver', []);

    const integ = new Integrador({
      reposRoot: root, slug: 'otro',
      pedirAlLLM: llmQueDevuelve({ subscribes_a_anadir: [] })
    });
    const r = await integ.integrar();
    assert.strictEqual(r.status, 200);

    // 'solitario' sigue publicando sin oyentes, su manifest intacto
    const mSol = leerManifest(path.join(root, 'modules', 'solitario', 'module.json'));
    assert.deepStrictEqual(mSol.publishes, ['solitario.grito']);
    assert.deepStrictEqual(mSol.subscribes || [], []);
  } finally { limpiarRepo(root); }
});

_correr();
