---
name: gate-decision-operar
description: >-
  PUENTE del vertical NICHOS: gate de arranque del vertical. Controla si el
  vertical opera o está en pausa. Si se solicita ABRIR sin confirmación del
  dueño, emite solicitud de decisión. Carga este módulo cuando necesites
  arrancar o pausar el vertical NICHOS para un proyecto, cuando el jefe (K)
  decida activar operaciones, o cuando otro módulo consulte el estado del gate.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: puente
tags: [nichos, puente, gate, arranque, operar, decision, bus, mqtt]
---

# nichos · gate-decision-operar

> **Qué es.** PUENTE (gate de arranque) del vertical NICHOS. Controla si el
> vertical opera o está en pausa. Si se solicita ABRIR, emite solicitud de
> decisión al dueño. Cuando el dueño responde, completa la transición.
> CERRAR es inmediato.
>
> Código: `modules/nichos/gate-decision-operar/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **PUENTE** (gate de arranque del vertical).
- Base: `ModuloHibridoReflejo`.
- Estado en memoria por `project_id`: `{ estado, solicitud_pendiente }`.
- Estados: `ABIERTO` | `CERRADO` | `PENDIENTE`.

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.gate.operar.request` | `onOperarRequest` | `{status:200, data:{estado}}` o `{status:200, data:{estado:'PENDIENTE', solicitud_id}}` |

### Payload de `.operar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "accion": "ABRIR"
}
```

`accion` acepta `ABRIR` o `CERRAR` (case-insensitive).

## Señales que escucha (fire-and-forget)

- `nichos.decision.solicitud.respondida` → `onSolicitudRespondida` — si la
  respuesta corresponde a un gate pendiente y el dueño acepta (`SI` o `ABRIR`),
  transita a `ABIERTO` y pulsa `.abierto`. Si rechaza, vuelve a `CERRADO`.

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.gate.operacion.abierto` | tras confirmar apertura (directa o por respuesta del dueño) | `{project_id, timestamp}` |
| `nichos.gate.operacion.cerrado` | tras cerrar el vertical | `{project_id, timestamp}` |
| `nichos.decision.solicitud.abierta` | al solicitar confirmación de apertura al dueño | `{solicitud_id, tipo, contexto, opciones, timestamp}` |

## Proyección

- `_operar(input)` — valida acción, transita estado. CERRAR es inmediato.
  ABRIR genera solicitud de decisión y queda en PENDIENTE hasta respuesta.

## Invariantes

- **ABRIR requiere decisión**: toda apertura pasa por solicitud de decisión
  al dueño. El gate queda en PENDIENTE hasta la respuesta.
- **CERRAR es inmediato**: no requiere confirmación, limpia la solicitud
  pendiente si la hay.
- **Estado por proyecto**: cada `project_id` tiene su gate independiente.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id` o `accion` |
| 400 | `ACCION_INVALIDA` | `accion` no es `ABRIR` ni `CERRAR` |

## Integración (patrón RPC del bus)

```javascript
// ABRIR el vertical (queda pendiente hasta respuesta del dueño)
const resp = await bus.publishAndWait('nichos.gate.operar.request', {
  project_id: 'prj_xxx',
  accion: 'ABRIR'
});
// resp.data → { estado: 'PENDIENTE', solicitud_id: 'uuid' }

// CERRAR el vertical (inmediato)
const resp2 = await bus.publishAndWait('nichos.gate.operar.request', {
  project_id: 'prj_xxx',
  accion: 'CERRAR'
});
// resp2.data → { estado: 'CERRADO' }
```

## Dónde encaja en el vertical NICHOS

- **Gate de arranque**: es la puerta que habilita o pausa todas las operaciones
  del vertical para un proyecto dado. Lo invoca el jefe (K) al activar el
  vertical o al pausar por mantenimiento.
- Depende de `cola-decisiones` (F7a) que encola la solicitud de apertura.
