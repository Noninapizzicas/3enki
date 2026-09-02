---
name: marketing-audience
description: >-
  Audiencia de marketing: segmentos declarativos + personas (manuales o LLM). Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar audiencia de marketing del proyecto, invocar
  marketing-audience por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de audiencia de marketing no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-audience, marketing-audiencia de marketing]
---

# marketing-audience — Audiencia de marketing: segmentos declarativos + personas (manuales o LLM)

> Módulo marketing-audience v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Audiencia de marketing: segmentos declarativos + personas (manuales o LLM). Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.audience.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura la audiencia del proyecto activado. |
| `marketing.audience.get.request` | Devuelve segmentos y personas del proyecto (opcionalmente filtrados por tipo). |
| `marketing.audience.update.request` | Actualiza segmentos y/o personas del proyecto (alta, modificación, cambio de estado). |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.audience.actualizada` | La audiencia fue actualizada. Payload: { project_id, campos_actualizados[] }. |
| `marketing.audience.generar-persona.response` | Persona generada por blueprint. Payload: { project_id, persona }. |

## Persistencia

Por proyecto en `state/marketing-audience.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
