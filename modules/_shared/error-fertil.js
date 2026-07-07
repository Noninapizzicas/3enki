'use strict';

/**
 * error-fertil — traduce un código canónico de error en un DIAGNÓSTICO FÉRTIL.
 *
 * El problema que resuelve: un error crudo (`504`, `timeout`, código pelado) llega al LLM
 * como RUIDO, y el ruido sin interpretar colapsa en el prior pesimista ("está roto, hazlo a
 * mano"). La interpretación del fallo de una tool es conocimiento DETERMINISTA (la tool sabe
 * que 504 sobre un scraper = throttle, no "motor caído"). Este banco pone esa interpretación
 * en la capa determinista, no en el prior fuzzy del LLM: el error nace con su CLASE, su
 * DIAGNÓSTICO, el SIGUIENTE paso que resuelve, y lo que NO es (mata el prior falso explícito).
 *
 * Es la Lente de Análisis Profundo aplicada a los errores: todo Diagnóstico nace fértil.
 *
 * Uso (desde el loader de tools_http y de cualquier reflejo que quiera errores fértiles):
 *   const { enriquecerError } = require('../_shared/error-fertil');
 *   const error = enriquecerError('UPSTREAM_UNREACHABLE', { message, details });
 *   // → { code, message, details?, clase, reintentable, diagnostico, siguiente, no_es:[] }
 */

/** Las tres clases de fallo — determinan la POSTURA correcta del LLM. */
const CLASES = Object.freeze({
  TRANSITORIO: 'TRANSITORIO', // pasa solo: reintenta con backoff / ve más lento
  TERMINAL: 'TERMINAL',       // no cambia reintentando igual: corrige el objetivo concreto
  CONFIG: 'CONFIG',           // falta/está mal algo de configuración: credencial, args, endpoint
  DESCONOCIDO: 'DESCONOCIDO'  // sin clasificar: reintenta UNA vez, luego reporta crudo (no asumas)
});

/**
 * Tabla código-canónico → prescripción. Los códigos son los que emite el loader
 * (`_mapHttpStatusToCanonCode`) y el errors.contract del sistema.
 */
const TABLA = Object.freeze({
  RATE_LIMITED: {
    clase: CLASES.TRANSITORIO, reintentable: true,
    diagnostico: 'el upstream te está FRENANDO (throttle/rate-limit) — el motor está sano, solo vas demasiado rápido',
    siguiente: 'espera y reintenta con backoff (4s, 8s, 16s); baja el ritmo a 1 llamada cada 2-4s; si persiste, marca ESTE ítem pendiente y SIGUE con el resto',
    no_es: ['el motor caído', 'el recurso inexistente', 'una razón para rendirse']
  },
  UPSTREAM_TIMEOUT: {
    clase: CLASES.TRANSITORIO, reintentable: true,
    diagnostico: 'el upstream tardó más del límite — casi siempre lentitud puntual o throttle, NO que el motor esté caído',
    siguiente: 'reintenta con backoff; si dudas del motor, prueba una URL NEUTRA (health o un sitio simple) — si esa responde, el motor va y el fallo es del sitio destino',
    no_es: ['el motor caído', 'el sitio "inscrapeable"', 'un fallo permanente']
  },
  UPSTREAM_UNREACHABLE: {
    clase: CLASES.TRANSITORIO, reintentable: true,
    diagnostico: 'el motor local o el upstream no respondió a tiempo (502/503/504) — puede ser THROTTLE del sitio destino o el servicio arrancando, no necesariamente algo roto',
    siguiente: 'comprueba que el servicio corre (su /health o una URL neutra) ANTES de concluir nada; reintenta con backoff; si el health va pero el destino no, es el destino frenándote → ve más lento',
    no_es: ['el motor definitivamente caído', 'la web "un SPA inscrapeable"', 'motivo para caer al fallback manual sin más']
  },
  UPSTREAM_INVALID_RESPONSE: {
    clase: CLASES.TERMINAL, reintentable: false,
    diagnostico: 'el upstream respondió algo que no se puede parsear/usar — reintentar IGUAL dará lo mismo',
    siguiente: 'no reintentes idéntico; revisa el endpoint/shape esperado o el response_path; si es un 5xx del upstream, espera y reintenta UNA vez por si fue transitorio',
    no_es: ['throttle', 'input tuyo mal formado']
  },
  PERMISSION_DENIED: {
    clase: CLASES.CONFIG, reintentable: false,
    diagnostico: 'credencial o permiso rechazado (401/403) — reintentar igual NO lo arregla',
    siguiente: 'revisa la credencial (id, scope, caducidad) en credential-manager; corrige y reintenta una vez',
    no_es: ['throttle transitorio', 'el motor caído']
  },
  RESOURCE_NOT_FOUND: {
    clase: CLASES.TERMINAL, reintentable: false,
    diagnostico: 'el recurso no existe en esa URL/identificador (404) — la petición está bien pero apunta a nada',
    siguiente: 'corrige la URL/identificador (¿slug inventado? ¿id mal?); descubre el recurso real antes de volver a pedir; no reintentes idéntico',
    no_es: ['el motor caído', 'throttle']
  },
  INVALID_INPUT: {
    clase: CLASES.CONFIG, reintentable: false,
    diagnostico: 'el request iba mal formado (400/4xx) — el upstream lo rechazó por su contenido, no por carga',
    siguiente: 'lee el mensaje del upstream y CORRIGE los argumentos (campo que falta, formato, esquema); reintenta ya corregido',
    no_es: ['throttle', 'el motor caído', 'motivo para rendirse']
  },
  CONFLICT_STATE: {
    clase: CLASES.TERMINAL, reintentable: false,
    diagnostico: 'estado en conflicto (409) — la operación choca con el estado actual',
    siguiente: 'resuelve el conflicto (relee el estado, ajusta la operación) antes de reintentar',
    no_es: ['throttle', 'input mal formado']
  },
  UNKNOWN_ERROR: {
    clase: CLASES.DESCONOCIDO, reintentable: true,
    diagnostico: 'fallo no clasificado — aún no sabes si es transitorio o terminal',
    siguiente: 'reintenta UNA vez; si persiste, reporta el error crudo tal cual y sigue con lo demás — NO asumas que "todo está roto"',
    no_es: ['necesariamente permanente', 'motivo para abandonar la tarea entera']
  }
});

const _DEFAULT = TABLA.UNKNOWN_ERROR;

/**
 * Enriquece un error con su prescripción fértil.
 * @param {string} code  código canónico (RATE_LIMITED, UPSTREAM_TIMEOUT, …)
 * @param {{message?: string, details?: any}} [opts]
 * @returns {{code, message, details?, clase, reintentable, diagnostico, siguiente, no_es}}
 */
function enriquecerError(code, opts = {}) {
  const receta = TABLA[code] || _DEFAULT;
  const out = {
    code: code || 'UNKNOWN_ERROR',
    message: opts.message || receta.diagnostico,
    clase: receta.clase,
    reintentable: receta.reintentable,
    diagnostico: receta.diagnostico,
    siguiente: receta.siguiente,
    no_es: receta.no_es
  };
  if (opts.details !== undefined) out.details = opts.details;
  return out;
}

/** ¿Este código merece reintento con backoff (transitorio)? Para gating programático (rail). */
function esReintentable(code) {
  return (TABLA[code] || _DEFAULT).reintentable === true;
}

module.exports = { enriquecerError, esReintentable, CLASES, TABLA };
