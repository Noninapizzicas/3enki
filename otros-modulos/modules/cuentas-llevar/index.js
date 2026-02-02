const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const llevarSchema = require('./schemas/llevar.json');
const eventsSchema = require('./schemas/events.json');

class CuentasLlevarModule {
  constructor() {
    this.name = 'cuentas-llevar';
    this.version = '1.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
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
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('[cuentas-llevar] Inicializando módulo cuentas-llevar v1.0');

    // Suscribirse a eventos
    await this.eventBus.subscribe('cocina.pedido_listo', this.onCocinaPedidoListo.bind(this));
    await this.eventBus.subscribe('cobro.completado', this.onCobroCompletado.bind(this));

    // Iniciar tarea de reseteo diario
    this.iniciarReseoDiario();

    this.logger.info('[cuentas-llevar] Módulo iniciado - Sistema de tickets para llevar');

    return true;
  }

  async onUnload() {
    this.logger.info('[cuentas-llevar] modulo.unloading');
  }

  // ================== Event Handlers ==================

  async onCocinaPedidoListo(event) {
    const correlationId = event.correlation_id || 'missing-cid';
    const { pedido_id } = event.payload;

    // Buscar si pertenece a un ticket
    let ticket = null;
    for (const t of this.ticketsActivos.values()) {
      if (t.pedidos && t.pedidos.includes(pedido_id)) {
        ticket = t;
        break;
      }
    }

    if (!ticket) {
      return; // No es un ticket de para llevar
    }

    // Marcar como listo automáticamente
    await this.marcarListo(ticket.cuenta_id, correlationId);

    this.logger.info('[cuentas-llevar] Ticket marcado listo automáticamente', {
      correlation_id: correlationId,
      numero_ticket: ticket.numero_ticket
    });
  }

  async onCobroCompletado(event) {
    const correlationId = event.correlation_id || 'missing-cid';
    const { cuenta_id } = event.payload;

    // Verificar si es un ticket
    if (!cuenta_id.startsWith('llevar_')) {
      return;
    }

    // Marcar como entregado
    await this.marcarEntregado(cuenta_id, correlationId);

    this.logger.info('[cuentas-llevar] Ticket cerrado tras cobro', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id
    });
  }

  // ================== HTTP Handlers ==================

  async handleCrearTicket(req, context) {
    const correlationId = context.correlationId;
    this.logger.info('[cuentas-llevar] POST /llevar/crear-ticket', {
      correlation_id: correlationId
    });

    try {
      const body = context.body || {};

      // Validar request
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/llevar.json#/definitions/crear_ticket_request');
      if (!validate(body)) {
        return {
          status: 400,
          body: { error: 'Request inválido', details: validate.errors }
        };
      }

      const { cliente_nombre, notas } = body;

      // Verificar reseteo diario
      this.verificarReseoDiario();

      // Generar cuenta_id con auto-numeración
      this.contadorDiario++;
      const fecha = this.getFechaActual();
      const cuenta_id = `llevar_${fecha}_${this.contadorDiario.toString().padStart(3, '0')}`;
      const numero_ticket = this.contadorDiario;

      // Crear ticket
      const ticket = {
        cuenta_id: cuenta_id,
        numero_ticket: numero_ticket,
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

      // Publicar evento específico
      await this.publishTicketCreado(ticket, correlationId);

      // Publicar evento base cuenta.creada
      await this.publishCuentaCreada(ticket, correlationId);

      this.logger.info('[cuentas-llevar] Ticket creado', {
        correlation_id: correlationId,
        cuenta_id: cuenta_id,
        numero_ticket: numero_ticket
      });

      return {
        status: 201,
        body: ticket
      };

    } catch (error) {
      this.logger.error('[cuentas-llevar] Error creando ticket', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: 'Error interno creando ticket' }
      };
    }
  }

  async handleMarcarListo(req, context) {
    const correlationId = context.correlationId;
    const cuenta_id = context.params.id;

    this.logger.info('[cuentas-llevar] POST /llevar/:id/listo', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id
    });

    try {
      await this.marcarListo(cuenta_id, correlationId);

      return {
        status: 200,
        body: { message: 'Ticket marcado como listo' }
      };

    } catch (error) {
      this.logger.error('[cuentas-llevar] Error marcando listo', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: error.message }
      };
    }
  }

  async handleEntregar(req, context) {
    const correlationId = context.correlationId;
    const cuenta_id = context.params.id;

    this.logger.info('[cuentas-llevar] POST /llevar/:id/entregar', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id
    });

    try {
      await this.marcarEntregado(cuenta_id, correlationId);

      return {
        status: 200,
        body: { message: 'Ticket entregado' }
      };

    } catch (error) {
      this.logger.error('[cuentas-llevar] Error marcando entregado', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: error.message }
      };
    }
  }

  async handleGetActivos(req, context) {
    const correlationId = context.correlationId;

    const activos = Array.from(this.ticketsActivos.values())
      .filter(t => t.estado === 'pendiente' || t.estado === 'preparando');

    // Ordenar por hora de creación
    activos.sort((a, b) => new Date(a.hora_creacion) - new Date(b.hora_creacion));

    return {
      status: 200,
      body: {
        tickets: activos,
        total: activos.length
      }
    };
  }

  async handleGetListos(req, context) {
    const correlationId = context.correlationId;

    const listos = Array.from(this.ticketsListos.values());

    // Ordenar por hora de listo (más recientes primero)
    listos.sort((a, b) => new Date(b.hora_listo) - new Date(a.hora_listo));

    // Limitar a los últimos N configurados
    const maxMostrar = this.config.display?.max_numeros_mostrar || 10;
    const paraDisplay = listos.slice(0, maxMostrar);

    return {
      status: 200,
      body: {
        tickets: paraDisplay,
        total: listos.length
      }
    };
  }

  async handleGetTicket(req, context) {
    const correlationId = context.correlationId;
    const cuenta_id = context.params.id;

    const ticket = this.ticketsActivos.get(cuenta_id) || this.ticketsListos.get(parseInt(cuenta_id));
    if (!ticket) {
      return {
        status: 404,
        body: { error: 'Ticket no encontrado' }
      };
    }

    return {
      status: 200,
      body: ticket
    };
  }

  async handleDisplay(req, context) {
    const correlationId = context.correlationId;

    this.logger.info('[cuentas-llevar] Cliente SSE conectado al display', {
      correlation_id: correlationId
    });

    // Configurar headers SSE
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    };

    // Crear cliente SSE
    const client = {
      id: `display_${Date.now()}`,
      send: (data) => {
        return `data: ${JSON.stringify(data)}\n\n`;
      }
    };

    this.displayClients.add(client);

    // Enviar estado inicial
    const listos = Array.from(this.ticketsListos.values())
      .sort((a, b) => new Date(b.hora_listo) - new Date(a.hora_listo))
      .slice(0, this.config.display?.max_numeros_mostrar || 10);

    client.send({
      type: 'connected',
      data: {
        tickets_listos: listos.map(t => ({
          numero_ticket: t.numero_ticket,
          cliente_nombre: t.cliente_nombre
        }))
      }
    });

    // Cleanup al desconectar
    req.on('close', () => {
      this.displayClients.delete(client);
      this.logger.info('[cuentas-llevar] Cliente SSE desconectado', {
        correlation_id: correlationId,
        client_id: client.id
      });
    });

    return {
      status: 200,
      headers: headers,
      body: client
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      body: {
        status: 'healthy',
        module: 'cuentas-llevar',
        version: '1.0.0',
        tickets_activos: this.ticketsActivos.size,
        tickets_listos: this.ticketsListos.size,
        display_clients: this.displayClients.size
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      body: {
        ...this.internalMetrics,
        tickets_activos: this.ticketsActivos.size,
        tickets_listos: this.ticketsListos.size,
        display_clients: this.displayClients.size
      }
    };
  }

  // ================== Event Publishers ==================

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

  // ================== Utilidades ==================

  async marcarListo(cuenta_id, correlationId) {
    const ticket = this.ticketsActivos.get(cuenta_id);
    if (!ticket) {
      throw new Error('Ticket no encontrado');
    }

    ticket.estado = 'listo';
    ticket.hora_listo = new Date().toISOString();
    ticket.tiempo_preparacion = this.calcularTiempoPreparacion(ticket.hora_creacion);
    ticket.mostrado_en_display = true;

    // Actualizar métricas
    this.internalMetrics.tickets_listos++;
    this.tiemposPreparacion.push(ticket.tiempo_preparacion);
    if (this.tiemposPreparacion.length > 100) {
      this.tiemposPreparacion.shift();
    }
    this.internalMetrics.tiempo_promedio_preparacion =
      this.tiemposPreparacion.reduce((a, b) => a + b, 0) / this.tiemposPreparacion.length;

    // Mover a listos (para display)
    this.ticketsListos.set(ticket.numero_ticket, ticket);

    // Publicar evento
    await this.publishTicketListo(ticket, correlationId);

    // Actualizar displays SSE
    this.broadcastDisplay({
      type: 'ticket_listo',
      data: {
        numero_ticket: ticket.numero_ticket,
        cliente_nombre: ticket.cliente_nombre
      }
    });

    this.logger.info('[cuentas-llevar] Ticket marcado listo', {
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

      // Actualizar métricas
      this.tiemposEspera.push(ticket.tiempo_espera);
      if (this.tiemposEspera.length > 100) {
        this.tiemposEspera.shift();
      }
      this.internalMetrics.tiempo_promedio_espera =
        this.tiemposEspera.reduce((a, b) => a + b, 0) / this.tiemposEspera.length;
    }

    this.internalMetrics.tickets_entregados++;

    // Publicar eventos
    await this.publishTicketEntregado(ticket, correlationId);
    await this.publishCuentaCerrada(ticket, correlationId);

    // Remover de activos y listos
    this.ticketsActivos.delete(cuenta_id);
    this.ticketsListos.delete(ticket.numero_ticket);

    // Actualizar displays SSE
    this.broadcastDisplay({
      type: 'ticket_entregado',
      data: {
        numero_ticket: ticket.numero_ticket
      }
    });

    this.logger.info('[cuentas-llevar] Ticket entregado', {
      correlation_id: correlationId,
      numero_ticket: ticket.numero_ticket
    });
  }

  broadcastDisplay(message) {
    const payload = JSON.stringify(message);
    for (const client of this.displayClients) {
      try {
        client.send(message);
      } catch (error) {
        this.logger.warn('[cuentas-llevar] Error enviando SSE a display', {
          client_id: client.id,
          error: error.message
        });
        this.displayClients.delete(client);
      }
    }
  }

  calcularTiempoPreparacion(horaCreacion) {
    const ahora = new Date();
    const creacion = new Date(horaCreacion);
    return Math.floor((ahora - creacion) / 1000 / 60); // minutos
  }

  calcularTiempoEspera(horaListo) {
    const ahora = new Date();
    const listo = new Date(horaListo);
    return Math.floor((ahora - listo) / 1000 / 60); // minutos
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
      this.logger.info('[cuentas-llevar] Reseteo diario de contador', {
        fecha_anterior: this.fechaActual,
        fecha_nueva: fechaActual
      });
      this.fechaActual = fechaActual;
      this.contadorDiario = 0;
    }
  }

  iniciarReseoDiario() {
    // Verificar cada hora si cambió el día
    setInterval(() => {
      this.verificarReseoDiario();
    }, 60 * 60 * 1000); // 1 hora
  }
}

module.exports = CuentasLlevarModule;
