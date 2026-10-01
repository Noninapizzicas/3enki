/**
 * contabilidad-entrada/deduplicacion-hecho — REFLEJO STATELESS (A7, hoja del plan).
 *
 * IDEMPOTENCIA DETERMINISTA. La clave natural del hecho/documento decide si YA se vio: reprocesar
 * NO duplica. Cierra 'un cierre = un asiento' en la PUERTA de entrada.
 *
 * La clave natural NO se recalcula aqui: la calcula `clave-natural` (M3) y esta hoja la SUBE por
 * EVENTO (`clave-natural.calcular.request`). El reflejo decide si el hecho es NUEVO comparando su
 * clave con las ya vistas (su propio registro de claves, en memoria, por proyecto).
 *
 * Invariantes:
 *  - DETERMINISTA: mismo hecho → misma clave → mismo veredicto (nuevo/duplicado).
 *  - Sin elemento NO hay clave ni veredicto (dato ausente = desconocido): no se marca como nuevo
 *    ni como duplicado lo que no se pudo identificar.
 *  - NO escribe dominio, NO persiste, NO muta el hecho: decide y declara. Su registro de claves
 *    vistas es un DERIVADO en memoria (no un hecho de negocio).
 *
 * R3 · ESCUCHA: el plan NO declara escucha de dominio (—) y no se anade ninguna sin emisor.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. RPC PREGUNTA → sin ui_handler.
 * Ver hoja A7 del plan-construccion y diseno-oop.md (CLASE DeduplicacionHecho).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class DeduplicacionHecho extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'deduplicacion-hecho';
    this.version = 'reflejo-0.1.0';
    // Registro DERIVADO de claves naturales vistas: project_id -> Map<clave, {primera_vez, visto}>
    this._vistas = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC PREGUNTA (sin ui_handler: su cara es el bus) ──
  onEsNuevoRequest(e) {
    return this._atender(e, 'es_nuevo', 'deduplicacion-hecho.es_nuevo.response', async (d) => {
      const res = await this._es_nuevo(d);
      // PREGUNTA: decide; no escribe dominio → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('deduplicacion-hecho.es_nuevo.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // es_nuevo(elemento, componentes?) → veredicto de idempotencia (PREGUNTA)
  // ══════════════════════════════════════════════════════════════════════
  async _es_nuevo(input = {}) {
    const pid = input.project_id || this.project_id || null;

    const elemento = input.elemento !== undefined ? input.elemento
      : (input.hecho !== undefined ? input.hecho
        : (input.documento !== undefined ? input.documento : null));
    if (!elemento || typeof elemento !== 'object') return this._invalid('elemento');

    // SUBE a clave-natural (M3) por EVENTO: la clave natural la calcula su custodio, no este reflejo.
    const claveResp = await this._rpc('clave-natural.calcular.request', {
      project_id: pid,
      elemento,
      componentes: Array.isArray(input.componentes) && input.componentes.length ? input.componentes : undefined
    });

    if (!claveResp || claveResp.status !== 200 || !claveResp.data || !claveResp.data.clave) {
      // Sin clave natural NO hay veredicto (dato ausente = desconocido): no se inventa ni el nuevo ni el duplicado.
      return {
        status: 200,
        data: {
          project_id: pid,
          elemento,
          clave: null,
          es_nuevo: null,
          es_duplicado: null,
          vistas: null,
          abierto: {
            clave: 'no se pudo calcular la clave natural (clave-natural no respondio): el veredicto queda declarado abierto, no se adivina'
          }
        }
      };
    }

    const clave = String(claveResp.data.clave);
    const componentes = claveResp.data.componentes || [];
    const registro = this._registro(pid);

    const previa = registro.get(clave) || null;
    const es_nuevo = previa === null;

    // Se anota la clave vista (registro DERIVADO en memoria; no es un hecho de negocio).
    registro.set(clave, {
      primera_vez: previa ? previa.primera_vez : new Date().toISOString(),
      visto: (previa ? previa.visto : 0) + 1
    });

    return {
      status: 200,
      data: {
        project_id: pid,
        elemento,
        clave,
        componentes,
        es_nuevo,
        es_duplicado: !es_nuevo,
        vistas: registro.get(clave).visto,
        // Determinista: misma clave → mismo veredicto. Reprocesar NO duplica.
        determinista: true,
        idempotente: true,
        abierto: { clave: null }
      }
    };
  }

  _registro(pid) {
    let r = this._vistas.get(pid);
    if (!r) {
      r = new Map();
      this._vistas.set(pid, r);
    }
    return r;
  }

  // Claves vistas del proyecto (mismo proceso) — solo lectura, derivado.
  clavesDe(pid) {
    const r = pid ? this._vistas.get(pid) : null;
    return r ? [...r.keys()] : [];
  }

  // ── Tools ──
  toolEsNuevo(params) { return this._es_nuevo(params); }
}

module.exports = DeduplicacionHecho;
