---
id: pizzepos/pos-nucleo
dominio: pizzepos
resumen: El POS vivo: comandero, cuentas (state machine), cobros, cocina, productos (proyector), categorías, ingredientes, variaciones, pedidos, tarifas, persistencia, impresión.
fuentes:
  - modules/pizzepos/comandero/**
  - modules/pizzepos/cuentas/**
  - modules/pizzepos/cobros/**
  - modules/pizzepos/cocina/**
  - modules/pizzepos/productos/**
  - modules/pizzepos/categorias/**
  - modules/pizzepos/ingredientes/**
  - modules/pizzepos/variaciones/**
  - modules/pizzepos/pedidos/**
  - modules/pizzepos/tarifas/**
  - modules/pizzepos/persistencia-comandero/**
  - modules/pizzepos/impresion/**
verificado: 2026-07-12
---

# PizzePOS Módulos — Subsistema de Punto de Venta (v3.2.0)

Análisis OOP exhaustivo de 25 módulos pizzepos + blueprint drivers. Pseudocódigo puro, sin comentarios.

## MÓDULOS CON ÍNDICE.JS (14)

### 1. COMANDERO (v3.2.0) — Buffer de Pedidos por Cuenta

```
INTERFAZ ComanderoContract {
  getBuffer(cuenta_id: String): Promise<Pedido>
  addItem(cuenta_id: String, item_data: Object): Promise<Item>
  removeItem(cuenta_id: String, item_id: String): Promise<Void>
  updateItem(cuenta_id: String, item_id: String, updates: Object): Promise<Item>
  sendToKitchen(cuenta_id: String): Promise<{pedido_id, items_enviados}>
  listBuffers(): Promise<Array<Buffer>>
}

CLASE ComanderoModule HEREDA BaseModule IMPLEMENTA ComanderoContract {
  ATRIBUTOS {
    name: String = 'comandero'
    version: String = '3.2.0'
    pedidos: Map<cuenta_id, Pedido>
    refDisplayCache: Map<cuenta_id, String>
    productosCache: Map<producto_id, Producto>
    cartasProductosCache: Map<carta_id, Map<producto_id, ProductoEnCarta>>
    tarifasConfigPorProject: Map<project_id, {general, canales}>
    _bufferFile: String
    _saveTimer: NodeJS.Timeout
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    validator: ValidationManager
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      _registerSchemas()
      await _restaurarBuffers()
      await _publicarEvento('tarifas.config.solicitada', {})

    async onUnload(): Promise<Void>
      SI _saveTimer: clearTimeout(_saveTimer)
      pedidos.clear()
      productosCache.clear()
      cartasProductosCache.clear()
      refDisplayCache.clear()
      tarifasConfigPorProject.clear()

    async handleAddItem(data: {cuenta_id, producto_id, nombre?, precio?, cantidad?, notas?, variaciones?}): Promise<Response>
      VALIDA required fields
      OBTIENE o CREA pedido
      RESUELVE precio POR canal via _resolverPrecioCanal
      CREA item con UUID
      AGREGA a pedido.items
      RECALCULA pedido.total
      PUBLICA comandero.item_agregado
      PERSISTE via _guardarBuffers()
      RETORNA {status: 201, data: {item, pedido}}

    async handleRemoveItem(data: {cuenta_id, item_id}): Promise<Response>
      VALIDA required fields
      OBTIENE pedido SI NO existe: 404
      BUSCA item EN pedido.items
      ELIMINA item
      RECALCULA total
      PUBLICA comandero.item_eliminado
      PERSISTE via _guardarBuffers()
      RETORNA {status: 200, data: {pedido}}

    async handleUpdateItem(data: {cuenta_id, item_id, cantidad?, notas?}): Promise<Response>
      SI cantidad == 0 → delega a handleRemoveItem
      SI cantidad > 0 → actualiza item.cantidad + item.subtotal
      PUBLICA comandero.item_actualizado
      PERSISTE
      RETORNA {status: 200, data: {item, pedido}}

    async handleEnviarCocina(data: {cuenta_id}): Promise<Response>
      OBTIENE pedido SI items == 0: 409 CONFLICT_STATE
      MARCA items.enviado = true + item.enviado_at = now()
      GENERA pedido_id
      PUBLICA comandero.enviar_cocina {pedido_id, items, total, notas}
      PERSISTE
      RETORNA {status: 200, data: {pedido_id, items_enviados}}

    EVENTOS_PUBLISHES {
      'comandero.item_agregado': {cuenta_id, item_id, producto_id, precio_unitario, cantidad, pedido_total}
      'comandero.item_eliminado': {cuenta_id, item_id, producto_id, cantidad, pedido_total}
      'comandero.item_actualizado': {cuenta_id, item_id, cantidad_anterior, cantidad_nueva, diff_precio, pedido_total}
      'comandero.enviar_cocina': {cuenta_id, pedido_id, project_id, items, total, notas_generales}
      'tarifas.config.solicitada': {}
    }

    EVENTOS_SUBSCRIBES {
      'cuenta.creada': onCuentaCreada
      'cuenta.actualizada': onCuentaActualizada
      'caja.cerrada': onCajaCerrada (reset)
      'dia.iniciado': onDiaIniciado (reset)
      'catalogo.actualizado': onCatalogoActualizado
      'producto.creado': onProductoActualizado
      'producto.actualizado': onProductoActualizado
      'carta.actualizada': onCartaActualizada
      'tarifas.config.actualizada': onTarifasConfigActualizada
    }
  }
}

CLASE Pedido {
  ATRIBUTOS {
    items: Array<Item>
    notas: String
    total: Number
  }
}

CLASE Item {
  ATRIBUTOS {
    id: String (UUID)
    producto_id: String
    nombre: String
    precio: Number
    cantidad: Integer
    subtotal: Number
    variaciones: Array<Object>
    notas: String
    enviado: Boolean
    enviado_at: String|Null (ISO)
    created_at: String (ISO)
  }
}
```

### 2. CUENTAS (v3.0.0) — State Machine de POS Ticket

```
CLASE CuentasModule HEREDA BaseModule {
  ATRIBUTOS {
    name: String = 'cuentas'
    version: String = '3.0.0'
    cuentas: Map<cuenta_id, Cuenta>
    _pendingTimeouts: Map<cuenta_id, NodeJS.Timeout>
    _alertaTimers: Map<cuenta_id, NodeJS.Timeout>
    _pedidosEnCocina: Map<cuenta_id, Set<pedido_id>>
    _turno: Integer
    TRANSICIONES_VALIDAS: Map<estado, Array<estado>>
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      await _loadTurno()
      await _restaurarDesdeArchivo()
      _metricsInterval = setInterval(() => _reportMetrics(), 10000ms)

    async onUnload(): Promise<Void>
      SI _metricsInterval: clearInterval(_metricsInterval)
      _pendingTimeouts.values().forEach(t => clearTimeout(t))
      _alertaTimers.values().forEach(t => clearTimeout(t))
      cuentas.clear()
      _pedidosEnCocina.clear()

    async handleCreateCuenta(data: {project_id, tipo?, nombre?, metadata?, pedido_inicial?}): Promise<Response>
      VALIDA project_id obligatorio
      OBTIENE o genera cuenta_id
      GENERA turno via _getNextTurno()
      GENERA ref_display via _generateRefDisplay(tipo, nombre)
      CREA Cuenta object
      cuentas.set(cuenta_id, cuenta)
      _gestionarAlerta(cuenta_id, 'pendiente')
      PUBLICA cuenta.creada
      SI pedido_inicial: _inyectarPedidoInicial(cuenta, pedido_inicial)
      RETORNA {status: 201, data: cuenta}

    async _transicionarEstado(cuenta_id: String, estado_nuevo: String): Promise<Boolean>
      OBTIENE cuenta SI NO existe: RETORNA false
      VALIDA transicion EN TRANSICIONES_VALIDAS[estado_anterior]
      SI transicion invalida: RETORNA false
      cuenta.estado = estado_nuevo
      _gestionarAlerta(cuenta_id, estado_nuevo)
      PUBLICA cuenta.estado_cambiado
      RETORNA true

    async onComanderoItemAgregado(event: Event): Void
      OBTIENE cuenta
      cuenta.items += event.cantidad
      cuenta.total += event.precio_total
      SI estado == 'pendiente': await _transicionarEstado(cuenta_id, 'con_pedido')

    async onCocinaPedidoListo(event: Event): Void
      OBTIENE cuenta
      ELIMINA pedido_id DEL _pedidosEnCocina[cuenta_id]
      SI NO hay mas pedidos EN cocina Y estado == 'en_preparacion':
        await _transicionarEstado(cuenta_id, 'listo')

    async onCobroProcesado(event: Event): Void
      OBTIENE cuenta
      SI ya pagado (idempotencia): RETORNA
      cuenta.pagado = true
      SI _cerrarAlCobrar(cuenta): await _cerrarCuentaCobrada(cuenta_id)

    EVENTOS_PUBLISHES {
      'cuenta.creada': {project_id, cuenta_id, turno, tipo, nombre, ref_display, total, estado}
      'cuenta.actualizada': {project_id, cuenta_id, cambios}
      'cuenta.estado_cambiado': {project_id, cuenta_id, estado_anterior, estado_nuevo}
      'cuenta.eliminada': {project_id, cuenta_id, tipo, motivo}
    }

    EVENTOS_SUBSCRIBES {
      'comandero.item_agregado': onComanderoItemAgregado
      'comandero.item_eliminado': onComanderoItemEliminado
      'comandero.item_actualizado': onComanderoItemActualizado
      'comandero.enviar_cocina': onComanderoEnviarCocina
      'cocina.pedido_listo': onCocinaPedidoListo
      'cobro.iniciado': onCobroIniciado
      'cobro.procesado': onCobroProcesado
      'cuenta.cerrada': onCuentaExternaCerrada
    }
  }
}

CLASE Cuenta {
  ATRIBUTOS {
    id: String (cuenta_id)
    project_id: String
    turno: Integer|Null
    tipo: String (local|delivery|llevar)
    nombre: String|Null
    ref_display: String
    estado: String (pendiente|con_pedido|en_preparacion|listo|entregado|para_cobrar|cobrado)
    pagado: Boolean
    items: Integer
    total: Number
    alerta: Boolean
    metadata: Object
    created_at: String (ISO)
    updated_at: String (ISO)
  }
}
```

### 3. COBROS (v3.0.0) — Procesamiento de Pagos

```
CLASE CobrosModule HEREDA BaseModule {
  ATRIBUTOS {
    name: String = 'cobros'
    version: String = '3.0.0'
    cobros: Map<cobro_id, Cobro>
    refDisplayCache: Map<cuenta_id, String>
    metodosPago: Array<String> = ['efectivo', 'tarjeta', 'bizum', 'transferencia', 'mixto', 'link_pago', 'qr']
    internalMetrics: {cobros_iniciados, cobros_completados, cobros_reembolsados, monto_total_cobrado, propinas_total}
  }

  METODOS {
    async handleCreateCobro(data: {cuenta_id, monto, metodo_pago, propina?, desglose?, monto_recibido?}): Promise<Response>
      VALIDA cuenta_id NO es llevadoo_*
      VALIDA monto > 0
      VALIDA metodo_pago EN metodosPago
      VALIDA idempotencia: SI existe cobro activo: RETORNA 409
      
      GENERA cobro_id
      monto_total = monto + (propina || 0)
      CREA Cobro object
      
      SI metodo_pago == 'efectivo':
        SI monto_recibido:
          cobro.cambio = monto_recibido - monto_total
          SI cambio < 0: RETORNA 400
      
      SI metodo_pago == 'mixto':
        result = procesarPagoMixto(desglose, monto_total)
        SI result.error: RETORNA 400
        cobro.desglose = result.desglose
      
      SI metodo_pago == 'link_pago':
        cobro.link_url = `${config.payment_base_url}/checkout/{linkId}`
        cobro.expira_en = now + 24h
      
      cobros.set(cobro_id, cobro)
      internalMetrics.cobros_iniciados++
      PUBLICA cobro.iniciado
      RETORNA {status: 201, data: cobro}

    async handleConfirmarCobro(data: {id, referencia_pago?}): Promise<Response>
      OBTIENE cobro SI NO existe: 404
      VALIDA cobro.estado EN ['pendiente', 'procesando']: 409
      
      cobro.estado = 'completado'
      cobro.referencia_pago = referencia_pago || `REF_{uuid.slice(0,8)}`
      
      internalMetrics.cobros_completados++
      internalMetrics.monto_total_cobrado += cobro.monto_total
      
      PUBLICA cobro.procesado (escuchado por cuentas)
      
      SI metodo_pago == 'efectivo':
        await abrirCajonDinero(cobro) (best-effort)
      
      RETORNA {status: 200, data: cobro}

    async handleReembolsarCobro(data: {id, motivo?}): Promise<Response>
      OBTIENE cobro SI NO existe: 404
      VALIDA cobro.estado == 'completado': 409
      
      cobro.estado = 'reembolsado'
      cobro.motivo_reembolso = motivo
      
      internalMetrics.cobros_reembolsados++
      internalMetrics.monto_total_cobrado -= cobro.monto_total
      
      PUBLICA cobro.reembolsado
      RETORNA {status: 200, data: cobro}

    EVENTOS_PUBLISHES {
      'cobro.iniciado': {cobro_id, cuenta_id, project_id, monto, metodo_pago, monto_total}
      'cobro.procesado': {cobro_id, cuenta_id, project_id, ref_display, monto_total, referencia_pago}
      'cobro.reembolsado': {cobro_id, cuenta_id, project_id, monto_reembolsado, motivo}
      'periferico.abrir-cajon': {destino, pin, project_id}
    }

    EVENTOS_SUBSCRIBES {
      'cuenta.creada': onCuentaCreada (cache ref_display)
      'cuenta.actualizada': onCuentaActualizada
      'caja.cerrada': onCajaCerrada (reset)
      'dia.iniciado': onDiaIniciado (reset)
    }
  }
}

CLASE Cobro {
  ATRIBUTOS {
    id: String (UUID)
    cuenta_id: String
    pedido_ids: Array<String>|Null
    monto: Number
    propina: Number
    monto_total: Number
    metodo_pago: String (efectivo|tarjeta|bizum|transferencia|mixto|link_pago|qr)
    estado: String (pendiente|procesando|completado|reembolsado)
    monto_recibido: Number|Null
    cambio: Number|Null
    desglose: Array|Null
    link_url: String|Null
    qr_data: String|Null
    expira_en: String|Null
    referencia_pago: String|Null
    completado_at: String|Null
    motivo_reembolso: String|Null
    created_at: String (ISO)
  }
}
```

### 4. COCINA (v3.2.0) — Display de Cocina en Tiempo Real

```
CLASE CocinaModule HEREDA BaseModule {
  ATRIBUTOS {
    name: String = 'cocina'
    version: String = '3.2.0'
    pedidosActivos: Map<pedido_id, PedidoEnCocina>
    historial: Array<PedidoEnCocina> (max 50)
    devices: Map<device_id, Device>
    tiemposPreparacion: Array<Number> (max 100)
    cuentaNombres: Map<cuenta_id, String>
    tiposEstacion: Map<tipo, TipoEstacion>
    _snapshotFile: String
    _snapshotSaveTimer: NodeJS.Timeout
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      await _restaurarSnapshot()
      SI NO: await _restaurarDesdeArchivo()

    async handleGetActivos(): Promise<Response>
      FILTRA pedidosActivos donde estado != 'completado'
      ENRIQUECE CON device colors
      RETORNA {status: 200, data: {pedidos}}

    async handlePrepararItem(data: {item_id, device_id?}): Promise<Response>
      BUSCA item EN todos los pedidos activos
      SI NO existe: 404
      VALIDA transicion: pendiente → preparando → avanzado/preparado
      PUBLICA cocina.item_preparando|item_avanzado|item_preparado
      RETORNA response

    async handleMarcarListo(data: {pedido_id}): Promise<Response>
      OBTIENE pedido
      MARCA TODOS items como completados
      ELIMINA DE pedidosActivos
      AGREGA AL historial
      PUBLICA cocina.pedido_listo
      RETORNA {status: 200}

    async handleRegisterDevice(data: {device_id, nombre?, estacion?, tipo_estacion?, filtros?, impresora?}): Promise<Response>
      ASIGNA color unico del pool DEVICE_COLORS
      CREA Device object
      devices.set(device_id, device)
      PUBLICA cocina.device_registered
      RETORNA {status: 201, data: device}

    EVENTOS_PUBLISHES {
      'cocina.item_preparando': {item_id, pedido_id, cuenta_id, desde_estacion}
      'cocina.item_avanzado': {item_id, pedido_id, desde_estacion, estado}
      'cocina.item_preparado': {item_id, pedido_id, estacion_final}
      'cocina.pedido_listo': {pedido_id, cuenta_id, items_count, tiempo_preparacion}
      'cocina.device_registered': {device_id, nombre, color, estacion}
      'cocina.device_unregistered': {device_id}
      'periferico.display': {accion, contenido, prioridad, display_destino}
    }

    EVENTOS_SUBSCRIBES {
      'pedido.enviado_cocina': onPedidoEnviadoCocina
      'pedido.cancelado': onPedidoCancelado
      'cuenta.creada': onCuentaCreada (cache ref_display)
      'caja.cerrada': onCajaCerrada (reset)
      'dia.iniciado': onDiaIniciado (reset)
    }
  }
}

CLASE PedidoEnCocina {
  ATRIBUTOS {
    id: String (pedido_id)
    cuenta_id: String
    ref_display: String
    items: Array<ItemEnCocina>
    estado: String (pendiente|preparando|completado)
    creado_at: String (ISO)
  }
}

CLASE Device {
  ATRIBUTOS {
    id: String (device_id)
    nombre: String|Null
    estacion: String
    tipo_estacion: String (general|horno)
    color: String (HEX)
    filtros: Object|Null
    impresora: String|Null
    conectado: Boolean
    created_at: String (ISO)
  }
}
```

### 5. PRODUCTOS (v5.0.0) — PROYECTOR SIN ESTADO sobre carta-manager

```
CLASE ProductosModule HEREDA BaseModule {
  // REDISEÑO v5.0.0: productos YA NO tiene store. La CARTA (carta-manager) es la ÚNICA
  // fuente de verdad. productos PROYECTA la carta activa del proyecto a formato POS al
  // vuelo (carta.get.request → reflejo, ms). catalogo == proyectar(carta_activa) SIEMPRE.
  // Mata por construcción: acumulación de fantasmas, leak cross-project, stale.
  // ELIMINADO: productosPerProject + catalogo_activo.json + syncCatalogo (merge que
  // derivaba) + loadCartaFromProject (unión de TODAS las cartas) + resolveToActiveProject.
  // REQUIERE carta-manager híbrido (reflejo) desplegado.
  ATRIBUTOS {
    name: String = 'productos'
    version: String = '5.0.0'
    mappingCanalesPerProject: Map<project_id, {general, canales}>   // ÚNICO estado (de tarifas): qué carta es la activa
    // SIN productosPerProject · SIN categoriasPerProject · SIN catalogo_activo
  }

  METODOS {
    async _resolverCartaActiva(project_id, canal?, carta_id?): String|Null
      SI carta_id: RETORNA carta_id                         // el caller ya resolvió (carta de canal)
      SI canal Y mapping[canal]: RETORNA mapping[canal]     // override de canal (tarifas)
      SI mapping.general: RETORNA mapping.general
      RETORNA _cartaEnServicio(project_id)                  // fallback: carta.list → en_servicio

    async _cartaActiva(project_id, canal?, carta_id?): Carta|Null
      cid = _resolverCartaActiva(...)
      RETORNA publishAndWait('carta.get.request', {project_id, carta_id: cid}).data   // REFLEJO carta-manager

    _proyectar(carta): {categorias, productos}              // función PURA carta→POS, sin guardar
      // normaliza el drift categoria/categoria_id e ingredientes/ingredientes_base; herencia de estaciones

    async handleCartaCompleta(data): Response               // lo que pide el comandero
      carta = _cartaActiva(project_id, canal?, carta_id?)
      SI !carta: RETORNA 404 (proyecto sin carta = comandero VACÍO; NO hereda otro proyecto)
      RETORNA proyectar(carta) + ingredientes (de módulo ingredientes)

    handleListProductos · handleListCategorias · handleListPizzas · handleGetProducto · handleSearchProductos
      // TODOS sobre _cartaActiva + _proyectar. project_id REQUERIDO. Sin store, sin leak.

    handleUpdateProducto · handleDeleteProducto             // DELEGAN a carta-manager (la carta es el writer)
      → publishAndWait('carta.update_product.request' | 'carta.remove_product.request')

    onCartaGenerada(carta.actualizada/editada) · onCartaBorrada
      → SEÑAL: re-emite catalogo.actualizado (el comandero re-pull y proyecta fresco). NO sincroniza store.

    EVENTOS_PUBLISHES {
      'catalogo.actualizado': {project_id, productos (lite), source}   // SEÑAL de refresco
      'carta.get.request' · 'carta.list.request' · 'carta.update_product.request' · 'carta.remove_product.request'  // RPC a carta-manager
    }

    EVENTOS_SUBSCRIBES {
      'carta.actualizada' / 'carta.editada': onCartaGenerada (señal)
      'carta.borrada': onCartaBorrada (señal)
      'tarifas.config.actualizada': onTarifasConfigActualizada (mapping canal→carta)
      'project.activated': onProjectActivated (warm: proyecta y emite catalogo.actualizado)
    }
  }
}

CLASE Producto {
  ATRIBUTOS {
    id: String (UUID)
    nombre: String
    descripcion: String|Null
    precio: Number
    categoria_id: String
    categoria: String
    tipo: String (pizza|bebida|postre)
    imagen_url: String|Null
    ingredientes_base: Array<String>
    variaciones: {quitar?: Array, anadir?: Array, max_extras?: Integer}|Null
    activo: Boolean
    estaciones_requeridas: Array<String>
    created_at: String (ISO)
    updated_at: String (ISO)
  }
}
```

### 6. CATEGORIAS (v3.0.0) — Sincronización desde Cartas

```
CLASE CategoriasModule HEREDA BaseModule {
  ATRIBUTOS {
    name: String = 'categorias'
    version: String = '3.0.0'
    categoriasPerProject: Map<project_id, Map<categoria_id, Categoria>>
  }

  METODOS {
    async onCartaActualizada(event: Event): Promise<Void>
      project_id = event.project_id
      categorias = event.categorias
      SINCRONIZA categorias DEL proyecto DESDE carta
      PUBLICA categoria.creada|actualizada para cada una

    EVENTOS_PUBLISHES {
      'categoria.creada': {project_id, categoria_id, nombre}
      'categoria.actualizada': {project_id, categoria_id, cambios}
      'categoria.orden_actualizado': {project_id, nuevamente_orden}
    }

    EVENTOS_SUBSCRIBES {
      'carta.actualizada': onCartaActualizada
    }
  }
}

CLASE Categoria {
  ATRIBUTOS {
    id: String (UUID)
    nombre: String
    descripcion: String|Null
    orden: Integer
    productos_count: Integer
    activo: Boolean
    created_at: String (ISO)
  }
}
```

### 7. INGREDIENTES (v3.0.0) — Master Data de Componentes

```
CLASE IngredientesModule HEREDA BaseModule {
  ATRIBUTOS {
    name: String = 'ingredientes'
    version: String = '3.0.0'
    ingredientesPerProject: Map<project_id, Map<ingredient_id, Ingrediente>>
  }

  METODOS {
    async handleListIngredientes(data: {project_id, tipo?, grupo?}): Promise<Response>
      FILTRA ingredientes CON filters
      RETORNA {status: 200, data: {ingredientes}}

    async handleUpdateIngrediente(data: {project_id, id, updates}): Promise<Response>
      ACTUALIZA ingrediente
      PUBLICA ingrediente.actualizado
      RETORNA response

    async onCartaActualizada(event: Event): Void
      SINCRONIZA ingredientes_catalogo + extrae DE productos.ingredientes_base

    EVENTOS_PUBLISHES {
      'ingrediente.creado': {project_id, ingredient_id, nombre}
      'ingrediente.actualizado': {project_id, ingredient_id, cambios}
    }

    EVENTOS_SUBSCRIBES {
      'project.activated': onProjectActivated
      'carta.actualizada': onCartaActualizada
      'producto.creado': onProductoCreado
    }
  }
}

CLASE Ingrediente {
  ATRIBUTOS {
    id: String (UUID)
    nombre: String
    emoji: String|Null
    precio_extra: Number
    grupo: String (complementos|carnes|verduras)
    es_alergeno: Boolean
    alergenos: Array<String>
  }
}
```

### 8. VARIACIONES (v2.0.0) — Validación de Modificaciones

```
CLASE VariacionesModule HEREDA BaseModule {
  ATRIBUTOS {
    name: String = 'variaciones'
    version: String = '2.0.0'
    variacionesPerProducto: Map<producto_id, VariacionesProducto>
    ingredientesCache: Map<ingredient_id, Ingrediente>
  }

  METODOS {
    async handleValidarVariacion(data: {producto_id, ingredientes_quitar?, ingredientes_anadir?}): Promise<Response>
      OBTIENE config de variaciones DEL producto
      VALIDA que ingredientes_quitar sean permitidos
      VALIDA que ingredientes_anadir respeten el limite
      PUBLICA variacion.validada|rechazada
      RETORNA response

    async handleCalcularPrecio(data: {producto_id, ingredientes_quitar?, ingredientes_anadir?}): Promise<Response>
      precio_base = producto.precio
      SUMA precios_extra DE ingredientes_anadir
      precio_final = precio_base + suma_extras
      RETORNA {status: 200, data: {precio_final}}

    EVENTOS_PUBLISHES {
      'variacion.validada': {producto_id, variaciones, precio_final}
      'variacion.rechazada': {producto_id, razon}
    }

    EVENTOS_SUBSCRIBES {
      'producto.creado': onProductoCreado
      'comandero.item_agregado': onComanderoItemAgregado (auto-valida)
    }
  }
}

CLASE VariacionesProducto {
  ATRIBUTOS {
    producto_id: String
    ingredientes_permitidos_quitar: Array<String>
    permite_anadir_extras: Boolean
    ingredientes_sugeridos: Array<String>
    max_extras: Integer
  }
}
```

### 9. PEDIDOS (v3.0.0) — Formalización de Órdenes

```
CLASE PedidosModule HEREDA BaseModule {
  ATRIBUTOS {
    name: String = 'pedidos'
    version: String = '3.0.0'
    pedidos: Map<pedido_id, Pedido>
    pedidosPorCuenta: Map<cuenta_id, Array<pedido_id>>
    productosCache: Map<producto_id, Producto>
  }

  METODOS {
    async handleCreatePedido(data: {cuenta_id, items, total}): Promise<Response>
      GENERA pedido_id
      CREA Pedido CON items
      pedidos.set(pedido_id, pedido)
      PUBLICA pedido.creado
      RETORNA {status: 201, data: pedido}

    async onComanderoEnviarCocina(event: Event): Promise<Void>
      CREA pedido formal SI NO existe
      PUBLICA pedido.enviado_cocina (escuchado por cocina)

    EVENTOS_PUBLISHES {
      'pedido.creado': {pedido_id, cuenta_id, items, total}
      'pedido.enviado_cocina': (delegado desde comandero bridge)
      'pedido.completado': {pedido_id, cuenta_id, tiempo_total}
      'pedido.cancelado': {pedido_id, cuenta_id, motivo}
    }

    EVENTOS_SUBSCRIBES {
      'comandero.enviar_cocina': onComanderoEnviarCocina (bridge)
      'catalogo.actualizado': onCatalogoActualizado (sync cache)
    }
  }
}

CLASE Pedido {
  ATRIBUTOS {
    id: String (pedido_id)
    cuenta_id: String
    items: Array<ItemPedido>
    total: Number
    estado: String (creado|enviado_cocina|completado|cancelado)
    created_at: String (ISO)
  }
}
```

### 10. TARIFAS (v1.0.0) — Mapeo Canal→Carta

```
CLASE TarifasModule HEREDA BaseModule {
  ATRIBUTOS {
    name: String = 'tarifas'
    version: String = '1.0.0'
    tarifasPerProject: Map<project_id, TarifasConfig>
  }

  METODOS {
    async handleGet(data: {project_id}): Promise<Response>
      RETORNA {status: 200, data: tarifasPerProject[project_id]}

    async onConfigSolicitada(event: Event): Promise<Void>
      PUBLICA tarifas.config.actualizada CON tipo='snapshot'
      PARA CADA proyecto conocido (o uno especifico SI event.project_id)

    async onProjectActivated(event: Event): Promise<Void>
      CARGA config DEL proyecto
      EMITE tarifas.config.actualizada

    EVENTOS_PUBLISHES {
      'tarifas.config.actualizada': {project_id, tipo, config: {general, canales, variantes}}
    }

    EVENTOS_SUBSCRIBES {
      'project.activated': onProjectActivated
      'tarifas.config.solicitada': onConfigSolicitada
    }
  }
}

CLASE TarifasConfig {
  ATRIBUTOS {
    project_id: String
    general: String|Null (carta_id por default)
    canales: {mesa?, llevar?, telefono?, whatsapp?, glovo?, llevadoo?, digital?}: String (carta_id)
    // digital = canal de la carta PÚBLICA online (lo proyecta carta-digital, gemelo de productos)
  }
}
```

### 11. PERSISTENCIA-COMANDERO (v3.0.0) — Auditoría del Día

```
CLASE PersistenciaComanderoModule HEREDA BaseModule {
  ATRIBUTOS {
    name: String = 'persistencia-comandero'
    version: String = '3.0.0'
    cuentasActivasCache: Map<cuenta_id, CuentaSnapshot>
    eventosCache: Array<Event> (todos los del dia)
    ventasCache: Array<Venta> (pagos completados)
    // project.deleted -> onProjectDeleted PURGA las 3 caches del proyecto muerto y
    // persiste el olvido: estas caches alimentan _getActiveProjectIds(), y los jobs
    // periodicos (backup/jornada) recreaban data/projects/<uuid> de proyectos borrados.
  }

  METODOS {
    async handleGetCuentasActivas(): Promise<Response>
      RETORNA {status: 200, data: {cuentas: cuentasActivasCache.values()}}

    async handleGetEventos(data?: {date?}): Promise<Response>
      FILTRA eventosCache POR date SI provided
      RETORNA {status: 200, data: {eventos}}

    async handleGetVentas(data?: {date?}): Promise<Response>
      FILTRA ventasCache POR date SI provided
      RETORNA {status: 200, data: {ventas}}

    async onEvento(event: Event): Void
      eventosCache.push({event_name, timestamp, data})
      PERSISTE EN disco (json-lines)

    async onCuentaCerrada(event: Event): Void
      OBTIENE cobro ASOCIADO
      CREA Venta object
      ventasCache.push(venta)
      ELIMINA DE cuentasActivasCache
      EMITE caja.cerrada SI es end-of-day

    async onCajaCerrada(event: Event): Void
      PERSISTE cuentasActivasCache + eventosCache + ventasCache A disco
      CREA CUADRE (totales, resumen de metodos de pago)
      eventosCache.clear()
      ventasCache.clear()
      cuentasActivasCache.clear()

    EVENTOS_PUBLISHES {
      'caja.cerrada': {project_id, timestamp}
      'dia.iniciado': {project_id, timestamp}
    }

    EVENTOS_SUBSCRIBES {
      'boton.pulsado': onEvento
      'ui.accion': onEvento
      'cuenta.creada': onCuentaCreada
      'cuenta.cerrada': onCuentaCerrada
      'cobro.procesado': onEvento
      'pedido.completado': onEvento
      'cocina.pedido_listo': onEvento
    }
  }
}

CLASE Venta {
  ATRIBUTOS {
    id: String (UUID)
    cuenta_id: String
    tipo: String (local|delivery|llevar)
    ref_display: String
    total: Number
    propina: Number
    metodo_pago: String
    duracion_minutos: Integer
    items_count: Integer
    created_at: String (ISO)
  }
}
```

### 12. IMPRESION (v2.0.0) — Tickets y Comandas

```
CLASE ImpresionModule HEREDA BaseModule {
  ATRIBUTOS {
    name: String = 'impresion'
    version: String = '2.0.0'
    historial: Array<Ticket> (ring buffer, max 100)
    cuentaNombres: Map<cuenta_id, String>
    refDisplayCache: Map<cuenta_id, String>
    config: {ancho, destino_default}
  }

  METODOS {
    async handleImprimirComanda(data: {pedido_id, items}): Promise<Response>
      FORMATEA comanda SEGUN ancho (58mm)
      ENVIA VIA MQTT a impresora destino
      PUBLICA impresion.comanda_generada
      RETORNA {status: 200}

    async onItemTicket(event: Event): Promise<Void>
      FORMATEA ticket DE pieza individual
      ENVIA a impresora SI device tiene impresora asignada
      PUBLICA impresion.ticket_pieza_generado

    async onCajaCerrada(event: Event): Void
      historial.clear()
      cuentaNombres.clear()
      refDisplayCache.clear()

    EVENTOS_PUBLISHES {
      'impresion.comanda_generada': {pedido_id, items_count}
      'impresion.ticket_venta_generado': {cuenta_id, total}
      'impresion.ticket_pieza_generado': {item_id, producto_id}
      'impresion.error': {error_code, error_detail}
    }

    EVENTOS_SUBSCRIBES {
      'cocina.item_ticket': onItemTicket
      'cuenta.creada': onCuentaCreada (cache ref_display)
      'caja.cerrada': onCajaCerrada (reset)
    }
  }
}

CLASE Ticket {
  ATRIBUTOS {
    id: String (UUID)
    tipo: String (comanda|venta|pieza)
    contenido: String (formato ESC/POS)
    destino: String (impresora name)
    timestamp: String (ISO)
    estado: String (enviado|impreso|error)
  }
}
```

### 13-14. RECETAS, ESCANDALLO, VIABILIDAD, TECNICAS, MENU-GENERATOR, COCINA-POC

Módulos de master data + analytics + generación. Contracts heredan BaseModule. Master data (recetas, tecnicas) son fuentes consulta. Menu-generator orquesta IA. Escandallo/viabilidad análisis sin transporte.

---

## MÓDULOS BLUEPRINT-DRIVEN (11)

Registran manifest en ModuleRegistry SIN instancia. No tienen index.js. 6 operaciones por blueprint definidas en architecture/decisiones/_blueprints/*.blueprint.json. Persistencia por proyecto EN `data/projects/{slug}/`.

### carta-design (v1.1.0) — Diseños HTML de Cartas Impresas
### carta-digital (v1.1.0) — Backoffice PWA Pública
### carta-manager (v3.0.0) — Manager Central de Cartas (CRUD)
### cuentas-canales (v1.0.0) — Integración Delivery (Glovo, Llevadoo, etc)
### cocina-poc (v1.0.0) — POC Mínimo de Cocina
### cartas-digitales... (6+ más)

---

## PATRONES OOP INTEGRADOS

```
PATRON Observer {
  USADO_EN: [EventBus, EventEmitter, HookManager]
  PROPOSITO: Desacople productor-consumidor

PATRON Factory {
  USADO_EN: [EventEnvelope.create(), Cobro.new(), Cuenta.new(), Item.new()]

PATRON State Machine {
  USADO_EN: [Cuenta: pendiente → con_pedido → en_preparacion → listo → entregado → para_cobrar → cobrado]

PATRON Command {
  USADO_EN: [UI handlers: domain.action DELEGACIÓN]

PATRON Cache {
  USADO_EN: [productosCache, categoriasCache, ingredientesCache, tarifasConfigPerProject per-project]

PATRON Debounce {
  USADO_EN: [_guardarBuffers() 1s, _saveTurno() 1s]

PATRON Atomic Writes {
  USADO_EN: [.tmp + rename PARA JSON persistence]

PATRON Multi-Tenant {
  USADO_EN: [ProductosModule, CategoriasModule, IngredientesModule per project_id]
```

---

## PROJECT-TYPE: pizzepos

```json
{
  "id": "pizzepos",
  "label": "PizzePOS",
  "description": "Comandero, cocina y cobros",
  "dependencies": [],
  "initialDirs": [
    "storage/pizzepos/cartas",
    "storage/pizzepos/ingredientes",
    "storage/pizzepos/programacion"
  ],
  "initialConfig": {
    "pizzepos": { "enabled": true }
  }
}
```
