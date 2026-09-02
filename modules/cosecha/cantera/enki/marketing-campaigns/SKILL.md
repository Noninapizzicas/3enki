---
name: marketing-campaigns
description: >-
  Campañas de marketing: briefing, assets, lanzamiento, cierre con veredicto. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar campañas de marketing del proyecto, invocar
  marketing-campaigns por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de campañas de marketing no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-campaigns, marketing-campañas de marketing]
---

# marketing-campaigns — Campañas de marketing: briefing, assets, lanzamiento, cierre con veredicto

> Módulo marketing-campaigns v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Campañas de marketing: briefing, assets, lanzamiento, cierre con veredicto. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.campaigns.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura las campañas del proyecto activado. |
| `marketing.campaigns.get.request` | Devuelve campañas y resumen del proyecto. |
| `marketing.campaigns.update.request` | Actualiza campañas (crear, editar briefing, cambiar estado). |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.campaigns.actualizado` | Campañas actualizadas. Payload: { project_id, campos_actualizados[] }. |

## Persistencia

Por proyecto en `state/marketing-campaigns.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
