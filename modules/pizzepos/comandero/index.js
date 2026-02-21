/**
 * Módulo Comandero v2.0
 * Puerta de entrada del camarero - Buffer de pedido por cuenta
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 *
 * Flujo: cuenta abierta → comandero (add/remove items) → enviar cocina → cobrar
 */

const crypto = require('crypto');

class ComanderoModule {
  constructor() {
    this.name = 'comandero';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Buffer de pedidos por cuenta: cuenta_id -> { items: [], notas: '', total: 0 }
    this.pedidos = new Map();

    // Caché de productos (para resolver nombre/precio)
    this.productosCache = new Map();
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

    // Event subscriptions are auto-wired from module.json by the loader.
    this.registerUIHandlers();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this.uiHandler) {
      const actions = ['get', 'add-item', 'remove-item', 'update-item', 'send-kitchen', 'health'];
      for (const action of actions) {
        this.uiHandler.unregister('comandero', action);
      }
    }

    this.pedidos.clear();
    this.productosCache.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('comandero.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('comandero', 'get', this.handleGetPedido.bind(this));
    this.uiHandler.register('comandero', 'add-item', this.handleAddItem.bind(this));
    this.uiHandler.register('comandero', 'remove-item', this.handleRemoveItem.bind(this));
    this.uiHandler.register('comandero', 'update-item', this.handleUpdateItem.bind(this));
    this.uiHandler.register('comandero', 'send-kitchen', this.handleEnviarCocina.bind(this));
    this.uiHandler.register('comandero', 'health', this.handleHealthCheck.bind(this));

    this.logger.info('comandero.ui_handlers.registered', {
      handlers: ['get', 'add-item', 'remove-item', 'update-item', 'send-kitchen', 'health']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('cuenta.actualizada', this.onCuentaActualizada.bind(this));
    await this.eventBus.subscribe('caja.cerrada', this.onCajaCerrada.bind(this));
    await this.eventBus.subscribe('dia.iniciado', this.onDiaIniciado.bind(this));

    // Caché de productos
    await this.eventBus.subscribe('catalogo.actualizado', this.onCatalogoActualizado.bind(this));
    await this.eventBus.subscribe('producto.creado', this.onProductoActualizado.bind(this));
    await this.eventBus.subscribe('producto.actualizado', this.onProductoActualizado.bind(this));

    this.logger.info('comandero.events.subscribed', {
      events: [
        'cuenta.actualizada', 'caja.cerrada', 'dia.iniciado',
        'catalogo.actualizado', 'producto.creado', 'producto.actualizado'
      ]
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onCuentaActualizada(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id } = data;

    this.logger.debug('cuenta.actualizada.received', {
      cuenta_id,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onCajaCerrada(event) {
    const size = this.pedidos.size;
    this.pedidos.clear();

    this.logger.info('comandero.reset.caja_cerrada', {
      pedidos_limpiados: size,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onDiaIniciado(event) {
    const size = this.pedidos.size;
    this.pedidos.clear();

    this.logger.info('comandero.reset.dia_iniciado', {
      pedidos_limpiados: size,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onCatalogoActualizado(event) {
    const data = event?.data || event?.payload || event;
    const productos = data?.productos || [];

    for (const producto of productos) {
      if (producto.id && producto.precio !== undefined) {
        this.productosCache.set(producto.id, {
          nombre: producto.nombre || producto.id,
          precio: producto.precio
        });
      }
    }

    this.logger.info('comandero.catalogo.synced', {
      productos_en_cache: this.productosCache.size
    });
  }

  async onProductoActualizado(event) {
    const data = event?.data || event?.payload || event;
    const { id, nombre, precio } = data;

    if (id && precio !== undefined) {
      this.productosCache.set(id, { nombre: nombre || id, precio });
    }
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleGetPedido(data) {
    const { cuenta_id } = data;

    if (!cuenta_id) {
      return { status: 400, error: 'cuenta_id es requerido' };
    }

    let pedido = this.pedidos.get(cuenta_id);
    if (!pedido) {
      pedido = { items: [], notas: '', total: 0 };
      this.pedidos.set(cuenta_id, pedido);
    }

    return {
      status: 200,
      data: { cuenta_id, ...pedido }
    };
  }

  async handleAddItem(data) {
    const { cuenta_id, producto_id, nombre, precio, cantidad, variaciones, notas } = data;

    if (!cuenta_id) {
      return { status: 400, error: 'cuenta_id es requerido' };
    }
    if (!producto_id) {
      return { status: 400, error: 'producto_id es requerido' };
    }

    // Obtener o crear buffer de pedido
    let pedido = this.pedidos.get(cuenta_id);
    if (!pedido) {
      pedido = { items: [], notas: '', total: 0 };
      this.pedidos.set(cuenta_id, pedido);
    }

    // Resolver nombre/precio: prioridad data > cache > fallback
    const cached = this.productosCache.get(producto_id);
    const itemNombre = nombre || cached?.nombre || producto_id;
    const itemPrecio = precio ?? cached?.precio ?? 0;
    const itemCantidad = cantidad || 1;

    if (!cached && precio === undefined) {
      this.logger.warn('comandero.producto.not_in_cache', { producto_id });
    }

    const item_id = crypto.randomUUID();
    const item = {
      id: item_id,
      producto_id,
      nombre: itemNombre,
      precio: itemPrecio,
      cantidad: itemCantidad,
      variaciones: variaciones || [],
      notas: notas || '',
      subtotal: itemPrecio * itemCantidad,
      created_at: new Date().toISOString()
    };

    pedido.items.push(item);
    pedido.total = this.calcularTotal(pedido.items);

    this.metrics.increment('pedido.item_agregado.total');

    await this.eventBus.publish('pedido.item_agregado', {
      cuenta_id,
      item_id,
      producto_id,
      nombre: itemNombre,
      precio_unitario: itemPrecio,
      precio_total: item.subtotal,
      cantidad: itemCantidad
    });

    this.logger.info('comandero.item.agregado', {
      cuenta_id, item_id, producto_id, precio: itemPrecio, cantidad: itemCantidad
    });

    return {
      status: 201,
      data: {
        item,
        pedido: { cuenta_id, items: pedido.items, total: pedido.total }
      }
    };
  }

  async handleRemoveItem(data) {
    const { cuenta_id, item_id } = data;

    const pedido = this.pedidos.get(cuenta_id);
    if (!pedido) {
      return { status: 404, error: 'Pedido no encontrado' };
    }

    const itemIndex = pedido.items.findIndex(i => i.id === item_id);
    if (itemIndex === -1) {
      return { status: 404, error: 'Item no encontrado en pedido' };
    }

    const removedItem = pedido.items.splice(itemIndex, 1)[0];
    pedido.total = this.calcularTotal(pedido.items);

    this.metrics.increment('pedido.item_eliminado.total');

    await this.eventBus.publish('pedido.item_eliminado', {
      cuenta_id,
      item_id,
      producto_id: removedItem.producto_id,
      precio_total: removedItem.subtotal
    });

    this.logger.info('comandero.item.eliminado', { cuenta_id, item_id });

    return {
      status: 200,
      data: {
        pedido: { cuenta_id, items: pedido.items, total: pedido.total }
      }
    };
  }

  async handleUpdateItem(data) {
    const { cuenta_id, item_id, cantidad, notas } = data;

    const pedido = this.pedidos.get(cuenta_id);
    if (!pedido) {
      return { status: 404, error: 'Pedido no encontrado' };
    }

    const item = pedido.items.find(i => i.id === item_id);
    if (!item) {
      return { status: 404, error: 'Item no encontrado en pedido' };
    }

    if (cantidad !== undefined) {
      if (cantidad <= 0) {
        // cantidad 0 o negativa → eliminar item
        const idx = pedido.items.indexOf(item);
        pedido.items.splice(idx, 1);
        pedido.total = this.calcularTotal(pedido.items);

        await this.eventBus.publish('pedido.item_eliminado', {
          cuenta_id, item_id, producto_id: item.producto_id, precio_total: item.subtotal
        });

        return {
          status: 200,
          data: { pedido: { cuenta_id, items: pedido.items, total: pedido.total } }
        };
      }
      item.cantidad = cantidad;
      item.subtotal = item.precio * cantidad;
    }

    if (notas !== undefined) {
      item.notas = notas;
    }

    pedido.total = this.calcularTotal(pedido.items);

    this.logger.info('comandero.item.actualizado', { cuenta_id, item_id, cantidad, notas });

    return {
      status: 200,
      data: {
        item,
        pedido: { cuenta_id, items: pedido.items, total: pedido.total }
      }
    };
  }

  async handleEnviarCocina(data) {
    const { cuenta_id } = data;

    const pedido = this.pedidos.get(cuenta_id);
    if (!pedido || pedido.items.length === 0) {
      return { status: 400, error: 'No hay items en el pedido para enviar' };
    }

    // Solo enviar items que no se hayan enviado aún
    const itemsParaEnviar = pedido.items.filter(i => !i.enviado);
    if (itemsParaEnviar.length === 0) {
      return { status: 400, error: 'Todos los items ya fueron enviados a cocina' };
    }

    const pedido_id = `ped_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const ahora = new Date().toISOString();

    // Marcar items como enviados
    for (const item of itemsParaEnviar) {
      item.enviado = true;
      item.enviado_at = ahora;
      item.pedido_id = pedido_id;
    }

    const totalEnviado = this.calcularTotal(itemsParaEnviar);

    this.metrics.increment('pedido.enviado.total');

    // pedido.creado — puente con persistencia y futuro módulo pedidos (gestión cocina)
    await this.eventBus.publish('pedido.creado', {
      cuenta_id,
      pedido_id,
      items: itemsParaEnviar,
      total: totalEnviado,
      created_at: ahora
    });

    await this.eventBus.publish('pedido.enviado_cocina', {
      cuenta_id,
      pedido_id,
      items: itemsParaEnviar,
      total: totalEnviado,
      notas_generales: pedido.notas,
      enviado_at: ahora
    });

    this.logger.info('comandero.enviado_cocina', {
      cuenta_id, pedido_id, items_enviados: itemsParaEnviar.length, total_enviado: totalEnviado
    });

    return {
      status: 200,
      data: {
        cuenta_id,
        pedido_id,
        items_enviados: itemsParaEnviar.length,
        total_enviado: totalEnviado,
        pedido: { cuenta_id, items: pedido.items, total: pedido.total }
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
        pedidos_activos: this.pedidos.size,
        productos_en_cache: this.productosCache.size,
        timestamp: new Date().toISOString()
      }
    };
  }

  // ==========================================
  // Helpers
  // ==========================================

  calcularTotal(items) {
    return items.reduce((total, item) => total + item.subtotal, 0);
  }
}

module.exports = ComanderoModule;
