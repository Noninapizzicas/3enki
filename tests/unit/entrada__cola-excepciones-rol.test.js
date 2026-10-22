/**
 * Test de CONTRATO — la cola de excepciones tiene UN solo escritor.
 *
 * Medido en producción (2026-10-22): `encolado-excepcion` exige
 * `rol: 'ENCOLADO_EXCEPCION'` en el evento (es el rol del ESCRITOR de la parcela, single-writer).
 * Cinco módulos publicaban con SU PROPIO rol (`CONTROL_CUADRE_DOCUMENTO`, `CRUCE_FACTURA_RECEPCION`,
 * `PARTIDA_NO_IDENTIFICADA`, `ETIQUETADO_ANALITICO`, `DESATASCO_ENTRADA`) → el custodio respondía
 * 403 PERMISSION_DENIED y la excepción se perdía EN SILENCIO: un documento descuadrado no se
 * asentaba (bien) pero tampoco quedaba en la cola (mal: desaparecía del radar).
 *
 * Este test recorre todos los módulos de contabilidad y falla si alguien vuelve a mandar su rol
 * en el campo del escritor. El emisor se declara en `origen`, no en `rol`.
 *
 * Ejecutar: node tests/unit/entrada__cola-excepciones-rol.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '../..');
const MODULES = path.join(RAIZ, 'modules');
const EVENTO = 'encolado-excepcion.encolar.request';
const ROL_ESCRITOR = 'ENCOLADO_EXCEPCION';

function verticales() {
  return fs.readdirSync(MODULES)
    .filter((d) => d.startsWith('contabilidad-'))
    .map((d) => path.join(MODULES, d));
}

function ficherosIndex(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const idx = path.join(dir, e.name, 'index.js');
    if (fs.existsSync(idx)) out.push(idx);
  }
  return out;
}

const hallazgos = [];
let emisores = 0;

for (const vertical of verticales()) {
  for (const fichero of ficherosIndex(vertical)) {
    const src = fs.readFileSync(fichero, 'utf-8');
    let desde = 0;
    for (;;) {
      const i = src.indexOf(`publish('${EVENTO}'`, desde);
      if (i === -1) break;
      desde = i + 1;
      emisores++;
      const bloque = src.slice(i, i + 900);
      const m = bloque.match(/rol:\s*'([A-Z_]+)'/);
      const modulo = path.basename(path.dirname(fichero));
      if (!m) {
        hallazgos.push(`${modulo}: publica a la cola SIN rol (el custodio exige ${ROL_ESCRITOR})`);
      } else if (m[1] !== ROL_ESCRITOR) {
        hallazgos.push(`${modulo}: rol '${m[1]}' (debe ser '${ROL_ESCRITOR}'; el emisor va en 'origen')`);
      }
    }
  }
}

assert.ok(emisores >= 5, `se esperaban varios emisores de la cola, encontrados ${emisores}`);
assert.deepStrictEqual(hallazgos, [], 'emisores con rol incorrecto:\n  ' + hallazgos.join('\n  '));

// Y control-cuadre debe llevar el DOCUMENTO en la clave (sin `s/ref` fijo, dos descuadres
// distintos colisionaban y el custodio tomaba el segundo por duplicado).
const cuadre = fs.readFileSync(
  path.join(MODULES, 'contabilidad-entrada/control-cuadre-documento/index.js'), 'utf-8');
assert.ok(/clave:\s*`cuadre:\$\{res\.data\.clave \|\| res\.data\.documento_id \|\| 's\/ref'\}`/.test(cuadre),
  'la clave del cuadre debe incluir la referencia del documento');
assert.ok(/_claveDoc\(/.test(cuadre), 'la referencia del documento se deriva en _claveDoc');

console.log(`OK · cola de excepciones: ${emisores} emisores, todos con rol ${ROL_ESCRITOR}`);
