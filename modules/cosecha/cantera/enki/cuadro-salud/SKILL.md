---
name: cuadro-salud
description: >-
  CUSTODIO del vertical NICHOS: cuadro de salud financiera por proyecto.
  Compone vista con ingresos, costes, flujo y estado (GENERA, SANGRA,
  NEUTRO). Recalcula automaticamente al registrar cobro. Persistencia
  per-proyecto via PosPersistencia.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, cuadro, salud, financiera, pos-persistencia, bus, mqtt]
---

# nichos · cuadro-salud

> **Qué es.** CUSTODIO del cuadro de salud financiera del vertical
> NICHOS. Compone una vista por proyecto con ingresos (del registro de
> cobros), costes (del módulo de imputación) y el flujo neto resultante.
> Clasifica el estado como GENERA (flujo > 0), SANGRA (flujo < 0) o
> NEUTRO (flujo = 0). Recalcula automáticamente al escuchar
> `nichos.cobro.registrado`.
>
> Código: `modules/nichos/cuadro-salud/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **CUSTODIO** (snapshot de salud persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/cuadro-salud.json` dentro del storage del proyecto.
- Esqueleto por defecto: ingresos 0, costes 0, flujo 0, estado NEUTRO.

## Campos del store

| Campo | Tipo | Semántica |
|---|---|---|
| `version` | `Int` | contador monotónico de mutaciones |
| `ingresos` | `Number` | suma de cobros EFECTIVO + COMPROMETIDO - DEVUELTO |
| `costes` | `Number` | suma de costes imputados |
| `flujo` | `Number` | ingresos - costes |
| `estado` | `'GENERA' \| 'SANGRA' \| 'NEUTRO'` | clasificación del flujo |
| `recalculado_at` | `ISO8601 \| null` | timestamp del último recálculo |

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.cuadro.salud.estado.request` | `onEstadoRequest` | `{status:200, data:{vista_proyecto:{ingresos, costes, flujo, estado, recalculado_at}}}` |
| `nichos.cuadro.salud.recalcular.request` | `onRecalcularRequest` | `{status:200, data:{vista_proyecto:{ingresos, costes, flujo, estado, recalculado_at}}}` |

### Payload de `.estado.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx"
}
```

### Payload de `.recalcular.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "hasta": "2026-12-31T23:59:59Z"
}
```

## Señales que escucha (fire-and-forget)

- `nichos.cobro.registrado` → `onCobroRegistrado` — recalcula la salud
  automáticamente al registrar un cobro (F7b). Usa `id_proyecto` del
  payload del pulso.
- `project.activated` → `onProjectActivated` — restaura el store
  persistido del proyecto desde `/prisma/pos/nichos/cuadro-salud.json`.

## RPCs salientes

| Evento emitido | Destino | Para qué |
|---|---|---|
| `nichos.registro.cobros.consultar.request` | registro-cobros | obtener entradas de cobro para sumar ingresos |
| `nichos.costes.imputar.request` | imputacion-coste-fuente | obtener costes imputados al proyecto |

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.salud.recalculada` | tras recalcular la vista del proyecto | `{id_proyecto, estado, flujo, timestamp}` |
| `nichos.salud.recalculada.failed` | recálculo fallido | `{project_id, code, message, timestamp}` |

## Lógica de clasificación

```
flujo = ingresos - costes
estado = flujo > 0 ? 'GENERA' : flujo < 0 ? 'SANGRA' : 'NEUTRO'
```

Los ingresos se componen de las entradas del registro-cobros:
- `EFECTIVO` y `COMPROMETIDO` suman al ingreso.
- `DEVUELTO` resta del ingreso.

## Invariantes

- **Vista coherente**: el estado siempre refleja el signo del flujo.
- **Recálculo reactivo**: cada `nichos.cobro.registrado` dispara
  recálculo automático (el cuadro se mantiene fresco).
- **Degradación honesta**: sin `project_id` el store queda sólo en memoria.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id` |

## Integración (patrón RPC del bus)

```javascript
// LEER ESTADO
const resp = await bus.publishAndWait('nichos.cuadro.salud.estado.request', {
  project_id
});
const { ingresos, costes, flujo, estado } = resp.data.vista_proyecto;

// FORZAR RECALCULO
const resp2 = await bus.publishAndWait('nichos.cuadro.salud.recalcular.request', {
  project_id,
  hasta: '2026-06-30T23:59:59Z'
});
// resp2.data.vista_proyecto → { ingresos, costes, flujo, estado, recalculado_at }
```

## Dónde encaja en el vertical NICHOS

- **Panel de salud**: ofrece la vista consolidada de la salud financiera
  del proyecto. Lo consume el panel del vertical y cualquier módulo que
  necesite decidir en función de si el proyecto genera o sangra.
- **Dependencias**: consume `registro-cobros` (ingresos) e
  `imputacion-coste-fuente` (costes). Escucha `nichos.cobro.registrado`
  para mantenerse actualizado.
- No requiere otro módulo para arrancar (sólo `project.activated` del
  core), pero su vista estará vacía hasta que haya datos en los módulos
  que consume.
