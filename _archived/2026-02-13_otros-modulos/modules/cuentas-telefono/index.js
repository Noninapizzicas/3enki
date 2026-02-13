const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const telefonoSchema = require('./schemas/telefono.json');
const eventsSchema = require('./schemas/events.json');

class CuentasTelefonoModule {
  constructor() {
    this.name = 'cuentas-telefono';
    this.version = '1.0.0';

    // Dependencias (se inyectan en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
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
  }

  async onLoad(core) {
    // Inyectar dependencias
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('[cuentas-telefono] Inicializando módulo cuentas-telefono v1.0');

    // Suscribirse a eventos
    await this.eventBus.subscribe('cocina.pedido_listo', this.onCocinaPedidoListo.bind(this));
    await this.eventBus.subscribe('cobro.completado', this.onCobroCompletado.bind(this));

    // Iniciar tarea de reseteo diario
    this.iniciarReseoDiario();

    this.logger.info('[cuentas-telefono] Módulo iniciado', {
      whatsapp_enabled: this.config.whatsapp?.enabled || false,
      caller_id_enabled: this.config.caller_id?.enabled || false
    });

    return true;
  }

  async onUnload() {
    this.logger.info('[cuentas-telefono] modulo.unloading');
  }

  // ================== Event Handlers ==================

  async onCocinaPedidoListo(event) {
    const correlationId = event.correlation_id || 'missing-cid';
    const { pedido_id } = event.payload;

    // Buscar si pertenece a un pedido telefónico
    let pedidoTelefono = null;
    for (const pedido of this.pedidosActivos.values()) {
      if (pedido.pedidos && pedido.pedidos.includes(pedido_id)) {
        pedidoTelefono = pedido;
        break;
      }
    }

    if (!pedidoTelefono) {
      return; // No es un pedido telefónico
    }

    // Marcar como listo y enviar WhatsApp
    await this.marcarListo(pedidoTelefono.cuenta_id, correlationId);

    this.logger.info('[cuentas-telefono] Pedido marcado listo automáticamente', {
      correlation_id: correlationId,
      cuenta_id: pedidoTelefono.cuenta_id
    });
  }

  async onCobroCompletado(event) {
    const correlationId = event.correlation_id || 'missing-cid';
    const { cuenta_id } = event.payload;

    // Verificar si es una cuenta telefónica
    if (!cuenta_id.startsWith('tel_')) {
      return;
    }

    // Cerrar cuenta
    await this.cerrarCuenta(cuenta_id, correlationId);

    this.logger.info('[cuentas-telefono] Cuenta cerrada tras cobro', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id
    });
  }

  // ================== HTTP Handlers ==================

  async handleLlamadaEntrante(req, context) {
    const correlationId = context.correlationId;
    this.logger.info('[cuentas-telefono] POST /telefono/llamada-entrante', {
      correlation_id: correlationId
    });

    try {
      const body = context.body;

      // Validar request
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/telefono.json#/definitions/llamada_entrante_request');
      if (!validate(body)) {
        return {
          status: 400,
          body: { error: 'Request inválido', details: validate.errors }
        };
      }

      const { telefono, caller_name } = body;

      this.internalMetrics.llamadas_recibidas++;

      // Publicar evento
      await this.publishLlamadaDetectada(telefono, caller_name, correlationId);

      // Buscar contacto existente
      const contacto = this.contactos.get(telefono);
      if (contacto) {
        this.internalMetrics.contactos_identificados++;
        await this.publishContactoIdentificado(contacto, correlationId);

        this.logger.info('[cuentas-telefono] Contacto identificado', {
          correlation_id: correlationId,
          telefono: telefono,
          nombre: contacto.nombre
        });

        return {
          status: 200,
          body: {
            identificado: true,
            contacto: contacto
          }
        };
      }

      return {
        status: 200,
        body: {
          identificado: false,
          telefono: telefono
        }
      };

    } catch (error) {
      this.logger.error('[cuentas-telefono] Error procesando llamada', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: 'Error interno procesando llamada' }
      };
    }
  }

  async handleCrearPedido(req, context) {
    const correlationId = context.correlationId;
    this.logger.info('[cuentas-telefono] POST /telefono/crear-pedido', {
      correlation_id: correlationId
    });

    try {
      const body = context.body;

      // Validar request
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/telefono.json#/definitions/crear_pedido_request');
      if (!validate(body)) {
        return {
          status: 400,
          body: { error: 'Request inválido', details: validate.errors }
        };
      }

      const { telefono, nombre, hora_recogida_estimada, tiempo_preparacion, notas } = body;

      // Verificar reseteo diario
      this.verificarReseoDiario();

      // Generar cuenta_id con auto-numeración
      this.contadorDiario++;
      const fecha = this.getFechaActual();
      const cuenta_id = `tel_${fecha}_${this.contadorDiario.toString().padStart(3, '0')}`;
      const numero_pedido = this.contadorDiario;

      // Calcular hora de recogida si no se proporcionó
      let horaRecogida = hora_recogida_estimada;
      if (!horaRecogida) {
        const minutos = tiempo_preparacion || 20;
        const now = new Date();
        now.setMinutes(now.getMinutes() + minutos);
        horaRecogida = now.toISOString();
      }

      // Buscar contacto existente
      const contacto = this.contactos.get(telefono);
      const caller_id_detectado = !!contacto;

      // Crear pedido
      const pedido = {
        cuenta_id: cuenta_id,
        numero_pedido: numero_pedido,
        telefono: telefono,
        caller_id_detectado: caller_id_detectado,
        contacto: contacto || {
          telefono: telefono,
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

      // Publicar evento específico
      await this.publishPedidoCreado(pedido, correlationId);

      // Publicar evento base cuenta.creada
      await this.publishCuentaCreada(pedido, correlationId);

      this.logger.info('[cuentas-telefono] Pedido creado', {
        correlation_id: correlationId,
        cuenta_id: cuenta_id,
        numero_pedido: numero_pedido,
        telefono: telefono
      });

      return {
        status: 201,
        body: pedido
      };

    } catch (error) {
      this.logger.error('[cuentas-telefono] Error creando pedido', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: 'Error interno creando pedido' }
      };
    }
  }

  async handleGetPendientes(req, context) {
    const correlationId = context.correlationId;

    const pendientes = Array.from(this.pedidosActivos.values())
      .filter(p => p.estado === 'pendiente' || p.estado === 'preparando');

    // Ordenar por hora de pedido
    pendientes.sort((a, b) => new Date(a.hora_pedido) - new Date(b.hora_pedido));

    return {
      status: 200,
      body: {
        pedidos: pendientes,
        total: pendientes.length
      }
    };
  }

  async handleGetPedido(req, context) {
    const correlationId = context.correlationId;
    const cuenta_id = context.params.id;

    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) {
      return {
        status: 404,
        body: { error: 'Pedido no encontrado' }
      };
    }

    return {
      status: 200,
      body: pedido
    };
  }

  async handleMarcarListo(req, context) {
    const correlationId = context.correlationId;
    const cuenta_id = context.params.id;

    this.logger.info('[cuentas-telefono] POST /telefono/:id/listo', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id
    });

    try {
      await this.marcarListo(cuenta_id, correlationId);

      return {
        status: 200,
        body: { message: 'Pedido marcado como listo y WhatsApp enviado' }
      };

    } catch (error) {
      this.logger.error('[cuentas-telefono] Error marcando listo', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: error.message }
      };
    }
  }

  async handleGetContactos(req, context) {
    const correlationId = context.correlationId;
    const { buscar } = context.query || {};

    let contactos = Array.from(this.contactos.values());

    // Búsqueda por nombre o teléfono
    if (buscar) {
      const term = buscar.toLowerCase();
      contactos = contactos.filter(c =>
        c.nombre.toLowerCase().includes(term) ||
        c.telefono.includes(term)
      );
    }

    // Ordenar por última compra (más recientes primero)
    contactos.sort((a, b) => {
      if (!a.ultima_compra) return 1;
      if (!b.ultima_compra) return -1;
      return new Date(b.ultima_compra) - new Date(a.ultima_compra);
    });

    return {
      status: 200,
      body: {
        contactos: contactos,
        total: contactos.length
      }
    };
  }

  async handleGuardarContacto(req, context) {
    const correlationId = context.correlationId;

    try {
      const body = context.body;

      // Validar request
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/telefono.json#/definitions/guardar_contacto_request');
      if (!validate(body)) {
        return {
          status: 400,
          body: { error: 'Request inválido', details: validate.errors }
        };
      }

      const { telefono, nombre, direccion, email, notas } = body;

      // Buscar contacto existente
      const existente = this.contactos.get(telefono);

      const contacto = {
        telefono: telefono,
        nombre: nombre,
        direccion: direccion || existente?.direccion || '',
        email: email || existente?.email || '',
        notas: notas || existente?.notas || '',
        pedidos_anteriores: existente?.pedidos_anteriores || 0,
        ultima_compra: existente?.ultima_compra
      };

      this.contactos.set(telefono, contacto);

      this.logger.info('[cuentas-telefono] Contacto guardado', {
        correlation_id: correlationId,
        telefono: telefono,
        nombre: nombre
      });

      return {
        status: 200,
        body: contacto
      };

    } catch (error) {
      this.logger.error('[cuentas-telefono] Error guardando contacto', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: 'Error interno guardando contacto' }
      };
    }
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      body: {
        status: 'healthy',
        module: 'cuentas-telefono',
        version: '1.0.0',
        pedidos_activos: this.pedidosActivos.size,
        contactos_guardados: this.contactos.size
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      body: {
        ...this.internalMetrics,
        pedidos_activos: this.pedidosActivos.size,
        contactos_guardados: this.contactos.size
      }
    };
  }

  // ================== Event Publishers ==================

  async publishLlamadaDetectada(telefono, caller_name, correlationId) {
    await this.eventBus.publish('telefono.llamada_detectada', {
      telefono: telefono,
      caller_name: caller_name,
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
      whatsapp_message: whatsapp_message
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

  // ================== Utilidades ==================

  async marcarListo(cuenta_id, correlationId) {
    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) {
      throw new Error('Pedido no encontrado');
    }

    pedido.estado = 'listo';

    // Enviar WhatsApp
    if (this.config.whatsapp?.enabled && !pedido.whatsapp_enviado) {
      const mensaje = this.generarMensajeWhatsApp(pedido);
      await this.enviarWhatsApp(pedido.telefono, mensaje, correlationId);

      pedido.whatsapp_enviado = true;
      pedido.whatsapp_enviado_at = new Date().toISOString();
      this.internalMetrics.whatsapp_enviados++;
    }

    // Publicar evento
    const mensaje = this.generarMensajeWhatsApp(pedido);
    await this.publishListoParaRecoger(pedido, mensaje, correlationId);

    // Actualizar contacto
    const contacto = this.contactos.get(pedido.telefono);
    if (contacto) {
      contacto.pedidos_anteriores++;
      contacto.ultima_compra = new Date().toISOString();
    }

    this.logger.info('[cuentas-telefono] Pedido marcado listo', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id,
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

    // Calcular tiempo de preparación
    const tiempoPreparacion = (new Date(pedido.hora_recogida_real) - new Date(pedido.hora_pedido)) / 1000 / 60;
    this.tiemposPreparacion.push(tiempoPreparacion);
    if (this.tiemposPreparacion.length > 100) {
      this.tiemposPreparacion.shift();
    }
    this.internalMetrics.tiempo_promedio_preparacion =
      this.tiemposPreparacion.reduce((a, b) => a + b, 0) / this.tiemposPreparacion.length;

    // Publicar evento
    await this.publishCuentaCerrada(pedido, correlationId);

    // Remover de activos
    this.pedidosActivos.delete(cuenta_id);

    this.logger.info('[cuentas-telefono] Cuenta cerrada', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id,
      total: pedido.total
    });
  }

  generarMensajeWhatsApp(pedido) {
    const template = this.config.whatsapp?.template_listo ||
      '¡Hola {{nombre}}! Tu pedido #{{numero}} está listo para recoger. Te esperamos 😊';

    return template
      .replace('{{nombre}}', pedido.contacto.nombre)
      .replace('{{numero}}', pedido.numero_pedido);
  }

  async enviarWhatsApp(telefono, mensaje, correlationId) {
    // TODO: Integrar con Twilio/WhatsApp Business API
    this.logger.info('[cuentas-telefono] WhatsApp enviado (simulado)', {
      correlation_id: correlationId,
      telefono: telefono,
      mensaje: mensaje
    });

    // Aquí iría la integración real con Twilio:
    // await twilioClient.messages.create({
    //   from: 'whatsapp:+14155238886',
    //   to: `whatsapp:${telefono}`,
    //   body: mensaje
    // });
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
      this.logger.info('[cuentas-telefono] Reseteo diario de contador', {
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

module.exports = CuentasTelefonoModule;
