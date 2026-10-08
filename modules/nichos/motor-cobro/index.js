/**
 * nichos/motor-cobro — REFLEJO JS sin estado del vertical NICHOS.
 *
 * Ejecuta cobros según modelo. Tres pasos:
 *   1. Consulta plantilla de cobro por bus (nichos.perfil.cobro.plantilla.request).
 *   2. Aplica modelo de cobro al cliente.
 *   3. Registra en registro-cobros por bus (nichos.registro.cobros.registrar.request).
 *
 * Sin estado propio — REFLEJO puro, determinista.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const crypto = require('crypto');

const nowISO = () => new Date().toISOString();

const MODELOS_CONOCIDOS = ['FIJO', 'PORCENTAJE', 'ESCALONADO', 'POR_USO'];

class MotorCobro extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-cobro';
    this.version = '0.1.0';
  }

  // ── RPC HANDLER ──
  onEjecutarRequest(e) {
    return this._atender(e, 'ejecutar', 'nichos.cobro.ejecutar.response', d => this._ejecutar(d));
  }

  // =============================================================
  // PROYECCIONES — lógica de dominio pura
  // =============================================================

  /**
   * _ejecutar — ejecuta cobro según modelo, consulta plantilla, registra.
   *
   * @param {Object} input
   * @param {string} input.id_nicho        - identificador del nicho
   * @param {Object} input.modelo_cobro    - { tipo, parametros }
   * @param {Object} input.cliente         - { id, nombre?, monto_base? }
   * @param {string} [input.correlation_id]
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _ejecutar(input) {
    if (!input.id_nicho) return this._invalid('id_nicho');
    if (!input.modelo_cobro || typeof input.modelo_cobro !== 'object') return this._invalid('modelo_cobro');
    if (!input.cliente || typeof input.cliente !== 'object') return this._invalid('cliente');

    const tipo = input.modelo_cobro.tipo;
    if (!tipo || !MODELOS_CONOCIDOS.includes(tipo)) {
      return this._errorResponse(
        400,
        'MODELO_DESCONOCIDO',
        `modelo_cobro.tipo debe ser uno de ${MODELOS_CONOCIDOS.join(', ')}`,
        { tipo, validos: MODELOS_CONOCIDOS }
      );
    }

    // 1. Consultar plantilla de cobro por bus
    const plantilla = await this._consultarPlantilla(input.id_nicho, tipo);

    // 2. Calcular importe según modelo
    let importe;
    try {
      importe = this._calcularImporte(tipo, input.modelo_cobro.parametros || {}, input.cliente, plantilla);
    } catch (err) {
      // PULSO fallido
      this.eventBus?.publish('nichos.cobro.fallido', {
        id_nicho: input.id_nicho,
        razon_codigo: 'CALCULO_FALLIDO',
        detalle: err.message,
        timestamp: nowISO()
      });
      return this._errorResponse(500, 'CALCULO_FALLIDO', err.message, { id_nicho: input.id_nicho });
    }

    // 3. Formatear recibo
    const recibo = this._formatearRecibo(input, importe, plantilla);

    // 4. Registrar en registro-cobros por bus
    await this._registrarCobro(input.id_nicho, recibo);

    // PULSO ejecutado
    this.eventBus?.publish('nichos.cobro.ejecutado', {
      id_nicho: input.id_nicho,
      recibo,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: { recibo }
    };
  }

  // =============================================================
  // Utilidades
  // =============================================================

  /**
   * _calcularImporte — aplica el modelo de cobro y devuelve importe.
   */
  _calcularImporte(tipo, parametros, cliente, plantilla) {
    const monto_base = cliente.monto_base || parametros.monto_base || 0;
    const tasa = (plantilla && plantilla.tasa) || parametros.tasa || 0;

    switch (tipo) {
      case 'FIJO':
        return this._round(parametros.importe_fijo || tasa, 2);
      case 'PORCENTAJE':
        return this._round(monto_base * (tasa / 100), 2);
      case 'ESCALONADO': {
        const escalones = (plantilla && plantilla.escalones) || parametros.escalones || [];
        let acumulado = 0;
        let restante = monto_base;
        for (const esc of escalones) {
          const tramo = Math.min(restante, esc.hasta - (esc.desde || 0));
          if (tramo <= 0) break;
          acumulado += tramo * ((esc.tasa || 0) / 100);
          restante -= tramo;
        }
        return this._round(acumulado, 2);
      }
      case 'POR_USO':
        return this._round((parametros.unidades || 0) * (parametros.precio_unidad || tasa), 2);
      default:
        throw new Error(`Modelo de cobro no implementado: ${tipo}`);
    }
  }

  /**
   * _formatearRecibo — genera el objeto recibo con todos los datos del cobro.
   */
  _formatearRecibo(input, importe, plantilla) {
    return {
      recibo_id: crypto.randomUUID(),
      id_nicho: input.id_nicho,
      cliente_id: input.cliente.id,
      modelo: input.modelo_cobro.tipo,
      importe,
      moneda: (plantilla && plantilla.moneda) || 'EUR',
      concepto: (plantilla && plantilla.concepto) || `Cobro ${input.modelo_cobro.tipo}`,
      emitido_at: nowISO()
    };
  }

  /**
   * Consulta la plantilla de cobro por RPC al bus.
   */
  async _consultarPlantilla(id_nicho, modelo_tipo) {
    const resp = await this._rpc('nichos.perfil.cobro.plantilla.request', {
      id_nicho,
      modelo_cobro: modelo_tipo
    });
    return (resp && resp.data && resp.data.plantilla) || null;
  }

  /**
   * Registra el cobro en registro-cobros por bus.
   */
  async _registrarCobro(id_nicho, recibo) {
    try {
      await this._rpc('nichos.registro.cobros.registrar.request', {
        id_nicho,
        recibo,
        timestamp: nowISO()
      });
    } catch (_) {
      // Degradación honesta: el cobro se ejecutó, registro fallido se loggea
      this.logger?.warn('motor-cobro.registro.degradado', { id_nicho, recibo_id: recibo.recibo_id });
    }
  }
}

module.exports = MotorCobro;
