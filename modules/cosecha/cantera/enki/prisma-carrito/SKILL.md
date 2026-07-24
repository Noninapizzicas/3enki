---
name: carrito
description: "Buffer de venta universal de Prisma (carrito): añadir/quitar/actualizar ítems, tasados por opciones, en céntimos. Copiado de comandero, sin los ganchos de cocina."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [carrito, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · carrito

> **Qué es.** Manifest de prisma/carrito — REFLEJO JS: el BUFFER de venta universal (copiado y generalizado de pizzepos/comandero). Un carrito por cuenta_id: añadir/quitar/actualizar ítems. CAMBIO clave vs comandero: cada ítem se TASA con prisma/opciones (opciones.evaluar: producto + selección → precio_final_centimos) en vez del precio por canal de pizza; dinero en CÉNTIMOS (coherente con opciones/coste/tasador). SIN los ganchos de cocina (enviar_cocina/estaciones = órgano del arquetipo hostelería). Es la entrada del flujo de venta: carrito → (cuenta) → cobro. v0.1 en memoria (persistencia = follow-up). Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/carrito/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `carrito.get.request` | `onGetRequest` | Reflejo JS: el carrito de una cuenta (items + total_centimos). |
| `carrito.add_item.request` | `onAddItemRequest` | Reflejo JS: añade un ítem; lo tasa con opciones.evaluar (o usa precio_unitario_centimos inline). |
| `carrito.remove_item.request` | `onRemoveItemRequest` | Reflejo JS: quita un ítem por id; recalcula total. |
| `carrito.update_item.request` | `onUpdateItemRequest` | Reflejo JS: cambia la cantidad (0 → quita); recalcula subtotal + total. |
| `carrito.vaciar.request` | `onVaciarRequest` | Reflejo JS: vacía el carrito de una cuenta. |
| `carrito.list.request` | `onListRequest` | Reflejo JS: todos los carritos activos. |

## Señales que escucha

- `project.activated` → Reflejo JS: restaura los carritos persistidos de ese proyecto desde /prisma/pos/carrito.json.

## Dependencias (RPC saliente)

- `opciones.evaluar.request`

## Flujo típico

```
// 1. carrito.request → carrito.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
