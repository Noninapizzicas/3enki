---
name: boss
description: "Orquestador de Prisma: comercio = conjunto de arquetipos de sus productos → unión de órganos a encender. Calcula el plan y lo señala; el enforcement lo consume aparte."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [boss, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · boss

> **Qué es.** Manifest de prisma/boss — REFLEJO JS: el ORQUESTADOR de Prisma. Un comercio NO se declara 'pizzería' o 'peluquería': su identidad EMERGE de sus productos. BOSS calcula el PLAN del comercio = el conjunto de arquetipos en los que caen sus productos (leídos del catálogo via producto-manager) → la unión de los ORGANOS que esos arquetipos encienden (leídos de prisma/arquetipos: cada arquetipo declara organos[]). BOSS es el CEREBRO (calcula qué necesita el comercio y lo señala en boss.plan.actualizado); la APLICACION real (cargar páginas/packs/blueprints, gatear interruptores) la hace quien escuche el plan — separado, como manda el reparto reflejo/enforcement. Ver arquitectura/decisiones/propuestas/prisma.md + RUMBO en CLAUDE.md.
>
>
> Código: `modules/prisma/boss/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `boss.plan.request` | `onPlanRequest` | Reflejo JS: {project_id} → {arquetipos, organos, productos_por_arquetipo}. |
| `boss.estado.request` | `onEstadoRequest` | Reflejo JS: resumen del comercio (arquetipos + órganos + nº productos). |

## Señales que escucha

- `catalogo.actualizado` → Reflejo JS (señal): el catálogo cambió → recalcula y emite boss.plan.actualizado (un producto nuevo puede encender un órgano nuevo).
- `catalogo.editado` → Reflejo JS (señal): idem para mutaciones estructuradas.
- `catalogo.borrado` → Reflejo JS (señal): idem.
- `project.activated` → Reflejo JS (warm): calcula el plan y emite boss.plan.actualizado al arrancar el proyecto.

## Dependencias (RPC saliente)

- `catalogo.list.request`
- `catalogo.get.request`
- `arquetipos.listar.request`

## Flujo típico

```
// 1. boss.request → boss.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
