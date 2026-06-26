'use strict';

/**
 * gemini__tool-result-correlacion — la regresion de "el LLM narra en vez de ejecutar".
 *
 * Gemini correlaciona la RESPUESTA de una herramienta con la LLAMADA por el NOMBRE de
 * funcion (functionResponse.name debe casar con la functionCall.name declarada), NO por
 * tool_call_id como los modelos estilo OpenAI (deepseek/kimi).
 *
 * El loop agentico (ai-gateway) construye el mensaje de resultado de tool. Si NO lleva
 * `name`, el provider de gemini cae al tool_call_id sintetico ('gemini-<ts>-<i>'), que no
 * casa con ninguna funcion -> gemini queda CIEGO al resultado de su herramienta y rellena
 * con teatro ('guardado', 'el modulo no responde'). El fix: el tool message lleva el name
 * real (tr.name), y convertMessages lo usa.
 *
 * Ejecutar: node tests/unit/gemini__tool-result-correlacion.test.js
 */

const assert = require('assert');
const GeminiProvider = require('../../modules/conversacion/ai-gateway/providers/gemini-provider.js');

function makeProvider() {
  return new GeminiProvider(
    { models: ['gemini-2.5-pro'], default_model: 'gemini-2.5-pro' },
    { debug(){}, info(){}, warn(){}, error(){} },
    async () => null
  );
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('tool result CON name -> functionResponse.name = el nombre REAL de la funcion (correlaciona)', () => {
  const p = makeProvider();
  const { contents } = p.convertMessages([
    { role: 'tool', tool_call_id: 'gemini-1738-0', name: 'bus.publishAndWait', content: '{"status":200,"data":[]}' }
  ]);
  assert.strictEqual(contents.length, 1);
  const fr = contents[0].parts[0].functionResponse;
  assert.ok(fr, 'debe producir una functionResponse');
  assert.strictEqual(fr.name, 'bus.publishAndWait', 'el name debe ser el de la funcion, no el id sintetico');
});

test('tool result SIN name -> cae al tool_call_id sintetico (documenta la regresion)', () => {
  const p = makeProvider();
  const { contents } = p.convertMessages([
    { role: 'tool', tool_call_id: 'gemini-1738-0', content: '{"status":200}' }
  ]);
  const fr = contents[0].parts[0].functionResponse;
  assert.strictEqual(fr.name, 'gemini-1738-0', 'sin name caia al id sintetico que NO casa con ninguna funcion (= la regresion)');
});

test('round-trip: la functionCall y su functionResponse comparten el MISMO nombre', () => {
  const p = makeProvider();
  // El assistant llama a la herramienta...
  const llamada = p.convertMessages([
    { role: 'assistant', content: '', tool_calls: [
      { id: 'gemini-1738-0', type: 'function', function: { name: 'design.save.request', arguments: '{"html":"<x>"}' } }
    ] }
  ]);
  const fcName = llamada.contents[0].parts.find(pt => pt.functionCall).functionCall.name;
  // ...y el loop le devuelve el resultado con el name real (tras el fix).
  const respuesta = p.convertMessages([
    { role: 'tool', tool_call_id: 'gemini-1738-0', name: 'design.save.request', content: '{"status":200}' }
  ]);
  const frName = respuesta.contents[0].parts[0].functionResponse.name;
  assert.strictEqual(fcName, frName, 'gemini empareja por nombre: la llamada y la respuesta deben coincidir');
  assert.strictEqual(frName, 'design.save.request');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[gemini__tool-result-correlacion] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[gemini__tool-result-correlacion] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
