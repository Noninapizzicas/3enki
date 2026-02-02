/**
 * Módulo Cuentas Mesa v2.0
 * Gestión de mesas del restaurante - apertura, asignación camarero, cierre
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 *
 * Emite: mesa.abierta, mesa.cerrada, mesa.camarero_asignado, cuenta.creada, cuenta.cerrada
 * Consume: pedido.creado, cobro.procesado
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const mesaSchema = require('./schemas/mesa.json');
const eventsSchema = require('./schemas/events.json');

class CuentasMesaModule {
  constructor() {
    this.name = 'cuentas-mesa';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Validación JSON Schema
    this.ajv = new Ajv({ allErrors: true, useDefaults: true });
    addFormats(this.ajv);
    this.ajv.addSchema(mesaSchema);
    this.ajv.addSchema(eventsSchema);

    // Estado en memoria
    this.mesasActivas = new Map(); // numero_mesa -> mesa_data

    // Configuración de mesas por zona
    this.configuracionMesas = {
      terraza: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      interior: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      vip: [21, 22, 23, 24, 25]
    };

    // Auto-numeración con reseteo diario
    this.fechaActual = this.getFechaActual();
    this.contadores = {};

    // Métricas internas
    this.internalMetrics = {
      mesas_abiertas: 0,
      mesas_cerradas: 0,
      camareros_asignados: 0,
      tiempo_promedio_ocupacion: 0,
      ingresos_totales: 0
    };

    this.tiemposOcupacion = [];
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

    this.logger.info('module.loading', { module: this.name, version: this.version });

    await this.subscribeToEvents();
    this.registerUIHandlers();
    this.iniciarReseoDiario();

    const totalMesas = Object.values(this.configuracionMesas).flat().length;
    this.logger.info('module.loaded', {
      module: this.name,
      total_mesas: totalMesas,
      zonas: Object.keys(this.configuracionMesas)
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
        'abrir', 'cerrar', 'asignar_camarero', 'get',
        'disponibles', 'ocupadas', 'list', 'health', 'metrics'
      ];
      for (const action of actions) {
        this.uiHandler.unregister('mesa', action);
      }
    }

    this.mesasActivas.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('cuentas-mesa.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('mesa', 'abrir', this.handleAbrirMesa.bind(this));
    this.uiHandler.register('mesa', 'cerrar', this.handleCerrarMesa.bind(this));
    this.uiHandler.register('mesa', 'asignar_camarero', this.handleAsignarCamarero.bind(this));
    this.uiHandler.register('mesa', 'get', this.handleGetMesa.bind(this));
    this.uiHandler.register('mesa', 'disponibles', this.handleGetDisponibles.bind(this));
    this.uiHandler.register('mesa', 'ocupadas', this.handleGetOcupadas.bind(this));
    this.uiHandler.register('mesa', 'list', this.handleListAll.bind(this));
    this.uiHandler.register('mesa', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('mesa', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('cuentas-mesa.ui_handlers.registered', {
      handlers: ['abrir', 'cerrar', 'asignar_camarero', 'get', 'disponibles', 'ocupadas', 'list', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('pedido.creado', this.onPedidoCreado.bind(this));
    await this.eventBus.subscribe('cobro.procesado', this.onCobroProcesado.bind(this));

    this.logger.info('cuentas-mesa.events.subscribed', {
      events: ['pedido.creado', 'cobro.procesado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onPedidoCreado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { cuenta_id, total } = eventData;

    if (!cuenta_id || !cuenta_id.startsWith('mesa_')) {
      return;
    }

    const numeroMesa = parseInt(cuenta_id.split('_')[1]);
    const mesa = this.mesasActivas.get(numeroMesa);

    if (!mesa) {
      this.logger.warn('cuentas-mesa.pedido.mesa_no_activa', {
        correlation_id: correlationId,
        cuenta_id,
        numero_mesa: numeroMesa
      });
      return;
    }

    mesa.total += total;

    this.logger.info('cuentas-mesa.pedido.agregado', {
      correlation_id: correlationId,
      numero_mesa: numeroMesa,
      total_nuevo: mesa.total
    });
  }

  async onCobroProcesado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { cuenta_id } = eventData;

    if (!cuenta_id || !cuenta_id.startsWith('mesa_')) {
      return;
    }

    const numeroMesa = parseInt(cuenta_id.split('_')[1]);

    await this.cerrarMesa(numeroMesa, correlationId);

    this.logger.info('cuentas-mesa.cerrada_tras_cobro', {
      correlation_id: correlationId,
      numero_mesa: numeroMesa
    });
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleAbrirMesa(data) {
    try {
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/mesa.json#/definitions/abrir_mesa_request');
      if (validate && !validate(data)) {
        return { status: 400, error: 'Request inválido', details: validate.errors };
      }

      const { numero_mesa, comensales, camarero, notas } = data;

      const zona = this.getZonaMesa(numero_mesa);
      if (!zona) {
        return { status: 404, error: `Mesa ${numero_mesa} no existe en la configuración` };
      }

      if (this.mesasActivas.has(numero_mesa)) {
        return { status: 409, error: `Mesa ${numero_mesa} ya está ocupada` };
      }

      this.verificarReseoDiario();

      const secuencial = this.getNextSecuencial(numero_mesa);
      const fecha = this.getFechaActual();
      const cuenta_id = `mesa_${numero_mesa}_${fecha}_${secuencial.toString().padStart(3, '0')}`;
      const capacidad = this.getCapacidadMesa(numero_mesa, zona);

      const mesa = {
        cuenta_id,
        numero_mesa,
        zona,
        capacidad,
        comensales: comensales || capacidad,
        camarero: camarero || 'Sin asignar',
        estado: 'ocupada',
        total: 0,
        hora_apertura: new Date().toISOString(),
        pedidos: [],
        notas: notas || ''
      };

      this.mesasActivas.set(numero_mesa, mesa);
      this.internalMetrics.mesas_abiertas++;

      await this.publishMesaAbierta(mesa);
      await this.publishCuentaCreada(mesa);

      this.logger.info('mesa.abierta', {
        cuenta_id,
        numero_mesa,
        zona
      });

      return { status: 201, data: mesa };

    } catch (error) {
      this.logger.error('cuentas-mesa.abrir.error', { error: error.message });
      return { status: 500, error: 'Error interno abriendo mesa' };
    }
  }

  async handleAsignarCamarero(data) {
    try {
      const { cuenta_id, camarero } = data;

      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/mesa.json#/definitions/asignar_camarero_request');
      if (validate && !validate(data)) {
        return { status: 400, error: 'Request inválido', details: validate.errors };
      }

      const numeroMesa = parseInt(cuenta_id.split('_')[1]);
      const mesa = this.mesasActivas.get(numeroMesa);

      if (!mesa) {
        return { status: 404, error: 'Mesa no encontrada o no está activa' };
      }

      const camarero_anterior = mesa.camarero;
      mesa.camarero = camarero;

      this.internalMetrics.camareros_asignados++;

      await this.publishCamareroAsignado(mesa, camarero_anterior);

      this.logger.info('mesa.camarero_asignado', {
        numero_mesa: numeroMesa,
        camarero
      });

      return { status: 200, data: mesa };

    } catch (error) {
      this.logger.error('cuentas-mesa.asignar_camarero.error', { error: error.message });
      return { status: 500, error: 'Error interno asignando camarero' };
    }
  }

  async handleCerrarMesa(data) {
    try {
      const { cuenta_id } = data;
      const numeroMesa = parseInt(cuenta_id.split('_')[1]);

      await this.cerrarMesa(numeroMesa);

      return { status: 200, data: { message: `Mesa ${numeroMesa} cerrada correctamente` } };

    } catch (error) {
      this.logger.error('cuentas-mesa.cerrar.error', { error: error.message });
      return { status: 500, error: error.message };
    }
  }

  async handleGetMesa(data) {
    const { numero } = data;
    const mesa = this.mesasActivas.get(parseInt(numero));

    if (!mesa) {
      return { status: 404, error: `Mesa ${numero} no encontrada o no está activa` };
    }

    return {
      status: 200,
      data: {
        ...mesa,
        tiempo_ocupada: this.calcularTiempoOcupacion(mesa.hora_apertura)
      }
    };
  }

  async handleGetDisponibles(data) {
    const { zona } = data || {};

    let mesasConfig = [];
    if (zona) {
      mesasConfig = this.configuracionMesas[zona] || [];
    } else {
      mesasConfig = Object.values(this.configuracionMesas).flat();
    }

    const disponibles = mesasConfig.filter(num => !this.mesasActivas.has(num));

    return {
      status: 200,
      data: {
        mesas_disponibles: disponibles.map(num => ({
          numero_mesa: num,
          zona: this.getZonaMesa(num),
          capacidad: this.getCapacidadMesa(num, this.getZonaMesa(num))
        })),
        total: disponibles.length
      }
    };
  }

  async handleGetOcupadas(data) {
    const { zona, camarero } = data || {};

    let ocupadas = Array.from(this.mesasActivas.values());

    if (zona) ocupadas = ocupadas.filter(m => m.zona === zona);
    if (camarero) ocupadas = ocupadas.filter(m => m.camarero === camarero);

    ocupadas = ocupadas.map(m => ({
      ...m,
      tiempo_ocupada: this.calcularTiempoOcupacion(m.hora_apertura)
    }));

    return {
      status: 200,
      data: { mesas_ocupadas: ocupadas, total: ocupadas.length }
    };
  }

  async handleListAll() {
    const todasMesas = Object.values(this.configuracionMesas).flat();

    const mesas = todasMesas.map(num => {
      const mesa = this.mesasActivas.get(num);
      if (mesa) {
        return {
          ...mesa,
          tiempo_ocupada: this.calcularTiempoOcupacion(mesa.hora_apertura)
        };
      }
      return {
        numero_mesa: num,
        zona: this.getZonaMesa(num),
        capacidad: this.getCapacidadMesa(num, this.getZonaMesa(num)),
        estado: 'disponible'
      };
    });

    return {
      status: 200,
      data: {
        mesas,
        total: mesas.length,
        disponibles: mesas.filter(m => m.estado === 'disponible').length,
        ocupadas: mesas.filter(m => m.estado === 'ocupada').length
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
        mesas_activas: this.mesasActivas.size
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        ...this.internalMetrics,
        mesas_activas: this.mesasActivas.size,
        mesas_disponibles: Object.values(this.configuracionMesas).flat().length - this.mesasActivas.size
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishMesaAbierta(mesa, correlationId) {
    await this.eventBus.publish('mesa.abierta', {
      cuenta_id: mesa.cuenta_id,
      numero_mesa: mesa.numero_mesa,
      zona: mesa.zona,
      capacidad: mesa.capacidad,
      comensales: mesa.comensales,
      camarero: mesa.camarero,
      hora_apertura: mesa.hora_apertura
    }, { correlationId });
  }

  async publishCuentaCreada(mesa, correlationId) {
    await this.eventBus.publish('cuenta.creada', {
      cuenta_id: mesa.cuenta_id,
      tipo: 'mesa',
      origen: 'cuentas-mesa',
      numero_mesa: mesa.numero_mesa,
      total: mesa.total,
      metadata: {
        zona: mesa.zona,
        camarero: mesa.camarero,
        comensales: mesa.comensales
      }
    }, { correlationId });
  }

  async publishCamareroAsignado(mesa, camarero_anterior, correlationId) {
    await this.eventBus.publish('mesa.camarero_asignado', {
      cuenta_id: mesa.cuenta_id,
      numero_mesa: mesa.numero_mesa,
      camarero: mesa.camarero,
      camarero_anterior
    }, { correlationId });
  }

  async publishMesaCerrada(mesa, correlationId) {
    await this.eventBus.publish('mesa.cerrada', {
      cuenta_id: mesa.cuenta_id,
      numero_mesa: mesa.numero_mesa,
      total: mesa.total,
      tiempo_ocupada: mesa.tiempo_ocupada,
      hora_cierre: mesa.hora_cierre
    }, { correlationId });
  }

  async publishCuentaCerrada(mesa, correlationId) {
    await this.eventBus.publish('cuenta.cerrada', {
      cuenta_id: mesa.cuenta_id,
      tipo: 'mesa',
      total: mesa.total,
      metadata: {
        tiempo_ocupada: mesa.tiempo_ocupada,
        numero_mesa: mesa.numero_mesa
      }
    }, { correlationId });
  }

  // ==========================================
  // Business Logic
  // ==========================================

  async cerrarMesa(numeroMesa, correlationId) {
    const mesa = this.mesasActivas.get(numeroMesa);
    if (!mesa) {
      throw new Error(`Mesa ${numeroMesa} no encontrada o no está activa`);
    }

    mesa.hora_cierre = new Date().toISOString();
    mesa.tiempo_ocupada = this.calcularTiempoOcupacion(mesa.hora_apertura);
    mesa.estado = 'cerrada';

    this.internalMetrics.mesas_cerradas++;
    this.internalMetrics.ingresos_totales += mesa.total;
    this.tiemposOcupacion.push(mesa.tiempo_ocupada);
    if (this.tiemposOcupacion.length > 100) {
      this.tiemposOcupacion.shift();
    }
    this.internalMetrics.tiempo_promedio_ocupacion =
      this.tiemposOcupacion.reduce((a, b) => a + b, 0) / this.tiemposOcupacion.length;

    await this.publishMesaCerrada(mesa, correlationId);
    await this.publishCuentaCerrada(mesa, correlationId);

    this.mesasActivas.delete(numeroMesa);

    this.logger.info('mesa.cerrada', {
      correlation_id: correlationId,
      numero_mesa: numeroMesa,
      tiempo_ocupada: mesa.tiempo_ocupada,
      total: mesa.total
    });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  getZonaMesa(numeroMesa) {
    for (const [zona, mesas] of Object.entries(this.configuracionMesas)) {
      if (mesas.includes(numeroMesa)) {
        return zona;
      }
    }
    return null;
  }

  getCapacidadMesa(numeroMesa, zona) {
    if (numeroMesa <= 10) return 2;
    if (numeroMesa <= 20) return 4;
    return 6;
  }

  calcularTiempoOcupacion(horaApertura) {
    const ahora = new Date();
    const apertura = new Date(horaApertura);
    return Math.floor((ahora - apertura) / 1000 / 60);
  }

  getFechaActual() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  getNextSecuencial(numeroMesa) {
    const key = `${numeroMesa}_${this.fechaActual}`;
    if (!this.contadores[key]) {
      this.contadores[key] = 1;
    } else {
      this.contadores[key]++;
    }
    return this.contadores[key];
  }

  verificarReseoDiario() {
    const fechaActual = this.getFechaActual();
    if (fechaActual !== this.fechaActual) {
      this.logger.info('cuentas-mesa.reseteo_diario', {
        fecha_anterior: this.fechaActual,
        fecha_nueva: fechaActual
      });
      this.fechaActual = fechaActual;
      this.contadores = {};
    }
  }

  iniciarReseoDiario() {
    this._resetInterval = setInterval(() => {
      this.verificarReseoDiario();
    }, 60 * 60 * 1000);
  }
}

module.exports = CuentasMesaModule;
