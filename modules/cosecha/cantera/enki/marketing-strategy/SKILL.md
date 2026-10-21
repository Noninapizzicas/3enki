---
name: marketing-strategy
description: >-
  Estrategia de marketing del proyecto: posicionamiento y objetivos medibles. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar estrategia, invocar
  marketing-strategy por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de estrategia no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-strategy, marketing-estrategia]
---

# marketing-strategy — Estrategia de marketing del proyecto: posicionamiento y objetivos medibles

> Módulo marketing-strategy v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Estrategia de marketing del proyecto: posicionamiento y objetivos medibles. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.strategy.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura la estrategia del proyecto activado. |
| `marketing.strategy.get.request` | Devuelve la estrategia completa de un proyecto. |
| `marketing.strategy.update.request` | Actualiza campos de la estrategia (parcial). |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.strategy.actualizada` | La estrategia fue actualizada. Payload: { project_id, campos_actualizados[] }. |

## Persistencia

Por proyecto en `state/marketing-strategy.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
