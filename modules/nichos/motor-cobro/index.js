/**
 * nichos/motor-cobro — REFLEJO STATELESS (E3, hoja del plan).
 *
 * Ejecuta y registra el cobro del nicho sobre las plataformas DECLARADAS
 * (agnóstico al proveedor): agnóstico significa que el motor no se acopla a
 * ningún vendor — recibe la plataforma declarada en el perfil de cobro/entrega
 * (I1) y produce un evento de cobro ejecutado que registro-cobros (F1) asienta
 * append-only. Distingue EFECTIVO (el dinero entró: pagos directos) de
 * COMPROMETIDO (promesa/suscripción recurrente que genera flujo a caja futuro).
 *
 * REFLEJO (patrón real, stateless): sin store, sin persistencia, cada op entra
 * objeto, sale objeto — proyección pura determinista. El pago-gateway (líder
 * provider-agnóstico) es el puerto reutilizable que se llama por RPC; el motor
 * de NICHOS se construye encima del puerto, nunca acoplado al proveedor.
 *
 * Publica nichos.cobro.ejecutado (-> registro-cobros append-only) + par de
 * fallo nichos.cobro.ejecutar.failed. Ver hoja E3 del plan-construccion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Plataformas de cobro declaradas que el motor puede ejecutar de forma
// agnóstica al proveedor ([ABIERTO], declarables por evento en el perfil I1).
const PLATAFORMAS_COBRO = new Set(['efectivo', 'transferencia', 'paypal', 'stripe', 'suscripcion', 'cripto']);

// Plataformas cuyo cobro es EFECTIVO (el dinero entró de inmediato).
// 'suscripcion' es COMPROMETIDO (promesa recurrente que genera flujo a caja).
const PLATAFORMAS_EFECTIVO = new Set(['efectivo', 'transferencia', 'paypal', 'stripe', 'cripto']);

// Moneda por defecto del contrato de nichos.
const MONEDA = 'EUR';

class MotorCobro extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-cobro';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  // project.activated — reflejo sin estado: solo registra el project activo en contexto.
  async onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    this.project_id = d.project_id || this.project_id;
    this.logger?.info(`${this.name}.reflejo.project_activated`, { project_id: this.project_id });
    return { status: 200, data: { project_id: this.project_id } };
  }

  onEjecutarRequest(e) {
    return this._atender(e, 'ejecutar', 'nichos.motor-cobro.ejecutar.response', async (d) => {
      const res = this._ejecutarCobro(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.cobro.ejecutado', {
          project_id: res.data.project_id,
          cobro: res.data.cobro,
          ejecutado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.cobro.ejecutar.failed', res);
      }
      return res;
    });
  }

  // ── proyección pura: ejecuta el cobro sobre la plataforma declarada ──
  _ejecutarCobro({ project_id, importe, pagador, plataforma } = {}) {
    project_id = project_id || this.project_id;
    if (!project_id) return this._invalid('project_id');
    if (!plataforma) return this._invalid('plataforma');
    const pf = String(plataforma).toLowerCase();
    if (!PLATAFORMAS_COBRO.has(pf)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'plataforma de cobro no declarada', { plataforma });
    }
    const val = Number(importe);
    if (!Number.isFinite(val) || val <= 0) {
      return this._invalid('importe');
    }
    if (!pagador || typeof pagador !== 'string' || !pagador.trim()) {
      return this._invalid('pagador');
    }

    // El pago-gateway (líder, provider-agnóstico) se llamaría por RPC aquí; el
    // motor de nichos lo envuelve y produce el Cobro del dominio NICHOS.
    const cobro = this._distinguirEfectivoDePromesa({
      importe: val,
      pagador: pagador.trim(),
      plataforma: pf,
      moneda: MONEDA
    });
    return { status: 200, data: { project_id, cobro, ejecutado: true } };
  }

  // ── proyección pura: EFECTIVO (entró) | COMPROMETIDO (promesa/suscripción) ──
  _distinguirEfectivoDePromesa({ importe, pagador, plataforma, moneda = MONEDA } = {}) {
    const tipo = PLATAFORMAS_EFECTIVO.has(String(plataforma).toLowerCase())
      ? 'EFECTIVO'
      : 'COMPROMETIDO';
    return {
      importe,
      pagador,
      plataforma,
      tipo,
      moneda,
      ejecutado_en: new Date().toISOString(),
      registrado_por: 'MOTOR_COBRO'
    };
  }

  // ── Tools ──
  toolEjecutar(params) { return this._ejecutarCobro(params); }
  toolDistinguir(params) { return this._distinguirEfectivoDePromesa(params); }
}

module.exports = MotorCobro;
