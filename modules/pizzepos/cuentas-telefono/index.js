/**
 * Módulo Cuentas Teléfono v2.0
 * Gestión de pedidos telefónicos con caller ID y WhatsApp
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 *
 * Emite: telefono.llamada_detectada, telefono.contacto_identificado, telefono.pedido_creado,
 *        telefono.listo_para_recoger, cuenta.creada, cuenta.cerrada
 * Consume: cocina.pedido_listo, cobro.procesado
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const telefonoSchema = require('./schemas/telefono.json');
const eventsSchema = require('./schemas/events.json');

class CuentasTelefonoModule {
  constructor() {
    this.name = 'cuentas-telefono';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;
    this.config = {};

    // Validación JSON Schema
    this.ajv = new Ajv({ allErrors: true, useDefaults: true });
    addFormats(this.ajv);
    this.ajv.addSchema(telefonoSchema);
    this.ajv.addSchema(eventsSchema);

    // Estado en memoria
    this.pedidosActivos = new Map(); // cuenta_id -> pedido_data
    this.contactos = new Map(); // telefono -> contacto_data

    // Auto-numeración con reseteo diario
    this.fechaActual = this.getFechaActual();
    this.contadorDiario = 0;

    // Métricas internas
    this.internalMetrics = {
      llamadas_recibidas: 0,
      contactos_identificados: 0,
      pedidos_creados: 0,
      whatsapp_enviados: 0,
      tiempo_promedio_preparacion: 0
    };

    this.tiemposPreparacion = [];
    this._resetInterval = null;
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

    await this.subscribeToEvents();
    this.registerUIHandlers();
    this.iniciarReseoDiario();

    this.logger.info('module.loaded', {
      module: this.name,
      whatsapp_enabled: this.config.whatsapp?.enabled || false,
      caller_id_enabled: this.config.caller_id?.enabled || false
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this._resetInterval) {
      clearInterval(this._resetInterval);
      this._resetInterval = null;
    }

    if (this.uiHandler) {
      const actions = [
        'llamada', 'crear_pedido', 'pendientes', 'get',
        'marcar_listo', 'contactos', 'guardar_contacto',
        'health', 'metrics'
      ];
      for (const action of actions) {
        this.uiHandler.unregister('telefono', action);
      }
    }

    this.pedidosActivos.clear();
    this.contactos.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('cuentas-telefono.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('telefono', 'llamada', this.handleLlamadaEntrante.bind(this));
    this.uiHandler.register('telefono', 'crear_pedido', this.handleCrearPedido.bind(this));
    this.uiHandler.register('telefono', 'pendientes', this.handleGetPendientes.bind(this));
    this.uiHandler.register('telefono', 'get', this.handleGetPedido.bind(this));
    this.uiHandler.register('telefono', 'marcar_listo', this.handleMarcarListo.bind(this));
    this.uiHandler.register('telefono', 'contactos', this.handleGetContactos.bind(this));
    this.uiHandler.register('telefono', 'guardar_contacto', this.handleGuardarContacto.bind(this));
    this.uiHandler.register('telefono', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('telefono', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('cuentas-telefono.ui_handlers.registered', {
      handlers: ['llamada', 'crear_pedido', 'pendientes', 'get', 'marcar_listo', 'contactos', 'guardar_contacto', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('cocina.pedido_listo', this.onCocinaPedidoListo.bind(this));
    await this.eventBus.subscribe('cobro.procesado', this.onCobroProcesado.bind(this));

    this.logger.info('cuentas-telefono.events.subscribed', {
      events: ['cocina.pedido_listo', 'cobro.procesado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onCocinaPedidoListo(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { pedido_id } = eventData;

    let pedidoTelefono = null;
    for (const pedido of this.pedidosActivos.values()) {
      if (pedido.pedidos && pedido.pedidos.includes(pedido_id)) {
        pedidoTelefono = pedido;
        break;
      }
    }

    if (!pedidoTelefono) {
      return;
    }

    await this.marcarListo(pedidoTelefono.cuenta_id, correlationId);

    this.logger.info('cuentas-telefono.pedido_listo_auto', {
      correlation_id: correlationId,
      cuenta_id: pedidoTelefono.cuenta_id
    });
  }

  async onCobroProcesado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { cuenta_id } = eventData;

    if (!cuenta_id || !cuenta_id.startsWith('tel_')) {
      return;
    }

    await this.cerrarCuenta(cuenta_id, correlationId);

    this.logger.info('cuentas-telefono.cerrada_tras_cobro', {
      correlation_id: correlationId,
      cuenta_id
    });
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleLlamadaEntrante(data) {
    try {
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/telefono.json#/definitions/llamada_entrante_request');
      if (validate && !validate(data)) {
        return { status: 400, error: 'Request inválido', details: validate.errors };
      }

      const { telefono, caller_name } = data;

      this.internalMetrics.llamadas_recibidas++;

      await this.publishLlamadaDetectada(telefono, caller_name);

      const contacto = this.contactos.get(telefono);
      if (contacto) {
        this.internalMetrics.contactos_identificados++;
        await this.publishContactoIdentificado(contacto);

        this.logger.info('cuentas-telefono.contacto_identificado', {
          telefono,
          nombre: contacto.nombre
        });

        return { status: 200, data: { identificado: true, contacto } };
      }

      return { status: 200, data: { identificado: false, telefono } };

    } catch (error) {
      this.logger.error('cuentas-telefono.llamada.error', { error: error.message });
      return { status: 500, error: 'Error interno procesando llamada' };
    }
  }

  async handleCrearPedido(data) {
    try {
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/telefono.json#/definitions/crear_pedido_request');
      if (validate && !validate(data)) {
        return { status: 400, error: 'Request inválido', details: validate.errors };
      }

      const { telefono, nombre, hora_recogida_estimada, tiempo_preparacion, notas } = data;

      this.verificarReseoDiario();

      this.contadorDiario++;
      const fecha = this.getFechaActual();
      const cuenta_id = `tel_${fecha}_${this.contadorDiario.toString().padStart(3, '0')}`;
      const numero_pedido = this.contadorDiario;

      let horaRecogida = hora_recogida_estimada;
      if (!horaRecogida) {
        const minutos = tiempo_preparacion || 20;
        const now = new Date();
        now.setMinutes(now.getMinutes() + minutos);
        horaRecogida = now.toISOString();
      }

      const contacto = this.contactos.get(telefono);

      const pedido = {
        cuenta_id,
        numero_pedido,
        telefono,
        caller_id_detectado: !!contacto,
        contacto: contacto || {
          telefono,
          nombre: nombre || 'Cliente',
          pedidos_anteriores: 0
        },
        estado: 'pendiente',
        total: 0,
        hora_pedido: new Date().toISOString(),
        hora_recogida_estimada: horaRecogida,
        whatsapp_enviado: false,
        pedidos: [],
        notas: notas || ''
      };

      this.pedidosActivos.set(cuenta_id, pedido);
      this.internalMetrics.pedidos_creados++;

      await this.publishPedidoCreado(pedido);
      await this.publishCuentaCreada(pedido);

      this.logger.info('telefono.pedido_creado', {
        cuenta_id,
        numero_pedido,
        telefono
      });

      return { status: 201, data: pedido };

    } catch (error) {
      this.logger.error('cuentas-telefono.crear_pedido.error', { error: error.message });
      return { status: 500, error: 'Error interno creando pedido' };
    }
  }

  async handleGetPendientes() {
    const pendientes = Array.from(this.pedidosActivos.values())
      .filter(p => p.estado === 'pendiente' || p.estado === 'preparando')
      .sort((a, b) => new Date(a.hora_pedido) - new Date(b.hora_pedido));

    return {
      status: 200,
      data: { pedidos: pendientes, total: pendientes.length }
    };
  }

  async handleGetPedido(data) {
    const { cuenta_id } = data;
    const pedido = this.pedidosActivos.get(cuenta_id);

    if (!pedido) {
      return { status: 404, error: 'Pedido no encontrado' };
    }

    return { status: 200, data: pedido };
  }

  async handleMarcarListo(data) {
    const { cuenta_id } = data;

    try {
      await this.marcarListo(cuenta_id);
      return { status: 200, data: { message: 'Pedido marcado como listo y WhatsApp enviado' } };
    } catch (error) {
      this.logger.error('cuentas-telefono.marcar_listo.error', { error: error.message });
      return { status: 500, error: error.message };
    }
  }

  async handleGetContactos(data) {
    const { buscar } = data || {};

    let contactos = Array.from(this.contactos.values());

    if (buscar) {
      const term = buscar.toLowerCase();
      contactos = contactos.filter(c =>
        c.nombre.toLowerCase().includes(term) ||
        c.telefono.includes(term)
      );
    }

    contactos.sort((a, b) => {
      if (!a.ultima_compra) return 1;
      if (!b.ultima_compra) return -1;
      return new Date(b.ultima_compra) - new Date(a.ultima_compra);
    });

    return {
      status: 200,
      data: { contactos, total: contactos.length }
    };
  }

  async handleGuardarContacto(data) {
    try {
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/telefono.json#/definitions/guardar_contacto_request');
      if (validate && !validate(data)) {
        return { status: 400, error: 'Request inválido', details: validate.errors };
      }

      const { telefono, nombre, direccion, email, notas } = data;

      const existente = this.contactos.get(telefono);

      const contacto = {
        telefono,
        nombre,
        direccion: direccion || existente?.direccion || '',
        email: email || existente?.email || '',
        notas: notas || existente?.notas || '',
        pedidos_anteriores: existente?.pedidos_anteriores || 0,
        ultima_compra: existente?.ultima_compra
      };

      this.contactos.set(telefono, contacto);

      this.logger.info('telefono.contacto_guardado', { telefono, nombre });

      return { status: 200, data: contacto };

    } catch (error) {
      this.logger.error('cuentas-telefono.guardar_contacto.error', { error: error.message });
      return { status: 500, error: 'Error interno guardando contacto' };
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        pedidos_activos: this.pedidosActivos.size,
        contactos_guardados: this.contactos.size
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        ...this.internalMetrics,
        pedidos_activos: this.pedidosActivos.size,
        contactos_guardados: this.contactos.size
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishLlamadaDetectada(telefono, caller_name, correlationId) {
    await this.eventBus.publish('telefono.llamada_detectada', {
      telefono,
      caller_name,
      timestamp: new Date().toISOString()
    }, { correlationId });
  }

  async publishContactoIdentificado(contacto, correlationId) {
    await this.eventBus.publish('telefono.contacto_identificado', {
      telefono: contacto.telefono,
      nombre: contacto.nombre,
      pedidos_anteriores: contacto.pedidos_anteriores,
      ultima_compra: contacto.ultima_compra
    }, { correlationId });
  }

  async publishPedidoCreado(pedido, correlationId) {
    await this.eventBus.publish('telefono.pedido_creado', {
      cuenta_id: pedido.cuenta_id,
      numero_pedido: pedido.numero_pedido,
      telefono: pedido.telefono,
      nombre: pedido.contacto.nombre,
      hora_recogida_estimada: pedido.hora_recogida_estimada
    }, { correlationId });
  }

  async publishCuentaCreada(pedido, correlationId) {
    await this.eventBus.publish('cuenta.creada', {
      cuenta_id: pedido.cuenta_id,
      tipo: 'telefono',
      origen: 'cuentas-telefono',
      numero_pedido: pedido.numero_pedido,
      telefono: pedido.telefono,
      total: pedido.total,
      metadata: {
        nombre: pedido.contacto.nombre,
        hora_recogida_estimada: pedido.hora_recogida_estimada
      }
    }, { correlationId });
  }

  async publishListoParaRecoger(pedido, whatsapp_message, correlationId) {
    await this.eventBus.publish('telefono.listo_para_recoger', {
      cuenta_id: pedido.cuenta_id,
      numero_pedido: pedido.numero_pedido,
      telefono: pedido.telefono,
      nombre: pedido.contacto.nombre,
      total: pedido.total,
      whatsapp_message
    }, { correlationId });
  }

  async publishCuentaCerrada(pedido, correlationId) {
    await this.eventBus.publish('cuenta.cerrada', {
      cuenta_id: pedido.cuenta_id,
      tipo: 'telefono',
      total: pedido.total,
      metadata: {
        numero_pedido: pedido.numero_pedido,
        telefono: pedido.telefono
      }
    }, { correlationId });
  }

  // ==========================================
  // Business Logic
  // ==========================================

  async marcarListo(cuenta_id, correlationId) {
    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) {
      throw new Error('Pedido no encontrado');
    }

    pedido.estado = 'listo';

    if (this.config.whatsapp?.enabled && !pedido.whatsapp_enviado) {
      const mensaje = this.generarMensajeWhatsApp(pedido);
      await this.enviarWhatsApp(pedido.telefono, mensaje, correlationId);
      pedido.whatsapp_enviado = true;
      pedido.whatsapp_enviado_at = new Date().toISOString();
      this.internalMetrics.whatsapp_enviados++;
    }

    const mensaje = this.generarMensajeWhatsApp(pedido);
    await this.publishListoParaRecoger(pedido, mensaje, correlationId);

    const contacto = this.contactos.get(pedido.telefono);
    if (contacto) {
      contacto.pedidos_anteriores++;
      contacto.ultima_compra = new Date().toISOString();
    }

    this.logger.info('telefono.pedido_listo', {
      correlation_id: correlationId,
      cuenta_id,
      whatsapp_enviado: pedido.whatsapp_enviado
    });
  }

  async cerrarCuenta(cuenta_id, correlationId) {
    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) {
      throw new Error('Pedido no encontrado');
    }

    pedido.estado = 'recogido';
    pedido.hora_recogida_real = new Date().toISOString();

    const tiempoPreparacion = (new Date(pedido.hora_recogida_real) - new Date(pedido.hora_pedido)) / 1000 / 60;
    this.tiemposPreparacion.push(tiempoPreparacion);
    if (this.tiemposPreparacion.length > 100) {
      this.tiemposPreparacion.shift();
    }
    this.internalMetrics.tiempo_promedio_preparacion =
      this.tiemposPreparacion.reduce((a, b) => a + b, 0) / this.tiemposPreparacion.length;

    await this.publishCuentaCerrada(pedido, correlationId);

    this.pedidosActivos.delete(cuenta_id);

    this.logger.info('telefono.cuenta_cerrada', {
      correlation_id: correlationId,
      cuenta_id,
      total: pedido.total
    });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  generarMensajeWhatsApp(pedido) {
    const template = this.config.whatsapp?.template_listo ||
      '¡Hola {{nombre}}! Tu pedido #{{numero}} está listo para recoger. Te esperamos 😊';

    return template
      .replace('{{nombre}}', pedido.contacto.nombre)
      .replace('{{numero}}', pedido.numero_pedido);
  }

  async enviarWhatsApp(telefono, mensaje, correlationId) {
    // TODO: Integrar con Twilio/WhatsApp Business API
    this.logger.info('telefono.whatsapp_enviado', {
      correlation_id: correlationId,
      telefono,
      mensaje
    });
  }

  getFechaActual() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  verificarReseoDiario() {
    const fechaActual = this.getFechaActual();
    if (fechaActual !== this.fechaActual) {
      this.logger.info('cuentas-telefono.reseteo_diario', {
        fecha_anterior: this.fechaActual,
        fecha_nueva: fechaActual
      });
      this.fechaActual = fechaActual;
      this.contadorDiario = 0;
    }
  }

  iniciarReseoDiario() {
    this._resetInterval = setInterval(() => {
      this.verificarReseoDiario();
    }, 60 * 60 * 1000);
  }
}

module.exports = CuentasTelefonoModule;
