---
name: productos
description: >-
  Catalogo de productos pizzepos multi-tenant. PROYECTOR SIN ESTADO: no guarda copia; proyecta la carta activa del proyecto (carta-manager, fuente unica) a formato POS al vuelo via carta.get.request. Lee la carta por su DUEÑO (carta-manager RPC), no po
fuente: enki
dominio: comercio
tags: [pizzepos, productos, pos, catalogo]
---

# Pizzepos · productos

> Catalogo de productos pizzepos multi-tenant. PROYECTOR SIN ESTADO: no guarda copia; proyecta la carta activa del proyecto (carta-manager, fuente unica) a formato POS al vuelo via carta.get.request. Lee la carta por su DUEÑO (carta-manager RPC), no por fs directo. Emite catalogo.actualizado como señal de refresco para que comandero/pedidos re-pull. Mutaciones delegan a carta-manager.

**Versión:** `5.1.0` · **Módulo:** `modules/pizzepos/productos/`

---

## Eventos que publica

Puedes llamarlos vía `bus.publishAndWait`:

  · `catalogo.actualizado` — SEÑAL de refresco: la carta activa del proyecto cambio (o se activo el proyecto). Lleva la proyeccion lite. Consumido po
  · `carta.get.request` — RPC a carta-manager (reflejo): pide la carta activa para proyectarla. Correlacionado por request_id.
  · `carta.list.request` — RPC a carta-manager (reflejo): resuelve la carta en_servicio cuando tarifas no fija general. Correlacionado por request_
  · `carta.update_product.request` — RPC a carta-manager: delega la edicion de un producto (productos no escribe; la carta es la fuente).
  · `carta.remove_product.request` — RPC a carta-manager: delega el borrado de un producto.
  · `project.get.request` — Request a project-manager para resolver base_path. Correlacionado por request_id.
  · `tarifas.config.solicitada` — Solicita snapshot de tarifas en onProjectActivated para hidratar el mapping canal->carta_id. Fire-and-forget.

---

## Eventos que escucha

Reacciona a estos eventos del bus:

  · `carta.actualizada` → `onCartaGenerada` — Carta creada o modificada (save/restore) — auto-sync al catalogo. Payload con carta entera embebida.
  · `carta.editada` → `onCartaGenerada` — Carta editada (add/remove/update producto, add_category, update_prices). Mismo handler que carta.actualizada: shape de p
  · `carta.borrada` → `onCartaBorrada` — Carta archivada (soft-delete). Productos saca esta carta de su catalogo activo si era la asignada.
  · `tarifas.config.actualizada` → `onTarifasConfigActualizada` — Snapshot del estado de tarifas. Productos cachea el mapping canal->carta_id en memoria. No expone tool de resolucion --l
  · `project.activated` → `onProjectActivated` — Cache base_path del proyecto + auto-load cartas desde disco + solicita snapshot inicial de tarifas.
  · `project.get.response` → `onProjectGetResponse` — Resolves pending project path resolve por request_id.

---

## Tools (invocables por LLM)

  · `productos.list` — Lista productos del catalogo del proyecto con filtros opcionales por categoria, categoria_id o activo. Ordenados por cat
  · `productos.get` — Obtiene un producto por id dentro del catalogo del proyecto.
  · `productos.search` — Busqueda full-text en nombre y descripcion de productos activos del proyecto.
  · `productos.update` — Actualiza campos de un producto. Persiste el catalogo en disco y emite producto.actualizado con el detalle de cambios.
  · `productos.delete` — Elimina un producto del catalogo y persiste a disco. Emite producto.eliminado.
  · `productos.categorias` — Lista categorias del proyecto con contador de productos activos en cada una, ordenadas por orden declarado.
  · `productos.ingredientes` — Delega al modulo ingredientes (fuente unica). Mantiene el endpoint por compatibilidad con el frontend del comandero.
  · `productos.pizzas` — Lista productos del catalogo cuya categoria empieza por 'pizz' o tipo es 'pizza'. Ordenadas alfabeticamente.
  · `productos.stats` — Estadisticas del catalogo. Si no se pasa project_id devuelve totales agregados across proyectos cargados; con project_id
  · `productos.health` — Health check: estado del modulo, totales agregados de productos/categorias/menus pendientes.
  · `productos.metrics` — Metricas operativas del catalogo (counters y gauges).
  · `productos.load_carta` — Recarga la carta del proyecto desde disco (storage/pizzepos/cartas/). Devuelve cuantos productos y categorias se cargaro
  · `productos.carta_completa` — Devuelve la carta completa (categorias + productos + ingredientes) en un solo round-trip. Si no se pasa project_id, usa 


---

## UI Handlers

Pantallas que renderiza en el frontend:

  · `productos.list` → `handleListProductos` (barra_modulos)
  · `productos.get` → `handleGetProducto` (barra_modulos)
  · `productos.search` → `handleSearchProductos` (barra_modulos)
  · `productos.update` → `handleUpdateProducto` (barra_modulos)
  · `productos.delete` → `handleDeleteProducto` (barra_modulos)
  · `productos.categorias` → `handleListCategorias` (barra_modulos)
  · `productos.ingredientes` → `handleListIngredientes` (barra_modulos)
  · `productos.pizzas` → `handleListPizzas` (barra_modulos)
  · `productos.stats` → `handleGetStats` (barra_modulos)
  · `productos.health` → `handleHealthCheck` (barra_modulos)
  · `productos.metrics` → `handleGetMetrics` (barra_modulos)
  · `productos.load_carta` → `handleLoadCarta` (barra_modulos)
  · `productos.carta_completa` → `handleCartaCompleta` (barra_modulos)


---

## Integración

> Skill del módulo `productos` del subsistema `pizzepos`.
> El código fuente es la verdad viva en `modules/pizzepos/productos/`.
