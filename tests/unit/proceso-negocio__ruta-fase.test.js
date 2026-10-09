// Test · _rutaArchivoFase — la vertical SIN proyecto escribe en boveda/<vertical>/proceso/
// y el modo proyecto (sin vertical) sigue en proceso-negocio/. Rutas SIEMPRE relativas.
'use strict';
const path = require('path');

const MOD = path.join(__dirname, '..', '..', 'modules', 'proceso-negocio', 'index.js');
const Proceso = require(MOD);

let ok = 0, fail = 0;
function t(nombre, actual, esperado) {
  if (actual === esperado) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fail++; console.log(`  x ${nombre}\n+ actual:   ${JSON.stringify(actual)}\n- esperado: ${JSON.stringify(esperado)}`); }
}

const inst = new Proceso();

// CON vertical → boveda/<vertical>/proceso/<fase>.json (skill enki-vertical-por-subagentes)
t("con vertical → boveda/contabilidad/proceso/fase3b-adaptador.json",
  inst._rutaArchivoFase('contabilidad', 'fase3b-adaptador'),
  'boveda/contabilidad/proceso/fase3b-adaptador.json');

t("con vertical nichos → boveda/nichos/proceso/fase0-identidad-negocio.json",
  inst._rutaArchivoFase('nichos', 'fase0-identidad-negocio'),
  'boveda/nichos/proceso/fase0-identidad-negocio.json');

// SIN vertical → el modo proyecto original, INTACTO
t("sin vertical → proceso-negocio/fase3-planificar-construccion.json (modo proyecto intacto)",
  inst._rutaArchivoFase(null, 'fase3-planificar-construccion'),
  'proceso-negocio/fase3-planificar-construccion.json');

t("vertical undefined → modo proyecto (no explota)",
  inst._rutaArchivoFase(undefined, 'fase6-decidir-interfaz'),
  'proceso-negocio/fase6-decidir-interfaz.json');

// RELATIVA SIEMPRE — ninguna ruta absoluta de máquina
for (const v of ['contabilidad', 'nichos', null]) {
  const r = inst._rutaArchivoFase(v, 'fase7b-ensamblaje');
  t(`ruta relativa (${v ?? 'sin vertical'})`, path.isAbsolute(r), false);
}

console.log(fail === 0 ? `\\nPASS ${ok}/${ok + fail}` : `\\nFAIL ${fail}/${ok + fail}`);
process.exit(fail === 0 ? 0 : 1);