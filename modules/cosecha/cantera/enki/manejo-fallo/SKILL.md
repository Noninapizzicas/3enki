---
name: manejo-fallo
description: >-
  REFLEJO del vertical NICHOS (bloque K): clasifica fallos
  (transitorio→reintentar, grave→escalar, fatal→cortar) y decide la acción
  de recuperación. Registra en historial y escala via puente humano si
  procede. Sin estado. Carga este módulo cuando el vertical NICHOS necesite
  gestionar un fallo de operación con clasificación y acción automática.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, fallo, gestion, reintentar, escalar, cortar, bloque-k, bus, mqtt]
---

# nichos · manejo-fallo

> **Qué es.** REFLEJO (bloque K, #51) del vertical NICHOS. Clasificador
> determinista de fallos que decide la acción de recuperación:
> REINTENTAR (transitorio), ESCALAR (grave) o CORTAR (fatal).
>
> Código: `modules/nichos/manejo-fallo/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **REFLEJO** puro (JS determinista, sin LLM).
- Base: `ModuloHibridoReflejo`.
- Sin estado. La clasificación es determinista por patrones en el
  código/mensaje del error.

## Clasificación de fallos

| Categoría | Acción | Patrones detectados |
|---|---|---|
| `transitorio` | `REINTENTAR` | timeout, econnreset, rate_limit, service_unavailable, network... |
| `grave` | `ESCALAR` | todo lo que no es transitorio ni fatal (default) |
| `fatal` | `CORTAR` | not_found, resource_deleted, constraint_violated, irrecoverable... |

## Eventos

### Atiende (request -> response)

| Evento | Handler | Qué hace |
|---|---|---|
| `nichos.fallo.gestionar.request` | `onGestionarRequest` | Clasifica fallo y decide acción. Payload: `{id_nicho, origen, error, contexto?}` |

### Payload de `.gestionar.request`

```json
{
  "request_id": "uuid",
  "id_nicho": "nicho_xxx",
  "origen": "sondeo-fuente",
  "error": { "code": "ECONNRESET", "message": "connection reset by peer" },
  "contexto": { "intento": 2, "fuente": "crawl4rs" }
}
```

### Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.fallo.gestionado` | tras clasificar y actuar | `{id_nicho, origen, accion_tomada: REINTENTAR\|ESCALAR\|CORTAR}` |

### Publica al bus

| Evento | Destino | Descripción |
|---|---|---|
| `nichos.pipeline.transitar.request` | pipeline | Solicita reintento o corte |
| `nichos.historial.registrar.request` | historial | Registra fallo y acción tomada |
| `nichos.puente.humano.alzar.request` | puente-humano | Escala fallo grave al dueño |

## Cuándo se usa

- Cualquier módulo del vertical que atrape un error y necesite decidir
  cómo recuperarse.
- El pipeline invoca `nichos.fallo.gestionar.request` en su catch genérico.

## Integración (patrón RPC del bus)

```javascript
// GESTIONAR FALLO
const resp = await bus.publishAndWait('nichos.fallo.gestionar.request', {
  id_nicho: 'nicho_xxx',
  origen: 'sondeo-fuente',
  error: { code: 'ECONNRESET', message: 'connection reset' }
});
const { accion_tomada } = resp.data; // 'REINTENTAR'
```

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `id_nicho`, `origen` o `error` |
