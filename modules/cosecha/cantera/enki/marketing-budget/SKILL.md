---
name: marketing-budget
description: >-
  Presupuesto de marketing: asignación por partida, gastos y control. Reflejo puro (almacena y valida decisiones del dueño) del subsistema de
  marketing. Úsala para leer/actualizar el módulo, saber qué eventos escucha y
  publica, o entender cómo persiste el dato. Forma parte de las 12 skills de
  marketing que usa el agente fase-0-marketing.
when-to-use: >-
  El dueño o un agente necesita leer/actualizar presupuesto de marketing del proyecto, invocar
  marketing-budget por RPC, o entender sus eventos. También al diagnosticar por qué el
  dato de presupuesto de marketing no persiste o no se refleja.
source: hermes
tags: [enki, marketing, marketing-budget, marketing-presupuesto de marketing]
---

# marketing-budget — Presupuesto de marketing: asignación por partida, gastos y control

> Módulo marketing-budget v0.1.0 (es). REFLEJO: almacena y valida decisiones
> del dueño; no interpreta ni genera contenido por sí mismo.

## Propósito

Presupuesto de marketing: asignación por partida, gastos y control. Es uno de los 12 módulos del subsistema de marketing — el agente
`fase-0-marketing` lo rellena entrevistando al dueño.

## RPC (ui/request o bus)

Acciones: `get, update` — vía `marketing.budget.<accion>.request` → `.response`.

## Eventos que escucha

| Evento | Descripción |
|---|---|
| `project.activated` | Restaura el presupuesto del proyecto activado. |
| `marketing.budget.get.request` | Devuelve presupuesto, partidas, gastos y control del proyecto. |
| `marketing.budget.update.request` | Actualiza presupuesto, partidas o registra gastos. |

## Eventos que publica

| Evento | Descripción |
|---|---|
| `marketing.budget.actualizado` | El presupuesto fue actualizado. Payload: { project_id, campos_actualizados[] }. |
| `marketing.budget.alerta` | Gasto supera asignación de una partida. Payload: { project_id, partida_id, asignado, gastado }. |

## Persistencia

Por proyecto en `state/marketing-budget.json`. `project.activated` restaura el dato del
proyecto activo. RPC `*.update.request` actualiza campos parciales y emite el
evento `*.actualizado`.

## Notas

- Reflejo puro: valida completitud y tipos, no inventa datos.
- Forma parte de la cúpula de marketing (12 módulos).
