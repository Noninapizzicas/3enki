/**
 * Strategy: Glovo (Delivery)
 * Integración con plataforma de delivery Glovo
 * Recibe pedidos externos, gestiona aceptación/rechazo, y notifica cuando está listo
 *
 * Prefijo cuenta_id: glovo_{YYYYMMDD}_{seq}
 * Dominio uiHandler: 'glovo'
 * Eventos propios: glovo.pedido_recibido, glovo.pedido_aceptado,
 *                  glovo.pedido_rechazado, glovo.pedido_listo, glovo.pedido_recogido
 * Consume: cocina.pedido_listo
 */

class GlovoStrategy {
  constructor() {
    this.tipo = 'glovo';
    this.prefijo = 'glovo_';
    this.version = '4.0.0';

    // Contador interno para numero_pedido display (no es identidad)
    this._pedidoSeq = 0;

    // Pedidos activos de Glovo
    this.pedidosActivos = new Map();

    // Mapeo order_id externo → cuenta_id interno
    this.externalOrderMap = new Map();

    this.internalMetrics = {
      pedidos_recibidos: 0,
      pedidos_aceptados: 0,
      pedidos_rechazados: 0,
      pedidos_listos: 0,
      pedidos_recogidos: 0,
      ingresos_totales: 0,
      tiempo_promedio_aceptacion: 0,
      tiempo_promedio_preparacion: 0
    };

    this.modulo = null;
    this._uiActions = [
      'recibir', 'aceptar', 'rechazar', 'marcar_listo', 'marcar_recogido',
      'activos', 'get', 'historial', 'poll', 'health', 'metrics'
    ];

    // Polling interval (configurable, default 60s)
    this._pollInterval = null;
    this._pollIntervalMs = 60000;
  }

  // ==========================================
  // Strategy Interface
  // ==========================================

  async init(modulo) {
    this.modulo = modulo;

    modulo.safeAddSchema(require('../schemas/glovo.json'));
    modulo.safeAddSchema(require('../schemas/glovo-events.json'));

    // Restaurar pedidos Glovo activos desde persistencia
    await this.restaurarDesdeArchivo();
  }

  // tools.contract v1.2: el loader auto-wirea las 11 tools 'glovo.*' a uiHandler.

  async subscribeToEvents(eventBus) {
    await eventBus.subscribe('cocina.pedido_listo', this.onCocinaPedidoListo.bind(this));

    // Auto-polling: consultar Glovo cada 60s si hay credenciales OAuth2 configuradas
    const hasCredentials = process.env.GLOVO_CLIENT_ID || process.env.GLOVO_CLIENT_ID_GLOBAL;
    if (hasCredentials) {
      this._pollInterval = setInterval(async () => {
        try {
          await this.pollNuevosPedidos();
        } catch (err) {
          this.modulo?.logger?.warn('glovo.poll.interval.error', { error: err.message });
        }
      }, this._pollIntervalMs);

      this.modulo.logger.info('glovo.polling.activado', {
        intervalo_ms: this._pollIntervalMs
      });
    } else {
      this.modulo.logger.info('glovo.polling.desactivado', {
        nota: 'Sin GLOVO_CLIENT_ID — polling manual via glovo/poll'
      });
    }
  }

  async onCobroProcesado(cuenta_id, correlationId) {
    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) return;

    pedido.pagado = true;
    pedido.hora_pago = new Date().toISOString();

    this.modulo.logger.info('glovo.pedido_pagado', {
      correlation_id: correlationId,
      cuenta_id,
      estado: pedido.estado
    });

    // Cerrar la cuenta al procesar cobro (igual que mesa)
    await this.cerrarCuentaGlovo(cuenta_id, correlationId);
  }

  getHealth() {
    return {
      pedidos_activos: this.pedidosActivos.size,
      pendientes_aceptar: Array.from(this.pedidosActivos.values())
        .filter(p => p.estado === 'recibido').length
    };
  }

  getMetrics() {
    return {
      ...this.internalMetrics,
      pedidos_activos: this.pedidosActivos.size,
      tiempo_promedio_aceptacion: this.modulo.getPromedioTiempo('glovo_aceptacion'),
      tiempo_promedio_preparacion: this.modulo.getPromedioTiempo('glovo_preparacion')
    };
  }

  getCuentasActivas() {
    return this.pedidosActivos.size;
  }

  cleanup() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    this.pedidosActivos.clear();
    this.externalOrderMap.clear();
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onCocinaPedidoListo(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { pedido_id } = eventData;

    let pedidoGlovo = null;
    for (const pedido of this.pedidosActivos.values()) {
      if (pedido.pedidos && pedido.pedidos.includes(pedido_id)) {
        pedidoGlovo = pedido;
        break;
      }
    }

    if (!pedidoGlovo) return;

    await this.marcarListoInterno(pedidoGlovo.cuenta_id, correlationId);

    this.modulo.logger.info('canal.glovo.pedido_listo_auto', {
      correlation_id: correlationId,
      cuenta_id: pedidoGlovo.cuenta_id,
      glovo_order_id: pedidoGlovo.glovo_order_id
    });
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleRecibirPedido(data) {
    try {
      const validate = this.modulo.ajv.getSchema(
        'https://pizzepos.com/schemas/glovo.json#/definitions/recibir_pedido_request'
      );
      if (validate && !validate(data)) {
        return { status: 400, error: 'Request inválido', details: validate.errors };
      }

      const {
        glovo_order_id, items, total, cliente_nombre,
        direccion_entrega, notas, tiempo_estimado_entrega
      } = data;

      if (this.externalOrderMap.has(glovo_order_id)) {
        return { status: 409, error: `Pedido Glovo ${glovo_order_id} ya existe` };
      }

      this.modulo.verificarReseoDiario();

      this._pedidoSeq = (this._pedidoSeq % 999) + 1;
      const numero_pedido = this._pedidoSeq;
      // null cuando no hay nombre real: el backend genera ref_display
      // solo con el codigo del turno en vez de pegar "Cliente Glovo" literal.
      const clienteNombreReal = cliente_nombre || null;
      const clienteNombreLabel = clienteNombreReal || '';

      const cuenta = await this.modulo.crearCuentaViaCuentas({
        project_id: data.project_id,
        tipo: 'glovo',
        nombre: clienteNombreReal,
        total: total || 0,
        metadata: { glovo_order_id, numero_pedido, direccion_entrega: direccion_entrega || '' }
      });
      const cuenta_id = cuenta.id;

      const pedido = {
        cuenta_id,
        project_id: data.project_id || null,
        ref_display: cuenta.ref_display || null,
        glovo_order_id,
        numero_pedido,
        plataforma: 'glovo',
        estado: 'recibido',
        pagado: false,
        items: items || [],
        total: total || 0,
        cliente_nombre: clienteNombreLabel,
        direccion_entrega: direccion_entrega || '',
        notas: notas || '',
        tiempo_estimado_entrega: tiempo_estimado_entrega || 45,
        hora_recibido: new Date().toISOString(),
        hora_aceptado: null,
        hora_listo: null,
        hora_recogido: null,
        rider_info: null,
        pedidos: []
      };

      this.pedidosActivos.set(cuenta_id, pedido);
      this.externalOrderMap.set(glovo_order_id, cuenta_id);
      this.internalMetrics.pedidos_recibidos++;

      await this.modulo.eventBus.publish('glovo.pedido_recibido', {
        cuenta_id,
        glovo_order_id,
        total: pedido.total,
        items: pedido.items,
        cliente_nombre: clienteNombreLabel,
        hora_recibido: pedido.hora_recibido
      });

      // Auto-enviar a cocina — el pedido entra directo a la cola de cocina
      const pedido_id = `ped_${cuenta_id}`;
      pedido.pedidos.push(pedido_id);

      // Enriquecer items con catálogo local (ingredientes_base para cocina)
      const enrichedItems = await this.enrichItemsWithCatalog(items || []);

      const cocinaItems = enrichedItems.map((item, idx) => ({
        item_id: `${pedido_id}_item_${idx + 1}`,
        producto_id: item.producto_id || item.id || `glovo_prod_${idx + 1}`,
        nombre: item.nombre || item.name || 'Producto Glovo',
        cantidad: item.cantidad || item.quantity || 1,
        variaciones: item.variaciones || item.variations || null,
        notas: item.notas || item.notes || '',
        estado: 'pendiente',
        ...(item.ingredientes_base && { ingredientes_base: item.ingredientes_base })
      }));

      // Publicar comandero.enviar_cocina para que Pedidos cree el pedido formal
      // y publique pedido.enviado_cocina con todos los campos (ref_display, project_id, etc.)
      await this.modulo.eventBus.publish('comandero.enviar_cocina', {
        pedido_id,
        cuenta_id,
        project_id: data.project_id || null,
        ref_display: pedido.ref_display || null,
        items: cocinaItems,
        total: total || 0,
        notas_generales: notas || '',
        created_at: new Date().toISOString()
      });

      this.modulo.logger.info('glovo.pedido_recibido', {
        cuenta_id,
        glovo_order_id,
        total: pedido.total,
        enviado_cocina: true
      });

      return { status: 201, data: pedido };

    } catch (error) {
      this.modulo.logger.error('canal.glovo.recibir.error', { error: error.message });
      return { status: 500, error: 'Error interno recibiendo pedido Glovo' };
    }
  }

  async handleAceptarPedido(data) {
    try {
      const { cuenta_id, tiempo_preparacion_estimado } = data;
      const pedido = this.pedidosActivos.get(cuenta_id);

      if (!pedido) {
        return { status: 404, error: 'Pedido Glovo no encontrado' };
      }

      if (pedido.estado !== 'recibido') {
        return { status: 409, error: `Pedido en estado '${pedido.estado}', no se puede aceptar` };
      }

      pedido.estado = 'aceptado';
      pedido.hora_aceptado = new Date().toISOString();
      pedido.tiempo_preparacion_estimado = tiempo_preparacion_estimado || 25;

      const tiempoAceptacion = this.modulo.calcularTiempoMinutos(pedido.hora_recibido);
      this.modulo.trackTiempo('glovo_aceptacion', tiempoAceptacion);
      this.internalMetrics.pedidos_aceptados++;

      await this.modulo.eventBus.publish('glovo.pedido_aceptado', {
        cuenta_id: pedido.cuenta_id,
        glovo_order_id: pedido.glovo_order_id,
        tiempo_preparacion_estimado: pedido.tiempo_preparacion_estimado,
        hora_aceptado: pedido.hora_aceptado
      });

      // cuenta.creada ya se publicó en handleRecibirPedido (dedup en cuentas)

      await this.notificarGlovoAPI('accept', pedido);

      this.modulo.logger.info('glovo.pedido_aceptado', {
        cuenta_id,
        glovo_order_id: pedido.glovo_order_id,
        tiempo_aceptacion: tiempoAceptacion
      });

      return { status: 200, data: pedido };

    } catch (error) {
      this.modulo.logger.error('canal.glovo.aceptar.error', { error: error.message });
      return { status: 500, error: 'Error interno aceptando pedido' };
    }
  }

  async handleRechazarPedido(data) {
    try {
      const { cuenta_id, motivo } = data;
      const pedido = this.pedidosActivos.get(cuenta_id);

      if (!pedido) {
        return { status: 404, error: 'Pedido Glovo no encontrado' };
      }

      if (pedido.estado !== 'recibido') {
        return { status: 409, error: `Pedido en estado '${pedido.estado}', no se puede rechazar` };
      }

      pedido.estado = 'rechazado';
      pedido.hora_rechazado = new Date().toISOString();
      pedido.motivo_rechazo = motivo || 'Sin motivo especificado';

      this.internalMetrics.pedidos_rechazados++;

      await this.modulo.eventBus.publish('glovo.pedido_rechazado', {
        cuenta_id: pedido.cuenta_id,
        glovo_order_id: pedido.glovo_order_id,
        motivo: pedido.motivo_rechazo
      });

      await this.notificarGlovoAPI('reject', pedido);

      this.pedidosActivos.delete(cuenta_id);
      this.externalOrderMap.delete(pedido.glovo_order_id);

      this.modulo.logger.info('glovo.pedido_rechazado', {
        cuenta_id,
        glovo_order_id: pedido.glovo_order_id,
        motivo
      });

      return { status: 200, data: { message: 'Pedido rechazado', motivo: pedido.motivo_rechazo } };

    } catch (error) {
      this.modulo.logger.error('canal.glovo.rechazar.error', { error: error.message });
      return { status: 500, error: 'Error interno rechazando pedido' };
    }
  }

  async handleMarcarListo(data) {
    const { cuenta_id } = data;

    try {
      await this.marcarListoInterno(cuenta_id);
      return { status: 200, data: { message: 'Pedido Glovo marcado como listo para rider' } };
    } catch (error) {
      this.modulo.logger.error('canal.glovo.marcar_listo.error', { error: error.message });
      return { status: 500, error: error.message };
    }
  }

  async handleMarcarRecogido(data) {
    const { cuenta_id } = data;

    try {
      await this.marcarRecogido(cuenta_id);
      return { status: 200, data: { message: 'Pedido Glovo marcado como recogido por rider' } };
    } catch (error) {
      this.modulo.logger.error('canal.glovo.marcar_recogido.error', { error: error.message });
      return { status: 500, error: error.message };
    }
  }

  async handleGetActivos() {
    const activos = Array.from(this.pedidosActivos.values())
      .filter(p => p.estado !== 'rechazado')
      .sort((a, b) => new Date(a.hora_recibido) - new Date(b.hora_recibido));

    const porEstado = {
      recibidos: activos.filter(p => p.estado === 'recibido').length,
      aceptados: activos.filter(p => p.estado === 'aceptado').length,
      preparando: activos.filter(p => p.estado === 'preparando').length,
      listos: activos.filter(p => p.estado === 'listo').length
    };

    return {
      status: 200,
      data: { pedidos: activos, total: activos.length, por_estado: porEstado }
    };
  }

  async handleGetPedido(data) {
    const { cuenta_id, glovo_order_id } = data;

    let pedido = null;
    if (cuenta_id) {
      pedido = this.pedidosActivos.get(cuenta_id);
    } else if (glovo_order_id) {
      const internalId = this.externalOrderMap.get(glovo_order_id);
      if (internalId) pedido = this.pedidosActivos.get(internalId);
    }

    if (!pedido) {
      return { status: 404, error: 'Pedido Glovo no encontrado' };
    }

    return { status: 200, data: pedido };
  }

  async handleGetHistorial(data) {
    const { limit } = data || {};
    const maxItems = limit || 50;

    // Solo pedidos completados (recogidos) - en memoria solo quedan activos
    // En producción esto vendría de persistencia
    return {
      status: 200,
      data: {
        message: 'Historial disponible vía persistencia-comandero',
        pedidos_activos: this.pedidosActivos.size,
        metricas: this.getMetrics()
      }
    };
  }

  async handlePoll() {
    const result = await this.pollNuevosPedidos();
    return {
      status: 200,
      data: {
        ...result,
        pedidos_activos: this.pedidosActivos.size,
        polling_activo: !!this._pollInterval
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
  // Product Catalog Enrichment
  // ==========================================

  /**
   * Enriquece items de Glovo con datos del catálogo local:
   * producto_id real e ingredientes_base
   * Matching por nombre (case-insensitive, exacto primero)
   */
  async enrichItemsWithCatalog(items) {
    if (!items?.length) return items;

    const searchHandler = this.modulo?.uiHandler?.handlers?.get('productos.search');
    if (!searchHandler) {
      this.modulo?.logger?.debug('glovo.enrich.skip', { reason: 'productos.search handler not available' });
      return items;
    }

    const enriched = [];
    for (const item of items) {
      const nombre = item.nombre || item.name || '';
      if (!nombre) {
        enriched.push(item);
        continue;
      }

      try {
        const result = await searchHandler({ project_id: 'default', q: nombre });
        const resultados = result?.data?.resultados || [];

        // Buscar match exacto primero, luego parcial
        const exactMatch = resultados.find(p =>
          (p.nombre || '').toLowerCase() === nombre.toLowerCase()
        );
        const producto = exactMatch || resultados[0];

        if (producto) {
          const enrichedItem = {
            ...item,
            producto_id: producto.id || item.producto_id || item.id,
            ingredientes_base: producto.ingredientes_base
              ? producto.ingredientes_base.map(ing =>
                  typeof ing === 'string' ? ing : ing.nombre || ing
                )
              : undefined
          };

          this.modulo?.logger?.debug('glovo.enrich.match', {
            glovo_nombre: nombre,
            producto_id: producto.id,
            ingredientes: enrichedItem.ingredientes_base?.length || 0
          });

          enriched.push(enrichedItem);
        } else {
          enriched.push(item);
        }
      } catch (err) {
        this.modulo?.logger?.debug('glovo.enrich.error', { nombre, error: err.message });
        enriched.push(item);
      }
    }

    return enriched;
  }

  // ==========================================
  // Restauración desde persistencia
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
      let maxSeq = 0;
      for (const [cuenta_id, cuenta] of Object.entries(datos.cuentas)) {
        if (!cuenta_id.startsWith(this.prefijo)) continue;

        let seq = cuenta.datos_especificos?.numero_pedido || null;
        if (!seq) {
          const seqMatch = cuenta_id.match(/_(\d+)$/);
          seq = seqMatch ? parseInt(seqMatch[1], 10) : (restaurados + 1);
        }
        if (seq > maxSeq) maxSeq = seq;

        const pedido = {
          cuenta_id,
          glovo_order_id: cuenta.datos_especificos?.glovo_order_id || null,
          numero_pedido: seq,
          plataforma: 'glovo',
          estado: 'aceptado',
          pagado: false,
          items: [],
          total: cuenta.total || 0,
          cliente_nombre: cuenta.datos_especificos?.cliente_nombre || '',
          direccion_entrega: cuenta.datos_especificos?.direccion_entrega || '',
          notas: '',
          tiempo_estimado_entrega: 45,
          hora_recibido: cuenta.created_at || new Date().toISOString(),
          hora_aceptado: cuenta.created_at || new Date().toISOString(),
          hora_listo: null,
          hora_recogido: null,
          rider_info: null,
          pedidos: (cuenta.pedidos || []).map(p => p.pedido_id)
        };

        this.pedidosActivos.set(cuenta_id, pedido);
        if (pedido.glovo_order_id) {
          this.externalOrderMap.set(pedido.glovo_order_id, cuenta_id);
        }
        restaurados++;
      }

      if (restaurados > 0) {
        if (maxSeq > this._pedidoSeq) this._pedidoSeq = maxSeq;
        this.modulo.logger.info('canal.glovo.estado_restaurado', {
          pedidos_restaurados: restaurados,
          pedido_seq: this._pedidoSeq
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.modulo?.logger?.warn('canal.glovo.restaurar.error', { error: error.message });
      }
    }
  }

  // ==========================================
  // Business Logic
  // ==========================================

  async marcarListoInterno(cuenta_id, correlationId) {
    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) {
      throw new Error('Pedido Glovo no encontrado');
    }

    if (pedido.estado === 'recibido') {
      throw new Error('Pedido debe ser aceptado antes de marcar como listo');
    }

    pedido.estado = 'listo';
    pedido.hora_listo = new Date().toISOString();

    const tiempoPreparacion = this.modulo.calcularTiempoMinutos(
      pedido.hora_aceptado || pedido.hora_recibido
    );
    this.modulo.trackTiempo('glovo_preparacion', tiempoPreparacion);
    this.internalMetrics.pedidos_listos++;

    await this.modulo.eventBus.publish('glovo.pedido_listo', {
      cuenta_id: pedido.cuenta_id,
      glovo_order_id: pedido.glovo_order_id,
      hora_listo: pedido.hora_listo,
      tiempo_preparacion: tiempoPreparacion
    }, { correlationId });

    await this.notificarGlovoAPI('ready', pedido);

    this.modulo.logger.info('glovo.pedido_listo', {
      correlation_id: correlationId,
      cuenta_id,
      glovo_order_id: pedido.glovo_order_id,
      tiempo_preparacion: tiempoPreparacion
    });
  }

  async marcarRecogido(cuenta_id, correlationId) {
    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) {
      throw new Error('Pedido Glovo no encontrado');
    }

    pedido.estado = 'recogido';
    pedido.hora_recogido = new Date().toISOString();

    this.internalMetrics.pedidos_recogidos++;
    this.internalMetrics.ingresos_totales += pedido.total;

    await this.modulo.eventBus.publish('glovo.pedido_recogido', {
      cuenta_id: pedido.cuenta_id,
      glovo_order_id: pedido.glovo_order_id,
      total: pedido.total,
      hora_recogido: pedido.hora_recogido
    }, { correlationId });

    this.modulo.logger.info('glovo.pedido_recogido', {
      correlation_id: correlationId,
      cuenta_id,
      glovo_order_id: pedido.glovo_order_id,
      pagado: pedido.pagado
    });

    // Si ya pagado, la cuenta ya fue cerrada por onCobroProcesado
    if (!pedido.pagado) {
      this.modulo.logger.info('glovo.pedido_recogido_pendiente_pago', {
        correlation_id: correlationId,
        cuenta_id,
        glovo_order_id: pedido.glovo_order_id
      });
    }
  }

  async cerrarCuentaGlovo(cuenta_id, correlationId) {
    const pedido = this.pedidosActivos.get(cuenta_id);
    if (!pedido) return;

    await this.modulo.publishCuentaCerrada({
      cuenta_id: pedido.cuenta_id,
      tipo: 'glovo',
      total: pedido.total,
      metadata: {
        glovo_order_id: pedido.glovo_order_id,
        direccion_entrega: pedido.direccion_entrega,
        cliente_nombre: pedido.cliente_nombre
      }
    }, correlationId);

    this.pedidosActivos.delete(cuenta_id);
    this.externalOrderMap.delete(pedido.glovo_order_id);

    this.modulo.logger.info('glovo.cuenta_cerrada', {
      correlation_id: correlationId,
      cuenta_id,
      glovo_order_id: pedido.glovo_order_id,
      total: pedido.total
    });
  }

  // ==========================================
  // Integración Glovo API via provider local.glovo
  // ==========================================

  async notificarGlovoAPI(action, pedido) {
    const orderId = pedido.glovo_order_id;
    if (!orderId) return;

    // Mapeo action → función del provider
    const actionMap = {
      accept: 'accept_order',
      reject: 'reject_order',
      ready: 'mark_ready'
    };

    const providerAction = actionMap[action];
    if (!providerAction) {
      this.modulo.logger.warn('glovo.api.action_desconocida', { action, orderId });
      return;
    }

    try {
      // Llamar al provider via eventBus (patrón request/response)
      const response = await new Promise((resolve, reject) => {
        const correlationId = `glovo-${action}-${orderId}-${Date.now()}`;
        const responseEvent = `local.glovo.${providerAction}.response`;
        let timeout;

        const handler = (event) => {
          const data = event?.data || event?.payload || event;
          if (data?.correlationId === correlationId || event?.metadata?.correlationId === correlationId) {
            clearTimeout(timeout);
            this.modulo.eventBus.unsubscribe(responseEvent, handler);
            if (data?.success === false || data?.error) {
              reject(new Error(data.error || 'Glovo API error'));
            } else {
              resolve(data);
            }
          }
        };

        this.modulo.eventBus.subscribe(responseEvent, handler);

        timeout = setTimeout(() => {
          this.modulo.eventBus.unsubscribe(responseEvent, handler);
          reject(new Error('Glovo API: timeout (30s)'));
        }, 30000);

        this.modulo.eventBus.publish(`local.glovo.${providerAction}.request`, {
          order_id: orderId,
          project_id: pedido.project_id || null,
          ...(action === 'reject' && pedido.motivo_rechazo && { reason: pedido.motivo_rechazo })
        }, { correlationId });
      });

      this.modulo.logger.info('glovo.api.ok', {
        action,
        glovo_order_id: orderId,
        response: response?.data || response
      });

    } catch (error) {
      // Log pero no bloquear — el pedido interno ya se procesó
      this.modulo.logger.warn('glovo.api.error', {
        action,
        glovo_order_id: orderId,
        error: error.message
      });
    }
  }

  // ==========================================
  // Webhook entrante (push de Glovo)
  // ==========================================

  /**
   * Punto de entrada del webhook de Glovo (push en tiempo real).
   * Lo invoca cuentas-canales.handleGlovoWebhook tras validar el token.
   *
   * Flujo: traer el detalle AUTORITATIVO via la API de Glovo (get_order) →
   * fallback al cuerpo del webhook si la API no responde → delegar en el
   * flujo ya existente (handleRecibirPedido: crea cuenta + manda a cocina).
   *
   * @param {object} p - { glovo_order_id, project_id, rawOrder }
   * @returns {Promise<{status, data?, error?}>}
   */
  async handleWebhookEntrante({ glovo_order_id, project_id, rawOrder } = {}) {
    if (!glovo_order_id) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'glovo_order_id requerido' } };
    }

    // 1. Detalle autoritativo desde la API de Glovo (autenticidad + datos completos).
    let order = await this.getOrderFromAPI(glovo_order_id, project_id);

    // 2. Fallback: el cuerpo del webhook (p.ej. staging sin OAuth configurado).
    if (!order) {
      order = this._normalizeWebhookBody(rawOrder, glovo_order_id);
    }

    if (!order || !order.glovo_order_id) {
      return { status: 422, error: { code: 'INVALID_INPUT', message: 'Pedido Glovo sin order_id resoluble' } };
    }

    // 3. Reusa el flujo existente. tiempo_estimado NO se propaga: normalizeOrder
    //    lo trae como timestamp ISO y el schema exige minutos → handleRecibirPedido
    //    aplica su default (45) sin romper la validacion AJV.
    return await this.handleRecibirPedido({
      project_id,
      glovo_order_id: order.glovo_order_id,
      items: order.items,
      total: order.total,
      cliente_nombre: order.cliente_nombre,
      direccion_entrega: order.direccion_entrega,
      notas: order.notas
    });
  }

  /**
   * Trae el detalle de un pedido desde la API de Glovo via el provider
   * local.glovo (mismo patron request/response del bus que pollNuevosPedidos).
   * Devuelve el pedido normalizado o null si la API no responde.
   */
  async getOrderFromAPI(orderId, projectId = null) {
    if (!orderId) return null;
    try {
      return await new Promise((resolve, reject) => {
        const correlationId = `glovo-getorder-${orderId}-${Date.now()}`;
        const responseEvent = 'local.glovo.get_order.response';
        let timeout;

        const handler = (event) => {
          const data = event?.data || event?.payload || event;
          if (data?.correlationId === correlationId || event?.metadata?.correlationId === correlationId) {
            clearTimeout(timeout);
            this.modulo.eventBus.unsubscribe(responseEvent, handler);
            if (data?.success === false || data?.error) {
              reject(new Error(data.error || 'Glovo get_order error'));
            } else {
              resolve(data?.data?.order || data?.order || null);
            }
          }
        };

        this.modulo.eventBus.subscribe(responseEvent, handler);

        timeout = setTimeout(() => {
          this.modulo.eventBus.unsubscribe(responseEvent, handler);
          reject(new Error('Glovo get_order: timeout'));
        }, 15000);

        this.modulo.eventBus.publish('local.glovo.get_order.request', {
          order_id: orderId,
          project_id: projectId
        }, { correlationId });
      });
    } catch (err) {
      this.modulo?.logger?.warn('glovo.webhook.get_order.error', { order_id: orderId, error: err.message });
      return null;
    }
  }

  /**
   * Normaliza el cuerpo crudo del webhook al shape que espera handleRecibirPedido.
   * Tolerante a variantes de nombres (igual que provider.normalizeOrder). Solo
   * se usa como FALLBACK cuando get_order no responde.
   */
  _normalizeWebhookBody(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.order_id || raw.orderId || raw.id || fallbackId;
    if (!id) return null;

    const rawItems = Array.isArray(raw.products) ? raw.products
      : Array.isArray(raw.items) ? raw.items : [];

    return {
      glovo_order_id: id,
      items: rawItems.map(p => ({
        nombre: p.name || p.nombre || 'Producto Glovo',
        cantidad: p.quantity || p.cantidad || 1,
        precio: p.price || p.precio || 0,
        notas: p.comments || p.notas || ''
      })),
      total: raw.total_price || raw.totalPrice || raw.total || 0,
      cliente_nombre: raw.customer?.name || raw.customerName || null,
      direccion_entrega: raw.delivery_address?.label
        || raw.delivery_address?.raw_address
        || raw.deliveryAddress?.label
        || '',
      notas: raw.special_requirements || raw.customerComments || raw.comments || ''
    };
  }

  // ==========================================
  // Polling — llamado por scheduler o manualmente
  // ==========================================

  async pollNuevosPedidos() {
    try {
      const response = await new Promise((resolve, reject) => {
        const correlationId = `glovo-poll-${Date.now()}`;
        let timeout;

        const handler = (event) => {
          const data = event?.data || event?.payload || event;
          if (data?.correlationId === correlationId || event?.metadata?.correlationId === correlationId) {
            clearTimeout(timeout);
            this.modulo.eventBus.unsubscribe('local.glovo.poll_orders.response', handler);
            resolve(data);
          }
        };

        this.modulo.eventBus.subscribe('local.glovo.poll_orders.response', handler);

        timeout = setTimeout(() => {
          this.modulo.eventBus.unsubscribe('local.glovo.poll_orders.response', handler);
          reject(new Error('Glovo polling: timeout'));
        }, 30000);

        this.modulo.eventBus.publish('local.glovo.poll_orders.request', {
          status: 'NEW'
        }, { correlationId });
      });

      const orders = response?.data?.orders || response?.orders || [];

      for (const order of orders) {
        // Solo procesar si no lo tenemos ya
        if (!this.externalOrderMap.has(order.glovo_order_id)) {
          await this.handleRecibirPedido({
            glovo_order_id: order.glovo_order_id,
            items: order.items,
            total: order.total,
            cliente_nombre: order.cliente_nombre,
            direccion_entrega: order.direccion_entrega,
            notas: order.notas,
            tiempo_estimado_entrega: order.tiempo_estimado_entrega
          });

          this.modulo.logger.info('glovo.poll.nuevo_pedido', {
            glovo_order_id: order.glovo_order_id,
            total: order.total
          });
        }
      }

      return { nuevos: orders.filter(o => !this.externalOrderMap.has(o.glovo_order_id)).length };

    } catch (error) {
      this.modulo.logger.warn('glovo.poll.error', { error: error.message });
      return { nuevos: 0, error: error.message };
    }
  }
}

module.exports = GlovoStrategy;
