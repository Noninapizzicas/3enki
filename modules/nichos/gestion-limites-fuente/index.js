/**
 * nichos/gestion-limites-fuente — REFLEJO JS PURO: cero pensar, solo calcular.
 *
 * J3 del plan: gestiona los límites/cola/rate de consultas a las fuentes de datos
 * para no quemar el recurso (rate limit, cola de consultas, presupuesto por fuente).
 * Es una política DETERMINISTA: dado el límite declarado de una fuente y las
 * consultas ya hechas (ambas llegan por input, STATELESS — no persiste nada),
 * decide si permite la siguiente consulta, la encola o la deniega.
 *
 * Sin estado, sin red, sin store; cada op es una función pura (entra objeto, sale
 * objeto). Dos cálculos:
 *   dosificar  dado el límite declarado de la fuente y las consultas ya hechas →
 *              PERMITIR | ENCOLAR | DENEGAR (no quemar el recurso).
 *   encolar    añade una consulta a la cola dada (input) → cola resultante; si la
 *              cola está llena → DENEGADO con par de fallo determinista.
 * Si falta el límite declarado, NO inventa uno: responde par de fallo (422).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class GestionLimitesFuente extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'gestion-limites-fuente';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  // Dosifica un pedido de consulta: decide PERMITIR | ENCOLAR | DENEGAR según límite y consultas hechas.
  onDosificarRequest(e) {
    return this._atender(e, 'dosificar', 'nichos.fuente.dosificar.response', async (d) => {
      const res = this._dosificar(d);
      // Fire-and-forget de dominio: éxito → dosificado; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.fuente.dosificado', res.data);
      } else {
        this.eventBus?.publish('nichos.fuente.dosificar.failed', res);
      }
      return res;
    });
  }

  // Encola una consulta en la cola dada (input): devuelve la cola resultante.
  onEncolarRequest(e) {
    return this._atender(e, 'encolar', 'nichos.fuente.encolar.response', async (d) => {
      const res = this._encolar(d);
      if (res.status === 200) {
        this.eventBus?.publish('nichos.fuente.encolado', res.data);
      } else {
        this.eventBus?.publish('nichos.fuente.encolar.failed', res);
      }
      return res;
    });
  }

  // Proyección pura: política determinista de rate/limite por fuente.
  // {fuente, limite, consultas_hechas, cola_ocupada} -> PERMITIR|ENC OLAR|DENEGAR.
  _dosificar({ fuente, limite, consultas_hechas = 0, cola_ocupada = 0, max_cola = 100 } = {}) {
    if (!fuente || typeof fuente !== 'string') {
      return this._errorResponse(400, 'INVALID_INPUT', 'fuente requerida', { field: 'fuente' });
    }
    // El límite declarado de la fuente es OBLIGATORIO: si falta, NO se inventa -> par de fallo.
    if (!(Number(limite) >= 0)) {
      return this._errorResponse(422, 'LIMITE_FALTANTE',
        `no hay limite declarado para la fuente '${fuente}'; declara uno antes de dosificar`, { fuente });
    }
    const hechas = Number(consultas_hechas) || 0;
    let decision;
    if (hechas < Number(limite)) {
      decision = 'PERMITIR';
    } else if (Number(cola_ocupada) >= Number(max_cola)) {
      decision = 'DENEGAR';
    } else {
      decision = 'ENCOLAR';
    }
    return {
      status: 200,
      data: {
        fuente,
        decision,
        permitido: decision === 'PERMITIR',
        consultas_hechas: hechas,
        limite: Number(limite),
        pendientes_hasta_limite: Math.max(0, Number(limite) - hechas)
      }
    };
  }

  // Proyección pura: encola una consulta en la cola dada como input (stateless).
  // {fuente, solicitud, cola:[], max_cola} -> cola resultante + posicion.
  _encolar({ fuente, solicitud, cola = [], max_cola = 100 } = {}) {
    if (!fuente || typeof fuente !== 'string') {
      return this._errorResponse(400, 'INVALID_INPUT', 'fuente requerida', { field: 'fuente' });
    }
    if (!solicitud || typeof solicitud !== 'object') {
      return this._errorResponse(400, 'INVALID_INPUT', 'solicitud requerida', { field: 'solicitud' });
    }
    const colaEntrada = Array.isArray(cola) ? cola.slice() : [];
    if (colaEntrada.length >= Number(max_cola)) {
      return this._errorResponse(429, 'COLA_LLENA',
        `la cola de la fuente '${fuente}' esta llena (${colaEntrada.length} >= ${max_cola}); deniega sin encolar`, { fuente });
    }
    const posicion = colaEntrada.length + 1;
    colaEntrada.push({ ...solicitud, posicion });
    return {
      status: 200,
      data: {
        fuente,
        solicitud,
        posicion,
        encolado: true,
        total_en_cola: colaEntrada.length,
        cola: colaEntrada
      }
    };
  }
}

module.exports = GestionLimitesFuente;
