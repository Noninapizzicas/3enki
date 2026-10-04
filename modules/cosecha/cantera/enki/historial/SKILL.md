---
name: historial
description: >-
  CUSTODIO del vertical NICHOS: log append-only de eventos por nicho.
  Registra cada evento relevante del ciclo de vida de un nicho y sirve la
  cronologia completa por RPC. Persistencia per-proyecto via PosPersistencia.
  Carga este modulo cuando necesites registrar un evento del ciclo de vida
  de un nicho, consultar su cronologia, o cuando otro modulo quiera
  reaccionar al pulso nichos.historial.registrado.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, historial, append-only, log, pos-persistencia, bus, mqtt]
---

# nichos - historial

> **Que es.** CUSTODIO del vertical NICHOS que mantiene un log append-only
> de eventos por nicho. Cada hito del ciclo de vida (transicion de estado,
> decision, sondeo, etc.) se registra como entrada inmutable.
>
> Codigo: `modules/nichos/historial/index.js`. La verdad viva es el codigo;
> esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **CUSTODIO** (append-only, estado persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/historial.json` dentro del storage del proyecto.
- Invariante: **append-only** — los eventos registrados NUNCA se mutan ni
  se borran. Cada registro lleva timestamp de ingreso (`at`).

## Estructura del store

```json
{
  "version": 0,
  "logs": {
    "<id_nicho>": [
      { "evento": { "tipo": "transicion", "desde": "semilla", "hasta": "normalizada" }, "at": "2026-..." }
    ]
  },
  "total_registros": 0
}
```

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.historial.registrar.request` | `onRegistrarRequest` | `{status:200, data:{registrado:true, total}}` |
| `nichos.historial.cronologia.request` | `onCronologiaRequest` | `{status:200, data:{eventos:[]}}` |

### Payload de `.registrar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "id": "nicho_abc",
  "evento": { "tipo": "transicion", "desde": "semilla", "hasta": "normalizada", "causa": "normalizador" }
}
```

### Payload de `.cronologia.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "id": "nicho_abc"
}
```

## Senales que escucha (fire-and-forget)

- `project.activated` -> `onProjectActivated` — restaura el historial
  persistido del proyecto desde `/prisma/pos/nichos/historial.json`.

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.historial.registrado` | tras registrar un evento | `{project_id, id, evento, at, timestamp}` |
| `nichos.historial.registrado.failed` | registro fallido (input invalido) | `{project_id, code, message, timestamp}` |

## Invariantes

- **Append-only**: los eventos registrados NUNCA se mutan ni se borran.
- **Degradacion honesta**: sin `project_id` el store queda solo en memoria.

## Integracion (patron RPC del bus)

```javascript
// REGISTRAR un evento
await bus.publishAndWait('nichos.historial.registrar.request', {
  project_id,
  id: 'nicho_abc',
  evento: { tipo: 'transicion', desde: 'semilla', hasta: 'normalizada' }
});

// LEER cronologia
const resp = await bus.publishAndWait('nichos.historial.cronologia.request', {
  project_id,
  id: 'nicho_abc'
});
const { eventos } = resp.data;
```

## Donde encaja en el vertical NICHOS

- **Registro central de eventos**: todo modulo que produce un hito del
  ciclo de vida del nicho (pipeline, clasificador, sondeador, jefe) emite
  `nichos.historial.registrar.request` para dejar constancia.
- Los paneles y el jefe consultan la cronologia para tomar decisiones
  informadas y mostrar la historia del nicho al dueno.
- No depende de otro modulo del vertical para arrancar (solo
  `project.activated` del core).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id`, `id` o `evento` |
