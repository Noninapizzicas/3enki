---
name: arquetipos
description: "Registro ABIERTO de arquetipos de Prisma: semilla en código + custom propuestos por IA y aprobados por humano (anti-wipe). Sirve listar/obtener/clasificar/proponer/aprobar en el bus."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [arquetipos, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · arquetipos

> **Qué es.** Manifest de prisma/arquetipos — REFLEJO JS: el registro ABIERTO de arquetipos de Prisma. Un arquetipo = la FORMA de un producto (ejes+naturalezas) + sus defaults (sub_formas, modelo_precio, organos que enciende). La SEMILLA (comestible·servicio·uso_temporal·pieza) vive en _shared/arquetipos-semilla.js (fuente única del clasificador, compartida con prisma/adaptador). El registro es ABIERTO: la IA PROPONE un arquetipo nuevo cuando un producto no encaja, y un humano lo APRUEBA (anti-wipe: la semilla es intocable, un id ya aprobado no se pisa) — mismo patron que el destilador con las skills. Los custom aprobados entran en la clasificacion con prioridad. Store /prisma/arquetipos.json (project scope v0.1.0; promocion a system-shared es refinamiento posterior). Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/arquetipos/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `arquetipos.listar.request` | `onListarRequest` | Reflejo JS: semilla + custom. |
| `arquetipos.obtener.request` | `onObtenerRequest` | Reflejo JS: un arquetipo por id (semilla o custom). |
| `arquetipos.clasificar.request` | `onClasificarRequest` | Reflejo JS: {ejes,naturalezas} → arquetipo POR LA FORMA (custom aprobados con prioridad). |
| `arquetipos.proponer.request` | `onProponerRequest` | Reflejo JS: registra un arquetipo custom como 'propuesto' (anti-wipe: no pisa semilla ni aprobado). |
| `arquetipos.aprobar.request` | `onAprobarRequest` | Reflejo JS: pasa un custom a 'aprobado' (no aprueba sobre semilla). El humano cierra el anti-wipe. |

## Dependencias (RPC saliente)

- `fs.write.request`

## Flujo típico

```
// 1. arquetipos.request → arquetipos.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
