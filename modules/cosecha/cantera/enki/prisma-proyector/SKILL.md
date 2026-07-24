---
name: proyector
description: "Proyector sin estado de Prisma: ProductoUniversal (catalogo activo) -> vista de consumo, al vuelo. Gemelo generalizado de pizzepos/productos."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [proyector, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · proyector

> **Qué es.** Manifest de prisma/proyector — REFLEJO JS SIN ESTADO (gemelo de pizzepos/productos, generalizado). Proyecta el ProductoUniversal del catalogo activo a una VISTA de consumo al vuelo (vista == proyectar(catalogo_activo) SIEMPRE). No tiene store: lee via catalogo.get/list.request (producto-manager) y proyecta. Domain propio 'vista.*' para no colisionar con catalogo.* (que posee producto-manager, el writer). Reacciona a catalogo.{actualizado,editado,borrado} re-emitiendo la senal vista.actualizada (sin sincronizar nada). Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/proyector/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `vista.completa.request` | `onVistaCompletaRequest` | Reflejo JS: proyecta el catalogo activo entero (categorias + productos vista + verdades_obligatorias). |
| `vista.productos.request` | `onVistaProductosRequest` | Reflejo JS: lista de productos proyectados (filtros categoria/arquetipo). |
| `vista.producto.request` | `onVistaProductoRequest` | Reflejo JS: un producto proyectado por id. |
| `vista.buscar.request` | `onVistaBuscarRequest` | Reflejo JS: busca productos por query en el catalogo activo. |

## Señales que escucha

- `catalogo.actualizado` → Reflejo JS (senal): el catalogo cambio; re-emite vista.actualizada (proyeccion lite). Sin store que sincronizar.
- `catalogo.editado` → Reflejo JS (senal): idem, para las mutaciones estructuradas (_mutar de producto-manager).
- `catalogo.borrado` → Reflejo JS (senal): el catalogo borrado deja de ser el activo; re-proyecta el que quede (o vista vacia).
- `project.activated` → Reflejo JS (warm): proyecta el catalogo activo y emite vista.actualizada al arrancar el proyecto.

## Dependencias (RPC saliente)

- `catalogo.get.request`
- `catalogo.list.request`

## Flujo típico

```
// 1. proyector.request → proyector.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
