---
name: reglas-aprendidas-validacion
description: >-
  MICRO-AGENTE del vertical NICHOS: tras cada lote de validacion completado,
  destila patrones recurrentes del historial y propone reglas de validacion
  aprendidas via ai-gateway. Persiste historial de patrones con PosPersistencia.
  Carga este modulo cuando el sistema de validacion necesite aprender de sus
  resultados, cuando quieras proponer ajustes de umbral automaticos, o cuando
  reacciones al PULSO nichos.regla.aprendida.propuesta.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, aprendizaje, reglas, validacion, llm, pos-persistencia, bus, mqtt]
---

# nichos · reglas-aprendidas-validacion

> **Que es.** MICRO-AGENTE del vertical NICHOS que destila reglas de validacion
> aprendidas del historial de lotes completados. Usa ai-gateway para detectar
> patrones recurrentes y propone ajustes de umbral al dueno.
>
> Codigo: `modules/nichos/reglas-aprendidas-validacion/index.js`. La verdad viva
> es el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (LLM via ai-gateway + estado persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/reglas-aprendidas.json` dentro del storage del proyecto.
- Historial: acumula resultados de lotes (max 50 entradas), los destila con LLM.

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.aprendizaje.proponer.request` | `onProponerRequest` | `{status:200, data:{solicitud_decision:{tipo, propuestas[]}}}` o `{status:200, data:{vacio:true, razon}}` |

## Senales que escucha (fire-and-forget)

| Evento | Handler | Que hace |
|---|---|---|
| `nichos.validacion.lote.completado` | `onLoteCompletado` | Registra resultados en historial y analiza patrones si hay suficiente historial (>=3 lotes). |
| `project.activated` | `onProjectActivated` | Restaura historial persistido del proyecto. |

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.regla.aprendida.propuesta` | tras destilar un patron con umbral sugerido | `{project_id, patron, umbral_actual, umbral_sugerido, timestamp}` |
| `nichos.decision.solicitud.abierta` | cuando una propuesta requiere decision del dueno | `{project_id, tipo, patron, timestamp}` |

## Invariantes

- **Historial acotado**: maximo 50 entradas; al exceder, se podan las mas antiguas.
- **Umbral de analisis**: el LLM solo se invoca cuando hay >= 3 lotes procesados.
- **Degradacion honesta**: si el LLM falla, el historial se conserva y el analisis se reintenta en el siguiente lote.

## Integracion (patron RPC del bus)

```javascript
// PROPONER reglas aprendidas
const resp = await bus.publishAndWait('nichos.aprendizaje.proponer.request', {
  project_id
});
const propuestas = resp.data.solicitud_decision?.propuestas || [];
```

## Donde encaja en el vertical NICHOS

- Escucha `nichos.validacion.lote.completado` emitido por **batch-validacion**.
- Emite `nichos.decision.solicitud.abierta` que el **Jefe (K)** recoge para
  consultar al dueno.
- Las reglas aprendidas alimentan al motor de validacion para afinar umbrales
  de forma autonoma.
