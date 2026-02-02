/**
 * Módulo Productos v2.0
 * Catálogo de productos - Actualizado desde menús generados por IA
 */

class ProductosModule {
  constructor() {
    this.name = 'productos';
    this.version = '2.0.0';

    // Estado
    this.productos = new Map(); // producto_id -> producto
    this.categorias = new Map(); // categoria_id -> categoria
    this.ingredientes = new Map(); // ingrediente_id -> ingrediente
    this.menusPendientes = new Map(); // menu_id -> productos_draft

    // Dependencias (inyectadas)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('modulo.loading', { module: this.name });

    // Suscribirse a eventos
    await this.subscribeToEvents();

    this.logger.info('modulo.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('menu.generado', this.onMenuGenerado.bind(this));
    await this.eventBus.subscribe('menu.validado', this.onMenuValidado.bind(this));
  }

  async onMenuGenerado(event) {
    const start_time = Date.now();
    const { menu_id, productos, categorias, ingredientes } = event.payload;

    this.logger.info('menu.generado.received', {
      menu_id,
      productos_count: productos.length,
      categorias_count: categorias.length,
      ingredientes_count: ingredientes ? ingredientes.length : 0,
      correlation_id: event.correlation_id
    });

    try {
      // Guardar productos como pendientes de validación
      this.menusPendientes.set(menu_id, {
        productos,
        categorias,
        ingredientes: ingredientes || [],
        received_at: new Date().toISOString()
      });

      this.logger.info('menu.productos_guardados', {
        menu_id,
        productos_count: productos.length,
        estado: 'pendiente_validacion',
        correlation_id: event.correlation_id,
        duration: Date.now() - start_time
      });

    } catch (error) {
      this.logger.error('menu.generado.error', {
        menu_id,
        error: error.message,
        correlation_id: event.correlation_id
      });

      this.metrics.increment('producto.errors.total', 1, { operation: 'menu_generado' });
    }
  }

  async onMenuValidado(event) {
    const start_time = Date.now();
    const { menu_id, correcciones } = event.payload;

    this.logger.info('menu.validado.received', {
      menu_id,
      correcciones_count: correcciones ? correcciones.length : 0,
      correlation_id: event.correlation_id
    });

    try {
      const menuPendiente = this.menusPendientes.get(menu_id);
      if (!menuPendiente) {
        this.logger.warn('menu.validado.not_found', {
          menu_id,
          correlation_id: event.correlation_id
        });
        return;
      }

      let { productos, categorias, ingredientes } = menuPendiente;

      // Aplicar correcciones si existen
      if (correcciones && correcciones.length > 0) {
        productos = this.applyCorrections(productos, correcciones);
      }

      // Sincronizar catálogo
      const stats = await this.syncCatalogo(menu_id, productos, categorias, event.correlation_id);

      // Sincronizar ingredientes
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

      // Limpiar menú pendiente
      this.menusPendientes.delete(menu_id);

      // Métricas
      this.metrics.increment('catalogo.actualizado.total');
      this.metrics.timing('catalogo.sync.duration', Date.now() - start_time);
      this.metrics.gauge('producto.activos.count', this.productos.size);

      // Publicar evento catalogo.actualizado
      await this.publishCatalogoActualizado(menu_id, stats, Date.now() - start_time, event.correlation_id);

      this.logger.info('catalogo.sincronizado', {
        menu_id,
        estadisticas: stats,
        correlation_id: event.correlation_id,
        duration: Date.now() - start_time
      });

    } catch (error) {
      this.logger.error('menu.validado.error', {
        menu_id,
        error: error.message,
        stack: error.stack,
        correlation_id: event.correlation_id
      });

      this.metrics.increment('producto.errors.total', 1, { operation: 'menu_validado' });
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleListProductos(req) {
    const start_time = Date.now();
    const { categoria, activo } = req.query || {};

    let productos = Array.from(this.productos.values());

    // Filtros
    if (categoria) {
      productos = productos.filter(p => p.categoria === categoria);
    }

    if (activo !== undefined) {
      const activoBoolean = activo === 'true' || activo === true;
      productos = productos.filter(p => p.activo === activoBoolean);
    }

    // Ordenar por categoría y nombre
    productos.sort((a, b) => {
      if (a.categoria !== b.categoria) {
        return a.categoria.localeCompare(b.categoria);
      }
      return a.nombre.localeCompare(b.nombre);
    });

    this.metrics.timing('producto.list.duration', Date.now() - start_time);

    return {
      status: 200,
      data: {
        productos,
        total: productos.length
      }
    };
  }

  async handleGetProducto(req) {
    const { id } = req.params;
    const producto = this.productos.get(id);

    if (!producto) {
      return {
        status: 404,
        data: { error: 'Producto no encontrado' }
      };
    }

    return {
      status: 200,
      data: producto
    };
  }

  async handleSearchProductos(req) {
    const start_time = Date.now();
    const { q } = req.query || {};

    if (!q) {
      return {
        status: 400,
        data: { error: 'Parámetro "q" requerido' }
      };
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
      data: {
        resultados,
        total: resultados.length,
        query: q
      }
    };
  }

  async handleListCategorias(req) {
    const categorias = Array.from(this.categorias.values())
      .sort((a, b) => a.orden - b.orden);

    // Añadir conteo de productos por categoría
    const categoriasConConteo = categorias.map(cat => ({
      ...cat,
      productos_count: Array.from(this.productos.values())
        .filter(p => p.categoria === cat.nombre && p.activo).length
    }));

    return {
      status: 200,
      data: {
        categorias: categoriasConConteo,
        total: categorias.length
      }
    };
  }

  async handleListIngredientes(req, context) {
    const { tipo } = context.query || {};

    let ingredientes = Array.from(this.ingredientes.values())
      .filter(i => i.activo !== false);

    // Filtrar por tipo si se especifica
    if (tipo) {
      ingredientes = ingredientes.filter(i => i.tipo === tipo);
    }

    // Ordenar por tipo y nombre
    ingredientes.sort((a, b) => {
      if (a.tipo !== b.tipo) {
        return a.tipo.localeCompare(b.tipo);
      }
      return a.nombre.localeCompare(b.nombre);
    });

    return {
      status: 200,
      data: {
        ingredientes,
        total: ingredientes.length
      }
    };
  }

  async handleListPizzas(req, context) {
    // Filtrar productos que son pizzas (categoría pizza o tipo pizza)
    const pizzas = Array.from(this.productos.values())
      .filter(p =>
        p.activo &&
        (p.categoria === 'Pizzas' || p.categoria === 'pizzas' || p.tipo === 'pizza')
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return {
      status: 200,
      data: {
        pizzas,
        total: pizzas.length
      }
    };
  }

  async handleUpdateProducto(req, context) {
    const { id } = context.params;
    const updates = context.body;

    const producto = this.productos.get(id);
    if (!producto) {
      return {
        status: 404,
        data: { error: 'Producto no encontrado' }
      };
    }

    // Aplicar actualizaciones
    const cambios = {};
    Object.keys(updates).forEach(key => {
      if (updates[key] !== producto[key]) {
        cambios[key] = { anterior: producto[key], nuevo: updates[key] };
        producto[key] = updates[key];
      }
    });

    producto.updated_at = new Date().toISOString();
    this.productos.set(id, producto);

    // Métricas
    this.metrics.increment('producto.actualizado.total');

    // Publicar evento
    await this.publishProductoActualizado(id, cambios, req.correlationId || req.request_id);

    this.logger.info('producto.actualizado', {
      producto_id: id,
      cambios,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: producto
    };
  }

  async handleDeleteProducto(req) {
    const { id } = req.params;

    const producto = this.productos.get(id);
    if (!producto) {
      return {
        status: 404,
        data: { error: 'Producto no encontrado' }
      };
    }

    this.productos.delete(id);

    // Métricas
    this.metrics.increment('producto.eliminado.total');
    this.metrics.gauge('producto.activos.count', this.productos.size);

    // Publicar evento
    await this.publishProductoEliminado(id, 'manual', req.correlationId || req.request_id);

    this.logger.info('producto.eliminado', {
      producto_id: id,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: {
        message: 'Producto eliminado',
        producto_id: id
      }
    };
  }

  async handleGetStats(req) {
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

  async handleHealthCheck(req) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: this.version,
        catalogo: {
          productos: this.productos.size,
          categorias: this.categorias.size,
          menus_pendientes: this.menusPendientes.size
        }
      }
    };
  }

  async handleGetMetrics(req) {
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
          'producto.activos.count': this.productos.size
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

    // Sincronizar categorías primero
    for (const cat of categorias) {
      if (!this.categorias.has(cat.id)) {
        this.categorias.set(cat.id, {
          ...cat,
          activa: true
        });
        stats.categorias_nuevas++;
      }
    }

    // Marcar productos existentes como inactivos (serán reactivados si están en el nuevo menú)
    const productosExistentes = new Set(this.productos.keys());

    // Sincronizar productos
    for (const prod of productos) {
      const productoExistente = this.productos.get(prod.id);

      if (productoExistente) {
        // Actualizar producto existente
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
        // Crear nuevo producto
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

      // Eliminar de la lista de existentes (los que queden se desactivarán)
      productosExistentes.delete(prod.id);
    }

    // Desactivar productos que no están en el nuevo menú
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
