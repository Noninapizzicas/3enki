---
name: carta-manager
description: >-
  Aggregate root del subsistema carta. HÍBRIDO: blueprint (LLM interpreta
  intención → op estructurada) + reflejo JS (15 ops deterministas en el bus
  carta.<op>.request). Custodio único del store /pizzepos/cartas/. CRUD,
  versionado, manipulación de productos/categorías, activación, clonado,
  validación estructural. Los hermanos (carta-design, carta-digital, etc.)
  LEEN vía carta.<op>.request pero NUNCA escriben al store.
fuente: enki
dominio: comercio
tags: [pizzepos, carta-manager, carta, custodio, reflejo, hibrido, crud, versionado]
---

# Pizzepos · carta-manager

> **Qué es.** El **custodio único** de las cartas del sistema. Nadie más escribe
> en `/pizzepos/cartas/`. 15+ operaciones deterministas servidas por el reflejo
> JS en milisegundos — antes las ejecutaba el LLM (blueprint puro, turnos de
> segundos, teatro). El blueprint queda como traductor: el LLM interpreta
> lenguaje natural ("súbele 1€ a las pizzas", "borra la carta de verano") y
> delega en el reflejo vía `carta.<op>.request`.
>
> **Híbrido:** `blueprint_driven` + `index.js`. Activable via `page_id='carta-manager'`.
>
> Código: `modules/pizzepos/carta-manager/index.js` · `reflejo-1.14.0`
> Blueprint: `modules/pizzepos/carta-manager/carta-manager.blueprint.json`
> Versión módulo: `2.8.0`

---

## 1 · LÓGICA (lo que hay detrás)

### Store

```
/pizzepos/cartas/
├── <id>.json                      ← snapshot vivo de la carta
└── .versions/<id>/<ts>.json       ← snapshots históricos (versionado)
```

- **Scope:** project (cada proyecto tiene su directorio `storage/<project_id>/pizzepos/cartas/`)
- **Concurrencia:** single-writer (solo carta-manager escribe)
- **Patrón:** json-file-per-entity + versionado por timestamp
- **Lectores:** carta-design, carta-digital, carta-impresion, carta-marketing, carta-scheduler — LEEN vía RPC, nunca tocan disco

### Mutación versionada

5 operaciones de escritura (`add_product`, `remove_product`, `update_product`,
`update_products`, `add_category`, `update_prices`, `update_extras`) pasan por
`_mutar()`:

```
1. _get(id)          → leer snapshot vivo
2. snapshot previo   → .versions/<id>/<ts>.json (antes de mutar)
3. aplicar cambio    → modificar en memoria
4. fs.edit            → persistir snapshot vivo
5. version++          → incrementar contador
6. emitir evento      → carta.editada (para que los lectores refresquen)
```

### Activación (carta en servicio)

`carta.activar.request` es un **patch de 1 campo**: no reescribe la carta entera.
Pone la carta solicitada `en_servicio` y baja a `borrador` cualquier otra que
estuviera activa. El comandero/POS recogen la activa nueva automáticamente.

### Validación estructural (el freno)

`carta.validar.request` es el **freno** que mata el agujero "carta1":
productos huecos que el LLM cantaba como "✅ creados". Valida contra el
contrato carta-pizzepos sin exigir completitud de borrador (precio 0 e
ingredientes vacíos son legítimos en borrador).

### Familias canónicas de ingrediente

```
queso · verdura · carne · salsa · pescado · fruta · extra · condimento · otro
```

### Extra estándar

Cada ingrediente sin precio propio recibe `precio_extra: 0.50€`. El 0 explícito
se respeta (gratis). Lo necesita el comandero para cobrar extras (ELEGIR_VARIOS).

---

## 2 · EVENTOS (el contrato del bus)

### Atiende (RPC request → response) — 16 operaciones

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `carta.save.request` | `onSaveRequest` | Persiste carta entera (snapshot + version++) |
| `carta.get.request` | `onGetRequest` | Una carta completa por id |
| `carta.list.request` | `onListRequest` | Lista resumida de cartas (filtros estado/tag) |
| `carta.delete.request` | `onDeleteRequest` | Soft-delete (estado=archivada), emite `carta.borrada` |
| `carta.add_product.request` | `onAddProductRequest` | Añade un producto (valida categoria_id, normaliza ingredientes) |
| `carta.remove_product.request` | `onRemoveProductRequest` | Quita un producto por id |
| `carta.update_product.request` | `onUpdateProductRequest` | Edita campos de un producto (abstracción completa: 6W) |
| `carta.update_products.request` | `onUpdateProductsRequest` | Edita N productos en UN solo `_mutar` (una versión) |
| `carta.add_category.request` | `onAddCategoryRequest` | Añade una categoría (dedup por nombre) |
| `carta.update_prices.request` | `onUpdatePricesRequest` | Actualiza precios de productos en lote |
| `carta.update_extras.request` | `onUpdateExtrasRequest` | Cambia `precio_extra` de ingredientes por id en toda la carta |
| `carta.clonar.request` | `onClonarRequest` | Clona una carta como copia independiente |
| `carta.search.request` | `onSearchRequest` | Busca cartas/productos por query |
| `carta.stats.request` | `onStatsRequest` | Totales y desglose por estado |
| `carta.versions.request` | `onVersionsRequest` | Lista los snapshots históricos de una carta |
| `carta.restore.request` | `onRestoreRequest` | Restaura una versión previa (snapshot + version++) |
| `carta.activar.request` | `onActivarRequest` | Pone una carta en_servicio (patch de 1 campo, sin reescribir) |
| `carta.validar.request` | `onValidarRequest` | Valida estructura contra contrato carta-pizzepos antes de persistir |

### Emite (fire-and-forget)

| Evento | Cuándo |
|--------|--------|
| `carta.actualizada` | Tras `carta.save` / `carta.activar` — carga completa para que los lectores refresquen |
| `carta.editada` | Tras cualquier mutación (`_mutar`) — productos/categorías cambiaron |
| `carta.borrada` | Tras soft-delete (`carta.delete`) |
| `cartas.cargadas` | Al cargar todas las cartas de un proyecto (onProjectActivated) |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `carta.creada` | `onCartaCreada` | menu-generator publica; el reflejo persiste vía `_save` |
| `project.activated` | `onProjectActivated` | Carga las cartas del proyecto en memoria |

### Errores documentados

| Código | Significado |
|--------|-------------|
| `400 INVALID_INPUT` | Falta project_id, carta_id, o campos requeridos |
| `404 RESOURCE_NOT_FOUND` | Carta o producto no existe |
| `409 CONFLICT` | Categoría duplicada, producto duplicado (mismo slug) |
| `422 UNPROCESSABLE` | Validación estructural fallida (carta sin productos, producto sin nombre, etc.) |
| `503 UPSTREAM_UNREACHABLE` | filesystem no responde |

---

## 3 · FUNCIONES (payload exacto de cada operación)

### `save` — persistir carta entera

```jsonc
// carta.save.request
{
  "project_id": "uuid",
  "carta": {
    "meta": { "id": "carta_verano", "nombre": "Verano 2026", "generado_desde": "json" },
    "categorias": [{ "id": "pizzas", "nombre": "Pizzas", "orden": 1 }],
    "productos": [{ "id": "pizzas_margarita", "nombre": "Margarita", "categoria_id": "pizzas", "precio": 8.50 }]
  },
  "user_id": "menu-generator",
  "motivo": "import desde JSON (reflejo)",
  "correlation_id": "uuid"
}
// → 200
{ "carta_id": "carta_verano", "productos": 38, "categorias": 4, "version": 7 }
```

### `get` — leer una carta

```jsonc
// carta.get.request
{ "project_id": "uuid", "carta_id": "carta_verano" }
// → 200
{ "carta": { /* carta completa con categorias[], productos[] */ }, "version": 7 }
// El objeto producto incluye: id, nombre, categoria_id, precio, ingredientes[],
// ingredientes_base[]?, opciones[]?, variaciones?, estaciones?, tipo?, descripcion?, ...
```

Sin carta → `404 RESOURCE_NOT_FOUND`. Sin `project_id` → `400 INVALID_INPUT`.

### `list` — lista resumida de cartas

```jsonc
// carta.list.request
{ "project_id": "uuid", "estado": "en_servicio" }   // estado opcional
// → 200
{
  "data": [
    { "id": "carta_verano", "nombre": "Verano 2026", "estado": "en_servicio",
      "productos": 38, "categorias": 4, "version": 7 }
  ]
}
```

Filtros: `estado` (en_servicio | borrador | archivada) y `tag`.

### `delete` — soft-delete

```jsonc
// carta.delete.request
{ "project_id": "uuid", "carta_id": "carta_verano" }
// → 200
{ "carta_id": "carta_verano", "estado": "archivada" }
```

Solo cambia `estado: "archivada"`. Emite `carta.borrada`.

### `add_product` — añadir producto

```jsonc
// carta.add_product.request
{
  "project_id": "uuid",
  "carta_id": "carta_verano",
  "producto": {
    "nombre": "Barbacoa",
    "categoria_id": "pizzas",
    "precio": 10.50,
    "ingredientes": [{ "nombre": "Tomate", "familia": "salsa" }],
    "ingredientes_base": [{ "nombre": "Tomate", "familia": "salsa" }],
    "variaciones": { "permite_quitar": true, "permite_anadir": true, "max_ingredientes_extra": 5 }
  }
}
// → 201
{ "producto": { "id": "pizzas_barbacoa", "nombre": "Barbacoa", ... } }
```

Valida que `categoria_id` exista. Normaliza ingredientes (sin precio → 0.50€ estándar).
Si el slug ya existe → `409 CONFLICT`.

### `update_product` — editar producto

```jsonc
// carta.update_product.request
{
  "project_id": "uuid",
  "carta_id": "carta_verano",
  "producto_id": "pizzas_margarita",
  "campos": { "precio": 9.50 }
}
// → 200
{ "producto": { "id": "pizzas_margarita", ... } }
```

Acepta la abstracción completa del producto. `_normalizarIngredientes` preserva `precio_extra`.

### `update_products` — editar N productos en 1 operación

```jsonc
// carta.update_products.request
{
  "project_id": "uuid",
  "carta_id": "carta_verano",
  "productos": [
    { "id": "pizzas_margarita", "precio": 9.50 },
    { "id": "pizzas_barbacoa", "precio": 11.00 }
  ]
}
// → 200
{ "actualizados": 2, "version": 8 }
```

Una sola llamada a `_mutar` → una versión, no N. Modelado sobre `update_prices`.

### `update_prices` — precios en lote

```jsonc
// carta.update_prices.request
{
  "project_id": "uuid",
  "carta_id": "carta_verano",
  "precios": { "pizzas_margarita": 9.50, "pizzas_barbacoa": 11.00 }
}
// → 200
{ "actualizados": 2, "version": 8 }
```

### `update_extras` — cambiar precio_extra de ingredientes

```jsonc
// carta.update_extras.request
{
  "project_id": "uuid",
  "carta_id": "carta_verano",
  "extras": { "champinon": 1.00, "rucula": 0.75 }
}
// → 200
{ "actualizados": 2, "version": 8 }
```

Actualiza `precio_extra` en TODAS las apariciones del ingrediente (ingredientes +
ingredientes_base). Coherente: comandero (ELEGIR_VARIOS) y carta-digital lo ven.

### `activar` — poner carta en servicio

```jsonc
// carta.activar.request
{ "project_id": "uuid", "carta_id": "carta_verano" }
// → 200
{ "carta_id": "carta_verano", "estado": "en_servicio" }
```

Patch de **1 campo**. Baja a `borrador` cualquier otra carta activa. Emite
`carta.actualizada` (el POS recoge la activa nueva automáticamente).

### `validar` — freno estructural

```jsonc
// carta.validar.request
{ "carta": { /* carta completa */ } }
// → 200 (válida)
{ "valid": true, "errors": [] }
// → 422 (inválida)
{ "valid": false, "errors": [
  { "code": "producto_sin_nombre", "path": "productos[2]", "message": "El producto en índice 2 no tiene nombre" },
  { "code": "categoria_id_inexistente", "path": "productos[3].categoria_id", "message": "'bebidas' no existe en categorías" }
]}
```

**Qué valida:**
- Que existan categorías y productos
- Que cada producto tenga nombre + precio >= 0 + categoria_id existente
- Que cada ingrediente tenga nombre + familia canónica + precio_extra numérico

**Qué NO valida (borrador legítimo):** precio 0, ingredientes vacíos.

### `clonar` — copia independiente

```jsonc
// carta.clonar.request
{ "project_id": "uuid", "carta_id": "carta_verano", "nuevo_nombre": "Verano 2026 (copia)" }
// → 201
{ "carta_id": "carta_verano_copia", "productos": 38, "version": 1 }
```

Copia profunda con nuevo ID y version=1.

### `versions` / `restore` — histórico

```jsonc
// carta.versions.request
{ "project_id": "uuid", "carta_id": "carta_verano" }
// → 200
{ "versions": ["2026-07-28T10:00:00Z", "2026-07-28T11:00:00Z", ...] }
```
```jsonc
// carta.restore.request
{ "project_id": "uuid", "carta_id": "carta_verano", "timestamp": "2026-07-28T10:00:00Z" }
// → 200
{ "carta_id": "carta_verano", "productos": 35, "version": 8 }
```

---

## 4 · FLUJO TÍPICO (extremo a extremo)

### Ciclo de vida de una carta

```
1. GENERAR     menu-generator produce carta → carta.save.request
2. PERSISTIR   carta-manager._save → snapshot + version++ → carta.actualizada
3. VER         carta-design/digital leen → carta.get.request
4. EDITAR      "súbele 1€ a las pizzas" → LLM interpreta → carta.update_prices.request
               "añade champiñones a la barbacoa" → LLM → carta.update_product.request
5. EXTRAS      "el champiñón a 1€" → carta.update_extras.request
6. ACTIVAR     "publica la carta de verano" → carta.activar.request
               (baja la anterior a borrador, POS ve la nueva)
7. CLONAR      "copia la carta para invierno" → carta.clonar.request
8. ARCHIVAR    "borra la carta de primavera" → carta.delete.request (soft)
9. RESTAURAR   "recupera la versión de ayer" → carta.restore.request
```

### Subsistema carta (quién lee y quién escribe)

```
              carta-manager (CUSTODIO, único writer)
                    │
                    │  carta.<op>.request (RPC)
                    │
      ┌─────────────┼─────────────┬──────────────┐
      ▼             ▼             ▼              ▼
carta-design  carta-digital  carta-impresion  carta-marketing
   (diseño)     (digital)      (impresión)     (marketing)

      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
carta-scheduler  menu-generator  cartas externas
   (horarios)      (generación)    (API/import)
```

Todos los lectores usan `carta.get.request` y `carta.list.request`.
Ninguno escribe al store. La única entrada de escritura externa es
`carta.save.request` (desde menu-generator).

---

## 5 · INTEGRACIÓN

> **Página activable:** `target_page_id: 'carta-manager'` — el ai-gateway lo
> trata como destino para `chat.cambiar_foco`. Cajones habilitados.

> **Desde el chat:** Di "quiero gestionar la carta" y el LLM cambia el foco a
> `carta-manager`. Las 18 operaciones están disponibles como tools RPC.

> **Operaciones comunes:**
> - "muéstrame la carta activa" → `carta.get`
> - "súbele 1€ a las pizzas" → `carta.update_prices`
> - "añade una categoría bebidas" → `carta.add_category`
> - "publica la carta de verano" → `carta.activar`
> - "el champiñón a 1€" → `carta.update_extras`
> - "vuelve a la versión de ayer" → `carta.restore`

> **Regla de oro:** carta-manager es el **único writer** de `/pizzepos/cartas/`.
> Cualquier módulo que necesite escribir una carta pasa por `carta.save.request`.
> Los hermanos del subsistema carta leen pero jamás escriben.
