/**
 * Módulo Cobros v2.0
 * Procesamiento de pagos - 7 métodos: efectivo, tarjeta, bizum, transferencia, mixto, link_pago, QR
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 */

const crypto = require('crypto');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const cobroSchema = require('./schemas/cobro.json');
const eventsSchema = require('./schemas/events.json');

class CobrosModule {
  constructor() {
    this.name = 'cobros';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;
    this.config = {};

    // Cache de ref_display (cuenta_id → ref_display string)
    this.refDisplayCache = new Map();

    // Validación JSON Schema
    this.ajv = new Ajv({ allErrors: true, useDefaults: true });
    addFormats(this.ajv);
    this.ajv.addSchema(cobroSchema);
    this.ajv.addSchema(eventsSchema);

    // Estado en memoria
    this.cobros = new Map();

    // Métricas internas
    this.internalMetrics = {
      cobros_iniciados: 0,
      cobros_completados: 0,
      cobros_fallidos: 0,
      cobros_reembolsados: 0,
      monto_total_cobrado: 0,
      propinas_total: 0
    };

    // Métodos de pago soportados
    this.metodosPago = ['efectivo', 'tarjeta', 'bizum', 'transferencia', 'mixto', 'link_pago', 'qr'];
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.config = core.config || {};

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // Event subscriptions are auto-wired from module.json by the loader.
    this.registerUIHandlers();

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      metodos_pago: this.metodosPago
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this.uiHandler) {
      const actions = [
        'create', 'list', 'get', 'confirm', 'refund',
        'payment-methods', 'health', 'metrics'
      ];
      for (const action of actions) {
        this.uiHandler.unregister('cobro', action);
      }
    }

    this.cobros.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('cobros.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('cobro', 'create', this.handleCreateCobro.bind(this));
    this.uiHandler.register('cobro', 'list', this.handleListCobros.bind(this));
    this.uiHandler.register('cobro', 'get', this.handleGetCobro.bind(this));
    this.uiHandler.register('cobro', 'confirm', this.handleConfirmarCobro.bind(this));
    this.uiHandler.register('cobro', 'refund', this.handleReembolsarCobro.bind(this));
    this.uiHandler.register('cobro', 'payment-methods', this.handleGetMetodosPago.bind(this));
    this.uiHandler.register('cobro', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('cobro', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('cobros.ui_handlers.registered', {
      handlers: ['create', 'list', 'get', 'confirm', 'refund', 'payment-methods', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('cuenta.creada', (event) => {
      const d = event?.data || event?.payload || event;
      if (d.cuenta_id && d.ref_display) this.refDisplayCache.set(d.cuenta_id, d.ref_display);
    });
    await this.eventBus.subscribe('cuenta.actualizada', (event) => {
      const d = event?.data || event?.payload || event;
      if (d.cuenta_id && d.cambios?.ref_display) this.refDisplayCache.set(d.cuenta_id, d.cambios.ref_display);
    });
    await this.eventBus.subscribe('pedido.completado', this.onPedidoCompletado.bind(this));

    this.logger.info('cobros.events.subscribed', {
      events: ['pedido.completado']
    });
  }

  // ==========================================
  // Event Handlers: cuenta lifecycle (ref_display cache)
  // ==========================================

  async onCuentaCreada(event) {
    const d = event?.data || event?.payload || event;
    if (d.cuenta_id && d.ref_display) this.refDisplayCache.set(d.cuenta_id, d.ref_display);
  }

  async onCuentaActualizada(event) {
    const d = event?.data || event?.payload || event;
    if (d.cuenta_id && d.cambios?.ref_display) this.refDisplayCache.set(d.cuenta_id, d.cambios.ref_display);
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onPedidoCompletado(event) {
    const data = event?.data || event?.payload || event;

    this.logger.info('cobros.pedido_completado.received', {
      pedido_id: data.pedido_id,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onCajaCerrada(event) {
    const size = this.cobros.size;
    this.cobros.clear();
    this.refDisplayCache.clear();

    this.logger.info('cobros.reset.caja_cerrada', {
      cobros_limpiados: size,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onDiaIniciado(event) {
    const size = this.cobros.size;
    this.cobros.clear();
    this.refDisplayCache.clear();

    this.logger.info('cobros.reset.dia_iniciado', {
      cobros_limpiados: size,
      correlation_id: event?.metadata?.correlationId
    });
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleCreateCobro(data) {
    try {
      const { cuenta_id, pedido_ids, monto, metodo_pago, propina, monto_recibido, desglose } = data;

      // Validar campos requeridos
      if (!cuenta_id) {
        return this._buildErrorResponse({
          status: 400, code: 'MISSING_FIELD',
          message: 'cuenta_id es requerido',
          details: { kind: 'domain', field: 'cuenta_id' }
        });
      }
      // Llevadoo paga externamente, no se cobra por caja
      if (cuenta_id.startsWith('llevadoo_')) {
        return this._buildErrorResponse({
          status: 400, code: 'INVALID_INPUT',
          message: 'Las cuentas Llevadoo se pagan externamente, no se pueden cobrar por caja',
          details: { kind: 'domain', field: 'cuenta_id', cuenta_id_prefix: 'llevadoo_' }
        });
      }
      if (monto === undefined || monto <= 0) {
        return this._buildErrorResponse({
          status: 400, code: 'INVALID_INPUT',
          message: 'monto debe ser mayor que 0',
          details: { kind: 'domain', field: 'monto', value: monto }
        });
      }
      if (!metodo_pago || !this.metodosPago.includes(metodo_pago)) {
        return this._buildErrorResponse({
          status: 400, code: 'INVALID_INPUT',
          message: `Método de pago no soportado: ${metodo_pago}. Válidos: ${this.metodosPago.join(', ')}`,
          details: { kind: 'domain', field: 'metodo_pago', valid_values: this.metodosPago }
        });
      }

      // Guardia de idempotencia: rechazar si ya existe un cobro activo para esta cuenta
      const cobroExistente = Array.from(this.cobros.values()).find(
        c => c.cuenta_id === cuenta_id && (c.estado === 'pendiente' || c.estado === 'procesando' || c.estado === 'completado')
      );
      if (cobroExistente) {
        this.logger.warn('cobros.duplicado.rechazado', {
          cuenta_id,
          cobro_existente_id: cobroExistente.id,
          cobro_existente_estado: cobroExistente.estado
        });
        return this._buildErrorResponse({
          status: 409, code: 'ALREADY_EXISTS',
          message: `Ya existe un cobro ${cobroExistente.estado} para esta cuenta`,
          details: { kind: 'domain', entity_type: 'cobro', cuenta_id, cobro_id: cobroExistente.id, estado_actual: cobroExistente.estado }
        });
      }

      const cobro_id = crypto.randomUUID();
      const monto_total = monto + (propina || 0);

      const cobro = {
        id: cobro_id,
        cuenta_id,
        pedido_ids: pedido_ids || [],
        monto,
        metodo_pago,
        estado: 'pendiente',
        propina: propina || 0,
        monto_total,
        created_at: new Date().toISOString()
      };

      // Efectivo: calcular cambio
      if (metodo_pago === 'efectivo' && monto_recibido) {
        cobro.monto_recibido = monto_recibido;
        cobro.cambio = monto_recibido - monto_total;

        if (cobro.cambio < 0) {
          return this._buildErrorResponse({
            status: 400, code: 'INVALID_INPUT',
            message: 'Monto recibido insuficiente',
            details: { kind: 'domain', field: 'monto_recibido', monto_faltante: Math.abs(cobro.cambio) }
          });
        }
      }

      // Pago mixto (split payment) — el helper procesarPagoMixto usa shape interno
      // { error: 'string' } legitimo (errors.contract internal_vs_canonical_shapes,
      // F6 del POC2). Aqui en la frontera lo traducimos a canonico.
      if (metodo_pago === 'mixto') {
        const result = this.procesarPagoMixto(desglose, monto_total);
        if (result.error) {
          return this._buildErrorResponse({
            status: 400, code: 'INVALID_INPUT',
            message: result.error,
            details: { kind: 'domain', field: 'desglose' }
          });
        }
        cobro.desglose = result.desglose;
      }

      // Link de pago
      if (metodo_pago === 'link_pago') {
        const linkId = crypto.randomUUID();
        cobro.link_url = `${this.config.payment_base_url || 'https://pay.pizzepos.com'}/checkout/${linkId}`;
        const expiracion = new Date();
        expiracion.setHours(expiracion.getHours() + (this.config.link_expiracion_horas || 24));
        cobro.expira_en = expiracion.toISOString();
        cobro.estado_externo = 'pendiente';
        cobro.referencia_externa = linkId;
      }

      // QR
      if (metodo_pago === 'qr') {
        const qrId = crypto.randomUUID();
        cobro.qr_data = JSON.stringify({
          type: 'payment',
          id: qrId,
          amount: monto_total,
          currency: 'EUR',
          merchant: this.config.merchant_id || 'PIZZEPOS',
          reference: cobro_id
        });
        cobro.qr_url = `${this.config.api_base_url || 'http://localhost:3339'}/modules/cobros/qr/${qrId}.png`;
        const expiracion = new Date();
        expiracion.setMinutes(expiracion.getMinutes() + (this.config.qr_expiracion_minutos || 30));
        cobro.expira_en = expiracion.toISOString();
        cobro.estado_externo = 'pendiente';
        cobro.referencia_externa = qrId;
      }

      this.cobros.set(cobro_id, cobro);
      this.internalMetrics.cobros_iniciados++;
      this.metrics.increment('cobros.iniciados.total');

      await this.publishCobroIniciado(cobro);

      this.logger.info('cobros.cobro.iniciado', {
        cobro_id, cuenta_id, metodo_pago, monto_total
      });

      return { status: 201, data: cobro };

    } catch (error) {
      this.metrics.increment('cobros.errors.total');
      this.logger.error('cobros.create.error', { error: error.message });
      return { status: 500, error: error.message };
    }
  }

  async handleListCobros(data) {
    const { cuenta_id, estado, metodo_pago } = data || {};

    let cobros = Array.from(this.cobros.values());

    if (cuenta_id) cobros = cobros.filter(c => c.cuenta_id === cuenta_id);
    if (estado) cobros = cobros.filter(c => c.estado === estado);
    if (metodo_pago) cobros = cobros.filter(c => c.metodo_pago === metodo_pago);

    cobros.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return { status: 200, data: { cobros, total: cobros.length } };
  }

  async handleGetCobro(data) {
    const { id } = data;
    const cobro = this.cobros.get(id);

    if (!cobro) {
      return this._buildErrorResponse({
        status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Cobro "${id}" no encontrado`,
        details: { kind: 'domain', entity_type: 'cobro', entity_id: id }
      });
    }

    return { status: 200, data: cobro };
  }

  async handleConfirmarCobro(data) {
    const { id, referencia_pago } = data;

    const cobro = this.cobros.get(id);
    if (!cobro) {
      return this._buildErrorResponse({
        status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Cobro "${id}" no encontrado`,
        details: { kind: 'domain', entity_type: 'cobro', entity_id: id }
      });
    }

    if (cobro.estado !== 'pendiente' && cobro.estado !== 'procesando') {
      return this._buildErrorResponse({
        status: 409, code: 'CONFLICT_STATE',
        message: `No se puede confirmar cobro en estado: ${cobro.estado}`,
        details: { kind: 'domain', entity_type: 'cobro', entity_id: id, estado_actual: cobro.estado, estados_validos: ['pendiente', 'procesando'] }
      });
    }

    cobro.estado = 'completado';
    cobro.referencia_pago = referencia_pago || `REF_${crypto.randomUUID().slice(0, 8)}`;
    cobro.completado_at = new Date().toISOString();

    this.internalMetrics.cobros_completados++;
    this.internalMetrics.monto_total_cobrado += cobro.monto_total;
    this.internalMetrics.propinas_total += cobro.propina;
    this.metrics.increment('cobros.completados.total');
    this.metrics.gauge('cobros.monto_total', this.internalMetrics.monto_total_cobrado);

    // cobro.procesado es el evento que cuentas escucha para marcar como cobrado
    await this.publishCobroProcesado(cobro);

    // Abrir cajón de dinero para pagos en efectivo
    if (cobro.metodo_pago === 'efectivo') {
      await this.abrirCajonDinero(cobro);
    }

    this.logger.info('cobros.cobro.confirmado', {
      cobro_id: id, monto_total: cobro.monto_total, metodo_pago: cobro.metodo_pago
    });

    return { status: 200, data: cobro };
  }

  async handleReembolsarCobro(data) {
    const { id, motivo } = data;

    const cobro = this.cobros.get(id);
    if (!cobro) {
      return this._buildErrorResponse({
        status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Cobro "${id}" no encontrado`,
        details: { kind: 'domain', entity_type: 'cobro', entity_id: id }
      });
    }

    if (cobro.estado !== 'completado') {
      return this._buildErrorResponse({
        status: 409, code: 'CONFLICT_STATE',
        message: 'Solo se pueden reembolsar cobros completados',
        details: { kind: 'domain', entity_type: 'cobro', entity_id: id, estado_actual: cobro.estado, estado_requerido: 'completado' }
      });
    }

    cobro.estado = 'reembolsado';
    cobro.motivo_reembolso = motivo || 'Sin motivo especificado';
    cobro.reembolsado_at = new Date().toISOString();

    this.internalMetrics.cobros_reembolsados++;
    this.internalMetrics.monto_total_cobrado -= cobro.monto_total;
    this.metrics.increment('cobros.reembolsados.total');
    this.metrics.gauge('cobros.monto_total', this.internalMetrics.monto_total_cobrado);

    await this.publishCobroReembolsado(cobro);

    this.logger.info('cobros.cobro.reembolsado', {
      cobro_id: id, monto_total: cobro.monto_total, motivo
    });

    return { status: 200, data: cobro };
  }

  async handleGetMetodosPago() {
    return {
      status: 200,
      data: {
        metodos_disponibles: this.metodosPago.map(metodo => ({
          id: metodo,
          nombre: this.getNombreMetodo(metodo),
          activo: true
        }))
      }
    };
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        cobros_activos: this.cobros.size
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        ...this.internalMetrics,
        cobros_activos: this.cobros.size
      }
    };
  }

  // ==========================================
  // Lógica interna
  // ==========================================

  procesarPagoMixto(desglose, monto_total) {
    if (!desglose || !Array.isArray(desglose) || desglose.length === 0) {
      return { error: 'Pago mixto requiere campo "desglose" con al menos un método de pago' };
    }

    const metodosBase = ['efectivo', 'tarjeta', 'bizum', 'transferencia'];
    for (const pago of desglose) {
      if (!metodosBase.includes(pago.metodo)) {
        return { error: `Método no válido en desglose: ${pago.metodo}` };
      }
    }

    const sumaDesglose = desglose.reduce((sum, pago) => sum + pago.monto, 0);

    if (Math.abs(sumaDesglose - monto_total) > 0.01) {
      return {
        error: `La suma del desglose (${sumaDesglose.toFixed(2)}) no coincide con el monto total (${monto_total.toFixed(2)})`
      };
    }

    const desgloseConCambio = desglose.map(pago => {
      const result = { ...pago };
      if (pago.metodo === 'efectivo' && pago.monto_recibido) {
        result.cambio = pago.monto_recibido - pago.monto;
        if (result.cambio < 0) {
          return { error: `Monto recibido insuficiente para efectivo: falta ${Math.abs(result.cambio).toFixed(2)}€` };
        }
      }
      return result;
    });

    const errorInDesglose = desgloseConCambio.find(p => p.error);
    if (errorInDesglose) {
      return { error: errorInDesglose.error };
    }

    return { desglose: desgloseConCambio };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishCobroIniciado(cobro) {
    await this.eventBus.publish('cobro.iniciado', {
      cobro_id: cobro.id,
      cuenta_id: cobro.cuenta_id,
      monto: cobro.monto,
      metodo_pago: cobro.metodo_pago,
      propina: cobro.propina,
      monto_total: cobro.monto_total
    });
  }

  async publishCobroProcesado(cobro) {
    await this.eventBus.publish('cobro.procesado', {
      cobro_id: cobro.id,
      cuenta_id: cobro.cuenta_id,
      ref_display: this.refDisplayCache.get(cobro.cuenta_id) || null,
      monto_total: cobro.monto_total,
      metodo_pago: cobro.metodo_pago,
      referencia_pago: cobro.referencia_pago,
      completado_at: cobro.completado_at
    });
  }

  async publishCobroReembolsado(cobro) {
    await this.eventBus.publish('cobro.reembolsado', {
      cobro_id: cobro.id,
      cuenta_id: cobro.cuenta_id,
      monto_reembolsado: cobro.monto_total,
      motivo: cobro.motivo_reembolso,
      reembolsado_at: cobro.reembolsado_at
    });
  }

  // ==========================================
  // Periféricos
  // ==========================================

  /**
   * Abre cajón de dinero via periferico.abrir-cajon.
   * Best-effort — no falla el cobro si el cajón no abre.
   */
  async abrirCajonDinero(cobro) {
    try {
      const destino = this.config?.cobros?.cajon_destino || 'caja';
      await this.eventBus.publish('periferico.abrir-cajon', {
        destino,
        pin: 0
      });
      this.logger.info('cobros.cajon.abierto', {
        cobro_id: cobro.id, destino
      });
    } catch (err) {
      // Cajón es best-effort — no bloquea el flujo de cobro
      this.logger.warn('cobros.cajon.error', {
        cobro_id: cobro.id, error: err.message
      });
    }
  }

  /**
   * GET /modules/cobros/cajones
   * Lista dispositivos con capacidad 'abrir-cajon' para selección.
   * Response: { cajones: [{ nombre, tipo, estado, conectado, metadata }], cajon_default }
   */
  async handleListarCajones() {
    try {
      const result = await this.eventBus.request('perifericos', 'listar-por-capacidad', {
        capacidad: 'abrir-cajon'
      });

      const cajones = result?.data?.dispositivos || [];
      return {
        status: 200,
        data: {
          cajones,
          total: cajones.length,
          cajon_default: this.config?.cobros?.cajon_destino || 'caja'
        }
      };
    } catch (err) {
      this.logger.warn('cobros.listar_cajones.error', { error: err.message });
      return {
        status: 200,
        data: {
          cajones: [],
          total: 0,
          cajon_default: this.config?.cobros?.cajon_destino || 'caja',
          nota: 'No se pudo consultar perifericos'
        }
      };
    }
  }

  // ==========================================
  // Helpers
  // ==========================================

  getNombreMetodo(metodo) {
    const nombres = {
      efectivo: 'Efectivo',
      tarjeta: 'Tarjeta',
      bizum: 'Bizum',
      transferencia: 'Transferencia',
      mixto: 'Pago Mixto',
      link_pago: 'Link de Pago',
      qr: 'Código QR'
    };
    return nombres[metodo] || metodo;
  }

  // ==========================================
  // Helper canonico (errors.contract recommended_helpers)
  // ==========================================

  /**
   * Construye respuesta de error con shape canonico { status, error: { code, message, details? } }.
   * Mutuamente excluyente con data. NUNCA incluye stack en respuesta.
   * Sucesor del patron 'return { status, error: "string" }' (drift cerrado).
   */
  _buildErrorResponse({ status, code, message, details }) {
    return {
      status,
      error: {
        code,
        message,
        ...(details ? { details } : {})
      }
    };
  }
}

module.exports = CobrosModule;
