'use strict';

/**
 * P3 · Validador de salidas fuzzy — REFLEJO puro (del esquema del motor).
 *
 * Comprueba la salida generada por el puerto fuzzy contra reglas FIJAS, ANTES
 * de que el pipeline continúe. Cero juicio, cero red, cero estado.
 *
 * Reglas soportadas (objeto):
 *   { campos: ['nombre', 'version'],        // campos requeridos (objeto)
 *     tamano_min: 100,                      // longitud mínima (string) o nº de claves (objeto)
 *     tipo: 'object' | 'string' }           // tipo esperado
 *
 * Devuelve: { ok: true } | { ok: false, regla, detalle }
 */

function validar(salida, reglas = {}) {
  if (!reglas || Object.keys(reglas).length === 0) {
    return { ok: true, regla: 'sin_reglas', detalle: 'sin reglas declaradas: la salida pasa sin comprobar' };
  }

  if (reglas.tipo) {
    const esperado = reglas.tipo;
    const real = Array.isArray(salida) ? 'array' : typeof salida;
    if (real !== esperado) {
      return { ok: false, regla: 'tipo', detalle: `tipo ${real} != esperado ${esperado}` };
    }
  }

  if (reglas.campos && Array.isArray(reglas.campos)) {
    const esObjeto = salida && typeof salida === 'object' && !Array.isArray(salida);
    if (!esObjeto) {
      return { ok: false, regla: 'campos', detalle: 'se esperaba un objeto con campos' };
    }
    const faltantes = reglas.campos.filter(c => salida[c] === undefined || salida[c] === null || salida[c] === '');
    if (faltantes.length > 0) {
      return { ok: false, regla: 'campos', detalle: `campos faltantes o vacíos: ${faltantes.join(', ')}` };
    }
  }

  if (typeof reglas.tamano_min === 'number') {
    let tam;
    if (typeof salida === 'string') {
      tam = salida.length;
    } else if (salida && typeof salida === 'object' && 'content' in salida && typeof salida.content === 'string') {
      tam = salida.content.length;   // la canónica {content} mide su contenido real
    } else if (salida && typeof salida === 'object') {
      // Multi-archivo (F4 construir-modulos, F7 construir-interfaz): el LLM
      // devuelve { index.js: '<código>', module.json: '<json>', slug: 'x' } —
      // el tamaño debe medir el CONTENIDO real (suma de los valores string),
      // NO el nº de claves. Lección en vivo: construir-modulos rechazaba
      // "tamaño 3 < mínimo 200" con 4.964 tokens de código generados — el LLM
      // respondía bien (3 claves), el validador medía mal (Object.keys).
      const valores = Object.values(salida).filter(v => typeof v === 'string');
      tam = valores.length
        ? valores.reduce((acc, v) => acc + v.length, 0)
        : Object.keys(salida).length;
    } else {
      tam = 0;
    }
    if (tam < reglas.tamano_min) {
      return { ok: false, regla: 'tamano_min', detalle: `tamaño ${tam} < mínimo ${reglas.tamano_min}` };
    }
  }

  return { ok: true, regla: 'todas', detalle: 'salida válida' };
}

module.exports = { validar };
