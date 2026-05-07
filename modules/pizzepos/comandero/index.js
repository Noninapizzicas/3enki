/**
 * pizzepos/comandero v3.0.0 — Buffer de pedido por cuenta + envio a cocina (POC2 rewrite).
 *
 * El camarero añade items al buffer, modifica cantidades/notas, y envia a cocina.
 * Mantiene caches de productos (catalogo + por carta) para resolver precio por canal.
 * Persiste buffers transitorios atomicamente (debounced 1s) para sobrevivir restart.
 *
 * Eventos del bus:
 *   subscribes (8): cuenta.{creada,actualizada}, caja.cerrada, dia.iniciado,
 *                   catalogo.actualizado, producto.{creado,actualizado}, carta.actualizada.
 *   publishes  (4): comandero.{item_agregado, item_eliminado, item_actualizado, enviar_cocina}.
 *
 * 7 ui_handlers (auto-wired desde module.json).
 */

'use strict';

const crypto = require('crypto');
const fs     = require('fs').promises;
const path   = require('path');

const DEFAULT_PROJECT_ID = 'default';
const SAVE_DEBOUNCE_MS   = 1000;

class ComanderoModule {
  constructor() {
    this.name    = 'comandero';
    this.version = '3.0.0';

    this.eventBus  = null;
    this.logger    = null;
    this.metrics   = null;
    this.validator = null;

    this.pedidos              = new Map();
    this.refDisplayCache      = new Map();
    this.productosCache       = new Map();
    this.cartasProductosCache = new Map();

    this._tarifasModule = null;
    this._moduleLoader  = null;
    this._bufferFile    = path.join('./data/current', 'comandero_buffers.json');
    this._saveTimer     = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger    = core.logger;
    this.metrics   = core.metrics;
    this.eventBus  = core.eventBus;
    this.validator = core.validationManager || null;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    this._moduleLoader = core.moduleLoader || null;

    this._registerSchemas();
    await this._restaurarBuffers();

    this.logger.info('module.loaded', {
      module:           this.name,
      version:          this.version,
      pedidos_restored: this.pedidos.size
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.pedidos.clear();
    this.productosCache.clear();
    this.cartasProductosCache.clear();
    this.refDisplayCache.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  _registerSchemas() {
    if (!this.validator) return;

    this.validator.registerSchema('comandero.add-item', {
      type: 'object',
      required: ['cuenta_id', 'producto_id'],
      properties: {
        cuenta_id:   { type: 'string', minLength: 1 },
        producto_id: { type: 'string', minLength: 1 },
        nombre:      { type: 'string' },
        precio:      { type: 'number', minimum: 0 },
        cantidad:    { type: 'integer', minimum: 1 },
        notas:       { type: 'string' },
        tipo:        { type: 'string', enum: ['mitad_mitad', 'al_gusto'] },
        variaciones: { type: 'array' }
      }
    });

    this.validator.registerSchema('comandero.update-item', {
      type: 'object',
      required: ['cuenta_id', 'item_id'],
      properties: {
        cuenta_id: { type: 'string', minLength: 1 },
        item_id:   { type: 'string', minLength: 1 },
        cantidad:  { type: 'integer' },
        notas:     { type: 'string' }
      }
    });

    this.validator.registerSchema('comandero.remove-item', {
      type: 'object',
      required: ['cuenta_id', 'item_id'],
      properties: {
        cuenta_id: { type: 'string', minLength: 1 },
        item_id:   { type: 'string', minLength: 1 }
      }
    });

    this.validator.registerSchema('comandero.send-kitchen', {
      type: 'object',
      required: ['cuenta_id'],
      properties: {
        cuenta_id:  { type: 'string', minLength: 1 },
        project_id: { type: 'string' }
      }
    });

    this.logger.info('comandero.schemas.registered', { count: 4 });
  }

  _validateInput(schemaId, data) {
    if (!this.validator) return null;
    const result = this.validator.validate(schemaId, data);
    if (!result.valid) {
      return this._errorResponse(400, 'INVALID_INPUT', 'Validacion fallida', { validation_errors: result.errors });
    }
    return null;
  }

  // ==========================================
  // Bus handlers
  // ==========================================

  async onCuentaCreada(event) {
    const data = this._unwrap(event);
    const { cuenta_id, ref_display } = data;
    if (cuenta_id && ref_display) this.refDisplayCache.set(cuenta_id, ref_display);
  }

  async onCuentaActualizada(event) {
    const data = this._unwrap(event);
    const { cuenta_id, cambios } = data;
    if (cuenta_id && cambios?.ref_display) this.refDisplayCache.set(cuenta_id, cambios.ref_display);
  }

  async onCajaCerrada(event) {
    const size = this.pedidos.size;
    this.pedidos.clear();
    this._guardarBuffers();
    this.logger.info('comandero.reset.caja_cerrada', {
      pedidos_limpiados: size,
      correlation_id: event?.metadata?.correlationId || this._unwrap(event)?.correlation_id
    });
  }

  async onDiaIniciado(event) {
    const size = this.pedidos.size;
    this.pedidos.clear();
    this._guardarBuffers();
    this.logger.info('comandero.reset.dia_iniciado', {
      pedidos_limpiados: size,
      correlation_id: event?.metadata?.correlationId || this._unwrap(event)?.correlation_id
    });
  }

  async onCatalogoActualizado(event) {
    const data = this._unwrap(event);
    const productos = data?.productos || [];

    for (const producto of productos) {
      if (producto.id && producto.precio !== undefined) {
        this.productosCache.set(producto.id, {
          nombre:      producto.nombre || producto.id,
          precio:      producto.precio,
          categoria:   producto.categoria || null,
          estaciones:  producto.estaciones || null,
          precio_fijo: producto.precio_fijo || false
        });
      }
    }

    this.logger.info('comandero.catalogo.synced', { productos_en_cache: this.productosCache.size });
  }

  async onCartaActualizada(event) {
    const data    = this._unwrap(event);
    const cartaId = data?.meta?.id;
    const productos = data?.productos || [];
    if (!cartaId || productos.length === 0) return;

    const cartaCache = new Map();
    for (const p of productos) {
      if (p.id && p.precio !== undefined) {
        cartaCache.set(p.id, {
          nombre:     p.nombre || p.id,
          precio:     p.precio,
          categoria:  p.categoria || null,
          estaciones: p.estaciones || null
        });
      }
    }

    this.cartasProductosCache.set(cartaId, cartaCache);
    this.logger.info('comandero.carta.cached', { carta_id: cartaId, productos: cartaCache.size });
  }

  async onProductoActualizado(event) {
    const data = this._unwrap(event);
    const { id, nombre, precio, categoria } = data;
    if (id && precio !== undefined) {
      const existing = this.productosCache.get(id);
      this.productosCache.set(id, {
        nombre:     nombre || id,
        precio,
        categoria:  categoria || existing?.categoria || null,
        estaciones: existing?.estaciones || null
      });
    }
  }

  // ==========================================
  // UI Handlers (auto-wired desde module.json)
  // ==========================================

  async handleGetPedido(data) {
    try {
      const { cuenta_id } = data || {};
      if (!cuenta_id) {
        this._logError('comandero.ui.get.validation_failed', { missing: 'cuenta_id' }, 'ui_get', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'cuenta_id es requerido', { field: 'cuenta_id' });
      }

      let pedido = this.pedidos.get(cuenta_id);
      if (!pedido) {
        pedido = { items: [], notas: '', total: 0 };
        this.pedidos.set(cuenta_id, pedido);
      }
      return { status: 200, data: { cuenta_id, ...pedido } };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.get.failed', err, 'ui_get');
    }
  }

  async handleAddItem(data) {
    try {
      const invalid = this._validateInput('comandero.add-item', data);
      if (invalid) {
        this._logError('comandero.ui.add_item.validation_failed', { details: invalid.error.details }, 'ui_add_item', 'INVALID_INPUT');
        return invalid;
      }

      const { cuenta_id, producto_id, nombre, precio, cantidad, categoria, variaciones, notas,
              tipo, pizza_izquierda, pizza_derecha,
              ingredientes: metaIngredientes, ingredientes_base, project_id } = data;

      let pedido = this.pedidos.get(cuenta_id);
      if (!pedido) {
        pedido = { items: [], notas: '', total: 0 };
        this.pedidos.set(cuenta_id, pedido);
      }

      const cached       = this.productosCache.get(producto_id);
      const itemNombre   = nombre || cached?.nombre || producto_id;
      const precioBase   = precio ?? cached?.precio ?? 0;
      const itemCantidad = cantidad || 1;

      if (!cached && precio === undefined) {
        this.logger.warn('comandero.producto.not_in_cache', { producto_id });
      }

      const canal      = this._detectarCanalCuenta(cuenta_id);
      const itemPrecio = this._resolverPrecioCanal(producto_id, precioBase, canal, project_id);

      const item_id = crypto.randomUUID();
      const item = {
        id:          item_id,
        producto_id,
        nombre:      itemNombre,
        precio:      itemPrecio,
        cantidad:    itemCantidad,
        categoria:   categoria || cached?.categoria || null,
        estaciones:  cached?.estaciones || null,
        variaciones: variaciones || [],
        notas:       notas || '',
        subtotal:    itemPrecio * itemCantidad,
        created_at:  new Date().toISOString()
      };

      if (tipo)              item.tipo              = tipo;
      if (pizza_izquierda)   item.pizza_izquierda   = pizza_izquierda;
      if (pizza_derecha)     item.pizza_derecha     = pizza_derecha;
      if (metaIngredientes)  item.ingredientes      = metaIngredientes;
      if (ingredientes_base) item.ingredientes_base = ingredientes_base;

      pedido.items.push(item);
      pedido.total = this._calcularTotal(pedido.items);

      this.metrics?.increment('comandero.item_agregado.total');

      const eventPayload = {
        cuenta_id,
        item_id,
        producto_id,
        nombre:           itemNombre,
        precio_unitario:  itemPrecio,
        precio_total:     item.subtotal,
        cantidad:         itemCantidad,
        pedido_total:     pedido.total,
        pedido_items:     pedido.items.reduce((s, i) => s + i.cantidad, 0)
      };
      if (tipo)              eventPayload.tipo              = tipo;
      if (pizza_izquierda)   eventPayload.pizza_izquierda   = pizza_izquierda;
      if (pizza_derecha)     eventPayload.pizza_derecha     = pizza_derecha;
      if (item.variaciones)  eventPayload.variaciones       = item.variaciones;
      if (item.ingredientes_base) eventPayload.ingredientes_base = item.ingredientes_base;
      if (metaIngredientes)  eventPayload.ingredientes      = metaIngredientes;

      await this._publicarEvento('comandero.item_agregado', eventPayload, data);
      this._guardarBuffers();

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
    } catch (err) {
      return this._handleHandlerError('comandero.ui.add_item.failed', err, 'ui_add_item');
    }
  }

  async handleRemoveItem(data) {
    try {
      const invalid = this._validateInput('comandero.remove-item', data);
      if (invalid) {
        this._logError('comandero.ui.remove_item.validation_failed', { details: invalid.error.details }, 'ui_remove_item', 'INVALID_INPUT');
        return invalid;
      }

      const { cuenta_id, item_id } = data;
      const pedido = this.pedidos.get(cuenta_id);
      if (!pedido) {
        this._logError('comandero.ui.remove_item.pedido_not_found', { cuenta_id }, 'ui_remove_item', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', {
          entity_type: 'pedido', entity_id: cuenta_id
        });
      }

      const itemIndex = pedido.items.findIndex(i => i.id === item_id);
      if (itemIndex === -1) {
        this._logError('comandero.ui.remove_item.item_not_found', { cuenta_id, item_id }, 'ui_remove_item', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Item no encontrado en pedido', {
          entity_type: 'item', entity_id: item_id
        });
      }

      const removedItem = pedido.items.splice(itemIndex, 1)[0];
      pedido.total = this._calcularTotal(pedido.items);

      this.metrics?.increment('comandero.item_eliminado.total');

      await this._publicarEvento('comandero.item_eliminado', {
        cuenta_id,
        item_id,
        producto_id:  removedItem.producto_id,
        cantidad:     removedItem.cantidad || 1,
        precio_total: removedItem.subtotal,
        pedido_total: pedido.total,
        pedido_items: pedido.items.reduce((s, i) => s + i.cantidad, 0)
      }, data);

      this._guardarBuffers();
      this.logger.info('comandero.item.eliminado', { cuenta_id, item_id });

      return {
        status: 200,
        data: { pedido: { cuenta_id, items: pedido.items, total: pedido.total } }
      };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.remove_item.failed', err, 'ui_remove_item');
    }
  }

  async handleUpdateItem(data) {
    try {
      const invalid = this._validateInput('comandero.update-item', data);
      if (invalid) {
        this._logError('comandero.ui.update_item.validation_failed', { details: invalid.error.details }, 'ui_update_item', 'INVALID_INPUT');
        return invalid;
      }

      const { cuenta_id, item_id, cantidad, notas } = data;
      const pedido = this.pedidos.get(cuenta_id);
      if (!pedido) {
        this._logError('comandero.ui.update_item.pedido_not_found', { cuenta_id }, 'ui_update_item', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', {
          entity_type: 'pedido', entity_id: cuenta_id
        });
      }

      const item = pedido.items.find(i => i.id === item_id);
      if (!item) {
        this._logError('comandero.ui.update_item.item_not_found', { cuenta_id, item_id }, 'ui_update_item', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Item no encontrado en pedido', {
          entity_type: 'item', entity_id: item_id
        });
      }

      if (cantidad !== undefined) {
        if (cantidad <= 0) {
          // cantidad 0 o negativa → eliminar item
          const idx = pedido.items.indexOf(item);
          pedido.items.splice(idx, 1);
          pedido.total = this._calcularTotal(pedido.items);

          await this._publicarEvento('comandero.item_eliminado', {
            cuenta_id, item_id,
            producto_id:  item.producto_id,
            cantidad:     item.cantidad || 1,
            precio_total: item.subtotal,
            pedido_total: pedido.total,
            pedido_items: pedido.items.reduce((s, i) => s + i.cantidad, 0)
          }, data);

          this._guardarBuffers();
          return { status: 200, data: { pedido: { cuenta_id, items: pedido.items, total: pedido.total } } };
        }

        const cantidadAnterior = item.cantidad;
        const subtotalAnterior = item.subtotal;
        item.cantidad = cantidad;
        item.subtotal = item.precio * cantidad;
        pedido.total  = this._calcularTotal(pedido.items);

        await this._publicarEvento('comandero.item_actualizado', {
          cuenta_id, item_id,
          producto_id:        item.producto_id,
          nombre:             item.nombre,
          cantidad_anterior:  cantidadAnterior,
          cantidad_nueva:     cantidad,
          diff_cantidad:      cantidad - cantidadAnterior,
          diff_precio:        item.subtotal - subtotalAnterior,
          pedido_total:       pedido.total,
          pedido_items:       pedido.items.reduce((s, i) => s + i.cantidad, 0)
        }, data);

        this._guardarBuffers();
        this.logger.info('comandero.item.actualizado', { cuenta_id, item_id, cantidad, notas });

        return {
          status: 200,
          data: { item, pedido: { cuenta_id, items: pedido.items, total: pedido.total } }
        };
      }

      if (notas !== undefined) item.notas = notas;
      this._guardarBuffers();
      this.logger.info('comandero.item.actualizado', { cuenta_id, item_id, cantidad, notas });

      return {
        status: 200,
        data: { item, pedido: { cuenta_id, items: pedido.items, total: pedido.total } }
      };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.update_item.failed', err, 'ui_update_item');
    }
  }

  async handleEnviarCocina(data) {
    try {
      const invalid = this._validateInput('comandero.send-kitchen', data);
      if (invalid) {
        this._logError('comandero.ui.send_kitchen.validation_failed', { details: invalid.error.details }, 'ui_send_kitchen', 'INVALID_INPUT');
        return invalid;
      }

      const { cuenta_id, project_id } = data;
      const pedido = this.pedidos.get(cuenta_id);
      if (!pedido || pedido.items.length === 0) {
        this._logError('comandero.ui.send_kitchen.empty', { cuenta_id }, 'ui_send_kitchen', 'CONFLICT_STATE');
        return this._errorResponse(409, 'CONFLICT_STATE', 'No hay items en el pedido para enviar', {
          cuenta_id
        });
      }

      const itemsParaEnviar = pedido.items.filter(i => !i.enviado);
      if (itemsParaEnviar.length === 0) {
        this._logError('comandero.ui.send_kitchen.all_sent', { cuenta_id }, 'ui_send_kitchen', 'CONFLICT_STATE');
        return this._errorResponse(409, 'CONFLICT_STATE', 'Todos los items ya fueron enviados a cocina', {
          cuenta_id
        });
      }

      const pedido_id = `ped_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const ahora     = new Date().toISOString();

      for (const item of itemsParaEnviar) {
        item.enviado    = true;
        item.enviado_at = ahora;
        item.pedido_id  = pedido_id;
      }

      const totalEnviado = this._calcularTotal(itemsParaEnviar);
      this.metrics?.increment('comandero.enviado.total');

      await this._publicarEvento('comandero.enviar_cocina', {
        cuenta_id,
        pedido_id,
        project_id,
        ref_display:     this.refDisplayCache.get(cuenta_id) || null,
        items:           itemsParaEnviar,
        total:           totalEnviado,
        notas_generales: pedido.notas,
        created_at:      ahora
      }, data);

      this._guardarBuffers();

      this.logger.info('comandero.enviado_cocina', {
        cuenta_id, pedido_id, items_enviados: itemsParaEnviar.length, total_enviado: totalEnviado
      });

      return {
        status: 200,
        data: {
          cuenta_id,
          pedido_id,
          items_enviados: itemsParaEnviar.length,
          total_enviado:  totalEnviado,
          pedido:         { cuenta_id, items: pedido.items, total: pedido.total }
        }
      };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.send_kitchen.failed', err, 'ui_send_kitchen');
    }
  }

  async handleListBuffers() {
    try {
      const buffers = [];
      for (const [cuenta_id, pedido] of this.pedidos.entries()) {
        const pendientes = pedido.items.filter(i => !i.enviado);
        if (pendientes.length === 0) continue;
        buffers.push({
          cuenta_id,
          total:       this._calcularTotal(pendientes),
          items_count: pendientes.reduce((s, i) => s + i.cantidad, 0),
          items: pendientes.map(i => ({
            item_id:     i.id,
            producto_id: i.producto_id,
            nombre:      i.nombre,
            cantidad:    i.cantidad,
            precio:      i.precio,
            subtotal:    i.subtotal
          }))
        });
      }
      return { status: 200, data: { buffers } };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.buffers.failed', err, 'ui_buffers');
    }
  }

  async handleHealthCheck() {
    try {
      return {
        status: 200,
        data: {
          status:             'healthy',
          module:             this.name,
          version:            this.version,
          pedidos_activos:    this.pedidos.size,
          productos_en_cache: this.productosCache.size,
          timestamp:          new Date().toISOString()
        }
      };
    } catch (err) {
      return this._handleHandlerError('comandero.ui.health.failed', err, 'ui_health');
    }
  }

  // ==========================================
  // Persistencia transitoria del buffer
  // ==========================================

  async _restaurarBuffers() {
    const datos = await this._readJsonSafe(this._bufferFile, 'restaurar_buffers');
    if (!datos?.buffers) return;

    let restaurados = 0;
    for (const [cuenta_id, buffer] of Object.entries(datos.buffers)) {
      if (!buffer.items || buffer.items.length === 0) continue;
      this.pedidos.set(cuenta_id, {
        items: buffer.items,
        notas: buffer.notas || '',
        total: this._calcularTotal(buffer.items)
      });
      restaurados++;
    }

    if (restaurados > 0) {
      this.logger.info('comandero.buffers_restaurados', {
        buffers_restaurados: restaurados,
        items_total: Array.from(this.pedidos.values()).reduce((s, p) => s + p.items.length, 0)
      });
    }
  }

  _guardarBuffers() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      try {
        const buffers = {};
        for (const [cuenta_id, pedido] of this.pedidos.entries()) {
          const itemsNoEnviados = pedido.items.filter(i => !i.enviado);
          if (itemsNoEnviados.length > 0) {
            buffers[cuenta_id] = {
              items: itemsNoEnviados,
              notas: pedido.notas,
              total: this._calcularTotal(itemsNoEnviados)
            };
          }
        }

        await fs.mkdir(path.dirname(this._bufferFile), { recursive: true });
        await this._atomicWriteFile(
          this._bufferFile,
          JSON.stringify({ buffers, updated_at: new Date().toISOString() }, null, 2)
        );
      } catch (err) {
        this.logger.warn('comandero.guardar_buffers.error', { error: err.message });
        this.metrics?.increment('comandero.errors', { kind: 'guardar_buffers', code: 'FILESYSTEM_ERROR' });
      }
    }, SAVE_DEBOUNCE_MS);
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'           ? 400 :
                   code === 'RESOURCE_NOT_FOUND'      ? 404 :
                   code === 'PERMISSION_DENIED'       ? 403 :
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'ALREADY_EXISTS'          ? 409 :
                   code === 'DEPENDENCY_UNAVAILABLE'  ? 503 :
                   code === 'TIMEOUT'                 ? 504 :
                   code === 'FILESYSTEM_ERROR'        ? 500 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('comandero.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg  = (err?.message || '').toLowerCase();
    const ecod = err?.code || '';
    if (ecod === 'ENOENT' || msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (msg.includes('conflict') || msg.includes('already')) return 'CONFLICT_STATE';
    if (ecod && ecod.startsWith('E')) return 'FILESYSTEM_ERROR';
    return 'INTERNAL_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) return;
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload,
      project_id:     payload?.project_id || sourcePayload?.project_id || DEFAULT_PROJECT_ID
    };
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger.error('comandero.publish_error', { event: name, error: err.message });
      this.metrics?.increment('comandero.errors', { kind: 'publish', code: 'INTERNAL_ERROR' });
    }
  }

  // 5o helper auxiliar — escritura atomica .tmp + rename
  async _atomicWriteFile(absPath, contents) {
    const tmpPath = absPath + '.tmp';
    await fs.writeFile(tmpPath, contents, 'utf-8');
    await fs.rename(tmpPath, absPath);
  }

  // 6o helper — lectura JSON con log+metric en error (no swallow)
  async _readJsonSafe(filePath, kind) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('comandero.read_error', { file: filePath, kind, error: err.message });
        this.metrics?.increment('comandero.errors', { kind: kind || 'read_json', code: this._classifyHandlerError(err) });
      }
      return null;
    }
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('comandero.errors', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }

  // ==========================================
  // Internals — calculo + canal + precio
  // ==========================================

  _calcularTotal(items) {
    return items.reduce((total, item) => total + item.subtotal, 0);
  }

  _detectarCanalCuenta(cuenta_id) {
    if (!cuenta_id) return 'mesa';
    const PREFIJOS = {
      'mesa_': 'mesa', 'M_': 'mesa',
      'llevar_': 'llevar', 'L_': 'llevar',
      'telefono_': 'telefono', 'tel_': 'telefono', 'T_': 'telefono',
      'whatsapp_': 'whatsapp', 'W_': 'whatsapp',
      'glovo_': 'glovo', 'G_': 'glovo',
      'llevadoo_': 'llevadoo', 'D_': 'llevadoo'
    };
    for (const [prefix, canal] of Object.entries(PREFIJOS)) {
      if (cuenta_id.startsWith(prefix)) return canal;
    }
    return 'mesa';
  }

  /**
   * Resuelve precio por canal con cascada:
   *   1. Carta del canal (via tarifas.resolverCarta) → precio de esa carta.
   *   2. Cache general de productos → precio base.
   *   3. Precio pasado en la request → fallback.
   */
  _resolverPrecioCanal(producto_id, precioBase, canal, projectId) {
    if (!canal || canal === 'mesa') return precioBase;

    try {
      if (!this._tarifasModule && this._moduleLoader) {
        const mod = this._moduleLoader.getModule?.('tarifas');
        this._tarifasModule = mod?.instance || null;
      }

      if (this._tarifasModule?.resolverCarta) {
        const cartaId = this._tarifasModule.resolverCarta(canal, projectId);
        if (cartaId) {
          const cartaCache = this.cartasProductosCache.get(cartaId);
          if (cartaCache) {
            const producto = cartaCache.get(producto_id);
            if (producto) return producto.precio;
          }
        }
      }
    } catch (err) {
      this.logger.debug('comandero.precio_canal.fallback', { error: err.message, canal });
    }

    return precioBase;
  }
}

module.exports = ComanderoModule;
