---
id: pizzepos/managers-y-blueprints
dominio: pizzepos
resumen: Managers de dominio pizzepos (cuentas, productos, categorías, cobros, pedidos, cocina, recetas, ingredientes, variaciones, escandallo, viabilidad, carta-digital, menu-generator) + blueprint drivers.
fuentes:
  - modules/pizzepos/**
  - blueprints/**
verificado: 2026-07-12
---

# Módulos Pizzepos y Blueprints

## PIZZEPOS - CORE MODULES

### CUENTAS MANAGER

```
INTERFAZ CuentasContract {
  createCuenta(data: {nombre, cliente_id, estado?, mesa?}): Promise<{cuenta_id, ...}>
  updateCuenta(cuenta_id: String, updates: Object): Promise<Cuenta>
  getCuenta(cuenta_id: String): Promise<Cuenta>
  listCuentas(filters?: Object): Promise<Array<Cuenta>>
  closeCuenta(cuenta_id: String): Promise<Void>
  addPedidoToCuenta(cuenta_id: String, productos: Array): Promise<Pedido>
  getPedidosCuenta(cuenta_id: String): Promise<Array<Pedido>>
  removePedidoFromCuenta(cuenta_id: String, pedido_id: String): Promise<Void>
  calcularTotal(cuenta_id: String): Promise<{subtotal, impuestos, descuento, total}>
  aplicarDescuento(cuenta_id: String, descuento: Number): Promise<Void>
  generateCobro(cuenta_id: String, metodo: String): Promise<Cobro>
  listCobros(cuenta_id: String): Promise<Array<Cobro>>
}

CLASE CuentasManager IMPLEMENTA CuentasContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    uiHandler: UIRequestHandler
    cuentasStore: Map<cuenta_id, Cuenta>
    pedidosStore: Map<cuenta_id, Array<Pedido>>
    productosCache: Map<producto_id, Producto>
    productosManager: ProductosManager
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createCuenta(data: {nombre, cliente_id, estado?, mesa?}): Promise<{cuenta_id, ...}>
      GENERA cuenta_id (UUID)
      CREA Cuenta {cuenta_id, nombre, cliente_id, mesa, estado: 'abierta', created_at, updated_at, total: 0}
      GUARDA EN cuentasStore
      PERSISTE EN persistencia-comandero
      EMITE cuenta.created {cuenta_id, nombre, mesa}
      RETORNA cuenta

    async updateCuenta(cuenta_id: String, updates: Object): Promise<Cuenta>
      VALIDA cuenta existe
      MERGES updates
      SETEA updated_at = now()
      GUARDA EN cuentasStore
      PERSISTE
      EMITE cuenta.updated {cuenta_id, updates}
      RETORNA cuenta

    async getCuenta(cuenta_id: String): Promise<Cuenta>
      BUSCA EN cuentasStore
      SI no existe: LANZA CuentaNotFoundError
      RETORNA cuenta

    async listCuentas(filters?: Object): Promise<Array<Cuenta>>
      FILTRA cuentasStore (estado, mesa, cliente_id)
      RETORNA Array ordenado

    async closeCuenta(cuenta_id: String): Promise<Void>
      VALIDA cuenta existe
      SETEA estado = 'cerrada'
      CALCULA total final
      PERSISTE
      EMITE cuenta.closed {cuenta_id, total}

    async addPedidoToCuenta(cuenta_id: String, productos: Array): Promise<Pedido>
      VALIDA cuenta existe
      GENERA pedido_id (UUID)
      PARA cada producto: RESUELVE via productosManager
      CREA Pedido {pedido_id, cuenta_id, productos: [], estado: 'pendiente', created_at, total}
      CALCULA total POR cada producto
      AGREGA a pedidosStore[cuenta_id]
      PERSISTE
      EMITE pedido.created {pedido_id, cuenta_id, producto_count}
      RETORNA pedido

    async getPedidosCuenta(cuenta_id: String): Promise<Array<Pedido>>
      RETORNA pedidosStore[cuenta_id] O []

    async removePedidoFromCuenta(cuenta_id: String, pedido_id: String): Promise<Void>
      BUSCA pedido EN pedidosStore[cuenta_id]
      SI no existe: LANZA PedidoNotFoundError
      ELIMINA DE array
      PERSISTE
      EMITE pedido.removed {pedido_id, cuenta_id}

    async calcularTotal(cuenta_id: String): Promise<{subtotal, impuestos, descuento, total}>
      OBTIENE cuenta + pedidos
      SUMA subtotal POR productos
      CALCULA impuestos (IVA por producto)
      APLICA descuento SI exists
      RETORNA {subtotal, impuestos, descuento, total}

    async aplicarDescuento(cuenta_id: String, descuento: Number): Promise<Void>
      VALIDA descuento >= 0 Y <= 100
      SETEA cuenta.descuento = descuento
      PERSISTE
      EMITE descuento.applied {cuenta_id, descuento}

    async generateCobro(cuenta_id: String, metodo: String): Promise<Cobro>
      VALIDA metodo EN ['efectivo', 'tarjeta', 'transferencia']
      OBTIENE total final
      CREA Cobro {cobro_id: UUID, cuenta_id, metodo, monto: total, estado: 'pendiente', created_at}
      GUARDA EN cobrosManager
      EMITE cobro.created {cobro_id, cuenta_id, metodo, monto}
      RETORNA cobro

    async listCobros(cuenta_id: String): Promise<Array<Cobro>>
      DELEGA a cobrosManager.listCobros(cuenta_id)

    async onLoad(moduleContext: Object): Promise<Void>
      CARGA productosManager FROM moduleRegistry
      REGISTRA UI handlers
      SUSCRIBE A producto.updated
      LOG "cuentas.onLoad"
  }

  EVENTO {
    cuenta.created: {cuenta_id, nombre, mesa, created_at}
    cuenta.updated: {cuenta_id, updates}
    cuenta.closed: {cuenta_id, total}
    pedido.created: {pedido_id, cuenta_id, producto_count}
    pedido.removed: {pedido_id, cuenta_id}
    descuento.applied: {cuenta_id, descuento}
    cobro.created: {cobro_id, cuenta_id, metodo, monto}
  }
}

CLASE Cuenta {
  ATRIBUTOS {
    cuenta_id: String
    nombre: String
    cliente_id: String (optional)
    mesa: String|Number (optional)
    estado: String ('abierta'|'cerrada'|'pagada')
    descuento: Number (default 0)
    total: Number
    created_at: Number
    updated_at: Number
  }
}

CLASE Pedido {
  ATRIBUTOS {
    pedido_id: String
    cuenta_id: String
    productos: Array<{producto_id, nombre, cantidad, precio_unitario, subtotal}>
    estado: String ('pendiente'|'entregado'|'cancelado')
    total: Number
    created_at: Number
    updated_at: Number
  }
}
```

### PRODUCTOS MANAGER

```
INTERFAZ ProductosContract {
  createProducto(data: {nombre, descripcion, precio, categoria_id, iva?, imagen?}): Promise<{producto_id, ...}>
  getProducto(producto_id: String): Promise<Producto>
  listProductos(filters?: Object): Promise<Array<Producto>>
  updateProducto(producto_id: String, updates: Object): Promise<Producto>
  deleteProducto(producto_id: String): Promise<Void>
  getProductosByCategoria(categoria_id: String): Promise<Array<Producto>>
  searchProductos(query: String): Promise<Array<Producto>>
}

CLASE ProductosManager IMPLEMENTA ProductosContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    uiHandler: UIRequestHandler
    productosStore: Map<producto_id, Producto>
    categoriasManager: CategoriasManager
    searchIndex: Map<searchKey, Array<producto_id>>
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createProducto(data: {nombre, descripcion, precio, categoria_id, iva?, imagen?}): Promise<{producto_id, ...}>
      VALIDA nombre, precio
      VALIDA categoria_id existe
      GENERA producto_id (UUID)
      CREA Producto {producto_id, nombre, descripcion, precio, categoria_id, iva: iva || 0.21, imagen, created_at}
      GUARDA EN productosStore
      ACTUALIZA searchIndex
      PERSISTE
      EMITE producto.created {producto_id, nombre, precio}
      RETORNA producto

    async getProducto(producto_id: String): Promise<Producto>
      BUSCA EN productosStore
      SI no existe: LANZA ProductoNotFoundError
      RETORNA producto

    async listProductos(filters?: Object): Promise<Array<Producto>>
      FILTRA productosStore (categoria, nombre, precio_range)
      RETORNA Array

    async updateProducto(producto_id: String, updates: Object): Promise<Producto>
      VALIDA producto existe
      MERGES updates
      PERSISTE
      ACTUALIZA searchIndex
      EMITE producto.updated {producto_id}
      RETORNA producto

    async deleteProducto(producto_id: String): Promise<Void>
      VALIDA producto NO en pedidos activos
      ELIMINA DE productosStore
      ELIMINA DE searchIndex
      PERSISTE
      EMITE producto.deleted {producto_id}

    async getProductosByCategoria(categoria_id: String): Promise<Array<Producto>>
      FILTRA productosStore POR categoria_id
      RETORNA Array

    async searchProductos(query: String): Promise<Array<Producto>>
      BUSCA EN searchIndex (fuzzy match)
      RETORNA top-K resultados

    async onLoad(moduleContext: Object): Promise<Void>
      CARGA categoriasManager FROM moduleRegistry
      REGISTRA UI handlers
      CARGA productosStore FROM persistencia
      CONSTRUYE searchIndex
      LOG "productos.onLoad"
  }

  EVENTO {
    producto.created: {producto_id, nombre, precio}
    producto.updated: {producto_id, updates}
    producto.deleted: {producto_id}
  }
}

CLASE Producto {
  ATRIBUTOS {
    producto_id: String
    nombre: String
    descripcion: String
    precio: Number
    categoria_id: String
    iva: Number (default 0.21)
    imagen: String (URL|base64)
    created_at: Number
    updated_at: Number
  }
}
```

### CATEGORIAS MANAGER

```
INTERFAZ CategoriasContract {
  createCategoria(data: {nombre, descripcion?, orden?, icono?}): Promise<{categoria_id, ...}>
  getCategoria(categoria_id: String): Promise<Categoria>
  listCategorias(filters?: Object): Promise<Array<Categoria>>
  updateCategoria(categoria_id: String, updates: Object): Promise<Categoria>
  deleteCategoria(categoria_id: String): Promise<Void>
  reorderCategorias(orden: Array<categoria_id>): Promise<Void>
}

CLASE CategoriasManager IMPLEMENTA CategoriasContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    categoriasStore: Map<categoria_id, Categoria>
    orden: Array<categoria_id>
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createCategoria(data: {nombre, descripcion?, orden?, icono?}): Promise<{categoria_id, ...}>
      GENERA categoria_id (UUID)
      CREA Categoria {categoria_id, nombre, descripcion, orden: orden || 999, icono, created_at}
      GUARDA EN categoriasStore
      AGREGA a orden array
      PERSISTE
      EMITE categoria.created {categoria_id, nombre}
      RETORNA categoria

    async getCategoria(categoria_id: String): Promise<Categoria>
      BUSCA EN categoriasStore
      RETORNA categoria

    async listCategorias(filters?: Object): Promise<Array<Categoria>>
      RETORNA categoriasStore ordenado POR orden

    async updateCategoria(categoria_id: String, updates: Object): Promise<Categoria>
      VALIDA categoria existe
      MERGES updates
      PERSISTE
      EMITE categoria.updated {categoria_id}
      RETORNA categoria

    async deleteCategoria(categoria_id: String): Promise<Void>
      VALIDA NO hay productos CON esta categoria
      ELIMINA DE categoriasStore
      ELIMINA DE orden array
      PERSISTE
      EMITE categoria.deleted {categoria_id}

    async reorderCategorias(orden: Array<categoria_id>): Promise<Void>
      VALIDA orden contiene todas las categorias
      SETEA this.orden = orden
      PERSISTE
      EMITE categorias.reordered {orden}

    async onLoad(moduleContext: Object): Promise<Void>
      CARGA categoriasStore FROM persistencia
      CARGA orden array
      REGISTRA UI handlers
      LOG "categorias.onLoad"
  }

  EVENTO {
    categoria.created: {categoria_id, nombre}
    categoria.updated: {categoria_id}
    categoria.deleted: {categoria_id}
    categorias.reordered: {orden}
  }
}

CLASE Categoria {
  ATRIBUTOS {
    categoria_id: String
    nombre: String
    descripcion: String (optional)
    orden: Number
    icono: String (optional emoji|URL)
    created_at: Number
    updated_at: Number
  }
}
```

### COBROS MANAGER

```
INTERFAZ CobrosContract {
  createCobro(cuenta_id: String, metodo: String, monto?: Number): Promise<Cobro>
  getCobro(cobro_id: String): Promise<Cobro>
  updateEstadoCobro(cobro_id: String, estado: String): Promise<Cobro>
  listCobros(filters?: Object): Promise<Array<Cobro>>
  calculateCobrosTotal(fecha_inicio?: Number, fecha_fin?: Number): Promise<{total, por_metodo}>
  generateReporte(fecha: Date): Promise<Reporte>
}

CLASE CobrosManager IMPLEMENTA CobrosContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    cobrosStore: Map<cobro_id, Cobro>
    cuentasManager: CuentasManager
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createCobro(cuenta_id: String, metodo: String, monto?: Number): Promise<Cobro>
      VALIDA cuenta_id existe
      VALIDA metodo EN ['efectivo', 'tarjeta', 'transferencia']
      GENERA cobro_id (UUID)
      OBTIENE monto = monto || cuenta.total
      CREA Cobro {cobro_id, cuenta_id, metodo, monto, estado: 'pendiente', created_at}
      GUARDA EN cobrosStore
      PERSISTE
      EMITE cobro.created {cobro_id, cuenta_id, metodo, monto}
      RETORNA cobro

    async getCobro(cobro_id: String): Promise<Cobro>
      BUSCA EN cobrosStore
      RETORNA cobro

    async updateEstadoCobro(cobro_id: String, estado: String): Promise<Cobro>
      VALIDA cobro existe
      VALIDA estado EN ['pendiente', 'completado', 'cancelado']
      SETEA cobro.estado = estado
      PERSISTE
      EMITE cobro.estado_updated {cobro_id, estado}
      RETORNA cobro

    async listCobros(filters?: Object): Promise<Array<Cobro>>
      FILTRA cobrosStore (estado, metodo, cuenta_id, fecha_range)
      RETORNA Array

    async calculateCobrosTotal(fecha_inicio?: Number, fecha_fin?: Number): Promise<{total, por_metodo}>
      FILTRA cobros POR fecha_range
      SUMA total
      AGRUPA POR metodo
      RETORNA {total, por_metodo: {efectivo, tarjeta, transferencia}}

    async generateReporte(fecha: Date): Promise<Reporte>
      FILTRA cobros DEL día fecha
      CALCULA totales, breakdown por metodo
      CREA Reporte {fecha, total, por_metodo, count_cobros}
      EMITE reporte.generado {fecha, total}
      RETORNA reporte

    async onLoad(moduleContext: Object): Promise<Void>
      CARGA cuentasManager FROM moduleRegistry
      REGISTRA UI handlers
      LOG "cobros.onLoad"
  }

  EVENTO {
    cobro.created: {cobro_id, cuenta_id, metodo, monto}
    cobro.estado_updated: {cobro_id, estado}
    reporte.generado: {fecha, total}
  }
}

CLASE Cobro {
  ATRIBUTOS {
    cobro_id: String
    cuenta_id: String
    metodo: String ('efectivo'|'tarjeta'|'transferencia')
    monto: Number
    estado: String ('pendiente'|'completado'|'cancelado')
    created_at: Number
    updated_at: Number
  }
}
```

### PEDIDOS MANAGER

```
INTERFAZ PedidosContract {
  createPedido(cuenta_id: String, productos: Array): Promise<Pedido>
  getPedido(pedido_id: String): Promise<Pedido>
  updateEstadoPedido(pedido_id: String, estado: String): Promise<Pedido>
  listPedidos(filters?: Object): Promise<Array<Pedido>>
  calculatePedidoTotal(pedido_id: String): Promise<Number>
  addProductoToPedido(pedido_id: String, producto_id: String, cantidad: Number): Promise<Void>
}

CLASE PedidosManager IMPLEMENTA PedidosContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    pedidosStore: Map<pedido_id, Pedido>
    productosManager: ProductosManager
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createPedido(cuenta_id: String, productos: Array): Promise<Pedido>
      VALIDA productos array NOT empty
      GENERA pedido_id (UUID)
      PARA cada producto: RESUELVE details via productosManager
      CREA Pedido {pedido_id, cuenta_id, productos: [], total: 0, estado: 'pendiente', created_at}
      CALCULA total
      GUARDA EN pedidosStore
      PERSISTE
      EMITE pedido.created {pedido_id, cuenta_id}
      RETORNA pedido

    async getPedido(pedido_id: String): Promise<Pedido>
      BUSCA EN pedidosStore
      RETORNA pedido

    async updateEstadoPedido(pedido_id: String, estado: String): Promise<Pedido>
      VALIDA estado EN ['pendiente', 'entregado', 'cancelado']
      SETEA pedido.estado = estado
      PERSISTE
      EMITE pedido.estado_updated {pedido_id, estado}
      RETORNA pedido

    async listPedidos(filters?: Object): Promise<Array<Pedido>>
      FILTRA pedidosStore
      RETORNA Array

    async calculatePedidoTotal(pedido_id: String): Promise<Number>
      OBTIENE pedido
      SUMA total POR productos (cantidad * precio)
      RETORNA total

    async addProductoToPedido(pedido_id: String, producto_id: String, cantidad: Number): Promise<Void>
      OBTIENE pedido Y producto
      AGREGA a pedido.productos
      RECALCULA total
      PERSISTE
      EMITE producto.added_to_pedido {pedido_id, producto_id, cantidad}

    async onLoad(moduleContext: Object): Promise<Void>
      CARGA productosManager FROM moduleRegistry
      REGISTRA UI handlers
      LOG "pedidos.onLoad"
  }

  EVENTO {
    pedido.created: {pedido_id, cuenta_id}
    pedido.estado_updated: {pedido_id, estado}
    producto.added_to_pedido: {pedido_id, producto_id, cantidad}
  }
}
```

### COCINA MANAGER

```
INTERFAZ CocinaContract {
  sendPedidoToKitchen(pedido_id: String): Promise<Void>
  getPedidosEnCocina(): Promise<Array<Pedido>>
  updateEstadoPedidoCocina(pedido_id: String, estado: String): Promise<Void>
  marcaComoListo(pedido_id: String): Promise<Void>
  generateCocinaReport(): Promise<Report>
}

CLASE CocinaManager IMPLEMENTA CocinaContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    pedidosEnCocina: Map<pedido_id, PedidoKitchen>
    pedidosManager: PedidosManager
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async sendPedidoToKitchen(pedido_id: String): Promise<Void>
      OBTIENE pedido
      CREA PedidoKitchen {pedido_id, received_at: now(), estado: 'en_cocina', items: pedido.productos}
      GUARDA EN pedidosEnCocina
      EMITE pedido.sent_to_kitchen {pedido_id, items_count: pedido.productos.length}

    async getPedidosEnCocina(): Promise<Array<Pedido>>
      RETORNA pedidosEnCocina.values() ordenado POR received_at

    async updateEstadoPedidoCocina(pedido_id: String, estado: String): Promise<Void>
      VALIDA estado EN ['en_cocina', 'completado', 'listo']
      SETEA pedidoKitchen.estado = estado
      EMITE cocina.estado_updated {pedido_id, estado}

    async marcaComoListo(pedido_id: String): Promise<Void>
      OBTIENE pedidoKitchen
      SETEA estado = 'listo'
      CALCULA tiempo_cocina = now() - received_at
      EMITE pedido.ready {pedido_id, tiempo_cocina}
      ELIMINA DE pedidosEnCocina (archive)

    async generateCocinaReport(): Promise<Report>
      CALCULA stats: pedidos_completados, tiempo_promedio, items_por_pedido
      RETORNA {fecha: now(), stats}

    async onLoad(moduleContext: Object): Promise<Void>
      SUSCRIBE A pedido.created
      REGISTRA UI handlers PARA kitchen display system
      LOG "cocina.onLoad"
  }

  EVENTO {
    pedido.sent_to_kitchen: {pedido_id, items_count}
    cocina.estado_updated: {pedido_id, estado}
    pedido.ready: {pedido_id, tiempo_cocina}
  }
}

CLASE PedidoKitchen {
  ATRIBUTOS {
    pedido_id: String
    estado: String ('en_cocina'|'completado'|'listo')
    items: Array<{nombre, cantidad, preparacion_notes}>
    received_at: Number
    completed_at: Number
  }
}
```

### RECETAS MANAGER

```
INTERFAZ RecetasContract {
  createReceta(data: {nombre, ingredientes, pasos, tiempo_preparacion, notas?}): Promise<Receta>
  getReceta(receta_id: String): Promise<Receta>
  listRecetas(filters?: Object): Promise<Array<Receta>>
  updateReceta(receta_id: String, updates: Object): Promise<Receta>
  deleteReceta(receta_id: String): Promise<Void>
  getIngredientesReceta(receta_id: String): Promise<Array<Ingrediente>>
}

CLASE RecetasManager IMPLEMENTA RecetasContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    recetasStore: Map<receta_id, Receta>
    ingredientesManager: IngredientesManager
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createReceta(data: {nombre, ingredientes, pasos, tiempo_preparacion, notas?}): Promise<Receta>
      VALIDA nombre, ingredientes NOT empty
      GENERA receta_id (UUID)
      CREA Receta {receta_id, nombre, ingredientes: [], pasos: data.pasos, tiempo_preparacion, notas, created_at}
      PARA cada ingrediente: RESUELVE via ingredientesManager
      AGREGA a receta.ingredientes
      GUARDA EN recetasStore
      PERSISTE
      EMITE receta.created {receta_id, nombre}
      RETORNA receta

    async getReceta(receta_id: String): Promise<Receta>
      BUSCA EN recetasStore
      RETORNA receta

    async listRecetas(filters?: Object): Promise<Array<Receta>>
      FILTRA recetasStore
      RETORNA Array

    async updateReceta(receta_id: String, updates: Object): Promise<Receta>
      VALIDA receta existe
      MERGES updates
      PERSISTE
      EMITE receta.updated {receta_id}
      RETORNA receta

    async deleteReceta(receta_id: String): Promise<Void>
      VALIDA NO hay productos usando esta receta
      ELIMINA DE recetasStore
      PERSISTE
      EMITE receta.deleted {receta_id}

    async getIngredientesReceta(receta_id: String): Promise<Array<Ingrediente>>
      OBTIENE receta
      RESUELVE ingredientes via ingredientesManager
      RETORNA Array

    async onLoad(moduleContext: Object): Promise<Void>
      CARGA ingredientesManager FROM moduleRegistry
      REGISTRA UI handlers
      LOG "recetas.onLoad"
  }

  EVENTO {
    receta.created: {receta_id, nombre}
    receta.updated: {receta_id}
    receta.deleted: {receta_id}
  }
}

CLASE Receta {
  ATRIBUTOS {
    receta_id: String
    nombre: String
    ingredientes: Array<{ingrediente_id, nombre, cantidad, unidad}>
    pasos: Array<String>
    tiempo_preparacion: Number (minutos)
    notas: String (optional)
    created_at: Number
    updated_at: Number
  }
}
```

### INGREDIENTES MANAGER

```
INTERFAZ IngredientesContract {
  createIngrediente(data: {nombre, unidad, precio_unitario, stock?, categoria?}): Promise<Ingrediente>
  getIngrediente(ingrediente_id: String): Promise<Ingrediente>
  listIngredientes(filters?: Object): Promise<Array<Ingrediente>>
  updateIngrediente(ingrediente_id: String, updates: Object): Promise<Ingrediente>
  deleteIngrediente(ingrediente_id: String): Promise<Void>
  updateStock(ingrediente_id: String, cantidad: Number): Promise<Void>
  getStockBajo(threshold?: Number): Promise<Array<Ingrediente>>
}

CLASE IngredientesManager IMPLEMENTA IngredientesContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    ingredientesStore: Map<ingrediente_id, Ingrediente>
    stockThreshold: Number (default 10)
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createIngrediente(data: {nombre, unidad, precio_unitario, stock?, categoria?}): Promise<Ingrediente>
      GENERA ingrediente_id (UUID)
      CREA Ingrediente {ingrediente_id, nombre, unidad, precio_unitario, stock: stock || 0, categoria, created_at}
      GUARDA EN ingredientesStore
      PERSISTE
      EMITE ingrediente.created {ingrediente_id, nombre}
      RETORNA ingrediente

    async getIngrediente(ingrediente_id: String): Promise<Ingrediente>
      BUSCA EN ingredientesStore
      RETORNA ingrediente

    async listIngredientes(filters?: Object): Promise<Array<Ingrediente>>
      FILTRA ingredientesStore
      RETORNA Array

    async updateIngrediente(ingrediente_id: String, updates: Object): Promise<Ingrediente>
      VALIDA ingrediente existe
      MERGES updates
      PERSISTE
      EMITE ingrediente.updated {ingrediente_id}
      RETORNA ingrediente

    async deleteIngrediente(ingrediente_id: String): Promise<Void>
      ELIMINA DE ingredientesStore
      PERSISTE
      EMITE ingrediente.deleted {ingrediente_id}

    async updateStock(ingrediente_id: String, cantidad: Number): Promise<Void>
      OBTIENE ingrediente
      SETEA stock = stock + cantidad
      SI stock < stockThreshold: EMITE ingrediente.stock_bajo {ingrediente_id, stock}
      PERSISTE
      EMITE ingrediente.stock_updated {ingrediente_id, stock}

    async getStockBajo(threshold?: Number): Promise<Array<Ingrediente>>
      FILTRA ingredientes WHERE stock < (threshold || stockThreshold)
      RETORNA Array

    async onLoad(moduleContext: Object): Promise<Void>
      REGISTRA UI handlers
      LOG "ingredientes.onLoad"
  }

  EVENTO {
    ingrediente.created: {ingrediente_id, nombre}
    ingrediente.updated: {ingrediente_id}
    ingrediente.deleted: {ingrediente_id}
    ingrediente.stock_updated: {ingrediente_id, stock}
    ingrediente.stock_bajo: {ingrediente_id, stock}
  }
}

CLASE Ingrediente {
  ATRIBUTOS {
    ingrediente_id: String
    nombre: String
    unidad: String (kg, L, unidad, etc.)
    precio_unitario: Number
    stock: Number
    categoria: String (optional)
    created_at: Number
    updated_at: Number
  }
}
```

### VARIACIONES MANAGER

```
INTERFAZ VariacionesContract {
  createVariacion(data: {nombre, producto_id, opciones, precio_delta?}): Promise<Variacion>
  getVariacion(variacion_id: String): Promise<Variacion>
  listVariaciones(producto_id: String): Promise<Array<Variacion>>
  updateVariacion(variacion_id: String, updates: Object): Promise<Variacion>
  deleteVariacion(variacion_id: String): Promise<Void>
}

CLASE VariacionesManager IMPLEMENTA VariacionesContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    variacionesStore: Map<variacion_id, Variacion>
    productosManager: ProductosManager
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createVariacion(data: {nombre, producto_id, opciones, precio_delta?}): Promise<Variacion>
      VALIDA producto_id existe
      GENERA variacion_id (UUID)
      CREA Variacion {variacion_id, nombre, producto_id, opciones: [], precio_delta: precio_delta || 0, created_at}
      AGREGA opciones
      GUARDA EN variacionesStore
      PERSISTE
      EMITE variacion.created {variacion_id, producto_id}
      RETORNA variacion

    async getVariacion(variacion_id: String): Promise<Variacion>
      BUSCA EN variacionesStore
      RETORNA variacion

    async listVariaciones(producto_id: String): Promise<Array<Variacion>>
      FILTRA variacionesStore POR producto_id
      RETORNA Array

    async updateVariacion(variacion_id: String, updates: Object): Promise<Variacion>
      VALIDA variacion existe
      MERGES updates
      PERSISTE
      EMITE variacion.updated {variacion_id}
      RETORNA variacion

    async deleteVariacion(variacion_id: String): Promise<Void>
      ELIMINA DE variacionesStore
      PERSISTE
      EMITE variacion.deleted {variacion_id}

    async onLoad(moduleContext: Object): Promise<Void>
      CARGA productosManager FROM moduleRegistry
      REGISTRA UI handlers
      LOG "variaciones.onLoad"
  }

  EVENTO {
    variacion.created: {variacion_id, producto_id}
    variacion.updated: {variacion_id}
    variacion.deleted: {variacion_id}
  }
}

CLASE Variacion {
  ATRIBUTOS {
    variacion_id: String
    nombre: String
    producto_id: String
    opciones: Array<{nombre, descripcion, precio_delta?}>
    precio_delta: Number (default 0)
    created_at: Number
    updated_at: Number
  }
}
```

### ESCANDALLO MANAGER

```
INTERFAZ EscandalloContract {
  createEscandallo(data: {nombre, receta_id, cantidad_produccion}): Promise<Escandallo>
  getEscandallo(escandallo_id: String): Promise<Escandallo>
  listEscandallos(filters?: Object): Promise<Array<Escandallo>>
  calculateCostePorUnidad(escandallo_id: String, cantidad: Number): Promise<Number>
  updatePrecioFinal(escandallo_id: String, margen_ganancia: Number): Promise<Escandallo>
}

CLASE EscandalloManager IMPLEMENTA EscandalloContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    escandallosStore: Map<escandallo_id, Escandallo>
    recetasManager: RecetasManager
    ingredientesManager: IngredientesManager
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createEscandallo(data: {nombre, receta_id, cantidad_produccion}): Promise<Escandallo>
      GENERA escandallo_id (UUID)
      OBTIENE receta
      OBTIENE ingredientes + precios
      CALCULA costo_ingredientes = suma(ingrediente.precio_unitario * ingrediente.cantidad)
      CALCULA costo_unitario = costo_ingredientes / cantidad_produccion
      CREA Escandallo {escandallo_id, nombre, receta_id, costo_ingredientes, costo_unitario, precio_final: 0, created_at}
      GUARDA EN escandallosStore
      PERSISTE
      EMITE escandallo.created {escandallo_id, nombre, costo_unitario}
      RETORNA escandallo

    async getEscandallo(escandallo_id: String): Promise<Escandallo>
      BUSCA EN escandallosStore
      RETORNA escandallo

    async listEscandallos(filters?: Object): Promise<Array<Escandallo>>
      FILTRA escandallosStore
      RETORNA Array

    async calculateCostePorUnidad(escandallo_id: String, cantidad: Number): Promise<Number>
      OBTIENE escandallo
      RETORNA escandallo.costo_unitario * cantidad

    async updatePrecioFinal(escandallo_id: String, margen_ganancia: Number): Promise<Escandallo>
      OBTIENE escandallo
      CALCULA precio_final = costo_unitario * (1 + margen_ganancia / 100)
      SETEA escandallo.precio_final = precio_final
      PERSISTE
      EMITE escandallo.precio_updated {escandallo_id, precio_final}
      RETORNA escandallo

    async onLoad(moduleContext: Object): Promise<Void>
      CARGA recetasManager, ingredientesManager FROM moduleRegistry
      REGISTRA UI handlers
      LOG "escandallo.onLoad"
  }

  EVENTO {
    escandallo.created: {escandallo_id, nombre, costo_unitario}
    escandallo.precio_updated: {escandallo_id, precio_final}
  }
}

CLASE Escandallo {
  ATRIBUTOS {
    escandallo_id: String
    nombre: String
    receta_id: String
    costo_ingredientes: Number
    costo_unitario: Number
    precio_final: Number
    margen_ganancia: Number
    created_at: Number
    updated_at: Number
  }
}
```

### VIABILIDAD MANAGER

```
INTERFAZ ViabilidadContract {
  createEstudio(data: {nombre, proyecto_id, escenarios: Array}): Promise<EstudioViabilidad>
  getEstudio(estudio_id: String): Promise<EstudioViabilidad>
  calculateROI(estudio_id: String, escenario: String): Promise<{roi, payback_period}>
  generateReporte(estudio_id: String): Promise<Reporte>
}

CLASE ViabilidadManager IMPLEMENTA ViabilidadContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    estudiosStore: Map<estudio_id, EstudioViabilidad>
    aiGateway: AIGateway (optional)
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createEstudio(data: {nombre, proyecto_id, escenarios: Array}): Promise<EstudioViabilidad>
      GENERA estudio_id (UUID)
      CREA EstudioViabilidad {estudio_id, nombre, proyecto_id, escenarios: [], created_at}
      AGREGA escenarios
      PARA cada escenario: CALCULA financials
      GUARDA EN estudiosStore
      PERSISTE
      EMITE estudio.created {estudio_id, nombre}
      RETORNA estudio

    async getEstudio(estudio_id: String): Promise<EstudioViabilidad>
      BUSCA EN estudiosStore
      RETORNA estudio

    async calculateROI(estudio_id: String, escenario: String): Promise<{roi, payback_period}>
      OBTIENE estudio + escenario
      CALCULA inversion_inicial
      CALCULA flujo_caja_anual
      CALCULA roi = (flujo_caja / inversion) * 100
      CALCULA payback_period = inversion / flujo_caja_anual
      RETORNA {roi, payback_period}

    async generateReporte(estudio_id: String): Promise<Reporte>
      OBTIENE estudio
      PARA cada escenario: CALCULA metrics (roi, payback, vpn)
      CREA Reporte {fecha: now(), estudio_id, resumen: {}}
      EMITE reporte.generado {estudio_id}
      RETORNA reporte

    async onLoad(moduleContext: Object): Promise<Void>
      REGISTRA UI handlers
      LOG "viabilidad.onLoad"
  }

  EVENTO {
    estudio.created: {estudio_id, nombre}
    reporte.generado: {estudio_id}
  }
}

CLASE EstudioViabilidad {
  ATRIBUTOS {
    estudio_id: String
    nombre: String
    proyecto_id: String
    escenarios: Array<{nombre, inversion_inicial, flujo_caja_anual, roi, payback_period}>
    created_at: Number
    updated_at: Number
  }
}
```

### CARTA-DIGITAL (PROYECTOR del canal digital)

> v2.x REESCRIBIÓ carta-digital de "manager con snapshots" a **PROYECTOR**: gemelo de
> `productos` pero para la carta pública. NO compone ni guarda `CartaDigital`: proyecta
> la carta pública AL VUELO bebiendo de las fuentes reales → nunca se queda viejo. Lo
> ÚNICO que posee: el config del CANAL (dominio + opciones PWA) y el diseño (look de Enki).
> Híbrido: index.js es el REFLEJO (JS); carta-digital.blueprint.json es la mitad LLM (cajones).

```
INTERFAZ CartaDigitalContract {                 // ui_handlers (RPC del bus / frontend)
  handleGetCartaPublica(project_id): Proyeccion // proyecta al vuelo (no persiste)
  handleGetConfig(project_id): Config           // dominio + opciones_visualizacion
  handleUpdateConfig(project_id, campos): Config // SOLO canal (branding/productos NO)
  handleGetDiseno(project_id): Diseno           // card_template + tema_css de Enki
  handlePreview(project_id): { html }           // PWA suelta (WhatsApp) para iframe, no escribe
  handlePublicar(project_id, slug?): DeployInfo // deploy REAL: escribe el bundle estático
}

CLASE CartaDigitalModule EXTIENDE BaseModule {  // PROYECTOR, no manager-con-store
  ATRIBUTOS {
    version: String                             // DERIVADA de module.json (fuente única)
    mappingCanalesPerProject: Map<project_id, {canal→carta_id}>  // ÚNICO estado (de tarifas)
    activos: Map<project_id, {name, slug}>      // proyectos vistos por project.activated
    ultimoActivo: project_id                    // DONDE escribe el fs (guard cross-project)
  }

  // BEBE de (RPC del bus — nunca toca fs de otros): NO posee nada de esto
  //   tarifas         → qué carta le toca al canal 'digital' (mapping, cacheado)
  //   carta-manager   → esa carta (carta.get)              [categorías/productos/precios]
  //   carta-marketing → el branding (get_perfil)           [nombre/lema/colores/logo/voz]
  //   contenido       → imágenes/descripción por producto  (contenido.get)
  //   productos       → catálogo de ingredientes 'extra'   (handleListIngredientes, canal digital)

  METODOS {
    // PROYECCIÓN pura (proyeccion.js): entra dato, sale dato. La misma FORMA para los
    // dos consumidores — el reflejo (bus) y el export-cli (disco).
    _proyectarPublica(project_id):
      [carta, marca, contenido, config] ← Promise.all(bebe_de…)
      SI !carta: RETORNA 404 (canal sin carta — revisa tarifas)
      RETORNA proyectarCartaPublica(carta, marca, contenido, config)
        // → { branding, categorias, productos, alergenos_leyenda (1169/2011), opciones }

    // DISEÑO con FRENO (skill blueprint-agentico): _checkDiseno exige el CONTRATO de slots
    //   {{id}} {{nombre}} {{precio}} {{alergenos}} {{add_label}} + hooks data-accion detalle/add.
    //   Doble cara: cartadigital.validar.request (loop del cajón, máx 3) Y guardar (gate 422
    //   inquebrantable). Sin precio = carta rota; sin alérgenos = ILEGAL (Reg. UE 1169/2011).

    // PUBLICAR = deploy estático REAL (_publicarBundle):
    //   1. GUARD cross-project (412): el fs escribe en ultimoActivo; si el objetivo no es
    //      ese, falla claro (no escribir la carta de un proyecto en otro).
    //   2. proyecta + aplica diseño + generateStaticHTML + copia imágenes a img/
    //   3. 2º FRENO (render real): render.verificar.request (Chromium) — best-effort, 422
    //      solo si pudo MIRAR (verificado && !ok). Promueve overflow_movil a BLOQUEO (PWA de móvil).
    //   4. auto-activa la feature `www` (project.ensure-feature) → symlink /<ns>/<slug>
    //   5. escribe el bundle (index.html+sw+manifest+icons+img/) en storage/www
    //      Caddy lo sirve estático en /<ns>/<slug>/ por el symlink. Estático: cada cambio → republicar.

    onLoad(core):
      SUSCRIBE tarifas.config.actualizada · carta.{actualizada,editada,borrada}
              · contenido.actualizado · marketing.perfil.actualizado
              · project.{activated,deactivated}
              · cartadigital.{validar,guardar_diseno,publicar}.request
  }

  EVENTO {                                       // topics REALES (dominio cartadigital)
    cartadigital.carta_publica.actualizada: {project_id}   // refresco para la PWA/frontend
    cartadigital.diseno.actualizada: {project_id}
    cartadigital.config.actualizada: {project_id}
    cartadigital.publicado: {project_id, slug, productos, imagenes}
  }
}
```

### MENU-GENERATOR (generador de catálogo · híbrido)

```
INTERFAZ MenuGeneratorContract {
  onImportRequest(e): menu.import.response         // REFLEJO: import por referencia
  // (mitad fuzzy: op `generar` del blueprint — estructura texto libre/dictado)
}

> menu-generator (v11.2.0) NO renderiza menús ni exporta PDF/DOCX/PNG: es un
> GENERADOR DE CATÁLOGO. De cualquier input textual (texto/dictado en lenguaje libre,
> o JSON ya estructurado) produce una carta en shape canónico carta-pizzepos y la
> ENTREGA al custodio (carta-manager). Sin OCR, sin agente, sin enriquecimiento — da
> forma a lo que el material trae y lo entrega limpio. HÍBRIDO: el REFLEJO (index.js)
> estructura el catálogo YA formado (determinista); el BLUEPRINT (LLM de página)
> estructura el texto libre dictado. Persistencia delegada en carta-manager.

CLASE MenuGeneratorReflejo EXTIENDE ModuloHibridoReflejo {   // reflejo-1.1.0
  version: 'reflejo-1.1.0'

  // IMPORT POR REFERENCIA: el LLM solo dice "importa el adjunto" (cero tokens de
  // producto). Resuelve el fallo del blueprint-only: emitir 38+ productos en una
  // respuesta o mandaba vacío (carta-manager borraba) o alucinaba "✅ completas".
  async _import(input):
    VALIDA project_id + nombre + fuente (attachments[].path / material_path)
    // 1. LEER por su puerta: fs.read del adjunto (path real del storage del proyecto)
    fuente ← _cargarFuente(project_id, rutas)           // JSON directo o extraído de texto libre
    SI !fuente: RETORNA 404 RESOURCE_NOT_FOUND
    // 2. IDENTIDAD: reusa la carta general (en_servicio/única) o id determinista
    carta_id ← _resolverCartaId(project_id, nombre)
    // 3. PROYECTAR a shape canónico (réplica de la ley de carta-manager, NO inventa):
    //    ingredientes_base+precio_extra → variaciones/mitad · tipo/grupo → familia canónica ·
    //    deriva Opciones (QUITAR propios + ELEGIR_VARIOS la paleta de su categoría)
    carta ← _proyectar(fuente, nombre, carta_id)
    SI carta.productos == 0: RETORNA 422 UPSTREAM_INVALID_RESPONSE
    // 4. GUARDAR una vez, atómico, VERIFICADO por el response correlado
    RETORNA await _rpc('carta.save.request', { project_id, carta, ... })

  onImportRequest(e): _atender(e, 'import', 'menu.import.response', _import)
}

EVENTO {                                             // topics REALES
  menu.import.request / .response                    // el reflejo
  carta.generar.iniciada / .fallida                  // el blueprint (op generar)
  menu.generation.progress / .failed
  RPC → carta.save.request (custodio) · fs.read.request (leer adjunto)
}
```

---

## BLUEPRINTS

### PROJECT-TYPE BLUEPRINT DRIVER

```
INTERFAZ ProjectTypeBlueprintContract {
  manifest(): Promise<ProjectTypeManifest>
  generateProject(data: {name, type, config}): Promise<Project>
  getDefaultModules(type: String): Promise<Array<ModuleConfig>>
  getUILayout(type: String): Promise<UILayout>
}

CLASE ProjectTypeBlueprint IMPLEMENTA ProjectTypeBlueprintContract {
  ATRIBUTOS {
    blueprintsPath: String
    moduleRegistry: ModuleRegistry
    logger: Logger
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async manifest(): Promise<ProjectTypeManifest>
      LEE /blueprints/project-types/
      RETORNA {types: [{name: 'pizzepos', description, icon, default_modules}]}

    async generateProject(data: {name, type, config}): Promise<Project>
      VALIDA type existe
      OBTIENE default_modules PARA type
      CREA project {project_id: UUID, name, type, modules: default_modules, config}
      EMITE project.created.from_blueprint {project_id, type}
      RETORNA project

    async getDefaultModules(type: String): Promise<Array<ModuleConfig>>
      LEE blueprints/project-types/{type}.json
      RETORNA modules array

    async getUILayout(type: String): Promise<UILayout>
      LEE blueprints/project-types/{type}.json
      EXTRAE ui.layout
      RETORNA layout {routes, work_bar, system_bar}

    async onLoad(moduleContext: Object): Promise<Void>
      REGISTRA como blueprint driver
      LOG "project-type-blueprint.onLoad"
  }

  EVENTO {
    project.created.from_blueprint: {project_id, type}
  }
}

CLASE ProjectTypeManifest {
  ATRIBUTOS {
    types: Array<{
      name: String,
      description: String,
      icon: String,
      default_modules: Array<String>,
      ui: {routes: Array, work_bar: Array, system_bar: Array}
    }>
  }
}
```

### UI TEMPLATE BLUEPRINT DRIVER

```
INTERFAZ UITemplateBlueprintContract {
  listTemplates(): Promise<Array<UITemplate>>
  getTemplate(template_id: String): Promise<UITemplate>
  renderTemplate(template_id: String, data: Object): Promise<SvelteComponent>
  generateComponent(spec: ComponentSpec): Promise<String>
}

CLASE UITemplateBlueprint IMPLEMENTA UITemplateBlueprintContract {
  ATRIBUTOS {
    blueprintsPath: String
    logger: Logger
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async listTemplates(): Promise<Array<UITemplate>>
      LEE /blueprints/ui-templates/
      RETORNA templates array

    async getTemplate(template_id: String): Promise<UITemplate>
      LEE blueprints/ui-templates/{template_id}.json
      RETORNA template

    async renderTemplate(template_id: String, data: Object): Promise<SvelteComponent>
      OBTIENE template
      INTERPOLA data EN template.svelte
      RETORNA component code

    async generateComponent(spec: ComponentSpec): Promise<String>
      VALIDA spec CONTRA ui-component.schema.json
      GENERA Svelte component code
      RETORNA string

    async onLoad(moduleContext: Object): Promise<Void>
      REGISTRA como blueprint driver
      LOG "ui-template-blueprint.onLoad"
  }
}

CLASE UITemplate {
  ATRIBUTOS {
    template_id: String
    name: String
    description: String
    svelte: String (template code)
    props: Array<{name, type, required, default}>
    styles: String (CSS)
  }
}
```

### FORM SCHEMA BLUEPRINT DRIVER

```
INTERFAZ FormSchemaBlueprintContract {
  generateForm(schema: JSONSchema): Promise<SvelteForm>
  validateFormData(schema: JSONSchema, data: Object): Promise<ValidationResult>
}

CLASE FormSchemaBlueprint IMPLEMENTA FormSchemaBlueprintContract {
  ATRIBUTOS {
    logger: Logger
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async generateForm(schema: JSONSchema): Promise<SvelteForm>
      PARSEA schema
      GENERA Svelte form component
      CREA fields PARA cada property
      RETORNA component code

    async validateFormData(schema: JSONSchema, data: Object): Promise<ValidationResult>
      VALIDA data CONTRA schema
      RETORNA {valid: Boolean, errors?: []}

    async onLoad(moduleContext: Object): Promise<Void>
      REGISTRA como blueprint driver
      LOG "form-schema-blueprint.onLoad"
  }
}
```

---

## RELACIONES PIZZEPOS

```
cuentas ↔ pedidos ↔ productos
  │        │         │
  └────────┼─────────┤
           │         categorias
           │         ingredientes
           │         variaciones
           │
        cobros      cocina

recetas ← ingredientes
escandallo ← recetas

persistencia-comandero: persiste todas las stores
carta-digital ← tarifas, carta-manager, carta-marketing, contenido, productos (ingredientes), render-verificador
menu-generator ← carta-digital
comandero ← cuentas, pedidos
```
