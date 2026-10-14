// Test · F7b herramienta completa: recomponedor.js
// (restaurado de 9813372f) — el cruce plan↔construido que declara 'ensamblado'.
'use strict';
const path = require('path');
const { Ensamblaje, normalizar, ES_TRANSPORTE } = require(path.join(__dirname, '..', '..', 'modules', 'proceso-negocio', 'recomponedor'));

let ok = 0, fail = 0;
function t(nombre, actual, esperado) {
  if (JSON.stringify(actual) === JSON.stringify(esperado)) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fail++; console.log(`  x ${nombre}\n+ actual:   ${JSON.stringify(actual)}\n- esperado: ${JSON.stringify(esperado)}`); }
}

// ── una vertical que CIERRA: ensamblado true ──
const planOK = { hojas: [
  { slug: 'emisor', subscribes: [], publishes: [{ event: 'x.hecho' }] },
  { slug: 'consumidor', subscribes: [{ event: 'x.hecho' }], publishes: [] }
] };
const realOK = {
  emisor: { existe: true, subscribes: [], publishes: ['x.hecho'], tiene_interfaz: false },
  consumidor: { existe: true, subscribes: ['x.hecho'], publishes: [], tiene_interfaz: false }
};
t('cierra → ensamblado true',
  new Ensamblaje(planOK, realOK).recomponer().ensamblado, true);

// ── hoja del plan sin módulo → NO_ESCRITA y no ensamblado ──
const realFalta = { emisor: realOK.emisor };  // consumidor no escrito
const infFalta = new Ensamblaje(planOK, realFalta).recomponer();
t('hoja no escrita → ensamblado false', infFalta.ensamblado, false);
t('hoja no escrita → hojas_no_escritas 1', infFalta.hojas_no_escritas, 1);

// ── FALTA_CABLEAR: el consumidor EXISTE pero no escucha ──
const realSinCable = {
  emisor: { existe: true, subscribes: [], publishes: ['x.hecho'], tiene_interfaz: false },
  consumidor: { existe: true, subscribes: [], publishes: [], tiene_interfaz: false }
};
const infCable = new Ensamblaje(planOK, realSinCable).recomponer();
t('sin cable → falta_cablear 1', infCable.conexiones_falta_cablear, 1);
t('sin cable → trabajo accionable',
  infCable.trabajo, [{ evento: 'x.hecho', cablear_en: ['consumidor'] }]);
t('sin cable → ensamblado false', infCable.ensamblado, false);

// ── SOBRA_EL_PUBLISH: nadie diseñado lo consume (futuro abierto) ──
const planSolo = { hojas: [{ slug: 'emisor', subscribes: [], publishes: [{ event: 'y.solo' }] }] };
const realSolo = { emisor: { existe: true, subscribes: [], publishes: ['y.solo'], tiene_interfaz: false } };
const infSolo = new Ensamblaje(planSolo, realSolo).recomponer();
t('publish sin consumidor diseñado → sobra_el_publish 1', infSolo.conexiones_sobra_el_publish, 1);
t('sobra → trabajo VACÍO (no es accionable)', infSolo.trabajo, []);

// ── transporte y pares de fallo NO cuentan como conexiones ──
t('ES_TRANSPORTE(.request)', ES_TRANSPORTE('a.op.request'), true);
t('ES_TRANSPORTE(.response)', ES_TRANSPORTE('a.op.response'), true);
t('ES_TRANSPORTE(pulso)=false', ES_TRANSPORTE('x.hecho'), false);

// ── normalizar acepta string, {event}, {evento} ──
t('normalizar mezcla formas',
  normalizar(['a.b', { event: 'c.d' }, { evento: 'e.f' }]).map(x => x.evento),
  ['a.b', 'c.d', 'e.f']);
t('normalizar no-array → []', normalizar(null), []);
t('normalizar dict (banco-ideas) → []', normalizar({ _crear: 1 }), []);

// ── divergencia por hoja: falta un publish declarado ──
const planPub = { hojas: [{ slug: 'a', subscribes: [], publishes: [{ event: 'z.falta' }, { event: 'z.hay' }] }] };
const realPub = { a: { existe: true, subscribes: [], publishes: ['z.hay'], tiene_interfaz: false } };
const infPub = new Ensamblaje(planPub, realPub).recomponer();
t('publish declarado ausente → divergente', infPub.hojas_divergentes, 1);
t('divergente → ensamblado false', infPub.ensamblado, false);

console.log(fail === 0 ? `\nPASS ${ok}/${ok + fail}` : `\nFAIL ${fail}/${ok + fail}`);
process.exit(fail === 0 ? 0 : 1);