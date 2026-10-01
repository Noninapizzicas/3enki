/**
 * contabilidad-fiscal/estimacion-is-irpf — REFLEJO STATELESS (D5, hoja del plan).
 *
 * Estimacion del resultado fiscal del Impuesto sobre Sociedades / IRPF con BASE DECLARADA.
 * EL CERROJO: nada se estima sin base — la BASE y los TRAMOS/TIPOS son DATO declarado por el
 * negocio, NUNCA cableados aqui (la ley entra como dato, no como constante en el codigo).
 *
 *   · sube cuenta-resultados.calcular.request (C2) para traer el resultado contable, y
 *     perfil-administrativo.obligaciones.request (D15) para saber que regimen/obligaciones aplican
 *     — o usa lo DECLARADO en el input.
 *   · la base imponible = base declarada, o resultado contable + ajustes declarados.
 *   · la cuota se aplica con los TRAMOS declarados (progresivos). Sin tramos declarados la cuota
 *     NO se inventa: queda [ABIERTO] (dato ausente = desconocido).
 *
 * NO escribe, NO persiste. RPC estimar es CLASE PREGUNTA → sin ui_handler (su cara es el bus).
 * Publica estimacion-is-irpf.estimar.response y su par .failed.
 * Escucha contabilidad.ejercicio_cerrado (cierre-ejercicio C4, emitido) — exento de R3 por el plan.
 * Ver hoja D5 del plan-construccion y diseno-oop.md (CLASE EstimacionIsIrpf).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class EstimacionIsIrpf extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estimacion-is-irpf';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onEstimarRequest(e) {
    return this._atender(e, 'estimar', 'estimacion-is-irpf.estimar.response', async (d) => {
      const res = await this._estimar(d);
      // Reflejo: estima; no escribe dominio → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('estimacion-is-irpf.estimar.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): cerro el ejercicio → se observa ──
  onEjercicioCerrado(e) {
    const d = (e && (e.data || e)) || {};
    this._cierres = this._cierres || [];
    if (d.estado === 'cerrado') this._cierres.push(d);
    if (this._cierres.length > 100) this._cierres.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // estimar(input) → { base_imponible, cuota, tramos_aplicados, abierto }
  // ══════════════════════════════════════════════════════════════════════
  async _estimar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El perfil administrativo (regimen/obligaciones) — dato declarado o subido por EVENTO.
    const perfil = await this._perfil(input);

    // La BASE IMPONIBLE: declarada, o derivada del resultado contable + ajustes DECLARADOS.
    const { base, fuente_base, resultado, ajustes } = await this._base(input);

    // Los TRAMOS/TIPOS son DATO: nunca cableados (la ley entra como dato).
    const tramos = this._tramos(input);

    let cuota = null;
    const tramos_aplicados = [];
    if (base !== null && tramos.length > 0) {
      let restante = base;
      let anterior = 0;
      for (const t of tramos) {
        const hasta = t.hasta === null ? Infinity : Number(t.hasta);
        const tipo = Number(t.tipo);
        // El ultimo tramo puede ser Abierto (hasta:null → Infinity): NO se descarta por no ser finito.
        if ((t.hasta !== null && !Number.isFinite(hasta)) || !Number.isFinite(tipo)) continue;
        const enTramo = Math.max(0, Math.min(base, hasta) - anterior);
        if (enTramo <= 0) { anterior = hasta === Infinity ? anterior : hasta; continue; }
        const cuotaTramo = this._round(enTramo * (tipo / 100), 2);
        tramos_aplicados.push({ desde: anterior, hasta: t.hasta === null ? null : hasta, tipo, base_en_tramo: this._round(enTramo, 2), cuota: cuotaTramo });
        cuota = this._round((cuota || 0) + cuotaTramo, 2);
        anterior = hasta === Infinity ? anterior : hasta;
        restante -= enTramo;
        if (restante <= 0) break;
      }
    }

    // Las DEDUCCIONES y RETENCIONES declaradas. El resultado a ingresar = cuota - deducciones - retenciones.
    const deducciones = this._round(input.deducciones != null ? Number(input.deducciones) : 0, 2);
    const retenciones = this._round(input.retenciones_pagadas != null ? Number(input.retenciones_pagadas) : 0, 2);
    const a_ingresar = cuota === null ? null : this._round(cuota - deducciones - retenciones, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'estimacion-is-irpf',
        regimen: perfil ? perfil.regimen : (input.regimen != null ? String(input.regimen) : null),
        fuente_perfil: perfil ? perfil.fuente : null,
        base_imponible: base,
        fuente_base,
        resultado_contable: resultado,
        ajustes,
        tramos_aplicados,
        cuota,
        deducciones,
        retenciones,
        a_ingresar,
        determinista: true,
        // El cerrojo: sin base o sin tramos declarados NO se finge una cuota.
        abierto: {
          base: base === null
            ? 'no hay base (ni declarada ni derivable del resultado contable): la estimacion no se inventa'
            : null,
          tramos: tramos.length > 0
            ? null
            : 'no se declararon tramos/tipos (la ley entra como DATO): sin tramos la cuota queda sin calcular'
        }
      }
    };
  }

  // Trae la base: declarada, o resultado contable (C2) + ajustes declarados.
  async _base(input) {
    const ajustes = this._round(input.ajustes != null ? Number(input.ajustes) : 0, 2);
    if (input.base != null && Number.isFinite(Number(input.base))) {
      return { base: this._round(Number(input.base), 2), fuente_base: 'declarado', resultado: null, ajustes };
    }
    let resultado = null;
    if (input.resultado != null && Number.isFinite(Number(input.resultado))) {
      resultado = this._round(Number(input.resultado), 2);
    } else {
      const resp = await this._rpc('cuenta-resultados.calcular.request', {
        project_id: input.project_id || this.project_id,
        fecha: input.fecha, ejercicio: input.ejercicio
      }, { timeout_ms: 800 });
      if (resp && resp.resultado != null && Number.isFinite(Number(resp.resultado))) resultado = this._round(Number(resp.resultado), 2);
    }
    if (resultado === null) return { base: null, fuente_base: null, resultado: null, ajustes };
    return { base: this._round(resultado + ajustes, 2), fuente_base: 'resultado+ajustes', resultado, ajustes };
  }

  async _perfil(input) {
    if (input.regimen != null || Array.isArray(input.obligaciones)) {
      return { regimen: input.regimen != null ? String(input.regimen) : null, obligaciones: input.obligaciones || [], fuente: 'declarado' };
    }
    const resp = await this._rpc('perfil-administrativo.obligaciones.request', {
      project_id: input.project_id || this.project_id
    }, { timeout_ms: 800 });
    if (resp && !resp.abierto) return { regimen: resp.regimen || null, obligaciones: resp.obligaciones || [], fuente: 'perfil-administrativo' };
    return null;
  }

  // Los tramos DECLARADOS. Ninguno cableado: la ley es dato.
  _tramos(input) {
    const raw = Array.isArray(input.tramos) ? input.tramos
      : (input.regimen && Array.isArray(input.regimen.tramos) ? input.regimen.tramos
        : (input.tipos && Array.isArray(input.tipos) ? input.tipos : []));
    return raw.filter((t) => t && typeof t === 'object')
      .map((t) => ({ hasta: t.hasta === undefined ? null : t.hasta, tipo: t.tipo !== undefined ? t.tipo : t.tipo_pct }))
      .sort((a, b) => (a.hasta === null ? Infinity : Number(a.hasta)) - (b.hasta === null ? Infinity : Number(b.hasta)));
  }

  // ── Tools ──
  toolEstimar(params) { return this._estimar(params); }
}

module.exports = EstimacionIsIrpf;
