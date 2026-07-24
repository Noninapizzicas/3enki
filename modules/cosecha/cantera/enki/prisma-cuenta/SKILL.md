---
name: cuenta
description: "Ticket/cuenta universal de Prisma: abre → (carrito) → cobra → cierra. Copiado de cuentas, sin los estados de hostelería."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [cuenta, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · cuenta

> **Qué es.** Manifest de prisma/cuenta — REFLEJO JS: el TICKET/cuenta (envoltorio del flujo de venta, generalizado de pizzepos/cuentas). Ata carrito↔cobro bajo un ticket con su ciclo: abierta → cobrada → cerrada. Estados GENÉRICOS (sin en_preparacion/listo/entregado de hostelería — esos los añade el órgano cocina). Reacciona a cobro.procesado para marcar la cuenta pagada. v0.1 en memoria. Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/cuenta/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `cuenta.crear.request` | `onCrearRequest` | Reflejo JS: abre una cuenta/ticket (idempotente por cuenta_id si se pasa). |
| `cuenta.get.request` | `onGetRequest` | Reflejo JS: una cuenta por id. |
| `cuenta.list.request` | `onListRequest` | Reflejo JS: cuentas (filtro estado). |
| `cuenta.cerrar.request` | `onCerrarRequest` | Reflejo JS: cierra una cuenta (estado cerrada). |

## Señales que escucha

- `cobro.procesado` → Reflejo JS (señal): un cobro se completó → marca la cuenta pagada + total + estado cobrada.
- `project.activated` → Reflejo JS: restaura las cuentas persistidas de ese proyecto desde /prisma/pos/cuenta.json.

## Flujo típico

```
// 1. cuenta.request → cuenta.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
