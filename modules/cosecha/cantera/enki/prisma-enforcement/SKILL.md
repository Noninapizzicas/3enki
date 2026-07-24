---
name: enforcement
description: "El efector del BOSS: consume boss.plan.actualizado y enciende los órganos del comercio vía el panel central de interruptores. Additivo-seguro; no apaga solo."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [enforcement, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · enforcement

> **Qué es.** Manifest de prisma/enforcement — REFLEJO JS: el EFECTOR del BOSS. CEREBRO≠ENFORCEMENT: el BOSS calcula el PLAN (qué órganos necesita el comercio) y lo señala en boss.plan.actualizado; este módulo lo CONSUME y lo APLICA, encendiendo el interruptor de cada órgano necesario en el panel central (organo-<id>), que el dueño del órgano reacciona en caliente (patrón interruptor.registrar/cambiado). Postura v0.1: ADDITIVO (enciende lo necesario, edge-triggered por proyecto, idempotente) · NO APAGA solo (un órgano que sobra recibe solo TESTIGO boss.organo.innecesario — la voluntad de apagar es humana, como la apoptosis de la homeostasis) · SIN FALLO MUDO (registra el interruptor de cada órgano al vuelo, custom incluidos). Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/enforcement/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `enforcement.estado.request` | `onEstadoRequest` | Reflejo JS: {project_id} → {aplicados, organos_conocidos, registrados}. |

## Señales que escucha

- `boss.plan.actualizado` → Reflejo JS: el BOSS recalculó el plan → enciende los interruptores de los órganos necesarios (edge-triggered por proyecto) + testigo de los sobrantes.
- `interruptor.solicitar_registro` → Reflejo JS: interruptores (re)cargó y pide registro → re-anuncia los interruptores organo-<id>.

## Flujo típico

```
// 1. enforcement.request → enforcement.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
