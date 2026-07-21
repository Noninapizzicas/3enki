'use strict';
const assert = require('assert');
const Mod = require('../../modules/motor-voz');
function nuevo() { const m = new Mod(); m.logger={info(){},warn(){},error(){},debug(){}}; m.metrics={increment(){}}; m.eventBus={publish(){}}; m._timeoutMs=200; return m; }
const tests = []; const test = (n, f) => tests.push({ n, f });

test('SIN BOTÓN: sintetiza sin interruptor; devuelve audio', async () => {
  const m = nuevo();
  assert.strictEqual('activo' in m, false);
  assert.strictEqual(typeof m._guard, 'undefined');
  m._motorCall = async () => ({ status: 200, body: { audio_base64: 'UklGRg==', sample_rate: 22050 } });
  const r = await m._decir({ texto: 'Hola' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.audio_base64, 'UklGRg==');
  assert.strictEqual(r.data.sample_rate, 22050);
});
test('motor caído → 503 sin_motor', async () => {
  const m = nuevo(); m._motorCall = async () => { throw new Error('x'); };
  const r = await m._decir({ texto: 'Hola' });
  assert.strictEqual(r.status, 503); assert.strictEqual(r.error.details.motivo, 'sin_motor');
});
test('voz no disponible → 422 VOZ_NO_DISPONIBLE', async () => {
  const m = nuevo(); m._motorCall = async () => ({ status: 200, body: { fallo: { tipo: 'voz_no_disponible', motivo: 'falta zz' } } });
  const r = await m._decir({ texto: 'Hola', voz: 'zz' });
  assert.strictEqual(r.status, 422); assert.strictEqual(r.error.code, 'VOZ_NO_DISPONIBLE');
});
test('sin texto → 400', async () => {
  const m = nuevo(); m._motorCall = async () => ({ status: 200, body: { audio_base64: 'x' } });
  assert.strictEqual((await m._decir({})).status, 400);
});
(async () => { let ok=0; const f=[]; for (const {n,f:fn} of tests){try{await fn();ok++}catch(e){f.push({n,e})}} if(!f.length){console.log(`\n[motor-voz__index] OK ${ok}/${tests.length}`);process.exit(0)} console.error(`\n[motor-voz__index] FAIL ${f.length}`); for(const{n,e}of f)console.error(`  x ${n}\n    ${e.message}`); process.exit(1); })();
