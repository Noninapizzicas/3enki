---
name: ticket
description: "Recibo/ticket universal de Prisma: formatea la venta (ítems + total) en texto imprimible. Copiado de impresion, solo la parte de recibo."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [ticket, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · ticket

> **Qué es.** Manifest de prisma/ticket — REFLEJO JS: el RECIBO (generalizado de pizzepos/impresion). Formatea un ticket de venta en texto (ancho 32/58mm por defecto) desde los ítems del carrito + el total, en céntimos → €. Sin la 'comanda' de cocina (eso es hostelería). Emite ticket.generado; el envío a impresora física es best-effort/follow-up. Función de formateo PURA. Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/ticket/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `ticket.formatear.request` | `onFormatearRequest` | Reflejo JS: ítems + total → recibo en texto; emite ticket.generado. |

## Flujo típico

```
// 1. ticket.request → ticket.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
