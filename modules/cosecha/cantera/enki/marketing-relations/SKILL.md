---
name: marketing-relations
description: >-
  Relación con la audiencia: suscriptores, consentimiento y preferencias. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar relación con la audiencia del proyecto, invocar
  marketing-relations por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de relación con la audiencia no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-relations, marketing-relación con la audiencia]
---

# marketing-relations — Relación con la audiencia: suscriptores, consentimiento y preferencias

> Módulo marketing-relations v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Relación con la audiencia: suscriptores, consentimiento y preferencias. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.relations.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura suscriptores e interacciones del proyecto activado. |
| `marketing.relations.get.request` | Devuelve suscriptores, interacciones y resumen del proyecto. |
| `marketing.relations.update.request` | Actualiza suscriptores (crear, editar, cambiar estado) y registra interacciones. |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.relations.actualizado` | Relaciones actualizadas. Payload: { project_id, campos_actualizados[] }. |

## Persistencia

Por proyecto en `state/marketing-relations.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
