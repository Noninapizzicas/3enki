/**
 * contabilidad-analitica/sello-cobertura — REFLEJO STATELESS (Q3, hoja del plan).
 *
 * La MARCA DE COMPLETITUD de lo consultado, FUERA de ciclo: si falta cobertura, lo DICE ANTES de
 * que el dueno decida — no espera al cierre.
 *   != `aviso-cuadre` (C6), que solo avisa al cierre.
 *
 * ⚠️ LEE LA METRICA UNICA, NO LA RECALCULA. La cobertura la produce `completitud-cobertura` (A12)
 * y la declara en `contabilidad.cobertura_medida`. Aqui se TOMA esa cobertura ya medida y se
 * SELLA con ella la respuesta consultada. Recalcularla seria una SEGUNDA metrica de cobertura.
 *
 * ATRIBUTOS del diseno: `cobertura:Cobertura`.
 *   METODOS: sellar(respuesta):Respuesta.
 *   REGLA: marca de completitud de lo consultado, FUERA de ciclo: si falta cobertura lo dice ANTES
 *          de que decida. LEE la metrica unica.
 *
 * Invariantes:
 *  - LEE, NO RECALCULA: la cobertura llega declarada, cacheada del evento o pedida a A12 POR EVENTO.
 *    Jamas se recomputa desde esperados/llegados.
 *  - SELLA LO QUE HAY: si la cobertura no consta, el sello es `SELLO_DESCONOCIDO` (no se afirma
 *    ni completo ni incompleto).
 *  - FUERA DE CICLO: sella en el momento de la consulta; no depende de ningun cierre.
 *  - DETERMINISTA y sin estado de dominio (una lectura cacheada, no una parcela).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja Q3 del plan-construccion y diseno-oop.md (CLASE SelloCobertura).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class SelloCobertura extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'sello-cobertura';
    this.version = 'reflejo-0.1.0';
    // ULTIMA metrica unica de cobertura OBSERVADA (por evento). LECTURA cacheada, no recalculo.
    this._cobertura = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onSellarRequest(e) {
    return this._atender(e, 'sellar', 'sello-cobertura.sellar.response', async (d) => {
      const res = await this._sellar(d);
      if (res.status !== 200) this.eventBus?.publish('sello-cobertura.sellar.failed', res);
      return res;
    });
  }

  // ── Fire-and-forget: LA metrica unica (A12) quedo medida → se LEE y se guarda para sellar ──
  onCoberturaMedida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    this._cobertura.set(d.project_id, d.cobertura || null);
    return { status: 200, data: { project_id: d.project_id, leida: 'contabilidad.cobertura_medida' } };
  }

  // ── Fire-and-forget: una respuesta consultada (Q1) se sella con la cobertura ANTES de decidir ──
  onRespuestaConsulta(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return this._sellar({ project_id: d.project_id, respuesta: d, vertical: d.vertical, correlation_id: d.correlation_id });
  }

  // ── proyeccion determinista: sellar(respuesta) → Respuesta sellada (LEE la metrica unica) ──
  async _sellar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // LA METRICA UNICA (A12): declarada, cacheada o LEIDA de su dueno POR EVENTO. No se recalcula.
    const cobertura = await this._leerCobertura(pid, input);

    // El SELLO: completo / incompleto / desconocido. Nada mas — no se inventa.
    const sello = this._sello(cobertura);

    const respuesta = input.respuesta && typeof input.respuesta === 'object' ? input.respuesta : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        // La respuesta SELLADA: la de antes + la marca de completitud. Nada se altera.
        respuesta: respuesta ? { ...respuesta, sello_cobertura: sello } : null,
        sello,
        cobertura,
        // Trazabilidad de la LECTURA: la metrica unica se lee, no se recalcula.
        lee_metrica_unica: true,
        recalcula_cobertura: false,
        fuera_de_ciclo: true,
        decide: false,
        // Si falta cobertura, se DICE ANTES de decidir (esa es la razon de ser del sello).
        avisa_antes_de_decidir: true,
        abierto: {
          cobertura: cobertura
            ? null
            : 'completitud-cobertura (A12) no respondio: el sello queda DESCONOCIDO (no se afirma ni completo ni incompleto)'
        },
        faltan: cobertura ? [] : ['cobertura']
      }
    };
  }

  // El SELLO derivado de la Cobertura LEIDA. Sin cobertura → DESCONOCIDO (no se afirma nada).
  _sello(cobertura) {
    if (!cobertura || typeof cobertura !== 'object') {
      return {
        estado: 'SELLO_DESCONOCIDO',
        completo: null,
        tasa: null,
        huecos: null,
        motivo: 'la metrica unica de cobertura no consta: no se sella ni completo ni incompleto'
      };
    }
    const completa = cobertura.completa === true;
    const declarada = cobertura.declarada !== false;
    return {
      estado: completa ? 'SELLO_COMPLETO' : (declarada ? 'SELLO_INCOMPLETO' : 'SELLO_DESCONOCIDO'),
      completo: completa,
      // La tasa y los huecos se COPIAN de la metrica unica tal cual; no se recalculan.
      tasa: cobertura.tasa != null ? cobertura.tasa : null,
      huecos: Array.isArray(cobertura.huecos) ? cobertura.huecos : (cobertura.huecos != null ? cobertura.huecos : null),
      falta_cobertura: !completa,
      motivo: completa
        ? 'lo consultado tiene cobertura completa (se lee de la metrica unica A12)'
        : (declarada
            ? 'lo consultado tiene cobertura INCOMPLETA: se dice ANTES de que el dueño decida'
            : 'la cobertura no esta declarada: el sello no puede afirmar completitud')
    };
  }

  async _leerCobertura(pid, input = {}) {
    if (input.cobertura && typeof input.cobertura === 'object') return input.cobertura;
    if (input.respuesta && input.respuesta.cobertura && typeof input.respuesta.cobertura === 'object') return input.respuesta.cobertura;
    const cache = this._cobertura.get(pid);
    if (cache) return cache;
    const r = await this._rpc('completitud-cobertura.medir.request',
      { project_id: pid, vertical: input.vertical }, { timeout_ms: 4000 }).catch(() => null);
    const data = r && r.data ? r.data : null;
    return data && data.cobertura ? data.cobertura : null;
  }

  // ── Tools ──
  toolSellar(params) { return this._sellar(params); }
}

module.exports = SelloCobertura;
