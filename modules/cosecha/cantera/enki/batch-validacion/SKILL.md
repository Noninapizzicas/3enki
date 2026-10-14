---
name: batch-validacion
description: >-
  REFLEJO del vertical NICHOS (orquestador de micro-flujo): saca candidatos de
  la cola, encadena estudio de demanda, emision de veredicto, decision de camino
  y corte temprano si NO_VIABLE. Sin estado propio. Carga este modulo cuando
  necesites ejecutar un lote de validacion de candidatos a nicho, o cuando
  reacciones a los PULSOs nichos.validacion.lote.iniciado / .completado.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, batch, validacion, orquestador, micro-flujo, pipeline, bus, mqtt]
---

# nichos · batch-validacion

> **Que es.** REFLEJO sin estado del vertical NICHOS que orquesta un lote de
> validacion: saca N candidatos de la cola y por cada uno encadena estudio de
> demanda, veredicto, decision de camino y corte temprano si NO_VIABLE.
>
> Codigo: `modules/nichos/batch-validacion/index.js`. La verdad viva es el
> codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **REFLEJO** sin estado (orquestador de micro-flujo, JS determinista).
- Base: `ModuloHibridoReflejo`.
- Sin store — orquesta via `_rpc` sobre el bus. Cada paso es un RPC a otro modulo.

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.validacion.lote.correr.request` | `onCorrerRequest` | `{status:200, data:{lote_id, procesados, viables?, no_viables?, puentes?}}` |

### Payload de `.lote.correr.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "tamano": 5
}
```

`tamano` es opcional (default: 5 candidatos por lote).

## Micro-flujo por candidato

```
1. nichos.cola.candidatos.sacar.request      → obtener N candidatos
2. Por cada candidato:
   a. nichos.demanda.estudiar.request         → estudio de demanda
   b. nichos.veredicto.emitir.request         → emitir veredicto
   c. nichos.camino.decidir.request           → decidir camino
   d. nichos.cortar.temprano.request          → cortar si NO_VIABLE
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.validacion.lote.iniciado` | al empezar el lote | `{lote_id, candidatos_total, timestamp}` |
| `nichos.validacion.lote.completado` | al terminar el lote | `{lote_id, viables, no_viables, puentes, timestamp}` |

## Invariantes

- **Cola vacia**: si no hay candidatos, devuelve procesados: 0 con razon 'cola_vacia'.
- **Aislamiento de fallos**: si un candidato falla, se registra el error y se continua
  con el siguiente (el lote no se aborta).
- **Serie por candidato**: los micro-flujos se ejecutan en serie para respetar el
  orden de la cola y los limites de las fuentes.

## Integracion (patron RPC del bus)

```javascript
// CORRER un lote de validacion
const resp = await bus.publishAndWait('nichos.validacion.lote.correr.request', {
  project_id,
  tamano: 10
});
// resp.data = { lote_id, procesados, viables, no_viables, puentes }
```

## Donde encaja en el vertical NICHOS

- Lo dispara el **scheduler** o el **Jefe (K)** cuando toca validar candidatos.
- Consume de la **cola de candidatos**, invoca **estudio de demanda**,
  **veredicto**, **decision de camino** y **cortador-temprano**.
- El pulso `.lote.completado` lo escucha **reglas-aprendidas-validacion** para
  destilar patrones.
