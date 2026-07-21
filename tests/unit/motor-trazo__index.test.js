'use strict';
const assert = require('assert');
const Mod = require('../../modules/motor-trazo');
function nuevo() { const m = new Mod(); m.logger={info(){},warn(){},error(){},debug(){}}; m.metrics={increment(){}}; m.eventBus={publish(){}}; m._timeoutMs=200; return m; }
const tests = []; const test = (n, f) => tests.push({ n, f });

test('SIN BOTÓN: interpreta sin interruptor; devuelve elementos + nota (no intención)', async () => {
  const m = nuevo();
  assert.strictEqual('activo' in m, false);
  assert.strictEqual(typeof m._guard, 'undefined');
  m._motorCall = async () => ({ status: 200, body: { elementos: [{ tipo: 'rectangulo', bbox: { x: 0, y: 0, w: 100, h: 60 }, cerrado: true, n_puntos: 44, n_vertices: 4 }] } });
  const r = await m._interpretar({ trazos: [[{ x: 0, y: 0 }, { x: 100, y: 0 }]] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.elementos[0].tipo, 'rectangulo');
  assert.strictEqual(r.data.total, 1);
  assert.ok(/LLM/.test(r.data.nota), 'la nota aclara que la intención la pone el LLM');
});
test('motor caído → 503 sin_motor', async () => {
  const m = nuevo(); m._motorCall = async () => { throw new Error('x'); };
  const r = await m._interpretar({ trazos: [[{ x: 0, y: 0 }]] });
  assert.strictEqual(r.status, 503); assert.strictEqual(r.error.details.motivo, 'sin_motor');
});
test('{fallo} → 502 INTERPRETACION_FALLIDA', async () => {
  const m = nuevo(); m._motorCall = async () => ({ status: 200, body: { fallo: { tipo: 'demasiado_grande', motivo: 'x' } } });
  assert.strictEqual((await m._interpretar({ trazos: [[]] })).status, 502);
});
test('sin trazos (no-array) → 400', async () => {
  const m = nuevo(); m._motorCall = async () => ({ status: 200, body: { elementos: [] } });
  assert.strictEqual((await m._interpretar({})).status, 400);
});
(async () => { let ok=0; const f=[]; for (const {n,f:fn} of tests){try{await fn();ok++}catch(e){f.push({n,e})}} if(!f.length){console.log(`\n[motor-trazo__index] OK ${ok}/${tests.length}`);process.exit(0)} console.error(`\n[motor-trazo__index] FAIL ${f.length}`); for(const{n,e}of f)console.error(`  x ${n}\n    ${e.message}`); process.exit(1); })();
