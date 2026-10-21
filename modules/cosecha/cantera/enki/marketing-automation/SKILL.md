---
name: marketing-automation
description: >-
  Automatización de marketing: flujos con trigger y pasos deterministas. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar automatización de marketing del proyecto, invocar
  marketing-automation por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de automatización de marketing no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-automation, marketing-automatización de marketing]
---

# marketing-automation — Automatización de marketing: flujos con trigger y pasos deterministas

> Módulo marketing-automation v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Automatización de marketing: flujos con trigger y pasos deterministas. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.automation.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura los flujos de automatización del proyecto activado. |
| `marketing.automation.get.request` | Devuelve flujos de automatización y resumen del proyecto. |
| `marketing.automation.update.request` | Actualiza flujos (crear, editar, cambiar estado, registrar ejecución). |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.automation.actualizado` | Flujos actualizados. Payload: { project_id, campos_actualizados[] }. |

## Persistencia

Por proyecto en `state/marketing-automation.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
