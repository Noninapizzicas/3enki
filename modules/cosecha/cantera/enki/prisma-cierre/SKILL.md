---
name: cierre
description: "Cierre de caja universal de Prisma: cuadre del día (total + por método). Copiado de persistencia-comandero, la parte del cuadre."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [cierre, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · cierre

> **Qué es.** Manifest de prisma/cierre — REFLEJO JS: el CIERRE DE CAJA / cuadre del día (generalizado de pizzepos/persistencia-comandero). Acumula los cobros completados (cobro.procesado) y produce el cuadre: total + desglose por método de pago + nº de ventas. Universal (cualquier comercio con caja). v0.1 en memoria. Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/cierre/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `cierre.cerrar_caja.request` | `onCerrarCajaRequest` | Reflejo JS: produce el cuadre del día (total + por método + nº ventas) y resetea. |
| `cierre.estado.request` | `onEstadoRequest` | Reflejo JS: el acumulado actual (sin cerrar). |

## Señales que escucha

- `cobro.procesado` → Reflejo JS (señal): un cobro se completó → acumula la venta para el cuadre.
- `project.activated` → Reflejo JS: restaura las ventas del día persistidas de ese proyecto desde /prisma/pos/cierre.json.

## Flujo típico

```
// 1. cierre.request → cierre.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
