'use strict';

/**
 * error-fertil — el banco que convierte un código de error en diagnóstico fértil.
 *
 * Verifica que cada código canónico nace con clase + prescripción + no_es, que la
 * clasificación transitorio/terminal/config es la correcta (lo que decide la postura
 * del LLM), y que el caso testigo —el 504 de soysuper— mata explícitamente el prior
 * falso ("web inscrapeable" / "motor caído") en vez de dejar que el LLM lo invente.
 *
 * Ejecutar: node tests/unit/error-fertil.test.js
 */

const assert = require('assert');
const { enriquecerError, esReintentable, CLASES } = require('../../modules/_shared/error-fertil');

function test(desc, fn) {
  try { fn(); console.log(`✓ ${desc}`); }
  catch (err) { console.error(`✗ ${desc}\n  ${err.message}`); process.exit(1); }
}

console.log('error-fertil — diagnóstico fértil de errores\n');

test('todo código enriquecido trae los campos fértiles (clase + siguiente + no_es)', () => {
  for (const code of ['RATE_LIMITED', 'UPSTREAM_TIMEOUT', 'UPSTREAM_UNREACHABLE', 'INVALID_INPUT', 'PERMISSION_DENIED', 'RESOURCE_NOT_FOUND', 'UNKNOWN_ERROR']) {
    const e = enriquecerError(code, { message: 'x' });
    assert.strictEqual(e.code, code);
    assert.ok(e.clase, `${code} sin clase`);
    assert.ok(e.diagnostico && e.diagnostico.length > 8, `${code} sin diagnóstico`);
    assert.ok(e.siguiente && e.siguiente.length > 8, `${code} sin siguiente-paso`);
    assert.ok(Array.isArray(e.no_es) && e.no_es.length > 0, `${code} sin no_es`);
    assert.strictEqual(typeof e.reintentable, 'boolean');
  }
});

test('clasificación: transitorio vs terminal vs config decide la postura', () => {
  assert.strictEqual(enriquecerError('RATE_LIMITED').clase, CLASES.TRANSITORIO);
  assert.strictEqual(enriquecerError('UPSTREAM_UNREACHABLE').clase, CLASES.TRANSITORIO);
  assert.strictEqual(enriquecerError('RESOURCE_NOT_FOUND').clase, CLASES.TERMINAL);
  assert.strictEqual(enriquecerError('INVALID_INPUT').clase, CLASES.CONFIG);
  assert.strictEqual(enriquecerError('PERMISSION_DENIED').clase, CLASES.CONFIG);
});

test('esReintentable: transitorios sí, terminales/config no', () => {
  assert.strictEqual(esReintentable('UPSTREAM_TIMEOUT'), true);
  assert.strictEqual(esReintentable('RATE_LIMITED'), true);
  assert.strictEqual(esReintentable('RESOURCE_NOT_FOUND'), false);
  assert.strictEqual(esReintentable('INVALID_INPUT'), false);
});

test('CASO TESTIGO — el 504 de soysuper mata el prior falso del LLM', () => {
  // El fallo que llevó al LLM a rendirse ("web inscrapeable, mételo a mano").
  const e = enriquecerError('UPSTREAM_UNREACHABLE', { message: 'HTTP 504' });
  assert.strictEqual(e.clase, CLASES.TRANSITORIO, 'un 504 NO es terminal');
  assert.strictEqual(e.reintentable, true);
  const noes = e.no_es.join(' ').toLowerCase();
  assert.ok(/inscrapeable|spa/.test(noes), 'debe negar explícitamente "web inscrapeable"');
  assert.ok(/caíd|caido/.test(noes), 'debe negar explícitamente "motor caído"');
  assert.ok(/backoff|reintenta|health/i.test(e.siguiente), 'el siguiente-paso debe prescribir reintento/verificación, no rendición');
});

test('código desconocido cae a UNKNOWN_ERROR fértil (no revienta)', () => {
  const e = enriquecerError('ALGO_RARO_QUE_NO_EXISTE', { message: 'm' });
  assert.ok(e.clase && e.siguiente && Array.isArray(e.no_es));
  assert.ok(/no asumas|reporta|reintenta/i.test(e.siguiente), 'ante lo desconocido, no asumir que todo está roto');
});

console.log('\n✓ error-fertil: todas las aserciones pasan');
