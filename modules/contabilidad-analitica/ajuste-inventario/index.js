/**
 * contabilidad-analitica/ajuste-inventario — REFLEJO STATELESS (H3, hoja del plan).
 *
 * REGULARIZA la merma/rotura con ASIENTO Y AVISO. Calcula la DIFERENCIA de inventario:
 *   diferencia = cantidad_teorica − cantidad_real   (merma/rotura si > 0)
 * DETERMINISTA: mismas cifras → misma diferencia.
 *
 *   · Diferencia → SUBE el asiento a escritor-diario B2 (si las cuentas son declarables).
 *   · Diferencia relevante → SUBE un aviso a motor-avisos K2.
 *
 * No duplica el inventario (infra reutilizada) ni el valor (valoracion-existencia H1): solo
 * DERIVA la diferencia de lo declarado y la regulariza por EVENTO.
 *
 * Invariante: dato ausente = desconocido. Sin cantidad teorica o sin cantidad real NO se
 * estima la merma: se declara ABIERTO.
 *
 * R3 (honestidad de la escucha): el plan declara escucha de `contabilidad.hecho_recibido`
 * (puerto-evento-vertical A1) — ese emisor YA existe → SI se declara.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. RPC diferencia = PREGUNTA → sin ui_handler.
 * Ver hoja H3 del plan-construccion y diseno-oop.md (CLASE AjusteInventario).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AjusteInventario extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ajuste-inventario';
    this.version = 'reflejo-0.1.0';
    this._vistos = [];
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (PREGUNTA → sin ui_handler) ──
  onDiferenciaRequest(e) {
    return this._atender(e, 'diferencia', 'ajuste-inventario.diferencia.response', async (d) => {
      const res = await this._diferencia(d);
      // Reflejo: calcula y declara; no escribe dominio → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('ajuste-inventario.diferencia.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): llego un hecho de la operacion (A1) ──
  async onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    const hecho = d.hecho && typeof d.hecho === 'object' ? d.hecho : null;
    if (!hecho) return;
    // Solo se reacciona si el hecho declara el recuento del inventario (no se inventa la merma).
    const recuento = hecho.inventario || hecho.recuento || null;
    if (!recuento) return;
    try {
      const res = await this._diferencia({
        project_id: d.project_id, articulo: recuento.articulo || hecho.articulo,
        cantidad_teorica: recuento.cantidad_teorica != null ? recuento.cantidad_teorica : recuento.teorica,
        cantidad_real: recuento.cantidad_real != null ? recuento.cantidad_real : recuento.real,
        coste_unitario: recuento.coste_unitario != null ? recuento.coste_unitario : recuento.coste,
        cuentas: recuento.cuentas, umbral: recuento.umbral,
        correlation_id: d.correlation_id
      });
      if (res.status === 200 && res.data && res.data.diferencia) await this._regularizar(res.data, d);
    } catch (err) {
      this.logger?.error(`${this.name}.hecho_recibido.error`, { error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // _diferencia(input) → { diferencia, merma, valor, asiento? }  (DETERMINISTA)
  // ══════════════════════════════════════════════════════════════════════
  async _diferencia(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const teorica = this._num(input.cantidad_teorica != null ? input.cantidad_teorica : (input.inventario && input.inventario.teorica));
    const real = this._num(input.cantidad_real != null ? input.cantidad_real : (input.inventario && input.inventario.real));
    if (teorica == null || real == null) {
      // Sin las dos cifras NO se estima la merma (dato ausente = desconocido).
      return {
        status: 200,
        data: {
          project_id: pid, tipo: 'ajuste-inventario', diferencia: null, merma: null, valor: null,
          determinista: true,
          abierto: { diferencia: 'faltan cantidad teorica y/o real: la merma no se estima', articulo: input.articulo == null ? 'no se declara articulo' : null }
        }
      };
    }

    const diferencia = this._round(teorica - real, 4);   // > 0 → falta genero (merma/rotura)
    const esMerma = diferencia > 0;
    const costeUnitario = this._num(input.coste_unitario != null ? input.coste_unitario : (input.inventario && input.inventario.coste));
    const valor = costeUnitario != null ? this._round(diferencia * costeUnitario, 2) : null;

    const articulo = input.articulo != null ? String(input.articulo) : (input.inventario && input.inventario.articulo != null ? String(input.inventario.articulo) : null);

    const ajuste = {
      articulo,
      cantidad_teorica: teorica,
      cantidad_real: real,
      diferencia,
      merma: esMerma,
      sobrante: diferencia < 0,
      coste_unitario: costeUnitario,
      valor,
      fecha: input.fecha != null ? String(input.fecha) : null,
      en: new Date().toISOString()
    };

    // El ASIENTO lo escribe B2. Se PROPONE solo si las cuentas vienen declaradas (no se inventan).
    const asiento = this._asiento(input, ajuste);
    if (asiento) {
      this.eventBus?.publish('escritor-diario.asentar.request', {
        project_id: pid, asiento, origen: 'ajuste-inventario', correlation_id: input.correlation_id
      });
    }

    // El AVISO: se SUBE a K2 si la diferencia es relevante (umbral DECLARADO; por defecto 0 = cualquiera).
    const umbral = this._num(input.umbral != null ? input.umbral : (input.inventario && input.inventario.umbral));
    const relevante = umbral == null ? Math.abs(diferencia) > 0 : Math.abs(diferencia) >= umbral;
    if (relevante && diferencia !== 0) {
      this.eventBus?.publish('motor-avisos.producir.request', {
        project_id: pid,
        tipo: 'hecho',
        titulo: `ajuste de inventario (${esMerma ? 'merma' : 'sobrante'})`,
        detalle: `${articulo || 'articulo'}: diferencia ${diferencia}${valor != null ? ` (valor ${valor})` : ''}`,
        severidad: esMerma ? 'media' : 'info',
        origen: 'ajuste-inventario',
        ref: articulo,
        correlation_id: input.correlation_id
      });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'ajuste-inventario',
        ajuste,
        diferencia,
        merma: esMerma,
        sobrante: diferencia < 0,
        valor,
        determinista: true,
        asiento_propuesto: asiento,
        aviso_subido: relevante && diferencia !== 0,
        escrito_por: 'escritor-diario',
        avisado_por: 'motor-avisos',
        abierto: {
          articulo: articulo ? null : 'el ajuste no declara articulo (se anota el hueco, no se inventa)',
          valor: (valor != null || costeUnitario != null) ? null : 'no hay coste unitario: la diferencia se declara sin valorar',
          asiento: asiento ? null : 'no se propuso asiento: faltan las cuentas declaradas'
        }
      }
    };
  }

  // Propone el asiento de regularizacion SOLO si las cuentas vienen declaradas.
  _asiento(input, ajuste) {
    const ctaExistencias = input.cuenta_existencias != null ? String(input.cuenta_existencias)
      : (input.cuentas && input.cuentas.existencias != null ? String(input.cuentas.existencias) : null);
    const ctaMerma = input.cuenta_merma != null ? String(input.cuenta_merma)
      : (input.cuentas && input.cuentas.merma != null ? String(input.cuentas.merma) : null);
    if (!ctaExistencias || !ctaMerma || ajuste.valor == null || ajuste.valor === 0) return null;
    const importe = Math.abs(ajuste.valor);
    // Merma: existe menos genero (haber existencias / debe merma). Sobrante: al reves.
    const lineas = ajuste.diferencia > 0
      ? [{ cuenta: ctaMerma, debe: importe, haber: 0 }, { cuenta: ctaExistencias, debe: 0, haber: importe }]
      : [{ cuenta: ctaExistencias, debe: importe, haber: 0 }, { cuenta: ctaMerma, debe: 0, haber: importe }];
    return { concepto: `ajuste de inventario ${ajuste.articulo || ''}`.trim(), fecha: ajuste.fecha, lineas };
  }

  async _regularizar(data, d) {
    // Si el origen ya declara cuentas, el asiento se subio en _diferencia; no se duplica.
    return data;
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolDiferencia(params) { return this._diferencia(params); }
}

module.exports = AjusteInventario;
