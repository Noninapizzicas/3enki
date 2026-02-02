/**
 * Módulo Cuentas Llevar v2.0
 * Sistema de tickets para pedidos "para llevar" con display SSE
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 *
 * Emite: llevar.ticket_creado, llevar.ticket_listo, llevar.ticket_entregado,
 *        cuenta.creada, cuenta.cerrada
 * Consume: cocina.pedido_listo, cobro.procesado
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const llevarSchema = require('./schemas/llevar.json');
const eventsSchema = require('./schemas/events.json');

class CuentasLlevarModule {
  constructor() {
    this.name = 'cuentas-llevar';
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
    this.ajv.addSchema(llevarSchema);
    this.ajv.addSchema(eventsSchema);

    // Estado en memoria
    this.ticketsActivos = new Map(); // cuenta_id -> ticket_data
    this.ticketsListos = new Map(); // numero_ticket -> ticket_data (para display)

    // SSE clients para display
    this.displayClients = new Set();

    // Auto-numeración con reseteo diario
    this.fechaActual = this.getFechaActual();
    this.contadorDiario = 0;

    // Métricas internas
    this.internalMetrics = {
      tickets_creados: 0,
      tickets_listos: 0,
      tickets_entregados: 0,
      tiempo_promedio_preparacion: 0,
      tiempo_promedio_espera: 0
    };

    this.tiemposPreparacion = [];
    this.tiemposEspera = [];
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

    this.logger.info('module.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this._resetInterval) {
      clearInterval(this._resetInterval);
      this._resetInterval = null;
    }

    if (this.uiHandler) {
      const actions = [
        'crear', 'marcar_listo', 'entregar', 'activos',
        'listos', 'get', 'health', 'metrics'
      ];
      for (const action of actions) {
        this.uiHandler.unregister('llevar', action);
      }
    }

    this.displayClients.clear();
    this.ticketsActivos.clear();
    this.ticketsListos.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('cuentas-llevar.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('llevar', 'crear', this.handleCrearTicket.bind(this));
    this.uiHandler.register('llevar', 'marcar_listo', this.handleMarcarListo.bind(this));
    this.uiHandler.register('llevar', 'entregar', this.handleEntregar.bind(this));
    this.uiHandler.register('llevar', 'activos', this.handleGetActivos.bind(this));
    this.uiHandler.register('llevar', 'listos', this.handleGetListos.bind(this));
    this.uiHandler.register('llevar', 'get', this.handleGetTicket.bind(this));
    this.uiHandler.register('llevar', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('llevar', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('cuentas-llevar.ui_handlers.registered', {
      handlers: ['crear', 'marcar_listo', 'entregar', 'activos', 'listos', 'get', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('cocina.pedido_listo', this.onCocinaPedidoListo.bind(this));
    await this.eventBus.subscribe('cobro.procesado', this.onCobroProcesado.bind(this));

    this.logger.info('cuentas-llevar.events.subscribed', {
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

    let ticket = null;
    for (const t of this.ticketsActivos.values()) {
      if (t.pedidos && t.pedidos.includes(pedido_id)) {
        ticket = t;
        break;
      }
    }

    if (!ticket) {
      return;
    }

    await this.marcarListo(ticket.cuenta_id, correlationId);

    this.logger.info('cuentas-llevar.ticket_listo_auto', {
      correlation_id: correlationId,
      numero_ticket: ticket.numero_ticket
    });
  }

  async onCobroProcesado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { cuenta_id } = eventData;

    if (!cuenta_id || !cuenta_id.startsWith('llevar_')) {
      return;
    }

    await this.marcarEntregado(cuenta_id, correlationId);

    this.logger.info('cuentas-llevar.cerrado_tras_cobro', {
      correlation_id: correlationId,
      cuenta_id
    });
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleCrearTicket(data) {
    try {
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/llevar.json#/definitions/crear_ticket_request');
      if (validate && !validate(data)) {
        return { status: 400, error: 'Request inválido', details: validate.errors };
      }

      const { cliente_nombre, notas } = data;

      this.verificarReseoDiario();

      this.contadorDiario++;
      const fecha = this.getFechaActual();
      const cuenta_id = `llevar_${fecha}_${this.contadorDiario.toString().padStart(3, '0')}`;
      const numero_ticket = this.contadorDiario;

      const ticket = {
        cuenta_id,
        numero_ticket,
        cliente_nombre: cliente_nombre || `Cliente ${numero_ticket}`,
        estado: 'pendiente',
        total: 0,
        hora_creacion: new Date().toISOString(),
        pedidos: [],
        notas: notas || '',
        mostrado_en_display: false
      };

      this.ticketsActivos.set(cuenta_id, ticket);
      this.internalMetrics.tickets_creados++;

      await this.publishTicketCreado(ticket);
      await this.publishCuentaCreada(ticket);

      this.logger.info('llevar.ticket_creado', {
        cuenta_id,
        numero_ticket
      });

      return { status: 201, data: ticket };

    } catch (error) {
      this.logger.error('cuentas-llevar.crear.error', { error: error.message });
      return { status: 500, error: 'Error interno creando ticket' };
    }
  }

  async handleMarcarListo(data) {
    const { cuenta_id } = data;

    try {
      await this.marcarListo(cuenta_id);
      return { status: 200, data: { message: 'Ticket marcado como listo' } };
    } catch (error) {
      this.logger.error('cuentas-llevar.marcar_listo.error', { error: error.message });
      return { status: 500, error: error.message };
    }
  }

  async handleEntregar(data) {
    const { cuenta_id } = data;

    try {
      await this.marcarEntregado(cuenta_id);
      return { status: 200, data: { message: 'Ticket entregado' } };
    } catch (error) {
      this.logger.error('cuentas-llevar.entregar.error', { error: error.message });
      return { status: 500, error: error.message };
    }
  }

  async handleGetActivos() {
    const activos = Array.from(this.ticketsActivos.values())
      .filter(t => t.estado === 'pendiente' || t.estado === 'preparando')
      .sort((a, b) => new Date(a.hora_creacion) - new Date(b.hora_creacion));

    return {
      status: 200,
      data: { tickets: activos, total: activos.length }
    };
  }

  async handleGetListos() {
    const listos = Array.from(this.ticketsListos.values())
      .sort((a, b) => new Date(b.hora_listo) - new Date(a.hora_listo));

    const maxMostrar = this.config.display?.max_numeros_mostrar || 10;
    const paraDisplay = listos.slice(0, maxMostrar);

    return {
      status: 200,
      data: { tickets: paraDisplay, total: listos.length }
    };
  }

  async handleGetTicket(data) {
    const { cuenta_id } = data;

    const ticket = this.ticketsActivos.get(cuenta_id) || this.ticketsListos.get(parseInt(cuenta_id));
    if (!ticket) {
      return { status: 404, error: 'Ticket no encontrado' };
    }

    return { status: 200, data: ticket };
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        tickets_activos: this.ticketsActivos.size,
        tickets_listos: this.ticketsListos.size,
        display_clients: this.displayClients.size
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        ...this.internalMetrics,
        tickets_activos: this.ticketsActivos.size,
        tickets_listos: this.ticketsListos.size,
        display_clients: this.displayClients.size
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishTicketCreado(ticket, correlationId) {
    await this.eventBus.publish('llevar.ticket_creado', {
      cuenta_id: ticket.cuenta_id,
      numero_ticket: ticket.numero_ticket,
      cliente_nombre: ticket.cliente_nombre,
      hora_creacion: ticket.hora_creacion
    }, { correlationId });
  }

  async publishCuentaCreada(ticket, correlationId) {
    await this.eventBus.publish('cuenta.creada', {
      cuenta_id: ticket.cuenta_id,
      tipo: 'llevar',
      origen: 'cuentas-llevar',
      numero_ticket: ticket.numero_ticket,
      total: ticket.total,
      metadata: {
        cliente_nombre: ticket.cliente_nombre
      }
    }, { correlationId });
  }

  async publishTicketListo(ticket, correlationId) {
    await this.eventBus.publish('llevar.ticket_listo', {
      cuenta_id: ticket.cuenta_id,
      numero_ticket: ticket.numero_ticket,
      cliente_nombre: ticket.cliente_nombre,
      hora_listo: ticket.hora_listo,
      tiempo_preparacion: ticket.tiempo_preparacion
    }, { correlationId });
  }

  async publishTicketEntregado(ticket, correlationId) {
    await this.eventBus.publish('llevar.ticket_entregado', {
      cuenta_id: ticket.cuenta_id,
      numero_ticket: ticket.numero_ticket,
      total: ticket.total,
      tiempo_espera: ticket.tiempo_espera,
      hora_entrega: ticket.hora_entrega
    }, { correlationId });
  }

  async publishCuentaCerrada(ticket, correlationId) {
    await this.eventBus.publish('cuenta.cerrada', {
      cuenta_id: ticket.cuenta_id,
      tipo: 'llevar',
      total: ticket.total,
      metadata: {
        numero_ticket: ticket.numero_ticket,
        tiempo_espera: ticket.tiempo_espera
      }
    }, { correlationId });
  }

  // ==========================================
  // Business Logic
  // ==========================================

  async marcarListo(cuenta_id, correlationId) {
    const ticket = this.ticketsActivos.get(cuenta_id);
    if (!ticket) {
      throw new Error('Ticket no encontrado');
    }

    ticket.estado = 'listo';
    ticket.hora_listo = new Date().toISOString();
    ticket.tiempo_preparacion = this.calcularTiempoPreparacion(ticket.hora_creacion);
    ticket.mostrado_en_display = true;

    this.internalMetrics.tickets_listos++;
    this.tiemposPreparacion.push(ticket.tiempo_preparacion);
    if (this.tiemposPreparacion.length > 100) {
      this.tiemposPreparacion.shift();
    }
    this.internalMetrics.tiempo_promedio_preparacion =
      this.tiemposPreparacion.reduce((a, b) => a + b, 0) / this.tiemposPreparacion.length;

    this.ticketsListos.set(ticket.numero_ticket, ticket);

    await this.publishTicketListo(ticket, correlationId);

    this.broadcastDisplay({
      type: 'ticket_listo',
      data: {
        numero_ticket: ticket.numero_ticket,
        cliente_nombre: ticket.cliente_nombre
      }
    });

    this.logger.info('llevar.ticket_listo', {
      correlation_id: correlationId,
      numero_ticket: ticket.numero_ticket
    });
  }

  async marcarEntregado(cuenta_id, correlationId) {
    const ticket = this.ticketsActivos.get(cuenta_id);
    if (!ticket) {
      throw new Error('Ticket no encontrado');
    }

    ticket.estado = 'entregado';
    ticket.hora_entrega = new Date().toISOString();

    if (ticket.hora_listo) {
      ticket.tiempo_espera = this.calcularTiempoEspera(ticket.hora_listo);

      this.tiemposEspera.push(ticket.tiempo_espera);
      if (this.tiemposEspera.length > 100) {
        this.tiemposEspera.shift();
      }
      this.internalMetrics.tiempo_promedio_espera =
        this.tiemposEspera.reduce((a, b) => a + b, 0) / this.tiemposEspera.length;
    }

    this.internalMetrics.tickets_entregados++;

    await this.publishTicketEntregado(ticket, correlationId);
    await this.publishCuentaCerrada(ticket, correlationId);

    this.ticketsActivos.delete(cuenta_id);
    this.ticketsListos.delete(ticket.numero_ticket);

    this.broadcastDisplay({
      type: 'ticket_entregado',
      data: { numero_ticket: ticket.numero_ticket }
    });

    this.logger.info('llevar.ticket_entregado', {
      correlation_id: correlationId,
      numero_ticket: ticket.numero_ticket
    });
  }

  broadcastDisplay(message) {
    for (const client of this.displayClients) {
      try {
        client.send(message);
      } catch (error) {
        this.logger.warn('cuentas-llevar.sse.error', {
          client_id: client.id,
          error: error.message
        });
        this.displayClients.delete(client);
      }
    }
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  calcularTiempoPreparacion(horaCreacion) {
    const ahora = new Date();
    const creacion = new Date(horaCreacion);
    return Math.floor((ahora - creacion) / 1000 / 60);
  }

  calcularTiempoEspera(horaListo) {
    const ahora = new Date();
    const listo = new Date(horaListo);
    return Math.floor((ahora - listo) / 1000 / 60);
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
      this.logger.info('cuentas-llevar.reseteo_diario', {
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

module.exports = CuentasLlevarModule;
