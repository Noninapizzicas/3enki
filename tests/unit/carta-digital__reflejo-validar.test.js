'use strict';

/**
 * carta-digital — _checkDiseno / validar / gate de guardar (EL FRENO, skill blueprint-agentico).
 *
 * El cajón disenar_carta_digital compone un card_template (HTML de UN producto) con un CONTRATO
 * DE SLOTS: el runtime rellena {{id}} {{nombre}} {{precio}} {{alergenos}} {{add_label}} y delega
 * los clics por data-accion="detalle"/"add". Si el LLM se deja un slot, ese campo NO renderiza:
 * un diseño "listo" sin precio (carta rota), sin alérgenos (ILEGAL 1169/2011) o sin botón de pedir.
 *
 * El freno ya existía pero incompleto (solo {{id}}/{{nombre}}/data-accion). Esta suite fija el
 * contrato COMPLETO + el gate de guardar + el responder validar.
 *
 * Ejecutar: node tests/unit/carta-digital__reflejo-validar.test.js
 */

const assert = require('assert');
const CartaDigital = require('../../modules/pizzepos/carta-digital');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// card_template que cumple el contrato completo.
const CARD_OK = `
<article class="prod" data-producto-id="{{id}}" data-accion="detalle">
  <div class="visual">{{visual}}</div>
  <h3>{{nombre}}</h3>
  <span class="badge">{{gancho}}</span>
  <p class="desc">{{descripcion}}</p>
  <div class="alg">{{alergenos}}</div>
  <span class="precio">{{precio}}</span>
  <button data-accion="add" data-producto-id="{{id}}">{{add_label}}</button>
</article>`;

function nuevo() {
  const m = new CartaDigital();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.responses = [];
  m.writes = [];
  m.eventBus = {
    publish: (ev, p) => { m.responses.push([ev, p]); },
    subscribe: () => () => {}
  };
  // _guardarDiseno usa _rpc('fs.write.request'); lo stubeamos a éxito
  m._rpc = async (ev, payload) => {
    if (ev === 'fs.write.request') { m.writes.push(payload); return { status: 200 }; }
    return null;
  };
  return m;
}

const ultimaResp = (m, ev) => [...m.responses].reverse().find(r => r[0] === ev)?.[1];

test('card_template completo → ok:true sin errores', () => {
  const m = nuevo();
  const c = m._checkDiseno({ card_template: CARD_OK, tema_css: 'body{}' });
  assert.strictEqual(c.ok, true, JSON.stringify(c.errors));
});

test('falta {{precio}} → SLOTS_FALTAN incluye {{precio}} (carta rota)', () => {
  const m = nuevo();
  const c = m._checkDiseno({ card_template: CARD_OK.replace('{{precio}}', '') });
  assert.strictEqual(c.ok, false);
  const e = c.errors.find(x => x.code === 'SLOTS_FALTAN');
  assert.ok(e && e.faltan.includes('{{precio}}'));
});

test('falta {{alergenos}} → SLOTS_FALTAN (ILEGAL 1169/2011)', () => {
  const m = nuevo();
  const c = m._checkDiseno({ card_template: CARD_OK.replace('{{alergenos}}', '') });
  assert.strictEqual(c.ok, false);
  assert.ok(c.errors.find(x => x.code === 'SLOTS_FALTAN').faltan.includes('{{alergenos}}'));
});

test('falta el hook data-accion="detalle" → HOOK_DETALLE_AUSENTE', () => {
  const m = nuevo();
  const c = m._checkDiseno({ card_template: CARD_OK.replace('data-accion="detalle"', 'class="x"') });
  assert.strictEqual(c.ok, false);
  assert.ok(c.errors.some(x => x.code === 'HOOK_DETALLE_AUSENTE'));
});

test('falta el hook data-accion="add" → HOOK_ADD_AUSENTE', () => {
  const m = nuevo();
  const c = m._checkDiseno({ card_template: CARD_OK.replace('data-accion="add"', 'class="y"') });
  assert.strictEqual(c.ok, false);
  assert.ok(c.errors.some(x => x.code === 'HOOK_ADD_AUSENTE'));
});

test('{{add_label}} NO satisface el hook add (no confundir slot con data-accion)', () => {
  const m = nuevo();
  // un template con el slot {{add_label}} pero SIN data-accion="add" debe fallar el hook
  const tpl = '<article data-producto-id="{{id}}" data-accion="detalle"><h3>{{nombre}}</h3>{{precio}}{{alergenos}}<button>{{add_label}}</button></article>';
  const c = m._checkDiseno({ card_template: tpl });
  assert.ok(c.errors.some(x => x.code === 'HOOK_ADD_AUSENTE'), 'el slot {{add_label}} no es el hook data-accion="add"');
});

test('JS inline (onclick) → JS_EN_TEMPLATE', () => {
  const m = nuevo();
  const c = m._checkDiseno({ card_template: CARD_OK.replace('<button ', '<button onclick="add()" ') });
  assert.strictEqual(c.ok, false);
  assert.ok(c.errors.some(x => x.code === 'JS_EN_TEMPLATE'));
});

test('card_template ausente/no-string → CARD_TEMPLATE_AUSENTE', () => {
  const m = nuevo();
  assert.strictEqual(m._checkDiseno({ tema_css: 'x' }).ok, false);
  assert.ok(m._checkDiseno({}).errors.some(x => x.code === 'CARD_TEMPLATE_AUSENTE'));
});

test('validar.request → responde 200 con {valid:true} para diseño completo', async () => {
  const m = nuevo();
  await m._onValidarRequest({ data: { request_id: 'r1', project_id: 'p', diseno: { card_template: CARD_OK } } });
  const resp = ultimaResp(m, 'cartadigital.validar.response');
  assert.strictEqual(resp.status, 200);
  assert.strictEqual(resp.data.valid, true);
});

test('validar.request → 200 con {valid:false, errors} para diseño sin precio', async () => {
  const m = nuevo();
  await m._onValidarRequest({ data: { request_id: 'r2', project_id: 'p', diseno: { card_template: CARD_OK.replace('{{precio}}', '') } } });
  const resp = ultimaResp(m, 'cartadigital.validar.response');
  assert.strictEqual(resp.data.valid, false);
  assert.ok(resp.data.errors.length > 0);
});

test('gate de guardar: diseño inválido → 422 INVALID_DESIGN y NO escribe', async () => {
  const m = nuevo();
  await m._onGuardarDisenoRequest({ data: { request_id: 'g1', project_id: 'p', diseno: { card_template: CARD_OK.replace('{{alergenos}}', '') } } });
  const resp = ultimaResp(m, 'cartadigital.guardar_diseno.response');
  assert.strictEqual(resp.status, 422);
  assert.strictEqual(resp.error.code, 'INVALID_DESIGN');
  assert.strictEqual(m.writes.length, 0, 'NO debe persistir un diseño que rompe el contrato');
});

test('gate de guardar: diseño válido → escribe y responde 200', async () => {
  const m = nuevo();
  await m._onGuardarDisenoRequest({ data: { request_id: 'g2', project_id: 'p', diseno: { card_template: CARD_OK, tema_css: 'body{}' } } });
  const resp = ultimaResp(m, 'cartadigital.guardar_diseno.response');
  assert.strictEqual(resp.status, 200);
  assert.ok(m.writes.length >= 1, 'debe persistir el diseño válido');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[carta-digital__reflejo-validar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[carta-digital__reflejo-validar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
