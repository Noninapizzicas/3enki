---
name: formulador
description: "Manifest de prisma/formulador — el ACTOR FUZZY de la parcela compuestos, en forma prisma (event-driven, NO agent-framework, NO página). Aloja MICRO-AGENTES perspectiva-c: cada uno es un handler de evento donde el REFLEJO hidrata el contexto (determinista) y persiste, y el paso fuzzy es UNA llamada llm.complete.request con su guión-prompt + contexto, devolviendo JSON TIPADO validado (si no cumple → error, NUNCA inventa). Tres micro-agentes: RECONCILIAR (nombre crudo + candidatos → decidir usar/crear/preguntar) · MODELAR (texto de formulación → nombre + componentes con cantidad/unidad, reconcilia cada uno y persiste el compuesto) · CLASIFICAR (item + eje → familia/subfamilia/grupo o propuesta nueva). Cero llamada LLM en lo determinista. Ver la skill prisma-compuestos y arquitectura/decisiones/propuestas/prisma-compuestos.md."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [formulador, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · formulador

> **Qué es.** Manifest de prisma/formulador — el ACTOR FUZZY de la parcela compuestos, en forma prisma (event-driven, NO agent-framework, NO página). Aloja MICRO-AGENTES perspectiva-c: cada uno es un handler de evento donde el REFLEJO hidrata el contexto (determinista) y persiste, y el paso fuzzy es UNA llamada llm.complete.request con su guión-prompt + contexto, devolviendo JSON TIPADO validado (si no cumple → error, NUNCA inventa). Tres micro-agentes: RECONCILIAR (nombre crudo + candidatos → decidir usar/crear/preguntar) · MODELAR (texto de formulación → nombre + componentes con cantidad/unidad, reconcilia cada uno y persiste el compuesto) · CLASIFICAR (item + eje → familia/subfamilia/grupo o propuesta nueva). Cero llamada LLM en lo determinista. Ver la skill prisma-compuestos y arquitectura/decisiones/propuestas/prisma-compuestos.md.
>
>
> Código: `modules/prisma/formulador/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `formulador.reconciliar.request` | `onReconciliarRequest` | Micro-agente FUZZY: {project_id, nombre_crudo, candidatos:[{id,nombre,score}]} (de insumos.buscar) → decide {accion:'usar'|'crear'|'preguntar', insumo_id?, motivo}. Pilla sinónimo/idioma que el reflejo no; ambiguo variante↔mismo → 'preguntar'. No inventa. |
| `formulador.modelar.request` | `onModelarRequest` | Micro-agente FUZZY: {project_id, crudo} (texto de formulación) → estructura {nombre, componentes:[{nombre_crudo,cantidad,unidad}]}, RECONCILIA cada componente (insumos.buscar + reconciliar) y PERSISTE el compuesto (compuestos.crear). Cantidad ausente → null (pregunta_abierta), no se inventa. |
| `formulador.clasificar.request` | `onClasificarRequest` | Micro-agente FUZZY: {project_id, item_nombre, eje, taxonomia:[...]} → {familia, subfamilia, grupo, propuesta_nueva?}. Reusa la taxonomía existente; si no encaja, PROPONE nueva (humano aprueba). |

## Dependencias (RPC saliente)

- `llm.complete.request`
- `insumos.buscar.request`
- `insumos.crear.request`
- `compuestos.crear.request`

## Flujo típico

```
// 1. formulador.request → formulador.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
