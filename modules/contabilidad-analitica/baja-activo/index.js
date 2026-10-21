/**
 * contabilidad-analitica/baja-activo — REFLEJO STATELESS (F3, hoja del plan).
 *
 * RETIRA el bien y CALCULA el resultado (perdida/beneficio) de la baja y lo imputa. El ASIENTO
 * lo escribe B2 (escritor-diario): este reflejo NO toca el diario — le SUBE el asiento por EVENTO.
 *
 *   activo (coste · vida · fecha) + cuotas de amortizacion
 *      → baja-activo.calcular (DETERMINISTA)
 *      → valor_neto_contable = coste − amortizacion_acumulada
 *      → resultado = valor_de_baja − valor_neto_contable   (perdida si < 0, beneficio si > 0)
 *      → SUBE escritor-diario.asentar.request (si el asiento es declarable)
 *
 * Invariante: dato ausente = desconocido. Sin COSTE no hay valor neto; sin VALOR DE BAJA no hay
 * resultado: se declara ABIERTO, no se estima. El resultado NO se inventa.
 *
 * R3 (honestidad de la escucha): el plan declara escucha de `contabilidad.activo_alta`
 * (alta-activo) y `contabilidad.cuota_amortizacion_generada` (plan-amortizacion) — AMBOS
 * emisores YA existen → SI se declaran.
 *
 * NO calcula por su cuenta cada cuota (eso es plan-amortizacion): usa el valor neto declarado
 * o lo sube por EVENTO a valor-neto-contable. Forma: REFLEJO → STATELESS. PREGUNTA → sin ui_handler.
 * Ver hoja F3 del plan-construccion y diseno-oop.md (CLASE BajaActivo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class BajaActivo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'baja-activo';
    this.version = 'reflejo-0.1.0';
    // Observacion acotada (fire-and-forget): project_id -> { activos:[], cuotas:[] }
    this._vistos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (PREGUNTA → sin ui_handler) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'baja-activo.calcular.response', async (d) => {
      const res = await this._calcular(d);
      // Reflejo: calcula y declara; NO escribe el diario → no hay hecho de dominio que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('baja-activo.calcular.failed', res);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): el activo se dio de alta / se genero una cuota ──
  onActivoAlta(e) {
    const d = (e && (e.data || e)) || {};
    this._observar(d.project_id || this.project_id, 'activos', d.activo || d);
  }

  onCuotaAmortizacionGenerada(e) {
    const d = (e && (e.data || e)) || {};
    this._observar(d.project_id || this.project_id, 'cuotas', d.cuota || d);
  }

  _observar(pid, campo, valor) {
    if (!pid || !valor) return;
    let o = this._vistos.get(pid);
    if (!o) { o = { activos: [], cuotas: [] }; this._vistos.set(pid, o); }
    o[campo].push(valor);
    if (o[campo].length > 2000) o[campo].shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // _calcular(input) → { valor_neto, resultado, perdida/beneficio, asiento? }
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const activo = (input.activo && typeof input.activo === 'object') ? input.activo : null;
    if (!activo && input.coste == null) {
      // Sin activo declarado NO se inventa la baja (dato ausente = desconocido).
      return this._invalid('activo');
    }

    const coste = this._num(input.coste != null ? input.coste : (activo && activo.coste));
    if (coste == null) {
      return this._abierto(pid, activo, null, null, 'el activo no declara coste: no se calcula el valor neto');
    }

    // El valor neto contable: declarado, o derivado (coste − amortizacion acumulada).
    const vncDeclarado = this._num(input.valor_neto_contable != null ? input.valor_neto_contable
      : (activo && activo.valor_neto_contable));
    let amortAcumulada = this._num(input.amortizacion_acumulada != null ? input.amortizacion_acumulada
      : (activo && activo.amortizacion_acumulada));
    let fuenteVnc = vncDeclarado != null ? 'declarado' : null;

    let valorNeto;
    if (vncDeclarado != null) {
      valorNeto = vncDeclarado;
    } else {
      // Sin amortizacion declarada: se pide a valor-neto-contable (F4) por EVENTO.
      if (amortAcumulada == null) {
        const resp = await this._rpc('valor-neto-contable.calcular.request', {
          project_id: pid, activo, coste, cuotas: input.cuotas
        }, { timeout_ms: 800 });
        const v = resp && resp.data ? resp.data : null;
        if (v && typeof v.valor_neto_contable === 'number') { valorNeto = v.valor_neto_contable; fuenteVnc = 'valor-neto-contable'; }
        else if (v && typeof v.amortizacion_acumulada === 'number') { amortAcumulada = v.amortizacion_acumulada; }
      }
      if (valorNeto == null && amortAcumulada != null) {
        valorNeto = this._round(coste - amortAcumulada, 2);
        fuenteVnc = 'derivado (coste - amortizacion)';
      }
    }

    if (valorNeto == null) {
      return this._abierto(pid, activo, coste, null, 'no hay valor neto (ni declarado, ni de valor-neto-contable, ni amortizacion): la baja queda sin calcular');
    }

    // El VALOR DE BAJA: lo que se obtiene por el bien (venta, siniestro, 0 si se retira sin valor).
    const valorBaja = this._num(input.valor_baja != null ? input.valor_baja
      : (input.precio_venta != null ? input.precio_venta : (activo && activo.valor_baja)));
    if (valorBaja == null) {
      return this._abierto(pid, activo, coste, valorNeto, 'no hay valor de baja (venta/retirada): no se calcula el resultado');
    }

    // DETERMINISTA: resultado = valor de baja − valor neto contable.
    const resultado = this._round(valorBaja - valorNeto, 2);
    const esPerdida = resultado < 0;

    const baja = {
      activo_id: input.activo_id != null ? String(input.activo_id)
        : (activo && activo.activo_id != null ? String(activo.activo_id) : null),
      coste,
      amortizacion_acumulada: amortAcumulada != null ? this._round(amortAcumulada, 2) : null,
      valor_neto_contable: this._round(valorNeto, 2),
      fuente_valor_neto: fuenteVnc,
      valor_baja: valorBaja,
      resultado,
      tipo_resultado: esPerdida ? 'perdida' : (resultado > 0 ? 'beneficio' : 'nulo'),
      fecha: input.fecha != null ? String(input.fecha) : null,
      en: new Date().toISOString()
    };

    // El ASIENTO lo escribe B2. Se PROPONE solo si las cuentas estan declaradas (no se inventan).
    const asiento = this._asiento(input, baja);
    if (asiento) {
      this.eventBus?.publish('escritor-diario.asentar.request', {
        project_id: pid, asiento, origen: 'baja-activo', correlation_id: input.correlation_id
      });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'baja-activo',
        baja,
        valor_neto_contable: baja.valor_neto_contable,
        resultado,
        perdida: esPerdida,
        beneficio: resultado > 0,
        determinista: true,
        asiento_propuesto: asiento,
        escrito_por: 'escritor-diario',
        abierto: {
          activo_id: baja.activo_id ? null : 'el activo no trae activo_id (se anota el hueco, no se inventa)',
          asiento: asiento ? null : 'no se propuso asiento: faltan las cuentas declaradas (contable/amortizacion/resultado)',
          fecha: baja.fecha ? null : 'la baja no declara fecha'
        }
      }
    };
  }

  _abierto(pid, activo, coste, valorNeto, motivo) {
    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'baja-activo',
        baja: null,
        coste: coste != null ? coste : null,
        valor_neto_contable: valorNeto != null ? valorNeto : null,
        resultado: null,
        perdida: null,
        beneficio: null,
        determinista: true,
        abierto: { resultado: motivo, activo_id: activo && activo.activo_id == null ? 'el activo no trae activo_id' : null }
      }
    };
  }

  // Propone el asiento de baja SOLO si las cuentas vienen declaradas (no se inventan cuentas).
  _asiento(input, baja) {
    const ctaBien = input.cuenta_bien != null ? String(input.cuenta_bien)
      : (input.cuentas && input.cuentas.bien != null ? String(input.cuentas.bien) : null);
    const ctaAmort = input.cuenta_amortizacion != null ? String(input.cuenta_amortizacion)
      : (input.cuentas && input.cuentas.amortizacion != null ? String(input.cuentas.amortizacion) : null);
    const ctaResultado = input.cuenta_resultado != null ? String(input.cuenta_resultado)
      : (input.cuentas && input.cuentas.resultado != null ? String(input.cuentas.resultado) : null);
    if (!ctaBien || !ctaResultado) return null;   // faltan cuentas → no se inventa el asiento

    const lineas = [];
    if (baja.amortizacion_acumulada) lineas.push({ cuenta: ctaAmort || ctaBien, debe: baja.amortizacion_acumulada, haber: 0 });
    // El bien deja el activo (haber) por su coste.
    lineas.push({ cuenta: ctaBien, debe: 0, haber: baja.coste });
    // La contrapartida: perdida (debe) o beneficio (haber) — con convenio firmado (debe − haber).
    const importeResultado = Math.abs(baja.resultado);
    if (baja.resultado >= 0) lineas.push({ cuenta: ctaResultado, debe: 0, haber: importeResultado });
    else lineas.push({ cuenta: ctaResultado, debe: importeResultado, haber: 0 });
    // Si falta la amortizacion acumulada, la partida doble no cuadra: mejor no proponer asiento.
    const debe = lineas.reduce((a, l) => a + l.debe, 0);
    const haber = lineas.reduce((a, l) => a + l.haber, 0);
    if (Math.abs(debe - haber) > 0.005) return null;
    return { concepto: `baja de activo ${baja.activo_id || ''}`.trim(), fecha: baja.fecha, lineas };
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = BajaActivo;
