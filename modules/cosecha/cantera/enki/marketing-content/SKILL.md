---
name: marketing-content
description: >-
  Catálogo de piezas de contenido: formato, canal, funnel, ciclo de vida. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar catálogo de piezas de contenido del proyecto, invocar
  marketing-content por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de catálogo de piezas de contenido no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-content, marketing-catálogo de piezas de contenido]
---

# marketing-content — Catálogo de piezas de contenido: formato, canal, funnel, ciclo de vida

> Módulo marketing-content v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Catálogo de piezas de contenido: formato, canal, funnel, ciclo de vida. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.content.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura el contenido del proyecto activado. |
| `marketing.content.get.request` | Devuelve piezas de contenido y resumen del proyecto. |
| `marketing.content.update.request` | Actualiza piezas de contenido (crear, editar, transicionar estado). |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.content.actualizado` | El contenido fue actualizado. Payload: { project_id, campos_actualizados[] }. |

## Persistencia

Por proyecto en `state/marketing-content.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
