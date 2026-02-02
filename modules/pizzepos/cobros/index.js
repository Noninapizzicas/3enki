const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const cobroSchema = require('./schemas/cobro.json');
const eventsSchema = require('./schemas/events.json');

class CobrosModule {
  constructor() {
    this.name = 'cobros';
    this.version = '1.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.config = {};

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

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('modulo.loading', { module: this.name });

    // Suscribirse a eventos
    await this.eventBus.subscribe('pedido.completado', this.onPedidoCompletado.bind(this));

    this.logger.info('modulo.loaded', {
      module: this.name,
      metodos_pago: this.metodosPago
    });
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });
  }

  // ================== Event Handlers ==================

  async onPedidoCompletado(event) {
    const correlationId = event.correlation_id || 'missing-cid';
    this.logger.info('[cobros] Pedido completado detectado', {
      correlation_id: correlationId,
      pedido_id: event.payload.pedido_id
    });
  }

  // ================== HTTP Handlers ==================

  async handleCreateCobro(req, context) {
    const correlationId = context.correlationId;
    this.logger.info('[cobros] POST /cobros - Iniciar cobro', { correlation_id: correlationId });

    try {
      const body = context.body;

      // Validar request
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/cobro.json#/definitions/iniciar_cobro_request');
      if (!validate(body)) {
        this.logger.warn('[cobros] Request inválido', {
          correlation_id: correlationId,
          errors: validate.errors
        });
        return {
          status: 400,
          body: { error: 'Request inválido', details: validate.errors }
        };
      }

      // Verificar método de pago
      if (!this.metodosPago.includes(body.metodo_pago)) {
        return {
          status: 400,
          body: { error: `Método de pago no soportado: ${body.metodo_pago}` }
        };
      }

      // Crear cobro
      const cobro_id = `cobro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const monto_total = body.monto + (body.propina || 0);

      const cobro = {
        id: cobro_id,
        cuenta_id: body.cuenta_id,
        pedido_ids: body.pedido_ids || [],
        monto: body.monto,
        metodo_pago: body.metodo_pago,
        estado: 'pendiente',
        propina: body.propina || 0,
        monto_total: monto_total,
        created_at: new Date().toISOString()
      };

      // Calcular cambio para efectivo
      if (body.metodo_pago === 'efectivo' && body.monto_recibido) {
        cobro.monto_recibido = body.monto_recibido;
        cobro.cambio = body.monto_recibido - monto_total;

        if (cobro.cambio < 0) {
          return {
            status: 400,
            body: { error: 'Monto recibido insuficiente', monto_faltante: Math.abs(cobro.cambio) }
          };
        }
      }

      // Manejo de pago mixto (split payment)
      if (body.metodo_pago === 'mixto') {
        if (!body.desglose || !Array.isArray(body.desglose) || body.desglose.length === 0) {
          return {
            status: 400,
            body: { error: 'Pago mixto requiere campo "desglose" con al menos un método de pago' }
          };
        }

        // Validar que cada método en desglose sea válido
        const metodosBase = ['efectivo', 'tarjeta', 'bizum', 'transferencia'];
        for (const pago of body.desglose) {
          if (!metodosBase.includes(pago.metodo)) {
            return {
              status: 400,
              body: { error: `Método no válido en desglose: ${pago.metodo}` }
            };
          }
        }

        // Calcular suma total del desglose
        const sumaDesglose = body.desglose.reduce((sum, pago) => sum + pago.monto, 0);

        // Validar que la suma coincida con el monto total
        if (Math.abs(sumaDesglose - monto_total) > 0.01) {
          return {
            status: 400,
            body: {
              error: 'La suma del desglose no coincide con el monto total',
              suma_desglose: sumaDesglose.toFixed(2),
              monto_total: monto_total.toFixed(2)
            }
          };
        }

        // Calcular cambio para pagos en efectivo dentro del desglose
        const desgloseConCambio = body.desglose.map(pago => {
          const pagoProcessed = { ...pago };
          if (pago.metodo === 'efectivo' && pago.monto_recibido) {
            pagoProcessed.cambio = pago.monto_recibido - pago.monto;
            if (pagoProcessed.cambio < 0) {
              throw new Error(`Monto recibido insuficiente para efectivo: falta ${Math.abs(pagoProcessed.cambio).toFixed(2)}€`);
            }
          }
          return pagoProcessed;
        });

        cobro.desglose = desgloseConCambio;

        this.logger.info('[cobros] Pago mixto procesado', {
          correlation_id: correlationId,
          desglose: desgloseConCambio
        });
      }

      // Manejo de link de pago
      if (body.metodo_pago === 'link_pago') {
        // Generar link único
        const linkId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        cobro.link_url = `${this.config.payment_base_url || 'https://pay.pizzepos.com'}/checkout/${linkId}`;

        // Expiración en 24 horas por defecto
        const expiracion = new Date();
        expiracion.setHours(expiracion.getHours() + (this.config.link_expiracion_horas || 24));
        cobro.expira_en = expiracion.toISOString();

        cobro.estado_externo = 'pendiente';
        cobro.referencia_externa = linkId;

        this.logger.info('[cobros] Link de pago generado', {
          correlation_id: correlationId,
          link_url: cobro.link_url,
          expira_en: cobro.expira_en
        });
      }

      // Manejo de pago QR
      if (body.metodo_pago === 'qr') {
        // Generar datos del QR
        const qrId = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Formato estándar para QR de pago (puede ser Bizum, EPC QR, etc.)
        cobro.qr_data = JSON.stringify({
          type: 'payment',
          id: qrId,
          amount: monto_total,
          currency: 'EUR',
          merchant: this.config.merchant_id || 'PIZZEPOS',
          reference: cobro_id
        });

        // URL donde se puede obtener la imagen del QR
        cobro.qr_url = `${this.config.api_base_url || 'http://localhost:3339'}/modules/cobros/qr/${qrId}.png`;

        // Expiración en 30 minutos por defecto para QR
        const expiracion = new Date();
        expiracion.setMinutes(expiracion.getMinutes() + (this.config.qr_expiracion_minutos || 30));
        cobro.expira_en = expiracion.toISOString();

        cobro.estado_externo = 'pendiente';
        cobro.referencia_externa = qrId;

        this.logger.info('[cobros] QR de pago generado', {
          correlation_id: correlationId,
          qr_url: cobro.qr_url,
          expira_en: cobro.expira_en
        });
      }

      this.cobros.set(cobro_id, cobro);
      this.internalMetrics.cobros_iniciados++;
      this.metrics.increment('cobros.iniciados.total');

      // Publicar evento
      await this.publishCobroIniciado(cobro, correlationId);

      this.logger.info('[cobros] Cobro iniciado', {
        correlation_id: correlationId,
        cobro_id: cobro_id,
        metodo_pago: body.metodo_pago,
        monto_total: monto_total
      });

      return {
        status: 201,
        body: cobro
      };

    } catch (error) {
      this.logger.error('[cobros] Error creando cobro', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: 'Error interno creando cobro' }
      };
    }
  }

  async handleListCobros(req, context) {
    const correlationId = context.correlationId;
    const { cuenta_id, estado, metodo_pago } = context.query || {};

    let cobros = Array.from(this.cobros.values());

    // Filtros
    if (cuenta_id) cobros = cobros.filter(c => c.cuenta_id === cuenta_id);
    if (estado) cobros = cobros.filter(c => c.estado === estado);
    if (metodo_pago) cobros = cobros.filter(c => c.metodo_pago === metodo_pago);

    // Ordenar por fecha (más recientes primero)
    cobros.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    this.logger.info('[cobros] GET /cobros - Listado', {
      correlation_id: correlationId,
      total: cobros.length,
      filters: { cuenta_id, estado, metodo_pago }
    });

    return {
      status: 200,
      body: {
        cobros: cobros,
        total: cobros.length
      }
    };
  }

  async handleGetCobro(req, context) {
    const correlationId = context.correlationId;
    const cobro_id = context.params.id;

    const cobro = this.cobros.get(cobro_id);
    if (!cobro) {
      this.logger.warn('[cobros] Cobro no encontrado', {
        correlation_id: correlationId,
        cobro_id: cobro_id
      });
      return {
        status: 404,
        body: { error: 'Cobro no encontrado' }
      };
    }

    return {
      status: 200,
      body: cobro
    };
  }

  async handleConfirmarCobro(req, context) {
    const correlationId = context.correlationId;
    const cobro_id = context.params.id;
    const body = context.body || {};

    this.logger.info('[cobros] POST /cobros/:id/confirmar', {
      correlation_id: correlationId,
      cobro_id: cobro_id
    });

    const cobro = this.cobros.get(cobro_id);
    if (!cobro) {
      return {
        status: 404,
        body: { error: 'Cobro no encontrado' }
      };
    }

    if (cobro.estado !== 'pendiente' && cobro.estado !== 'procesando') {
      return {
        status: 400,
        body: { error: `No se puede confirmar cobro en estado: ${cobro.estado}` }
      };
    }

    // Actualizar cobro
    cobro.estado = 'completado';
    cobro.referencia_pago = body.referencia_pago || `REF_${Date.now()}`;
    cobro.completado_at = new Date().toISOString();

    this.internalMetrics.cobros_completados++;
    this.internalMetrics.monto_total_cobrado += cobro.monto_total;
    this.internalMetrics.propinas_total += cobro.propina;
    this.metrics.increment('cobros.completados.total');
    this.metrics.gauge('cobros.monto_total', this.internalMetrics.monto_total_cobrado);

    // Publicar evento
    await this.publishCobroCompletado(cobro, correlationId);

    this.logger.info('[cobros] Cobro confirmado', {
      correlation_id: correlationId,
      cobro_id: cobro_id,
      monto_total: cobro.monto_total
    });

    return {
      status: 200,
      body: cobro
    };
  }

  async handleReembolsarCobro(req, context) {
    const correlationId = context.correlationId;
    const cobro_id = context.params.id;
    const body = context.body || {};

    this.logger.info('[cobros] POST /cobros/:id/reembolsar', {
      correlation_id: correlationId,
      cobro_id: cobro_id
    });

    const cobro = this.cobros.get(cobro_id);
    if (!cobro) {
      return {
        status: 404,
        body: { error: 'Cobro no encontrado' }
      };
    }

    if (cobro.estado !== 'completado') {
      return {
        status: 400,
        body: { error: 'Solo se pueden reembolsar cobros completados' }
      };
    }

    // Actualizar cobro
    cobro.estado = 'reembolsado';
    cobro.motivo_reembolso = body.motivo || 'Sin motivo especificado';
    cobro.reembolsado_at = new Date().toISOString();

    this.internalMetrics.cobros_reembolsados++;
    this.internalMetrics.monto_total_cobrado -= cobro.monto_total;
    this.metrics.increment('cobros.reembolsados.total');
    this.metrics.gauge('cobros.monto_total', this.internalMetrics.monto_total_cobrado);

    // Publicar evento
    await this.publishCobroReembolsado(cobro, correlationId);

    this.logger.info('[cobros] Cobro reembolsado', {
      correlation_id: correlationId,
      cobro_id: cobro_id,
      monto_total: cobro.monto_total
    });

    return {
      status: 200,
      body: cobro
    };
  }

  async handleGetMetodosPago(req, context) {
    return {
      status: 200,
      body: {
        metodos_disponibles: this.metodosPago.map(metodo => ({
          id: metodo,
          nombre: this.getNombreMetodo(metodo),
          activo: true
        }))
      }
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      body: {
        status: 'healthy',
        module: 'cobros',
        version: '1.0.0',
        cobros_activos: this.cobros.size
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      body: {
        ...this.internalMetrics,
        cobros_activos: this.cobros.size
      }
    };
  }

  // ================== Event Publishers ==================

  async publishCobroIniciado(cobro, correlationId) {
    await this.eventBus.publish('cobro.iniciado', {
      cobro_id: cobro.id,
      cuenta_id: cobro.cuenta_id,
      monto: cobro.monto,
      metodo_pago: cobro.metodo_pago,
      propina: cobro.propina,
      monto_total: cobro.monto_total
    }, { correlationId });
  }

  async publishCobroCompletado(cobro, correlationId) {
    await this.eventBus.publish('cobro.completado', {
      cobro_id: cobro.id,
      cuenta_id: cobro.cuenta_id,
      monto_total: cobro.monto_total,
      metodo_pago: cobro.metodo_pago,
      referencia_pago: cobro.referencia_pago,
      completado_at: cobro.completado_at
    }, { correlationId });
  }

  async publishCobroReembolsado(cobro, correlationId) {
    await this.eventBus.publish('cobro.reembolsado', {
      cobro_id: cobro.id,
      cuenta_id: cobro.cuenta_id,
      monto_reembolsado: cobro.monto_total,
      motivo: cobro.motivo_reembolso,
      reembolsado_at: cobro.reembolsado_at
    }, { correlationId });
  }

  // ================== Utilidades ==================

  getNombreMetodo(metodo) {
    const nombres = {
      'efectivo': 'Efectivo',
      'tarjeta': 'Tarjeta',
      'bizum': 'Bizum',
      'transferencia': 'Transferencia',
      'mixto': 'Pago Mixto',
      'link_pago': 'Link de Pago',
      'qr': 'Código QR'
    };
    return nombres[metodo] || metodo;
  }
}

module.exports = CobrosModule;
