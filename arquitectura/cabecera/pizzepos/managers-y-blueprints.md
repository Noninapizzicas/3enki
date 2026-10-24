---
id: pizzepos/managers-y-blueprints
dominio: pizzepos
resumen: Managers de dominio pizzepos (cuentas, productos, categorías, cobros, pedidos, cocina, recetas, ingredientes, variaciones, escandallo, viabilidad, carta-digital, menu-generator) + blueprint drivers.
fuentes:
  - modules/pizzepos/**
  - blueprints/**
verificado: 2026-10-24
---

# Módulos Pizzepos y Blueprints

## PIZZEPOS - CORE MODULES

> **La llave del proyecto en el POS es el SLUG (verificado en vivo 2026-10-24).** Las
> cuentas nacen, se filtran y se persisten por `project_id = slug`
> (`/data/projects/<slug>/`), no por el UUID de sesión. `ResolutorProyecto`
> (`modules/_shared/resolutor-proyecto.js`) traduce cualquier llave a slug con el mapa
> que publica `project-manager` en `project.list.response`; sin bus devuelve la llave
> tal cual. Antes, mesa (UUID) y llevar (slug) del mismo negocio vivían en dos carpetas
> y el comandero solo veía una mitad.

> **Alta de producto — la cadena canónica (verificada en vivo 2026-10-19).** La puerta
> del asistente es `productos.crear` / `productos.crear_categoria` (productos NO escribe:
> delega en carta-manager, que hace snapshot y sube version). Un alta enciende todo por
> eventos, sin cablear consumidores a mano:
>
> ```
> productos.crear → carta.add_product → carta-manager._mutar (version++, snapshot)
>   → carta.editada
>       ├─ productos.onCartaGenerada      → catalogo.actualizado → comandero + pedidos
>       │                                   (cache: nombre, precio, categoria, estaciones)
>       ├─ variaciones.onCartaActualizada  → reconfigura reglas del producto
>       └─ carta-digital._autoPublicar     → debounce → bundle re-horneado → web pública
>
> cocina: NO tiene catálogo propio — el producto llega dentro de
>         pedido.enviado_cocina (nombre, cantidad, variaciones, ingredientes_base).
> ```
>
> `producto.creado` es contrato LEGADO: nadie lo emite (v5 lo retiró); los consumidores
> (comandero, pedidos, variaciones) se refrescan por `carta.editada` + `catalogo.actualizado`.
>
> **Carta de CANAL (precio por canal, verificado en vivo 2026-10-19).** `tarifas` asigna
> `canal → carta_id` (`glovo`, `llevar`, `telefono`, `whatsapp`, `llevadoo`, `digital`, `mesa`);
> los canales sin carta propia caen a `general`. La carta de canal es una CARTA REAL (copia de la
> general con los precios finales escritos) que se guarda con `carta.save` y se registra con
> `tarifas.register_variant` + `tarifas.assign`. Regla de oro: **solo la carta general proyecta
> `catalogo.actualizado`** (`productos._esCartaGeneral`) — si una carta de canal lo emitiera, su
> precio sustituiría al de mostrador en el cache POS de todos los canales, porque comandero y
> pedidos cachean por `producto_id` sin mirar `menu_id`. El precio del canal se resuelve al cobrar:
> `tarifas(canal) → cartasProductosCache[carta_id] → precio` con fallback al base (producto que no
> esté en la carta del canal = precio general). **Comandero 3.5.0:** ese cache se hidrata por
> `carta.actualizada` (la carta viaja ENVUELTA en `{project_id, carta}` — leer `data.meta.id` daba
> `undefined` y el canal cobraba siempre precio base) y, al recibir `tarifas.config.actualizada`, con
> un `carta.get.request` por cada carta del mapping (`onCartaGetResponse`), para que tras un restart
> el canal no pierda su precio hasta que alguien toque la carta. Si la carta que responde es la
> **general**, además rellena `productosCache` (catálogo base): sin eso el POS cobraba 0 y nombraba
> el ítem con el `producto_id` tras un reinicio (v3.5.1). Comandero detecta el canal por el prefijo de la
> cuenta (`glovo_`, `llevar_`, `M_`, `T_`…).
> **UN SOLO TASADOR (comandero 3.6.0, 2026-10-21).** El precio del ítem lo pone el SERVIDOR con
> `_shared/pedido-tasador.js` — la MISMA función pura que re-tasa el autoservicio de WhatsApp —
> contra la carta del CANAL: producto + Σ extras; mitad y mitad = `max(base) + Σ extras de cada
> mitad`. El `precio` que llega del cliente se ignora si el producto está en la carta. Antes había
> dos verdades y el backend pisaba el total del panel con el precio pelado de la carta en todo canal
> ≠ mesa, así que **los extras se caían del precio en llevar/teléfono/glovo** y se cobraba de menos.
> El catálogo de extras se DERIVA de la propia carta (`opciones[].valores[].delta_precio_centimos`;
> el grupo `QUITAR` no entra: quitar es gratis) y los nombres que mandan los paneles se resuelven a
> ids (`id` explícito > nombre normalizado sin tildes). Degradación honesta: producto fuera de la
> carta (`pizza_algusto`, `porcion`, packs de tienda) o carta no cacheada → camino anterior + `warn
> comandero.tasado.fallback` + métrica.
> **La escritura dice lo que hace (v2.10.0 · test real `tests/unit/carta-manager__frenos.test.js`).** Dos frenos del custodio
> mentían sobre la intención y se quitaron: (1) `carta.save` era "conservador" — `productos: []` y
> "la clave no viene" eran indistinguibles, así que una carta NO se podía dejar en blanco: había que
> inventarse un id nuevo (pasó en vivo con the-pirate v3 → v4). Ahora manda la PRESENCIA de la clave:
> `[]` es vaciado explícito, la clave ausente conserva lo previo (y lo reporta en `conservado`).
> (2) no existía `remove_category`: una categoría no se borraba nunca. Ahora `carta.remove_category.request`
> la quita; si tiene productos exige `mover_a` en el mismo acto (la única invariante real: ningún
> producto colgando de una categoría inexistente) y recompacta `orden` a 0..n-1. El snapshot previo
> sigue haciendo el vaciado reversible con `carta.restore`.
> **`carta.save` NO promociona a general si ya hay general (v2.9.0, verificado en vivo 2026-10-19).**
> `_autoPromoTarifas` leía `/config/tarifas.json` — la ruta LEGACY — mientras tarifas escribe en
> `/pizzepos/tarifas.json`: el 404 era permanente y la auto-promoción saltaba en CADA save, así que
> la última carta guardada se volvía general. Con una carta de canal eso cambiaba los precios de
> mostrador sin avisar (guardar la carta de glovo puso la de glovo como general). Ahora lee la ruta
> real y solo promociona cuando no hay general ni ningún canal asignado (primera carta del proyecto).
> Contrato de las tools `pedido.*`: `pedido_id` (v3.5.1 — send-kitchen/complete/cancel/total
> leían `id` y devolvían 404: el pedido nunca llegaba a cocina por la vía del asistente).
>
> **Ley de entrada del alta (verificada en vivo 2026-10-19).** El asistente habla en texto y la
> carta guarda fichas: `_normalizarIngredientes` acepta `['mozzarella','tomate']` y también la
> ficha rica, y eleva el texto a `{id, nombre, familia, precio_extra}`. `ingredientes_base` es
> LO MISMO que `ingredientes` (se funde por id; gana la ficha rica) — antes caía en un campo que
> nadie pinta y el producto nacía mudo (sin chips en la web, sin nada que quitar). Si el alta no
> trae `opciones`, se **derivan** de lo que lleva (QUITAR, delta 0). Verificado end-to-end en
> the-pirate: carta v64 → comandero tasa 9,99 € y `estaciones:['horno']` → cocina recibe el item
> → web pública re-horneada con sus ingredientes.

> Nota (carta-marketing): su onboarding/copy siguen el patrón perspectiva-C — el reflejo
> hidrata+persiste y el agente solo transforma; el determinismo es por COLOCACIÓN, agnóstico
> al provider (no depende de qué modelo conduzca el turno).

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
    // project_id NO se guarda crudo: el borde lo resuelve a SLUG (ResolutorProyecto),
    // porque es el nombre de la carpeta en /data/projects/. Un negocio, una llave.
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
// v5.3.0 — PRODUCTOS ES UN PROYECTOR SIN ESTADO sobre carta-manager.
// La CARTA es la única fuente de verdad; productos proyecta la carta activa del proyecto
// al shape POS AL VUELO (carta.get.request). No hay store, ni searchIndex, ni persistencia
// propia. Las mutaciones DELEGAN en el custodio (carta.*.request) y la cadena sigue por EVENTOS
// (la cadena completa del alta está arriba, en «PIZZEPOS - CORE MODULES»).
// NO emite producto.{creado,actualizado,eliminado}: ese contrato murió con el store v4.

INTERFAZ ProductosContract {
  crear(data: {project_id, nombre, precio, categoria_id, ingredientes?, estaciones?, ...}): {producto, carta_version}
  crear_categoria(data: {project_id, nombre, orden?}): {categoria, carta_version}
  list/get/search/categorias/ingredientes/pizzas/stats/carta_completa  // LECTURAS (proyección)
  update/delete                                                       // MUTACIONES (delegan)
}

CLASE ProductosProyector IMPLEMENTA ProductosContract {
  ATRIBUTOS {
    eventBus          : EventBus
    uiHandler         : UIRequestHandler
    mappingCanales    : Map<project_id, {general, canales}>   // hidratado por tarifas
    catalogoProyectado: Map<project_id, Catalogo>             // caché de proyección (ms)
  }

  METODO crear(data): {producto, carta_version}          // LA PUERTA DEL ASISTENTE
    VALIDA project_id, nombre, precio(numérico >= 0), categoria_id
    carta_id ← resolverCartaActiva(project_id, canal?, carta_id?)
    RPC carta.add_product.request {project_id, carta_id, producto}
    RETORNA la respuesta del custodio (201 + producto + carta_version)
    // cero escritura propia: si el custodio no persiste, aquí no hay nada que deshacer

  METODO crear_categoria(data): {categoria, carta_version}
    carta_id ← resolverCartaActiva(...)
    RPC carta.add_category.request {project_id, carta_id, categoria}

  METODO update(id, campos): RPC carta.update_product.request    // mismas 6 W, mismo dueño
  METODO delete(id):         RPC carta.remove_product.request

  METODO resolverCartaActiva(project_id, canal, carta_id): carta_id
    SI carta_id        RETORNA carta_id                  // el caller ya resolvió la del canal
    SI mapping[canal]  RETORNA mapping[canal]            // override de canal (tarifas)
    SI mapping.general RETORNA mapping.general           // general (tarifas)
    RETORNA carta.list.request → la en_servicio (fallback robusto)

  METODO evento carta.actualizada | carta.editada | carta.borrada  // onCartaGenerada
    PROYECTA la carta entera (viene EMBEBIDA en el payload; no re-lee)
    SI _esCartaGeneral(project_id, carta)            // v5.3.0 — el gate del canal
      PUBLICa catalogo.actualizado {project_id, productos}
    SINO
      // carta de CANAL (glovo/llevar/telefono): NO toca el catálogo global
      LOG 'carta.canal.no_proyecta_catalogo' y RETORNA
      // su precio vive en el cache POR CARTA del comandero (carta.actualizada →
      // cartasProductosCache[carta_id]); el cobro resuelve canal→carta con fallback al base
    // _esCartaGeneral: tarifas.general === carta.meta.id; sin general conocido → TRUE (emite)

  METODO onLoad(ctx)
    HIDRATA mappingCanales desde tarifas (snapshot) + proyecto activo (warm)
    // v5.3.1: PUBLICA tarifas.config.solicitada {tipo:snapshot} TAMBIÉN al cargar — sin esto,
    // tras un hot-reload/restart el mapa nacía VACÍO y el gate _esCartaGeneral no veía la general
    // (una carta de canal habría vuelto a pisar precios de mostrador). tarifas responde un
    // snapshot por proyecto conocido; mismo patrón que comandero.onLoad.
}

CLASE Producto {                        // el shape que viaja por la carta
  id            : String                // determinista: slug(categoria_id) + '_' + slug(nombre)
  nombre        : String
  precio        : Number                // € (venta) — INDEPENDIENTE del coste (escandallo)
  categoria_id  : String
  ingredientes  : Array<Ingrediente>    // LO QUE LLEVA (lo único que pintan web y comandero)
  opciones      : Array<Opcion>         // subsistema Opciones: QUITAR (lo que lleva) / ELEGIR_VARIOS
  estaciones    : Array<String>         // propias del producto o heredadas de la categoría
  variaciones   : Object?               // reglas (permite_quitar / max_extras / extras_sugeridos)
  dietas        : Array<String>?
  alergenos     : Array<String>
  disponible    : Boolean
}

CLASE Ingrediente {                     // forma CANÓNICA (ley única de carta-manager)
  id           : String                 // slug del nombre — id estable, nunca prosa
  nombre       : String                 // nombre de carta ('Mozzarella')
  familia      : Familia                // queso|verdura|carne|salsa|pescado|fruta|extra|condimento|otro
  emoji        : String?
  precio_extra : Number                 // € del extra (0 explícito = gratis)
}

// LEY DE ENTRADA (el asistente habla en texto, la carta guarda fichas):
//   _normalizarIngredientes acepta TEXTO ('mozzarella') y FICHA RICA ({id,nombre,familia,emoji}).
//   El texto se eleva a forma canónica (id determinista, nombre legible, familia, precio_extra).
//   `ingredientes_base` NO es un campo aparte: es LO MISMO que `ingredientes` — se funde por id,
//   gana la ficha rica. (Antes se guardaba en un campo que nadie pinta → producto mudo: sin chips
//   en la web y sin nada que quitar. Verificado y corregido 2026-10-19.)
//   Sin `opciones` en el alta → se DERIVAN de lo que lleva (QUITAR, delta 0) con
//   _shared/derivar-opciones.derivarOpciones: el producto nace operable, no mudo.
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
    pedido.pagado: {pedido_id, project_id, project_slug, session_id, total, cliente_nombre, cliente_telefono, recreado}
    pedido.recogido: {pedido_id, project_id, total_centimos, cliente_nombre, metodo_pago, recogido_at}
  }
}
```

> **Un pedido, un id (verificado en vivo 2026-10-24).** `handleCreatePedidoTienda` crea el pedido
> (UUID) y `_crearCuentaTienda` lo inyecta en el comandero; el envío a cocina viaja con
> `pedido_id = pedido.id` y su `project_id`. `onComanderoEnviarCocina` COMPLETA ese pedido si ya
> existe (items vivos, estado `en_cocina`, un solo `pedido.enviado_cocina`) en vez de acuñar un
> gemelo `ped_<ts>_<rand>` y republicar `pedido.creado`. El gemelo apilaba dos apuntes en la
> cuenta (4 líneas donde había 2 items) y dejaba un pedido fantasma con `project_id: 'default'`.
> El comandero manual sigue acuñando su propio id: no pasa `pedido_id`.

### PAGO DEL PEDIDO DE TIENDA — efectivo o tarjeta (el método viaja en el #P1)

```
PREFERENCIA ≠ COBRO. El cliente elige en la PWA y la preferencia viaja autoritativa en el #P1
(campo metodo_pago: 'efectivo' | 'tarjeta'; sin él → 'efectivo'). Eso solo REGISTRA lo que pidió.
Quien manda sobre la caja es la VERDAD del pago: pedido.pago.estado, escrito por la pasarela.

CADENA (toda por evento, ningún módulo nuevo):
  PWA → #P1{metodo_pago} → pedido-parser → bot → pedido.crear-tienda{metodo_pago} → pedidos
    IF metodo_pago == 'tarjeta':
      bot → pago.iniciar.request {pedido_id, monto_centimos, return_url, metadata{project_slug, cliente_nombre, cliente_telefono, canal_origen}}
        → pago-gateway (LÍDER, provider-agnóstico: Stripe Checkout hospedado)
        → pago.iniciar.response {status:200, data:{checkout_url}}
      bot → manda checkout_url al cliente por WhatsApp   // guarda: UNA sesión por pedido_id
      ELSE degrada (NO_PASARELA / PERMISSION_DENIED) → 'puedes pagar al recoger' (el pedido ya existe)
    Stripe → POST /pago/webhook/:project (firma verificada) → pago-gateway
      → pago.confirmado {pedido_id, project_id, monto_centimos, + metadata de contexto}
      → pedidos.onPagoConfirmado → pedido.pagado
      → bot avisa al cliente 'pago recibido' ; IF recreado → avisa al STAFF por Telegram
    Dependiente confirma recogida → pedido.recogido{metodo_pago} ; la caja ya no miente

EL HUÉRFANO (por qué existe la recreación): los pedidos de tienda viven en MEMORIA y no se
restauran. El pago es asíncrono (el webhook llega minutos después), así que un reinicio en esa
ventana —un DEPLOY, justo— dejaría el dinero cobrado y el pedido inexistente, en silencio. Se
reconstruye MÍNIMO desde la metadata de la sesión (pedido_id + project_id + importe) y se emite
pedido.pagado con recreado:true. El dinero nunca se pierde sin rastro. Nada que persistir.

config DEL PROYECTO: la pasarela se enciende por proyecto (pago-gateway lee
core.config['pago-gateway'] || moduleConfig: kind stripe-checkout, provider STRIPE, moneda,
return_url, webhook_secret). Sin bloque y sin credencial STRIPE → degrada, no rompe.
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

PUENTE carta→catálogo (reflejo v1.4.0, 2026-10-19) — SUSCRIBE 'carta.actualizada' (handler
onCartaActualizada): alta IDEMPOTENTE en ingredientes_catalogo de los ids de ingredientes que la
carta usa y el catálogo no conoce. Identidad canónica = el ID de la carta (estable; la prosa del
nombre varía), tolerancia singular/plural por variantes; dedup por id Y nombre normalizado;
sub-recetas nunca entran como ingredientes; NUNCA inventa precio (null → el escandallo canta
sin_precio y las fuentes de dinero —mercadona-api/manual— lo llenan). Emite
'catalogo.ingredientes.actualizado' con las altas. Escrito fs.edit declarativo (RFC 6902), fire-
and-forget. PRUEBA EN VIVO (2026-10-19): la 1ª iteración derivaba el id del NOMBRE y creó 5
duplicados conceptuales en prod (champinon/salsa-de-mostaza/tomate-seco/salsa-de-ajo-asado-y-trufa/
crema-de-champinones) — limpiados a mano; el fix (id desde carta + variantes) dio 0 altas sobre
los mismos datos.

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

> **No hay CRUD de "variaciones"** (ni `createVariacion`, ni `variacion.created/deleted`): el módulo
> real es una **caché de reglas por producto leída de la CARTA**. El contrato vive en
> `pizzepos/pos-nucleo.md` §8 VARIACIONES (v4.6.1) — esta entrada solo lo enlaza para no duplicar prosa.
>
> Lo esencial: `variaciones.configurar` (rol jefe) delega en `carta.update_product` (el custodio
> escribe; aquí solo se lee). Se puebla por `carta.actualizada/editada` + `project.activated`
> (`productos.carta_completa`). Su caché es `lost_on_restart`, así que desde v4.6.0 **auto-vivifica**:
> si falta la config y la petición trae `project_id`, hidrata ESE proyecto desde la carta y reintenta
> (una sola RPC para concurrentes) — sin hidratar todos los proyectos en bloque, porque los ids de
> producto se repiten entre proyectos (nonina y the-pirate comparten 52) y la caché va por `producto_id`.
> Desde v4.6.1 el `max_ingredientes_extra` que valida sale del `max` de la opción `ELEGIR_VARIOS` de la
> carta, no del 5 heredado: la carta manda y el motor deja de rechazar extras que el panel ofrece.

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
> v2.25.1 — el CIERRE del pedido vive en la plantilla (static-template.js): al salir el pedido el
> carrito se vacía (WhatsApp / online / pasarela sin redirección) y la copia queda en «repetir
> último pedido». Es plantilla HORNEADA: el deploy no toca el bundle ya publicado — tras desplegar
> hay que REPUBLICAR para que la PWA servida lleve la plantilla nueva.

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
  //   calendario      → dias_salida[] + margen_antelacion_h por producto (calendario.productos.leer)

  METODOS {
    // PROYECCIÓN pura (proyeccion.js): entra dato, sale dato. La misma FORMA para los
    // dos consumidores: el reflejo (bus) y el export-cli (disco).
    //
    // ORDEN DEL SCROLL (contrato): `productos[]` es lo que pinta el grid "Todas" de la PWA,
    // así que su orden ES el orden de lectura de la carta. La proyección los agrupa en TRAMOS
    // CONTIGUOS siguiendo `categorias[].orden` — el mismo orden que las pestañas de arriba —
    // conservando dentro de cada tramo el orden culinario de la carta. Un producto de sección
    // no publicada va al final sin romper los tramos. Consecuencia: el orden del scroll deja de
    // depender de cómo esté guardada la lista (dar de alta un producto ya no lo manda al final).
    _proyectarPublica(project_id):
      [carta, marca, contenido, config, calendario] ← Promise.all(bebe_de_*)
      SI !carta: RETORNA 404 (canal sin carta — revisa tarifas)
      RETORNA proyectarCartaPublica(carta, marca, contenido, config, calendario)
        // → { branding, categorias, productos, alergenos_leyenda (1169/2011), opciones,
        //     dias_salida[] por producto (para el boton Encargar de la PWA) }

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
