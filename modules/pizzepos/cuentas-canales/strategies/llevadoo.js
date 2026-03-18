/**
 * Strategy: Llevadoo
 * Gestión de pedidos de delivery externo (empresa Llevadoo)
 *
 * Flujo: Llevadoo crea pedido → cocina lo prepara → Llevadoo viene a recoger
 *
 * Prefijo cuenta_id: llevadoo_{YYYYMMDD}_{seq}
 * Dominio uiHandler: 'llevadoo'
 * Eventos propios: llevadoo.pedido_recibido, llevadoo.pedido_aceptado,
 *                  llevadoo.pedido_listo, llevadoo.pedido_recogido
 * Consume: cocina.pedido_listo, comandero.enviar_cocina
 */

class LlevadooStrategy {
  constructor() {
    this.tipo = 'llevadoo';
    this.prefijo = 'llevadoo_';
    this.version = '1.0.0';

    this.pedidosActivos = new Map();

    // Config de recargos (puede actualizarse via UI)
    this.configRecargo = {
      recargo_por_producto: 1.00,    // +1€ por producto por defecto
      recargos_especificos: {}       // override por producto_id
    };

    this.internalMetrics = {
      pedidos_recibidos: 0,
      pedidos_completados: 0,
      recargo_total_acumulado: 0,
      ingresos_totales: 0
    };

    this.modulo = null;
    this._uiActions = [
      'crear_pedido', 'pendientes', 'get', 'activos',
      'aceptar', 'marcar_recogido', 'cancelar',
      'config_recargo', 'set_config_recargo',
      'carta_delivery',
      'health', 'metrics'
    ];
  }

  // ==========================================
  // Strategy Interface
  // ==========================================

  async init(modulo) {
    this.modulo = modulo;

    modulo.safeAddSchema(require('../schemas/llevadoo.json'));
    modulo.safeAddSchema(require('../schemas/llevadoo-events.json'));

    await this.restaurarDesdeArchivo();
    await this.cargarConfigRecargo();
  }

  registerUIHandlers(uiHandler) {
    uiHandler.register('llevadoo', 'crear_pedido', this.handleCrearPedido.bind(this));
    uiHandler.register('llevadoo', 'pendientes', this.handleGetPendientes.bind(this));
    uiHandler.register('llevadoo', 'get', this.handleGetPedido.bind(this));
    uiHandler.register('llevadoo', 'activos', this.handleGetActivos.bind(this));
    uiHandler.register('llevadoo', 'aceptar', this.handleAceptarPedido.bind(this));
    uiHandler.register('llevadoo', 'marcar_recogido', this.handleMarcarRecogido.bind(this));
    uiHandler.register('llevadoo', 'cancelar', this.handleCancelarPedido.bind(this));
    uiHandler.register('llevadoo', 'config_recargo', this.handleGetConfigRecargo.bind(this));
    uiHandler.register('llevadoo', 'set_config_recargo', this.handleSetConfigRecargo.bind(this));
    uiHandler.register('llevadoo', 'carta_delivery', this.handleGetCartaDelivery.bind(this));
    uiHandler.register('llevadoo', 'health', this.handleHealthCheck.bind(this));
    uiHandler.register('llevadoo', 'metrics', this.handleGetMetrics.bind(this));

    this.modulo.logger.info('canal.llevadoo.ui_handlers.registered', {
      handlers: this._uiActions
    });
  }

  unregisterUIHandlers(uiHandler) {
    for (const action of this._uiActions) {
      uiHandler.unregister('llevadoo', action);
    }
  }

  async subscribeToEvents(eventBus) {
    await eventBus.subscribe('cocina.pedido_listo', this.onCocinaPedidoListo.bind(this));
    await eventBus.subscribe('comandero.enviar_cocina', this.onComanderoEnviarCocina.bind(this));
  }

  async onCobroProcesado(cuenta_id, correlationId) {
    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) return;

    pedido.pagado = true;
    pedido.hora_pago = new Date().toISOString();

    this.modulo.logger.info('llevadoo.pedido_pagado', {
      correlation_id: correlationId,
      cuenta_id,
      estado: pedido.estado
    });

    if (pedido.estado === 'recogido') {
      await this.cerrarCuenta(cuenta_id, correlationId);
    }
  }

  getHealth() {
    return {
      pedidos_activos: this.pedidosActivos.size,
      recargo_por_producto: this.configRecargo.recargo_por_producto
    };
  }

  getMetrics() {
    return {
      ...this.internalMetrics,
      pedidos_activos: this.pedidosActivos.size,
      recargo_por_producto: this.configRecargo.recargo_por_producto,
      tiempo_promedio_preparacion: this.modulo.getPromedioTiempo('llevadoo_preparacion')
    };
  }

  getCuentasActivas() {
    return this.pedidosActivos.size;
  }

  cleanup() {
    this.pedidosActivos.clear();
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onCocinaPedidoListo(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { pedido_id } = eventData;

    let pedidoLlevadoo = null;
    for (const pedido of this.pedidosActivos.values()) {
      if (pedido.pedidos && pedido.pedidos.includes(pedido_id)) {
        pedidoLlevadoo = pedido;
        break;
      }
    }

    if (!pedidoLlevadoo) return;

    pedidoLlevadoo.estado = 'listo';
    pedidoLlevadoo.hora_listo = new Date().toISOString();

    await this.modulo.eventBus.publish('llevadoo.pedido_listo', {
      cuenta_id: pedidoLlevadoo.cuenta_id,
      numero_pedido: pedidoLlevadoo.numero_pedido,
      nombre_cliente: pedidoLlevadoo.nombre_cliente,
      total: pedidoLlevadoo.total,
      timestamp: new Date().toISOString()
    }, { correlationId });

    this.modulo.logger.info('canal.llevadoo.pedido_listo_auto', {
      correlation_id: correlationId,
      cuenta_id: pedidoLlevadoo.cuenta_id
    });
  }

  async onComanderoEnviarCocina(event) {
    const eventData = event?.data || event?.payload || event;
    const { cuenta_id, pedido_id } = eventData;

    if (!cuenta_id || !cuenta_id.startsWith(this.prefijo)) return;

    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) return;

    if (!pedido.pedidos) pedido.pedidos = [];
    pedido.pedidos.push(pedido_id);
    pedido.estado = 'en_preparacion';

    this.modulo.logger.info('llevadoo.pedido_enviado_cocina', {
      cuenta_id,
      pedido_id
    });
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleCrearPedido(data) {
    try {
      const { nombre_cliente, telefono_cliente, direccion, tiempo_preparacion, notas } = data || {};

      this.modulo.verificarReseoDiario();

      const secuencial = this.modulo.getNextSecuencial('llevadoo');
      const fecha = this.modulo.getFechaActual();
      const cuenta_id = `llevadoo_${fecha}_${secuencial.toString().padStart(3, '0')}`;
      const numero_pedido = secuencial;

      let horaRecogida = null;
      const minutos = tiempo_preparacion || 25;
      const now = new Date();
      now.setMinutes(now.getMinutes() + minutos);
      horaRecogida = now.toISOString();

      const pedido = {
        cuenta_id,
        numero_pedido,
        nombre_cliente: nombre_cliente || 'Llevadoo',
        telefono_cliente: telefono_cliente || '',
        direccion: direccion || '',
        estado: 'recibido',
        pagado: false,
        total: 0,
        recargo_total: 0,
        items: [],
        hora_pedido: new Date().toISOString(),
        hora_recogida_estimada: horaRecogida,
        pedidos: [],
        notas: notas || ''
      };

      this.pedidosActivos.set(cuenta_id, pedido);
      this.internalMetrics.pedidos_recibidos++;

      await this.modulo.eventBus.publish('llevadoo.pedido_recibido', {
        cuenta_id: pedido.cuenta_id,
        numero_pedido: pedido.numero_pedido,
        nombre_cliente: pedido.nombre_cliente,
        direccion: pedido.direccion,
        total: pedido.total,
        recargo_total: pedido.recargo_total,
        items_count: 0,
        timestamp: new Date().toISOString()
      });

      await this.modulo.publishCuentaCreada({
        cuenta_id: pedido.cuenta_id,
        tipo: 'llevadoo',
        total: pedido.total,
        metadata: {
          nombre: pedido.nombre_cliente,
          direccion: pedido.direccion,
          hora_recogida_estimada: pedido.hora_recogida_estimada
        }
      });

      this.modulo.logger.info('llevadoo.pedido_creado', {
        cuenta_id,
        numero_pedido,
        nombre_cliente: pedido.nombre_cliente
      });

      return { status: 201, data: pedido };

    } catch (error) {
      this.modulo.logger.error('canal.llevadoo.crear_pedido.error', { error: error.message });
      return { status: 500, error: 'Error interno creando pedido' };
    }
  }

  async handleGetPendientes() {
    const pendientes = Array.from(this.pedidosActivos.values())
      .filter(p => ['recibido', 'aceptado', 'en_preparacion'].includes(p.estado))
      .sort((a, b) => new Date(a.hora_pedido) - new Date(b.hora_pedido));

    return {
      status: 200,
      data: { pedidos: pendientes, total: pendientes.length }
    };
  }

  async handleGetActivos() {
    const activos = Array.from(this.pedidosActivos.values())
      .sort((a, b) => new Date(a.hora_pedido) - new Date(b.hora_pedido));

    return {
      status: 200,
      data: { pedidos: activos, total: activos.length }
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

  async handleAceptarPedido(data) {
    const { cuenta_id } = data;
    const pedido = this.pedidosActivos.get(cuenta_id);

    if (!pedido) {
      return { status: 404, error: 'Pedido no encontrado' };
    }

    if (pedido.estado !== 'recibido') {
      return { status: 400, error: `No se puede aceptar un pedido en estado '${pedido.estado}'` };
    }

    pedido.estado = 'aceptado';
    pedido.hora_aceptado = new Date().toISOString();

    await this.modulo.eventBus.publish('llevadoo.pedido_aceptado', {
      cuenta_id,
      hora_recogida_estimada: pedido.hora_recogida_estimada,
      timestamp: new Date().toISOString()
    });

    this.modulo.logger.info('llevadoo.pedido_aceptado', { cuenta_id });

    return { status: 200, data: pedido };
  }

  async handleMarcarRecogido(data) {
    const { cuenta_id } = data;

    try {
      await this.marcarRecogido(cuenta_id);
      return { status: 200, data: { message: 'Pedido marcado como recogido' } };
    } catch (error) {
      this.modulo.logger.error('canal.llevadoo.marcar_recogido.error', { error: error.message });
      return { status: 400, error: error.message };
    }
  }

  async handleCancelarPedido(data) {
    const { cuenta_id } = data;
    const pedido = this.pedidosActivos.get(cuenta_id);

    if (!pedido) {
      return { status: 404, error: 'Pedido no encontrado' };
    }

    if (['recogido', 'cancelado'].includes(pedido.estado)) {
      return { status: 400, error: `No se puede cancelar un pedido en estado '${pedido.estado}'` };
    }

    pedido.estado = 'cancelado';
    pedido.hora_cancelado = new Date().toISOString();

    await this.modulo.publishCuentaCerrada({
      cuenta_id: pedido.cuenta_id,
      tipo: 'llevadoo',
      total: 0,
      metadata: { motivo: 'cancelado' }
    });

    this.pedidosActivos.delete(cuenta_id);

    this.modulo.logger.info('llevadoo.pedido_cancelado', { cuenta_id });

    return { status: 200, data: { message: 'Pedido cancelado' } };
  }

  // ==========================================
  // Carta Delivery (productos con recargo)
  // ==========================================

  async handleGetCartaDelivery(data) {
    try {
      // Solicitar carta completa al módulo de productos
      const response = await this.modulo.eventBus.request(
        'productos', 'carta_completa',
        { project_id: data?.project_id },
        { timeout: 5000 }
      );

      if (!response || response.status !== 200) {
        return { status: 500, error: 'No se pudo cargar la carta' };
      }

      const { categorias, productos, ingredientes } = response.data;

      // Aplicar recargos a los productos
      const productosDelivery = productos.map(p => {
        const recargo = this.getRecargoProducto(p.id);
        return {
          ...p,
          precio_original: p.precio,
          recargo_delivery: recargo,
          precio: p.precio + recargo
        };
      });

      return {
        status: 200,
        data: {
          categorias,
          productos: productosDelivery,
          ingredientes,
          config_recargo: this.configRecargo
        }
      };

    } catch (error) {
      this.modulo.logger.error('llevadoo.carta_delivery.error', { error: error.message });
      return { status: 500, error: 'Error cargando carta delivery' };
    }
  }

  // ==========================================
  // Config Recargo
  // ==========================================

  async handleGetConfigRecargo() {
    return { status: 200, data: this.configRecargo };
  }

  async handleSetConfigRecargo(data) {
    const { recargo_por_producto, recargos_especificos } = data;

    if (recargo_por_producto !== undefined) {
      this.configRecargo.recargo_por_producto = Number(recargo_por_producto);
    }

    if (recargos_especificos && typeof recargos_especificos === 'object') {
      this.configRecargo.recargos_especificos = {
        ...this.configRecargo.recargos_especificos,
        ...recargos_especificos
      };
    }

    await this.guardarConfigRecargo();

    this.modulo.logger.info('llevadoo.config_recargo.actualizada', {
      recargo_por_producto: this.configRecargo.recargo_por_producto,
      especificos: Object.keys(this.configRecargo.recargos_especificos).length
    });

    return { status: 200, data: this.configRecargo };
  }

  getRecargoProducto(producto_id) {
    if (this.configRecargo.recargos_especificos[producto_id] !== undefined) {
      return this.configRecargo.recargos_especificos[producto_id];
    }
    return this.configRecargo.recargo_por_producto;
  }

  // ==========================================
  // Health & Metrics
  // ==========================================

  async handleHealthCheck() {
    return { status: 200, data: this.getHealth() };
  }

  async handleGetMetrics() {
    return { status: 200, data: this.getMetrics() };
  }

  // ==========================================
  // Business Logic
  // ==========================================

  async marcarRecogido(cuenta_id, correlationId) {
    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) {
      throw new Error('Pedido no encontrado');
    }

    if (!['listo', 'en_preparacion'].includes(pedido.estado)) {
      throw new Error(`No se puede marcar como recogido un pedido en estado '${pedido.estado}'`);
    }

    pedido.estado = 'recogido';
    pedido.hora_recogida_real = new Date().toISOString();

    const tiempoTotal = (new Date(pedido.hora_recogida_real) - new Date(pedido.hora_pedido)) / 1000 / 60;
    this.modulo.trackTiempo('llevadoo_preparacion', tiempoTotal);

    this.internalMetrics.pedidos_completados++;
    this.internalMetrics.ingresos_totales += pedido.total;
    this.internalMetrics.recargo_total_acumulado += pedido.recargo_total || 0;

    await this.modulo.eventBus.publish('llevadoo.pedido_recogido', {
      cuenta_id: pedido.cuenta_id,
      numero_pedido: pedido.numero_pedido,
      total: pedido.total,
      tiempo_total_minutos: Math.round(tiempoTotal),
      timestamp: new Date().toISOString()
    }, { correlationId });

    this.modulo.logger.info('llevadoo.pedido_recogido', {
      correlation_id: correlationId,
      cuenta_id,
      pagado: pedido.pagado,
      tiempo_minutos: Math.round(tiempoTotal)
    });

    // Cerrar directamente (Llevadoo paga aparte, no por caja)
    await this.cerrarCuenta(cuenta_id, correlationId);
  }

  async cerrarCuenta(cuenta_id, correlationId) {
    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) return;

    await this.modulo.publishCuentaCerrada({
      cuenta_id: pedido.cuenta_id,
      tipo: 'llevadoo',
      total: pedido.total,
      metadata: {
        numero_pedido: pedido.numero_pedido,
        nombre_cliente: pedido.nombre_cliente,
        recargo_total: pedido.recargo_total
      }
    }, correlationId);

    this.pedidosActivos.delete(cuenta_id);

    this.modulo.logger.info('llevadoo.cuenta_cerrada', {
      correlation_id: correlationId,
      cuenta_id,
      total: pedido.total
    });
  }

  // ==========================================
  // Persistencia
  // ==========================================

  async restaurarDesdeArchivo() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const archivo = path.join('./data/current', 'cuentas_activas.json');
      const contenido = await fs.readFile(archivo, 'utf8');
      const datos = JSON.parse(contenido);

      if (!datos.cuentas) return;

      let restaurados = 0;
      for (const [cuenta_id, cuenta] of Object.entries(datos.cuentas)) {
        if (!cuenta_id.startsWith(this.prefijo)) continue;

        const numMatch = cuenta_id.match(/_(\d+)$/);
        const numero = numMatch ? parseInt(numMatch[1], 10) : (restaurados + 1);

        const pedido = {
          cuenta_id,
          numero_pedido: numero,
          nombre_cliente: cuenta.datos_especificos?.nombre || 'Llevadoo',
          telefono_cliente: cuenta.datos_especificos?.telefono || '',
          direccion: cuenta.datos_especificos?.direccion || '',
          estado: 'en_preparacion',
          pagado: false,
          total: cuenta.total || 0,
          recargo_total: cuenta.datos_especificos?.recargo_total || 0,
          items: [],
          hora_pedido: cuenta.created_at || new Date().toISOString(),
          hora_recogida_estimada: null,
          pedidos: (cuenta.pedidos || []).map(p => p.pedido_id),
          notas: ''
        };

        this.pedidosActivos.set(cuenta_id, pedido);
        restaurados++;
      }

      if (restaurados > 0) {
        this.modulo.logger.info('canal.llevadoo.estado_restaurado', {
          pedidos_restaurados: restaurados
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.modulo?.logger?.warn('canal.llevadoo.restaurar.error', { error: error.message });
      }
    }
  }

  async cargarConfigRecargo() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const archivo = path.join('./data/current', 'llevadoo_config.json');
      const contenido = await fs.readFile(archivo, 'utf8');
      const config = JSON.parse(contenido);
      this.configRecargo = { ...this.configRecargo, ...config };
      this.modulo.logger.info('llevadoo.config_recargo.cargada', {
        recargo_por_producto: this.configRecargo.recargo_por_producto
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.modulo?.logger?.warn('llevadoo.config_recargo.error', { error: error.message });
      }
    }
  }

  async guardarConfigRecargo() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const dir = './data/current';
      await fs.mkdir(dir, { recursive: true });
      const archivo = path.join(dir, 'llevadoo_config.json');
      await fs.writeFile(archivo, JSON.stringify(this.configRecargo, null, 2));
    } catch (error) {
      this.modulo?.logger?.error('llevadoo.config_recargo.guardar.error', { error: error.message });
    }
  }
}

module.exports = LlevadooStrategy;
