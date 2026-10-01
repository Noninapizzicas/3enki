/**
 * contabilidad-libro/apertura-ejercicio — REFLEJO STATELESS (C5, hoja del plan).
 *
 * Asientos de APERTURA DERIVADOS del CIERRE anterior. LA CLAVE DE ESTE MODULO:
 *   quien ESCRIBE y ANUNCIA es B2 (escritor-diario), NO este.
 * Aqui solo se DERIVA el asiento propuesto (los saldos de cierre que abren el ejercicio
 * siguiente) y se sube `escritor-diario.asentar.request` para que el custodio lo asiente.
 * Este modulo NUNCA toca el libro: respeta el single-writer.
 *
 * Invariante: sin cierre anterior NO se inventan saldos de apertura (debe=haber=0, abierto).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA → sin ui_handler.
 * Ver hoja C5 del plan-construccion y diseno-oop.md (CLASE AperturaEjercicio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AperturaEjercicio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'apertura-ejercicio';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onGenerarRequest(e) {
    return this._atender(e, 'generar', 'apertura-ejercicio.generar.response', async (d) => {
      const res = this._generar(d);
      // Reflejo: deriva y delega; no escribe → no hay hecho que anunciar (B2 lo anuncia).
      if (res.status !== 200) this.eventBus?.publish('apertura-ejercicio.generar.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): al cerrarse un ejercicio, se prepara la apertura ──
  async onEjercicioCerrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return;
    this._generar({ project_id: d.project_id, cierre: d.cierre || d.saldos || d, origen: 'cierre-ejercicio' });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _generar(input) → { status, data }  ·  deriva el asiento de apertura y lo delega a B2
  // ══════════════════════════════════════════════════════════════════════
  _generar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Los saldos de CIERRE del ejercicio anterior: DECLARADOS. Sin ellos no hay apertura.
    const cierre = (input.cierre && typeof input.cierre === 'object') ? input.cierre
      : (input.saldos && typeof input.saldos === 'object' ? input.saldos : null);

    // El asiento propuesto: una linea por saldo, cada una a su lado natural (saldo>0 → debe).
    const lineas = this._lineasDeSaldos(cierre);

    const asiento = {
      fecha: input.fecha != null ? String(input.fecha) : new Date().toISOString().slice(0, 10),
      concepto: 'Apertura de ejercicio (derivada del cierre anterior)',
      lineas,
      clave: `apertura:${pid}:${input.ejercicio != null ? String(input.ejercicio) : 'siguiente'}`
    };

    // NO se escribe aqui: se SUBE la orden a escritor-diario (B2 = el unico que asienta y anuncia).
    if (lineas.length > 0 && this.eventBus?.publish) {
      this.eventBus.publish('escritor-diario.asentar.request', {
        project_id: pid,
        asiento,
        origen: input.origen || 'apertura-ejercicio',
        correlation_id: input.correlation_id
      });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'apertura-ejercicio',
        asiento,
        lineas: lineas.length,
        // Quien escribe y anuncia es B2, no este reflejo.
        escritor: 'escritor-diario',
        delegado: lineas.length > 0,
        abierto: {
          cierre: cierre ? null
            : 'no hay cierre anterior declarado: no se inventan saldos de apertura (0 lineas, no un default)'
        }
      }
    };
  }

  // Una linea por cuenta con saldo declarado; saldo > 0 abre por el DEBE.
  _lineasDeSaldos(cierre) {
    if (!cierre || typeof cierre !== 'object') return [];
    const cuentas = Array.isArray(cierre.cuentas) ? cierre.cuentas
      : (Array.isArray(cierre.saldos) ? cierre.saldos : null);
    if (!cuentas) {
      // Objeto {cuenta: saldo} tambien vale.
      return Object.entries(cierre)
        .filter(([k, v]) => k !== 'cuentas' && k !== 'saldos' && Number.isFinite(Number(v)))
        .map(([cuenta, saldo]) => this._linea(cuenta, Number(saldo)));
    }
    return cuentas
      .filter((c) => c && (c.cuenta != null))
      .map((c) => this._linea(c.cuenta, Number(c.saldo)));
  }

  _linea(cuenta, saldo) {
    const n = Number.isFinite(saldo) ? saldo : 0;
    return { cuenta: String(cuenta), debe: n > 0 ? this._round(n, 2) : 0, haber: n < 0 ? this._round(-n, 2) : 0 };
  }

  // ── Tools ──
  toolGenerar(params) { return this._generar(params); }
}

module.exports = AperturaEjercicio;
