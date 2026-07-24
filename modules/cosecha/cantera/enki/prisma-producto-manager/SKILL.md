---
name: producto-manager
description: "Custodio del catalogo de ProductoUniversal (Prisma). Reflejo JS que sirve las ops deterministas (CRUD + versionado + validacion) en el bus (catalogo.<op>.request). Aggregate root de la vertical universal: cualquier arquetipo de producto (comestible, pieza, servicio, uso-temporal...) vive con la misma forma de 5 huecos. Copiado de carta-manager, generalizado de pizza a producto universal."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [producto-manager, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · producto-manager

> **Qué es.** Manifest de prisma/producto-manager — REFLEJO JS puro (aggregate root de Prisma). Copiado y generalizado de pizzepos/carta-manager: misma fontanería (custodio + _mutar versionado + freno), girando la forma del item de 'producto pizza' (ingredientes/variaciones/dietas) al ProductoUniversal (los 5 huecos: identidad · restricciones · contrato{atributos_saber/opciones/estados} · no_objetivos · preguntas_abiertas + arquetipo + ejes + naturalezas + madurez). Custodio unico de /prisma/catalogo/<id>.json (+ .versions/). El adaptador (prisma/adaptador, futuro) DESCOMPONE un producto crudo y escribe aqui via catalogo.<op>.request; el proyector (prisma/proyector) LEE. Ningun hermano escribe al store directamente. Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/producto-manager/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `catalogo.save.request` | `onSaveRequest` | Reflejo JS: persiste el catalogo (snapshot+version++) y emite catalogo.actualizada. |
| `catalogo.get.request` | `onGetRequest` | Reflejo JS: un catalogo completo por id. |
| `catalogo.list.request` | `onListRequest` | Reflejo JS: lista resumida de catalogos (filtros estado/tag). |
| `catalogo.delete.request` | `onDeleteRequest` | Reflejo JS: soft-delete (estado=archivado), emite catalogo.borrado. |
| `catalogo.add_product.request` | `onAddProductRequest` | Reflejo JS: anyade un ProductoUniversal (normaliza los 5 huecos; valida categoria_id si viene). |
| `catalogo.remove_product.request` | `onRemoveProductRequest` | Reflejo JS: quita un producto por id. |
| `catalogo.update_product.request` | `onUpdateProductRequest` | Reflejo JS: edita huecos de un producto (identidad, restricciones, contrato, ejes, naturalezas, preguntas_abiertas, madurez). |
| `catalogo.add_category.request` | `onAddCategoryRequest` | Reflejo JS: anyade una categoria (dedup por nombre). |
| `catalogo.validar.request` | `onValidarRequest` | Reflejo JS (FRENO): valida un producto o el catalogo entero contra la forma de 5 huecos de Prisma. Funcion pura. No exige completitud de borrador. |
| `catalogo.activar.request` | `onActivarRequest` | Reflejo JS: pone un catalogo en_servicio (patch de 1 campo) y baja a borrador cualquier OTRO activo. |
| `catalogo.clonar.request` | `onClonarRequest` | Reflejo JS: clona un catalogo como copia independiente. |
| `catalogo.search.request` | `onSearchRequest` | Reflejo JS: busca catalogos/productos por query. |
| `catalogo.stats.request` | `onStatsRequest` | Reflejo JS: totales y desglose por estado/arquetipo/madurez. |
| `catalogo.versions.request` | `onVersionsRequest` | Reflejo JS: lista los snapshots de un catalogo. |
| `catalogo.restore.request` | `onRestoreRequest` | Reflejo JS: restaura una version (snapshot previo + version++). |

## Señales que escucha

- `producto.adaptado` → Reflejo JS (fire-and-forget): el adaptador publica producto.adaptado (crudo descompuesto en 5 huecos); el reflejo lo persiste en el catalogo del proyecto via add_product/update_product (idempotente por id).

## Dependencias (RPC saliente)

- `fs.read.request`
- `fs.write.request`
- `fs.edit.request`
- `fs.list.request`
- `fs.list.request`

## Flujo típico

```
// 1. producto-manager.request → producto-manager.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
