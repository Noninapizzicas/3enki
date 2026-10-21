// Test · recomponedor tolerante a los DOS vocabularios de espina
'use strict';
const path = require('path');
const { Ensamblaje } = require(path.join(__dirname, '..', '..', 'modules', 'proceso-negocio', 'recomponedor'));

let ok = 0, fail = 0;
function t(nombre, actual, esperado) {
  if (JSON.stringify(actual) === JSON.stringify(esperado)) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fail++; console.log(`  x ${nombre}\n+ actual:   ${JSON.stringify(actual)}\n- esperado: ${JSON.stringify(esperado)}`); }
}

// La misma vertical en los DOS vocabularios debe recomponer IGUAL.
const realCierre = {
  emisor: { existe: true, subscribes: [], publishes: ['x.hecho'], tiene_interfaz: false },
  consumidor: { existe: true, subscribes: ['x.hecho'], publishes: [], tiene_interfaz: false }
};

const planCanon = { hojas: [
  { slug: 'emisor', subscribes: [], publishes: [{ event: 'x.hecho' }] },
  { slug: 'consumidor', subscribes: [{ event: 'x.hecho' }], publishes: [] }
] };
const planHabla = { hojas: [
  { slug: 'emisor', sube: [], publica: [{ event: 'x.hecho' }] },
  { slug: 'consumidor', sube: [{ event: 'x.hecho' }], publica: [] }
] };

const infCanon = new Ensamblaje(planCanon, realCierre).recomponer();
const infHabla = new Ensamblaje(planHabla, realCierre).recomponer();
t('vocabulario canon (subscribes/publishes) cierra', infCanon.ensamblado, true);
t('vocabulario habla (sube/publica) cierra IGUAL', infHabla.ensamblado, true);
t('mismas cifras en ambos vocabularios',
  [infHabla.total_hojas, infHabla.hojas_escritas, infHabla.conexiones_rotas_count],
  [infCanon.total_hojas, infCanon.hojas_escritas, infCanon.conexiones_rotas_count]);

// Con sube/publica, una falta de consumidor debe dar SOBRA_EL_PUBLISH y trabajo []
const planHablaSolo = { hojas: [{ slug: 'emisor', sube: [], publica: ['y.solo'] }] };
const infSolo = new Ensamblaje(planHablaSolo, { emisor: realCierre.emisor }).recomponer();
t('habla: publish sin consumidor → sobra_el_publish 1', infSolo.conexiones_sobra_el_publish, 1);

// Y FALTA_CABLEAR con el vocabulario habla: consumidor escrito pero sin oreja
const planHablaCable = { hojas: [
  { slug: 'a', sube: [], publica: ['z.hecho'] },
  { slug: 'b', sube: ['z.hecho'], publica: [] }
] };
const realSinCable = {
  a: { existe: true, subscribes: [], publishes: ['z.hecho'], tiene_interfaz: false },
  b: { existe: true, subscribes: [], publishes: [], tiene_interfaz: false }
};
const infCable = new Ensamblaje(planHablaCable, realSinCable).recomponer();
t('habla: falta_cablear 1 con trabajo accionable',
  infCable.trabajo, [{ evento: 'z.hecho', cablear_en: ['b'] }]);

// Hoja mixta (trae AMBOS) — el canon manda, sube/publica de refuerzo
const planMixto = { hojas: [{ slug: 'm', subscribes: [{ event: 'q.escucha' }], publica: ['q.hecho'] }] };
const infMixto = new Ensamblaje(planMixto, { m: realCierre.emisor }).recomponer();
t('mixto: lee el canon (subscribes) sin romper', infMixto.hojas_escritas, 1);

console.log(fail === 0 ? `\nPASS ${ok}/${ok + fail}` : `\nFAIL ${fail}/${ok + fail}`);
process.exit(fail === 0 ? 0 : 1);