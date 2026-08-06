'use strict';

/**
 * P4 · Verificador de entregable (el JEFE) — REFLEJO puro (del esquema del motor).
 *
 * Al final del pipeline, comprueba el entregable prometido contra el MUNDO REAL
 * a través de un PUERTO inyectado. Determinista: verificado:false = veredicto,
 * jamás éxito; nunca acepta la palabra del generador.
 *
 * Puerto mundo (inyectado — DI para testear sin fs real):
 *   mundo.existe(path)         → boolean
 *   mundo.leer(path)           → string | null
 *   mundo.enRepo(rel)          → boolean (si el sitio lo soporta; si el puerto
 *                                 no existe, la regla en_repo NO bloquea)
 *
 * Reglas (array de strings): 'existe' (default) · 'contenido_min' · 'api_real' · 'en_repo'
 *
 * Devuelve veredicto: { verificado, motivo, tipo, path, reglas: [{regla, ok, detalle}] }
 */

const REGLA_API_REAL = /require\s*\(\s*['"]\.\.\/\.\.\/_shared|require\s*\(\s*['"]\.\.\/\.\.\/_shared\/|_shared\//;

function _existe(rel, _entregable, mundo) {
  const ok = !!(mundo && typeof mundo.existe === 'function' && mundo.existe(rel));
  return { regla: 'existe', ok, detalle: ok ? `existe ${rel}` : `NO existe ${rel}` };
}

function _contenidoMin(rel, entregable, mundo) {
  if (!mundo || typeof mundo.leer !== 'function') {
    return { regla: 'contenido_min', ok: false, detalle: 'puerto leer() no disponible' };
  }
  const contenido = mundo.leer(rel) || '';
  const min = typeof entregable.min_chars === 'number' ? entregable.min_chars : 100;
  const ok = contenido.length >= min;
  return {
    regla: 'contenido_min',
    ok,
    detalle: ok
      ? `${contenido.length} chars (min ${min})`
      : `solo ${contenido.length} chars (min ${min}) — entregable vacío o incompleto`
  };
}

function _apiReal(rel, _entregable, mundo) {
  if (!mundo || typeof mundo.leer !== 'function') {
    return { regla: 'api_real', ok: false, detalle: 'puerto leer() no disponible' };
  }
  const contenido = mundo.leer(rel) || '';
  const llamaShared = REGLA_API_REAL.test(contenido);
  const atiende4 = /_atender\s*\(\s*evento\s*,\s*contexto\s*,\s*respuesta\s*,\s*siguiente\s*\)|_atender\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*\w+\s*\)/.test(contenido);
  const ok = llamaShared && atiende4;
  return {
    regla: 'api_real',
    ok,
    detalle: ok
      ? 'usa _shared y _atender con 4 args (patrón de módulo Enki)'
      : `patrón de módulo no completo (usa _shared: ${llamaShared}, _atender 4 args: ${atiende4})`
  };
}

function _enRepo(rel, _entregable, mundo) {
  if (!mundo || typeof mundo.enRepo !== 'function') {
    return { regla: 'en_repo', ok: true, detalle: 'repo no disponible → no bloquea' };
  }
  const resultado = mundo.enRepo(rel);
  if (resultado === undefined) {
    return { regla: 'en_repo', ok: true, detalle: 'repo no disponible → no bloquea' };
  }
  const ok = resultado === true;
  return { regla: 'en_repo', ok, detalle: ok ? `en repo ${rel}` : `NO está en el repo ${rel}` };
}

const REGLAS = {
  existe: _existe,
  contenido_min: _contenidoMin,
  api_real: _apiReal,
  en_repo: _enRepo
};

/**
 * @param {object} entregable { tipo:'fs', path, reglas:[...], min_chars? }
 * @param {object} mundo      puerto inyectado { existe, leer, enRepo }
 * @returns {object} veredicto
 */
function verificar(entregable, mundo) {
  if (!entregable || typeof entregable !== 'object' || !entregable.path) {
    return {
      verificado: false,
      motivo: 'entregable_sin_path',
      tipo: entregable && entregable.tipo,
      path: entregable && entregable.path,
      reglas: [{ regla: 'contrato', ok: false, detalle: 'entregable sin path declarado' }]
    };
  }

  const nombres = Array.isArray(entregable.reglas) && entregable.reglas.length > 0
    ? entregable.reglas
    : ['existe'];

  const reglas = nombres.map((nombre) => {
    const fn = REGLAS[nombre];
    if (!fn) {
      return { regla: nombre, ok: false, detalle: `regla desconocida: ${nombre}` };
    }
    return fn(entregable.path, entregable, mundo);
  });

  const verificado = reglas.every(r => r.ok);
  return {
    verificado,
    motivo: verificado ? 'entregable_verificado' : 'entregable_no_verificado',
    tipo: entregable.tipo || 'fs',
    path: entregable.path,
    reglas
  };
}

module.exports = { verificar };
