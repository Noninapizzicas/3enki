---
name: comandero
description: >-
  Buffer de pedido por cuenta del POS — items, variaciones, envío a cocina.
  Resolución de precio por canal de venta vía caché local hidratado por
  tarifas. Persistencia transitoria atómica (debounced). Las 4 operaciones
  principales se exponen como tools del LLM: agregar_item, eliminar_item,
  enviar_cocina, obtener_pedido.
fuente: enki
dominio: comercio
tags: [pizzepos, comandero, pedido, buffer, pos, cocina, tools, precio-por-canal]
---

# Pizzepos · comandero

> **Qué es.** El buffer de pedido por cuenta. El camarero añade items, modifica
> cantidades/notas, y envía a cocina. Mantiene cachés de productos (catálogo +
> por carta) para resolver precio según el canal de venta (mesa, delivery, llevar).
> Persiste buffers transitorios atómicamente (debounced 1s) para sobrevivir restart.
>
> **Reflejo puro:** toda la lógica es determinista. Sin blueprint. Sin LLM.
> Las tools comparten los mismos handlers que los ui_handlers del frontend.
>
> Código: `modules/pizzepos/comandero/index.js` · v`3.4.0`

---

## 1 · LÓGICA (lo que hay detrás)

### Buffer de pedido

```
         ┌──────────────┐
         │  camarero     │
         │  (UI o LLM)  │
         └──────┬───────┘
                │ agregar / eliminar / enviar
                ▼
         ┌──────────────┐     enviar_cocina     ┌──────────┐
         │  COMANDERO   │ ─────────────────────→ │  COCINA  │
         │  (buffer)    │                        │          │
         │              │ ←────── pedido_listo ── │          │
         │  items[]     │                        └──────────┘
         │  no_enviados │
         │  enviados[]  │
         └──────┬───────┘
                │ item_agregado / item_eliminado / item_actualizado
                ▼
         ┌──────────────┐
         │   CUENTAS    │  (tracking de estado)
         └──────────────┘
```

**Buffer transitorio:** solo items NO enviados a cocina. Los enviados pasan a
`persistencia-comandero`. Reset en `caja.cerrada` y `dia.iniciado`.

### Resolución de precio por canal

El comandero NO accede a tarifas directamente. Mantiene una **caché local**
hidratada por eventos:

```
tarifas.config.solicitada  → (en onLoad pide snapshot inicial)
tarifas.config.actualizada → hidrata mapping canal→carta_id
carta.actualizada           → cachea productos por carta
catalogo.actualizado        → cachea productos del proyecto
producto.creado/actualizado → actualiza producto en caché
```

Cuando se añade un item sin precio explícito:

```
1. ¿El item especifica precio? → ÚSALO
2. ¿Hay carta asignada al canal? → busca producto en esa carta → su precio
3. ¿Producto en catálogo? → precio del catálogo
4. Sino → 0 (se marca como pendiente de precio)
```

### Guarda contra líneas mudas (v3.4.0)

Si `itemNombre` queda undefined (sin nombre, sin producto_id, sin caché),
el item se rechaza con `400 INVALID_INPUT`. No entran fantasmas al buffer.

---

## 2 · TOOLS (invocables por LLM)

Son las 4 operaciones principales, comparten handler con los ui_handlers.

### `comandero.agregar_item`

```jsonc
{
  "cuenta_id": "mesa_5_xxx",
  "producto_id": "pizzas_margarita",
  "nombre": "Margarita",           // opcional: se resuelve de caché
  "precio": 8.50,                   // opcional: se resuelve por canal
  "cantidad": 2,                    // opcional: default 1
  "notas": "sin cebolla",
  "tipo": "mitad_mitad",            // opcional: mitad-mitad o al_gusto
  "variaciones": ["extra_champinon", "sin_cebolla"],
  "project_id": "uuid"
}
// → 201
{
  "item": { "id": "item_abc123", "nombre": "Margarita", "precio": 8.50,
            "cantidad": 2, "total": 17.00, "enviado": false },
  "buffer": { "items": 1, "total": 17.00 }
}
```

Errores: `400 INVALID_INPUT` (sin nombre ni producto_id), `500 INTERNAL_ERROR`.

### `comandero.eliminar_item`

```jsonc
{
  "cuenta_id": "mesa_5_xxx",
  "item_id": "item_abc123",
  "project_id": "uuid"
}
// → 200
{ "eliminado": true, "item_id": "item_abc123" }
```

Solo elimina items NO enviados a cocina. Errores: `404 RESOURCE_NOT_FOUND`.

### `comandero.enviar_cocina`

```jsonc
{
  "cuenta_id": "mesa_5_xxx",
  "project_id": "uuid"
}
// → 200
{ "enviados": 3, "cuenta_id": "mesa_5_xxx" }
```

Marca los items como `enviado` y publica `comandero.enviar_cocina`.
El módulo cocina los recibe, y cuentas transiciona a `en_preparacion`.

Errores: `409 CONFLICT_STATE` (sin items o ya enviados todos).

### `comandero.obtener_pedido`

```jsonc
{
  "cuenta_id": "mesa_5_xxx",
  "project_id": "uuid"
}
// → 200
{
  "cuenta_id": "mesa_5_xxx",
  "items": [
    { "id": "item_abc123", "nombre": "Margarita", "precio": 8.50,
      "cantidad": 2, "total": 17.00, "enviado": false }
  ],
  "total": 34.00,
  "created_at": "2026-07-28T...",
  "updated_at": "2026-07-28T..."
}
```

Sin pedido → `{ items: [], total: 0 }` (no error).

---

## 3 · EVENTOS (el contrato del bus)

### Publica

| Evento | Cuándo |
|--------|--------|
| `comandero.item_agregado` | Item añadido al buffer (project_id + correlation_id + timestamp) |
| `comandero.item_eliminado` | Item eliminado del buffer (manual o cantidad→0) |
| `comandero.item_actualizado` | Cantidad/notas actualizadas (incluye diff_cantidad, diff_precio) |
| `comandero.enviar_cocina` | Pedido enviado a cocina |
| `tarifas.config.solicitada` | En onLoad — pide snapshot inicial de tarifas |

### Escucha

| Evento | Handler | Procedencia |
|--------|---------|-------------|
| `cuenta.creada` | `onCuentaCreada` | Cachea ref_display canónico |
| `cuenta.actualizada` | `onCuentaActualizada` | Actualiza ref_display al renombrar |
| `caja.cerrada` | `onCajaCerrada` | Reset de buffers |
| `dia.iniciado` | `onDiaIniciado` | Reset de buffers |
| `catalogo.actualizado` | `onCatalogoActualizado` | Sincroniza caché de productos |
| `producto.creado` | `onProductoActualizado` | Cachea producto nuevo |
| `producto.actualizado` | `onProductoActualizado` | Actualiza producto en caché |
| `carta.actualizada` | `onCartaActualizada` | Cachea productos por carta (precio por canal) |
| `tarifas.config.actualizada` | `onTarifasConfigActualizada` | Hidrata mapping canal→carta_id |

---

## 4 · UI (frontend)

### UI Handlers

| Ruta | Handler | Zona |
|------|---------|------|
| `comandero.get` | `handleGetPedido` | barra_modulos |
| `comandero.add-item` | `handleAddItem` | barra_modulos |
| `comandero.remove-item` | `handleRemoveItem` | barra_modulos |
| `comandero.update-item` | `handleUpdateItem` | barra_modulos |
| `comandero.send-kitchen` | `handleEnviarCocina` | barra_modulos |
| `comandero.buffers` | `handleListBuffers` | barra_modulos |
| `comandero.health` | `handleHealthCheck` | barra_modulos |

---

## 5 · FLUJO TÍPICO (extremo a extremo)

### Pedido de mesa

```
1. CLIENTE pide    → camarero usa UI o LLM
2. AGREGAR ITEM    → comandero.agregar_item { cuenta_id, producto_id, cantidad }
                      → comandero.item_agregado → cuentas actualiza estado + total
3. REPETIR         → tantos items como sean necesarios
4. ENVIAR COCINA   → comandero.enviar_cocina { cuenta_id }
                      → comandero.enviar_cocina → cocina recibe + cuentas → en_preparacion
5. COCINA LISTO    → cocina.pedido_listo → cuentas → listo
6. ENTREGAR        → camarero marca entregado en UI
7. COBRAR          → flujo de cobro
```

### Consultar estado

```
comandero.obtener_pedido { cuenta_id }
→ { items, total, enviados/no_enviados }
```

---

## 6 · INTEGRACIÓN

> **Tools directas al LLM.** Las 4 tools (`agregar_item`, `eliminar_item`,
> `enviar_cocina`, `obtener_pedido`) son invocables por el LLM sin pasar por
> el bus — comparten handler con los ui_handlers del frontend.

> **Persistencia:** buffer transitorio en `data/current/comandero_buffers.json`.
> Debounced 1s. Solo items NO enviados. Los enviados viven en persistencia-comandero.

> **Aislamiento:** el comandero NUNCA accede a tarifas directamente. Emite
> `tarifas.config.solicitada` y recibe `tarifas.config.actualizada`. Paradigma
> "emite evento, quien sabe hace".

> **Precio por canal:** la resolución canal→carta_id vive en una caché local
> hidratada por eventos. Sin acceso directo a otros módulos.

> **Caso delivery:** `_inyectarPedidoInicial` emite `comandero.enviar_cocina`
> directamente para integraciones con Glovo, Llevadoo y webhooks externos.
