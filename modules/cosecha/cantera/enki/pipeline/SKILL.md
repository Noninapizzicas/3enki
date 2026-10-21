---
name: pipeline
description: >-
  CUSTODIO del vertical NICHOS: state machine del ciclo de vida del nicho
  (19 estados, transiciones legales). Guarda el estado actual de cada nicho,
  valida la legalidad de las transiciones y emite pulsos de transicion.
  Registra cada transicion en el historial. Carga este modulo cuando
  necesites transitar el estado de un nicho, consultar su estado actual, o
  cuando otro modulo quiera reaccionar a los pulsos
  nichos.pipeline.transicion.aplicada o nichos.pipeline.transicion.ilegal.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, pipeline, state-machine, transiciones, pos-persistencia, bus, mqtt]
---

# nichos - pipeline

> **Que es.** CUSTODIO del vertical NICHOS que implementa la state machine
> del ciclo de vida de un nicho: 19 estados con transiciones legales
> explicitas. Solo las transiciones declaradas en el mapa son validas;
> cualquier otra se rechaza con TRANSICION_ILEGAL.
>
> Codigo: `modules/nichos/pipeline/index.js`. La verdad viva es el codigo;
> esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **CUSTODIO** (state machine, estado persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/pipeline.json` dentro del storage del proyecto.
- Invariante: **solo transiciones legales** — el mapa TRANSICIONES_LEGALES
  es la fuente de verdad de que movimientos son validos.

## 19 estados del ciclo de vida

```
semilla → normalizada → sondeada → encolada → validando →
viabilidad_emitida → camino_decidido → construyendo →
gate_operacion → operando → distribuyendo → activo →
sangria_alertada → cortado_pre_construccion → fallido →
pausado → archivado → caja
```

## Mapa de transiciones legales

| Estado origen | Destinos legales |
|---|---|
| `semilla` | normalizada, fallido, archivado |
| `normalizada` | sondeada, fallido, archivado |
| `sondeada` | encolada, fallido, archivado |
| `encolada` | validando, fallido, archivado |
| `validando` | viabilidad_emitida, fallido, archivado |
| `viabilidad_emitida` | camino_decidido, fallido, archivado |
| `camino_decidido` | construyendo, cortado_pre_construccion, fallido, archivado |
| `construyendo` | gate_operacion, cortado_pre_construccion, fallido, pausado |
| `gate_operacion` | operando, fallido, pausado, archivado |
| `operando` | distribuyendo, fallido, pausado, archivado |
| `distribuyendo` | activo, fallido, pausado, archivado |
| `activo` | sangria_alertada, pausado, archivado, caja |
| `sangria_alertada` | activo, pausado, archivado, caja |
| `cortado_pre_construccion` | archivado |
| `fallido` | semilla, archivado |
| `pausado` | operando, distribuyendo, activo, archivado |
| `archivado` | semilla |
| `caja` | (terminal, sin destinos) |

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.pipeline.transitar.request` | `onTransitarRequest` | `{status:200, data:{estado_nuevo:{id, estado, desde, causa, autor, at}}}` o `{status:409, error:{code:'TRANSICION_ILEGAL',...}}` |
| `nichos.pipeline.estado.request` | `onEstadoRequest` | `{status:200, data:{estado_actual:{id, estado, desde, causa, autor, at}}}` |

### Payload de `.transitar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "id": "nicho_abc",
  "transicion": "normalizada",
  "causa": "normalizador",
  "autor": "normalizador-semilla"
}
```

### Payload de `.estado.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "id": "nicho_abc"
}
```

## Senales que escucha (fire-and-forget)

- `project.activated` -> `onProjectActivated` — restaura el pipeline
  persistido del proyecto desde `/prisma/pos/nichos/pipeline.json`.

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.pipeline.transicion.aplicada` | tras aplicar una transicion legal | `{project_id, id, desde, hasta, causa, autor, timestamp}` |
| `nichos.pipeline.transicion.ilegal` | transicion rechazada | `{project_id, id, desde, hasta, razon_codigo:'TRANSICION_ILEGAL', timestamp}` |

## Integracion con historial

Cada transicion aplicada emite `nichos.historial.registrar.request` con el
evento `{tipo:'transicion', desde, hasta, causa, autor}` para que el
historial append-only registre el hito.

## Integracion (patron RPC del bus)

```javascript
// TRANSITAR estado
const resp = await bus.publishAndWait('nichos.pipeline.transitar.request', {
  project_id,
  id: 'nicho_abc',
  transicion: 'normalizada',
  causa: 'normalizador',
  autor: 'normalizador-semilla'
});
const { estado_nuevo } = resp.data;

// CONSULTAR estado
const resp2 = await bus.publishAndWait('nichos.pipeline.estado.request', {
  project_id,
  id: 'nicho_abc'
});
const { estado_actual } = resp2.data;
```

## Donde encaja en el vertical NICHOS

- **Columna vertebral del ciclo de vida**: todo modulo que mueve un nicho
  de fase (normalizador, sondeador, validador, constructor, jefe) llama a
  `nichos.pipeline.transitar.request`. El pipeline es el unico custodio
  del estado.
- Los consumidores (jefe, paneles, historial) reaccionan a los pulsos
  `nichos.pipeline.transicion.aplicada` para orquestar los siguientes
  pasos.
- Un nicho no registrado en el pipeline nace en estado `semilla`.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id`, `id` o `transicion` |
| 400 | `ESTADO_DESCONOCIDO` | el estado destino no existe en el pipeline |
| 409 | `TRANSICION_ILEGAL` | la transicion desde el estado actual no esta permitida |
