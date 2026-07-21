'use strict';
const assert = require('assert');
const Mod = require('../../modules/motor-sonido');
function nuevo() { const m = new Mod(); m.logger={info(){},warn(){},error(){},debug(){}}; m.metrics={increment(){}}; m.eventBus={publish(){}}; m._timeoutMs=200; return m; }
const tests = []; const test = (n, f) => tests.push({ n, f });

test('SIN BOTÓN: analiza sin interruptor; devuelve features + nota (no emoción)', async () => {
  const m = nuevo();
  assert.strictEqual('activo' in m, false);
  assert.strictEqual(typeof m._guard, 'undefined');
  m._motorCall = async () => ({ status: 200, body: { features: { energia_rms: 0.1, pitch_hz: 120, duracion_s: 2.0 } } });
  const r = await m._analizar({ audio_base64: 'UklGRg==' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.features.pitch_hz, 120);
  assert.ok(/LLM/.test(r.data.nota), 'la nota aclara que la emoción la pone el LLM');
});
test('motor caído → 503 sin_motor', async () => {
  const m = nuevo(); m._motorCall = async () => { throw new Error('x'); };
  const r = await m._analizar({ audio_base64: 'AAAA' });
  assert.strictEqual(r.status, 503); assert.strictEqual(r.error.details.motivo, 'sin_motor');
});
test('{fallo} → 502 ANALISIS_FALLIDO', async () => {
  const m = nuevo(); m._motorCall = async () => ({ status: 200, body: { fallo: { tipo: 'error', motivo: 'x' } } });
  assert.strictEqual((await m._analizar({ audio_base64: 'AAAA' })).status, 502);
});
test('sin audio_base64 → 400', async () => {
  const m = nuevo(); m._motorCall = async () => ({ status: 200, body: { features: {} } });
  assert.strictEqual((await m._analizar({})).status, 400);
});
(async () => { let ok=0; const f=[]; for (const {n,f:fn} of tests){try{await fn();ok++}catch(e){f.push({n,e})}} if(!f.length){console.log(`\n[motor-sonido__index] OK ${ok}/${tests.length}`);process.exit(0)} console.error(`\n[motor-sonido__index] FAIL ${f.length}`); for(const{n,e}of f)console.error(`  x ${n}\n    ${e.message}`); process.exit(1); })();
