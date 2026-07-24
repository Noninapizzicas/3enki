---
name: opciones
description: "Motor de opciones de Prisma: valida y precia la selección del cliente contra un ProductoUniversal (variante·modificacion·añadido·personalizacion_libre). Envuelve el banco _shared/motor-opciones."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [opciones, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · opciones

> **Qué es.** Manifest de prisma/opciones — REFLEJO JS que ENVUELVE el banco _shared/motor-opciones.js para el ProductoUniversal. Valida + precia la SELECCIÓN de un cliente contra las opciones de un producto (las 4 sub-formas). El banco (puro, céntimos, modos ELEGIR_UNO/ELEGIR_VARIOS/QUITAR) no se toca; este reflejo mapea: delta_precio (€ del ProductoUniversal) → delta_precio_centimos, y aparta las opciones LIBRE (personalizacion_libre: texto del cliente, sin precio ni cardinalidad) a `libres` para que el frontend recoja el texto. Generaliza pizzepos/variaciones (validar) + el tasador (preciar) a cualquier arquetipo. Ver arquitectura/decisiones/propuestas/prisma.md + AVANZADILLA Opciones en CLAUDE.md.
>
>
> Código: `modules/prisma/opciones/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `opciones.evaluar.request` | `onEvaluarRequest` | Reflejo JS: {producto|catalogo_id+producto_id, selecciones} → valida + precia (céntimos). Aparta las LIBRE a `libres`. |

## Dependencias (RPC saliente)

- `catalogo.get.request`

## Flujo típico

```
// 1. opciones.request → opciones.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
