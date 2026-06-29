'use strict';

/**
 * Regresión: base-provider decodifica UTF-8 multibyte partido entre chunks.
 *
 * Bug (mojibake): `body += chunkBuffer` decodificaba cada chunk de red por
 * separado. Un emoji de 4 bytes (🍖 = F0 9F 8D 96) a caballo de dos chunks daba
 * `��`. Visto en vivo en la carta de nonina (extras: "Jamón York ��").
 * Fix: res.setEncoding('utf8') → el StringDecoder de Node junta los bytes
 * multibyte a través de la frontera del chunk antes de decodificar.
 */

const assert = require('assert');
const http = require('http');
const BaseProvider = require('../../modules/conversacion/ai-gateway/providers/base-provider.js');

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log('  ✓ ' + name); };
const ko = (name, e) => { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message || e)); };

// Servidor que parte un emoji 🍖 entre DOS writes: 2 bytes + 2 bytes.
// Reproduce la frontera de chunk de red que disparaba el bug.
function serverPartiendoEmoji(payloadObj, splitByteOffset) {
  return http.createServer((req, res) => {
    const full = Buffer.from(JSON.stringify(payloadObj), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(full.subarray(0, splitByteOffset));   // primera mitad (corta el emoji)
    setTimeout(() => { res.end(full.subarray(splitByteOffset)); }, 10);
  });
}

async function run() {
  console.log('base-provider__utf8-chunks');

  // El payload lleva un 🍖 (4 bytes). Calculamos un offset que caiga EN MEDIO
  // del emoji para forzar el split exacto que rompía.
  const payload = { emoji: '🍖', nombre: 'Jamón York 🍖', plain: 'sin emoji' };
  const json = JSON.stringify(payload);
  const buf = Buffer.from(json, 'utf8');
  const firstEmojiByte = buf.indexOf(Buffer.from('🍖', 'utf8'));
  const splitOffset = firstEmojiByte + 2; // parte el emoji de 4 bytes por la mitad

  const server = serverPartiendoEmoji(payload, splitOffset);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const provider = new BaseProvider({ api_base: `http://127.0.0.1:${port}` }, console);

  try {
    const result = await provider.makeRequest('POST', '/', { ping: true });

    try {
      assert.strictEqual(typeof result, 'object', 'la respuesta parsea como objeto (no string)');
      ok('respuesta JSON parsea pese al emoji partido');
    } catch (e) { ko('respuesta JSON parsea pese al emoji partido', e); }

    try {
      assert.strictEqual(result.emoji, '🍖', 'el emoji llega intacto');
      ok('emoji 🍖 reconstruido intacto (no ��)');
    } catch (e) { ko('emoji 🍖 reconstruido intacto (no ��)', e); }

    try {
      assert.ok(!String(result.nombre).includes('�'), 'sin carácter de reemplazo U+FFFD');
      ok('cero U+FFFD (�) en el texto');
    } catch (e) { ko('cero U+FFFD (�) en el texto', e); }

  } catch (e) {
    ko('makeRequest no lanza', e);
  } finally {
    server.close();
  }

  console.log(`[base-provider__utf8-chunks] ${fail === 0 ? 'OK' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
