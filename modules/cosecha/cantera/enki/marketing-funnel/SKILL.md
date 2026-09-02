---
name: marketing-funnel
description: >-
  Embudo de marketing: etapas, flujos de conversión y cuellos de botella. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar embudo de marketing del proyecto, invocar
  marketing-funnel por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de embudo de marketing no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-funnel, marketing-embudo de marketing]
---

# marketing-funnel — Embudo de marketing: etapas, flujos de conversión y cuellos de botella

> Módulo marketing-funnel v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Embudo de marketing: etapas, flujos de conversión y cuellos de botella. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.funnel.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura el funnel del proyecto activado. |
| `marketing.funnel.get.request` | Devuelve etapas, flujos, cuello de botella y resumen del proyecto. |
| `marketing.funnel.update.request` | Actualiza etapas o registra flujos de conversión. |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.funnel.actualizado` | El funnel fue actualizado. Payload: { project_id, campos_actualizados[] }. |

## Persistencia

Por proyecto en `state/marketing-funnel.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
