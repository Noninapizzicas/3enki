---
name: marketing-analytics
description: >-
  Medición de marketing: KPIs, experimentación (A/B), atribución, reporting. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar medición de marketing del proyecto, invocar
  marketing-analytics por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de medición de marketing no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-analytics, marketing-medición de marketing]
---

# marketing-analytics — Medición de marketing: KPIs, experimentación (A/B), atribución, reporting

> Módulo marketing-analytics v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Medición de marketing: KPIs, experimentación (A/B), atribución, reporting. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.analytics.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura analytics del proyecto activado. |
| `marketing.analytics.get.request` | Devuelve métricas, experimentos y resumen del proyecto. |
| `marketing.analytics.update.request` | Actualiza métricas o experimentos (registrar valor, crear experimento, añadir datos). |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.analytics.actualizado` | Analytics actualizados. Payload: { project_id, campos_actualizados[] }. |

## Persistencia

Por proyecto en `state/marketing-analytics.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
