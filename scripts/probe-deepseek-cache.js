#!/usr/bin/env node
'use strict';

/**
 * probe-deepseek-cache — ¿cachea el endpoint Anthropic-compat de deepseek?
 *
 * LA DECISIÓN: "mismo idioma" (deepseek hablando protocolo Anthropic) gana SI su
 * cache va bien. Si no -> nos quedamos con OpenAI-compat (que tiene KV-cache
 * automático confirmado, -98% input en hits).
 *
 * Este probe golpea los DOS endpoints con un prefijo IDÉNTICO y grande, dos veces
 * cada uno (la 1ª siembra el cache, la 2ª debería pegarle), e imprime el objeto
 * `usage` CRUDO de cada llamada — sin asumir nombres de campo. El veredicto mira si
 * la 2ª llamada de cada path muestra tokens leídos de cache.
 *
 * NO requiere desplegar Enki: pega directo a la API. Solo necesita la key.
 *
 * USO (en el VPS, donde vive la key):
 *   node scripts/probe-deepseek-cache.js
 * Lee DEEPSEEK_API_KEY de process.env o de data/.env (DEEPSEEK_API_KEY / _GLOBAL).
 *
 * Coste: ~4 llamadas con max_tokens bajo + prefijo grande de input. Céntimos.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── 1. resolver la key (env -> data/.env) ─────────────────────────────────
function loadKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  if (process.env.DEEPSEEK_API_KEY_GLOBAL) return process.env.DEEPSEEK_API_KEY_GLOBAL;
  const envPath = path.join(process.cwd(), 'data', '.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*(DEEPSEEK_API_KEY(?:_GLOBAL)?)\s*=\s*(.+?)\s*$/);
      if (m && m[2]) return m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* sin data/.env */ }
  return null;
}

const KEY = loadKey();
if (!KEY) {
  console.error('FALTA DEEPSEEK_API_KEY (ni en env ni en data/.env). Abortando.');
  process.exit(1);
}

// ── 2. prefijo grande e IDÉNTICO (dispara el prefix-cache) ─────────────────
// ~6K tokens de texto repetido y estable. El cache de deepseek necesita un
// prefijo suficientemente grande y EXACTAMENTE igual entre llamadas.
const BLOQUE = (
  'Eres un asistente del sistema Enki, arquitectura event-driven sobre MQTT. ' +
  'Reglas invariantes del turno: contrato JSON antes que implementación; ' +
  'pseudocódigo tipado antes que código real; expresar en positivo; no inventar. '
).repeat(400); // ~6K+ tokens, estable entre llamadas

const SYSTEM = `# CONTEXTO FIJO DEL TURNO (prefijo cacheable)\n${BLOQUE}\n# FIN DEL CONTEXTO FIJO`;
const USER = 'Responde solo con la palabra: OK.';

// ── 3. helper HTTP ────────────────────────────────────────────────────────
function post(host, pathName, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      { host, path: pathName, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, json: { _raw: data.slice(0, 500) } }); }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── 4. los dos paths ──────────────────────────────────────────────────────
async function openaiCompat() {
  // POST /v1/chat/completions — usage trae prompt_cache_hit_tokens / prompt_cache_miss_tokens
  return post('api.deepseek.com', '/v1/chat/completions',
    { Authorization: `Bearer ${KEY}` },
    {
      model: 'deepseek-v4-flash',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }],
      max_tokens: 8,
      stream: false
    });
}

async function anthropicCompat(model) {
  // POST /anthropic/v1/messages — usage trae (si cachea) cache_read_input_tokens / cache_creation_input_tokens
  return post('api.deepseek.com', '/anthropic/v1/messages',
    { 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    {
      model,
      max_tokens: 8,
      system: SYSTEM,
      messages: [{ role: 'user', content: USER }]
    });
}

// ── 5. correr cada path DOS veces y reportar usage ────────────────────────
function resumenUsage(u = {}) {
  // imprime todos los campos *token* y *cache* sin asumir cuáles existen
  const out = {};
  for (const [k, v] of Object.entries(u)) {
    if (/token|cache/i.test(k)) out[k] = v;
  }
  return out;
}

async function correrPath(nombre, fn) {
  console.log(`\n=== ${nombre} ===`);
  let llamada1, llamada2;
  try {
    llamada1 = await fn();
    if (llamada1.status !== 200) {
      console.log(`  [1ª] HTTP ${llamada1.status}:`, JSON.stringify(llamada1.json).slice(0, 300));
      return null;
    }
    // 2ª inmediata, prefijo idéntico -> debería pegar el cache
    llamada2 = await fn();
    if (llamada2.status !== 200) {
      console.log(`  [2ª] HTTP ${llamada2.status}:`, JSON.stringify(llamada2.json).slice(0, 300));
      return null;
    }
  } catch (err) {
    console.log(`  ERROR de red: ${err.message}`);
    return null;
  }
  const u1 = resumenUsage(llamada1.json.usage);
  const u2 = resumenUsage(llamada2.json.usage);
  console.log('  usage 1ª (siembra):', JSON.stringify(u1));
  console.log('  usage 2ª (¿hit?)  :', JSON.stringify(u2));
  return { u1, u2 };
}

function detectarCacheHit(u = {}) {
  // cualquier campo que indique tokens LEÍDOS de cache con valor > 0
  for (const [k, v] of Object.entries(u)) {
    if (/cache_read|cache_hit|cached/i.test(k) && Number(v) > 0) return { campo: k, valor: v };
  }
  return null;
}

(async () => {
  console.log('Probe de cache deepseek — prefijo ~6K tokens, idéntico entre llamadas.');
  console.log('(la 2ª llamada de cada path debería leer el prefijo de cache si el endpoint cachea)');

  const oa = await correrPath('OpenAI-compat  /v1/chat/completions  (deepseek-v4-flash)', openaiCompat);
  const anFlash = await correrPath('Anthropic-compat /anthropic/v1/messages (deepseek-v4-flash)', () => anthropicCompat('deepseek-v4-flash'));
  const anPro = await correrPath('Anthropic-compat /anthropic/v1/messages (deepseek-v4-pro)', () => anthropicCompat('deepseek-v4-pro'));

  console.log('\n========== VEREDICTO ==========');
  for (const [nombre, r] of [['OpenAI-compat (v4-flash)', oa], ['Anthropic-compat (v4-flash)', anFlash], ['Anthropic-compat (v4-pro)', anPro]]) {
    if (!r) { console.log(`  ${nombre}: SIN DATO (error arriba)`); continue; }
    const hit = detectarCacheHit(r.u2);
    console.log(`  ${nombre}: ${hit ? `CACHEA ✓  (${hit.campo}=${hit.valor} en la 2ª)` : 'sin señal de cache hit en la 2ª ✗'}`);
  }
  console.log('\nDecisión: si el Anthropic-compat NO cachea y el OpenAI-compat SÍ, el "mismo idioma"');
  console.log('cuesta el cache -> quedarse con OpenAI-compat (priority 1 actual). Si ambos cachean,');
  console.log('"mismo idioma" gana sin penalización -> promover deepseek-anthropic a default.');
})();
