/**
 * Tests unitarios — pizzepos/menu-generator blueprint puro v8.0.0
 *
 * Smoke estructural — valida shape del blueprint + module.json + schema canonico
 * SIN ejecutar el LLM. La validacion runtime end-to-end vive aparte (Fase 7b: audit
 * conversacional contra VPS).
 *
 * Cubre 4 grupos:
 *  1. module.json: declaracion blueprint_driven correcta + paths canonicos.
 *  2. menu-generator.blueprint.json: shape, 2 operaciones (generar + _on_*),
 *     eventos publicados, eventos_que_escucho con handler valido.
 *  3. carta-pizzepos.schema.json: schema parsea con AJV strict draft 2020-12 +
 *     example interno valida + minimo valido + missing meta.nombre falla.
 *  4. Integracion: pseudocodigo de generar invoca carta-manager.save.request
 *     (persistencia event-core) y publica los 4 eventos canonicos del v7.
 *
 * Ejecutar: node tests/unit/pizzepos__menu-generator.test.js
 *
 * Contrato origen: arquitectura/decisiones/propuestas/migracion-menu-generator-blueprint.md
 * Decisiones: 4.2 (agente archivado), 4.4 (OCR eliminado), 5.1=A (path), 5.2=A (schema),
 *             5.3=A (persistencia via carta-manager.save), 5.4=A (subscribe via blueprint-subscribers-asincronos).
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT = path.resolve(__dirname, '../..');
const MODULE_DIR = path.join(REPO_ROOT, 'modules/pizzepos/menu-generator');
const MANIFEST_PATH = path.join(MODULE_DIR, 'module.json');
const BLUEPRINT_PATH = path.join(MODULE_DIR, 'menu-generator.blueprint.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_schemas/menu-generator/carta-pizzepos.schema.json');

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const manifest = loadJson(MANIFEST_PATH);
const blueprint = loadJson(BLUEPRINT_PATH);
const schema = loadJson(SCHEMA_PATH);

// --------------------------------------------------
// Group 1: module.json declaracion blueprint_driven
// --------------------------------------------------

test('module.json: blueprint_driven: true', () => {
  assert.strictEqual(manifest.blueprint_driven, true);
});

test('module.json: blueprint_path apunta al blueprint hijo', () => {
  assert.strictEqual(manifest.blueprint_path, 'menu-generator.blueprint.json');
});

test('module.json: blueprint_parent_path apunta al padre canonico del subsistema-recetario', () => {
  assert.strictEqual(
    manifest.blueprint_parent_path,
    'arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json'
  );
});

test('module.json: target_page_id preservado del v7 legacy', () => {
  assert.strictEqual(manifest.target_page_id, 'menu-generator');
});

test('module.json: version bumped a 8.0.0', () => {
  assert.strictEqual(manifest.version, '8.0.0');
});

test('module.json: NO declara main (blueprint-driven no tiene index.js activo)', () => {
  assert.strictEqual(manifest.main, undefined);
});

test('module.json: NO declara dependencies nativas (pdfjs/sharp/google-vision eliminadas del manifest)', () => {
  assert.strictEqual(manifest.dependencies, undefined);
});

// --------------------------------------------------
// Group 2: blueprint shape + operaciones + eventos
// --------------------------------------------------

test('blueprint: id, version, extends correctos', () => {
  assert.strictEqual(blueprint.id, 'menu-generator');
  assert.strictEqual(blueprint.version, 'blueprint-9.0.0');
  assert.strictEqual(blueprint.extends_blueprint_abstract, 'subsistema-recetario.modulo-base');
  assert.strictEqual(blueprint.language, 'es');
});

test('blueprint: declara exactamente 2 operaciones (generar + _on_carta_generar_solicitada)', () => {
  const ops = Object.keys(blueprint.operaciones || {});
  assert.deepStrictEqual(
    ops.sort(),
    ['_on_carta_generar_solicitada', 'generar']
  );
});

test('blueprint: operacion generar tiene input + pseudocodigo + errores_posibles', () => {
  const gen = blueprint.operaciones.generar;
  assert.ok(typeof gen.input === 'string' && gen.input.length > 0);
  assert.ok(Array.isArray(gen.pseudocodigo) && gen.pseudocodigo.length > 0);
  assert.ok(Array.isArray(gen.errores_posibles) && gen.errores_posibles.includes('INVALID_INPUT'));
});

test('blueprint: operacion _on_carta_generar_solicitada es handler asincrono del subscribe', () => {
  const handler = blueprint.operaciones._on_carta_generar_solicitada;
  assert.ok(handler, 'falta operacion _on_carta_generar_solicitada');
  assert.ok(Array.isArray(handler.pseudocodigo) && handler.pseudocodigo.length > 0);
});

test('blueprint: eventos_publicados contiene los 4 canonicos preservados del v7', () => {
  const esperados = [
    'menu.generation.progress',
    'menu.generation.failed',
    'carta.generar.iniciada',
    'carta.generar.fallida'
  ];
  for (const ev of esperados) {
    assert.ok(
      blueprint.eventos_publicados.includes(ev),
      `falta evento canonico v7: ${ev}`
    );
  }
});

test('blueprint: NO publica agent.execute.request (agente menu-structurer archivado decision 4.2)', () => {
  assert.ok(
    !blueprint.eventos_publicados.includes('agent.execute.request'),
    'el v8 NO debe publicar agent.execute.request — el agente menu-structurer esta archivado'
  );
});

test('blueprint: eventos_que_escucho declara subscribe a carta.generar.solicitada (decision 5.4)', () => {
  const subs = blueprint.eventos_que_escucho || [];
  assert.strictEqual(subs.length, 1);
  assert.strictEqual(subs[0].evento, 'carta.generar.solicitada');
  assert.strictEqual(subs[0].handler, '_on_carta_generar_solicitada');
});

test('blueprint: handler declarado en eventos_que_escucho existe como operacion', () => {
  const handlerName = blueprint.eventos_que_escucho[0].handler;
  assert.ok(
    blueprint.operaciones[handlerName],
    `handler "${handlerName}" del subscribe no existe en operaciones[]`
  );
});

// --------------------------------------------------
// Group 3: schema canonico carta-pizzepos
// --------------------------------------------------

test('schema: $id canonico + draft 2020-12', () => {
  assert.strictEqual(
    schema.$schema,
    'https://json-schema.org/draft/2020-12/schema'
  );
  assert.strictEqual(
    schema.$id,
    'https://enki.local/arquitectura/decisiones/menu-generator/carta-pizzepos.schema.json'
  );
});

test('schema: additionalProperties: false en root + meta + categorias + productos', () => {
  assert.strictEqual(schema.additionalProperties, false);
  assert.strictEqual(schema.properties.meta.additionalProperties, false);
  assert.strictEqual(schema.properties.categorias.items.additionalProperties, false);
  assert.strictEqual(schema.properties.productos.items.additionalProperties, false);
});

test('schema: compila con AJV strict draft 2020-12', () => {
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.ok(typeof validate === 'function');
});

test('schema: example interno valida contra el propio schema', () => {
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.ok(Array.isArray(schema.examples) && schema.examples.length > 0, 'falta examples[]');
  const ok = validate(schema.examples[0]);
  assert.ok(ok, `example no valida: ${JSON.stringify(validate.errors)}`);
});

test('schema: carta minima valida (1 categoria + 1 producto con campos requeridos)', () => {
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const minima = {
    meta: {
      id: 'carta_test',
      nombre: 'Test',
      generado_desde: 'texto',
      created_at: '2026-05-25T12:00:00.000Z'
    },
    categorias: [{ id: 'cat1', nombre: 'Cat 1', orden: 1 }],
    productos: [{
      id: 'cat1_prod1',
      nombre: 'Prod 1',
      categoria: 'cat1',
      precio: 0,
      ingredientes: []
    }]
  };
  const ok = validate(minima);
  assert.ok(ok, `carta minima no valida: ${JSON.stringify(validate.errors)}`);
});

test('schema: carta sin meta.nombre falla validacion (unico campo obligatorio cross-modulo)', () => {
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const sinNombre = {
    meta: {
      id: 'carta_x',
      generado_desde: 'texto',
      created_at: '2026-05-25T12:00:00.000Z'
    },
    categorias: [{ id: 'c', nombre: 'C', orden: 1 }],
    productos: [{ id: 'c_p', nombre: 'P', categoria: 'c', precio: 0, ingredientes: [] }]
  };
  assert.strictEqual(validate(sinNombre), false);
});

test('schema: ingrediente con emoji valida (ayuda visual del POS comandero)', () => {
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const conEmoji = {
    meta: { id: 'carta_e', nombre: 'E', generado_desde: 'texto', created_at: '2026-05-25T12:00:00.000Z' },
    categorias: [{ id: 'c', nombre: 'C', orden: 1 }],
    productos: [{
      id: 'c_p',
      nombre: 'P',
      categoria: 'c',
      precio: 10,
      ingredientes: [
        { id: 'tomate', nombre: 'Tomate', emoji: '🍅', familia: 'salsa' },
        { id: 'queso', nombre: 'Queso', emoji: '🧀', familia: 'queso' }
      ]
    }]
  };
  assert.ok(validate(conEmoji), `carta con emojis no valida: ${JSON.stringify(validate.errors)}`);
});

// --------------------------------------------------
// Group 4: integracion blueprint -> persistencia event-core
// --------------------------------------------------

test('integracion: pseudocodigo de generar publica carta.creada fire-and-forget (decision 5.3 refactor v8.1)', () => {
  const pseudo = blueprint.operaciones.generar.pseudocodigo.join('\n');
  assert.ok(
    pseudo.includes("carta.creada"),
    'generar debe publicar carta.creada (evento de dominio) — carta-manager lo escucha via eventos_que_escucho y persiste internamente'
  );
  assert.ok(
    !pseudo.includes("publishAndWait('carta-manager.save.request'") &&
    !pseudo.includes('publishAndWait(\'carta-manager.save.request\''),
    'NO debe usar publishAndWait("carta-manager.save.request", ...) — wiring RPC blueprint->blueprint NO operacional en ai-gateway. Patron canonico: publish fire-and-forget + consumer declara eventos_que_escucho (frente 2.4)'
  );
});

test('integracion: blueprint declara carta.creada en eventos_publicados', () => {
  assert.ok(
    blueprint.eventos_publicados.includes('carta.creada'),
    'eventos_publicados debe incluir carta.creada (canonico v8.1)'
  );
});

test('integracion: pseudocodigo de generar publica menu.generation.progress al inicio', () => {
  const pseudo = blueprint.operaciones.generar.pseudocodigo.join('\n');
  assert.ok(pseudo.includes('menu.generation.progress'));
});

test('integracion: pseudocodigo de generar publica menu.generation.failed en error path de estructuracion', () => {
  const pseudo = blueprint.operaciones.generar.pseudocodigo.join('\n');
  assert.ok(pseudo.includes('menu.generation.failed'));
});

test('integracion: handler async publica carta.generar.iniciada + fallida (preserva contrato v7)', () => {
  const pseudo = blueprint.operaciones._on_carta_generar_solicitada.pseudocodigo.join('\n');
  assert.ok(pseudo.includes('carta.generar.iniciada'));
  assert.ok(pseudo.includes('carta.generar.fallida'));
});

test('integracion: handler async delega a this.generar (evita duplicacion de logica)', () => {
  const pseudo = blueprint.operaciones._on_carta_generar_solicitada.pseudocodigo.join('\n');
  assert.ok(
    pseudo.includes('this.generar'),
    'el handler debe delegar a this.generar(...) — evita duplicar el pipeline entero'
  );
});

test('integracion: pseudocodigo NO ejecuta OCR pipeline (decision 4.4 eliminacion total)', () => {
  // Escanea solo secciones operativas (pseudocodigo + eventos), NO narrativas
  // (_v8_changelog y _doc legitimamente documentan lo eliminado).
  const operativo = JSON.stringify({
    operaciones: blueprint.operaciones,
    eventos_publicados: blueprint.eventos_publicados,
    eventos_que_escucho: blueprint.eventos_que_escucho
  }).toLowerCase();
  const forbidden = ['pdfjs', 'sharp.prepare-ocr', 'google-vision'];
  for (const term of forbidden) {
    assert.ok(
      !operativo.includes(term.toLowerCase()),
      `pseudocodigo/eventos NO deben ejecutar "${term}" (capa OCR eliminada por decision 4.4)`
    );
  }
});

test('integracion: pseudocodigo NO invoca agente menu-structurer (decision 4.2 archivado)', () => {
  // Mismo principio: las secciones operativas no deben publicar agent.execute.request
  // al menu-structurer ni referenciarlo como herramienta. _v8_changelog SI lo menciona
  // para documentar el archivado.
  const operativo = JSON.stringify({
    operaciones: blueprint.operaciones,
    eventos_publicados: blueprint.eventos_publicados,
    eventos_que_escucho: blueprint.eventos_que_escucho
  });
  assert.ok(
    !operativo.includes('menu-structurer'),
    'pseudocodigo/eventos NO deben referenciar el agente menu-structurer (archivado)'
  );
  assert.ok(
    !operativo.includes('agent.execute.request'),
    'el v8 absorbe la estructuracion en el blueprint principal — NO publica agent.execute.request'
  );
});

// --------------------------------------------------
// Runner
// --------------------------------------------------

(async () => {
  let passed = 0, failed = 0;
  const failures = [];
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
    } catch (err) {
      failed++;
      failures.push({ name, err });
    }
  }
  if (failed === 0) {
    console.log(`\n[pizzepos__menu-generator] OK ${passed}/${tests.length}`);
    process.exit(0);
  }
  console.error(`\n[pizzepos__menu-generator] FAIL ${failed}/${tests.length}`);
  for (const { name, err } of failures) {
    console.error(`  x ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  }
  process.exit(1);
})();
