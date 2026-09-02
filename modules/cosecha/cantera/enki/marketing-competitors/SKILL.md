---
name: marketing-competitors
description: >-
  Competencia de marketing: registro de competidores, monitorización y diferenciación. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar competencia de marketing del proyecto, invocar
  marketing-competitors por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de competencia de marketing no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-competitors, marketing-competencia de marketing]
---

# marketing-competitors — Competencia de marketing: registro de competidores, monitorización y diferenciación

> Módulo marketing-competitors v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Competencia de marketing: registro de competidores, monitorización y diferenciación. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.competitors.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura los competidores del proyecto activado. |
| `marketing.competitors.get.request` | Devuelve competidores, observaciones, dimensiones y comparativa del proyecto. |
| `marketing.competitors.update.request` | Actualiza competidores, observaciones, dimensiones o puntuaciones. |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.competitors.actualizado` | La competencia fue actualizada. Payload: { project_id, campos_actualizados[] }. |

## Persistencia

Por proyecto en `state/marketing-competitors.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
