---
name: cobro
description: "Pago universal de Prisma (cobro): cobra el carrito (efectivo/tarjeta/bizum/transferencia/mixto), en céntimos. Copiado de cobros, sin lo específico de pizzepos."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [cobro, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · cobro

> **Qué es.** Manifest de prisma/cobro — REFLEJO JS: el PAGO universal (copiado y generalizado de pizzepos/cobros). Cobra el total de un carrito: efectivo (con cambio), tarjeta, bizum, transferencia, mixto (split). Ciclo pendiente → completado → reembolsado. CAMBIO vs cobros: dinero en CÉNTIMOS (coherente con carrito/opciones); toma el total del carrito (carrito.get) o inline; sin llevadoo/cajón/link/qr (integraciones externas = follow-up). Cierra el lazo mínimo de venta: carrito → cobro. v0.1 en memoria. Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/cobro/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `cobro.crear.request` | `onCrearRequest` | Reflejo JS: inicia un cobro por el total del carrito (o monto_centimos inline); calcula cambio (efectivo) o valida el split (mixto). |
| `cobro.confirmar.request` | `onConfirmarRequest` | Reflejo JS: pendiente/procesando → completado; emite cobro.procesado. |
| `cobro.reembolsar.request` | `onReembolsarRequest` | Reflejo JS: completado → reembolsado; emite cobro.reembolsado. |
| `cobro.get.request` | `onGetRequest` | Reflejo JS: un cobro por id. |
| `cobro.list.request` | `onListRequest` | Reflejo JS: cobros (filtros estado/cuenta). |
| `cobro.metodos.request` | `onMetodosRequest` | Reflejo JS: métodos de pago disponibles. |

## Señales que escucha

- `project.activated` → Reflejo JS: restaura los cobros persistidos de ese proyecto desde /prisma/pos/cobro.json.

## Dependencias (RPC saliente)

- `carrito.get.request`

## Flujo típico

```
// 1. cobro.request → cobro.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
