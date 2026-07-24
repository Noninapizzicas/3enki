---
name: insumos
description: "Manifest de prisma/insumos — REFLEJO JS: el CUSTODIO de la biblioteca de INSUMOS (materia prima) de prisma. Store propio en /prisma/insumos/<id>.json (+ .versions/<id>/<ts>.json), escritura atómica. Es la pieza que hace posible el PASO 0 de la skill prisma-compuestos: `buscar` devuelve candidatos rankeados por similitud (normaliza tildes/mayúsculas/plural + solape de tokens) para RECONCILIAR antes de crear — así la biblioteca no se duplica (una harina, una identidad, un precio, un sitio). El coste del insumo es de REFERENCIA en fase 1 (web/manual); el real llega en fase 2 (post-venta). NO calcula recetas (eso es el costeador) ni toca producto/venta. Ver arquitectura/decisiones/propuestas/prisma-compuestos.md y la skill prisma-compuestos."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [insumos, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · insumos

> **Qué es.** Manifest de prisma/insumos — REFLEJO JS: el CUSTODIO de la biblioteca de INSUMOS (materia prima) de prisma. Store propio en /prisma/insumos/<id>.json (+ .versions/<id>/<ts>.json), escritura atómica. Es la pieza que hace posible el PASO 0 de la skill prisma-compuestos: `buscar` devuelve candidatos rankeados por similitud (normaliza tildes/mayúsculas/plural + solape de tokens) para RECONCILIAR antes de crear — así la biblioteca no se duplica (una harina, una identidad, un precio, un sitio). El coste del insumo es de REFERENCIA en fase 1 (web/manual); el real llega en fase 2 (post-venta). NO calcula recetas (eso es el costeador) ni toca producto/venta. Ver arquitectura/decisiones/propuestas/prisma-compuestos.md y la skill prisma-compuestos.
>
>
> Código: `modules/prisma/insumos/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `insumos.buscar.request` | `onBuscarRequest` | Reflejo PURO (reconciliación): {project_id, nombre} → candidatos rankeados por similitud (normaliza + solape de tokens). El adaptador elige/pregunta antes de crear. NO crea nada. |
| `insumos.crear.request` | `onCrearRequest` | Reflejo: {project_id, nombre, naturalezas?, clasificacion_ref?} → crea el insumo canónico en /prisma/insumos/<slug>.json. Create-only (409 si el slug existe → actualizar). Valida y persiste atómico. Emite insumo.creado. |
| `insumos.get.request` | `onGetRequest` | Reflejo: {project_id, insumo_id} → el insumo completo, o 404. |
| `insumos.list.request` | `onListRequest` | Reflejo: {project_id} → catálogo barato de insumos (id·nombre·familia·precio). |
| `insumos.actualizar.request` | `onActualizarRequest` | Reflejo: {project_id, insumo_id, campos} → parcha el insumo (precio de referencia, clasificación…), snapshot previo. Un cambio de precio dispara re-costeo en cascada (lo hace el costeador). Emite insumo.actualizado. |

## Dependencias (RPC saliente)

- `fs.read.request`
- `fs.write.request`
- `fs.list.request`

## Flujo típico

```
// 1. insumos.request → insumos.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
