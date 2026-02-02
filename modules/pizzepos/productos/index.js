/**
 * Módulo Productos v2.1
 * Catálogo de productos - Actualizado desde menús generados por IA
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 *
 * Emite: producto.creado, producto.actualizado, producto.eliminado, catalogo.actualizado
 * Consume: menu.generado, menu.validado
 */

class ProductosModule {
  constructor() {
    this.name = 'productos';
    this.version = '2.1.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Estado en memoria
    this.productos = new Map(); // producto_id -> producto
    this.categorias = new Map(); // categoria_id -> categoria
    this.ingredientes = new Map(); // ingrediente_id -> ingrediente
    this.menusPendientes = new Map(); // menu_id -> productos_draft
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

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this.uiHandler) {
      const actions = [
        'list', 'get', 'search', 'update', 'delete',
        'categorias', 'ingredientes', 'pizzas',
        'stats', 'health', 'metrics'
      ];
      for (const action of actions) {
        this.uiHandler.unregister('productos', action);
      }
    }

    this.productos.clear();
    this.categorias.clear();
    this.ingredientes.clear();
    this.menusPendientes.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('productos.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('productos', 'list', this.handleListProductos.bind(this));
    this.uiHandler.register('productos', 'get', this.handleGetProducto.bind(this));
    this.uiHandler.register('productos', 'search', this.handleSearchProductos.bind(this));
    this.uiHandler.register('productos', 'update', this.handleUpdateProducto.bind(this));
    this.uiHandler.register('productos', 'delete', this.handleDeleteProducto.bind(this));
    this.uiHandler.register('productos', 'categorias', this.handleListCategorias.bind(this));
    this.uiHandler.register('productos', 'ingredientes', this.handleListIngredientes.bind(this));
    this.uiHandler.register('productos', 'pizzas', this.handleListPizzas.bind(this));
    this.uiHandler.register('productos', 'stats', this.handleGetStats.bind(this));
    this.uiHandler.register('productos', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('productos', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('productos.ui_handlers.registered', {
      handlers: ['list', 'get', 'search', 'update', 'delete', 'categorias', 'ingredientes', 'pizzas', 'stats', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('menu.generado', this.onMenuGenerado.bind(this));
    await this.eventBus.subscribe('menu.validado', this.onMenuValidado.bind(this));

    this.logger.info('productos.events.subscribed', {
      events: ['menu.generado', 'menu.validado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onMenuGenerado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { menu_id, productos, categorias, ingredientes_catalogo } = eventData;
    const start_time = Date.now();

    this.logger.info('menu.generado.received', {
      menu_id,
      productos_count: productos?.length || 0,
      categorias_count: categorias?.length || 0,
      ingredientes_count: ingredientes_catalogo?.length || 0,
      correlation_id: correlationId
    });

    try {
      this.menusPendientes.set(menu_id, {
        productos: productos || [],
        categorias: categorias || [],
        ingredientes: ingredientes_catalogo || [],
        received_at: new Date().toISOString()
      });

      this.logger.info('menu.productos_guardados', {
        menu_id,
        productos_count: productos?.length || 0,
        estado: 'pendiente_validacion',
        correlation_id: correlationId,
        duration: Date.now() - start_time
      });

    } catch (error) {
      this.logger.error('menu.generado.error', {
        menu_id,
        error: error.message,
        correlation_id: correlationId
      });

      this.metrics.increment('producto.errors.total', 1, { operation: 'menu_generado' });
    }
  }

  async onMenuValidado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { menu_id, correcciones } = eventData;
    const start_time = Date.now();

    this.logger.info('menu.validado.received', {
      menu_id,
      correcciones_count: correcciones ? correcciones.length : 0,
      correlation_id: correlationId
    });

    try {
      const menuPendiente = this.menusPendientes.get(menu_id);
      if (!menuPendiente) {
        this.logger.warn('menu.validado.not_found', {
          menu_id,
          correlation_id: correlationId
        });
        return;
      }

      let { productos, categorias, ingredientes } = menuPendiente;

      if (correcciones && correcciones.length > 0) {
        productos = this.applyCorrections(productos, correcciones);
      }

      const stats = await this.syncCatalogo(menu_id, productos, categorias, correlationId);

      if (ingredientes && ingredientes.length > 0) {
        stats.ingredientes_nuevos = 0;
        for (const ing of ingredientes) {
          if (!this.ingredientes.has(ing.id)) {
            stats.ingredientes_nuevos++;
          }
          this.ingredientes.set(ing.id, {
            ...ing,
            activo: true,
            menu_source_id: menu_id,
            updated_at: new Date().toISOString()
          });
        }
      }

      this.menusPendientes.delete(menu_id);

      this.metrics.increment('catalogo.actualizado.total');
      this.metrics.timing('catalogo.sync.duration', Date.now() - start_time);
      this.metrics.gauge('producto.activos.count', this.productos.size);

      await this.publishCatalogoActualizado(menu_id, stats, Date.now() - start_time, correlationId);

      this.logger.info('catalogo.sincronizado', {
        menu_id,
        estadisticas: stats,
        correlation_id: correlationId,
        duration: Date.now() - start_time
      });

    } catch (error) {
      this.logger.error('menu.validado.error', {
        menu_id,
        error: error.message,
        stack: error.stack,
        correlation_id: correlationId
      });

      this.metrics.increment('producto.errors.total', 1, { operation: 'menu_validado' });
    }
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleListProductos(data) {
    const start_time = Date.now();
    const { categoria, activo } = data || {};

    let productos = Array.from(this.productos.values());

    if (categoria) {
      productos = productos.filter(p => p.categoria === categoria);
    }

    if (activo !== undefined) {
      const activoBoolean = activo === 'true' || activo === true;
      productos = productos.filter(p => p.activo === activoBoolean);
    }

    productos.sort((a, b) => {
      if (a.categoria !== b.categoria) {
        return a.categoria.localeCompare(b.categoria);
      }
      return a.nombre.localeCompare(b.nombre);
    });

    this.metrics.timing('producto.list.duration', Date.now() - start_time);

    return {
      status: 200,
      data: { productos, total: productos.length }
    };
  }

  async handleGetProducto(data) {
    const { id } = data;
    const producto = this.productos.get(id);

    if (!producto) {
      return { status: 404, error: 'Producto no encontrado' };
    }

    return { status: 200, data: producto };
  }

  async handleSearchProductos(data) {
    const start_time = Date.now();
    const { q } = data || {};

    if (!q) {
      return { status: 400, error: 'Parámetro "q" requerido' };
    }

    const searchTerm = q.toLowerCase();
    const resultados = Array.from(this.productos.values())
      .filter(p =>
        p.activo &&
        (p.nombre.toLowerCase().includes(searchTerm) ||
         (p.descripcion && p.descripcion.toLowerCase().includes(searchTerm)))
      );

    this.metrics.timing('producto.search.duration', Date.now() - start_time);

    return {
      status: 200,
      data: { resultados, total: resultados.length, query: q }
    };
  }

  async handleListCategorias() {
    const categorias = Array.from(this.categorias.values())
      .sort((a, b) => a.orden - b.orden);

    const categoriasConConteo = categorias.map(cat => ({
      ...cat,
      productos_count: Array.from(this.productos.values())
        .filter(p => p.categoria === cat.nombre && p.activo).length
    }));

    return {
      status: 200,
      data: { categorias: categoriasConConteo, total: categorias.length }
    };
  }

  async handleListIngredientes(data) {
    const { tipo } = data || {};

    let ingredientes = Array.from(this.ingredientes.values())
      .filter(i => i.activo !== false);

    if (tipo) {
      ingredientes = ingredientes.filter(i => i.tipo === tipo);
    }

    ingredientes.sort((a, b) => {
      if (a.tipo !== b.tipo) {
        return a.tipo.localeCompare(b.tipo);
      }
      return a.nombre.localeCompare(b.nombre);
    });

    return {
      status: 200,
      data: { ingredientes, total: ingredientes.length }
    };
  }

  async handleListPizzas() {
    const pizzas = Array.from(this.productos.values())
      .filter(p =>
        p.activo &&
        (p.categoria === 'Pizzas' || p.categoria === 'pizzas' || p.tipo === 'pizza')
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return {
      status: 200,
      data: { pizzas, total: pizzas.length }
    };
  }

  async handleUpdateProducto(data) {
    const { id, ...updates } = data;

    const producto = this.productos.get(id);
    if (!producto) {
      return { status: 404, error: 'Producto no encontrado' };
    }

    const cambios = {};
    Object.keys(updates).forEach(key => {
      if (updates[key] !== producto[key]) {
        cambios[key] = { anterior: producto[key], nuevo: updates[key] };
        producto[key] = updates[key];
      }
    });

    producto.updated_at = new Date().toISOString();
    this.productos.set(id, producto);

    this.metrics.increment('producto.actualizado.total');

    await this.publishProductoActualizado(id, cambios);

    this.logger.info('producto.actualizado', {
      producto_id: id,
      cambios_count: Object.keys(cambios).length
    });

    return { status: 200, data: producto };
  }

  async handleDeleteProducto(data) {
    const { id } = data;

    const producto = this.productos.get(id);
    if (!producto) {
      return { status: 404, error: 'Producto no encontrado' };
    }

    this.productos.delete(id);

    this.metrics.increment('producto.eliminado.total');
    this.metrics.gauge('producto.activos.count', this.productos.size);

    await this.publishProductoEliminado(id, 'manual');

    this.logger.info('producto.eliminado', { producto_id: id });

    return {
      status: 200,
      data: { message: 'Producto eliminado', producto_id: id }
    };
  }

  async handleGetStats() {
    const productosPorCategoria = {};
    const productosActivos = Array.from(this.productos.values()).filter(p => p.activo);

    productosActivos.forEach(p => {
      productosPorCategoria[p.categoria] = (productosPorCategoria[p.categoria] || 0) + 1;
    });

    const productosConAlergenos = productosActivos.filter(p => p.alergenos && p.alergenos.length > 0).length;

    return {
      status: 200,
      data: {
        total_productos: this.productos.size,
        productos_activos: productosActivos.length,
        productos_inactivos: this.productos.size - productosActivos.length,
        total_categorias: this.categorias.size,
        productos_por_categoria: productosPorCategoria,
        productos_con_alergenos: productosConAlergenos,
        menus_pendientes_validacion: this.menusPendientes.size
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
        catalogo: {
          productos: this.productos.size,
          categorias: this.categorias.size,
          ingredientes: this.ingredientes.size,
          menus_pendientes: this.menusPendientes.size
        }
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        counters: {
          'producto.creado.total': this.metrics.getCounter('producto.creado.total') || 0,
          'producto.actualizado.total': this.metrics.getCounter('producto.actualizado.total') || 0,
          'producto.eliminado.total': this.metrics.getCounter('producto.eliminado.total') || 0,
          'catalogo.actualizado.total': this.metrics.getCounter('catalogo.actualizado.total') || 0
        },
        gauges: {
          'producto.activos.count': this.productos.size,
          'categorias.count': this.categorias.size,
          'ingredientes.count': this.ingredientes.size
        }
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishProductoCreado(producto, correlation_id) {
    await this.eventBus.publish('producto.creado', {
      producto_id: producto.id,
      nombre: producto.nombre,
      emoji: producto.emoji,
      categoria: producto.categoria,
      precio: producto.precio,
      ingredientes_base: producto.ingredientes_base,
      alergenos: producto.alergenos,
      menu_source_id: producto.menu_source_id,
      created_at: producto.created_at
    }, {
      correlationId: correlation_id
    });
  }

  async publishProductoActualizado(producto_id, cambios, correlation_id) {
    await this.eventBus.publish('producto.actualizado', {
      producto_id,
      cambios,
      updated_at: new Date().toISOString()
    }, {
      correlationId: correlation_id
    });
  }

  async publishProductoEliminado(producto_id, motivo, correlation_id) {
    await this.eventBus.publish('producto.eliminado', {
      producto_id,
      motivo
    }, {
      correlationId: correlation_id
    });
  }

  async publishCatalogoActualizado(menu_id, estadisticas, sync_duration, correlation_id) {
    await this.eventBus.publish('catalogo.actualizado', {
      menu_id,
      estadisticas,
      sync_duration
    }, {
      correlationId: correlation_id
    });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  async syncCatalogo(menu_id, productos, categorias, correlation_id) {
    const stats = {
      productos_nuevos: 0,
      productos_actualizados: 0,
      productos_desactivados: 0,
      categorias_nuevas: 0
    };

    for (const cat of categorias) {
      if (!this.categorias.has(cat.id)) {
        this.categorias.set(cat.id, { ...cat, activa: true });
        stats.categorias_nuevas++;
      }
    }

    const productosExistentes = new Set(this.productos.keys());

    for (const prod of productos) {
      const productoExistente = this.productos.get(prod.id);

      if (productoExistente) {
        const productoActualizado = {
          ...productoExistente,
          ...prod,
          activo: true,
          menu_source_id: menu_id,
          updated_at: new Date().toISOString()
        };
        this.productos.set(prod.id, productoActualizado);
        stats.productos_actualizados++;

        await this.publishProductoActualizado(prod.id, { menu_source_id: menu_id }, correlation_id);

      } else {
        const nuevoProducto = {
          ...prod,
          activo: true,
          menu_source_id: menu_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        this.productos.set(prod.id, nuevoProducto);
        stats.productos_nuevos++;

        this.metrics.increment('producto.creado.total');
        await this.publishProductoCreado(nuevoProducto, correlation_id);
      }

      productosExistentes.delete(prod.id);
    }

    for (const prod_id of productosExistentes) {
      const producto = this.productos.get(prod_id);
      if (producto && producto.activo) {
        producto.activo = false;
        producto.updated_at = new Date().toISOString();
        this.productos.set(prod_id, producto);
        stats.productos_desactivados++;

        await this.publishProductoActualizado(prod_id, { activo: false }, correlation_id);
      }
    }

    return stats;
  }

  applyCorrections(productos, correcciones) {
    const productosMap = new Map(productos.map(p => [p.id, p]));

    correcciones.forEach(corr => {
      const producto = productosMap.get(corr.producto_id);
      if (producto && corr.campo) {
        producto[corr.campo] = corr.valor_nuevo;
      }
    });

    return Array.from(productosMap.values());
  }
}

module.exports = ProductosModule;
