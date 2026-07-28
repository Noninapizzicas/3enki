---
name: pedidos
description: >-
  Gestión completa de pedidos pizzepos. Dos tipos: 'pos' (con cuenta_id,
  items incremental, enviado a cocina) y 'tienda' (plano, todos los items
  de una, cliente_nombre como ancla de recogida). Bridge desde comandero
  (comandero.enviar_cocina → pedido formal). 12 tools + 12 ui_handlers.
fuente: enki
dominio: comercio
tags: [pizzepos, pedidos, pos, tienda, cocina, recogida, formal]
---

# Pizzepos · pedidos

> **Qué es.** El módulo de pedidos formales. Recibe pedidos desde dos vías:
> **POS** (flujo pizzeria con cuenta_id, items incremental, comandero→cocina)
> y **Tienda** (flujo PWA/WhatsApp, plano, todos los items de una, recogida
> por nombre del cliente).
>
> Código: `modules/pizzepos/pedidos/index.js` · v`3.5.0`

---

## 1 · LÓGICA

### Dos tipos de pedido

| Aspecto | POS | Tienda |
|---------|-----|--------|
| **cuenta_id** | Sí (de cuentas-canales) | No |
| **Items** | Uno a uno (comandero) | Todos de una (PWA/WhatsApp) |
| **Estado inicial** | borrador | pendiente_recogida |
| **Ancla de recogida** | cuenta_id + ref_display | cliente_nombre (OBLIGATORIO) |
| **Cocina** | pedido.enviado_cocina → cocina | Pedido completo → cocina |
| **Quién lo crea** | comandero (bridge) | tienda-api / whatsapp-bot |

### Bridge comandero → pedidos

```
comandero                     pedidos                          cocina
─────────                     ───────                          ──────
enviar_cocina ──────────────→ onComanderoEnviarCocina()
                                │
                                ├─ Crear pedido formal (tipo: pos)
                                ├── pedido.creado
                                ├── pedido.enviado_cocina ─────→ onPedidoEnviadoCocina()
```

### Pedido tienda (recogida)

```
PWA / WhatsApp                pedidos                          cocina
────────────                  ───────                          ──────
pedido.crear-tienda ────────→ handleCreatePedidoTienda()
                                │
                                ├─ items de una (todos juntos)
                                ├─ cliente_nombre OBLIGATORIO
                                ├─ tipo: 'tienda', estado: pendiente_recogida
                                ├── pedido.creado
                                ├── pedido.enviado_cocina ─────→ onPedidoEnviadoCocina()
```

### Estados de un pedido

```
borrador → confirmado → enviado_cocina → completado
                            ↘ cancelado
```

Para tienda: `pendiente_recogida` salta directo a `enviado_cocina`.

---

## 2 · TOOLS (invocables por LLM)

### `pedido.list`

```jsonc
{ "cuenta_id": "mesa_5", "estado": "enviado_cocina" }
// → 200 { "pedidos": [/*...*/] }
```

### `pedido.get`

```jsonc
{ "id": "ped_001" }
// → 200 { "pedido": { /* completo */ } }
```

### `pedido.create`

```jsonc
{ "cuenta_id": "mesa_5", "notas_generales": "cumpleaños", "project_id": "uuid" }
// → 201 { "pedido": { "id": "ped_001", "estado": "borrador", ... } }
```

### `pedido.add-item`

```jsonc
{
  "pedido_id": "ped_001",
  "producto_id": "pizzas_margarita",
  "cantidad": 2,
  "variaciones": { "ingredientes_quitar": ["cebolla"] },
  "notas": "sin cebolla"
}
// → 200 { "item": { "id": "item_001", ... }, "pedido": { ... } }
```

### `pedido.update-item` / `pedido.delete-item`

```jsonc
// update
{ "pedido_id": "ped_001", "item_id": "item_001", "cantidad": 3 }
// delete
{ "pedido_id": "ped_001", "item_id": "item_001" }
```

### `pedido.send-kitchen`

```jsonc
{ "pedido_id": "ped_001" }
// → 200 { "pedido_id": "ped_001", "estado": "enviado_cocina" }
```

Emite `pedido.enviado_cocina` → cocina lo recibe.

### `pedido.complete` / `pedido.cancel`

```jsonc
{ "pedido_id": "ped_001" }                                    // complete
{ "pedido_id": "ped_001", "motivo": "cliente no vino" }     // cancel
```

### `pedido.total`

```jsonc
{ "pedido_id": "ped_001" }
// → 200 { "pedido_id": "ped_001", "subtotal": 1700, "total": 1700 }
```

### `pedido.crear-tienda` (tool para canales externos)

```jsonc
{
  "project_slug": "mi-pizza",
  "items": [
    { "cantidad": 2, "descripcion": "Margarita", "producto_id": "pizzas_margarita",
      "precio_unitario_centimos": 850, "precio_total_centimos": 1700 }
  ],
  "total_centimos": 1700,
  "canal_origen": "web",
  "cliente_nombre": "María",              // OBLIGATORIO (ancla de recogida)
  "cliente_telefono": "34600000000",      // opcional
  "notas_generales": "sin cebolla"
}
// → 201 { "pedido_id": "ped_002", "cliente_nombre": "María" }
```

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `pedido.creado` | Nuevo pedido formal (POS o tienda) |
| `pedido.item_agregado` | Item añadido al pedido |
| `pedido.item_actualizado` | Item modificado |
| `pedido.item_eliminado` | Item eliminado |
| `pedido.enviado_cocina` | Pedido enviado a cocina (consumido por cocina) |
| `pedido.completado` | Pedido servido completo |
| `pedido.cancelado` | Pedido cancelado |

### Escucha

| Evento | Handler | Procedencia |
|--------|---------|-------------|
| `comandero.enviar_cocina` | `onComanderoEnviarCocina` | Bridge: comandero → pedido formal |
| `variacion.validada` | `onVariacionValidada` | Confirma precio del item |
| `variacion.rechazada` | `onVariacionRechazada` | Rechaza item |
| `cuenta.creada` | `onCuentaCreada` | Vincular pedido |
| `catalogo.actualizado` | `onCatalogoActualizado` | Sync caché productos |
| `producto.{creado,actualizado}` | `onProductoActualizado` | Actualiza caché |
| `caja.cerrada` / `dia.iniciado` | — | Limpieza |
| `pago.confirmado` | `onPagoConfirmado` | Marca pagado online |

---

## 4 · FLUJO TÍPICO

### Pedido POS (mesa)

```
1. CAMARERO añade items     → comandero (buffer)
2. CAMARERO envía cocina    → comandero.enviar_cocina
3. PEDIDOS recibe           → onComanderoEnviarCocina → pedido.creado + pedido.enviado_cocina
4. COCINA recibe            → onPedidoEnviadoCocina → display cocina
5. COCINA prepara           → cocina.pedido_listo
6. CAMARERO completa        → pedido.complete
```

### Pedido Tienda (PWA web)

```
1. CLIENTE pide desde web   → POST /tienda/pedido/:project
2. TIENDA-API recibe        → pedido.crear-tienda { items, cliente_nombre, ... }
3. PEDIDOS crea             → pendiente_recogida + pedido.enviado_cocina
4. COCINA prepara           → cocina.pedido_listo
5. CLIENTE llega            → dice "soy María"
6. DEPENDIENTE confirma     → pedido.confirmar-recogida { cliente_nombre }
                              → busca por nombre + desambigua si hay varios
                              → entrega pedido
```

---

## 5 · INTEGRACIÓN

> **Tools principales:** `pedido.list` (consulta), `pedido.create` (nuevo),
> `pedido.add-item` (añadir), `pedido.send-kitchen` (enviar a cocina),
> `pedido.crear-tienda` (pedido plano desde canales externos).

> **Ancla de recogida:** desde v3.3.0 es `cliente_nombre` (no código).
> El dependiente pregunta el nombre al recoger. Si hay varios pendientes
> con el mismo nombre, se desambigua por pedido_id.

> **Bridge comandero:** no invoques `pedido.create` + `pedido.add-item` para
> el flujo POS manualmente — el bridge `comandero.enviar_cocina` lo hace solo.

> **En memoria:** los pedidos se pierden en reinicio. La fuente de verdad
> para persistencia es `persistencia-comandero` (event-sourcing).
