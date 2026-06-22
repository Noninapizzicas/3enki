/**
 * OrquestadorSandbox — ejecuta codigo JS escrito por el LLM cuya UNICA capacidad
 * es el bus de eventos. La cura de "una operacion por turno": el LLM escribe un
 * script que itera/ramifica sobre bus.publish / bus.publishAndWait, y este modulo
 * lo ejecuta determinista, colapsando N tool-calls fragiles en 1 ejecucion.
 *
 * SEGURIDAD — capability-based (allowlist, no blocklist):
 *   - El contexto vm SOLO recibe { bus, console, JSON, Math, Date, Promise, ... }.
 *   - NO hay require / process / fs / global / network -> el codigo no puede
 *     ALCANZAR nada fuera del bus. No hay nada que filtrar porque no hay puerta.
 *   - El radio de daño es IDENTICO al de hoy (el LLM ya tiene publish/publishAndWait
 *     uno a uno): execute_code solo le da iterar sobre ellas, no capacidad nueva.
 *   - Doble timeout: vm option (mata bucles SINCRONOS, p.ej. while(true){}) +
 *     Promise.race (mata cuelgues ASINCRONOS, p.ej. await que nunca resuelve).
 *
 * NO es una frontera contra un adversario (vm tiene escapes conocidos). El modelo
 * de amenaza aqui es "el LLM escribe codigo con bug o runaway", no "actor malicioso":
 * el autor es nuestro propio LLM de pagina ejecutando nuestros blueprints.
 */

'use strict';

const vm = require('vm');
const crypto = require('crypto');

// publishAndWait generico: publica <ev>.request y espera <ev>.response por
// request_id. Best-effort: si no llega en timeout_ms, resuelve null.
function _hacerRpc(eventBus) {
  return (evento, payload = {}, { timeout_ms = 8000 } = {}) => {
    if (!eventBus || !eventBus.subscribe || !eventBus.publish) return Promise.resolve(null);
    const request_id = crypto.randomUUID();
    const responseEvent = evento.endsWith('.request')
      ? evento.slice(0, -('.request'.length)) + '.response'
      : `${evento}.response`;
    return new Promise((resolve) => {
      let unsub = null;
      const t = setTimeout(() => { if (unsub) unsub(); resolve(null); }, timeout_ms);
      try {
        unsub = eventBus.subscribe(responseEvent, (event) => {
          const d = (event && event.data) || event;
          if (!d || d.request_id !== request_id) return;
          clearTimeout(t); if (unsub) unsub(); resolve(d);
        });
        eventBus.publish(evento, { request_id, ...payload });
      } catch (_) {
        clearTimeout(t); if (unsub) unsub(); resolve(null);
      }
    });
  };
}

function _safe(x) {
  if (typeof x === 'string') return x;
  try { return JSON.stringify(x); } catch (_) { return String(x); }
}

/**
 * Ejecuta `codigo` en el sandbox. Devuelve { resultado, logs }.
 * Lanza Error con _code ('INVALID_INPUT' | 'UPSTREAM_TIMEOUT') en fallo.
 */
async function ejecutarOrquestacion(codigo, opts = {}) {
  const {
    eventBus = null, project_id = null, correlation_id = null,
    timeout_ms = 30000, max_logs = 200, max_codigo = 20000
  } = opts;

  if (typeof codigo !== 'string' || !codigo.trim()) {
    const e = new Error('codigo requerido (string no vacio)'); e._code = 'INVALID_INPUT'; throw e;
  }
  if (codigo.length > max_codigo) {
    const e = new Error(`codigo demasiado largo (>${max_codigo})`); e._code = 'INVALID_INPUT'; throw e;
  }

  const corr = correlation_id || crypto.randomUUID();
  const logs = [];
  const rpc = _hacerRpc(eventBus);
  const enrich = (d) => (d && typeof d === 'object' && !Array.isArray(d))
    ? Object.assign({ project_id, correlation_id: corr }, d)
    : d;

  // bus inyectado: las MISMAS 2 primitivas del LLM, scopeadas + correladas.
  const bus = {
    publish: (topic, d) => { if (eventBus && eventBus.publish) eventBus.publish(topic, enrich(d || {})); },
    publishAndWait: (topic, d, o) => rpc(topic, enrich(d || {}), o || {})
  };
  const log = (...a) => { if (logs.length < max_logs) logs.push(a.map(_safe).join(' ')); };

  // Allowlist del contexto: SOLO esto existe dentro del codigo.
  const sandbox = {
    bus,
    console: { log, info: log, warn: log, error: log, debug: log },
    JSON, Math, Date, Promise, Object, Array, Number, String, Boolean
  };
  const context = vm.createContext(sandbox);

  const wrapped = `(async () => {\n${codigo}\n})()`;
  let script;
  try {
    script = new vm.Script(wrapped, { filename: 'orquestacion.js' });
  } catch (e) {
    const err = new Error('codigo invalido: ' + e.message); err._code = 'INVALID_INPUT'; err._logs = logs; throw err;
  }

  let timer;
  const total = new Promise((_, rej) => {
    timer = setTimeout(() => {
      const e = new Error('orquestacion timeout (async)'); e._code = 'UPSTREAM_TIMEOUT'; e._logs = logs.slice(); rej(e);
    }, timeout_ms);
  });

  try {
    // timeout sincrono del vm: corta bucles que nunca ceden (while(true){}).
    const ejec = script.runInContext(context, { timeout: timeout_ms });
    const resultado = await Promise.race([ejec, total]);
    return { resultado, logs: logs.slice(0, max_logs) };
  } catch (e) {
    if (e && e._code) throw e;
    // timeout sincrono del vm: code ERR_SCRIPT_EXECUTION_TIMEOUT / mensaje "timed out".
    if (e && (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || /tim(?:ed|e)\s*-?\s*out/i.test(e.message || ''))) {
      const err = new Error('orquestacion timeout (sincrono)'); err._code = 'UPSTREAM_TIMEOUT'; err._logs = logs.slice(); throw err;
    }
    const err = new Error(e && e.message ? e.message : 'error en orquestacion');
    err._code = 'EXEC_FAILED'; err._logs = logs.slice(); throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { ejecutarOrquestacion };
