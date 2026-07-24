---
name: coste
description: "Calculadora de coste/margen/pvp de Prisma (cara comerciante). Envuelve la aritmética de escandallo+viabilidad en genérico; los costes los pone el comerciante, coste no inventa."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [coste, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · coste

> **Qué es.** Manifest de prisma/coste — REFLEJO JS: la cara COMERCIANTE. Calculadora determinista coste → margen → pvp, en CÉNTIMOS (coherente con opciones/tasador). Los componentes de coste los aporta el COMERCIANTE (son la respuesta a las preguntas_abiertas de coste del ProductoUniversal): coste NO inventa precios, solo calcula. Generaliza la aritmética de escandallo (Σ coste de componentes) + viabilidad (food cost objetivo → pvp sugerido; pvp → margen/food cost real) sin lo específico de ingredientes/Mercadona. Función pura, sin store. Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/coste/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `coste.costear.request` | `onCostearRequest` | Reflejo JS: {componentes[{coste_centimos,cantidad?}], coste_extra_centimos?, food_cost_objetivo?, pvp_centimos?} → {coste_total_centimos, pvp_sugerido_centimos?, food_cost_real?, margen?}. |
| `coste.aplicar.request` | `onAplicarRequest` | Reflejo JS: {project_id, catalogo_id, producto_id, + inputs de costear (pvp_centimos | food_cost_objetivo)} → LEE catalogo.get, escribe precio_base_centimos, marca la pregunta de coste respondida (+madurez 'listo' si procede) via catalogo.update_product, emite coste.aplicado. |

## Dependencias (RPC saliente)

- `catalogo.get.request`
- `catalogo.update_product.request`

## Flujo típico

```
// 1. coste.request → coste.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
