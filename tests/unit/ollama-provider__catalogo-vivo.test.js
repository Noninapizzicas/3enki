/**
 * Test unitario — ai-gateway/providers/ollama-provider (catálogo VIVO)
 *
 * Verifica el arreglo de raíz: el provider YA NO decide los modelos por la
 * lista declarada en config (que se pudre: tenía deepseek-v4-flash:preview,
 * retirado). Ahora captura el catálogo VIVO de /api/tags en configure() y esa
 * es la fuente de verdad, tanto para el selector (catalogo()) como para el
 * coerce (_coerceModel).
 *
 * Sin red: se inyecta un makeRequest simulado que devuelve un /api/tags con
 * modelos VIVOS y se comprueba que un modelo vivo se respeta y un muerto cae
 * al default.
 *
 * Ejecutar: node tests/unit/ollama-provider__catalogo-vivo.test.js
 */

'use strict';
const assert = require('assert');
const OllamaProvider = require('../../modules/conversacion/ai-gateway/providers/ollama-provider.js');

const LOG = { debug(){}, info(){}, warn(){}, error(){} };
const CRED = { resolve: async () => null };

let fallos = 0;
async function testAsync(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); fallos++; }
}

// Provider con makeRequest simulado (sin red) y sin resolución de credenciales.
function makeProvider(config, tagsResp, opciones = {}) {
  const p = new OllamaProvider(config, LOG, CRED);
  p.refreshApiKey = async () => {};
  p.makeRequest = async (method, path) => {
    if (opciones.falla) throw new Error('sin red');
    if (path === '/api/tags') return tagsResp;
    return {};
  };
  return p;
}

// La oferta VIVA real de Ollama Cloud (17 modelos, sep-2026). Sin los retirados.
const TAGS_VIVOS = {
  models: [
    { name: 'deepseek-v4.1-flash' }, { name: 'deepseek-v4-pro:0813' },
    { name: 'glm-5.2' }, { name: 'glm-5.3' }, { name: 'glm-5.3-flash' },
    { name: 'kimi-k2.6' }, { name: 'kimi-k2.7-code' }, { name: 'kimi-k3' },
    { name: 'gpt-oss:120b' }, { name: 'gpt-oss:20b' },
    { name: 'gemma4:31b' }, { name: 'minimax-m2.7' }, { name: 'minimax-m3' },
    { name: 'mistral-large-3:675b' }, { name: 'nemotron-3-nano:30b' },
    { name: 'nemotron-3-super' }, { name: 'nemotron-3-ultra' }
  ]
};

(async () => {
  console.log('ai-gateway/ollama-provider — catálogo VIVO\n');

  await testAsync('configure() captura el catálogo VIVO de /api/tags (no la lista de config)', async () => {
    const config = { models: ['viejo-retirado:preview'], default_model: 'deepseek-v4.1-flash' };
    const p = makeProvider(config, TAGS_VIVOS);
    await p.configure();
    assert.strictEqual(p.catalogoVivo.length, 17, 'capturó los 17 vivos');
    assert.ok(p.catalogoVivo.includes('glm-5.3'), 'incluye un modelo nuevo de la oferta');
    assert.ok(p.catalogoVivo.includes('mistral-large-3:675b'), 'incluye otro nuevo');
  });

  await testAsync('catalogo() devuelve la oferta viva (lo que puebla el selector)', async () => {
    const config = { models: ['viejo-retirado:preview'], default_model: 'deepseek-v4.1-flash' };
    const p = makeProvider(config, TAGS_VIVOS);
    await p.configure();
    const cat = p.catalogo();
    assert.strictEqual(cat.length, 17);
    assert.ok(!cat.includes('viejo-retirado:preview'), 'NO ofrece el modelo muerto de config');
    assert.ok(cat.includes('deepseek-v4.1-flash'), 'ofrece el default vivo');
  });

  await testAsync('_coerceModel: un modelo VIVO se respeta (libertad de elegir toda la oferta)', async () => {
    const config = { models: ['viejo-retirado:preview'], default_model: 'deepseek-v4.1-flash' };
    const p = makeProvider(config, TAGS_VIVOS);
    await p.configure();
    // Modelos vivos que NO están en la lista declarada de config: se respetan.
    assert.strictEqual(p._coerceModel({ model: 'glm-5.3' }).model, 'glm-5.3', 'glm-5.3 vivo → se respeta');
    assert.strictEqual(p._coerceModel({ model: 'mistral-large-3:675b' }).model, 'mistral-large-3:675b', 'mistral vivo → se respeta');
    assert.strictEqual(p._coerceModel({ model: 'nemotron-3-ultra' }).model, 'nemotron-3-ultra', 'nemotron vivo → se respeta');
  });

  await testAsync('_coerceModel: un modelo MUERTO cae al default (evita 410)', async () => {
    const config = { models: ['viejo-retirado:preview'], default_model: 'deepseek-v4.1-flash' };
    const p = makeProvider(config, TAGS_VIVOS);
    await p.configure();
    assert.strictEqual(p._coerceModel({ model: 'deepseek-v4-flash:preview' }).model, 'deepseek-v4.1-flash', 'retirado → default');
    assert.strictEqual(p._coerceModel({ model: 'qwen3.5:397b' }).model, 'deepseek-v4.1-flash', 'retirado → default');
    assert.strictEqual(p._coerceModel({ model: 'inventado' }).model, 'deepseek-v4.1-flash', 'inventado → default');
  });

  await testAsync('sin /api/tags (caída) → cae a la lista declarada en config (degradación honesta)', async () => {
    const config = { models: ['deepseek-v4.1-flash', 'glm-5.3'], default_model: 'deepseek-v4.1-flash' };
    const p = makeProvider(config, null, { falla: true });
    await p.configure();
    assert.strictEqual(p.catalogoVivo.length, 0, 'sin catálogo vivo');
    const cat = p.catalogo();
    assert.deepStrictEqual(cat, ['deepseek-v4.1-flash', 'glm-5.3'], 'usa la lista declarada');
  });

  console.log(fallos === 0 ? '\nTodos los tests pasaron.' : `\n${fallos} test(s) fallaron.`);
  process.exit(fallos === 0 ? 0 : 1);
})();
