---
name: marketing-calendar
description: >-
  Calendario editorial: planificación de acciones y cadencia por canal. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar calendario editorial del proyecto, invocar
  marketing-calendar por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de calendario editorial no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-calendar, marketing-calendario editorial]
---

# marketing-calendar — Calendario editorial: planificación de acciones y cadencia por canal

> Módulo marketing-calendar v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Calendario editorial: planificación de acciones y cadencia por canal. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.calendar.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura el calendario del proyecto activado. |
| `marketing.calendar.get.request` | Devuelve entradas, marcas estacionales, cadencias y resumen del proyecto. |
| `marketing.calendar.update.request` | Actualiza entradas, marcas estacionales o cadencias. |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.calendar.actualizado` | El calendario fue actualizado. Payload: { project_id, campos_actualizados[] }. |

## Persistencia

Por proyecto en `state/marketing-calendar.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
