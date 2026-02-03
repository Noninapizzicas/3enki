/**
 * Strategy: Mesa
 * Gestión de mesas del restaurante - apertura, zonas, camareros, cierre
 *
 * Prefijo cuenta_id: mesa_{numero}_{YYYYMMDD}_{seq}
 * Dominio uiHandler: 'mesa'
 * Eventos propios: mesa.abierta, mesa.cerrada, mesa.camarero_asignado
 * Consume: pedido.creado
 */

class MesaStrategy {
  constructor() {
    this.tipo = 'mesa';
    this.prefijo = 'mesa_';
    this.version = '3.0.0';

    this.mesasActivas = new Map();

    this.configuracionMesas = {
      terraza: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      interior: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      vip: [21, 22, 23, 24, 25]
    };

    this.internalMetrics = {
      mesas_abiertas: 0,
      mesas_cerradas: 0,
      camareros_asignados: 0,
      ingresos_totales: 0
    };

    this.modulo = null;
    this._uiActions = [
      'abrir', 'cerrar', 'asignar_camarero', 'get',
      'disponibles', 'ocupadas', 'list', 'health', 'metrics'
    ];
  }

  // ==========================================
  // Strategy Interface
  // ==========================================

  async init(modulo) {
    this.modulo = modulo;

    if (modulo.config.mesas) {
      this.configuracionMesas = modulo.config.mesas;
    }

    modulo.safeAddSchema(require('../schemas/mesa.json'));
    modulo.safeAddSchema(require('../schemas/mesa-events.json'));
  }

  registerUIHandlers(uiHandler) {
    uiHandler.register('mesa', 'abrir', this.handleAbrirMesa.bind(this));
    uiHandler.register('mesa', 'cerrar', this.handleCerrarMesa.bind(this));
    uiHandler.register('mesa', 'asignar_camarero', this.handleAsignarCamarero.bind(this));
    uiHandler.register('mesa', 'get', this.handleGetMesa.bind(this));
    uiHandler.register('mesa', 'disponibles', this.handleGetDisponibles.bind(this));
    uiHandler.register('mesa', 'ocupadas', this.handleGetOcupadas.bind(this));
    uiHandler.register('mesa', 'list', this.handleListAll.bind(this));
    uiHandler.register('mesa', 'health', this.handleHealthCheck.bind(this));
    uiHandler.register('mesa', 'metrics', this.handleGetMetrics.bind(this));

    this.modulo.logger.info('canal.mesa.ui_handlers.registered', {
      handlers: this._uiActions
    });
  }

  unregisterUIHandlers(uiHandler) {
    for (const action of this._uiActions) {
      uiHandler.unregister('mesa', action);
    }
  }

  async subscribeToEvents(eventBus) {
    await eventBus.subscribe('pedido.creado', this.onPedidoCreado.bind(this));
  }

  async onCobroProcesado(cuenta_id, correlationId) {
    const numeroMesa = parseInt(cuenta_id.split('_')[1]);
    await this.cerrarMesa(numeroMesa, correlationId);
  }

  getHealth() {
    return {
      mesas_activas: this.mesasActivas.size,
      mesas_total: Object.values(this.configuracionMesas).flat().length
    };
  }

  getMetrics() {
    return {
      ...this.internalMetrics,
      mesas_activas: this.mesasActivas.size,
      tiempo_promedio_ocupacion: this.modulo.getPromedioTiempo('mesa_ocupacion')
    };
  }

  getCuentasActivas() {
    return this.mesasActivas.size;
  }

  cleanup() {
    this.mesasActivas.clear();
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onPedidoCreado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { cuenta_id, total } = eventData;

    if (!cuenta_id || !cuenta_id.startsWith(this.prefijo)) return;

    const numeroMesa = parseInt(cuenta_id.split('_')[1]);
    const mesa = this.mesasActivas.get(numeroMesa);

    if (!mesa) {
      this.modulo.logger.warn('canal.mesa.pedido.mesa_no_activa', {
        correlation_id: correlationId,
        cuenta_id,
        numero_mesa: numeroMesa
      });
      return;
    }

    mesa.total += total || 0;

    this.modulo.logger.info('canal.mesa.pedido.agregado', {
      correlation_id: correlationId,
      numero_mesa: numeroMesa,
      total_nuevo: mesa.total
    });
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleAbrirMesa(data) {
    try {
      const validate = this.modulo.ajv.getSchema(
        'https://pizzepos.com/schemas/mesa.json#/definitions/abrir_mesa_request'
      );
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

      this.modulo.verificarReseoDiario();

      const secuencial = this.modulo.getNextSecuencial('mesa', numero_mesa);
      const fecha = this.modulo.getFechaActual();
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

      await this.modulo.eventBus.publish('mesa.abierta', {
        cuenta_id: mesa.cuenta_id,
        numero_mesa: mesa.numero_mesa,
        zona: mesa.zona,
        capacidad: mesa.capacidad,
        comensales: mesa.comensales,
        camarero: mesa.camarero,
        hora_apertura: mesa.hora_apertura
      });

      await this.modulo.publishCuentaCreada({
        cuenta_id: mesa.cuenta_id,
        tipo: 'mesa',
        total: mesa.total,
        metadata: {
          zona: mesa.zona,
          camarero: mesa.camarero,
          comensales: mesa.comensales,
          numero_mesa: mesa.numero_mesa
        }
      });

      this.modulo.logger.info('mesa.abierta', {
        cuenta_id,
        numero_mesa,
        zona
      });

      return { status: 201, data: mesa };

    } catch (error) {
      this.modulo.logger.error('canal.mesa.abrir.error', { error: error.message });
      return { status: 500, error: 'Error interno abriendo mesa' };
    }
  }

  async handleAsignarCamarero(data) {
    try {
      const validate = this.modulo.ajv.getSchema(
        'https://pizzepos.com/schemas/mesa.json#/definitions/asignar_camarero_request'
      );
      if (validate && !validate(data)) {
        return { status: 400, error: 'Request inválido', details: validate.errors };
      }

      const { cuenta_id, camarero } = data;
      const numeroMesa = parseInt(cuenta_id.split('_')[1]);
      const mesa = this.mesasActivas.get(numeroMesa);

      if (!mesa) {
        return { status: 404, error: 'Mesa no encontrada o no está activa' };
      }

      const camarero_anterior = mesa.camarero;
      mesa.camarero = camarero;
      this.internalMetrics.camareros_asignados++;

      await this.modulo.eventBus.publish('mesa.camarero_asignado', {
        cuenta_id: mesa.cuenta_id,
        numero_mesa: mesa.numero_mesa,
        camarero: mesa.camarero,
        camarero_anterior
      });

      this.modulo.logger.info('mesa.camarero_asignado', {
        numero_mesa: numeroMesa,
        camarero
      });

      return { status: 200, data: mesa };

    } catch (error) {
      this.modulo.logger.error('canal.mesa.asignar_camarero.error', { error: error.message });
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
      this.modulo.logger.error('canal.mesa.cerrar.error', { error: error.message });
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
        tiempo_ocupada: this.modulo.calcularTiempoMinutos(mesa.hora_apertura)
      }
    };
  }

  async handleGetDisponibles(data) {
    const { zona } = data || {};
    const mesasConfig = zona
      ? (this.configuracionMesas[zona] || [])
      : Object.values(this.configuracionMesas).flat();

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
      tiempo_ocupada: this.modulo.calcularTiempoMinutos(m.hora_apertura)
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
          tiempo_ocupada: this.modulo.calcularTiempoMinutos(mesa.hora_apertura)
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
    return { status: 200, data: this.getHealth() };
  }

  async handleGetMetrics() {
    return { status: 200, data: this.getMetrics() };
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
    mesa.tiempo_ocupada = this.modulo.calcularTiempoMinutos(mesa.hora_apertura);
    mesa.estado = 'cerrada';

    this.internalMetrics.mesas_cerradas++;
    this.internalMetrics.ingresos_totales += mesa.total;
    this.modulo.trackTiempo('mesa_ocupacion', mesa.tiempo_ocupada);

    await this.modulo.eventBus.publish('mesa.cerrada', {
      cuenta_id: mesa.cuenta_id,
      numero_mesa: mesa.numero_mesa,
      total: mesa.total,
      tiempo_ocupada: mesa.tiempo_ocupada,
      hora_cierre: mesa.hora_cierre
    }, { correlationId });

    await this.modulo.publishCuentaCerrada({
      cuenta_id: mesa.cuenta_id,
      tipo: 'mesa',
      total: mesa.total,
      metadata: {
        tiempo_ocupada: mesa.tiempo_ocupada,
        numero_mesa: mesa.numero_mesa
      }
    }, correlationId);

    this.mesasActivas.delete(numeroMesa);

    this.modulo.logger.info('mesa.cerrada', {
      correlation_id: correlationId,
      numero_mesa: numeroMesa,
      tiempo_ocupada: mesa.tiempo_ocupada,
      total: mesa.total
    });
  }

  // ==========================================
  // Helpers propios de Mesa
  // ==========================================

  getZonaMesa(numeroMesa) {
    for (const [zona, mesas] of Object.entries(this.configuracionMesas)) {
      if (mesas.includes(numeroMesa)) return zona;
    }
    return null;
  }

  getCapacidadMesa(numeroMesa) {
    if (numeroMesa <= 10) return 2;
    if (numeroMesa <= 20) return 4;
    return 6;
  }
}

module.exports = MesaStrategy;
