---
name: inventario
description: >-
  Inventario por proyecto con stock_real + reservas con expiración.
  Stock disponible = stock_real - Σ reservas vivas. Job interno cada 60s
  libera reservas expiradas. Escucha pedido.completado (tipo='tienda')
  para confirmar y decrementar stock. 6 tools. Multi-proyecto.
fuente: enki
dominio: comercio
tags: [inventario, stock, reservas, expiracion, tienda, producto]
---

# Inventario

> **Qué es.** Gestión de stock con reservas temporales. Cuando un cliente
> pide por la PWA, se reserva stock temporalmente. Si no recoge en X horas,
> la reserva expira y el stock vuelve a estar disponible. Al recoger, se
> confirma y decrementa el stock real.
>
> **Cierra la clase de bugs "salmorejo perdido":** dos pedidos simultáneos
> del mismo producto ya no pueden agotar el mismo stock. Lock por path +
> read+mutate+atomic write (tmp+rename).
>
> Código: `modules/inventario/index.js` · v`1.0.0`

---

## 1 · LÓGICA

### Stock disponible

```
stock_disponible = stock_real - Σ reservas_vivas

Ejemplo:
  stock_real = 10
  reservas: pedido_001=2, pedido_002=3
  stock_disponible = 10 - 5 = 5
```

### Ciclo de vida de una reserva

```
pedido.creado (tipo=tienda)
  │
  ▼
inventario.reservar { producto, cantidad, pedido_id }
  ├─ ¿stock_disponible ≥ cantidad? → ✅ reserva creada (expira en 24h)
  └─ ¿stock_disponible < cantidad? → ❌ CONFLICT_STATE

pedido.completado (cliente recogió)
  │
  ▼
inventario.confirmar { pedido_id }
  └─ stock_real -= cantidad_reservada
  └─ reservas borradas

pedido.cancelado
  │
  ▼
inventario.liberar { pedido_id }
  └─ reservas borradas (stock real intacto)

⏰ Job cada 60s
  └─ reservas expiradas → liberadas automáticamente
```

### Alerta stock bajo mínimo

Cuando tras una reserva o ajuste el stock_disponible cae por debajo de
`stock_minimo`, se publica `inventario.stock.bajo_minimo` para que el staff
sepa que toca reponer.

---

## 2 · TOOLS (invocables por LLM)

### `inventario.consultar`

```jsonc
{ "project_slug": "mi-pizza", "producto_id": "mozzarella" }
// → 200 { "producto_id": "mozzarella", "stock_real": 10, "stock_minimo": 3,
//          "stock_disponible": 7, "reservas_vivas_count": 1 }
```

### `inventario.reservar`

```jsonc
{
  "project_slug": "mi-pizza",
  "producto_id": "mozzarella",
  "cantidad": 2,
  "pedido_id": "ped_002",
  "expira_horas": 24        // opcional (default: config del proyecto)
}
// → 201 { "reserva": { "pedido_id": "ped_002", "cantidad": 2, "expira_at": "..." } }
// → 409 { "error": "CONFLICT_STATE", "stock_disponible": 1 }  // insuficiente
```

Idempotente: re-llamar con mismos parámetros no duplica.

### `inventario.confirmar`

```jsonc
{ "project_slug": "mi-pizza", "pedido_id": "ped_002" }
// → 200 { "confirmado": true, "stock_real_restante": 8 }
```

Decrementa stock_real. Idempotente.

### `inventario.liberar`

```jsonc
{ "project_slug": "mi-pizza", "pedido_id": "ped_002", "motivo": "cliente no vino" }
// → 200 { "liberado": true }
```

Cancela reservas sin tocar stock_real.

### `inventario.ajustar`

```jsonc
{ "project_slug": "mi-pizza", "producto_id": "mozzarella", "delta": 5, "motivo": "entrada_proveedor" }
// → 200 { "producto_id": "mozzarella", "stock_real": 15, "delta": 5 }
```

Delta positivo (entrada) o negativo (merma). Stock real no puede ser negativo.

### `inventario.estado_catalogo`

```jsonc
{ "project_slug": "mi-pizza" }
// → 200 { "productos": [{ "id": "mozzarella", "stock_real": 10, "stock_minimo": 3,
//          "reservas_vivas": { "count": 1, "cantidad": 2 }, "stock_disponible": 8 }] }
```

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `inventario.reserva.creada` | Reserva temporal creada |
| `inventario.reserva.expirada` | Reserva liberada por expiración (job 60s) |
| `inventario.reserva.liberada` | Reserva liberada explícitamente (cancelación) |
| `inventario.confirmado` | Reserva confirmada: stock_real decrementado |
| `inventario.ajustado` | Ajuste manual de stock_real (entrada/merma) |
| `inventario.stock.bajo_minimo` | Stock disponible < stock_minimo (alerta) |

### Escucha

| Evento | Handler | Procedencia |
|--------|---------|-------------|
| `pedido.completado` | `onPedidoCompletado` | Confirma reservas (filtra tipo='tienda') |
| `pedido.cancelado` | `onPedidoCancelado` | Libera reservas |

---

## 4 · FLUJO TÍPICO

### Pedido PWA con inventario

```
1. CLIENTE pide           → PWA web → 2x pizza Margarita
2. INVENTARIO reserva     → reservar("mozzarella", 2, pedido_002)
                           → stock: 10 - 2 = 8 disponible
3. COCINA prepara         → pedido listo
4. CLIENTE recoge         → pedido.completado
5. INVENTARIO confirma    → stock_real: 10 - 2 = 8
6. (Si no recoge en 24h)  → reserva expira → stock vuelve a 10
```

### Consultar stock desde el chat

```
"¿cuánta mozzarella tenemos?"
→ inventario.consultar { project_slug, producto_id: "mozzarella" }
→ "10 unidades, 7 disponibles (1 reservada)"
```

### Ajustar stock

```
"han llegado 5 kg de mozzarella"
→ inventario.ajustar { producto: "mozzarella", delta: 5, motivo: "entrada_proveedor" }
→ "stock actualizado: 15 unidades"
```

---

## 5 · INTEGRACIÓN

> **Tools principales:** `inventario.consultar` (ver stock), `inventario.reservar`
> (reservar para pedido), `inventario.confirmar` (al recoger),
> `inventario.ajustar` (entradas/mermas).

> **Expiración:** default 24h, configurable por proyecto en
> `project.json → inventario.reserva_expiracion_horas`.

> **Atomicidad:** `services/safe-update.js` — lock por path + tmp+rename.
> Cierra race conditions entre pedidos simultáneos.

> **Persistencia:** `data/projects/<slug>/inventario.json` por proyecto.
