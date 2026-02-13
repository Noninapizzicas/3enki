const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const mesaSchema = require('./schemas/mesa.json');
const eventsSchema = require('./schemas/events.json');

class CuentasMesaModule {
  constructor() {
    this.name = 'cuentas-mesa';
    this.version = '1.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

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
    this.contadores = {}; // numero_mesa -> secuencial del día

    // Métricas internas
    this.internalMetrics = {
      mesas_abiertas: 0,
      mesas_cerradas: 0,
      camareros_asignados: 0,
      tiempo_promedio_ocupacion: 0,
      ingresos_totales: 0
    };

    this.tiemposOcupacion = [];
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('[cuentas-mesa] Inicializando módulo cuentas-mesa v1.0');

    // Suscribirse a eventos
    await this.eventBus.subscribe('pedido.creado', this.onPedidoCreado.bind(this));
    await this.eventBus.subscribe('cobro.completado', this.onCobroCompletado.bind(this));

    // Iniciar tarea de reseteo diario
    this.iniciarReseoDiario();

    const totalMesas = Object.values(this.configuracionMesas).flat().length;
    this.logger.info('[cuentas-mesa] Módulo iniciado', {
      total_mesas: totalMesas,
      zonas: Object.keys(this.configuracionMesas)
    });

    return true;
  }

  async onUnload() {
    this.logger.info('[cuentas-mesa] modulo.unloading');
  }

  // ================== Event Handlers ==================

  async onPedidoCreado(event) {
    const correlationId = event.correlation_id || 'missing-cid';
    const { cuenta_id, total } = event.payload;

    // Verificar si es una cuenta de mesa
    if (!cuenta_id.startsWith('mesa_')) {
      return;
    }

    // Extraer número de mesa del cuenta_id
    const numeroMesa = parseInt(cuenta_id.split('_')[1]);
    const mesa = this.mesasActivas.get(numeroMesa);

    if (!mesa) {
      this.logger.warn('[cuentas-mesa] Pedido para mesa no activa', {
        correlation_id: correlationId,
        cuenta_id: cuenta_id,
        numero_mesa: numeroMesa
      });
      return;
    }

    // Actualizar total
    mesa.total += total;

    this.logger.info('[cuentas-mesa] Pedido agregado a mesa', {
      correlation_id: correlationId,
      numero_mesa: numeroMesa,
      total_nuevo: mesa.total
    });
  }

  async onCobroCompletado(event) {
    const correlationId = event.correlation_id || 'missing-cid';
    const { cuenta_id } = event.payload;

    // Verificar si es una cuenta de mesa
    if (!cuenta_id.startsWith('mesa_')) {
      return;
    }

    // Extraer número de mesa
    const numeroMesa = parseInt(cuenta_id.split('_')[1]);

    // Cerrar mesa automáticamente después del cobro
    await this.cerrarMesa(numeroMesa, correlationId);

    this.logger.info('[cuentas-mesa] Mesa cerrada tras cobro completado', {
      correlation_id: correlationId,
      numero_mesa: numeroMesa
    });
  }

  // ================== HTTP Handlers ==================

  async handleAbrirMesa(req, context) {
    const correlationId = context.correlationId;
    this.logger.info('[cuentas-mesa] POST /mesas/abrir', {
      correlation_id: correlationId
    });

    try {
      const body = context.body;

      // Validar request
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/mesa.json#/definitions/abrir_mesa_request');
      if (!validate(body)) {
        return {
          status: 400,
          body: { error: 'Request inválido', details: validate.errors }
        };
      }

      const { numero_mesa, comensales, camarero, notas } = body;

      // Verificar si la mesa existe en configuración
      const zona = this.getZonaMesa(numero_mesa);
      if (!zona) {
        return {
          status: 404,
          body: { error: `Mesa ${numero_mesa} no existe en la configuración` }
        };
      }

      // Verificar si la mesa ya está ocupada
      if (this.mesasActivas.has(numero_mesa)) {
        return {
          status: 409,
          body: { error: `Mesa ${numero_mesa} ya está ocupada` }
        };
      }

      // Verificar reseteo diario
      this.verificarReseoDiario();

      // Generar cuenta_id con auto-numeración
      const secuencial = this.getNextSecuencial(numero_mesa);
      const fecha = this.getFechaActual();
      const cuenta_id = `mesa_${numero_mesa}_${fecha}_${secuencial.toString().padStart(3, '0')}`;

      // Determinar capacidad según configuración típica
      const capacidad = this.getCapacidadMesa(numero_mesa, zona);

      // Crear mesa
      const mesa = {
        cuenta_id: cuenta_id,
        numero_mesa: numero_mesa,
        zona: zona,
        capacidad: capacidad,
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

      // Publicar evento específico mesa.abierta
      await this.publishMesaAbierta(mesa, correlationId);

      // Publicar evento base cuenta.creada (para módulo cuentas)
      await this.publishCuentaCreada(mesa, correlationId);

      this.logger.info('[cuentas-mesa] Mesa abierta', {
        correlation_id: correlationId,
        cuenta_id: cuenta_id,
        numero_mesa: numero_mesa,
        zona: zona
      });

      return {
        status: 201,
        body: mesa
      };

    } catch (error) {
      this.logger.error('[cuentas-mesa] Error abriendo mesa', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: 'Error interno abriendo mesa' }
      };
    }
  }

  async handleAsignarCamarero(req, context) {
    const correlationId = context.correlationId;
    const cuenta_id = context.params.id;

    this.logger.info('[cuentas-mesa] POST /mesas/:id/asignar-camarero', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id
    });

    try {
      const body = context.body;

      // Validar request
      const validate = this.ajv.getSchema('https://pizzepos.com/schemas/mesa.json#/definitions/asignar_camarero_request');
      if (!validate(body)) {
        return {
          status: 400,
          body: { error: 'Request inválido', details: validate.errors }
        };
      }

      // Extraer número de mesa
      const numeroMesa = parseInt(cuenta_id.split('_')[1]);
      const mesa = this.mesasActivas.get(numeroMesa);

      if (!mesa) {
        return {
          status: 404,
          body: { error: 'Mesa no encontrada o no está activa' }
        };
      }

      const camarero_anterior = mesa.camarero;
      mesa.camarero = body.camarero;

      this.internalMetrics.camareros_asignados++;

      // Publicar evento
      await this.publishCamareroAsignado(mesa, camarero_anterior, correlationId);

      this.logger.info('[cuentas-mesa] Camarero asignado', {
        correlation_id: correlationId,
        numero_mesa: numeroMesa,
        camarero: body.camarero
      });

      return {
        status: 200,
        body: mesa
      };

    } catch (error) {
      this.logger.error('[cuentas-mesa] Error asignando camarero', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: 'Error interno asignando camarero' }
      };
    }
  }

  async handleCerrarMesa(req, context) {
    const correlationId = context.correlationId;
    const cuenta_id = context.params.id;

    this.logger.info('[cuentas-mesa] POST /mesas/:id/cerrar', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id
    });

    try {
      // Extraer número de mesa
      const numeroMesa = parseInt(cuenta_id.split('_')[1]);

      await this.cerrarMesa(numeroMesa, correlationId);

      return {
        status: 200,
        body: { message: `Mesa ${numeroMesa} cerrada correctamente` }
      };

    } catch (error) {
      this.logger.error('[cuentas-mesa] Error cerrando mesa', {
        correlation_id: correlationId,
        error: error.message
      });
      return {
        status: 500,
        body: { error: error.message }
      };
    }
  }

  async handleGetDisponibles(req, context) {
    const correlationId = context.correlationId;
    const { zona } = context.query || {};

    // Obtener todas las mesas configuradas
    let mesasConfig = [];
    if (zona) {
      mesasConfig = this.configuracionMesas[zona] || [];
    } else {
      mesasConfig = Object.values(this.configuracionMesas).flat();
    }

    // Filtrar las que no están activas
    const disponibles = mesasConfig.filter(num => !this.mesasActivas.has(num));

    return {
      status: 200,
      body: {
        mesas_disponibles: disponibles.map(num => ({
          numero_mesa: num,
          zona: this.getZonaMesa(num),
          capacidad: this.getCapacidadMesa(num, this.getZonaMesa(num))
        })),
        total: disponibles.length
      }
    };
  }

  async handleGetOcupadas(req, context) {
    const correlationId = context.correlationId;
    const { zona, camarero } = context.query || {};

    let ocupadas = Array.from(this.mesasActivas.values());

    // Filtros
    if (zona) ocupadas = ocupadas.filter(m => m.zona === zona);
    if (camarero) ocupadas = ocupadas.filter(m => m.camarero === camarero);

    // Calcular tiempo de ocupación
    ocupadas = ocupadas.map(m => ({
      ...m,
      tiempo_ocupada: this.calcularTiempoOcupacion(m.hora_apertura)
    }));

    return {
      status: 200,
      body: {
        mesas_ocupadas: ocupadas,
        total: ocupadas.length
      }
    };
  }

  async handleGetMesa(req, context) {
    const correlationId = context.correlationId;
    const numero = parseInt(context.params.numero);

    const mesa = this.mesasActivas.get(numero);
    if (!mesa) {
      return {
        status: 404,
        body: { error: `Mesa ${numero} no encontrada o no está activa` }
      };
    }

    return {
      status: 200,
      body: {
        ...mesa,
        tiempo_ocupada: this.calcularTiempoOcupacion(mesa.hora_apertura)
      }
    };
  }

  async handleListAll(req, context) {
    const todasMesas = Object.values(this.configuracionMesas).flat();

    const mesas = todasMesas.map(num => {
      const mesa = this.mesasActivas.get(num);
      if (mesa) {
        return {
          ...mesa,
          tiempo_ocupada: this.calcularTiempoOcupacion(mesa.hora_apertura)
        };
      } else {
        return {
          numero_mesa: num,
          zona: this.getZonaMesa(num),
          capacidad: this.getCapacidadMesa(num, this.getZonaMesa(num)),
          estado: 'disponible'
        };
      }
    });

    return {
      status: 200,
      body: {
        mesas: mesas,
        total: mesas.length,
        disponibles: mesas.filter(m => m.estado === 'disponible').length,
        ocupadas: mesas.filter(m => m.estado === 'ocupada').length
      }
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      body: {
        status: 'healthy',
        module: 'cuentas-mesa',
        version: '1.0.0',
        mesas_activas: this.mesasActivas.size
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      body: {
        ...this.internalMetrics,
        mesas_activas: this.mesasActivas.size,
        mesas_disponibles: Object.values(this.configuracionMesas).flat().length - this.mesasActivas.size
      }
    };
  }

  // ================== Event Publishers ==================

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
      camarero_anterior: camarero_anterior
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

  // ================== Utilidades ==================

  async cerrarMesa(numeroMesa, correlationId) {
    const mesa = this.mesasActivas.get(numeroMesa);
    if (!mesa) {
      throw new Error(`Mesa ${numeroMesa} no encontrada o no está activa`);
    }

    // Calcular tiempo de ocupación
    mesa.hora_cierre = new Date().toISOString();
    mesa.tiempo_ocupada = this.calcularTiempoOcupacion(mesa.hora_apertura);
    mesa.estado = 'cerrada';

    // Actualizar métricas
    this.internalMetrics.mesas_cerradas++;
    this.internalMetrics.ingresos_totales += mesa.total;
    this.tiemposOcupacion.push(mesa.tiempo_ocupada);
    if (this.tiemposOcupacion.length > 100) {
      this.tiemposOcupacion.shift();
    }
    this.internalMetrics.tiempo_promedio_ocupacion =
      this.tiemposOcupacion.reduce((a, b) => a + b, 0) / this.tiemposOcupacion.length;

    // Publicar eventos
    await this.publishMesaCerrada(mesa, correlationId);
    await this.publishCuentaCerrada(mesa, correlationId);

    // Remover de activas
    this.mesasActivas.delete(numeroMesa);

    this.logger.info('[cuentas-mesa] Mesa cerrada', {
      correlation_id: correlationId,
      numero_mesa: numeroMesa,
      tiempo_ocupada: mesa.tiempo_ocupada,
      total: mesa.total
    });
  }

  getZonaMesa(numeroMesa) {
    for (const [zona, mesas] of Object.entries(this.configuracionMesas)) {
      if (mesas.includes(numeroMesa)) {
        return zona;
      }
    }
    return null;
  }

  getCapacidadMesa(numeroMesa, zona) {
    // Lógica simple: mesas 1-10 (2 pax), 11-20 (4 pax), 21+ (6 pax)
    if (numeroMesa <= 10) return 2;
    if (numeroMesa <= 20) return 4;
    return 6;
  }

  calcularTiempoOcupacion(horaApertura) {
    const ahora = new Date();
    const apertura = new Date(horaApertura);
    return Math.floor((ahora - apertura) / 1000 / 60); // minutos
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
      this.logger.info('[cuentas-mesa] Reseteo diario de contadores', {
        fecha_anterior: this.fechaActual,
        fecha_nueva: fechaActual
      });
      this.fechaActual = fechaActual;
      this.contadores = {};
    }
  }

  iniciarReseoDiario() {
    // Verificar cada hora si cambió el día
    setInterval(() => {
      this.verificarReseoDiario();
    }, 60 * 60 * 1000); // 1 hora
  }
}

module.exports = CuentasMesaModule;
