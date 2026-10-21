---
name: marketing-channels
description: >-
  Canales de marketing del proyecto: catálogo por clasificación con estado operativo. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar canales de marketing del proyecto, invocar
  marketing-channels por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de canales de marketing del proyecto no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-channels, marketing-canales de marketing del proyecto]
---

# marketing-channels — Canales de marketing del proyecto: catálogo por clasificación con estado operativo

> Módulo marketing-channels v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Canales de marketing del proyecto: catálogo por clasificación con estado operativo. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.channels.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura los canales del proyecto activado. |
| `marketing.channels.get.request` | Devuelve los canales del proyecto (opcionalmente filtrados por clasificación). |
| `marketing.channels.update.request` | Actualiza canales del proyecto (alta, modificación, cambio de estado). |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.channels.actualizado` | Un canal fue creado o actualizado. Payload: { project_id, canal_id, campos_actualizados[] }. |

## Persistencia

Por proyecto en `state/marketing-channels.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
