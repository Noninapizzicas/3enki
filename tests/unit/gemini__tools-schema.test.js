'use strict';

/**
 * gemini-provider — saneo del esquema de tools (convertTools / _sanitizeSchema).
 *
 * Gemini rechaza con HTTP 400 INVALID_ARGUMENT campos válidos de JSON Schema que
 * OpenAI/Anthropic/deepseek sí aceptan (additionalProperties, $schema, $ref,
 * definitions…). Esta suite fija que se limpian recursivamente y que lo legítimo
 * (type/properties/required/items/enum) sobrevive.
 *
 * Ejecutar: node tests/unit/gemini__tools-schema.test.js
 */

const assert = require('assert');
const GeminiProvider = require('../../modules/conversacion/ai-gateway/providers/gemini-provider');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// instancia sin configurar (solo probamos métodos puros de transformación)
const g = Object.create(GeminiProvider.prototype);

test('quita additionalProperties en la raíz y anidado', () => {
  const out = g.convertTools([{ function: { name: 'f', parameters: {
    type: 'object', additionalProperties: false,
    properties: { nested: { type: 'object', additionalProperties: true, properties: { y: { type: 'number' } } } }
  } } }]);
  assert.ok(!/additionalProperties/.test(JSON.stringify(out)), 'no debe quedar additionalProperties');
  // pero conserva la estructura
  const p = out[0].functionDeclarations[0].parameters;
  assert.strictEqual(p.properties.nested.properties.y.type, 'number');
});

test('quita $schema, $ref, $id, definitions, patternProperties', () => {
  const out = g.convertTools([{ function: { name: 'f', parameters: {
    type: 'object', $schema: 'http://json-schema.org/draft-07/schema#', $id: 'x',
    definitions: { Foo: { type: 'string' } }, patternProperties: { '^x': { type: 'string' } },
    properties: { ref: { $ref: '#/definitions/Foo' } }
  } } }]);
  const json = JSON.stringify(out);
  for (const bad of ['$schema', '$id', 'definitions', 'patternProperties', '$ref']) {
    assert.ok(!json.includes(bad), `no debe quedar ${bad}`);
  }
});

test('conserva lo legítimo: type, properties, required, items, enum, description', () => {
  const out = g.convertTools([{ function: { name: 'f', description: 'd', parameters: {
    type: 'object',
    properties: {
      estado: { type: 'string', enum: ['a', 'b'], description: 'el estado' },
      lista: { type: 'array', items: { type: 'string' } }
    },
    required: ['estado']
  } } }]);
  const p = out[0].functionDeclarations[0].parameters;
  assert.strictEqual(p.type, 'object');
  assert.deepStrictEqual(p.required, ['estado']);
  assert.deepStrictEqual(p.properties.estado.enum, ['a', 'b']);
  assert.strictEqual(p.properties.estado.description, 'el estado');
  assert.strictEqual(p.properties.lista.items.type, 'string');
});

test('forma Gemini: [{ functionDeclarations: [{ name, description, parameters }] }]', () => {
  const out = g.convertTools([{ function: { name: 'foo', description: 'bar', parameters: { type: 'object', properties: {} } } }]);
  assert.ok(Array.isArray(out) && out[0].functionDeclarations);
  assert.strictEqual(out[0].functionDeclarations[0].name, 'foo');
  assert.strictEqual(out[0].functionDeclarations[0].description, 'bar');
});

test('sin tools → null', () => {
  assert.strictEqual(g.convertTools([]), null);
  assert.strictEqual(g.convertTools(null), null);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[gemini__tools-schema] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[gemini__tools-schema] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
