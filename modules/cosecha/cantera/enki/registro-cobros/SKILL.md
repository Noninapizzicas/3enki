---
name: registro-cobros
description: >-
  CUSTODIO del vertical NICHOS: registro append-only de cobros por
  proyecto. Registra entradas de cobro (EFECTIVO, COMPROMETIDO, DEVUELTO)
  con referencia unica y sirve consultas filtradas por rango/tipo.
  Persistencia per-proyecto via PosPersistencia.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, registro, cobros, append-only, pos-persistencia, bus, mqtt]
---

# nichos · registro-cobros

> **Qué es.** CUSTODIO del registro append-only de cobros del vertical
> NICHOS. Cada cobro entra con tipo (EFECTIVO, COMPROMETIDO, DEVUELTO),
> importe, moneda, autor y metadatos. Las entradas son inmutables — una
> vez registradas, no se mutan ni se borran.
>
> Código: `modules/nichos/registro-cobros/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **CUSTODIO** (append-only, estado persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/registro-cobros.json` dentro del storage del proyecto.
- Esqueleto por defecto: array vacío de entradas, version 0.

## Campos del store

| Campo | Tipo | Semántica |
|---|---|---|
| `version` | `Int` | contador monotónico de mutaciones |
| `entradas` | `Array<Entrada>` | registro append-only de cobros |
| `total_entradas` | `Int` | total histórico de entradas registradas |

### Entrada de cobro

| Campo | Tipo | Semántica |
|---|---|---|
| `ref` | `String` | referencia única generada (`cobro_<ts>_<n>`) |
| `tipo` | `'EFECTIVO' \| 'COMPROMETIDO' \| 'DEVUELTO'` | naturaleza del cobro |
| `importe` | `Number` | cantidad (>= 0) |
| `moneda` | `String` | código ISO de moneda (default `EUR`) |
| `timestamp` | `ISO8601` | momento del registro |
| `por_autor` | `String` | quién registró la entrada |
| `meta` | `Object` | metadatos libres |

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.registro.cobros.registrar.request` | `onRegistrarRequest` | `{status:200, data:{ref_cobro}}` |
| `nichos.registro.cobros.consultar.request` | `onConsultarRequest` | `{status:200, data:{entradas[]}}` |

### Payload de `.registrar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "por_autor": "sistema",
  "entrada_cobro": {
    "tipo": "EFECTIVO",
    "importe": 150.00,
    "moneda": "EUR",
    "meta": { "origen": "stripe", "ref_externa": "ch_xxx" }
  }
}
```

### Payload de `.consultar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "filtro": {
    "tipo": "EFECTIVO",
    "desde": "2026-01-01T00:00:00Z",
    "hasta": "2026-12-31T23:59:59Z"
  }
}
```

## Señales que escucha (fire-and-forget)

- `project.activated` → `onProjectActivated` — restaura el registro
  persistido del proyecto desde `/prisma/pos/nichos/registro-cobros.json`.

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.cobro.registrado` | tras registrar una entrada válida | `{id_proyecto, tipo, importe, cobro_ref, timestamp}` |
| `nichos.cobro.registrado.failed` | registro fallido (input inválido) | `{project_id, code, message, timestamp}` |

## Invariantes

- **Append-only**: las entradas registradas NUNCA se mutan ni se borran.
  Cada registro lleva timestamp de ingreso y referencia única.
- **Tipos cerrados**: solo se aceptan `EFECTIVO`, `COMPROMETIDO` y
  `DEVUELTO`. Otro tipo devuelve 400 `INVALID_INPUT`.
- **Importe positivo**: el importe es >= 0. Negativo devuelve 400.
- **Degradación honesta**: sin `project_id` el store queda sólo en memoria.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id`, `entrada_cobro`, `por_autor`; tipo inválido; importe negativo |

## Integración (patrón RPC del bus)

```javascript
// REGISTRAR
const resp = await bus.publishAndWait('nichos.registro.cobros.registrar.request', {
  project_id,
  por_autor: 'sistema',
  entrada_cobro: { tipo: 'EFECTIVO', importe: 200, moneda: 'EUR' }
});
// resp.data.ref_cobro → 'cobro_1719..._0'

// CONSULTAR (por tipo y rango)
const resp2 = await bus.publishAndWait('nichos.registro.cobros.consultar.request', {
  project_id,
  filtro: { tipo: 'COMPROMETIDO', desde: '2026-06-01T00:00:00Z' }
});
// resp2.data.entradas → [ { ref, tipo, importe, ... }, ... ]
```

## Dónde encaja en el vertical NICHOS

- **Registro financiero**: almacena todos los movimientos de cobro del
  vertical. El `cuadro-salud` consume este registro para calcular flujo
  e ingresos del proyecto.
- Emite `nichos.cobro.registrado` que el `cuadro-salud` escucha para
  recalcular automáticamente la vista del proyecto.
- No depende de otro módulo del vertical para arrancar (sólo
  `project.activated` del core). Es raíz del grafo de construcción.
