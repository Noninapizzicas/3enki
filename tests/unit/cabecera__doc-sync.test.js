'use strict';

/**
 * cabecera__doc-sync — el MOTOR de la cúpula de la cabecera.
 *
 * La escalera de determinismo aplicada al documento rector: los números se
 * COMPUTAN ({{version}}/{{tests}}/{{count}}), el marcador irresoluble queda
 * VISIBLE (⚠COMPUTADO_ROTO, nunca silencio), y la cúpula entera (rebanadas +
 * _orden.json) carga con frontmatter completo.
 *
 * Ejecutar: node tests/unit/cabecera__doc-sync.test.js
 */

const assert = require('assert');
const ds = require('../../scripts/cabecera/doc-sync.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── glob → regex ─────────────────────────────────────────────────────────
test('globARegex: ** cruza directorios, * no', () => {
  assert.ok(ds.globARegex('modules/conserje/**').test('modules/conserje/services/x.js'));
  assert.ok(ds.globARegex('modules/*/module.json').test('modules/conserje/module.json'));
  assert.ok(!ds.globARegex('modules/*/module.json').test('modules/pizzepos/cocina/module.json'));
  assert.ok(!ds.globARegex('core/**').test('frontend/x'));
});

// ── frontmatter ──────────────────────────────────────────────────────────
test('parseRebanada: escalares, listas y lista vacía', () => {
  const { front, body } = ds.parseRebanada('---\nid: a/b\ndominio: core\nfuentes:\n  - core/**\n  - index.js\nverificado: 2026-07-06\n---\n\ncuerpo');
  assert.strictEqual(front.id, 'a/b');
  assert.deepStrictEqual(front.fuentes, ['core/**', 'index.js']);
  assert.strictEqual(body, 'cuerpo');
  const vacia = ds.parseRebanada('---\nid: x\nfuentes: []\n---\nc');
  assert.deepStrictEqual(vacia.front.fuentes, []);
});

test('parseRebanada: sin frontmatter devuelve el texto intacto', () => {
  const { front, body } = ds.parseRebanada('# solo cuerpo');
  assert.strictEqual(front, null);
  assert.strictEqual(body, '# solo cuerpo');
});

// ── marcadores ───────────────────────────────────────────────────────────
test('resolverMarcadores: version desde module.json real', () => {
  const fsReal = require('fs');
  const esperado = JSON.parse(fsReal.readFileSync('modules/conserje/module.json', 'utf8')).version;
  const r = ds.resolverMarcadores('v {{version:modules/conserje}}');
  assert.strictEqual(r.texto, `v ${esperado}`);
  assert.strictEqual(r.rotos.length, 0);
});

test('resolverMarcadores: tests y count computan contra el repo', () => {
  const r = ds.resolverMarcadores('{{tests:cabecera__*}} · {{count:scripts/cabecera/*.js}}');
  const [nTests, nScripts] = r.texto.split(' · ').map(Number);
  assert.ok(nTests >= 1, 'al menos este test casa el glob');
  assert.ok(nScripts >= 3, 'doc-sync + validate + rebanar');
  assert.strictEqual(r.rotos.length, 0);
});

test('resolverMarcadores: el irresoluble queda VISIBLE, jamás silencio', () => {
  const r = ds.resolverMarcadores('{{version:modules/noexiste}}');
  assert.ok(r.texto.includes('⚠COMPUTADO_ROTO(version:modules/noexiste)'));
  assert.strictEqual(r.rotos.length, 1);
});

test('resolverMarcadores: la sintaxis con espacios NO se resuelve (escape documental)', () => {
  const r = ds.resolverMarcadores('ejemplo {{ version:modules/x }}');
  assert.ok(r.texto.includes('{{ version:modules/x }}'));
  assert.strictEqual(r.rotos.length, 0);
});

// ── la cúpula entera ─────────────────────────────────────────────────────
test('cargarRebanadas: todas con frontmatter completo y sin marcadores rotos', () => {
  const rebanadas = ds.cargarRebanadas();
  assert.ok(rebanadas.length >= 35, 'la cúpula tiene el monolito rebanado');
  for (const r of rebanadas) {
    assert.ok(r.front && r.front.id && r.front.dominio && r.front.resumen, `${r.archivo}: frontmatter completo`);
    const res = ds.resolverMarcadores(r.body);
    assert.strictEqual(res.rotos.length, 0, `${r.archivo}: marcadores resuelven (${JSON.stringify(res.rotos)})`);
  }
});

test('cargarOrden: _persona.md presente (el fino la necesita)', () => {
  assert.ok(ds.cargarOrden().includes('_persona.md'));
});

// ── runner ───────────────────────────────────────────────────────────────
(async () => {
  let ok = 0, fail = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`✓ ${t.name}`); ok++; }
    catch (err) { console.error(`✗ ${t.name}\n  ${err.message}`); fail++; }
  }
  console.log(`\n${ok}/${tests.length} tests OK`);
  process.exit(fail ? 1 : 0);
})();
